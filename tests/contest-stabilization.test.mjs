import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describeIconProblem,describeIconReady} from '../web/js/icon-status.mjs';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rust=read('src-tauri/src/lib.rs');
const prefs=read('src-tauri/src/preferences.rs');
const bridge=read('web/js/bridge.mjs');
const cannon=read('web/js/cannon.mjs');
const overlay=read('web/overlay.html');
const preview=read('web/preview.html');

test('fresh install requires an explicit opt-in to touch icon visual effects',()=>{
  assert.match(prefs,/icon_enabled:\s*false/);
  assert.match(prefs,/onboarding_done:\s*false/);
  assert.match(rust,/set_icon_interaction/);
  assert.match(bridge,/core\.invoke\('set_icon_interaction'/);
  assert.match(cannon,/introEnable\?\.addEventListener\('click'/);
  assert.match(cannon,/setIconInteraction\(Boolean\(desired\)\)/);
  assert.match(read('web/cannon.html'),/不会移动|不动真实文件/);
});

test('native settings persist position using a single debounced worker and restore safely',()=>{
  assert.match(rust,/app_config_dir\(\)/);
  assert.match(rust,/viable_position\(/);
  assert.match(rust,/std::sync::mpsc::channel/);
  assert.match(rust,/recv_timeout\(Duration::from_millis\(650\)\)/);
  assert.match(prefs,/fn save\(/);
  assert.match(prefs,/std::fs::rename/);
  assert.match(rust,/cannon\.set_position\(PhysicalPosition::new\(cannon_px,\s*cannon_py\)\)/);
  assert.match(rust,/reset_cannon_position/);
});

test('audio and icon state are restored via native settings, not independent UI flags',()=>{
  assert.match(rust,/cannon:audio-changed/);
  assert.match(rust,/icon:interaction-changed/);
  assert.match(bridge,/get_app_settings/);
  assert.match(cannon,/setSoundEnabled\(prefs\.audioEnabled\)/);
  assert.match(rust,/ICON_INTERACTION\.store\(saved\.icon_enabled/);
});

test('legacy build badges do not leak into public UI',()=>{
  assert.doesNotMatch(overlay,/V0\.6\.[0-9]+/);
  assert.doesNotMatch(preview,/V0\.6\.[0-9]+/);
  assert.match(preview,/APP_VERSION/);
});

test('native error reasons are translated and safe fallback stays honest',()=>{
  assert.match(describeIconProblem('UNSUPPORTED_WALLPAPER_MODE:3'),/壁纸模式/);
  assert.match(describeIconProblem('DESKTOP_NOT_FOREGROUND'),/桌面未处于/);
  assert.match(describeIconProblem('NO_VALID_ICON_SAMPLES'),/火星/);
  assert.match(describeIconProblem('IFolderView unavailable'),/Explorer/);
  assert.match(describeIconReady(8,12),/8\/12/);
  assert.match(describeIconReady(10),/不会移动或删除/);
});
