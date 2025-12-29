//! Windows 任务栏缩略图与缩略工具栏的支持，实现封面预览与上一首/播放/下一首按钮。
//!
//! 仅在 Windows 上编译；其他平台不启用。

#![cfg(windows)]
#![allow(dead_code)]

use std::{ffi::c_void, mem::size_of, ptr::null_mut, sync::OnceLock};

use image::{imageops::FilterType, DynamicImage, GenericImageView, Rgba};
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
                DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
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
static WINDOW_LABEL: OnceLock<String> = OnceLock::new();
static BUTTONS_READY: OnceLock<()> = OnceLock::new();

/// 在应用启动时注册主窗口的子类回调，用于响应缩略工具栏按钮点击。
pub fn register_window(app: &tauri::App) -> tauri::Result<()> {
    let window = app
        .get_webview_window("auth")
        .ok_or(tauri::Error::WindowNotFound)?;

    let hwnd = window.hwnd()?;
    APP_HANDLE.set(app.handle().clone()).ok();
    WINDOW_LABEL.set(window.label().to_string()).ok();

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
    println!("开始更新任务栏缩略图...");
    let hwnd = window.hwnd().map_err(anyhow_to_string)?;
    enable_iconic_attributes(hwnd).map_err(anyhow_to_string)?;
    println!("启用图标化属性成功");
    apply_thumbnail(hwnd, cover_data).map_err(anyhow_to_string)?;
    println!("应用缩略图成功");
    apply_buttons(hwnd, is_playing, &title).map_err(anyhow_to_string)?;
    println!("应用按钮成功，播放状态: {}, 标题: {:?}", is_playing, title);
    Ok(())
}

fn apply_thumbnail(hwnd: HWND, cover_data: Option<Vec<u8>>) -> Result<(), HRESULT> {
    let data = match cover_data {
        Some(d) if !d.is_empty() => {
            println!("封面数据大小: {} bytes", d.len());
            d
        },
        _ => {
            println!("无封面数据，跳过缩略图更新");
            return Ok(())
        },
    };

    let img = image::load_from_memory(&data).map_err(|_| HRESULT(0x80070057u32 as i32))?;
    let thumb = create_thumbnail_bitmap(img)?;
    unsafe { DwmSetIconicThumbnail(hwnd, thumb, 0) }?;
    let _ = unsafe { DeleteObject(HGDIOBJ(thumb.0)) };
    println!("缩略图设置完成");
    Ok(())
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
    let has_iconic = 1i32;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_HAS_ICONIC_BITMAP,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        )?;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_FORCE_ICONIC_REPRESENTATION,
            &has_iconic as *const _ as *const c_void,
            size_of::<i32>() as _,
        )?;
    }
    Ok(())
}

fn create_thumbnail_bitmap(img: DynamicImage) -> Result<HBITMAP, HRESULT> {
    let (w, h) = img.dimensions();
    let max = 200u32;
    let (w, h) = if w > max || h > max {
        img.resize(max, max, FilterType::CatmullRom).dimensions()
    } else {
        (w, h)
    };

    let resized = img.resize_exact(w, h, FilterType::Triangle).to_rgba8();
    let mut bgra = Vec::with_capacity((w * h * 4) as usize);
    for chunk in resized.chunks(4) {
        let rgba = Rgba([chunk[0], chunk[1], chunk[2], chunk[3]]);
        bgra.extend_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
    }

    create_hbitmap_from_bgra(&bgra, w as i32, h as i32)
}

fn create_hbitmap_from_bgra(pixels: &[u8], width: i32, height: i32) -> Result<HBITMAP, HRESULT> {
    let mut info = BITMAPINFO::default();
    info.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as _;
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB.0 as _;

    let mut bits: *mut c_void = null_mut();
    let hbitmap = unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0) }
        .map_err(|e| e.code())?;
    if hbitmap.is_invalid() || bits.is_null() {
        return Err(HRESULT(0x80070057u32 as i32));
    }

    unsafe {
        std::ptr::copy_nonoverlapping(
            pixels.as_ptr(),
            bits as *mut u8,
            (width * height * 4) as usize,
        );
    }

    Ok(hbitmap)
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
            if let Some(label) = WINDOW_LABEL.get() {
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
