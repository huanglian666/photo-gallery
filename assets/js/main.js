/**
 * 入口：按 <body data-page> 分发到对应页面的逻辑。
 *
 * 页面数据由模板用 jsonify 写在 <script id="page-data"> 里，
 * 不额外发请求。
 */
import { pageData, watchImages } from './util.js';
import { initLightbox } from './lightbox.js';
import { initDeck, initBackground } from './deck.js';
import { initGallery } from './gallery.js';
import { initArchive } from './archive.js';

const data = pageData();
const page = document.body.dataset.page;

if (page === 'home'){
  initDeck(data.albums, data.deck);
  initBackground(data.backgrounds);
} else {
  const lightbox = initLightbox();
  if (page === 'archive') initArchive(data.photos, lightbox);
  else                    initGallery(data.photos, lightbox, data.config);
}

// 模板里直接写死的图（比如卡片封面之外的）也要走淡入
watchImages(document);
