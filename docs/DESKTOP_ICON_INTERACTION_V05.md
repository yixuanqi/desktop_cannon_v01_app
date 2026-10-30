# Desktop Cannon V0.5 — Windows 桌面图标视觉飞散与自动回位开发方案

> **进度补充（2026-10-29）**：已建立 V0.5 M0/M1/M2 的只读探测和纯 JS 命中实验，默认关闭；`M3 GATE-MASK` 尚未通过 Windows 实测，暂不实现图标替身/飞散/回位。原始规范继续作为验收标准，实际进展参见 `V05_VALIDATION_REPORT.md`。


> **状态：DESIGN ONLY / 尚未开始实现。** 本文是交给后续 AI Agent / 开发者的实施规范，不代表桌面图标交互已经可用。
>
> **基线：V0.4.1（`desktop_cannon_v041_aim_alignment.zip`）**，Tauri 2 + Rust + HTML/CSS/ES Modules + Canvas 2D。此前的小炮原版美术、30°–38° 网格微动、二维拉闩、弹道预测、双窗口鼠标穿透均保留。
>
> **方案选择：A — 仅视觉飞散、弹性回位，不移动、不重排 Windows 真正的桌面图标，不碰实际文件。**
>
> **首要技术未知项：** Windows Explorer 绘制的真实图标及其文字，能否在目标机上被准确、无痕、且不遮挡普通应用窗口地临时覆盖。这件事尚未验证。它是进入“真正的飞散”阶段的**硬门槛**；验证失败必须安全降级，不能以假成功、双图标或误覆盖其他窗口替代。

---

## 0. 一页执行摘要

**目标体验：** 炮弹碰到桌面上的一个真实快捷方式/文件图标时，桌面原位置暂时呈现与背景连续的视觉遮挡，一个包含图标图像、标签文字的副本随冲击方向飞起、旋转、轻弹跳，在约 1.5–2.5 秒后回到原处；最后去掉遮挡，真实图标依旧在原位，能够照常打开。对普通程序窗口、文件、图标位置的永久状态没有任何改动。

**实现策略：** Rust 在后台只读取 Shell 图标信息（位置/标识/图像/必要标签），JS 在已有全屏透明 Canvas 中绘制代理精灵；判断可见性并构建原位遮罩，成功时才执行飞散动画；任何不可确定场景都只显示命中火星/炮弹反馈。**无需第三个常驻 WebView，也不需要移动真实图标。**

**先后顺序：** POC-0 环境与接口探测 → POC-1 图标坐标与命中 → **GATE-MASK** 完整遮挡验证 → 单图标飞散 → 多图标连锁 → 性能与异常回归 → 可选发布。

**本文禁止**把 `IFolderView` 能获取位置、或 `IDesktopWallpaper` 能获取壁纸，直接等同于能够无痕隐藏桌面图标。两者之间存在标签、壁纸缩放、DPI、遮挡与应用窗口层叠等独立难题。

---

## 1. 产品范围和用户操作

### 1.1 V0.5 目标范围

| 需求编号 | 必须具备的行为 | 验收方式 |
|---|---|---|
| R-01 | 读取主显示器桌面图标，匹配图标图像与实际显示位置 | 调试框与桌面真实图标对齐 |
| R-02 | 飞行炮弹（不是瞄准虚线）碰到可见图标时触发命中 | 静态/高速/斜角轨迹单测与 Windows 实机 |
| R-03 | 图标只进行视觉飞散、旋转、弹跳、回弹；真实布局不变 | 动画前后图标位置和文件一致 |
| R-04 | 遮罩只在验证可用时启用；无法遮罩时仅命中粒子效果 | 刻意关闭遮罩功能与失败注入 |
| R-05 | 不妨碍 Explorer / 应用的点击、拖拽、重命名 | 全屏特效层保持点击穿透 |
| R-06 | 隐藏小炮、切换窗口、Explorer 重启时立即清理视觉效果 | 故障恢复测试 |
| R-07 | 独立开关、禁用状态无图标轮询/图片提取/动画 | 托盘切换、性能计数器 |
| R-08 | 单图标首先交付，连锁反应作为后续阶段 | 分阶段验收报告 |

### 1.2 明确不做

