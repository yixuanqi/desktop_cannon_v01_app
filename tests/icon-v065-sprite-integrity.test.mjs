import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IconIllusion, validateVisualSample} from '../web/js/icon-interaction/illusion.mjs';

const U='data:image/png;base64,cHJldGVuZA==';
const layout={overlayPhysicalX:0,overlayPhysicalY:0,scaleFactor:1,screenWidth:1920,taskbarTop:1040};
const makeSample=(token,x,y,left,top,w,h)=>({
  token,screenX:x,screenY:y,width:95,height:123,
  imageLeft:left,imageTop:top,imageWidth:w,imageHeight:h,
  borderMatch:.99,backgroundDataUrl:U,spriteDataUrl:U,
});
const cases=[
  makeSample('shortcut',100,220,16,6,64,64),
  makeSample('custom-app',250,220,24,10,37,43),
  makeSample('thumbnail',400,220,9,4,78,75),
];
function imageLoader(url){
  // Native sprite extraction/trim determines dimensions; the mock uses a
  // sample-specific loader set per test, not a real Windows Shell extraction.
  return Promise.resolve({kind:url===U?'png':'unknown'});
}
function collector(){
  const ops=[];
  const ctx={
    drawImage:(...args)=>ops.push({type:'draw',args}),
    translate:(...args)=>ops.push({type:'translate',args}),
    strokeRect:(...args)=>ops.push({type:'frame',args}),
    save(){},restore(){},rotate(){},
  };
  return {ctx,ops};
}

test('V0.6.5: hitbox is not the sprite rectangle; three custom icon sizes retain offsets',()=>{
  for(const s of cases){
    const r=validateVisualSample(s,layout),ib=r.iconBounds;
    assert.deepEqual([r.width,r.height],[95,123]); // captureRect, for wallpaper mask
    assert.deepEqual([ib.left,ib.top,ib.right-ib.left,ib.bottom-ib.top],
      [s.imageLeft,s.imageTop,s.imageWidth,s.imageHeight]); // renderRect
  }
});

test('V0.6.5: draw() never stretches a trimmed sprite across an Explorer cell',async()=>{
  const e=new IconIllusion({getLayout:()=>layout,loadImage:imageLoader});
  e.setEnabled(true);assert.equal(await e.prepare(cases),3);
  for(const s of cases)assert.equal(e.onHit({token:s.token}),true);
  const {ctx,ops}=collector();e.draw(ctx);
  const draws=ops.filter(x=>x.type==='draw');
  assert.equal(draws.length,6);
  for(let i=0;i<3;i++){
    assert.deepEqual(draws[i].args.slice(1),[cases[i].screenX,cases[i].screenY,95,123],
      'background remains original full cell');
    const s=cases[i];
    assert.deepEqual(draws[i+3].args.slice(1),[-s.imageWidth/2,-s.imageHeight/2,s.imageWidth,s.imageHeight],
      'render uses source sprite size, not capture size');
  }
  const translations=ops.filter(x=>x.type==='translate');
  assert.deepEqual(translations.map(x=>x.args),cases.map(s=>[
    s.screenX+s.imageLeft+s.imageWidth/2,
    s.screenY+s.imageTop+s.imageHeight/2]));
});

test('V0.6.5: decoded bitmap and trimmed metadata MUST agree or cache refuses the sprite',async()=>{
  const s=cases[1];
  const good=new IconIllusion({getLayout:()=>layout,loadImage:async()=>({naturalWidth:s.imageWidth,naturalHeight:s.imageHeight})});
  good.setEnabled(true);assert.equal(await good.prepare([s]),1);
  const bad=new IconIllusion({getLayout:()=>layout,loadImage:async()=>({naturalWidth:95,naturalHeight:123})});
  bad.setEnabled(true);assert.equal(await bad.prepare([s]),0);
  assert.equal(bad.cacheSize,0);
});

test('V0.6.5: geometry diagnostic draws three independent boxes',async()=>{
  const e=new IconIllusion({getLayout:()=>layout,loadImage:imageLoader});
  e.setEnabled(true);await e.prepare([cases[0]]);e.onHit({token:cases[0].token});
  const {ctx,ops}=collector();
  e.drawDebug(ctx,[{token:'shortcut',rect:{x:121,y:233,width:42,height:42}}]);
  const frames=ops.filter(x=>x.type==='frame');
  assert.equal(frames.length,3);
  assert.deepEqual(frames[0].args,[100,220,95,123]); // blue capture
  assert.deepEqual(frames[1].args,[116,226,64,64]); // yellow image
  assert.deepEqual(frames[2].args,[121,233,42,42]); // green hitbox
});

test('V0.6.5: native extraction uses real Shell item images, not screenshot-cropped icon pixels',()=>{
  const native=fs.readFileSync(new URL('../src-tauri/src/desktop_icon_probe.cpp',import.meta.url),'utf8');
  const rust=fs.readFileSync(new URL('../src-tauri/src/icon_visual.rs',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../web/js/icon-interaction/illusion.mjs',import.meta.url),'utf8');
  assert.match(native,/dc_shell_icon_bgra\(/);
  assert.match(native,/SHCreateItemWithParent/);
  assert.match(native,/GetImage\(/);
  assert.match(rust,/dc_shell_icon_bgra\(x, y, size/);
  assert.match(rust,/alpha_bounds/);
  assert.match(rust,/image_left=\(display_x as u32\)\+tx/);
  assert.doesNotMatch(rust,/if xx<crop_x0/);
  assert.match(js,/a\.x\+ib\.left\+sw\/2/);
  assert.match(js,/SPRITE_DIMENSION_MISMATCH/);
});
