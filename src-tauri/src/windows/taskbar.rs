//! Windows 任务栏缩略图与缩略工具栏的支持，实现封面预览与上一首/播放/下一首按钮。
//!
//! 仅在 Windows 上编译；其他平台不启用。

#![cfg(windows)]
#![allow(dead_code)]

use std::{
    collections::{HashMap, HashSet},
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

static TASKBAR_STATE: OnceLock<TaskbarState> = OnceLock::new();

struct TaskbarState {
    app: AppHandle,
    labels: Mutex<HashMap<isize, String>>,
    buttons_ready: Mutex<HashSet<isize>>,
}

impl TaskbarState {
    fn new(app: AppHandle) -> Self {
        Self {
            app,
            labels: Mutex::new(HashMap::new()),
            buttons_ready: Mutex::new(HashSet::new()),
        }
    }
}

fn state_from_window(window: &Window) -> &'static TaskbarState {
    TASKBAR_STATE.get_or_init(|| TaskbarState::new(window.app_handle().clone()))
}

fn hwnd_key(hwnd: HWND) -> isize {
    hwnd.0 as isize
}

fn to_sync_error<T: std::fmt::Debug>(err: T) -> String {
    format!("锁被污染或不可用: {:?}", err)
}

/// 为指定窗口注册子类回调，用于响应缩略工具栏按钮点击。
pub fn register_window(window: &Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(anyhow_to_string)?;
    let state = state_from_window(window);
    let key = hwnd_key(hwnd);

    {
        let mut map = state.labels.lock().map_err(to_sync_error)?;
        if map.contains_key(&key) {
            return Ok(());
        }
        map.insert(key, window.label().to_string());
    }

    let ok = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), 1, 0).as_bool() };
    if !ok {
        return Err("设置窗口子类失败，任务栏按钮将不可用".to_string());
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
    let hwnd = window.hwnd().map_err(anyhow_to_string)?;
    let state = state_from_window(window);
    let key = hwnd_key(hwnd);

    register_window(window)?;

    apply_buttons(state, hwnd, key, is_playing, title.as_deref())?;
    enable_iconic_attributes(hwnd)?;
    apply_thumbnail(hwnd, cover_data)?;

    Ok(())
}

fn apply_buttons(
    state: &TaskbarState,
    hwnd: HWND,
    key: isize,
    is_playing: bool,
    title: Option<&str>,
) -> Result<(), String> {
    let taskbar: ITaskbarList3 =
        unsafe { CoCreateInstance(&TASKBAR_LIST_CLSID, None, CLSCTX_INPROC_SERVER) }
            .map_err(|e| format!("初始化任务栏接口失败: {:?}", e))?;
    unsafe { taskbar.HrInit().map_err(|e| format!("任务栏接口激活失败: {:?}", e))? };

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

    let already_ready = {
        let ready = state.buttons_ready.lock().map_err(to_sync_error)?;
        ready.contains(&key)
    };

    if already_ready {
        unsafe {
            taskbar
                .ThumbBarUpdateButtons(hwnd, &buttons)
                .map_err(|e| format!("更新任务栏按钮失败: {:?}", e))?;
        }
    } else {
        unsafe {
            taskbar
                .ThumbBarAddButtons(hwnd, &buttons)
                .map_err(|e| format!("添加任务栏按钮失败: {:?}", e))?;
        }
        let mut ready = state.buttons_ready.lock().map_err(to_sync_error)?;
        ready.insert(key);
    }

    if let Some(text) = title {
        let mut button = THUMBBUTTON::default();
        button.iId = BUTTON_PLAY_OR_PAUSE as _;
        button.dwMask = THB_TOOLTIP | THB_FLAGS;
        button.dwFlags = THBF_ENABLED;
        set_tip(&mut button.szTip, text);
        unsafe {
            taskbar
                .ThumbBarUpdateButtons(hwnd, &[button])
                .map_err(|e| format!("更新按钮提示失败: {:?}", e))?;
        }
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

fn enable_iconic_attributes(hwnd: HWND) -> Result<(), String> {
    let has_iconic = 1i32;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_HAS_ICONIC_BITMAP,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        )
        .map_err(|e| format!("启用缩略图属性失败: {:?}", e))?;

        DwmSetWindowAttribute(
            hwnd,
            DWMWA_FORCE_ICONIC_REPRESENTATION,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        )
        .map_err(|e| format!("强制窗口图标化失败: {:?}", e))?;
    }
    Ok(())
}

