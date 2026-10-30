/** Read-only probe result formatter; safe to reuse in CLI/tests. */
export function formatNativeDiagnostics(d) {
  if (!d || typeof d !== 'object') return '诊断数据为空';
  const lines = [
    `版本: ${d.build ?? '未知'}`,
    `进程 PID: ${d.pid ?? '?'}`,
    `图标命中开关: ${d.featureEnabled ? '已开启' : '关闭'}`,
    `图标检测框开关: ${d.debugEnabled ? '已开启' : '关闭'}`,
    `单图标飞散实验: ${d.illusionEnabled ? '已开启（实验性）' : '关闭'}`,
    `最近视觉取样: ${d.illusionLastResult || '尚无记录'}`,
    `炮身窗口: ${d.cannonVisible === true ? '显示' : d.cannonVisible === false ? '隐藏' : '未知'}`,
    `特效窗口: ${d.overlayVisible === true ? '显示' : d.overlayVisible === false ? '隐藏' : '未知'}`,
    `特效窗口坐标: ${d.overlayPhysicalOrigin ? `${d.overlayPhysicalOrigin.x},${d.overlayPhysicalOrigin.y}` : '不可用'}`,
    `特效窗口大小: ${d.overlayPhysicalSize ? `${d.overlayPhysicalSize.w}×${d.overlayPhysicalSize.h}` : '不可用'}`,
  ];
  if (d.shell?.ok) {
    lines.push(`Shell 枚举: 成功（${d.shell.rawCount ?? 0} 个图标）`);
    lines.push(`前台安全标记: ${d.shell.desktopForeground ? '允许' : '不允许（将导致命中候选为空）'}`);
    lines.push(`坐标体系: ${d.shell.coordinateSystem ?? '未知'}`);
    for (const cell of d.shell.sampleCells ?? []) {
      lines.push(`样本 ${cell.token}: (${cell.screenX},${cell.screenY}) / ${cell.cellWidth}×${cell.cellHeight}`);
    }
  } else {
    lines.push(`Shell 枚举: 失败 - ${d.shell?.error ?? '未知错误'}`);
  }
  lines.push('安全模式：只读图标坐标；飞散只改变内存中的视觉副本，绝不移动或删除真实图标。');
  return lines.join('\n');
}