- 不调用 `IFolderView::SelectAndPositionItems` 或其他真实移动/排序图标接口。
- 不移动、重命名、隐藏、删除文件；不操作回收站内容；不调用打开/执行文件行为。
- 不修改 Explorer 进程内存、不注入 DLL、不模拟鼠标拖动图标、不发送伪装成用户的文件管理快捷键。
- 不抓取整个桌面并持续存盘，不上传壁纸、图标名称、文件路径或桌面截图。
- 首版不支持动态壁纸（Wallpaper Engine 等）、独占全屏、远程桌面复杂合成、多显示器跨屏图标飞行、堆叠/虚拟桌面联动。
- 首版不改变此前炮弹碰撞边界与网格微动美术。

### 1.3 体验参数（建议默认，不是已测结论）

| 项目 | 目标 |
|---|---|
| 主屏、静态壁纸 | V0.5 首版受支持环境 |
| 单次最大受影响图标 | POC-2 为 1，正式连锁最多 5 |
| 飞散初速 | 根据炮弹命中速度与方向缩放，并设上限；非真实图标物理 |
| 飞散平移量 | 40–180 CSS px，受屏幕边界限制 |
| 最大旋转幅度 | ±35° |
| 弹跳 | 1–2 次，减幅明显 |
| 返回 | 约 1.5–2.5 秒，从当前位置缓动回原位 |
| 停止与重置 | Esc / 隐藏 / Explorer 重启 / 切换支持状态时立即清理 |
| 启用 | 开关默认关闭，POC 验收以后可调整默认值 |
| 不支持的配置 | 安静降级为炮弹命中火星，不产生双图标 |

---

## 2. 真正的难点和技术决策

### 2.1 三个独立问题，不能混为一谈

1. **识别图标：** Windows Shell 中图标项目的标识、布局位置与图片。
2. **正确命中：** 将 Shell **物理屏幕坐标**换算到 Canvas **CSS 像素**，与炮弹轨迹作精确碰撞。
3. **视觉替身无穿帮：** 遮住 Explorer 画出的“图像 + 标签 + 阴影/选中效果”，在高于图标但不误盖其他正常窗口的位置绘制副本；动画结束无痕撤销。

**完成 1、2 并不意味着完成 3。第 3 项先做 POC 和 Go/No-Go 验收。**

### 2.2 读取图标：首选官方 Shell COM，UI Automation 作布局补充

- `IShellWindows` / 桌面 Shell 视图获取：优先通过受支持的 COM 对象链取得当前桌面 `IShellView`、`IFolderView`；具体获取路径和 Windows 10/11 差异，在 POC-0 先记录验证结果。不能把随机遍历 `Progman`/`WorkerW`/`SysListView32` 的窗口层级当稳定唯一协议。
- `IFolderView::Items()`（枚举）与 `GetItemPosition()`（视图中项目的位置），同时获取显示名、项目 PIDL/相对标识；**返回点不应未经确认就当物理屏幕坐标**，需针对视图窗口坐标执行转换。
- `IShellItemImageFactory::GetImage()` 获取图标或缩略图：这会产生 `HBITMAP`，必须转换为内部 RGBA 并释放 GDI 资源；仅请求缓存图会更快但可能失败，**绝不在 UI 线程做阻塞的缩略图提取**。
- 图标标签和高亮背景不一定包含在 `GetImage()` 结果里，使用 UI Automation 的 `BoundingRectangle`、`Name` 等作为**候选外接矩形**，但需实测其对 Explorer 桌面图标的准确性。无法获取准确的“图像＋标签”区域 → 该项目不允许飞散。
- PIDL 只在本次快照或其关联 Shell 生命周期内使用，不把原始指针保存为跨启动的稳定 ID。基于 shell item 标识构造内存 token，在重新枚举后更新。

推荐实现 `DesktopIconProvider` trait，不能把 Windows COM 散落到 `lib.rs`。对每一次扫描保存 `snapshotVersion` 与 `explorerEpoch`，快照过期时不触发任何飞散。

### 2.3 如何让原图标“暂时消失”：必须验证，不可先假定可用

**视觉遮罩设计：**

