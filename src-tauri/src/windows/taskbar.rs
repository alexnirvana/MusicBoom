//! Windows 任务栏缩略图与缩略工具栏的支持，实现封面预览与上一首/播放/下一首按钮。
//!
//! 仅在 Windows 上编译；其他平台不启用。

#![cfg(windows)]
#![allow(dead_code)]

use std::{
    collections::HashMap,
    ffi::c_void,
    mem::size_of,
    ptr::null_mut,
    sync::{Mutex, OnceLock},
};

use image::{imageops::FilterType, DynamicImage, GenericImageView, Rgba, RgbaImage};
use tauri::{AppHandle, Emitter, Manager, Window};
use windows::{
    core::{GUID, HRESULT},
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        Graphics::{
            Dwm::{
                DwmSetIconicThumbnail, DwmSetWindowAttribute, DWMWA_FORCE_ICONIC_REPRESENTATION,
                DWMWA_HAS_ICONIC_BITMAP,
            },
            Gdi::{
                CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
                DIB_RGB_COLORS, HBITMAP, HGDIOBJ, RGBQUAD,
            },
        },
        System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
        UI::{
            Shell::{
                DefSubclassProc, ITaskbarList3, SetWindowSubclass, THBF_ENABLED, THB_FLAGS,
                THB_ICON, THB_TOOLTIP, THUMBBUTTON,
            },
            WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, ICONINFO, WM_COMMAND},
        },
    },
};

const BUTTON_PREV: u32 = 1;
const BUTTON_PLAY_OR_PAUSE: u32 = 2;
const BUTTON_NEXT: u32 = 3;
const TASKBAR_LIST_CLSID: GUID = GUID::from_u128(0x56fdf344_fd6d_11d0_958a_006097c9a090);

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static BUTTONS_READY: OnceLock<()> = OnceLock::new();
static WINDOW_LABELS: OnceLock<Mutex<HashMap<isize, String>>> = OnceLock::new();

fn window_labels() -> &'static Mutex<HashMap<isize, String>> {
    WINDOW_LABELS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 为指定窗口注册子类回调，用于响应缩略工具栏按钮点击。
pub fn register_window(window: &Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(anyhow_to_string)?;

    // 记录应用句柄，后续转发事件需要。
    APP_HANDLE.set(window.app_handle()).ok();

    // 避免重复注册同一个窗口。
    let labels = window_labels();
    {
        let mut map = labels.lock().map_err(|_| "窗口标签锁定失败".to_string())?;
        if map.contains_key(&hwnd.0) {
            return Ok(());
        }
        map.insert(hwnd.0, window.label().to_string());
    }

    unsafe {
        let _ = SetWindowSubclass(HWND(hwnd.0 as *mut c_void), Some(subclass_proc), 1, 0);
    }

    Ok(())
}

/// 更新任务栏缩略图（封面图）与缩略工具栏按钮状态。
pub fn update_thumbnail_and_buttons(
    window: &Window,
    cover_data: Option<Vec<u8>>,
    is_playing: bool,
    title: Option<String>,
) -> Result<(), String> {
    // 确保当前窗口已注册，以便任务栏按钮事件能够回传到前端。
    register_window(window)?;

    println!("开始更新任务栏缩略图...");
    println!("窗口标签: {}", window.label());

    let hwnd = window.hwnd().map_err(anyhow_to_string)?;
    println!("窗口句柄获取成功: {:?}", hwnd);

    // 先尝试应用任务栏按钮（这个应该总是能工作的）
    if let Err(e) = apply_buttons(hwnd, is_playing, &title) {
        println!("应用按钮失败: {:?}", e);
        return Err(format!("应用按钮失败: {:?}", e));
    }
    println!("应用按钮成功，播放状态: {}, 标题: {:?}", is_playing, title);

    // 尝试启用图标化属性
    if let Err(e) = enable_iconic_attributes(hwnd) {
        println!("启用图标化属性失败: {:?}，跳过缩略图", e);
        // 不返回错误，继续运行，只是没有缩略图功能
        return Ok(());
    }
    println!("启用图标化属性成功");

    // 尝试应用缩略图
    if let Err(e) = apply_thumbnail(hwnd, cover_data) {
        println!("应用缩略图失败: {:?}，但任务栏按钮应该工作正常", e);
        // 不返回错误，继续运行，只是没有缩略图功能
        return Ok(());
    }
    println!("应用缩略图成功");

    Ok(())
}

