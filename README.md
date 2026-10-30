# Desktop Cannon V0.6.5 — 图标飞散贴图完整性修复（实验版）

**本轮只修贴图。** 原先按估算 hitbox 裁桌面截图，造成图标被截半；本版在 Windows Shell 中读取真正的图标/缩略图，修正 Alpha trim 偏移和渲染尺寸。**命中框 ≠ 采集框 ≠ 渲染框**。

- 保留 V0.6.4 的多图标物理、落地停留 5–8 秒，以及原版小炮美术。
- 图标提取失败/壁纸无法可靠还原：只播放火星，不显示残缺图片。
- `Windows验证V065.bat` 用于回归及原生编译；`Windows开发启动.bat` 正常运行。
- `Windows调试图标边界.bat` 仅供开发检查三类框：绿色=碰撞、蓝色=采集、黄色=绘制。
- 技术说明与实机验收：[docs/V065_SPRITE_INTEGRITY.md](docs/V065_SPRITE_INTEGRITY.md)。

---

# Desktop Cannon V0.6.4 — 多图标物理飞散（实验版）

**新增：一颗炮弹可以连续命中多个图标；不同图标可同时飞散，落地稳定后停留 5–8 秒再弹性回位。**

- 修复旧引擎只有一个 `active` 槽位的问题；并发上限 12 个。
- 图标图片独立飞行，截图中的名称文字不再跟随旋转；保留原版小炮的美术、炮闩、弹道。
- 命中火星即时显示。只有已经预热、位置有效、壁纸可还原的图标才产生飞散副本；不移动真实桌面图标。
- 开发/验收详情：[`docs/V064_MULTI_ICON_PHYSICS.md`](docs/V064_MULTI_ICON_PHYSICS.md)。

**运行：** 关闭所有旧进程，执行 `Windows验证V064.bat`，编译通过后再运行 `Windows开发启动.bat`，托盘开启「桌面图标物理互动」。

**合成桌面多图标预览：** 运行 `预览启动.bat`，在浏览器打开 `http://127.0.0.1:1420/icon-illusion-demo.html`，可连续发射观察多对象飞散和落地停留。该网页不是 Windows 实机效果。

**验证边界：** JavaScript 测试在此环境执行；Windows COM/Rust 实机编译、真实图标形状与壁纸遮挡还需 Windows 验收。不能把图标碰撞计数等同于成功飞散数量。

---

# Desktop Cannon V0.6.3 — 命中与版本可靠性实验版

本次不改原版炮身素材及其物理模拟，详细改动请见 `docs/V063_HITBOX_RELIABILITY.md`。

# Desktop Cannon V0.6.2 · 图标缓存自更新实验

V0.6.2 在 V0.6.1 的即时物理飞散基础上增加环境感知缓存生命周期。**本版的 Windows 原生行为仍待实机验收。**

V0.6.1 针对上轮实机反馈做了两项核心修正：

- **不再在炮弹命中后采样图标。** 开启功能时批量采集并预解码图标素材；命中回调只做同步缓存查找，动画从碰撞当帧启动。
- **不再使用缓动曲线假装物理。** 图标副本使用真实的二维运动积分：炮弹冲量、重力、边界反弹、偏心旋转、阻尼弹簧回位。

真实 Explorer 图标位置和文件始终不变。仅当壁纸背景匹配、坐标未变化且桌面状态安全时才显示视觉副本；否则降级为命中火星。

## 使用

1. 先关闭旧版桌面小炮进程。
2. 运行 `Windows验证V064.bat`：执行 JS 全量回归和 Windows `cargo check`。
3. 运行 `Windows开发启动.bat`。
4. 右键托盘，开启唯一的 **「桌面图标物理互动：开启（默认关闭）」**。
5. 等待提示 **「图标素材已预热：N 个」**，再发射炮弹。
6. 再次点击该菜单项即可关闭并清除视觉副本与内存缓存。

浏览器模拟：运行 `预览启动.bat`，打开 `http://127.0.0.1:1420/icon-illusion-demo.html`。模拟页复用正式工程的同一套物理模块，但不读取 Windows 桌面。离线物理过程预览：[`docs/v061_icon_physics_preview.gif`](docs/v061_icon_physics_preview.gif)，它是合成场景，不是 Windows 实机截图。

## 托盘菜单清理

现在只保留四项：

- 显示 / 隐藏小炮
- 音效开 / 关
- 桌面图标物理互动（一个开关，内部自动完成命中检测和素材预热）
- 退出桌面小炮

以下旧调试项已删除：

- 图标命中实验（已合并进物理互动开关）
- 显示图标检测框（调试）
- V0.6 独立诊断窗口

## 当前物理范围

单个图标按炮弹速度获得初始冲量；偏心命中产生角速度；受重力影响并与屏幕边界/任务栏上沿反弹；约 0.92 秒后进入阻尼弹簧回位，最长 3.8 秒。**尚未实现多个图标之间的互相碰撞和连锁打散。**

## 限制与安全

- 只支持主显示器、静态壁纸 Stretch/Fill 模式。
- 不修改 Explorer 图标位置，不操作实际文件。
- 图标视觉素材仅在内存中预热，不写磁盘。
- 壁纸匹配失败、缓存过期、前台窗口变化或鼠标进入原图标区域时取消视觉副本，只保留命中火星。
- 关闭开关或隐藏小炮时立即清除动画和缓存。

详细实现与验收见 [`docs/ICON_PHYSICS_V061.md`](docs/ICON_PHYSICS_V061.md)，变更摘要见 [`docs/CHANGELOG_V061.md`](docs/CHANGELOG_V061.md)。

本轮自动化结果：**50/50 JavaScript 测试通过**；17 张炮身网格帧验证通过。原生 Windows 构建与实机画面仍待 Windows 验收，详见 [`docs/V061_VALIDATION_REPORT.md`](docs/V061_VALIDATION_REPORT.md)。

## 测试与开发

```powershell
npm test
python scripts/validate_mesh.py
Windows验证V064.bat
Windows开发启动.bat
```

当前开发容器无 Windows Rust/MSVC 工具链；JS 自动化测试可在此运行，Windows 原生编译、壁纸匹配、真实遮罩与 WebView2 动画仍需用户实机验收。

## 原版小炮稳定基线

V0.4.1 原版美术、17 张 30°～38° 局部网格帧、二维拉闩和弹道对齐保持不变。相关技术文档：

- [`docs/LOCAL_MESH_WARP.md`](docs/LOCAL_MESH_WARP.md)：可复用局部网格变形技术。
- [`docs/TRAJECTORY_ALIGNMENT_V041.md`](docs/TRAJECTORY_ALIGNMENT_V041.md)：预测弹道与真实弹丸固定步长对齐。
- [`docs/ICON_PHYSICS_V061.md`](docs/ICON_PHYSICS_V061.md)：图标物理互动实现、约束与验收。

V0.5 诊断历史文档已归档到 `docs/archive/v05-debug/`，不再对应当前托盘菜单。


## V0.6.2 桌面缓存自动失效

- 位置/网格变化每约 4 秒探测，真实窗口大小和 DPI 事件优先、2 秒环境轮询兜底；静态壁纸路径/模式/文件版本变化自动重建缓存。
- 旧异步图标截图/图片解码会在环境变化后被代次阻断，飞散中的原位遮罩立即撤销。
- 详见 [`docs/CACHE_LIFECYCLE_V062.md`](docs/CACHE_LIFECYCLE_V062.md)。
- 执行 `Windows验证V064.bat`，随后在 Windows 上做分辨率、壁纸、Explorer 重启及图标移动实测。
