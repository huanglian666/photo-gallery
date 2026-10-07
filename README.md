# Photo Gallery

一个以照片展示为核心的 Hugo 主题。首页是扑克牌扇形牌堆（每个相册一张牌），
点进去是等高行对齐的照片网格，另有按拍摄时间分组的归档页。

没有后台、没有数据库、没有运行时依赖，构建出来就是一堆静态文件。

**设计取向：只缩尺寸，不压画质。灯箱看大图永远是原图。**

---

## 特性

- **扑克牌首页，两套形态**（640px 断点自动切换，见下文「首页的两种形态」）
  - 宽屏：扇形展开，悬停时一张前推、其余退让，拖拽时整副牌跟着手转
  - 窄屏：横向一手牌，左右滑动挑选，居中那张自动前推放大，点一下进入
  - 全部走弹簧物理，发牌入场动效两套共用
- **等高行对齐网格** —— 不是瀑布流，边缘整齐、更像作品集
- **本地图 / 图床混用** —— 照片可以放本地目录，也可以直接写图床 URL，行为一致（见下文「远程图床」）
- **EXIF 拍摄时间归档** —— 自动读 `DateTimeOriginal`，按年月分组，带年份筛选轨
- **一行放不下就折叠** —— 归档页超出部分折成「+N」，点击就地展开，不跳页
- **灯箱** —— 点击放大、滚轮 / 双指缩放、拖动平移，最大 6×
- **懒加载** —— 图片解码后淡入，格子宽高提前算好，加载过程零抖动
- **零 JS 依赖** —— 弹簧积分器自己写的，没有 framer-motion / jQuery 之类

---

## 环境要求

- Hugo **extended** 版，`0.155.0` 或更高
  （需要 `js.Build` 打包 ES 模块，以及 `Image.Meta` 读 EXIF）
- 不需要 Node.js

---

## 安装

```bash
# 建站
hugo new site my-gallery && cd my-gallery

# 作为 submodule 拉主题（推荐，方便以后更新）
git init
git submodule add git@github.com:huanglian666/photo-gallery.git themes/photo-gallery
```

然后**把 `exampleSite/hugo.toml` 整个复制到你的站点根目录**，改掉 `baseURL` 和 `title`，
并把 `theme = "../.."` 改成 `theme = "photo-gallery"`。

> ⚠️ **不要只写 `baseURL` 和 `title`。** Hugo 会合并主题的 `[params]`，
> 但**不会合并主题的 `[imaging]`**。图片处理参数必须写在站点配置里，
> 否则 JPEG 质量会掉回 Hugo 默认的 75、重采样退回 `box` —— 对照片站是灾难。
> 另外 TOML 里裸键（如 `theme`）必须写在所有 `[table]` 之前，
> 写到 `[imaging]` 后面会被解析成 `imaging.xxx.theme`，静默失效。

---

## 内容结构

```
content/albums/
  travel/
    index.md         ← 相册元数据
    001.jpg          ← 照片直接扔进来，自动发现，不用登记
    002.jpg
  daily/
archive/             ← 归档页，跨相册自动汇总
```

**一个目录 = 一个相册。** 加相册就是建目录，加照片就是扔文件。

照片也可以不放本地，直接在 front matter 里写图床 URL（见下文「远程图床」），
两种来源混在同一个相册里行为完全一致。

相册的 `index.md`：

```yaml
---
title: "旅行"
englishName: "TRAVEL"
weight: 10          # 决定首页牌堆里从左到右的顺序
---
```

---

## 拍摄时间

归档页靠每张照片的拍摄时间分组，获取顺序：

1. **EXIF `DateTimeOriginal`** —— 手机原图必然带，正常情况下都走这条
2. **相册 front matter 的 `photoDate`** —— 显式兜底
3. **都没有** —— 归入归档页末尾的「未标注时间」，不会丢

### 两个坑

**微信 / QQ 传输会剥掉 EXIF。** 照片经微信转发压缩后，拍摄时间、机型、GPS 全没了，
进站后会掉进「未标注时间」。想保留元数据就用 AirDrop、数据线、或网盘传原图。

**HEIC 格式 Hugo 解不了。** iPhone 默认拍 HEIC，要么在
「设置 → 相机 → 格式」里改成「兼容性最佳」（存 JPEG），要么进站前转换：

```bash
sips -s format jpeg *.HEIC --out ./jpeg/
```

### 时区

EXIF 不存时区，只有「拍摄当时的墙上时间」。Hugo 会套用站点 `timeZone`
但保留墙上时间不变 —— 在巴黎拍的 08:00 和在上海拍的 08:00 归到同一天。
归档只用到年 / 月，这个处理是对的。

---

## 标签

Hugo 里的图片是 **resource** 不是页面，没有自己的 front matter。标签走两级，
都写在相册的 `index.md` 里：

```yaml
---
title: "旅行"
englishName: "TRAVEL"
weight: 10

# 相册级：整个相册的照片都带上，写一次就够
tags: ["旅行", "海边"]

# 单图级：只给需要特写的照片写，按文件名匹配
resources:
  - src: "001.jpg"
    params:
      tags: ["日落", "长焦"]
  - src: "005.jpg"
    params:
      tags: ["夜景"]
---
```