fn apply_thumbnail(hwnd: HWND, cover_data: Option<Vec<u8>>) -> Result<(), HRESULT> {
    let image = match cover_data {
        Some(d) if !d.is_empty() => {
            println!("封面数据大小: {} bytes", d.len());
            match image::load_from_memory(&d) {
                Ok(img) => img,
                Err(err) => {
                    println!("封面解码失败，将使用占位缩略图: {:?}", err);
                    build_placeholder_thumbnail()
                }
            }
        }
        _ => {
            println!("无封面数据，将使用占位缩略图");
            build_placeholder_thumbnail()
        }
    };

    apply_thumbnail_image(hwnd, image)
}

fn apply_thumbnail_image(hwnd: HWND, img: DynamicImage) -> Result<(), HRESULT> {
    let thumb = create_thumbnail_bitmap(img)?;

    println!("尝试设置 DWM 缩略图...");
    // 首先尝试标准方法
    match unsafe { DwmSetIconicThumbnail(hwnd, thumb, 0) } {
        Ok(_) => {
            println!("DWM 缩略图设置成功");
            let _ = unsafe { DeleteObject(HGDIOBJ(thumb.0)) };
            println!("缩略图设置完成");
            return Ok(());
        }
        Err(e) => {
            println!("DWM 缩略图设置失败: {:?}", e);

            // 尝试替代方法：使用 DWMWA_FORCE_ICONIC_REPRESENTATION（这个已经设置了）
            println!("替代方法不可用，保持任务栏按钮功能正常");
            let _ = unsafe { DeleteObject(HGDIOBJ(thumb.0)) };
            return Err(e.into()); // 返回原始错误
        }
    }
}

fn apply_buttons(hwnd: HWND, is_playing: bool, title: &Option<String>) -> Result<(), HRESULT> {
    println!("开始应用任务栏按钮...");
    let taskbar: ITaskbarList3 =
        unsafe { CoCreateInstance(&TASKBAR_LIST_CLSID, None, CLSCTX_INPROC_SERVER) }?;
    unsafe { taskbar.HrInit()? };
    println!("任务栏列表初始化成功");

    let prev_icon = build_icon(Glyph::Prev)?;
    let play_icon = build_icon(if is_playing {
        Glyph::Pause
    } else {
        Glyph::Play
    })?;
    let next_icon = build_icon(Glyph::Next)?;

    let mut buttons: [THUMBBUTTON; 3] = [
        THUMBBUTTON::default(),
        THUMBBUTTON::default(),
        THUMBBUTTON::default(),
    ];

    buttons[0].iId = BUTTON_PREV as _;
    buttons[0].dwMask = THB_ICON | THB_FLAGS | THB_TOOLTIP;
    buttons[0].dwFlags = THBF_ENABLED;
    set_tip(&mut buttons[0].szTip, "上一首");
    buttons[0].hIcon = prev_icon;

    buttons[1].iId = BUTTON_PLAY_OR_PAUSE as _;
    buttons[1].dwMask = THB_ICON | THB_FLAGS | THB_TOOLTIP;
    buttons[1].dwFlags = THBF_ENABLED;
    set_tip(
        &mut buttons[1].szTip,
        if is_playing { "暂停" } else { "播放" },
    );
    buttons[1].hIcon = play_icon;

    buttons[2].iId = BUTTON_NEXT as _;
    buttons[2].dwMask = THB_ICON | THB_FLAGS | THB_TOOLTIP;
    buttons[2].dwFlags = THBF_ENABLED;
    set_tip(&mut buttons[2].szTip, "下一首");
    buttons[2].hIcon = next_icon;

    if BUTTONS_READY.get().is_some() {
        unsafe { taskbar.ThumbBarUpdateButtons(hwnd, &buttons)? };
        println!("更新任务栏按钮成功");
    } else {
        unsafe { taskbar.ThumbBarAddButtons(hwnd, &buttons)? };
        let _ = BUTTONS_READY.set(());
        println!("添加任务栏按钮成功");
    }

    if let Some(text) = title {
        let mut button = THUMBBUTTON::default();
        button.iId = BUTTON_PLAY_OR_PAUSE as _;
        button.dwMask = THB_TOOLTIP | THB_FLAGS;
        button.dwFlags = THBF_ENABLED;
        set_tip(&mut button.szTip, &text);
        unsafe { taskbar.ThumbBarUpdateButtons(hwnd, &[button])? };
        println!("更新按钮提示为: {}", text);
    }

    let _ = unsafe { DestroyIcon(prev_icon) };
    let _ = unsafe { DestroyIcon(play_icon) };
    let _ = unsafe { DestroyIcon(next_icon) };

    Ok(())
}

