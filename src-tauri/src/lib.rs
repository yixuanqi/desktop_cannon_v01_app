mod icon_interaction;
mod icon_visual;
mod preferences;
use serde::Serialize;
use std::time::UNIX_EPOCH;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, RecvTimeoutError};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    overlay_x: f64,
    overlay_y: f64,
    cannon_x: f64,
    cannon_y: f64,
    screen_width: f64,
    screen_height: f64,
    taskbar_top: f64,
    scale_factor: f64,
    overlay_physical_x: f64,
    overlay_physical_y: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IconEnvironment {
    layout: Layout,
    fingerprint: String,
}

/// Wallpaper identity only: read current static wallpaper path/mode and file revision.
/// This reads no desktop icon pixels. COM interfaces never leave the worker STA.
#[cfg(windows)]
fn wallpaper_revision() -> Result<String, String> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    extern "C" { fn dc_wallpaper_info(path: *mut u16, capacity: i32, mode: *mut i32) -> i32; }
    unsafe {
        let hr=CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        if hr<0 { return Err(format!("COM_INIT:{hr:#x}")); }
        let mut path=[0u16;32768]; let mut mode=0i32;
        let result=dc_wallpaper_info(path.as_mut_ptr(),path.len() as i32,&mut mode);
        CoUninitialize();
        if result<0 { return Err(format!("WALLPAPER_INFO:{result:#x}")); }
        let len=path.iter().position(|v|*v==0).unwrap_or(path.len());
        let file=std::path::PathBuf::from(std::ffi::OsString::from_wide(&path[..len]));
        let meta=std::fs::metadata(&file).map_err(|e|format!("WALLPAPER_METADATA:{e}"))?;
        let age=meta.modified().ok().and_then(|d|d.duration_since(UNIX_EPOCH).ok())
            .map(|v|format!("{}:{}",v.as_secs(),v.subsec_nanos())).unwrap_or_default();
        Ok(format!("{}|{}|{}|{}",file.to_string_lossy(),mode,meta.len(),age))
    }
}
#[cfg(not(windows))]
fn wallpaper_revision() -> Result<String,String> { Ok("unsupported-platform".into()) }

/// New physical monitor geometry on *every* call; never return setup-time dimensions.
fn fresh_layout(app: &tauri::AppHandle) -> Result<Layout, String> {
    let overlay=app.get_webview_window("overlay").ok_or("OVERLAY_UNAVAILABLE")?;
    let cannon=app.get_webview_window("cannon").ok_or("CANNON_UNAVAILABLE")?;
    let monitor=overlay.primary_monitor().map_err(|e|e.to_string())?.ok_or("MONITOR_UNAVAILABLE")?;
    let origin=monitor.position();let display=monitor.size();let work=monitor.work_area();
    let scale=monitor.scale_factor();
    if !scale.is_finite() || scale<=0.0 {return Err("INVALID_DPI".into());}
    let actual=overlay.outer_position().map_err(|e|e.to_string())?;
    let actual_size=overlay.outer_size().map_err(|e|e.to_string())?;
    if actual.x!=origin.x || actual.y!=origin.y {
        overlay.set_position(PhysicalPosition::new(origin.x,origin.y)).map_err(|e|e.to_string())?;
    }
    if actual_size.width!=display.width || actual_size.height!=display.height {
        overlay.set_size(PhysicalSize::new(display.width,display.height)).map_err(|e|e.to_string())?;
    }
    // Refresh the physical size for DPI changes, but NEVER clamp or move
    // the interactive cannon while merely reading layout. The transparent
    // 360x240 webview intentionally has margins around the painted cannon:
    // moving its top-left outside work_area may be necessary to place the
    // visible cannon artwork flush against the bottom/left screen edge.
    //
    // icon_environment() invokes fresh_layout() every 2s when icon physics is
    // enabled. Clamping to work_area here used to snap any user drag back
    // after each poll. Keep the user's real, freely dragged outer position.
    let expected_size = PhysicalSize::new((360.0 * scale).round() as u32,
                                          (240.0 * scale).round() as u32);
    let size=cannon.outer_size().map_err(|e|e.to_string())?;
    if size != expected_size {
        cannon.set_size(expected_size).map_err(|e|e.to_string())?;
    }
    let pos=cannon.outer_position().map_err(|e|e.to_string())?;
    Ok(Layout {
        overlay_x:0.0,overlay_y:0.0,
        cannon_x:(pos.x-origin.x) as f64/scale,
        cannon_y:(pos.y-origin.y) as f64/scale,
        screen_width:display.width as f64/scale,
        screen_height:display.height as f64/scale,
        taskbar_top:(work.position.y as i64+work.size.height as i64-origin.y as i64) as f64/scale,
        scale_factor:scale,
        overlay_physical_x:origin.x as f64,overlay_physical_y:origin.y as f64,
    })
}

