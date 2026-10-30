# V0.5 Windows Shell 只读接口实现记录

## 当前状态

**POC，尚未在 Windows 编译及测量**。`src-tauri/src/desktop_icon_probe.cpp` 使用官方 COM 查询桌面文件夹视图；C++ 由 `build.rs` 通过 `cc` 在 Windows 构建时编译。Rust `src-tauri/src/icon_interaction.rs` 在独立 STA 线程初始化/释放 COM，使用纯数值快照跨线程传递，未缓存或跨线程传递 Shell 接口指针。

## 调用链与数据

- `CoCreateInstance(CLSID_ShellWindows)` → `IShellWindows::FindWindowSW(CSIDL_DESKTOP, SWC_DESKTOP, SWFO_NEEDDISPATCH)` → `IServiceProvider::QueryService(SID_STopLevelBrowser)` → `IShellBrowser::QueryActiveShellView()` → `IFolderView`。
- `IFolderView::Items(SVGIO_ALLVIEW)` + `GetItemPosition()` 遍历图标位置；`GetSpacing()` 给**网格候选尺寸**。`IShellView::GetWindow()` + `ClientToScreen()` 把视图点临时映射为物理屏幕坐标。
- 返回 `token: cell:序号`、物理像素网格候选区域、`canAnimate:false`，**不读取路径/名称/图标图像，不修改真实布局**。Token 在新快照后不保证身份不变。
- `GetForegroundWindow/GetClassNameW` 对桌面前台做保守过滤；有普通应用窗口位于前台时禁用命中。
- Shell 视图 HWND 改变则递增 `explorerEpoch`，通知 JS 丢弃旧映射；但 HWND 复用、DPI 多显示器和 Shell 视图偏移仍待 Windows 测量。

## 不确定性/禁止越权升级

`GetSpacing()` **不是**图像+标签的精确矩形。`ClientToScreen` 是否与该 Windows 版本的实际绘制图标吻合，必须通过带标尺截图验证。此版本只可显示候选绿色调试框与火星，不可据此遮挡、复制或飞散图标。严格要求 M3 验收之后才能升级为真正幻象。

Windows 提供参考：

- <https://devblogs.microsoft.com/oldnewthing/20130318-00/?p=4933/>
- <https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifolderview-getitemposition>
- <https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-ifolderview>

## 二进制和性能

Windows 目标需 MSVC C++ build tools；`cc` crate 只在 Windows target 构建 C++ 模块。Shell 枚举只在用户从托盘打开实验开关后执行，约每 4 秒刷新一次，`icon_snapshot` Rust 命令使用 `spawn_blocking`，不进入每帧物理循环。无持续截图、无磁盘缓存、无额外 WebView。

若 MSVC 编译失败，请优先保存完整编译日志，不应在未经测量时把字段坐标转换硬编码成固定偏移。功能关闭不会创建 Shell COM 工作线程。