fn set_tip(buf: &mut [u16; 260], text: &str) {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    for (i, ch) in wide.iter().enumerate().take(buf.len()) {
        buf[i] = *ch;
    }
}

fn enable_iconic_attributes(hwnd: HWND) -> Result<(), HRESULT> {
    println!("启用图标化属性...");
    let has_iconic = 1i32;
    unsafe {
        let result1 = DwmSetWindowAttribute(
            hwnd,
            DWMWA_HAS_ICONIC_BITMAP,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        );
        let result2 = DwmSetWindowAttribute(
            hwnd,
            DWMWA_FORCE_ICONIC_REPRESENTATION,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        );
        println!("DWM 属性设置结果: {:?}, {:?}", result1, result2);
        result1?;
        result2?;
    }
    Ok(())
}

fn create_thumbnail_bitmap(img: DynamicImage) -> Result<HBITMAP, HRESULT> {
    let (w, h) = img.dimensions();
    println!("原始图片尺寸: {}x{}", w, h);
    let max = 200u32;
    let mut working_img = img;
    if w > max || h > max {
        working_img = working_img.resize(max, max, FilterType::CatmullRom);
    }

    let (target_w, target_h) = working_img.dimensions();
    println!("目标缩略图尺寸: {}x{}", target_w, target_h);

    println!("开始转换为 RGBA8...");
    let rgba = working_img.to_rgba8();
    println!("RGBA8 转换完成，开始转换为 BGRA 预乘...");
    let bgra = to_premultiplied_bgra(&rgba);
    println!("BGRA 转换完成，数据大小: {} bytes", bgra.len());

    println!("开始创建 HBITMAP...");
    create_hbitmap_from_bgra(&bgra, target_w as i32, target_h as i32)
}

fn build_placeholder_thumbnail() -> DynamicImage {
    let size = 120u32;
    let placeholder = RgbaImage::from_pixel(size, size, Rgba([30, 30, 30, 255]));
    DynamicImage::ImageRgba8(placeholder)
}

