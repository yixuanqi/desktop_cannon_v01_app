# V0.5.3 · 独立诊断窗口与 M1/M2 技术验证

## 为什么需要这一版

在 V0.5.1 与 V0.5.2 的 Windows 实机截图中，用户没有看到左上角诊断文本或绿色候选框。
前两版将调试 UI 放在全屏透明 overlay 的 HTML 中，同时受托盘开关、前端加载与事件同步控制。
因此**截图无法区分**：旧版仍在运行、托盘开关未生效、JavaScript 未加载、原生 Shell 调用失败或渲染层没有出现。

当前没有足够实机数据证明唯一根因。V0.5.3 不再声称已经修复了 Explorer 图标识别；它修复的是可观测性和诊断路径。

## 设计更改

1. 原生 Rust 在 `setup` 阶段预创建一个新的、非透明、有标题栏的 `diagnostics` WebView2，默认隐藏，始终置顶。托盘回调只执行 `show()`/`set_focus()`；窗口关闭事件转为隐藏。避免同步托盘回调创建 WebView2 的 Windows 死锁风险。
2. 托盘新增 **`V0.5.3 · 打开独立诊断窗口`**。如果看不到这项菜单，运行的不是这版源代码对应的程序。
3. 独立 `web/diagnostics.html` 的标题、版本号、错误占位文本是静态 HTML。即使 JS 未启动，窗口也应有可见内容。
4. 前端直接 `invoke('icon_diagnostics')`。该 Rust 命令返回**原生真实开关**、两个窗口可见性、特效窗口原生位置/尺寸、Shell 枚举图标数、前台过滤标记，以及前 5 个匿名坐标样本或者 COM 错误代码。
5. `icon_diagnostics` 是只读命令，用户点击诊断时不需要开启图标命中实验，也不获取文件内容，不修改 Explorer 桌面图标位置。
6. 不修改任何炮管素材、网格动画、拉闩、炮弹与物理逻辑。

## Windows 用户验证顺序

- 完全退出之前的桌面小炮进程，解压新的 V0.5.3 工程。
- 运行 `Windows开发启动.bat`。**不要直接打开旧版本的 exe**。
- 右键系统托盘，检查是否有 `V0.5.3 · 打开独立诊断窗口`。
- 点击后应出现有标题栏、深色背景的独立窗口，其上方显示 `V0.5.3-DIAG-INDEPENDENT-WINDOW`。
- 点击“重新读取 Shell 坐标（只读）”。窗口会显示 `Shell 枚举: 成功（N 个图标）` 或失败原因。
- 不需先开启“图标命中实验”，也无需发射炮弹，即可判断 M1 的最基本原生调用是否有效。
- 若 Shell 成功且候选数量大于 0，再在托盘启用“图标命中实验”和“显示图标检测框”，进入下一步 M2 碰撞坐标校准。当前可见的 green box 仍只表示粗略网格，不能代表最终图像和文字的像素边界。

## 如何解读结果

| 诊断结果 | 下一步 |
| --- | --- |
| 托盘没有 V0.5.3 菜单 | 旧版进程 / 旧工程路径，需要先排除版本问题 |
| 新诊断窗口打不开 | 先检查 Tauri 原生 WebView2/窗口创建，不继续图标碰撞开发 |
| 独立窗口静态标题显示但显示“无 Tauri 桥接” | 检查 `withGlobalTauri`、capabilities 与 WebView2 页面加载 |
| Shell 枚举失败并返回 HRESULT | 针对准确错误码检查 Shell COM 初始化或 Explorer 桌面视图 |
| Shell 原始数大于 0，前台标记不允许 | 检查前台过滤策略，不能把图标数当成空列表 |
| Shell 原始数大于 0，但候选框偏移 | 检查物理像素、DPI、屏幕原点、GetItemPosition 所属的 view client 坐标 |
| Shell 原始数与坐标正常，仍无命中 | 再调试炮弹轨迹坐标与扫掠碰撞 |

## 关键限制

- 此版本依然**没有实现图标打散、遮挡和自动回位**。M3 原位遮挡仍未验证，不能宣称已有图标互动成品。
- 48 项 JavaScript 自动化测试通过；Rust/Windows 原生编译、WebView2 显示和 Shell COM 实机结果**当前环境不能验证**。
- 诊断新窗口只有在点击托盘菜单时才显示，正常运行时不会占用桌面空间；隐藏状态的 WebView2 仍可能占少量内存，本版属于临时验证工具，后续可移除。

## 代码位置

- `src-tauri/src/lib.rs`: `icon_diagnostics` 命令、独立窗口与托盘菜单。
- `src-tauri/src/icon_interaction.rs`: 只读 Shell 数据结构及 Windows FFI。
- `web/diagnostics.html`: 独立窗口界面，不依赖 Canvas。
- `web/js/icon-interaction/native-diagnostics.mjs`: 状态和匿名坐标格式化。
- `tests/icon-native-diagnostics-window.test.mjs`: 模拟数据和静态路由校验。
