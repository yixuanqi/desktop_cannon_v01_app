import test from 'node:test';import assert from 'node:assert/strict';
import {segmentRectFirstHit,firstIconHit} from '../web/js/icon-interaction/collision.mjs';
const rect={x:40,y:50,width:30,height:40};
test('高速水平移动不会穿透图标单元',()=>{
 const p=segmentRectFirstHit({x:0,y:70},{x:200,y:70},rect,6);
 assert.ok(p);assert.equal(p.x,34);assert.equal(p.y,70);
});
test('圆形半径擦边命中与擦边之外不命中',()=>{
 assert.ok(segmentRectFirstHit({x:0,y:44},{x:150,y:44},rect,6));
 assert.equal(segmentRectFirstHit({x:0,y:43.99},{x:150,y:43.99},rect,6),null);
});
test('无有效数据、负大小、平行外侧均安全 miss',()=>{
 for(const x of [undefined,Number.NaN])assert.equal(segmentRectFirstHit({x,y:70},{x:80,y:70},rect,4),null);
 assert.equal(segmentRectFirstHit({x:0,y:0},{x:0,y:100},rect,4),null);
 assert.equal(segmentRectFirstHit({x:0,y:70},{x:90,y:70},{...rect,width:-2},4),null);
});
test('多个图标只选最早命中且重复击中有冷却',()=>{
 const icons=[{token:'b',rect:{...rect,x:80}},{token:'a',rect}];
 const p={x:0,y:70},q={x:200,y:70};
 const hit=firstIconHit(p,q,6,icons,{now:1000});assert.equal(hit.token,'a');
 const hit2=firstIconHit(p,q,6,icons,{now:1100,cooldown:new Map([['a',1000]])});assert.equal(hit2.token,'b');
});
