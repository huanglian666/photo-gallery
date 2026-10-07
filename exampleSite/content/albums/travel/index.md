---
title: "旅行"
englishName: "TRAVEL"
weight: 10

# 相册级标签：整个相册的照片都带上
tags: ["旅行", "2026"]

# 单图级标签：只给需要特写的照片写
resources:
  - src: "001.jpg"
    params:
      tags: ["海边", "日落"]
  - src: "002.jpg"
    params:
      tags: ["海边"]
  - src: "005.jpg"
    params:
      tags: ["夜景", "城市"]

# 远程图床：照片不在本地目录里，直接写完整 URL。
# 和上面的本地图混在同一个相册里，网格、灯箱、归档的表现完全一样。
#
# 缩略图由 Hugo 构建时下载后自己缩（受 thumbWidth/thumbQuality/thumbFormat 控制），
# 灯箱大图直接指向这个 URL，不会把原图抄一份到站点上。
remoteImages:
  # 只写 src：拍摄时间按 URL → EXIF 的顺序自动推断。
  # 这个示例站点用的 picsum 图既没有日期也没有 EXIF，
  # 所以它会归到归档页的「未标注时间」里。
  - src: "https://picsum.photos/seed/gallery-remote-1/1200/800.jpg"

  # 写 date：优先级最高，压过所有自动推断。
  # 图床普遍会剥掉 EXIF、文件名又是哈希串，这时候手写 date 最省事。
  - src: "https://picsum.photos/seed/gallery-remote-2/1200/800.jpg"
    date: "2026-07-15 18:30:00"
    tags: ["海边"]        # 单图级标签，和本地图一样参与跨相册归类
---
