# 光学传输（oft）· Material Design 3 界面

把 `optical-transfer/` 里的传输核心（Decimen Optical Transfer v0.5.3）包上一层 **mdui 2 / Material Design 3**
界面：首页只有「发送」「接收」两个大按钮，其余信息收进底部「更多」对话框；发送与接收各自是一条
三步式引导流程（OOBE 风格），电脑上左右分栏。默认配色是**松绿色**（种子色 `#01796F`）。

```
首页 ──┬─ 发送（3 步）        选内容 → 对端打开接收页 → 展示二维码
       ├─ 接收（3 步）        开始 → 扫码 → 接收成功
       └─ 更多（对话框）      介绍 / 原理 / 版本 / 许可 / 离线(PWA) / 帮助（左侧 NavigationRail）
```

> 界面截图由本地验证脚本（`tools/verify/drive-flows.mjs`）在无头浏览器里自动生成到 `docs/screenshots/`，
> 属于验证产物，按 `.gitignore` **不入库**；在本机跑一次脚本即可得到全部截图（含桌面 / 移动 / 深色与各步骤）。

## 快速开始

接收端要调用摄像头，Service Worker 也只在安全上下文里注册，所以请用本地服务器打开：

```bash
cd oft
node tools/serve.mjs            # http://localhost:8080
node tools/serve.mjs 9000       # 换端口
```

| 页面 | 地址 |
| --- | --- |
| 首页 | <http://localhost:8080/> |
| 发送 | <http://localhost:8080/send.html> |
| 接收 | <http://localhost:8080/receive.html> |
| 核心发送端（不带引导流程） | <http://localhost:8080/core/send.html> |
| 核心接收端（不带引导流程） | <http://localhost:8080/core/receive.html> |

一次传输：电脑上点「发送」选文件 → 第 2 步让手机扫码（或输入 `oft.nickdl.site`）打开接收页 →
第 3 步把电脑屏幕对准手机摄像头。全程没有网络请求。

## 目录结构

```
oft/
├── index.html                     首页：两个主按钮 + 底部「更多」对话框（左 NavigationRail）
├── send.html                      发送流程（三步向导，右侧二维码舞台）
├── receive.html                   接收流程（三步向导，右侧取景框）
├── css/app.css                    MD3 页面外壳样式（颜色全部走 --mdui-color-* 令牌）
├── js/
│   ├── theme.js                   <head> 内同步执行：松绿色配色 + 明暗主题（避免首帧闪烁）
│   ├── app.js                     应用栏主题按钮、PWA 安装/更新/缓存、环境检测、通用工具
│   ├── home.js                    首页：进入流程、「更多」对话框与 NavigationRail 切换
│   ├── stepper.js                 分步流程控制（步骤条 + 面板 + 深链 #step-2）
│   ├── core-bridge.js             同源驱动核心页：注入样式、模拟操作、读取状态
│   ├── flow-send.js               发送流程逻辑
│   └── flow-receive.js            接收流程逻辑
├── sw.js                          Service Worker：整套界面 + 核心的离线缓存与后台刷新
├── manifest.webmanifest           PWA 清单（图标、快捷方式、松绿主题色）
├── icons/                         图标（PNG 三件套 + SVG favicon）
├── core/                          传输核心（上游 Release 产物，逐字节未改）
│   ├── send.html  receive.html
│   ├── js/optical-standalone.js   上游产物自带的独立运行适配层
│   └── index.html                 仅用于把核心页的「返回入口」链接转回外层首页
├── vendor/
│   ├── mdui/                      mdui 2.1.5（MIT）：mdui.css、mdui.global.js、zh-cn 语言包
│   └── material-icons/            Material Icons 字体（Apache-2.0，只带 Filled 字重）
├── LICENSES/                      传输核心的 AGPL-3.0 全文、NOTICE、v0.3.0 的 MIT
├── docs/upstream-releases.md      上游 v0.3.0 → v0.5.3 更新记录与线格式兼容表
├── tools/serve.mjs                零依赖静态服务器
├── .gitignore                     忽略本地验证脚本与验证产物（见「自检」）
└── README.md
```

工作区里还有两处**不纳入版本控制**的内容（`.gitignore` 已忽略，克隆仓库不会带上）：