每张照片最终的标签 = **单图级 ∪ 相册级**。比如 `001.jpg` 会拿到
`["日落", "长焦", "旅行", "海边"]`，显示在灯箱左上角。

图床上的照片（`remoteImages`）单图级标签直接写 `tags`，不套 `params` 那层 ——
那层是 Hugo 保留键 `resources` 的要求，不是本主题的约定。详见「远程图床」。

> 因为相册 front matter 用了 `tags` 这个键，Hugo 会顺带生成 `/tags/` 分类页。
> 站点配置里的 `disableKinds = ["taxonomy", "term", ...]` 就是关掉它 —— 别忘了写。
>
> 想要「点标签看全部相关照片」的标签索引页，数据结构已经备好了
> （每张照片都带 `tags`），在 `layouts/` 里加一个遍历所有相册按标签聚合的页面即可。

---

## 图片处理

| 用途 | 处理 |
|---|---|
| 网格缩略图 / 牌面封面 | 缩到 `thumbWidth`（默认 800px），保持原格式，质量 95 |
| **灯箱看大图** | **原图，完全不经处理** |

灯箱直接指向原始文件，所以点开看到的永远是原图，和在电脑上打开一模一样。
缩略图那一步不是压缩画质，是不把 4000px 的原图塞进 300px 的格子。

照片放在图床上的话，缩略图照样由 Hugo 生成、灯箱照样指原图 —— 见下文「远程图床」。

配置在**站点**的 `hugo.toml`（不是主题的）：

```toml
[imaging]
  resampleFilter = "Lanczos"

[imaging.jpeg]
  quality = 95

[params]
  thumbWidth   = 800     # 缩略图宽度；网格再宽也不会超过这个值
  thumbQuality = 95      # 95 基本视觉无损，想更狠可以给 100
  thumbFormat  = "auto"  # auto = 保持原格式不转码
                         # webp = 转 WebP，体积更小、画质等价
```

---

## 远程图床

照片不放本地，直接写图床 URL 也可以。两种来源可以在同一个相册里混用，
网格、灯箱、归档、首页牌堆的表现完全一样。

在相册的 `index.md` 里加 `remoteImages`：