- 对于普通静态壁纸，可使用 `IDesktopWallpaper::GetWallpaper()` 与 `GetPosition()` 获取壁纸、铺放方式，重建被图标遮挡区域的壁纸纹理；正确处理 Fill/Fit/Stretch/Center/Tile/Span、裁剪偏移、监视器位置、壁纸变化和文字标签覆盖区域。背景不能简单取四周纯色，也不能直接从含图标的截图裁切后回贴（会连图标一起贴回来）。
- 遮罩与被击飞副本应处于同一全屏 Canvas 动画事务。展示之前要验证遮罩区域确实匹配当前壁纸且图标**整块区域（含文字、选中态、阴影）**都能覆盖；“只是盖住图标图片，文字仍在”不合格。
- 应用窗口遮挡是另一问题：现有 `overlay` 为 `alwaysOnTop`，遮罩不应该涂到遮住的浏览器/资源管理器上。需要建立**桌面可见区域判断**（前台普通窗口、任务栏、置顶窗口与其他窗口覆盖的排除区域）。对于遮挡检测不可靠的情况，直接禁用视觉替身，只保留普通炮弹特效。
- 本方案不承诺能在全部 Windows 桌面配置下无痕遮挡。遮罩方案不通过，则**不进行视觉飞散**，仅命中火光/小星星/炮弹反馈。不能向用户展示“透明却在原位置留了半个图标”的版本。
- 不采用改变 Explorer 真实图标透明度或进程注入作为补救路径。

**GATE-MASK 必测场景：**深色/浅色复杂文字壁纸（尤其用户当前有大幅文字的壁纸）、不同图标标签长度、选中/未选中、图标阴影、固定及自定义图标大小、桌面窗口重叠、显示缩放、壁纸切换和 Explorer 重启。要求使用真实 Windows 截图对比证据，而不是只用单独的 UI Mock 图。

### 2.4 鼠标行为

`overlay.set_ignore_cursor_events(true)` 必须保持；遮罩和飞散精灵只做画面，不截获点击。原始图标虽被视觉遮住，仍可被点击/选中，因此当鼠标进入任何受影响图标原始区域或复制图标的扫过区域（可配置安全扩张距离）时，应立即撤销遮罩及副本，并停止此次飞散。**不能声称真实图标已不可点击。**

---

## 3. 架构：基于现有代码增量添加

```
Cannon window  (已有，保持不变)
    | cannon:fire
    v
Overlay web/js/overlay.mjs  (已有：物理/Canvas/粒子)
    | projectile per-substep segment / event
    v
web/js/icon-interaction/
    ├─ icon-collision.mjs      swept-circle vs rectangle + 最近命中
    ├─ icon-snapshot.mjs       版本、坐标转换、去重与可见性
    ├─ icon-illusion.mjs       状态机/取消/回弹
    ├─ icon-renderer.mjs       遮罩、图标/文字副本、缩放/旋转
    ├─ icon-effects.mjs        受力、连锁、弹跳参数
    └─ icon-feature.mjs        开关、探测、事件协调
            ^
            | 仅读的 IPC（增量更新）
            v
src-tauri/src/icon_interaction/
    ├─ mod.rs                  Command + 线程生命周期
    ├─ shell_view.rs           官方 Shell COM 枚举、视图识别
    ├─ icon_image.rs           HBITMAP → RGBA、缓存、资源释放
    ├─ wall_paper.rs           静态壁纸/铺放/屏幕坐标
    ├─ visibility.rs           桌面可见区判断 + fail closed
    ├─ dto.rs                  Rust/JS 对象契约
    └─ windows_impl.rs         #[cfg(target_os="windows")]

src-tauri/src/lib.rs               注册命令、托盘开关、生命周期
web/js/bridge.mjs                  仅新增少量 Invoke 包装
web/js/physics.mjs                 可扩展固定步进 segment 回调
web/js/overlay.mjs                 挂接 collision + illusion.update/render
```

原则：**不开第三个常驻窗口，不改变炮身交互，不改已修好的弹道公式**。Windows 原生部分是可选功能，非 Windows / 浏览器模拟必须能跑纯 JS mock，不因功能不支持而崩溃。Shell COM 工作线程的 apartment 类型由 Windows 适用接口约束确认，通常采用专用 STA 工作者、明确初始化和消息泵/线程拥有关系；不把不可跨 apartment 的 COM 对象直接传给任意 Tokio worker。

---

## 4. 坐标、数据契约、状态与事件

### 4.1 坐标约定（必须在所有模块贯彻）