fn apply_thumbnail(hwnd: HWND, cover_data: Option<Vec<u8>>) -> Result<(), String> {
    let image = match cover_data {
        Some(data) if !data.is_empty() => match image::load_from_memory(&data) {
            Ok(img) => img,
            Err(err) => {
                println!("封面解码失败，将使用占位缩略图: {:?}", err);
                build_placeholder_thumbnail()
            }
        },
        _ => build_placeholder_thumbnail(),
    };

    apply_thumbnail_image(hwnd, image)
}

fn apply_thumbnail_image(hwnd: HWND, img: DynamicImage) -> Result<(), String> {
    let thumb = create_thumbnail_bitmap(img)?;

    match unsafe { DwmSetIconicThumbnail(hwnd, thumb, 0) } {
        Ok(_) => {
            let _ = unsafe { DeleteObject(HGDIOBJ(thumb.0)) };
            Ok(())
        }
        Err(e) => {
            let _ = unsafe { DeleteObject(HGDIOBJ(thumb.0)) };
            Err(format!("设置 DWM 缩略图失败: {:?}", e))
        }
    }
}

fn create_thumbnail_bitmap(img: DynamicImage) -> Result<HBITMAP, String> {
    let (w, h) = img.dimensions();
    let max = 200u32;
    let mut working_img = img;
    if w > max || h > max {
        working_img = working_img.resize(max, max, FilterType::CatmullRom);
    }

    let (target_w, target_h) = working_img.dimensions();
    let rgba = working_img.to_rgba8();
    let bgra = to_premultiplied_bgra(&rgba);

    create_hbitmap_from_bgra(&bgra, target_w as i32, target_h as i32)
}

fn build_placeholder_thumbnail() -> DynamicImage {
    let size = 120u32;
    let placeholder = RgbaImage::from_pixel(size, size, Rgba([24, 24, 24, 255]));
    DynamicImage::ImageRgba8(placeholder)
}

fn create_hbitmap_from_bgra(pixels: &[u8], width: i32, height: i32) -> Result<HBITMAP, String> {
    if width <= 0 || height <= 0 {
        return Err("位图尺寸非法".to_string());
    }

    let height_abs = height.unsigned_abs();
    let row_bytes = width as usize * 4;
    let expected_size = row_bytes * height_abs as usize;

    if pixels.len() != expected_size {
        return Err("像素数据大小与尺寸不匹配".to_string());
    }

    let mut header = BITMAPINFOHEADER::default();
    header.biSize = size_of::<BITMAPINFOHEADER>() as u32;
    header.biWidth = width;
    header.biHeight = -(height_abs as i32);
    header.biPlanes = 1;
    header.biBitCount = 32;
    header.biCompression = BI_RGB.0;
    header.biSizeImage = expected_size as u32;

    let mut bits: *mut c_void = null_mut();
    let info = BITMAPINFO {
        bmiHeader: header,
        bmiColors: [RGBQUAD::default(); 1],
    };
    let hbitmap = unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0) };

    match hbitmap {
        Ok(bitmap) => {
            if bitmap.is_invalid() || bits.is_null() {
                return Err("创建位图失败".to_string());
            }

            unsafe {
                std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u8, expected_size);
            }

            Ok(bitmap)
        }
        Err(e) => Err(format!("创建 DIB Section 失败: {:?}", e)),
    }
}

fn build_icon(glyph: Glyph) -> Result<windows::Win32::UI::WindowsAndMessaging::HICON, String> {
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
    let mask = unsafe { CreateBitmap(size as i32, size as i32, 1, 1, None) };
    if mask.is_invalid() {
        let _ = unsafe { DeleteObject(HGDIOBJ(color.0)) };
        return Err("创建图标遮罩失败".to_string());
    }

    let info = ICONINFO {
        fIcon: true.into(),
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: mask,
        hbmColor: color,
    };

    let hicon = unsafe { CreateIconIndirect(&info) }
        .map_err(|e| format!("创建图标失败: {:?}", e))?;
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
        if let Some(state) = TASKBAR_STATE.get() {
            let key = hwnd_key(hwnd);
            if let Ok(map) = state.labels.lock() {
                if let Some(label) = map.get(&key) {
                    if let Some(win) = state.app.get_webview_window(label) {
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
