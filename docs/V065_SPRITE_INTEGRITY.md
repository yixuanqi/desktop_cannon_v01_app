# Desktop Cannon V0.6.5 — 桌面图标飞散贴图完整性修复

## 故障根因

V0.6.4 用 Explorer 的 `GetSpacing()` 推算图像所在的正方形，再将桌面截图里正方形以外像素直接设透明，并把边缘再淡出一次。该正方形不是**真实图标可见边界**。自制程序图标、快捷方式箭头和文件缩略图可能超出估算区域，所以发生“图片飞出去只剩半张”。前端还将整个 95×123 图标单元格作为 PNG 的画面大小，造成错误缩放和锚点偏移。

## V0.6.5 三种边界契约

- `hitRect`：用于扫掠圆形碰撞。沿用已有 Shell iconSize 保守估算，**不是**图片截取范围。
- `captureRect`：95×123（以系统实际 spacing 为准）桌面原位背景遮罩和壁纸校验范围。绝不作为飞散 PNG 的源图像。
- `renderRect`：Windows Shell 为该桌面项返回的图标或缩略图 PNG 的**实际 Alpha 像素包围盒**。独立保存 `imageLeft/imageTop/imageWidth/imageHeight`，绝不将 PNG 强拉伸到 captureRect。

### 原生数据路径

1. 单独 STA worker 中使用 `IFolderView/GetItemPosition` 定位桌面项；在该视图中按实际物理屏幕坐标匹配 PIDL。
2. 使用 `IFolderView::GetFolder`、`SHCreateItemWithParent` 和 `IShellItemImageFactory::GetImage` 获得图标/缩略图 HBITMAP（像素仅存内存）。不再对截图执行 `crop_x0` 之类硬裁。
3. RGBA 还原与 Alpha trim：遍历**真实图标 bitmap** 的非透明像素，裁掉透明外边距，同时把 trim 左上角加入 `imageLeft/imageTop`。真实内容不会被裁去。
4. 原位遮罩仍使用壁纸 + 小范围桌面截图校验；`WALLPAPER_MISMATCH` 的安全降级仍然存在。
5. Windows API 无法获取有效 Alpha 时**拒绝飞散**，只播放命中火星，绝不使用不完整裁片。

### 前端数据路径

- `validateVisualSample()` 验证 `renderRect` 位于 `captureRect` 内。
- `prepare()` 额外校验 PNG 解码宽高与元数据一致（不匹配则拒绝）。
- `draw()` 先绘制 95×123 原位壁纸，再将 PNG 精灵绘制到 `renderRect`，旋转中心为其真实可见中心，落地边界继续依据 `iconBounds`。
- `drawDebug()` 红利开发模式（仅在 `CANNON_ICON_DEBUG=1` 时启用）：**绿色=碰撞框、蓝色=背景采集框、黄色=实际精灵绘制框**。

## 不影响的部分

V0.4.1 原版小炮美术及 17 张网格动画帧；V0.6.4 多对象、120Hz 物理、5–8 秒落地停留、自动回位和托盘唯一互动开关都不修改。

## 测试/验收

- `Windows验证V065.bat`：Node 全回归、Python 帧验证、Windows `cargo check`；如本机已装工具链再运行。
- `Windows开发启动.bat`：正常运行。
- `Windows调试图标边界.bat`：开发专用，绿色/蓝色/黄色框。先确保关闭所有旧版。
- 测试 Chrome / 自制 exe 快捷方式 / 文件缩略图 / 带箭头图标 / 大于或小于标准图标的图像，确认不会缺左/右/上下部分；飞散中与背景颜色匹配。
- 检查 1 次发射击中 2+ 个不同图标、多次发射、落地停留 5–8 秒、开关关闭立即撤销遮罩。

**注意：** 当前 Linux 容器只能运行 JS/PNG 检验；无法用 Windows SDK 编译 C++/Tauri，也不能抓到真实 Explorer 截图。Windows Shell image factory 返回的图像可能与 Explorer 显示的缩略图/快捷方式角标略有区别，必须实机比对。未通过验收前这是实验版。

微软官方接口文档：
- https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-ishellitemimagefactory-getimage
- https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-shcreateitemwithparent
