import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const overlay=read('../web/js/overlay.mjs');
const illusion=read('../web/js/icon-interaction/illusion.mjs');
const bridge=read('../web/js/bridge.mjs');
const rust=read('../src-tauri/src/lib.rs');
test('图标采样和图片解码在开关预热阶段执行，不在碰撞回调执行',()=>{
 assert.match(overlay,/async function prepareVisualCache/);
 assert.match(overlay,/getIconVisualSamples\(\)/);
 assert.match(overlay,/onHit\(\{token,hitX:x,hitY:y,velocityX,velocityY,physicalRect:icon\?\.physicalRect\}\)/);
 assert.doesNotMatch(illusion,/async onHit/);
 assert.match(bridge,/invoke\('icon_visual_samples'\)/);
 assert.match(rust,/async fn icon_visual_samples/);
 assert.doesNotMatch(rust,/icon_visual_sample\(token/);
});
