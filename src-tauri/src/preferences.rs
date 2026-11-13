//! Persistent, version-tolerant user preferences. Only non-sensitive options
//! and the cannon's native window position are saved in app config.
use serde::{Deserialize, Serialize};
use std::{path::{Path, PathBuf}, sync::Mutex};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct UserPrefs {
    pub audio_enabled: bool,
    /// Only set true after the user explicitly enables desktop-icon interaction.
    pub icon_enabled: bool,
    pub onboarding_done: bool,
    pub cannon_position: Option<WindowPosition>,
}

impl Default for UserPrefs {
    fn default() -> Self {
        Self { audio_enabled: true, icon_enabled: false, onboarding_done: false, cannon_position: None }
    }
}

pub struct PrefsStore {
    file: PathBuf,
    current: Mutex<UserPrefs>,
}

impl PrefsStore {
    pub fn open(file: PathBuf) -> Self {
        let current = std::fs::read_to_string(&file).ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self { file, current: Mutex::new(current) }
    }

    pub fn get(&self) -> UserPrefs {
        self.current.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn update(&self, update: impl FnOnce(&mut UserPrefs)) -> Result<UserPrefs, String> {
        let mut guard = self.current.lock().unwrap_or_else(|e| e.into_inner());
        let previous = guard.clone();
        update(&mut guard);
        if *guard == previous { return Ok(guard.clone()); }
        if let Err(error) = save(&self.file, &guard) {
            *guard = previous;
            return Err(error);
        }
        Ok(guard.clone())
    }
}

fn save(file: &Path, prefs: &UserPrefs) -> Result<(), String> {
    let parent = file.parent().ok_or("INVALID_SETTINGS_PATH")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("SETTINGS_DIRECTORY:{e}"))?;
    let tmp = file.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(prefs).map_err(|e| format!("SETTINGS_SERIALIZE:{e}"))?;
    std::fs::write(&tmp, bytes).map_err(|e| format!("SETTINGS_WRITE:{e}"))?;
    std::fs::rename(&tmp, file).map_err(|e| format!("SETTINGS_RENAME:{e}"))
}

/// Preserve deliberate partial off-screen placement (the webview has transparent
/// margins) but reject lost monitors and positions without at least an 80px handle.
pub fn viable_position(
    pos: WindowPosition, screen_x: i32, screen_y: i32,
    screen_w: u32, screen_h: u32, win_w: u32, win_h: u32,
) -> Option<WindowPosition> {
    let x = i64::from(pos.x);
    let y = i64::from(pos.y);
    let sx = i64::from(screen_x);
    let sy = i64::from(screen_y);
    let right = sx + i64::from(screen_w);
    let bottom = sy + i64::from(screen_h);
    let overlap_w = (x + i64::from(win_w)).min(right) - x.max(sx);
    let overlap_h = (y + i64::from(win_h)).min(bottom) - y.max(sy);
    if overlap_w >= 80 && overlap_h >= 80 { Some(pos) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_install_is_opt_in() {
        let prefs: UserPrefs = serde_json::from_str("{}").unwrap();
        assert!(!prefs.icon_enabled);
        assert!(prefs.audio_enabled);
        assert!(!prefs.onboarding_done);
    }
    #[test]
    fn older_or_partial_settings_remain_compatible() {
        let p: UserPrefs = serde_json::from_str(r#"{"audioEnabled":false}"#).unwrap();
        assert!(!p.audio_enabled);
        assert!(!p.icon_enabled);
        assert_eq!(p.cannon_position, None);
    }
    #[test]
    fn offscreen_margin_is_allowed_but_lost_monitor_is_not() {
        assert_eq!(viable_position(WindowPosition {x:-80,y:800},0,0,1920,1080,360,240),
            Some(WindowPosition {x:-80,y:800}));
        assert_eq!(viable_position(WindowPosition {x:3500,y:1800},0,0,1920,1080,360,240),None);
    }
    #[test]
    fn serialization_roundtrips() {
        let p = UserPrefs {audio_enabled:false,icon_enabled:true,onboarding_done:true,
            cannon_position:Some(WindowPosition{x:21,y:44})};
        let q: UserPrefs = serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert_eq!(p,q);
    }
}