| 路径 | 说明 |
| --- | --- |
| `tools/verify/` | 本地测试工具：`static-verify.mjs`（静态自检）与 `drive-flows.mjs`（无头浏览器流程验证） |
| `docs/screenshots/` | 上面这套脚本跑出来的界面截图 |

## 界面说明

### 首页
主要内容只剩上下排列的**发送**、**接收**两个大按钮（≥840px 时左侧是品牌区、右侧是按钮，左右分栏）。
介绍、原理、版本、许可、PWA 安装/更新、帮助与常见问题全部收进底部**更多**按钮打开的对话框：
左侧 `mdui-navigation-rail` 切换小节，右侧滚动阅读。窄屏（≤840px）对话框自动全屏、
隐藏导航栏并顺序展示全部小节，不会出现「点不到」的内容。

### 发送页（三步）
1. **选择内容**：拖拽或选择文件（≤ 64 MB），或切到「文字」输入（≤ 4 MB）。拖动时上传区会高亮，
   选好后显示文件卡片与大小。
2. **对端打开接收页**：给出接收页地址（当前站点同目录的 `receive.html`）、一键复制、打开按钮，
   并说明也可以直接输入 `oft.nickdl.site`，或用原版网站 `decimen.app/receive`（两端需同为 v0.5.x）。
   右侧舞台显示**接收页二维码**——由核心自己渲染后镜像过来，手机扫一下就能打开接收页。
3. **展示二维码**：右侧舞台播放数据二维码（可全屏），下方镜像核心的流参数
   （帧率 / 每帧字节 / 二维码规格 / 发送量 / 压缩 / 喷泉块 K）；「传输设置」可以直接在页面里
   调整帧率、每帧字节、屏上码数与纠错等级，改动即时传回核心并重新开始发送。

### 接收页（三步）
1. **开始**：文字说明（摄像头前提、亮度与固定、SHA-256 校验、版本互通）与「开始扫描」。
2. **扫码**：请求摄像头，取景框显示核心的实时画面（四周角标 + 扫描线动画），
   进度与状态实时镜像到 MD3 组件上；启动失败会显示核心给出的原因并提供「重新启动摄像头」。
3. **接收成功**：显示内容名 / 大小 / SHA-256 校验结果，可一键保存文件、复制文字，
   或「再接收一个」重新开始；失败时同一页切换成错误样式并给出重试入口。

### 电脑上的布局
三个页面在 ≥840px 时都是左右布局：首页是「品牌区 ｜ 按钮区」，发送/接收页是
「步骤条 + 步骤内容 ｜ 二维码舞台 / 取景框」，舞台区 `position: sticky` 跟随滚动。
窄屏自动堆叠成单列，步骤条变成可横向滚动的胶囊。

## 与传输核心的关系

`core/send.html`、`core/receive.html` 与上游 Release 产物**逐字节一致**（只带着
`optical-transfer/tools/build-cores.mjs` 记录在案的两处改动：CSP 放开 `'self'`、追加独立运行适配层）。
引导流程不改核心，而是用**同源 iframe + 注入样式 + 模拟用户操作**驱动它：

* 注入样式：隐藏核心自带的页头 / 页脚 / 表单，只留二维码舞台或摄像头画面，并把核心的
  结果页调成与外壳一致的观感；
* 模拟操作：把 `File` 通过 `DataTransfer` 塞进核心的 `<input type=file>`、把文字写进它的
  文本框、点击「启动摄像头」「开始传输」，或者从页面上的「传输设置」改它的参数；
* 读取状态：镜像核心的状态文字、进度条、流参数与结果节点，用 mdui 组件重新呈现；
  接收页的「保存文件 / 复制文字」也是转交给核心自己的按钮执行。

因此这一步要求**同源**（http/https 同站点）。用 `file://` 双击打开时浏览器会隔离来源，
页面会自动切到「手动模式」：右侧直接显示核心页面本身，由使用者自己操作，并给出原因与建议。

## 离线使用（PWA）

`sw.js` 在安装时预缓存整套界面与两个核心页（约 1.4 MB），之后**断网也能打开并完成一次传输**。

* 取用一律「缓存优先」，保证离线可靠、也不反复下载大文件；
* 更新走**后台刷新**：每次打开页面（每小时最多一次）会让 Service Worker 用
  `cache: 'reload'` 重新拉一遍外壳文件，发现内容变化就提示「刷新即可生效」，
  「更多 → 离线 → 检查更新」也可以手动触发；
