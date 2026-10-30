import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const cpp=fs.readFileSync(new URL('../src-tauri/src/desktop_icon_probe.cpp',import.meta.url),'utf8');
const rust=fs.readFileSync(new URL('../src-tauri/src/icon_interaction.rs',import.meta.url),'utf8');
test('Windows provider uses supported read-only COM enumeration (static audit)',()=>{
 assert.match(cpp,/FindWindowSW/);assert.match(cpp,/GetItemPosition/);
 assert.match(cpp,/ClientToScreen/);assert.match(cpp,/CoTaskMemFree/);
 for(const forbidden of ['SelectAndPositionItems','SetItemPosition','LVM_SETITEMPOSITION','DeleteFileW','MoveFileW']) {
   assert.ok(!cpp.includes(forbidden),`forbidden write call: ${forbidden}`);
 }
 assert.ok(!rust.includes('can_animate'));
 assert.match(rust,/GetItemPosition/);
 assert.match(cpp,/GetCurrentProcessId\(\)/);
 assert.match(cpp,/Shell_TrayWnd/);
 assert.match(cpp,/Shell_SecondaryTrayWnd/);
 assert.match(cpp,/return 0;\s*\}/);

});
