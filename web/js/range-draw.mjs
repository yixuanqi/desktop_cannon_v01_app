/** Lightweight canvas-only hand-drawn practice targets. No DOM overlays. */
export function drawDesktopRange(ctx,range,{now=Date.now()}={}) {
  if(!range.active && (!range.finished || now-range.finishedAt>4600))return;
  const snapshot=range.snapshot();
  ctx.save();
  // A compact, readable scorecard; the entire overlay remains click-through.
  ctx.globalAlpha=.96;
  ctx.fillStyle='#fff4d9';
  ctx.strokeStyle='#ad8959';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(17,19,260,69,14);ctx.fill();ctx.stroke();
  ctx.fillStyle='#75512e';ctx.font='bold 14px "Microsoft YaHei UI",sans-serif';
  ctx.fillText('🎯 虚拟桌面靶场',29,42);
  ctx.font='bold 12px "Microsoft YaHei UI",sans-serif';
  ctx.fillText(range.active?`剩余 ${snapshot.secondsLeft}s   得分 ${snapshot.score}`:`完成！ 得分 ${snapshot.score}`,29,62);
  ctx.font='11px "Microsoft YaHei UI",sans-serif';
  ctx.fillStyle='#8a6a45';
  ctx.fillText(`连击 ×${snapshot.combo}    最佳 ${snapshot.bestScore}`,29,79);

  if(range.active){
    for(const t of range.targets){
      if(!t.active)continue;
      ctx.save();
      ctx.translate(t.x,t.y);
      ctx.fillStyle='#fff3cd';ctx.strokeStyle='#8e6241';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,0,t.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e79a65';ctx.strokeStyle='#9a6344';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,t.radius*.68,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff5dc';ctx.beginPath();ctx.arc(0,0,t.radius*.40,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#74995f';ctx.beginPath();ctx.arc(0,0,t.radius*.19,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  if(range.lastAward && now-range.lastAward.at<1050){
    const life=(now-range.lastAward.at)/1050;
    ctx.globalAlpha=Math.max(0,1-life);
    ctx.fillStyle='#e49347';ctx.font='bold 21px "Microsoft YaHei UI",sans-serif';
    ctx.fillText(`+${range.lastAward.score}`,range.lastAward.x-24,range.lastAward.y-35-life*30);
  }
  ctx.restore();
}