* 「更多 → 离线」里能看到安装状态、缓存状态、缓存占用与在线/离线状态，并可一键清除缓存重建；
* 自动安装提示：Chrome / Edge 桌面版与 Android Chrome；iOS Safari 用「分享 → 添加到主屏幕」。

## 部署

把 `oft/` 整个目录放到站点根目录（例如 `https://oft.nickdl.site/`）即可，不需要任何构建步骤。

* **必须 HTTPS**：否则接收端拿不到摄像头，Service Worker 也不会注册；
* 静态服务器要能返回 `.webmanifest`（`application/manifest+json`）与 `.woff2`（`font/woff2`）；
* 部署在子路径下也没有问题：所有引用都是相对路径；
* 发送页第 2 步展示的接收页地址取自「当前页面同目录的 `receive.html`」，
  换域名或子路径都会自动跟随（换域名后建议在「更多 → 离线」里点一次「清除离线缓存」）。

## 换配色

默认种子色是松绿色，改一处即可整体换色（mdui 会按 MD3 算法生成明暗两套调色板）：

```js
// js/theme.js
var SEED = '#01796F';
```

想恢复 mdui 默认紫色，删掉 `mdui.setColorScheme(SEED)` 那一行即可。
外观默认跟随系统，右上角的按钮可以在「跟随系统 / 浅色 / 深色」之间切换，选择会记住。

## 许可与致谢

* **传输核心 `core/`：AGPL-3.0-or-later**，© 2026 Evan Crawley (Bash Alarmist)，部分代码由
  Steve Dakh 以 MIT 贡献。**这是强 copyleft**：再分发（包括把本目录部署成站点供他人访问）需要
  保留许可证与署名，并向使用者提供对应源码
  （<https://github.com/bashalarmistalt/decimen-optical-transfer>）。原文见 `LICENSES/`。
* **mdui 2.1.5：MIT**，© zdhxiong，见 `vendor/mdui/LICENSE`。
* **Material Icons：Apache-2.0**，见 `vendor/material-icons/LICENSE`。
* 本目录新写的部分（页面、样式、脚本、PWA、工具脚本、文档）为原创代码。

## 自检

界面与流程用一套**零依赖**脚本验证：静态自检（引用、清单、核心一致性、结构）+ 无头浏览器里
真实走一遍三个页面（含断网与 PWA）。脚本属于本地测试工具，**按 `.gitignore` 不入库**——
仓库里只有应用本身，下面记录的是开发机上跑出来的结果。

如果有这套脚本，用法是：

```bash
node tools/serve.mjs &                                  # 先起服务器
node tools/verify/static-verify.mjs --base http://localhost:8080
node tools/verify/drive-flows.mjs   --base http://localhost:8080
```

`static-verify.mjs` 覆盖：manifest 字段与图标、所有本地引用是否存在、Service Worker 预缓存清单、
核心页与 `optical-transfer/` 是否逐字节一致、mdui 组件标签是否真实存在、图标名格式、
三个页面的结构与关键元素、可选 HTTP 可达性。

`drive-flows.mjs` 会在无头浏览器里真实走一遍：首页（桌面/移动/深色、对话框与 NavigationRail）、
发送三步（含二维码是否完整、是否被状态条遮挡、画布是否真的画出了内容、设置是否传回核心）、
接收三步（假摄像头、画面是否铺满、成功页渲染）、PWA（Service Worker 接管、断网后仍可打开并驱动核心），
并收集控制台异常、HTTP 4xx/5xx 与未捕获异常，逐步截图到 `--out` 指定的目录
（默认写到运行目录下的 `.verify-shots/`，截图同样是验证产物、不入库）。

本次验证结果（本机 Edge 155，无头）：

| 检查 | 结果 |
| --- | --- |
| 静态自检 | ✅ 158/158 通过 |
| 浏览器端流程验证 | ✅ 41/41 通过，控制台无错误与警告 |
| 核心页与上游产物逐字节一致 | ✅ SHA-256 相同（send / receive / 适配层） |
| 断网后打开接收页并驱动核心 | ✅ 通过（离线缓存 26 个条目） |
| 图标字形 | ✅ 46 个图标名全部能渲染出连字（未退化成文字） |