#[tauri::command]
async fn icon_environment(app: tauri::AppHandle) -> Result<IconEnvironment, String> {
    let layout=fresh_layout(&app)?;
    // Expensive COM + file metadata never block the Tauri UI event thread.
    let wallpaper=tauri::async_runtime::spawn_blocking(wallpaper_revision)
        .await.map_err(|e|e.to_string())??;
    let fingerprint=format!("{}:{}:{}:{}:{}:{}:{}:{}",layout.overlay_physical_x,
      layout.overlay_physical_y,layout.screen_width,layout.screen_height,layout.scale_factor,
      layout.taskbar_top,layout.screen_width*layout.scale_factor,wallpaper);
    Ok(IconEnvironment {layout,fingerprint})
}

static ICON_INTERACTION: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IconCapabilities {
    windows_shell: bool,
    enabled: bool,
    mode: &'static str,
    reason: &'static str,
}

#[tauri::command]
fn icon_capabilities() -> IconCapabilities {
    IconCapabilities {
        windows_shell: cfg!(windows),
        enabled: ICON_INTERACTION.load(Ordering::SeqCst),
        mode: "multi-icon-physics-experiment",
        reason: "支持多图标物理飞散，落地后停留5-8秒并弹性回位；不修改 Explorer 图标位置",
    }
}

#[tauri::command]
async fn icon_snapshot() -> Result<icon_interaction::IconSnapshot, String> {
    if !ICON_INTERACTION.load(Ordering::SeqCst) {
        return Err("桌面图标物理互动未开启".into());
    }
    tauri::async_runtime::spawn_blocking(icon_interaction::snapshot)
        .await.map_err(|error| error.to_string())?
}

/// Capture and decode all eligible icon cells before the user fires.
/// The collision callback never invokes Windows capture, wallpaper decode or PNG encoding.
#[tauri::command]
async fn icon_visual_samples(app: tauri::AppHandle) -> Result<icon_visual::VisualSampleBatch, String> {
    if !ICON_INTERACTION.load(Ordering::SeqCst) {
        return Err("ICON_INTERACTION_DISABLED".into());
    }
    let overlay = app.get_webview_window("overlay").ok_or("OVERLAY_UNAVAILABLE")?;
    let monitor = overlay.primary_monitor().map_err(|error| error.to_string())?
        .ok_or("MONITOR_UNAVAILABLE")?;
    let origin = *monitor.position();
    let size = *monitor.size();
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = icon_interaction::snapshot()?;
        if !snapshot.desktop_foreground {
            return Err("DESKTOP_NOT_FOREGROUND".into());
        }
        icon_visual::samples(snapshot.icons, origin.x, origin.y, size.width, size.height)
    }).await.map_err(|error| error.to_string())?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualGuardRect {screen_x:i32,screen_y:i32,width:i32,height:i32}

#[tauri::command]
fn icon_visual_guard_many(rects: Vec<VisualGuardRect>) -> bool {
    if !ICON_INTERACTION.load(Ordering::SeqCst)||rects.is_empty()||rects.len()>16{return false;}
    rects.into_iter().all(|r|r.width>0&&r.height>0&&r.width<=256&&r.height<=256&&
        icon_visual_guard(r.screen_x,r.screen_y,r.width,r.height))
}

