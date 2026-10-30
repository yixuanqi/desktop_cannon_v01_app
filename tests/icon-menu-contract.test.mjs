import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rust=fs.readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
const capability=JSON.parse(fs.readFileSync(new URL('../src-tauri/capabilities/main.json',import.meta.url),'utf8'));
test('托盘只暴露一个桌面图标物理互动开关，不再暴露旧诊断菜单',()=>{
 assert.match(rust,/"icon_interaction"/);
 assert.match(rust,/桌面图标物理互动：开启（默认关闭）/);
 for(const old of ['"icon_probe"','"icon_debug"','"diagnostics"','图标命中实验：','显示图标检测框（调试）','打开独立诊断窗口'])assert.ok(!rust.includes(old),`旧菜单残留: ${old}`);
 assert.ok(!rust.includes('WebviewUrl::App("diagnostics.html"'));
 assert.match(rust,/Menu::with_items\(app, &\[&visibility, &mute, &interaction, &quit\]\)/);
 assert.deepEqual(capability.windows,['cannon','overlay']);
});
