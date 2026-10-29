# V0.2-B 开发与回归记录（2026-10-29）

## 改造要点

1. 保留已验证的 V0.1.1 原始素材，不调用生成式图片重新画炮。地面/炮架静止、炮管可旋转：`web/cannon.html`, `web/cannon.css`, `web/assets/layers/`。
2. 修正 V0.2-A 的静止零散叶片，将右侧炮尾周围的零星像素归入炮管层；`scripts/split_layers.py` 可重建。新增 `receiver_underlay.png`，仅从原图遮挡位置取像素，不在默认姿态改变可见设计。
3. 二维输入：`web/js/aim.mjs` 以 Δx 控制蓄力，以 Δy 控制仰角，旋转范围 26～42°、默认 34°。
4. 统一局部坐标：`.barrel-pivot` 与 `.lever-axis` 都围绕原图 (280,216) 的固定轴转动；炮管、弹簧、拉柄一起俯仰；`web/js/geometry.mjs` 旋转炮口坐标后换算屏幕位置。
5. `web/js/trajectory.mjs` 使用与正式炮弹完全相同的 `stepProjectile` 积分方法求预测轨迹，在 overlay Canvas 绘制弹道点，撞击后不继续绘制；预测层不会拦截鼠标。
6. Esc 取消拉闩，清除预测并恢复拉动前的角度；成功发射后保留角度供连续瞄准。

## 已有自动化验证（PASS）

- `node --test tests/*.test.mjs` ：20/20，全通过。
- `python scripts/split_layers.py` 和 `python scripts/validate_layers.py`：原版所有可见 RGBA 像素差异为 0，Alpha 逐像素一致；重新合成含遮挡补层后保持零姿态金标。
- `docs/v02_pitch_reference.png`：26/34/42° 三种组合姿态的本地程序绘图诊断，仅供美术审核，**不代表 Windows 实际渲染**。
- 发现并纠正一处初版旋转符号错误：CSS 屏幕 Y 轴朝下，炮口指向左侧，向下拖炮尾需要 `rotate(+pitchDelta)` 才能抬高左侧炮口；对应炮弹 vy 仍为负（向上）。

## 未完成与风险

- Rust/Cargo 和 Windows WebView2 真实编译 / 前台透明窗 / DPI / 全屏置顶：本环境不能执行。
- Playwright UI：Chromium 安全策略拦截 localhost（`ERR_BLOCKED_BY_ADMINISTRATOR`），没有实际浏览器行为通过结论。
- 左上炮管的下缘以及炮尾连接处仍有少量遮挡缝风险；后续若扩展到大于 26～42°，须对隐藏面作手工补绘，严禁重画整门炮。
- 全屏透明层传递鼠标事件依赖 Tauri/Windows 实机行为；小炮本体透明矩形依然可能拦住少量背景点击。

## 实机验收建议

1. 默认启动静态外观对比 V0.1.1，黄铜、叶片、兔轮大小与配色不变，草地不跟炮管动。
2. 轻拉右/上、右/下：拉柄、弹簧与炮尾不断开，仰角读数/旋转方向一致，拖动轨迹在炮口朝向上方。
3. 拉柄越过右侧后继续拖（不裁切）、松开按当前角度发射；炮口与炮弹起点吻合。
4. Esc 取消，角度恢复、轨迹消失、不误发射；再按住炮身能移动整个窗口。
5. Edge / 文件管理器 / 其他窗口上方可见弹道与炮弹，不抢鼠标；右下角靠近屏幕边界正常。
6. 对比系统 DPI 100/125/150%，画面透明边缘、点击区域和发射坐标准确。