```yaml
remoteImages:
  - src: "https://cdn.example.com/2026/08/01/IMG_20260801_212545.jpg"
  - src: "https://other-host.net/a1b2c3d4.jpg"
    date: "2026-08-01 21:25:45"   # 可选，优先级最高
    tags: ["美好瞬间"]              # 可选，和本地图一样参与跨相册归类
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `src` | 是 | 完整 URL。图床换域名要逐条改 |
| `date` | 否 | 拍摄时间，压过所有自动推断 |
| `tags` | 否 | 单图级标签，参与跨相册多对多归类 |

### 缩略图和原图分别在哪

| | 来自 |
|---|---|
| 网格缩略图 / 牌面封面 | **Hugo 构建时下载后自己缩**，发布到你的站点 |
| **灯箱看大图** | **图床原始 URL，不经任何处理** |

缩略图仍然走本地图那套参数（`thumbWidth` / `thumbQuality` / `thumbFormat`），
因为等高行对齐的网格需要每张图的宽高比，而远程图的宽高比只有下载后才知道。

灯箱直接指向图床地址，**不会**把原图发布到站点上 —— 站点只托管缩略图。

### 拍摄时间

和本地图同一套优先级，远程项多一条「从 URL 推断」：

```
front matter 的 date  →  URL 里的日期  →  EXIF  →  相册级 photoDate  →  未标注时间
```

从 URL 推断时会**去掉 query 和 fragment**（签名链接的参数里常带时间戳，
会把日期认错），保留路径，所以按日期分目录的图床（`/2026/08/01/AbCdEf.jpg`）
也能识别 —— 这类 URL 的文件名是纯哈希，日期只在路径里。

远程项会**关掉「13 位毫秒时间戳」那条规则**。它只认数字串不认上下文，
CDN 哈希里凑出 13 位数字就会被当成微信导出名（`mmexport1778327064654.jpg`），
凭空造出一个日期。代价是微信导出名放到图床上认不出来 —— 写显式 `date` 即可。

图床普遍会剥掉 EXIF、文件名又是哈希串，这种情况下自动推断往往落空，
**手写 `date` 最省事**。

### 注意事项

- **首次构建会下载全部远程图**（之后命中 `resources/` 缓存）。缓存目录在
  `.gitignore` 里，所以换机器、CI、新克隆都要重新下载一遍，构建需要联网。
- **图床地址要能匿名访问**。Hugo 下载远程图受 `security.http.urls` 限制，
  默认会拦掉写 IP 的、`localhost` 的、URL 带凭据的地址。**开着 fake-IP 代理时
  所有域名都会被解析成代理的保留地址，连普通图床域名也会被拒**，报错形如
  `dial tcp 198.18.0.65:443: access denied`。

  解法是让 Hugo 走代理，而不是关掉校验：

  ```toml
  [security.http]
    proxyFromEnvironment = true
  ```

  ```bash
  HTTP_PROXY=http://127.0.0.1:1082 HTTPS_PROXY=http://127.0.0.1:1082 hugo
  ```

  > 别用 `urls = ['(?i)^https?://']` 绕过 —— 那样会把 Hugo 的地址校验整个关掉。
- **取不到的图会被永久缓存**。Hugo 把远程资源的 404 结果也写进缓存，**URL 改对了
  也不会重试**。遇到「明明改好了还是取不到」先 `hugo --ignoreCache`
  （或清 `~/Library/Caches/hugo_cache`）。
- **灯箱不带 Referer 请求大图**（`referrerpolicy="no-referrer"`），
  否则做防盗链的图床看到站点域名会返回 403 —— 会出现「格子里有图、点开 403」。
- **图床挂了不会中断构建**：取不到的图会打一条 WARN 并跳过，其余照常渲染。
  front matter 写错（比如漏了 `src`）同样只告警，不中断。

---

## 首页的两种形态

`layouts/index.html` 只有一份牌堆 DOM，形态由 `assets/js/deck.js` 按屏宽切换。

| 形态 | 触发条件 | 交互 |
|---|---|---|
| `fan` | 视口 ≥ 640px | 扇形展开。悬停时一张前推放大、其余下沉缩小并让开；拖拽时整副牌跟着手转，松手弹簧回正 |
| `rail` | 视口 < 640px | 横向一手牌。左右滑动挑选，停在屏幕正中的那张自动前推放大；点两侧的牌先把它滑到中间，再点居中那张才进入 |

**为什么手机上不沿用扇形**：扇形靠 hover 选中，而触屏没有 hover 语义；
而且扇形总宽随分类数量线性增长，分类一多就溢出屏幕，靠边的牌点不中。
`rail` 的牌宽与分类数量无关（`cw = clamp(170, vw×0.58, 252)`），
相邻两张露出的宽度固定为 `cw × 0.46`，分类再多也只是要滑得更久。

底部提示文案按形态显示不同内容，纯 CSS 切换（`.hint-wide` / `.hint-narrow`），
没有额外 JS。

**跨过 640px 时**（转屏、拖窗口）会整副重建，但不会重播发牌动效。

---

## 全部可配置项

| 参数 | 默认 | 说明 |
|---|---|---|
| `brandZh` | `影集` | 左上角中文站名 |
| `brandEn` | `PHOTOGRAPHY` | 站名下方的小字 |
| `deckCardMaxWidth` | `380` | 单张牌最大宽度 px，实际还受视口宽高约束 |
| `deckCardRatio` | `1.5` | 牌高 / 牌宽，2:3 是标准扑克比例 |
| `gridGap` | `8` | 网格间距 px |
| `gridTargetHeight` | `296` | 桌面端目标行高 px，窄屏自动缩小 |
| `thumbWidth` | `800` | 缩略图宽度 px |
| `thumbQuality` | `95` | 缩略图质量 |
| `thumbFormat` | `auto` | `auto` 保持原格式；`webp` 转码 |

---

## 本地预览示例站点

```bash
git clone git@github.com:huanglian666/photo-gallery.git
cd photo-gallery/exampleSite
hugo server
```

示例照片是从 picsum.photos 拉的占位图，带人工写入的 EXIF 拍摄时间，
用来在没有真实照片时预览效果。重新生成：

```bash
python3 tools/make-placeholders.py            # 全部
python3 tools/make-placeholders.py travel     # 只生成某个相册
```

脚本是幂等的，已存在且完整的文件会跳过。

---

## 开发笔记

几个踩过的坑，改模板前值得看一眼：

- **`jsonify` 必须再过一道 `safeJS`。** 否则 Go 的 html/template 会把
  `<script>` 里的字符串当 JS 再转义一次，前端拿到的是字符串而不是对象。
- **日期在 `.Meta.Date`，不在 `.Meta.Exif.Date`。** Hugo 0.155 起
  `Image.Meta` 的 `.Exif` 是个 map（存 `DateTimeOriginal` 等原始标签），
  不是结构体；写成 `.Meta.Exif.Date` 会在 map 上取不到键、静默返回 nil，
  而且 `has` 标志还会被置成 true，非常难查。
- **牌堆的悬停判定用几何，不用 DOM 命中测试。** 悬停会让牌上浮放大、
  其余牌缩小位移，牌在光标底下动；用 DOM 判定会形成「悬停改布局、
  布局改悬停」的反馈环，从一张牌移向另一张时容易误触到第三张。
  改用静止扇形的几何：每张牌独占一条宽 `stepX` 的竖带，固定不动。
- **最右边那张牌没被任何牌盖住**，整张都该可点，竖带要单独夹一下边界。
- **图片淡入要靠 `watchImages()` 补 `is-loaded`。** 命中缓存的图
  （`complete && naturalWidth`）不会再触发 `load` 事件，不补就会永远停在 `opacity: 0`。

`docs/prototype.html` 是最早的单文件交互原型，用来定视觉基调的，
可以独立在浏览器打开，不参与构建。

---

## License

MIT
