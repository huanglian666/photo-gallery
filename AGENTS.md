# AGENTS.md

面向 AI 编码代理的项目说明。这是一个**主题仓库**，不是站点 —— 改动会影响到引用它的站点（当前只有 `../my-photo`）。

## 项目定位

自研的 Hugo 画廊主题：首页是扑克牌扇形牌堆（每个相册一张牌），点进去是等高行对齐的照片网格，另有按拍摄时间分组的归档页。

| 项 | 值 |
| --- | --- |
| 仓库 | `git@github.com:huanglian666/photo-gallery.git`，分支 `main` |
| 许可 | MIT |
| 使用方 | `../my-photo`（以 git submodule 引用） |
| 最低要求 | Hugo **extended** ≥ `0.155.0`（`js.Build` 打包 ES 模块 + `Image.Meta` 读 EXIF） |

**设计取向：只缩尺寸，不压画质。灯箱看大图永远是原图。**

## 快速命令

```bash
cd exampleSite && hugo server     # 用示例站点预览主题
```

`exampleSite/hugo.toml` 里 `theme = "../.."`，直接指向主题根目录，改完模板刷新即可看到效果。示例照片是 `tools/make-placeholders.py` 生成的占位图（从 picsum.photos 拉真实照片并写入 EXIF `DateTimeOriginal`，好让归档页能测出真实效果）。

## 目录结构

```
├── theme.toml            # 主题元数据（名称/许可/最低 Hugo 版本）
├── config/_default/hugo.toml   # 主题默认参数
├── layouts/
│   ├── index.html        # 首页牌堆
│   ├── _default/baseof.html
│   ├── albums/single.html      # 相册页（把 photo-list 的结果序列化成 JSON）
│   ├── archive/list.html       # 归档页（同上）
│   └── partials/         # category-photos / date-from-name / head /
│                         # lightbox / photo-list / remote-image /
│                         # scripts / thumb
├── assets/
│   ├── css/main.css
│   └── js/               # archive / deck / gallery / lightbox / main / spring / util
├── exampleSite/          # 开发预览用
├── tools/make-placeholders.py  # 生成占位照片（幂等，可反复跑）
└── docs/prototype.html   # 早期原型
```

## 设计要点

### 首页两套形态，640px 断点切换

`layouts/index.html` 只有**一份牌堆 DOM**，形态由 `assets/js/deck.js` 按屏宽切换：

| 形态 | 触发 | 交互 |
| --- | --- | --- |
| `fan` | 视口 ≥ 640px | 扇形展开。悬停时一张前推放大、其余下沉让开；拖拽时整副牌跟着手转，松手弹簧回正 |
| `rail` | 视口 < 640px | 横向一手牌。滑动挑选，停在屏幕正中的那张自动前推放大；点两侧的牌先滑到中间，再点居中那张才进入 |

**手机上为什么不用扇形**：扇形靠 hover 选中，而触屏没有 hover 语义；且扇形总宽随分类数线性增长，分类一多就溢出屏幕、靠边的牌点不中。`rail` 的牌宽与分类数无关（`cw = clamp(170, vw×0.58, 252)`），相邻两张露出宽度固定为 `cw × 0.46`。

跨过 640px 时（转屏、拖窗口）整副重建，但**不重播发牌动效**。

底部提示文案按形态显示不同内容，纯 CSS 切换（`.hint-wide` / `.hint-narrow`），无额外 JS。

### 零 JS 依赖

弹簧积分器是自己写的（`assets/js/spring.js`），**没有 framer-motion / jQuery 之类**。新增动效请沿用这套，不要引入第三方动画库。

### 图片流水线

| 用途 | 处理 |
| --- | --- |
| 网格缩略图 / 牌面封面 | 缩到 `thumbWidth`（默认 800px），保持原格式，质量 95 |
| **灯箱看大图** | **原图，完全不经处理** |

灯箱直接指向原始文件，所以点开看到的永远是原图。缩略图那一步不是压缩画质，而是不把 4000px 的原图塞进 300px 的格子。

**不要建议"优化"图片质量或上 CDN。** 图床本身是支持的（见下），但默认取向仍是本地原图：不转码、不二次压缩。

### 远程图床（`remoteImages`）

相册既能放本地文件，也能放图床 URL，混在同一个相册里行为一致。在相册 `index.md` 里写：

```yaml
remoteImages:
  - src: "https://cdn.example.com/2026/08/01/IMG_20260801_212545.jpg"
    date: "2026-08-01 21:25:45"   # 可选，优先级最高
    tags: ["美好瞬间"]              # 可选，和本地图一样参与跨相册归类
```

要点：

