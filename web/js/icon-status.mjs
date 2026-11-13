/** User-friendly, safe fallbacks for native icon sampling errors. */
export function describeIconProblem(error) {
  const code=String(error??'').toUpperCase();
  if(/UNSUPPORTED_WALLPAPER_MODE|WALLPAPER_INFO/.test(code))
    return '当前壁纸模式暂不支持图标飞散，可继续使用普通炮弹；请尝试静态“填充”或“拉伸”壁纸';
  if(/DESKTOP_NOT_FOREGROUND/.test(code))
    return '桌面未处于可安全交互状态：请返回桌面后重新尝试';
  if(/NO_VALID_PREWARMED_ICON_IMAGES|NO_VALID_ICON_SAMPLES|ICON_SAMPLE_INVALID|ICON_IMAGE_MISSING/.test(code))
    return '已检测到图标，但无法安全生成完整飞散贴图；本次仅显示命中火星';
  if(/ICON_CACHE_STALE|SNAPSHOT_MISMATCH|VISUAL-SNAPSHOT-MISMATCH/.test(code))
    return '桌面图标已变化，正在刷新缓存；暂时仅显示火星';
  if(/MONITOR_UNAVAILABLE|INVALID_DPI|OVERLAY_UNAVAILABLE|CANNON_UNAVAILABLE/.test(code))
    return '桌面显示环境尚未就绪，请检查分辨率或重新显示小炮';
  if(/IFOLDERVIEW|SHELL|EXPLORER|PROBE-ERROR/.test(code))
    return '无法读取 Windows 桌面图标，请确认 Explorer 正常运行';
  if(/WALLPAPER_|BORDER_MISMATCH|BACKGROUND/.test(code))
    return '无法安全还原图标背景，已自动禁用视觉飞散以避免桌面残影';
  return '图标飞散暂不可用，本次仍能发射普通炮弹';
}
export function describeIconReady(count,total=count) {
  const valid=Math.max(0,Number(count)||0);
  const all=Math.max(valid,Number(total)||0);
  if(valid===0)return '尚无可互动图标，仍可以正常发射炮弹';
  if(all>valid)return `图标互动已就绪：${valid}/${all} 个可飞散，其他图标仍可显示碰撞火星`;
  return `图标互动已就绪：${valid} 个图标可飞散，不会移动或删除真实文件`;
}
