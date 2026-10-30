# V0.6.3 自测与未验证事项

- JS 单元/集成测试：63/63 通过（Linux / Node.js 22）
- 原版小炮动画 PNG：17/17 通过，480×350 RGBA，34° 原始像素一致
- JS 语法检查：通过
- 无 V0.6.0 绿色网格诊断绘制代码：通过
- Windows Rust/C++ 编译：**未执行**（当前没有 Windows MSVC/Rust 环境）
- `IFolderView2::GetViewModeAndIconSize` 在用户 Windows 配置下的可用性和实际像素尺寸：**待实机确认**
- Windows 图标精准矩形（UIA）：**本版未实现**；仅依据 Shell 返回尺寸估算图像命中框
- 复杂壁纸的真实图标无痕飞散：**未解决**，WALLPAPER_MISMATCH 时安全降级为即时命中火星

## 注意

用户截图显示 V0.6.0 的绿色整格检测框，但本工程不存在对应绘制代码；请使用启动脚本排查残留 `desktop-cannon.exe`。新单实例插件无法主动关闭历史版本进程，必须先退出旧版。