- `screenPx`：Windows 虚拟桌面的**物理像素**坐标；多显示器左上角可能为负数。
- `overlayCss`：当前 Overlay Canvas 的**CSS 像素**；原点是 overlay window 左上角。
- `viewPt`：Shell 桌面视图内部坐标；**绝不能直接与炮弹坐标比较**。

单显示器、物理原点 `(Ox, Oy)`、Tauri Overlay 缩放因子 `s` 时：

```ts
const overlayX = (screenPxX - Ox) / s;
const overlayY = (screenPxY - Oy) / s;
const overlayW = screenPxW / s;
const overlayH = screenPxH / s;
```

实现时 `Ox/Oy` 使用**当前真实 overlay 物理位置**，不要假设永远为 `(0,0)`。Shell UI Automation 返回的 bounding rectangle 是物理屏幕坐标；`IFolderView::GetItemPosition` 的视图位置需要按实际桌面视图 HWND 完成坐标系校准。DPI 变化时应废弃旧缓存并重建，切不可重复缩放。

**工程注意：**当前 `web/js/overlay.mjs` 物理场使用 CSS px，炮弹 `radius` 和图标 rect 必须统一在 CSS px 后才计算碰撞。`get_layout` 当前仅照顾主屏、固定缩放，V0.5 首版保持主屏限定，并在不满足条件时禁用图标交互。

### 4.2 Rust → JS 快照 DTO（拟议接口，需后续实现）

```ts
interface DesktopIconInfo {
  token: string;               // 仅进程内，不含完整文件路径
  displayName: string;         // 仅本地显示，敏感信息不写日志
  iconRectPx: Rect;            // 图像实体的物理屏幕矩形
  visualRectPx: Rect;          // 图像 + 文本 + 选中/阴影候选区域
  imageKey: string;            // 仅图像缓存句柄，不直接暴露文件路径
  canAnimate: boolean;         // 本次能力与布局检测结果
}
interface DesktopSnapshot {
  snapshotVersion: number;
  explorerEpoch: number;
  monitorId: string;
  dpi: number;
  capturedAtMs: number;
  icons: DesktopIconInfo[];
  wallpaperMode: 'static-supported' | 'unsupported';
}
interface Rect { x: number; y: number; width: number; height: number; }
interface IconHit {
  token: string;
  shotId: number;
  hitX: number; hitY: number;  // overlay CSS px
  velocityX: number; velocityY: number;
  impactTime: number;          // 模拟时间
  snapshotVersion: number;
}
```

`imageKey` 通过命令读取单图标编码后的 RGBA 或缓存 URL，不在每帧调用 Windows COM 提取。缺少准确 icon/label 边界则 `canAnimate=false`。需要有严格的最大图片尺寸和字节限制、文件句柄关闭、LRU 缓存。

### 4.3 推荐的命令与事件（新接口；不是现有 API）

| 类型 | 名称 | 入参 / 返回 | 超时 / 行为 |
|---|---|---|---|
| invoke | `icon_capabilities` | `{windowsShell, staticWallpaper, occlusionSupported, reason}` | 启动或设置变化时调用 |
| invoke | `icon_snapshot` | `{sinceVersion?}` → `DesktopSnapshot` | 返回完整/差量，失败不可阻塞炮弹 |
| invoke | `icon_image_get` | `{imageKey}` → RGBA/PNG 本地缓存负载 | 仅首次、预加载，后台异步 |
| invoke | `icon_mask_prepare` | `{token, snapshotVersion}` → `{ok, patch?, bounds?, reason?}` | 不成功就禁止进入飞散 |
| event | `icon:snapshot-invalidated` | `{explorerEpoch, reason}` | 取消所有正在飞散的图标 |
| event | `icon:feature-changed` | `{enabled, mode}` | 托盘开关即时生效 |

**注意：**不要把“遮罩准备成功”定义成仅能返回一张壁纸裁片；需要通过壁纸匹配、目标可见、原图标整块覆盖和不会覆盖前景窗口等检查。可进一步将准备/验证拆成两个命令，具体由 POC 决定。

### 4.4 可取消的状态机

