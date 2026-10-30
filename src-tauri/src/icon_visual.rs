//! V0.6.1: prewarmed, read-only desktop icon visuals.
//! Samples are captured in RAM before a projectile is fired. Explorer positions
//! are never written and no screen pixels are persisted.
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualSample {
    pub token: String,
    pub screen_x: i32,
    pub screen_y: i32,
    pub width: u32,
    pub height: u32,
    /// Local sprite bounds inside the larger Explorer spacing cell.
    pub image_left: u32,
    pub image_top: u32,
    pub image_width: u32,
    pub image_height: u32,
    pub background_data_url: String,
    pub sprite_data_url: String,
    pub border_match: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualSampleBatch {
    pub total: usize,
    pub accepted: usize,
    pub rejected: usize,
    pub first_rejection: Option<String>,
    pub samples: Vec<VisualSample>,
}

#[cfg(windows)]
mod platform {
    use super::*;
    use crate::icon_interaction::IconCell;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use std::{ffi::OsString, io::Cursor, os::windows::ffi::OsStringExt, path::PathBuf};

    #[link(name = "desktop_icon_probe", kind = "static")]
    extern "C" {
        fn dc_capture_cell_bgra(x: i32, y: i32, w: i32, h: i32, out: *mut u8, bytes: i32) -> i32;
        fn dc_wallpaper_info(path: *mut u16, capacity: i32, mode: *mut i32) -> i32;
        fn dc_shell_icon_bgra(x: i32, y: i32, size: i32, out: *mut u8,
            bytes: i32, out_width: *mut i32, out_height: *mut i32) -> i32;
    }

    struct WallpaperCanvas {
        image: ImageBuffer<Rgba<u8>, Vec<u8>>,
        draw_width: u32,
        draw_height: u32,
        screen_width: u32,
        screen_height: u32,
        mode: i32,
    }

    impl WallpaperCanvas {
        fn load(path: PathBuf, mode: i32, screen_width: u32, screen_height: u32) -> Result<Self, String> {
            if !matches!(mode, 2 | 4) {
                return Err(format!("UNSUPPORTED_WALLPAPER_MODE:{mode} (仅支持静态壁纸拉伸/填充)"));
            }
            if screen_width == 0 || screen_height == 0 {
                return Err("INVALID_MONITOR_GEOMETRY".into());
            }
            let bytes = std::fs::read(&path).map_err(|e| format!("WALLPAPER_READ:{e}"))?;
            let source = image::load_from_memory(&bytes)
                .map_err(|e| format!("WALLPAPER_DECODE:{e}"))?
                .to_rgba8();
            let (source_width, source_height) = source.dimensions();
            if source_width == 0 || source_height == 0 {
                return Err("INVALID_WALLPAPER_IMAGE".into());
            }
            let (draw_width, draw_height) = if mode == 2 {
                (screen_width, screen_height)
            } else {
                let scale = (screen_width as f64 / source_width as f64)
                    .max(screen_height as f64 / source_height as f64);
                (
                    (source_width as f64 * scale).ceil() as u32,
                    (source_height as f64 * scale).ceil() as u32,
                )
            };
            if draw_width > 16384 || draw_height > 16384 {
                return Err("WALLPAPER_TOO_LARGE".into());
            }
            let image = image::imageops::resize(
                &source,
                draw_width,
                draw_height,
                image::imageops::FilterType::CatmullRom,
            );
            Ok(Self { image, draw_width, draw_height, screen_width, screen_height, mode })
        }

        fn crop(&self, screen_x: u32, screen_y: u32, width: u32, height: u32)
            -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, String> {
            let (offset_x, offset_y) = if self.mode == 4 {
                ((self.draw_width - self.screen_width) / 2, (self.draw_height - self.screen_height) / 2)
            } else { (0, 0) };
            let x = screen_x.checked_add(offset_x).ok_or("WALLPAPER_X_OVERFLOW")?;
            let y = screen_y.checked_add(offset_y).ok_or("WALLPAPER_Y_OVERFLOW")?;
            if x.checked_add(width).filter(|v| *v <= self.draw_width).is_none()
                || y.checked_add(height).filter(|v| *v <= self.draw_height).is_none() {
                return Err("WALLPAPER_CROP_OUTSIDE".into());
            }
            Ok(image::imageops::crop_imm(&self.image, x, y, width, height).to_image())
        }
    }

    fn encode_rgba(image: ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<String, String> {
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut out, ImageFormat::Png)
            .map_err(|e| format!("PNG_ENCODE:{e}"))?;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(out.into_inner())))
    }

    fn sample_one(
        cell: IconCell,
        origin_x: i32,
        origin_y: i32,
        screen_width: u32,
        screen_height: u32,
        wallpaper: &WallpaperCanvas,
    ) -> Result<VisualSample, String> {
        let x = cell.screen_x;
        let y = cell.screen_y;
        let w = cell.cell_width;
        let h = cell.cell_height;
        if w < 32 || h < 32 || w > 256 || h > 256 {
            return Err("CELL_DIMENSION_OUT_OF_RANGE".into());
        }
        let local_x = x as i64 - origin_x as i64;
        let local_y = y as i64 - origin_y as i64;
        if local_x < 0 || local_y < 0
            || local_x + w as i64 > screen_width as i64
            || local_y + h as i64 > screen_height as i64 {
            return Err("CELL_OUTSIDE_PRIMARY_MONITOR".into());
        }
        let width = w as u32;
        let height = h as u32;
        let background = wallpaper.crop(local_x as u32, local_y as u32, width, height)?;
        let mut capture = vec![0u8; (w * h * 4) as usize];
        let hr = unsafe {
            dc_capture_cell_bgra(x, y, w, h, capture.as_mut_ptr(), capture.len() as i32)
        };
        if hr < 0 {
            return Err(format!("CELL_CAPTURE:{hr:#x}"));
        }

        // The entire Explorer cell is captured ONLY to validate the wallpaper
        // patch. It must never become the flying sprite or a crop source.
        let mut total_difference = 0f64;
        let mut good_edges = 0usize;
        let mut edge_count = 0usize;
        for yy in 0..height {
            for xx in 0..width {
                if xx >= 6 && yy >= 6 && xx + 6 < width && yy + 6 < height { continue; }
                let index = (yy as usize * width as usize + xx as usize) * 4;
                let screen_rgb = [capture[index+2], capture[index+1], capture[index]];
                let wallpaper_pixel = background.get_pixel(xx,yy);
                let difference = (0..3).map(|channel|
                    screen_rgb[channel].abs_diff(wallpaper_pixel[channel]))
                    .max().unwrap_or(0);
                total_difference += difference as f64;
                edge_count += 1;
                if difference <= 20 { good_edges += 1; }
            }
        }
        let edge_match = good_edges as f32 / edge_count.max(1) as f32;
        let mean_difference = total_difference / edge_count.max(1) as f64;
        if edge_match < 0.88 || mean_difference > 17.0 {
            return Err(format!("WALLPAPER_MISMATCH:border={edge_match:.2},mean={mean_difference:.1}"));
        }
        // Retrieve an ACTUAL Shell icon independently of the collision target
        // and cell screenshot. This preserves custom executables, shortcut
        // arrows and PNG transparency without a hard crop / edge fade.
        let preferred_size = if cell.image_size >= 16 { cell.image_size } else { 64 };
        let size = preferred_size.min(w-8).min(h-8).clamp(16,128);
        let mut icon_bgra = vec![0u8; (size * size * 4) as usize];
        let mut icon_w=0i32;
        let mut icon_h=0i32;
        let icon_result=unsafe { dc_shell_icon_bgra(x, y, size,
            icon_bgra.as_mut_ptr(), icon_bgra.len() as i32,
            &mut icon_w, &mut icon_h) };
        if icon_result < 0 || icon_w < 1 || icon_h < 1 || icon_w > size || icon_h > size {
            return Err(format!("SHELL_ICON_IMAGE_UNAVAILABLE:{icon_result:#x}"));
        }
        let mut sprite = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(icon_w as u32, icon_h as u32);
        let mut alpha_bounds = (icon_w as u32, icon_h as u32, 0u32, 0u32);
        let mut visible = 0usize;
        for yy in 0..icon_h as u32 {
            for xx in 0..icon_w as u32 {
                let k=((yy * icon_w as u32 + xx)*4) as usize;
                let alpha=icon_bgra[k+3];
                // Some Shell factories return a premultiplied-ARGB HBITMAP.
                // Normalize when the partial-alpha pixel satisfies premul bounds.
                let mut rgb=[icon_bgra[k+2],icon_bgra[k+1],icon_bgra[k]];
                if alpha>0 && alpha<255 && rgb.iter().all(|&c| c<=alpha) {
                    for c in &mut rgb { *c=(((*c as u32)*255+alpha as u32/2)
                        /alpha as u32).min(255) as u8; }
                }
                sprite.put_pixel(xx,yy,Rgba([rgb[0],rgb[1],rgb[2],alpha]));
                if alpha > 0 {
                    visible += 1;
                    alpha_bounds.0=alpha_bounds.0.min(xx);
                    alpha_bounds.1=alpha_bounds.1.min(yy);
                    alpha_bounds.2=alpha_bounds.2.max(xx+1);
                    alpha_bounds.3=alpha_bounds.3.max(yy+1);
                }
            }
        }
        if visible < 24 { return Err("SHELL_ICON_ALPHA_INVALID".into()); }
        // Trim only transparent SHELL pixels. Persist the trim origin in the
        // cell-relative imageLeft/imageTop; never truncate a nontransparent edge.
        let (tx,ty,ex,ey)=alpha_bounds;
        let display_x=(w-icon_w)/2;
        let display_y=((h-icon_h-36)/2).clamp(2,16);
        let image_left=(display_x as u32)+tx;
        let image_top=(display_y as u32)+ty;
        let image_width=ex-tx;
        let image_height=ey-ty;
        let sprite=image::imageops::crop_imm(&sprite,tx,ty,image_width,image_height).to_image();
        Ok(VisualSample {
            token: cell.token,
            screen_x: x,
            screen_y: y,
            width,
            height,
            image_left,
            image_top,
            image_width,
            image_height,
            background_data_url: encode_rgba(background)?,
            sprite_data_url: encode_rgba(sprite)?,
            border_match: edge_match,
        })
    }

    pub fn get_many(
        cells: Vec<IconCell>,
        origin_x: i32,
        origin_y: i32,
        screen_width: u32,
        screen_height: u32,
    ) -> Result<VisualSampleBatch, String> {
        std::thread::spawn(move || get_many_sta(cells, origin_x, origin_y, screen_width, screen_height))
            .join().map_err(|_| "visual sample worker panicked".to_string())?
    }

    fn get_many_sta(
        cells: Vec<IconCell>,
        origin_x: i32,
        origin_y: i32,
        screen_width: u32,
        screen_height: u32,
    ) -> Result<VisualSampleBatch, String> {
        if cells.len() > 128 { return Err("TOO_MANY_ICON_CELLS".into()); }
        unsafe {
            use windows_sys::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
            let init = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            if init < 0 { return Err(format!("WALLPAPER_COM_INIT:{init:#x}")); }
            let mut path = [0u16; 32768];
            let mut mode = -1i32;
            let hr = dc_wallpaper_info(path.as_mut_ptr(), path.len() as i32, &mut mode);
            if hr < 0 {
                CoUninitialize();
                return Err(format!("WALLPAPER_INFO:{hr:#x}"));
            }
            let path_len = path.iter().position(|&character| character == 0).unwrap_or(path.len());
            let wallpaper_path = PathBuf::from(OsString::from_wide(&path[..path_len]));
            let wallpaper = match WallpaperCanvas::load(wallpaper_path, mode, screen_width, screen_height) {
                Ok(value) => value,
                Err(error) => { CoUninitialize(); return Err(error); }
            };
            let total = cells.len();
            let mut samples = Vec::with_capacity(total);
            let mut first_rejection = None;
            let mut rejected = 0usize;
            for cell in cells {
                match sample_one(cell, origin_x, origin_y, screen_width, screen_height, &wallpaper) {
                    Ok(sample) => samples.push(sample),
                    Err(error) => {
                        rejected += 1;
                        if first_rejection.is_none() { first_rejection = Some(error); }
                    }
                }
            }
            CoUninitialize();
            Ok(VisualSampleBatch { total, accepted: samples.len(), rejected, first_rejection, samples })
        }
    }
}

pub fn samples(
    cells: Vec<crate::icon_interaction::IconCell>,
    origin_x: i32,
    origin_y: i32,
    screen_width: u32,
    screen_height: u32,
) -> Result<VisualSampleBatch, String> {
    #[cfg(windows)] {
        platform::get_many(cells, origin_x, origin_y, screen_width, screen_height)
    }
    #[cfg(not(windows))] {
        let _ = (cells, origin_x, origin_y, screen_width, screen_height);
        Err("UNSUPPORTED_PLATFORM".into())
    }
}
