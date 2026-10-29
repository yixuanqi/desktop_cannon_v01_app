import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const text=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const pngDimension=(file)=>{const b=readFileSync(file);assert.equal(b.subarray(1,4).toString(),'PNG');return [b.readUInt32BE(16),b.readUInt32BE(20)];};
test('V0.4 原版图整图网格变形，不再裁开炮管和木轮',()=>{
 const html=text('../web/cannon.html'),css=text('../web/cannon.css');
 assert.match(html,/id="mesh-frame"/);
 assert.match(html,/pitch_08\.png/);
 assert.doesNotMatch(html,/layers\/(ground|barrel|chassis|front_underlay)\.png/);
 assert.doesNotMatch(css,/\.barrel-pivot/);
 assert.match(css,/\.lever-axis/);
});
test('17 个实际 RGBA 图像存在，尺寸统一，帧索引正确',()=>{
 const index=JSON.parse(text('../web/assets/mesh/frames/index.json'));
 const rig=JSON.parse(text('../web/assets/mesh/mesh_rig.json'));
 assert.equal(index.frames.length,17);
 assert.deepEqual(rig.canvas,[480,350]);
 for(let i=0;i<17;i++){
  assert.equal(index.frames[i].angle,30+i*.5);
  const path=new URL(`../web/assets/mesh/frames/pitch_${String(i).padStart(2,'0')}.png`,import.meta.url);
  assert.ok(existsSync(path));
  assert.deepEqual(pngDimension(path),[480,350]);
 }
});