```
DISABLED / UNSUPPORTED
    |
    | 用户开启 + 环境通过
    v
READY (只保持轻量快照)
    |
    | 炮弹命中 + 版本有效
    v
PREPARING (背景/图像/标签和可见性核验)
    | success: 遮罩与副本同帧提交
    v
SCATTER -> BOUNCE -> RETURNING -> RESTORE -> READY
    | failure / timeout / invalidation / mouse interaction
    +-------------------------------> CANCEL -> READY/UNSUPPORTED
```

要求所有异步任务有 `animationId + snapshotVersion + explorerEpoch` 防过期检查；异步结果不得在清理后重新绘制旧遮罩。取消优先级始终高于任何动画。取消动作同步清掉遮罩、精灵、碰撞暂存、引用与计时器，且不得改变真实图标。

### 4.5 物理碰撞采用 swept test，避免高速穿透

已有炮弹最大初速 `1750 CSS px/s`，每 `1/120 秒` 步进约 `14.6 CSS px`；只在本帧末端检查图标中心可能会穿过 32–48px 的细小图标或从边缘擦过而漏判。采用**线段与膨胀矩形求首次接触时间**：

1. 每个固定子步记录炮弹圆心 `p0`、`p1`。
2. 将图标 `iconRect` 按炮弹半径 `r` 做 Minkowski 扩张（AABB 四边扩张 `r`）。
3. 用 slab/segment-AABB 相交求 `t ∈ [0,1]` 中最早的 `tHit`，取所有候选中最近命中。
4. 命中必须满足快照未过期、位于支持显示器、桌面可见、非禁用图标、不在 cooldown、动画容量允许。
5. 命中事件只生成一次；当下一子步仍在同一个矩形内，不允许无限连续触发。可设计 300–600ms 的单图标冷却。
6. 预测虚线**不调用这个系统**；只有实弹碰撞才启动桌面互动。视觉上炮弹是反弹还是穿透，首版建议命中产生一次轻微反弹，后续调参。

请保持 `web/js/physics.mjs` 原有固定步长积分。推荐给 `stepProjectile` 增加**可选的每子步 segment observer**，供图标碰撞读，不得把整套物理复制到 `icon-collision.mjs`。检测顺序必须定义：每个子步确定屏幕边界与图标谁更早接触，不允许检测到穿越屏幕边界以外的图标。

### 4.6 视觉精灵运动（仅模拟动画）

以命中时炮弹速度向量 `v` 和命中方向构造有上限的初始速度：

```ts
const speed = Math.hypot(vx, vy);
const impulse = clamp(speed * 0.35, 120, 520); // 建议值，需实机调手感
const dir = normalize(vx, vy);
sprite.velocity = dir * impulse + smallUpwardImpulse;
sprite.angularVelocity = clamp(vx * 0.04, -240, 240); // deg/s 示例
```

- `SCATTER` 0–350ms：ease-out，位置离开锚点，适度旋转；距边界至少保留图标半径。
- `BOUNCE` 350–1100ms：1–2 次低幅衰减弹跳；边界夹紧；默认不允许飞入任务栏。
- `RETURNING` 1100–2000ms：强制有限时长的弹性回归，不能使用永不收敛的弹簧微分方程导致永久悬浮。
- `RESTORE` 同帧先完成精灵回锚点，再撤销遮罩和副本。末端速度很小、位置误差 < 1 CSS px（目标），完成后全部销毁。
- 连续发射对同一 icon token 采用“更新冲量/延长一次”或忽略，**不要生成两个可见副本**。
- 图片副本可能由 PNG 图像 + 文字标签组成，应一起平移和旋转；标签/选中态无法还原则取消飞散。

---

## 5. “遮罩”关卡：技术实验和失败策略

### GATE-MASK：必须先验证三步，才可以开发完整动画

1. **静止覆盖验证：** 不发射炮弹，在一个未选中图标位置画 100% 对齐的壁纸补丁，检查截图中图像和文字是否真的都消失。开启/关闭差分；禁止用模糊矩形糊过去。
2. **应用遮挡验证：** 打开浏览器与资源管理器覆盖目标图标部分区域，检查遮罩是否还会涂到窗口上；若不可靠，只允许目标完全无遮挡时进入动画。
3. **恢复验证：** 反复开启/关闭遮罩，确认没有重影、选中态错误、鼠标点击被吞、动画结束残留。

