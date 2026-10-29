# 桌面小炮 Desktop Cannon V0.1.1

奶油金短胖炮管、绿色小芽、兔子木轮和红色炮闩。鼠标把红色球柄**向右拖动**，松开后炮弹从右下角向左上方飞出，在 Windows 普通窗口上方飞行，并在屏幕边缘反弹。

## V0.1.1 操作修复（2026-10-29）

这一版修复了使用者报告的两个问题：

1. **炮闩比例和拖动连接**：不再让一个放大变形的红球脱离炮尾。现在红球素材按炮身绘制比例缩放；外面保留 65×40 CSS px 的透明点击热区。固定在炮尾的弹簧与红球位移同步拉长，最长 90 CSS px，发射松手后归位；发射后坐时整体骨骼统一运动。
2. **左键拖动炮身移动窗口**：按住炮身（不要按红球）即可移动整个小炮。Tauri 版调用系统窗口拖动（需 `core:window:allow-start-dragging`）；浏览器预览版移动模拟桌面的 iframe。发射前重新读取真实窗口位置，保证移动后炮口坐标正确。

**操作区别**：左键按住**炮身/木轮** → 移动位置；左键按住**红色球形炮闩** → 向右蓄力、松手发射。右键不拖动。初始只保证主显示器，并继续使用 360×240 CSS px 交互窗口。

修复回归测试：`npm test`，13 项通过（纯函数、真实指针事件模拟、浏览器预览移动、移动后的发射坐标）。当前 Linux 环境不能编译 Windows EXE；请在 Windows 11 上执行下面的真实桌面验收。

> **工程交付性质：可运行源码 + 浏览器交互预览 + 自动化单测。**
> 本制作环境是没有 Rust/Cargo 的 Linux，且 Chromium 被管理员策略禁止访问网页，所以**不能声称已成功编译 Windows EXE，也不能声称已验证 Windows 真实置顶/鼠标穿透**。最终实机验收见下文。

## 技术选型

- Windows: **Tauri 2 / Rust / Windows WebView2**。
- 前端: **原生 HTML、CSS、ES Modules、Canvas 2D**。无需框架或云服务；资源均本地。
- 窗口: `overlay` 全主屏透明、置顶、鼠标穿透；`cannon` 局部透明、置顶、接收炮闩拖动。overlay 在创建时保持隐藏，直到 Rust 成功调用 `set_ignore_cursor_events(true)`，降低抢鼠标风险。
- 屏幕坐标: 从主显示器 `position/size/scale_factor/work_area` 计算；炮口坐标经 Rust 返回后统一换到 overlay CSS 坐标。
- 粒子: 仅有活动对象时运行 `requestAnimationFrame`，无炮弹时暂停循环；最多同时保留 12 个炮弹。

## 先试交互（不用 Rust）

前提：**Node.js 20+**。进入根目录：

```powershell
npm run preview
```

打开 `http://127.0.0.1:1420/preview.html`。左键按住炮身移动位置，或按住红色圆球往右拉再松开发射；这是浏览器模拟桌面，**不能代替真实 Windows 跨程序窗口测试**。

## Windows 真实桌面运行

先安装：Node.js 20+、Rust (MSVC toolchain)、Microsoft C++ Build Tools、WebView2。参考 [Tauri 官方 Windows 前置要求](https://v2.tauri.app/start/prerequisites/)。

```powershell
cd desktop_cannon_v01_app
npm install
npm run dev
```

构建 NSIS 安装包：

```powershell
npm run build
```

目标生成路径 `src-tauri/target/release/bundle/nsis/`（实际文件名以 Tauri CLI 输出为准）。

托盘右键菜单：`显示 / 隐藏小炮`、`音效开 / 关`、`退出桌面小炮`。

## 自动化检查

```powershell
npm test
```

当前：13 项 Node 测试通过，含炮闩鼠标事件链、跨窗口发射事件、物理模拟、边界碰撞、关键帧恢复。`npm run test:ui` 为可选 Playwright 真浏览器冒烟测试，需要 Python + playwright + Chromium，**当前环境因管理员 URLBlocklist 阻止浏览器打开页面而未通过**。

## Windows 实机验收清单（未在本环境执行）

- [ ] 启动后只看到右下角小炮，无主窗口/任务栏按钮；托盘图标存在。
- [ ] 把 Edge、记事本、资源管理器摆在桌面上，发射炮弹，确认炮弹覆盖于普通窗口上方。
- [ ] 炮弹飞过时可点击浏览器按钮、拖动文件；透明特效层不拦截鼠标。
- [ ] 拖动炮身和木轮，可整体移动小炮；移动后发射，炮弹从新位置出现。
- [ ] 拖动红色炮闩时，弹簧与红球连续连接，放手后复位；拖动过程中炮身整体位置不变。
- [ ] 把炮闩从 0 拉至 90 px，注意最大蓄力时红色球柄仍不被小炮窗口裁剪。
- [ ] 检查不同力度：低力近距离，高力远距离，屏幕左/上/右边界、任务栏上边缘均能反弹。
- [ ] 连发 12 次、连续运行 10 分钟：无明显闪烁、无失控对象、无内存持续增长。
- [ ] 测试系统缩放 100%、125%、150%，同时检查任务栏位于屏幕底部。
- [ ] 托盘菜单能隐藏/显示、静音/启音并安全退出。
- [ ] 睡眠唤醒、显示器分辨率变更后观察是否需要刷新窗口布局（V0.1 尚未支持热重布局）。

## 当前已知范围

1. **只使用主显示器**，并以任务栏在底部/系统工作区为基准。
2. `overlay` 无输入阻挡，但交互炮本体的小矩形透明窗口区域依然可能捕获桌面点击；需要 Windows 下测试并在后续版本实现更精确的命中区域。
3. Windows 独占全屏游戏、安全桌面（UAC）等不保证被覆盖。
4. 动画使用原型透明 PNG + CSS 骨骼位移，不是逐帧手绘生产素材；部件遮挡边缘可在后续精修。
5. 目前没有多显示器、动态分辨率热适配、安装签名和自启动选项。

## 工程目录

```text
web/
  cannon.html / cannon.css / js/cannon.mjs       # 炮闩、状态、后坐
  overlay.html / js/overlay.mjs                  # 跨窗口画布
  preview.html                                  # 无需 Rust 的视觉预览
  js/physics.mjs, charge.mjs, geometry.mjs      # 可测试的纯函数
  js/bridge.mjs, sound.mjs, particles.mjs       # Tauri/预览事件、音效、特效
  assets/                                       # 已接入透明素材
src-tauri/
  src/lib.rs                                    # 原生窗口、坐标和托盘
  capabilities/main.json                       # 有限 IPC 权限
tests/                                          # Node 单测与事件链测试
scripts/                                        # 无依赖预览服务/可选浏览器 UI 冒烟
 docs/                                          # 设计和关键帧参考
```

## 设计参考

- `docs/bolt_exploded_interaction.png`：炮闩结构与拖动。
- `docs/animation_keyframes.png`：动画关键帧。
- `docs/cannon_animation_preview.gif`：动画参考。

该项目不修改「贴贴」原工程，方便 Agent 独立迭代。