fn create_hbitmap_from_bgra(pixels: &[u8], width: i32, height: i32) -> Result<HBITMAP, HRESULT> {
    println!("创建 BITMAPINFOHEADER 结构...");

    if width <= 0 || height <= 0 {
        println!("位图尺寸非法: {}x{}", width, height);
        return Err(HRESULT(0x80070057u32 as i32));
    }

    let height_abs = height.unsigned_abs();
    let row_bytes = width as usize * 4;
    let expected_size = row_bytes * height_abs as usize;

    if pixels.len() != expected_size {
        println!(
            "像素数据大小不匹配，期望: {} bytes，实际: {} bytes",
            expected_size,
            pixels.len()
        );
        return Err(HRESULT(0x80070057u32 as i32));
    }

    let mut header = BITMAPINFOHEADER::default();
    header.biSize = size_of::<BITMAPINFOHEADER>() as u32;
    header.biWidth = width;
    header.biHeight = -(height_abs as i32);
    header.biPlanes = 1;
    header.biBitCount = 32;
    header.biCompression = BI_RGB.0;
    header.biSizeImage = expected_size as u32;

    println!(
        "创建 DIB Section，尺寸: {}x{}，数据大小: {} bytes",
        width,
        height,
        pixels.len()
    );
    let mut bits: *mut c_void = null_mut();
    let info = BITMAPINFO {
        bmiHeader: header,
        bmiColors: [RGBQUAD::default(); 1],
    };
    let hbitmap = unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0) };

    match hbitmap {
        Ok(bitmap) => {
            if bitmap.is_invalid() {
                println!("HBITMAP 无效");
                return Err(HRESULT(0x80070057u32 as i32));
            }
            if bits.is_null() {
                println!("位图数据指针为空");
                return Err(HRESULT(0x80070057u32 as i32));
            }
            println!("DIB Section 创建成功，开始复制像素数据...");

            unsafe {
                std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u8, expected_size);
            }
            println!("像素数据复制完成");
            Ok(bitmap)
        }
        Err(e) => {
            println!("创建 DIB Section 失败: {:?}", e);
            Err(e.code())
        }
    }
}

fn build_icon(glyph: Glyph) -> Result<windows::Win32::UI::WindowsAndMessaging::HICON, HRESULT> {
    let size = 48;
    let mut canvas = image::RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
    let fg = Rgba([255, 255, 255, 255]);

    match glyph {
        Glyph::Prev => {
            draw_triangle(&mut canvas, (10, 24), (30, 10), (30, 38), fg);
            draw_rect(&mut canvas, 32, 12, 36, 36, fg);
        }
        Glyph::Play => {
            draw_triangle(&mut canvas, (12, 10), (12, 38), (36, 24), fg);
        }
        Glyph::Pause => {
            draw_rect(&mut canvas, 12, 10, 20, 38, fg);
            draw_rect(&mut canvas, 28, 10, 36, 38, fg);
        }
        Glyph::Next => {
            draw_triangle(&mut canvas, (36, 24), (16, 10), (16, 38), fg);
            draw_rect(&mut canvas, 12, 12, 16, 36, fg);
        }
    }

    let mut bgra = Vec::with_capacity((size * size * 4) as usize);
    for chunk in canvas.chunks(4) {
        let rgba = Rgba([chunk[0], chunk[1], chunk[2], chunk[3]]);
        bgra.extend_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
    }

    let color = create_hbitmap_from_bgra(&bgra, size as i32, size as i32)?;
    let size_i32: i32 = size as i32;
    let mask = unsafe { CreateBitmap(size_i32, size_i32, 1, 1, None) };
    if mask.is_invalid() {
        return Err(HRESULT(0x80070057u32 as i32));
    }

    let info = ICONINFO {
        fIcon: true.into(),
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: mask,
        hbmColor: color,
    };

    let hicon = unsafe { CreateIconIndirect(&info) }.map_err(|e| e.code())?;
    let _ = unsafe { DeleteObject(HGDIOBJ(mask.0)) };
    let _ = unsafe { DeleteObject(HGDIOBJ(color.0)) };

    Ok(hicon)
}

/// 将 RGBA 数据转换为 BGRA 且带预乘透明度，确保 DWM 接口接受的格式正确。
fn to_premultiplied_bgra(img: &RgbaImage) -> Vec<u8> {
    let mut bgra = Vec::with_capacity((img.width() * img.height() * 4) as usize);
    for chunk in img.chunks(4) {
        let alpha = chunk[3] as u16;
        let premultiply = |channel: u8| -> u8 { ((channel as u16 * alpha + 127) / 255) as u8 };
        let r = premultiply(chunk[0]);
        let g = premultiply(chunk[1]);
        let b = premultiply(chunk[2]);
        bgra.extend_from_slice(&[b, g, r, chunk[3]]);
    }
    bgra
}