**Go/No-Go：**
- **GO**：在规定支持的 Windows 11、静态壁纸、单显示器、100%/150% 缩放矩阵中，原图标（含文字）无残影；任意恢复动作立即正常。并保存 Win 实机录屏/对照截图。
- **NO-GO**：任一主路径未通过，则 V0.5-A 仅交付“图标坐标+命中火星”，不宣称实现了飞散。不通过情况下禁止通过改变 Explorer 实际图标排列来伪装成功。

### 5.1 降级等级

| 等级 | 条件 | 用户看到 |
|---|---|---|
| L2 Full Illusion | 全部条件验证通过 | 无重复图标的飞散、弹跳、回位 |
| L1 Hit-only | 图标可定位但遮罩/标签/前景检测不可靠 | 炮弹碰撞特效和小星星；**图标本身不动** |
| L0 Normal | Shell 不可用、Explorer 重启、动态壁纸等 | 保持 V0.4.1 既有炮弹行为 |

禁止将 L1 描述成“真实的图标晃动”，因为原图标无法被此方案移动。若制作轻微视觉暗示，必须不复制完整图标并不遮挡前景窗口。

---

## 6. 后台刷新、可靠性与安全

- 首次启动或用户开启开关才请求 Shell 快照，**普通闲置关闭时不得轮询桌面**。
- 图标位置/大小/名称变化、Explorer 重新启动、屏幕分辨率/DPI、壁纸、用户切换、显示桌面/普通应用窗口遮挡变化，都必须废弃相关缓存。建议事件驱动为主 + 启用期间低频兜底刷新（建议 2–5 秒，必要时按需）。轮询频率要在 Windows Release 实测后确定。
- Explorer 不可用：不得重启 Explorer 或主动写入其状态；直接 `L0`，后台退避重试。
- IPC 超时：撞击不能“卡住”等待 Shell。最多延迟小于约 1 帧的已准备动画可以同步使用；如果尚未准备遮罩，展示命中火星。**禁止已经飞散一半才开始准备背景。**
- 临时图标图像只在内存缓存在本机；默认不保存图标名称、私有路径、用户壁纸与屏幕截图。调试日志使用 token、矩形和错误码，路径脱敏。
- Shell 对象和 HBITMAP 遵循 COM / GDI 生命周期，防句柄泄漏；图标缓存设 LRU + 内存上限，清理时取消未完成任务。
- 用户隐藏小炮、禁用功能、关闭程序或切换到不支持环境时，立即卸载全部遮罩和精灵。
- Windows 的任务栏、通知区域、前景窗口点击必须正常；全屏覆盖层保留穿透，不以 `SetCapture`、低级鼠标钩子或强制抢焦点来完成游戏效果。

---

## 7. 性能预算、指标与采集

这是**目标预算**，不是当前程序已测的性能：

| 指标 | 建议目标 | 观测方式 |
|---|---|---|
| 功能关闭后的新增 CPU | 近似 0 | Release 对比 V0.4.1，同一桌面静置 5min |
| 功能开启但无动画时 | 不运行图标粒子 RAF，仅有限刷新 | JS debug counters + Windows Performance Recorder |
| 同时受影响图标数 | ≤5 | `icon-illusion` 实体数统计 |
| 图标图片缓存 | 建议 ≤32 MB，可配置 | Rust 缓存字节计数、回收前后 |
| 图标扫描 | 不进每帧，不跑 WebView UI 线程 | Shell worker 时间/超时统计 |
| 动画帧率 | 1080p 目标 60fps，4K 降级可接受 | RAF 帧时间 p50/p95/p99 |
| 单次命中前后台延迟 | 已缓存目标尽量 < 50ms；未缓存降级 | POC 真机计时 |
| 应用整体工作集 | 不以图片文件 KB 推算；实际测量 | 任务管理器/PerfMon 汇总 WebView2 子进程 |

画面更新只在炮弹飞行、预测虚线、粒子或图标幻象活动时运行；图标图像预加载优先在 `READY` 阶段异步完成，瞬时命中不阻塞物理循环。超过预算优先关闭连锁、压缩贴图尺寸、减少视觉对象；不牺牲鼠标穿透和安全回位。

---

## 8. 开发里程碑、验收与任务拆分

### M0 — 工程基线冻结（P0）

