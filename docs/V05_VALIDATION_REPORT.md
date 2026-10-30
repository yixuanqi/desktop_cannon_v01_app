# Desktop Cannon V0.5 开发与验证报告

**版本：0.5.0-icon-hit-poc — 2026-10-29**

## 验证摘要

| 项目 | 状态 | 说明 |
|---|---|---|
| V0.4.1 原版美术/17 张网格帧 | PASS (static) | 未更改素材；原画校验脚本通过 |
| JS 单元/集成回归 | PASS (Linux Node) | 37 / 37，通过 `npm test` |
| 高速 swept 碰撞、擦边、最近目标 | PASS (unit) | 新增纯 JS tests |
| JS 固定物理步长 observer 等价性 | PASS (unit) | 带/不带图标检测，炮弹结果相同 |
| 原生接口只读静态检查 | PASS (static) | 不调用写图标位置的 API；不是编译证明 |
| 新 JS 与 HTML 静态服务 | PASS (HTTP) | 实际存在的 HTML/JS/mesh 图片路径返回 HTTP 200 |
| Chromium E2E | BLOCKED | 浏览器页面访问受管理员策略限制，ERR_BLOCKED_BY_ADMINISTRATOR |
| Rust + C++ Windows 编译 | UNVERIFIED | 当前环境 Linux，且无 cargo/rustc 与 Windows SDK |
| Win11 Explorer 图标网格坐标误差 | UNVERIFIED | 需用户 Windows 机器实测 |
| 图标真实图像/标签提取 | NOT IMPLEMENTED | M1 后续项，不能宣称识别完整图标 |
| Windows 真实炮弹命中实测 | UNVERIFIED | 需用户 Windows 机器录屏 |
| M3 原位视觉遮挡 | BLOCKED | 未通过 Windows 验证，不能启用 |
| M4 飞散/弹跳/回位 | NOT IMPLEMENTED | 遵守 M3 gate；不输出双图标假动画 |

## 设计边界

- 托盘开关默认关闭；关闭后不调用 Windows Shell 探测。
- 探测仅向 JS 提供**网格候选区域**；没有文件路径、文件读写、图标移位功能。
- 现阶段用候选网格作额外命中火星，不修改真实炮弹反弹算法。
- Browser preview 有模拟图标按钮，用于纯逻辑调试，**不能替代 Windows Explorer 验收**。
- 本版本未增加贴图特效资源，也未修改炮身、30°–38° 动画或弹道预测逻辑。

## 下一关任务

1. 在 Windows 11 真机执行 `Windows验证V05.bat`，修复实际 C++/Rust 编译问题。
2. 启动、开启调试框，对照截图测量候选区域的坐标误差与 UIA 边界。
3. 补完整图标图片/标签矩形识别和缩略图缓存（每个新的 Shell 函数都要单独验证）。
4. 进行 `M3 GATE-MASK`：静态壁纸背景/标签/窗口前景验证通过，才可实现单图标飞散。

本次结果不能解释为“Windows 图标互动已全部完成”。