- **缩略图仍然由 Hugo 生成**：构建时 `resources.GetRemote` 下载后走同一个 `thumb.html`，所以宽高比、`thumbWidth` / `thumbQuality` / `thumbFormat` 对两种来源完全一致。等高网格靠 `ar`，而远程图的 `ar` 只有下载后才知道 —— 这是必须下载的原因。
- **灯箱大图直接指向图床 URL**，不调 `.RelPermalink`。调它会让 Hugo 把远程原图**发布到 `public/` 根目录**，等于把图床又抄一份到站点上。只调 `.Resize` 不会（已实测）。
- **远程缩略图会落在 `public/` 根目录**（形如 `/IMG_xxx_<hash>_hu_<hash>.jpg`），不带相册路径 —— 这是 Hugo 对全局资源的默认行为，本地图则落在各自相册目录下。
- **取不到就跳过并告警**：404 时 `resources.GetRemote` 返回 nil 而不报错，网络错误要靠 `try` 兜住（`.Err` 方法在 v0.141.0 已移除）。这些都在 `partials/remote-image.html` 里统一处理，别在别处再写一遍。
- **年份**：远程项喂给 `date-from-name.html` 的是「URL 去掉 query 和 fragment 后的整串」，不是 `.Name`。`.Name` 是 Hugo 的缓存路径，末尾追加了 20 位数字 hash，可能被 `(?:19|20)\d{12}` 误命中；去掉 query 是因为签名 URL 的参数里常带时间戳。保留路径则让 `date-from-name.html` 的 `YYYY/MM/DD` 规则能认出按日期分目录的图床（`/2026/08/01/AbCdEf.jpg`）。
- **远程项额外传 `noTimestamp=true`**：关掉 13 位毫秒时间戳那条规则。它只认数字串不认上下文，实测 `https://i.imgur.com/AbC1234567890123.jpg` 会被解析成 2009-02-14 —— 13 位随机数约 1/3 落进年份守卫（1990–2100）里。本地文件名保持开启，微信导出名 `mmexport<13位>` 那条真实用例不能丢。代价是微信导出名放到图床上认不出来，写显式 `date` 即可。

### 主要参数（`config/_default/hugo.toml`）

`brandZh` / `brandEn`、`homeBackground`（`solid` 纯深色默认 / `photo` 随机照片）、`deckCardMaxWidth`、`deckCardRatio`、`dateSource`（`auto` / `exif` / `filename`）、`timeZone`、`gridGap`、`gridTargetHeight`、`thumbWidth` / `thumbQuality` / `thumbFormat`。

`homeBackground` 默认 `solid` 是刻意的：背景照片即使压到 34% 亮度 + 降饱和，仍会给整屏蒙一层色偏，而卡片本身也是照片 —— 等于用一层照片的颜色影响你对另一层照片颜色的判断。

## 已知坑

| 坑 | 说明 |
| --- | --- |
| **主题 config 只合并 `[params]`** | `[imaging]` 之类的**根级配置不会从主题带过来**，必须写在站点自己的配置里。所以主题的 `config/_default/hugo.toml` 里只放 `params`。站点漏写 `[imaging]` 会让 JPEG 质量掉回默认 75 |
| 站点 TOML 裸键顺序 | 裸键（如 `theme`）必须写在所有 `[table]` 之前，写到 `[imaging]` 后面会被解析成 `imaging.xxx.theme` 而静默失效 |
| **改完要更新使用方的 submodule 指针** | `../my-photo` 以 submodule 引用本主题。改动流程：先推 `photo-gallery`，再去 `my-photo` 里更新 submodule 指针并提交，否则站点用的还是旧版 |
| 归档页去重 | 一张照片可能同时属于多个相册（靠站点侧的 `tags`），归档页和相册页都已按 `key` 去重，改这两处逻辑时别破坏这一点 |
| **`photo-list.html` 只对外给字符串** | 每项是 `thumb` / `full` / `key` / `ar` / `date` / `has` / `ym` / `y` / `tags`，**没有 `img` 资源对象**。调用方因此不需要知道照片是本地还是远程，也就不会对远程项误调 `.Resize`。要给缩略图加新的处理步骤，改 `thumb.html` 而不是改调用方 |
| 代理环境下远程图全部拉不到 | Hugo 按**解析后的 IP** 校验 `security.http.urls`，开着 fake-IP 代理时所有域名都解析成代理的保留地址（`198.18.x.x`），连普通图床域名都会被拒。解法是 `[security.http] proxyFromEnvironment = true` + 构建时带 `HTTP_PROXY`/`HTTPS_PROXY`。**别用 `urls = ['(?i)^https?://']` 绕过** —— 实测那样会把地址校验整个关掉（连 `127.0.0.1` 都能拉） |
| **404 会被永久缓存** | Hugo 把远程资源的 404 结果也写进缓存（`caches.getresource` 的 `maxAge = -1`）。**URL 改对了也不会重试**，必须先 `hugo --ignoreCache` 或清 `~/Library/Caches/hugo_cache`。排查「明明改好了还是取不到」时先想这条 |
| 远程图缓存不进仓库 | Hugo 把下载的远程图缓存在 `resources/`，而该目录已在 `.gitignore` 里 —— 换机器、CI、新克隆都要重新下载一遍，首次构建慢且需要联网 |

## 交付前检查

```bash
cd exampleSite && hugo 2>&1 | tail -20
```

确认无报错，且 `Processed images` 不为 0（为 0 说明缩略图管线没跑到）。

示例站点的「旅行」相册带两张 picsum 远程图，所以这一步**需要联网**（首次会下载，之后命中 `resources/` 缓存）。开着 fake-IP 代理时要带上代理环境变量：

```bash
cd exampleSite && HTTP_PROXY=http://127.0.0.1:1082 HTTPS_PROXY=http://127.0.0.1:1082 hugo 2>&1 | tail -20
```

只想验证本地链路时把那个相册里的 `remoteImages` 临时注释掉即可。

**改完主题务必回到 `../my-photo` 构建一次验证**，那里是真实使用场景。