- 从 `desktop_cannon_v041_aim_alignment.zip` 创建独立分支/目录，例如 `feature/v05-icon-illusion`。
- 完整运行 `npm test`，记录基线测试统计、现有 Tauri/Win11 运行情况；不修改 17 张网格动画帧或小炮默认视觉。
- 增加功能开关 `iconInteraction.enabled=false`，所有代码以开关隔离；确保关闭后行为与 V0.4.1 完全一致。

**验收**：`npm test` 原样通过；功能关闭时全部现有截图和交互一致；Debug 能看到 `disabled`。

### M1 — Windows 桌面图标探测 + 只读快照（P0）

**任务**：Rust Shell COM Worker、图标矩形、图像提取、缓存、坐标换算、模拟数据；UI overlay 可显示 debug 绿框（只有 `dev` 开关）。

**建议新增测试：**
- 同一桌面图标坐标重复读取稳定；刷新布局后变化被检测。
- UI Automation bounds 和 Shell ItemPosition 协调，误差预算实际标定。
- 100%、125%、150% 缩放；非零原点；负坐标屏幕不崩。
- Explorer 暂时不可用、图片提取失败、过期快照不阻塞炮弹。

**出关结果**： Windows 真实桌面截图，绿框贴近至少 10 个混合类型图标（快捷方式、文件、文件夹、缩略图）。

### M2 — 图标命中与防穿透（P0）

**任务**：纯 JS swept collision、segment observer、事件去重/版本校验、debug 显示命中 id；命中时**先只触发火星**。

**单测**：高速斜切、擦边、静止、左上角/任务栏、一次命中、多个矩形的最早命中、图标移动导致快照失效、炮弹边界优先级。

**出关结果**：Windows 实机发射并准确击中 10 个不同位置图标；无误碰前景浏览器图标。

### M3 — GATE-MASK：原位视觉遮挡（P0 / 决定方案是否继续）

**任务**：壁纸背景重建、含标签的视觉矩形、非桌面窗口遮挡检测；静态显示和撤销测试。

**出关门槛**：必须保留 100%/150% 缩放、复杂有字壁纸、文件夹/长标签、窗口遮挡、选中态等实机证据。**不过关停在 L1 Hit-only，不开始 M4。**

### M4 — 单图标飞散与自动回位（P1）

**任务**：状态机、图标精灵与文字、副本/遮罩同帧提交、飞散/弹跳/回位、鼠标靠近取消、取消和异常测试。

**单测**：精准回锚、双击/拖拽不被吞、移动鼠标立即清除、重复击中同图标只一份、禁用/退出清理、异步准备竞争。

**验收**： Windows 录屏 ≥30 次单图标命中，无明显原位双影；0 永久位置变更；恢复图标正常打开。

### M5 — 近邻连锁 + 个性化反馈（P2）

**任务**：命中主图标之后根据距离对邻近 ≤4 个图标发放衰减冲量；不同类型只改变视觉动作，不更改文件。防连锁失控，保持同屏最多 5 精灵。

**测试**：碰撞密集区、连续开炮、接近屏幕边缘、系统图标排除、重复触发上限；功能关闭完整回退。

### M6 — 兼容性、性能与发布候选（P0）

- Win11 主屏、静态壁纸、100%/125%/150% 缩放；Explorer 重启、切换壁纸、应用窗口部分遮挡、任务栏、桌面刷新、分辨率切换。
- Release CPU/GPU/工作集对比；5min idle、连续开炮 60s、10min 混合操作；记录测量工具、机器和复现步骤。
- 任何“原图标没被遮住、双影、误盖窗口、残影” => 功能降级/延期，不作为完整模式发布。
- 可选托盘菜单：`桌面图标互动 [ ]`；默认关闭并标明支持环境。

---

## 9. 最少必须写的自动化测试

```text
tests/icon-collision.test.mjs
  [ ] swept circle hit / miss / glancing / earliest / high-speed
  [ ] multi-hit de-dup / cooldown / target radius / bounds
tests/icon-coordinate.test.mjs
  [ ] physical px -> overlay CSS px incl. negative origin / dpi
  [ ] snapshot expiry / explorerEpoch invalidation
tests/icon-state.test.mjs
  [ ] full chain PREPARING -> SCATTER -> BOUNCE -> RETURN -> RESTORE
  [ ] any stage CANCEL is synchronous; stale Promise cannot resurrect
  [ ] same token duplicate shots stays one sprite
tests/icon-fallback.test.mjs
  [ ] wallpaper unsupported / image missing / occluded -> L1/L0
  [ ] toggle off cancels, no work while disabled
tests/icon-bridge.test.mjs
  [ ] browser mock IPC contract and no-Windows fallback
Windows-native (Rust unit/integration + manual)
  [ ] COM init/release, HBITMAP DeleteObject, image extraction timeout
  [ ] Explorer restart resilience and icon snapshot refresh
  [ ] real mask screenshot diff / screenshot + video records
  [ ] mouse clickthrough, real layout unchanged
```

