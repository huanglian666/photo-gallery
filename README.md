# Photo Gallery

一个以照片展示为核心的 Hugo 主题。首页是扑克牌扇形牌堆（每个相册一张牌），
点进去是等高行对齐的照片网格，另有按拍摄时间分组的归档页。

没有后台、没有数据库、没有运行时依赖，构建出来就是一堆静态文件。

**设计取向：只缩尺寸，不压画质。灯箱看大图永远是原图。**

---

## 特性

- **扑克牌扇形首页** —— 发牌入场、悬停时其余牌退让、拖拽时整副牌跟着手转，全部走弹簧物理
- **等高行对齐网格** —— 不是瀑布流，边缘整齐、更像作品集
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

### 换图床 / NAS

原图要挪到自建图床或 NAS 时，只需要改模板里生成 `full` 字段的那两行
（`layouts/albums/single.html` 和 `layouts/archive/list.html`），
把 `.img.RelPermalink` 换成你的图床 URL 前缀。前端不用动。

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
