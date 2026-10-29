# V0.1.1 修复回归（2026-10-29）

- 现场问题：炮闩拉伸后与炮尾脱节，且比例过大；左键按住炮身无法移动窗口。
- 代码修复：`web/cannon.html`、`web/cannon.css`、`web/js/cannon.mjs`、`web/js/window-drag.mjs`、`web/js/bridge.mjs`、`src-tauri/src/lib.rs`、`src-tauri/capabilities/main.json`。
- 自动化：`npm test` 共 13/13 PASS（新增浏览器预览移动和移位发射单测；原生拖动权限和 API 调用被 Node mock 验证）。
- 静态资源：无新图片，重用了 `cannon_base.png`、`part_bolt_knob.png`、`part_spring.png`。
- **NOT RUN**：真正 Windows 的拖动、WebView2 鼠标穿透、Rust 生成和安装包构建；当前运行容器仍为 Linux 且无 Rust/Cargo，浏览器受 URLBlocklist 限制。
- 需要 Windows 实机复测：左键拖动炮身移动、拉柄 0/50/100% 状态下弹簧不脱节、松手回弹、移动后再发射坐标正确、125%/150% DPI、靠近右屏边缘拉柄不裁切。

---

# V0.1 自测验证报告

## 环境
- 日期：2026-10-29
- 当前容器：Linux x86_64，Node 22.16、Python 3.13
- 未安装 Rust/Cargo；npm registry 网络不可访问；无法本地编译 Tauri/Windows installer
- Chromium 策略 `URLBlocklist: ["*"]`，对 `http://127.0.0.1`、`file://` 和 `data:` 导航均返回 `ERR_BLOCKED_BY_ADMINISTRATOR`

## 运行结果
- PASS：`npm test`，11/11，通过（见终端输出）
- PASS：炮闩从按下、向右拖动 84px、事件跨窗口接收到炮弹、Canvas 运行 80 个模拟帧、恢复待机（Node fake DOM 测试）
- PASS：PIL 检查 PNG 解码与 alpha 通道，设计图引用素材存在
- NOT RUN：Windows Tauri `cargo build`, NSIS 安装、真实桌面窗口覆盖、WebView2 鼠标穿透
- BLOCKED：Playwright 浏览器冒烟测试（管理员 Chromium URL 访问策略）

## 核心行为 / 断言
1. 水平反向拖动不蓄力；正向 90px 封顶，低于 8% 不发射。
2. 强蓄力产生更大的初速度，初始方向左上。
3. 重力增大 vy，左墙、顶边和地面碰撞都改变法向速度。
4. 地面碰撞衰减；低速球停止并销毁；75ms 卡顿不产生 NaN。
5. 双窗口坐标映射保持炮口在画布合法位置。
6. 弹药事件在重叠的两个逻辑窗口之间被接收，Canvas 绘制计数持续增长。

## 未证实（不能作为 PASS）
- Windows Win32/WebView2 透明置顶层真实显示效果，鼠标输入穿透在所有 DPI 情况下正确。
- 鼠标拖动超出 Tauri 局部窗口时的 Pointer Capture。
- Rust/Cargo 依赖解析、安装包生成与签名；Windows 托盘事件。

## Windows 下一轮建议
在真实 Windows 11 电脑上先运行 `npm install && npm run dev`。如编译错误先记录完整 Rust error 信息；如炮弹出现但无法点透桌面，优先检查 `overlay.set_ignore_cursor_events(true)` 和置顶窗创建次序；如炮闩拖动出现中断，检查 360px 的互动窗口宽度与 OS 级鼠标捕获。
