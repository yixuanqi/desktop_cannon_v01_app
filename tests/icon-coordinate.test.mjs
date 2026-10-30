import test from 'node:test';import assert from 'node:assert/strict';
import {screenToOverlay,snapshotToCandidates,iconImageRegion} from '../web/js/icon-interaction/coordinates.mjs';
const layout={overlayPhysicalX:-1920,overlayPhysicalY:-100,scaleFactor:1.5,screenWidth:1280,screenHeight:720,taskbarTop:680};
const cell={token:'a',screenX:-1770,screenY:50,cellWidth:90,cellHeight:120,imageSize:48};
const snap={desktopForeground:true,capturedAtMs:10000,icons:[cell]};
test('negative screen origin + 150% dpi and derived image hitbox, not entire grid',()=>{
 assert.deepEqual(screenToOverlay({x:-1770,y:50},layout),{x:100,y:100});
 const physical=iconImageRegion(cell);assert.deepEqual(physical,{x:-1752,y:63,width:54,height:54,source:'shell-size-estimate'});
 const candidates=snapshotToCandidates(snap,layout,11000);
 assert.deepEqual(candidates,[{token:'a',rect:{x:112,y:163/1.5,width:36,height:36},geometrySource:'shell-size-estimate',
   physicalRect:{screenX:-1770,screenY:50,width:90,height:120}}]);
});
test('foreground other app does not globally erase icon candidates, but snapshot expiration does',()=>{
 assert.equal(snapshotToCandidates({...snap,desktopForeground:false},layout,11000).length,1);
 assert.deepEqual(snapshotToCandidates(snap,layout,19000),[]);
 assert.deepEqual(snapshotToCandidates(snap,{...layout,scaleFactor:0},11000),[]);
 assert.deepEqual(snapshotToCandidates({...snap,icons:[{...cell,screenY:1000}]},layout,11000),[]);
});
test('spacing-only fallback is explicitly estimated and smaller than full grid',()=>{
 const r=iconImageRegion({...cell,imageSize:0});
 assert.equal(r.source,'spacing-fallback-estimate');assert.ok(r.width<cell.cellWidth);assert.ok(r.height<cell.cellHeight);
});