#[tauri::command]
fn icon_visual_guard(x: i32, y: i32, w: i32, h: i32) -> bool {
    if !ICON_INTERACTION.load(Ordering::SeqCst) { return false; }
    #[cfg(windows)] unsafe {
        extern "C" { fn dc_visual_guard(x: i32, y: i32, w: i32, h: i32) -> i32; }
        dc_visual_guard(x, y, w, h) != 0
    }
    #[cfg(not(windows))] { let _ = (x, y, w, h); false }
}

#[tauri::command]
fn get_layout(app: tauri::AppHandle) -> Result<Layout,String> {
    fresh_layout(&app)
}

struct TrayMenus {
    audio: MenuItem<tauri::Wry>,
    interaction: MenuItem<tauri::Wry>,
}
struct PositionSender(Sender<preferences::WindowPosition>);

fn persist_cannon_position(app: &tauri::AppHandle) {
    if let Some(window)=app.get_webview_window("cannon") {
        if let Ok(point)=window.outer_position() {
            let _=app.state::<preferences::PrefsStore>().update(|p| {
                p.cannon_position=Some(preferences::WindowPosition{x:point.x,y:point.y});
            });
        }
    }
}

#[tauri::command]
fn get_app_settings(app: tauri::AppHandle) -> preferences::UserPrefs {
    app.state::<preferences::PrefsStore>().get()
}

#[tauri::command]
fn set_onboarding_done(app: tauri::AppHandle) -> Result<preferences::UserPrefs,String> {
    app.state::<preferences::PrefsStore>().update(|p|p.onboarding_done=true)
}

fn change_icon_interaction(app: &tauri::AppHandle, enabled: bool) -> Result<preferences::UserPrefs,String> {
    let prefs=app.state::<preferences::PrefsStore>().update(|p|p.icon_enabled=enabled)?;
    ICON_INTERACTION.store(enabled,Ordering::SeqCst);
    if let Some(menu)=app.try_state::<TrayMenus>() {
        let _=menu.interaction.set_text(if enabled {"关闭桌面图标物理互动 ✓"}
            else {"开启桌面图标物理互动"});
    }
    use tauri::Emitter;
    let _=app.emit("icon:interaction-changed",enabled);
    Ok(prefs)
}

#[tauri::command]
fn set_icon_interaction(app: tauri::AppHandle, enabled: bool) -> Result<preferences::UserPrefs,String> {
    change_icon_interaction(&app,enabled)
}

fn change_audio(app: &tauri::AppHandle, enabled: bool) -> Result<preferences::UserPrefs,String> {
    let prefs=app.state::<preferences::PrefsStore>().update(|p|p.audio_enabled=enabled)?;
    if let Some(menu)=app.try_state::<TrayMenus>() {
        let _=menu.audio.set_text(if enabled {"关闭音效 ✓"} else {"开启音效"});
    }
    use tauri::Emitter;
    let _=app.emit("cannon:audio-changed",enabled);
    Ok(prefs)
}

#[tauri::command]
fn set_audio_enabled(app: tauri::AppHandle, enabled: bool) -> Result<preferences::UserPrefs,String> {
    change_audio(&app,enabled)
}

/// Recover from a saved position on a disconnected display without touching
/// the icon-physics snapshot or the other transparent window.
#[tauri::command]
fn reset_cannon_position(app: tauri::AppHandle) -> Result<(),String> {
    let cannon=app.get_webview_window("cannon").ok_or("CANNON_UNAVAILABLE")?;
    let monitor=cannon.primary_monitor().map_err(|e|e.to_string())?.ok_or("MONITOR_UNAVAILABLE")?;
    let work=monitor.work_area();
    let size=cannon.outer_size().map_err(|e|e.to_string())?;
    let s=monitor.scale_factor();
    let x=work.position.x+work.size.width as i32-size.width as i32-(15.0*s).round() as i32;
    let y=work.position.y+work.size.height as i32-size.height as i32-(4.0*s).round() as i32;
    cannon.set_position(PhysicalPosition::new(x,y)).map_err(|e|e.to_string())?;
    persist_cannon_position(&app);
    Ok(())
}