**测试范围边界：** Linux 的 JS 单测和 Pillow 离线合成图不能证明 Windows Explorer 的图标能被无痕覆盖；`GATE-MASK` 只有 Windows 真机截图/录屏才能签字。所有报告必须清楚区分 `PASS (unit)`、`PASS (Win observed)`、`BLOCKED` 和 `FAIL`。

---

## 10. 交付目录与 Agent 开发规则

建议开发产物：

```text
docs/DESKTOP_ICON_INTERACTION_V05.md      # 本规范（设计基线）
docs/V05_ICON_API_POC.md                # 官方 Shell 接口 POC 与适配表
docs/V05_MASK_EXPERIMENT.md             # 遮罩成败、截图与原因
docs/V05_ACCEPTANCE.md                  # 测试矩阵、性能与 Bug 闭环
src-tauri/src/icon_interaction/*         # 只读 Shell + 壁纸 + 可见性
web/js/icon-interaction/*               # 纯 JS 碰撞与动画
web/assets/icon-illusion/*              # 新增少量碰撞装饰（可选）
tests/icon-*.test.mjs                   # 自动化回归
```

**给 Agent 的执行约束：**

1. 开始前先读本规范与 `README.md`、`docs/TRAJECTORY_ALIGNMENT_V041.md`、`docs/LOCAL_MESH_WARP.md`。
2. 每个里程碑必须先写测试/POC，再实现，再反馈真实截图与通过情况；不允许只报“功能完成”。
3. 未确认 Windows Shell/壁纸能力前，不要直接写大量飞散动画来掩盖原位双图标问题。
4. 任何 COM API、窗口层级、DPI 换算来源必须写入 `docs/V05_ICON_API_POC.md`，不得凭猜测硬编码。
5. 不要修改 V0.4.1 已通过的网格帧、炮身与物理常量；如必须改物理，应提供同一场景的 V0.4.1/V0.5 A/B 回归。
6. 不得为了功能效果改变 Explorer 的真实图标位置、文件系统或关闭用户其他窗口。
7. 外观默认保持现有小炮的绘本手绘风格，不引入新的矢量大炮美术。
8. 所有失败/未验收事项在交付说明中标红，不能把“仅有模拟渲染”写成“Windows 实机验证通过”。
9. 只有 **M3 GATE-MASK 通过**，才能向用户交付“桌面图标无痕飞散”完整功能，否则只交付图标命中火星。

---

## 11. 建议的第一条 Agent 任务指令

> 以 V0.4.1 工程作为基线，阅读 `docs/DESKTOP_ICON_INTERACTION_V05.md`。**本轮只完成 M0 + M1**：增加关闭状态下零开销的功能开关、只读的 Windows 桌面图标探测模块和纯 JS mock、图标坐标与矩形调试显示。严禁修改或移动真实桌面图标；不实现飞散、不写假遮罩。要求输出 Windows 11 实机截图和误差测量，并跑全量回归。对拿不到的 Shell/坐标能力如实报告失败，不要跳过 GATE-MASK。

## 12. 官方资料（供 Agent 实现时复核）

- Microsoft — `IFolderView::GetItemPosition`: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifolderview-getitemposition
- Microsoft — `IShellItemImageFactory::GetImage`: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ishellitemimagefactory-getimage
- Microsoft — `IDesktopWallpaper`: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-idesktopwallpaper
- Microsoft — `IDesktopWallpaper::GetWallpaper`: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-getwallpaper
- Microsoft — `GetDpiForWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getdpiforwindow
- Microsoft — UI Automation tree: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-treeoverview
- Microsoft — UI Automation list item bounding rectangle: https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-support-for-the-listitem-control-type

**版本记录**：2026-10-29 — V0.5 初版架构与验收方案；状态仍为 `DESIGN ONLY`。
