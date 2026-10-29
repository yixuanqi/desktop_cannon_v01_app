use serde::Serialize;
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
}

#[tauri::command]
fn get_layout(app: tauri::AppHandle, layout: tauri::State<'_, Layout>) -> Result<Layout, String> {
    // Never use the launch position after the user drags the cannon window.
    // Tauri reports physical pixels; overlay canvas expects CSS pixels.
    let mut current = layout.inner().clone();
    let cannon = app.get_webview_window("cannon")
        .ok_or_else(|| "小炮交互窗口不存在".to_string())?;
    let pos = cannon.outer_position().map_err(|e| e.to_string())?;
    let overlay = app.get_webview_window("overlay")
        .ok_or_else(|| "特效窗口不存在".to_string())?;
    let origin = overlay.outer_position().map_err(|e| e.to_string())?;
    current.cannon_x = (pos.x - origin.x) as f64 / current.scale_factor;
    current.cannon_y = (pos.y - origin.y) as f64 / current.scale_factor;
    Ok(current)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_layout])
        .setup(|app| {
            // Create the overlay FIRST, hidden, so it can never absorb a click
            // before cursor pass-through has been configured.
            let overlay = WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App("overlay.html".into()),
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
            let cannon_px = work.position.x + work.size.width as i32
                - window_width as i32 - margin_right;
            let cannon_py = work.position.y + work.size.height as i32
                - window_height as i32 - margin_bottom;

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
            });

            // Windows order: overlay first, interactive cannon last (topmost).
            overlay.show()?;
            cannon.show()?;

            let visibility = MenuItem::with_id(app, "visibility", "显示 / 隐藏小炮", true, None::<&str>)?;
            let mute = MenuItem::with_id(app, "audio", "音效开 / 关", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出桌面小炮", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&visibility, &mute, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("缺少应用图标").clone())
                .tooltip("桌面小炮 · 拉动红色炮闩")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "visibility" => {
                            if let (Some(c), Some(o)) = (
                                app.get_webview_window("cannon"),
                                app.get_webview_window("overlay"),
                            ) {
                                if c.is_visible().unwrap_or(false) {
                                    let _ = c.hide(); let _ = o.hide();
                                } else {
                                    let _ = o.show(); let _ = c.show();
                                }
                            }
                        }
                        "audio" => {
                            use tauri::Emitter;
                            let _ = app.emit("cannon:toggle-audio", ());
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("无法启动桌面小炮");
}