fn draw_rect(canvas: &mut image::RgbaImage, x0: u32, y0: u32, x1: u32, y1: u32, color: Rgba<u8>) {
    for y in y0..=y1 {
        for x in x0..=x1 {
            if let Some(pixel) = canvas.get_pixel_mut_checked(x, y) {
                *pixel = color;
            }
        }
    }
}

fn draw_triangle(
    canvas: &mut image::RgbaImage,
    p1: (u32, u32),
    p2: (u32, u32),
    p3: (u32, u32),
    color: Rgba<u8>,
) {
    let points = [p1, p2, p3];
    let min_x = points.iter().map(|p| p.0).min().unwrap_or(0);
    let max_x = points.iter().map(|p| p.0).max().unwrap_or(0);
    let min_y = points.iter().map(|p| p.1).min().unwrap_or(0);
    let max_y = points.iter().map(|p| p.1).max().unwrap_or(0);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if point_in_triangle((x as f32, y as f32), p1, p2, p3) {
                if let Some(pixel) = canvas.get_pixel_mut_checked(x, y) {
                    *pixel = color;
                }
            }
        }
    }
}

fn point_in_triangle(p: (f32, f32), p1: (u32, u32), p2: (u32, u32), p3: (u32, u32)) -> bool {
    let (px, py) = p;
    let (x1, y1) = (p1.0 as f32, p1.1 as f32);
    let (x2, y2) = (p2.0 as f32, p2.1 as f32);
    let (x3, y3) = (p3.0 as f32, p3.1 as f32);

    let area = (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)).abs();
    let area1 = (px * (y2 - y3) + x2 * (y3 - py) + x3 * (py - y2)).abs();
    let area2 = (x1 * (py - y3) + px * (y3 - y1) + x3 * (y1 - py)).abs();
    let area3 = (x1 * (y2 - py) + x2 * (py - y1) + px * (y1 - y2)).abs();

    (area - (area1 + area2 + area3)).abs() < 1.0
}

extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if msg == WM_COMMAND {
        let id = (wparam.0 & 0xffff) as u32;
        if let Some(app) = APP_HANDLE.get() {
            let labels = window_labels();
            if let Ok(map) = labels.lock() {
                if let Some(label) = map.get(&hwnd.0) {
                    if let Some(win) = app.get_webview_window(label) {
                        let action = match id {
                            BUTTON_PREV => Some("prev"),
                            BUTTON_PLAY_OR_PAUSE => Some("toggle"),
                            BUTTON_NEXT => Some("next"),
                            _ => None,
                        };
                        if let Some(action) = action {
                            let _ = win.emit("windows-thumb-button", action);
                        }
                    }
                }
            }
        }
    }

    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

fn anyhow_to_string<T: std::fmt::Debug>(err: T) -> String {
    format!("{:?}", err)
}

#[allow(dead_code)]
trait PixelExt {
    fn get_pixel_mut_checked(&mut self, x: u32, y: u32) -> Option<&mut image::Rgba<u8>>;
}

#[allow(dead_code)]
impl PixelExt for image::RgbaImage {
    fn get_pixel_mut_checked(&mut self, x: u32, y: u32) -> Option<&mut image::Rgba<u8>> {
        if x < self.width() && y < self.height() {
            Some(self.get_pixel_mut(x, y))
        } else {
            None
        }
    }
}

#[allow(dead_code)]
impl PixelExt for &mut image::RgbaImage {
    fn get_pixel_mut_checked(&mut self, x: u32, y: u32) -> Option<&mut image::Rgba<u8>> {
        if x < self.width() && y < self.height() {
            Some((*self).get_pixel_mut(x, y))
        } else {
            None
        }
    }
}

#[derive(Clone, Copy)]
enum Glyph {
    Prev,
    Play,
    Pause,
    Next,
}
