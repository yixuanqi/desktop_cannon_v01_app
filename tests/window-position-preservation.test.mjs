import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression for the real Windows behavior: enabling desktop icon physics
// schedules icon_environment() every 2 seconds. Its layout read must NOT
// silently undo native dragging beyond the transparent webview's work-area
// bounds (e.g. placing the visible cannon flush with the bottom-left edge).
const lib=readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../web/js/overlay.mjs',import.meta.url),'utf8');
// Stop at the next function, independent of Windows CRLF vs Unix LF.
const section=lib.slice(lib.indexOf('fn fresh_layout('),lib.indexOf('async fn icon_environment('));

test('periodic icon environment refresh reads layout without relocating cannon',()=>{
  assert.ok(section.startsWith('fn fresh_layout('));
  assert.match(lib,/async fn icon_environment\([^]*?let layout=fresh_layout\(&app\)/);
  assert.match(overlay,/environmentTimer=next\?setInterval\(\(\)=>\{void reconcileEnvironment\('periodic'\);\},2000\)/);
  assert.doesNotMatch(section,/cannon\.set_position\s*\(/,'do not move a user-dragged cannon while refreshing');
  assert.doesNotMatch(section,/pos\.[xy]\.clamp\(/,'the transparent webview may extend beyond work_area');
  assert.match(section,/cannon_x:\s*\(pos\.x-origin\.x\)/);
  assert.match(section,/cannon_y:\s*\(pos\.y-origin\.y\)/);
});

test('DPI resizing and click-through overlay safety are preserved',()=>{
  assert.match(section,/cannon\.set_size\(expected_size\)/);
  assert.match(section,/overlay\.set_size\(PhysicalSize::new\(display\.width,display\.height\)\)/);
  assert.match(lib,/overlay\.set_ignore_cursor_events\(true\)/);
  assert.match(lib,/cannon\.set_position\(PhysicalPosition::new\(cannon_px,\s*cannon_py\)\)/);
});
