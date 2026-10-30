//! Read-only Explorer icon-cell position enumeration.
//! Visual sampling is isolated in icon_visual.rs; this module never writes Explorer state.
use serde::Serialize;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconCell {
    pub token: String,
    pub screen_x: i32,
    pub screen_y: i32,
    pub cell_width: i32,
    pub cell_height: i32,
    /// Shell icon extent when available, 0 means unknown. Not an exact UIA rectangle.
    pub image_size: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconSnapshot {
    pub snapshot_version: u64,
    pub explorer_epoch: u64,
    pub captured_at_ms: u64,
    pub coordinate_system: &'static str,
    pub source: &'static str,
    pub calibrated: bool,
    pub desktop_foreground: bool,
    pub icons: Vec<IconCell>,
}
static VERSION: AtomicU64 = AtomicU64::new(0);
static EXPLORER_EPOCH: AtomicU64 = AtomicU64::new(1);
static PREVIOUS_VIEW_ID: AtomicUsize = AtomicUsize::new(0);

#[cfg(windows)]
mod native {
    use super::*;
    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct NativeIcon { index: i32, x: i32, y: i32, width: i32, height: i32, image_size: i32 }
    extern "C" {
        fn dc_snapshot_positions(out: *mut NativeIcon, capacity: i32, count: *mut i32, view_id: *mut usize) -> i32;
        fn dc_desktop_foreground() -> i32;
    }
    pub fn fetch() -> Result<(Vec<IconCell>, bool, usize), String> {
        // COM objects live and are released on this dedicated STA thread.
        // We return POD data, never interface pointers across apartments.
        let thread = std::thread::spawn(|| unsafe {
            use windows_sys::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
            let hr = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            if hr < 0 { return Err(format!("CoInitializeEx failed 0x{:08x}", hr as u32)); }
            let mut items = vec![NativeIcon::default(); 4096];
            let mut count = 0i32;
            let mut view_id = 0usize;
            let result = dc_snapshot_positions(items.as_mut_ptr(), items.len() as i32, &mut count, &mut view_id);
            let desktop_foreground = dc_desktop_foreground() != 0;
            CoUninitialize();
            if result < 0 { return Err(format!("IFolderView unavailable 0x{:08x}", result as u32)); }
            if count < 0 || count as usize > items.len() { return Err("invalid icon count".into()); }
            let cells = items.into_iter().take(count as usize).map(|i| IconCell {
                // Scoped to this snapshot, never an identifier for filesystem changes.
                token: format!("cell:{}", i.index),
                screen_x: i.x, screen_y: i.y,
                cell_width: i.width, cell_height: i.height, image_size: i.image_size,
            }).collect();
            Ok((cells, desktop_foreground, view_id))
        });
        thread.join().map_err(|_| "desktop Shell worker panicked".to_string())?
    }
}

pub fn snapshot() -> Result<IconSnapshot, String> {
    #[cfg(windows)] let (icons, desktop_foreground, view_id) = native::fetch()?;
    #[cfg(not(windows))] let (icons, desktop_foreground, view_id) = (Vec::new(), false, 0usize);
    let previous=PREVIOUS_VIEW_ID.swap(view_id, Ordering::SeqCst);
    if previous!=0 && previous!=view_id { EXPLORER_EPOCH.fetch_add(1, Ordering::SeqCst); }
    Ok(IconSnapshot {
        snapshot_version: VERSION.fetch_add(1, Ordering::Relaxed) + 1,
        explorer_epoch: EXPLORER_EPOCH.load(Ordering::SeqCst),
        captured_at_ms: SystemTime::now().duration_since(UNIX_EPOCH)
            .unwrap_or_default().as_millis().min(u64::MAX as u128) as u64,
        coordinate_system: "physical-screen-px",
        source: if cfg!(windows) { "IFolderView/GetItemPosition+IFolderView2/GetViewModeAndIconSize" } else { "unsupported" },
        calibrated: false, // UIA label bounds and DPI still require Win11 validation.
        desktop_foreground,
        icons,
    })
}