/// Reassert the ordering of our two focusless topmost windows.
/// Windows may place a newly activated topmost editor above the gadget.
/// Keep the click-through overlay below the cannon, without focusing either.
fn restore_cannon_z_order(
    overlay: &tauri::WebviewWindow,
    cannon: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    overlay.set_always_on_top(false)?;
    cannon.set_always_on_top(false)?;
    overlay.set_always_on_top(true)?;
    cannon.set_always_on_top(true)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // Must be registered first. This prevents new copies of Desktop Cannon
        // from creating duplicate overlays and reporting stale hitboxes.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .invoke_handler(tauri::generate_handler![get_layout, icon_environment, icon_capabilities, icon_snapshot, icon_visual_samples, icon_visual_guard, icon_visual_guard_many, get_app_settings, set_icon_interaction, set_audio_enabled, set_onboarding_done, reset_cannon_position])
        .setup(|app| {
            let settings_path=app.path().app_config_dir()?.join("settings.json");
            app.manage(preferences::PrefsStore::open(settings_path));
            let saved=app.state::<preferences::PrefsStore>().get();
            ICON_INTERACTION.store(saved.icon_enabled,Ordering::SeqCst);
            // Create the overlay FIRST, hidden, so it can never absorb a click
            // before cursor pass-through has been configured.
            let overlay_page = if std::env::var("CANNON_ICON_DEBUG").ok().as_deref()==Some("1") {
                "overlay.html?iconDebug=1"
            } else { "overlay.html" };
            let overlay = WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App(overlay_page.into()),
            )
            .title("桌面小炮 · 炮弹特效")
            .inner_size(400.0, 300.0)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .build()?;

            let monitor = overlay
                .primary_monitor()?
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "未检测到主显示器"))?;
            let s = monitor.scale_factor();
            let origin = monitor.position();
            let display = monitor.size();
            let work = monitor.work_area();
            let window_width = (360.0 * s).round() as u32;
            let window_height = (240.0 * s).round() as u32;
            let margin_right = (15.0 * s).round() as i32;
            let margin_bottom = (4.0 * s).round() as i32;
            let default_x = work.position.x + work.size.width as i32
                - window_width as i32 - margin_right;
            let default_y = work.position.y + work.size.height as i32
                - window_height as i32 - margin_bottom;
            let restored=saved.cannon_position.and_then(|p|preferences::viable_position(
                p,origin.x,origin.y,display.width,display.height,window_width,window_height));
            let cannon_px=restored.map(|p|p.x).unwrap_or(default_x);
            let cannon_py=restored.map(|p|p.y).unwrap_or(default_y);

            overlay.set_position(PhysicalPosition::new(origin.x, origin.y))?;
            overlay.set_size(PhysicalSize::new(display.width, display.height))?;
            // Critical: the full-screen overlay must never intercept clicks.
            overlay.set_ignore_cursor_events(true)?;

            let cannon = WebviewWindowBuilder::new(
                app,
                "cannon",
                WebviewUrl::App("cannon.html".into()),
            )
            .title("桌面小炮")
            .inner_size(360.0, 240.0)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .build()?;
            cannon.set_size(PhysicalSize::new(window_width, window_height))?;
            cannon.set_position(PhysicalPosition::new(cannon_px, cannon_py))?;

            app.manage(Layout {
                overlay_x: 0.0, overlay_y: 0.0,
                cannon_x: (cannon_px - origin.x) as f64 / s,
                cannon_y: (cannon_py - origin.y) as f64 / s,
                screen_width: display.width as f64 / s,
                screen_height: display.height as f64 / s,
                taskbar_top: (work.position.y + work.size.height as i32 - origin.y) as f64 / s,
                scale_factor: s,
                overlay_physical_x: origin.x as f64,
                overlay_physical_y: origin.y as f64,
            });

            // Windows order: overlay first, interactive cannon last (topmost).
            overlay.show()?;
            cannon.show()?;
            // The interactive cannon must sit above our full-screen visual overlay.
            restore_cannon_z_order(&overlay, &cannon)?;

            let visibility = MenuItem::with_id(app, "visibility", "显示 / 隐藏小炮", true, None::<&str>)?;
            let mute = MenuItem::with_id(app, "audio",
                if saved.audio_enabled {"关闭音效 ✓"} else {"开启音效"},true,None::<&str>)?;
            let interaction = MenuItem::with_id(app, "icon_interaction",
                if saved.icon_enabled {"关闭桌面图标物理互动 ✓"} else {"开启桌面图标物理互动"},
                true,None::<&str>)?;
            let reset_position=MenuItem::with_id(app,"reset_position","重置小炮位置",true,None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出桌面小炮", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&visibility, &mute, &interaction, &reset_position, &quit])?;
            app.manage(TrayMenus {audio:mute.clone(),interaction:interaction.clone()});
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("缺少应用图标").clone())
                .tooltip("桌面小炮 · 拉动红色炮闩")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "visibility" => {
                            if let (Some(cannon), Some(overlay)) = (
                                app.get_webview_window("cannon"),
                                app.get_webview_window("overlay"),
                            ) {
                                if cannon.is_visible().unwrap_or(false) {
                                    persist_cannon_position(app);
                                    // Suspend probing while hidden without erasing explicit
                                    // consent. Re-enable from saved preference on show.
                                    ICON_INTERACTION.store(false,Ordering::SeqCst);
                                    { use tauri::Emitter; let _=app.emit("icon:interaction-changed",false); }
                                    { use tauri::Emitter; let _=app.emit("cannon:visibility-changed",false); }
                                    let _ = cannon.hide();
                                    let _ = overlay.hide();
                                } else {
                                    let _ = overlay.show();
                                    let _ = cannon.show();
                                    // Hide/show from the tray also recovers stacking behind
                                    // other always-on-top editor/tool windows.
                                    let _ = restore_cannon_z_order(&overlay, &cannon);
                                    let remember=app.state::<preferences::PrefsStore>().get().icon_enabled;
                                    ICON_INTERACTION.store(remember,Ordering::SeqCst);
                                    { use tauri::Emitter; let _=app.emit("icon:interaction-changed",remember); }
                                    { use tauri::Emitter; let _=app.emit("cannon:visibility-changed",true); }
                                }
                            }
                        }
                        "audio" => {
                            let enabled=app.state::<preferences::PrefsStore>().get().audio_enabled;
                            let _=change_audio(app,!enabled);
                        }
                        "icon_interaction" => {
                            let enabled=app.state::<preferences::PrefsStore>().get().icon_enabled;
                            let _=change_icon_interaction(app,!enabled);
                        }
                        "reset_position" => { let _=reset_cannon_position(app.clone()); }
                        "quit" => { persist_cannon_position(app); app.exit(0); },
                        _ => {}
                    }
                })
                .build(app)?;
            // One debounced position writer: no file IO while Windows is dragging,
            // and no thread-per-mouse-move. Persist after 650ms of inactivity.
            let (tx,rx)=std::sync::mpsc::channel::<preferences::WindowPosition>();
            app.manage(PositionSender(tx));
            let worker_app=app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(mut pos)=rx.recv() {
                    loop {
                        match rx.recv_timeout(Duration::from_millis(650)) {
                            Ok(next)=>pos=next,
                            Err(RecvTimeoutError::Timeout)=>break,
                            Err(RecvTimeoutError::Disconnected)=>return,
                        }
                    }
                    let _=worker_app.state::<preferences::PrefsStore>().update(|p|p.cannon_position=Some(pos));
                }
            });
            Ok(())
        })
        .on_window_event(|window,event| {
            if window.label()=="cannon" {
                if let tauri::WindowEvent::Moved(pos)=event {
                    if let Some(channel)=window.app_handle().try_state::<PositionSender>() {
                        let _=channel.0.send(preferences::WindowPosition{x:pos.x,y:pos.y});
                    }
                }
                return;
            }
            if window.label()!="overlay" {return;}
            let reason=match event {
                tauri::WindowEvent::Resized(_)=>Some("overlay-resized"),
                tauri::WindowEvent::ScaleFactorChanged{..}=>Some("dpi-changed"),
                tauri::WindowEvent::Moved(_)=>Some("overlay-moved"),
                _=>None,
            };
            if let Some(reason)=reason {
                use tauri::Emitter;
                let _=window.app_handle().emit("icon:environment-changed",
                  serde_json::json!({"reason":reason}));
            }
        })
        .run(tauri::generate_context!())
        .expect("无法启动桌面小炮");
}
