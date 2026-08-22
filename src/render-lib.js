// render-lib.js - 吊车站群渲染核心库
// 纯函数 + 数据加载，供静态生成（generate.js）与 Node 动态服务（server.js）共用。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TEMPLATE_DIR = path.join(ROOT, 'templates');

const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8'));
const siteData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sites.json'), 'utf8'));
const corpusData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'corpus.json'), 'utf8'));
let extendedData = { count: 0, articles: [] };
try {
  extendedData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'extended-corpus.json'), 'utf8'));
} catch (e) {
  // 扩展语料缺失时仅使用基础语料
}

const ALL_SITES = siteData.sites;
const ARTICLES = [...corpusData.articles, ...extendedData.articles];
const EXTENDED_IDS = new Set(extendedData.articles.map((a) => `${a.channel}/${a.id}`));
const articleMap = new Map(ARTICLES.map((a) => [`${a.channel}/${a.id}`, a]));
const siteBySlug = new Map(ALL_SITES.map((s) => [s.slug, s]));
const CONTENT_FILES = [
  path.join(DATA_DIR, 'config.json'),
  path.join(DATA_DIR, 'sites.json'),
  path.join(DATA_DIR, 'corpus.json'),
  path.join(DATA_DIR, 'extended-corpus.json'),
  ...fs.readdirSync(TEMPLATE_DIR).map((f) => path.join(TEMPLATE_DIR, f)),
];

// 服务站点集合：默认省市两级 + 韶关区县（与当前部署一致）；serveAllSites=true 时包含全部区县
const SERVE_SITES = config.serveAllSites
  ? ALL_SITES
  : ALL_SITES.filter((s) => s.level !== 'district' || s.tier === 1);

const LIST_CHANNELS = [
  'qichediaochuzu',
  'suichediaochuzu',
  'zhebidiaochuzu',
  'gaokongchechuzu',
  'yuntichechuzu',
  'daolujiuyuandiaoche',
  'fwxm',
  'fuwuanli',
  'news',
  'faq',
  'guanyuwomen',
  'lianxiwomen',
  'map',
];

const CHANNEL_TITLES = {
  qichediaochuzu: (c) => `${c}汽车吊出租电话,${c}附近直臂吊租赁`,
  suichediaochuzu: (c) => `${c}随车吊出租电话,${c}附近随车吊租赁`,
  zhebidiaochuzu: (c) => `${c}折臂吊出租电话,${c}附近老鹰吊租赁`,
  gaokongchechuzu: (c) => `${c}高空车出租电话,${c}附近路灯维修车租赁`,
  yuntichechuzu: (c) => `${c}云梯车出租电话,${c}附近上料车租赁`,
  daolujiuyuandiaoche: (c) => `${c}道路救援吊车电话,${c}附近救援吊车租赁`,
  fwxm: (c) => `${c}吊车出租服务项目`,
  fuwuanli: (c) => `${c}吊车出租服务案例`,
  news: (c) => `${c}吊车出租常识`,
  faq: (c) => `${c}吊车出租常见问题`,
  guanyuwomen: (c) => `${c}吊车出租介绍`,
  lianxiwomen: (c) => `${c}吊车出租联系电话`,
  map: (c) => `${c}吊车出租更多分站`,
};

const CHANNEL_LABELS = {
  qichediaochuzu: '汽车吊出租',
  suichediaochuzu: '随车吊出租',
  zhebidiaochuzu: '折臂吊出租',
  gaokongchechuzu: '高空车出租',
  yuntichechuzu: '云梯车出租',
  daolujiuyuandiaoche: '道路救援吊车',
  fwxm: '服务项目',
  fuwuanli: '服务案例',
  news: '新闻中心',
  faq: '常见问题',
  guanyuwomen: '关于我们',
  lianxiwomen: '联系我们',
  map: '城市分站',
};

const ARTICLE_CHANNELS = [
  'faq',
  'news',
  'fwxm',
  'fuwuanli',
  'qichediaochuzu',
  'suichediaochuzu',
  'zhebidiaochuzu',
  'gaokongchechuzu',
  'yuntichechuzu',
  'daolujiuyuandiaoche',
];
const PAGE_SIZE = config.listPageSize || 10;
const DEFAULT_THUMB = '/uploads/image/20241129/bfc02d0adccb5881620cc54b6d777a66.jpg';

// ---------- 基础工具 ----------
function baseUrlOf(site) {
  return `https://${site.slug}.${config.domain}`;
}

function getSite(slug) {
  return siteBySlug.get(slug) || null;
}

function getArticle(channel, id) {
  return articleMap.get(`${channel}/${id}`) || null;
}

function isExtendedArticle(channel, id) {
  return EXTENDED_IDS.has(`${channel}/${id}`);
}

// ---------- 列表分页 ----------
function getChannelArticles(channel) {
  return ARTICLES.filter((a) => a.channel === channel).sort((a, b) => b.id - a.id);
}

function channelPageCount(channel) {
  return Math.max(1, Math.ceil(getChannelArticles(channel).length / PAGE_SIZE));
}

function extractArticleThumb(article) {
  if (!article.html) return DEFAULT_THUMB;
  const m = article.html.match(/<img[^>]*src="(\/uploads\/[^"]+)"/);
  return m ? m[1] : DEFAULT_THUMB;
}

function articleListTitle(site, article) {
  const extended = isExtendedArticle(article.channel, article.id);
  const raw = extended ? article.title : article.title.replace(/ -?亿立达24小时吊车租用公司$/, '').trim();
  return extended ? fillPlaceholders(raw, site) : replaceText(raw, site);
}

function articleListDesc(site, article, max) {
  const extended = isExtendedArticle(article.channel, article.id);
  const raw = extended ? article.description : article.description;
  const t = (extended ? fillPlaceholders(raw, site) : replaceText(raw, site)).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function renderListItems(site, channel, page) {
  const total = channelPageCount(channel);
  const p = Math.min(Math.max(1, page), total);
  const articles = getChannelArticles(channel).slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const base = `${baseUrlOf(site)}/${channel}`;
  const typeA = !/class="list_border"/.test(fs.readFileSync(path.join(TEMPLATE_DIR, `list-${channel}.html`), 'utf8'));
  if (typeA) {
    const items = articles
      .map((a) => {
        const title = articleListTitle(site, a);
        return `\n        <a href="${base}/${a.id}.html">\n            <div class="each">\n                <div class="float_l">\n                    <div><img src="${extractArticleThumb(a)}" alt="${title}"></div>\n                    <h2>${title}</h2>\n                    <p>${articleListDesc(site, a, 100)}</p>\n                </div>\n                <div class="clear"></div>\n            </div>\n        </a>`;
      })
      .join('\n');
    return `<div class="list1">\n${items}\n        </div>`;
  }
  const items = articles
    .map((a) => {
      const title = articleListTitle(site, a);
      return `\n        <li>\n            <a href="${base}/${a.id}.html">\n                <div class="list_border">\n                    <div class="list_img">\n                        <img src="${extractArticleThumb(a)}" alt="${title}">\n                    </div>\n                    <div class="list_text">\n                        <p>${title}</p>\n                        <span>${articleListDesc(site, a, 120)}</span>\n                    </div>\n                </div>\n            </a>\n        </li>`;
    })
    .join('\n');
  return `<div class="list">\n            <ul>\n${items}\n            </ul>\n        </div>`;
}

function renderPagination(site, channel, page, total) {
  const base = `${baseUrlOf(site)}/${channel}`;
  const count = getChannelArticles(channel).length;
  const first = page === 1 ? '<p>首页</p>' : `<a href="${base}/">首页</a>`;
  const prev = page === 1 ? '<p>上一页</p>' : `<a href="${page === 2 ? base + '/' : base + '/page/' + (page - 1)}" title="上一页">上一页</a>`;
  let nums = '';
  for (let i = 1; i <= total; i++) {
    nums += i === page ? `<a href="" class="cur">${i}</a>` : `<a href="${i === 1 ? base + '/' : base + '/page/' + i}">${i}</a>`;
  }
  const next = page >= total ? '<p>下一页</p>' : `<a href="${base}/page/${page + 1}" title="下一页">下一页</a>`;
  const last = page >= total ? '<p>尾页</p>' : `<a href="${base}/page/${total}" title="尾页">尾页</a>`;
  return `<div class="pagination">${first} ${prev}${nums} ${next} ${last}<p class="pageRemark">共<b>${total}</b>页<b>${count}</b>条数据</p></div>`;
}

function divEndIndex(html, startIndex) {
  let depth = 0;
  const re = /<div[\s>]|<\/div>/g;
  re.lastIndex = startIndex;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') {
      depth--;
      if (depth === 0) return m.index + 6;
    } else {
      depth++;
    }
  }
  return -1;
}

// 动态 lastmod：优先取配置值；为空时取数据/模板最后修改日期（本地时区）
function contentDate() {
  if (config.lastmod) return config.lastmod;
  // 访问日前一天（本地时区），增加可信度
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 扩展文章占位符填充：{city} {phone} {phoneDashed} {brand}
function fillPlaceholders(text, site) {
  return text
    .split('{phoneDashed}').join(config.phoneDashed)
    .split('{phone}').join(config.phone)
    .split('{city}').join(site.name)
    .split('{brand}').join(config.brand);
}

// ---------- 号码清洗 + 品牌/域名替换 ----------
function replaceText(t, site) {
  let s = t;
  const base = baseUrlOf(site);
  s = s.split('http://www.ylddzgs.com').join(base);
  s = s.split('https://www.ylddzgs.com').join(base);
  s = s.split('www.ylddzgs.com').join(`${site.slug}.${config.domain}`);
  s = s.split('ylddzgs.com').join(config.domain);
  s = s.split(`${base}/i`).join(`${base}/`);
  s = s.split('东莞地区台班约').join(`${site.name}地区台班约`);
  s = s.split('13662689776').join(config.phone);
  s = s.split('136-6268-9776').join(config.phoneDashed);
  s = s.split('136 6268 9776').join('137 2655 7418');
  // 清除残留错误号码 18098978616（含变体）
  s = s.split('18098978616').join('');
  s = s.split('180-9897-8616').join('');
  s = s.split('180 9897 8616').join('');
  // 清除其他外来号码（竞对/示例号码）→ 统一替换为主电话
  s = s.replace(/183[\s-]?3161[\s-]?3053|13965433487/g, config.phone);
  s = s.split('亿立达24小时吊车租用公司').join('林师傅专业吊装24小时吊车租用公司');
  s = s.split('亿立达设备租赁有限公司').join(config.teamName);
  s = s.split('亿立达吊装公司').join(config.teamName);
  s = s.split('亿立达设备租赁').join(config.teamName);
  s = s.split('速吊网').join('林师傅');
  s = s.split('即吊网').join('林师傅');
  s = s.split('亿立达').join('林师傅');
  s = s.split('粤ICP备2022094665号-1').join(config.icp);
  s = s.split('Copyright © 2024').join(`Copyright © ${config.year}`);
  if (site.slug !== 'shaoguan') s = s.split('韶关').join(site.name);
  return s;
}

function substitute(html, site) {
  let h = replaceText(html, site);
  h = h.split('jquery-2.14.min.js').join('jquery-2.1.4.min.js');
  h = h.replace(/<yunu:if[\s\S]*?<\/yunu:if>/g, '');
  h = h.replace(/<meta name="sogou_site_verification"[^>]*>\s*/gi, '');
  h = h.replace(/<meta name="shenma-site-verification"[^>]*>\s*/gi, '');
  return h;
}

// ---------- head 工具 ----------
function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
}

function setMeta(html, name, content) {
  const re = new RegExp(`<meta\\s+name="${name}"[^>]*>`);
  if (re.test(html)) return html.replace(re, `<meta name="${name}" content="${content}">`);
  return html.replace('</head>', `    <meta name="${name}" content="${content}">\n</head>`);
}

function setOgDescription(html, content) {
  if (/<meta property="og:description"[^>]*>/i.test(html)) {
    return html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${content}">`);
  }
  return html.replace('</head>', `    <meta property="og:description" content="${content}">\n</head>`);
}

function cleanDesc(s) {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\/\s*（/g, '（')
    .replace(/\/\s*$/g, '')
    .trim();
}

// 富文本 head 描述：吊车业务全景介绍 + 主电话高亮
function richDescription(site) {
  const c = site.name;
  return `${c}吊车出租电话${config.phone}（${config.phoneDashed}），${config.brand}提供随车吊出租、汽车吊出租、折臂吊出租、高空车出租、云梯车出租、道路救援吊车等全系列起重设备租赁服务，8吨-800吨型号齐全，24小时上门、持证司机、台班/日租/月租灵活，就近派车、价格透明，${c}及周边随叫随到。`;
}

function setCanonical(html, url) {
  let h = html;
  if (/<link rel="canonical"[^>]*>/i.test(h)) {
    h = h.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${url}">`);
  } else {
    h = h.replace('</head>', `    <link rel="canonical" href="${url}">\n</head>`);
  }
  if (/<meta property="og:url"[^>]*>/i.test(h)) {
    h = h.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${url}">`);
  } else {
    h = h.replace('</head>', `    <meta property="og:url" content="${url}">\n</head>`);
  }
  const ogImage = url.split('/').slice(0, 3).join('/') + '/uploads/image/20260707/d0637e8f3fa18694ac9cabe771ec21bb.png';
  if (/<meta property="og:image"[^>]*>/i.test(h)) {
    h = h.replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${ogImage}">`);
  } else {
    h = h.replace('</head>', `    <meta property="og:image" content="${ogImage}">\n</head>`);
  }
  return h;
}

function setJsonLd(html, json) {
  const block = `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n    </script>`;
  if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(html)) {
    return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, block);
  }
  return html.replace('</head>', `    ${block}\n</head>`);
}

// ---------- JSON-LD ----------
const FAQ_ITEMS = [
  ['{city}35吨吊车租赁多少钱？', '<p>35吨汽车吊{city}地区台班约1600–2200元，超时按台班÷8计费，进出场视距离收300–800元。{brand}可安排35吨、50吨、80吨就近派车。</p>'],
  ['{city}附近吊车出租的电话是多少？', '<p>本地就近吊车出租统一联系{brand}24小时热线，全天畅通接听吊装租赁咨询，来电后客服按您所在片区匹配待命吊车，市区半小时可抵达施工现场。</p>'],
  ['{city}吊机出租需要提前预约吗？', '<p>高峰期、节假日建议提前预约，普通时段可随叫随派车。</p>'],
  ['{city}租赁小吊车一般多钱？', '<p>8吨小吊车台班约800–1000元，随车吊8吨约850–1050元，小时租50–80元/h起。{brand}小车型镇内大多免进场。</p>'],
  ['{city}吊车出租网哪个靠谱？', '<p>可参考本地生活平台商家页，但签约前需核实实体公司与资质。{brand}在线下设有办公点可实地考察，作业合同正规。</p>'],
  ['{city}附近吊车租赁怎么联系？', '<p>拨打{brand}24小时热线：报地址→推荐吨位→安排司机→到场作业→签单结算。</p>'],
  ['{city}附近的出租吊车怎么比价？', '<p>比三项：是否含司机+燃油+进出场、车龄及年检是否有效、保险额度及理赔历史。{brand}明列以上三项，不作低价钓鱼后加价。</p>'],
  ['{city}租小吊车指几吨？', '<p>多指8吨或更小随车吊。联系{brand}说明巷宽及限高，推荐8吨折臂随车吊（最小通行宽约2.05米）。</p>'],
  ['{city}高空作业可以租吊机吗？', '<p>可以，高空安装、维修、广告牌拆装都能租用专业高空作业吊机。</p>'],
  ['{city}吊车出租一天大概多少钱？', '<p>吊车租金按吨位、地区、施工难度定价，常规按台班计费，吨位越大价格越高，城郊和市区收费也有差异。</p>'],
];

function faqJsonLd(site) {
  const city = site.name;
  return FAQ_ITEMS.map(([q, a]) => ({
    '@type': 'Question',
    name: fillPlaceholders(q, site),
    acceptedAnswer: { '@type': 'Answer', text: fillPlaceholders(a, site) },
  }));
}

function homeJsonLd(site) {
  const base = baseUrlOf(site);
  const city = site.name;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${base}/#business`,
        name: config.brand,
        telephone: config.phone,
        image: `${base}/uploads/image/20260707/d0637e8f3fa18694ac9cabe771ec21bb.png`,
        address: {
          '@type': 'PostalAddress',
          addressRegion: site.province,
          addressLocality: site.name,
          streetAddress: config.address,
        },
        areaServed: `${city}及周边全部乡镇`,
        url: `${base}/`,
        openingHours: 'Mo-Su 00:00-24:00',
        priceRange: '面议',
        description: `${city}本地24小时吊车出租、叉车租赁、设备吊装、厂房搬迁、道路救援服务，自有8T-800T汽车吊，持证作业，免费上门勘测。`,
      },
      {
        '@type': 'Service',
        name: `${city}吊车出租|叉车租赁|设备吊装|道路救援`,
        serviceType: ['吊车出租', '叉车租赁', '设备吊装', '厂房搬迁', '道路救援拖车'],
        provider: { '@type': 'Organization', name: config.brand },
        areaServed: `${city}全域覆盖`,
        description: `本地24小时起重设备租赁服务，免费上门勘测，就近派车，台班/日租/月租多种租赁方案，无隐形收费。`,
        priceRange: '面议',
      },
      { '@type': 'FAQPage', mainEntity: faqJsonLd(site) },
    ],
  };
}

function articleJsonLd(site, title, desc, canonical, channel) {
  const date = contentDate();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: title,
        datePublished: date,
        description: desc,
        author: { '@type': 'Organization', name: config.brand },
        publisher: { '@type': 'Organization', name: config.brand },
        mainEntityOfPage: canonical,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${baseUrlOf(site)}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: CHANNEL_LABELS[channel] || '频道',
            item: `${baseUrlOf(site)}/${channel}/`,
          },
        ],
      },
    ],
  };
}

// ---------- 正文容器替换 ----------
function replaceArticleBody(html, newBody) {
  const open = html.match(/<div[^>]*class="[^"]*article-body[^"]*"[^>]*>/);
  if (!open) return html;
  const openTag = open[0];
  const start = open.index;
  let depth = 1;
  const re = /<div[\s>]|<\/div>/g;
  re.lastIndex = start + openTag.length;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') {
      depth--;
      if (depth === 0) break;
    } else {
      depth++;
    }
  }
  if (!m) return html;
  // 保留 article-body 自身的闭合 </div>（m.index 指向该闭合标签），只替换中间内容
  return html.slice(0, start + openTag.length) + newBody + html.slice(m.index);
}

function loadOverride(site, article) {
  const p = path.join(DATA_DIR, 'rewrites', site.slug, article.channel, `${article.id}.json`);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------- map 页 ----------
function buildMapBody(selectedSites) {
  const byProvince = new Map();
  for (const s of selectedSites) {
    if (!byProvince.has(s.provinceSlug)) byProvince.set(s.provinceSlug, []);
    byProvince.get(s.provinceSlug).push(s);
  }
  const provNames = new Map(ALL_SITES.filter((s) => s.level === 'province').map((s) => [s.provinceSlug, s.name]));
  const dls = [];
  const quickNav = [];
  for (const [provSlug, list] of [...byProvince].sort((a, b) => a[0].localeCompare(b[0]))) {
    const provName = provNames.get(provSlug) || provSlug;
    const provSite = list.find((s) => s.level === 'province');
    const provHref = provSite ? baseUrlOf(provSite) : `https://${provSlug}.${config.domain}`;
    const links = list
      .filter((s) => s.level !== 'province')
      .map((s) => `<a href="${baseUrlOf(s)}">${s.name}</a>`)
      .join('\n');
    dls.push(`<dl>\n            <dt><a href="${provHref}">${provName}</a></dt>\n            <dd>\n                ${links}\n            </dd>\n        </dl>`);
    if (provSite) quickNav.push(`<a href="${baseUrlOf(provSite)}">${provName}</a>`);
  }
  const hot = quickNav.length
    ? `<div class="title hot">\n            <h2>热门城市</h2>\n        </div>\n        <p>\n            ${quickNav.join(' ')}\n        </p>`
    : '';
  return `<div class="index_fuwu1">\n    <div class="center">\n        ${hot}\n        <div class="title">\n            <h2>按省份选择</h2>\n        </div>\n        ${dls.join('\n        ')}`;
}

// ---------- 页面渲染 ----------
function renderHome(site) {
  const base = baseUrlOf(site);
  let html = substitute(fs.readFileSync(path.join(TEMPLATE_DIR, 'home.html'), 'utf8'), site);
  html = html.replace('<h3>韶关</h3>', `<h3>${site.name}</h3>`);
  const title = `${site.name}吊车出租电话,${site.name}附近吊车租赁,${config.brandSuffix}`;
  const desc = richDescription(site);
  const kw = `${site.name}吊车出租电话, ${site.name}吊车租赁电话, ${site.name}随车吊出租, ${site.name}汽车吊出租, ${site.name}折臂吊出租, ${site.name}高空车出租, ${site.name}云梯车出租, ${site.name}道路救援吊车, ${site.name}吊车租赁公司, ${config.phone}`;
  html = setTitle(html, title);
  html = setMeta(html, 'keywords', kw);
  html = setMeta(html, 'description', desc);
  html = setOgDescription(html, desc);
  html = setCanonical(html, `${base}/`);
  html = setJsonLd(html, homeJsonLd(site));
  return html;
}

function renderList(site, channel, page = 1) {
  const tplPath = path.join(TEMPLATE_DIR, `list-${channel}.html`);
  if (!fs.existsSync(tplPath)) return null;
  let html = substitute(fs.readFileSync(tplPath, 'utf8'), site);
  const titleFn = CHANNEL_TITLES[channel];
  const title = titleFn ? `${titleFn(site.name)},${config.brandSuffix}` : `${site.name}${channel},${config.brandSuffix}`;
  html = setTitle(html, title);
  html = setMeta(html, 'keywords', titleFn ? `${site.name}吊车出租电话,${titleFn(site.name)},${config.phone}` : `${site.name}${channel},${config.phone}`);
  const baseDesc = richDescription(site);
  html = setMeta(html, 'description', baseDesc);
  html = setOgDescription(html, baseDesc);
  const totalPages = ARTICLE_CHANNELS.includes(channel) ? channelPageCount(channel) : 1;
  const p = Math.min(Math.max(1, page), totalPages);
  html = setCanonical(html, p === 1 ? `${baseUrlOf(site)}/${channel}/` : `${baseUrlOf(site)}/${channel}/page/${p}`);
  if (channel === 'map') {
    const mapBody = buildMapBody(SERVE_SITES);
    const start = html.indexOf('<div class="index_fuwu1">');
    const end = html.lastIndexOf('</dl>');
    if (start >= 0 && end > start) {
      html = html.slice(0, start) + mapBody + html.slice(end + '</dl>'.length);
    }
  } else if (ARTICLE_CHANNELS.includes(channel)) {
    // 生成列表项（按模板容器类型 A/B）
    const container = renderListItems(site, channel, p);
    const cStart = html.indexOf(container.startsWith('<div class="list1">') ? '<div class="list1">' : '<div class="list">');
    const cEnd = cStart >= 0 ? divEndIndex(html, cStart) : -1;
    if (cStart >= 0 && cEnd > cStart) {
      html = html.slice(0, cStart) + container + html.slice(cEnd);
    }
    // 分页条（模板有则替换，无则插入列表后）
    const pagHtml = renderPagination(site, channel, p, totalPages);
    const pStart = html.indexOf('<div class="pagination">');
    if (pStart >= 0) {
      const pEnd = divEndIndex(html, pStart);
      if (pEnd > pStart) html = html.slice(0, pStart) + pagHtml + html.slice(pEnd);
    } else if (cEnd > 0) {
      html = html.slice(0, cEnd) + pagHtml + html.slice(cEnd);
    }
  }
  return html;
}

function renderArticle(site, channel, id) {
  const article = getArticle(channel, id);
  if (!article) return null;
  const extended = isExtendedArticle(channel, id);
  const override = loadOverride(site, article);
  let html;
  if (extended) {
    const frame = fs.readFileSync(path.join(TEMPLATE_DIR, 'article-frame.html'), 'utf8');
    html = substitute(frame, site);
    html = replaceArticleBody(html, fillPlaceholders(article.body, site));
  } else {
    html = substitute(article.html, site);
    if (override && override.body) html = replaceArticleBody(html, override.body);
  }
  const base = baseUrlOf(site);
  const canonical = `${base}/${channel}/${id}.html`;
  // 页面可见发布时间与 sitemap 保持一致（动态昨天）
  html = html.replace(/发布时间：\d{4}-\d{2}-\d{2}/, `发布时间：${contentDate()}`);
  let baseTitle;
  if (extended) {
    baseTitle = fillPlaceholders(article.title, site);
  } else {
    baseTitle = replaceText(article.title.trim().replace(/^(.+?)\s*-\s*亿立达24小时吊车租用公司$/, '$1'), site);
    if (channel === 'faq') baseTitle = `${site.name}${baseTitle}`;
  }
  const fullTitle = `${baseTitle} -${config.brandSuffix}`;
  const rawDesc = extended ? fillPlaceholders(article.description, site) : replaceText(article.description, site);
  const desc = cleanDesc(
    rawDesc + `。${site.name}吊车出租24小时热线：${config.phoneDashed}，随车吊/汽车吊/折臂吊/高空车/云梯车/道路救援吊车随叫随到。`
  );
  const kw = cleanDesc(
    (extended ? fillPlaceholders(article.keywords, site) : replaceText(article.keywords, site)) + `,${config.phone}`
  );
  html = setTitle(html, fullTitle);
  html = setMeta(html, 'description', desc);
  html = setMeta(html, 'keywords', kw || '');
  html = setCanonical(html, canonical);
  html = setJsonLd(html, articleJsonLd(site, fullTitle, desc, canonical, channel));
  return html;
}

// ---------- sitemap / robots ----------
function renderSitemap(site) {
  const base = baseUrlOf(site);
  const entries = [];
  const lastmod = contentDate();
  const add = (loc, priority, freq) =>
    entries.push(`  <url>\n    <loc>${base}${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);
  add('/', '1.0', 'daily');
  for (const ch of LIST_CHANNELS) add(`/${ch}/`, '0.8', 'daily');
  for (const ch of LIST_CHANNELS) {
    for (const a of ARTICLES.filter((x) => x.channel === ch)) add(`/${ch}/${a.id}.html`, '0.6', 'weekly');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function renderSitemapHtm(site) {
  const base = baseUrlOf(site);
  const rows = [`<h2>首页</h2>`, `<p><a href="${base}/">${site.name}吊车出租首页</a></p>`];
  for (const ch of LIST_CHANNELS) {
    const label = CHANNEL_LABELS[ch] || ch;
    const articles = ARTICLES.filter((a) => a.channel === ch);
    rows.push(`<h2>${label}</h2>`);
    rows.push(`<p><a href="${base}/${ch}/">${label}列表</a></p>`);
    rows.push('<ul>');
    for (const a of articles) {
      const t = replaceText(fillPlaceholders(a.title, site).replace(/ -?亿立达24小时吊车租用公司$/, ''), site);
      rows.push(`<li><a href="${base}/${ch}/${a.id}.html">${t}</a></li>`);
    }
    rows.push('</ul>');
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${site.name}吊车出租网站地图 -${config.brandSuffix}</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${base}/sitemap.htm">
<style>body{font-family:system-ui,SimHei,sans-serif;max-width:960px;margin:20px auto;padding:0 16px;line-height:1.8}ul{margin:4px 0 16px}</style>
</head>
<body>
<h1>${site.name}吊车出租网站地图</h1>
${rows.join('\n')}
</body>
</html>
`;
}

function renderRobots(site) {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrlOf(site)}/sitemap.xml\n`;
}

function renderSitemapIndex() {
  const entries = SERVE_SITES.map(
    (s) => `  <sitemap>\n    <loc>${baseUrlOf(s)}/sitemap.xml</loc>\n    <lastmod>${contentDate()}</lastmod>\n  </sitemap>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`;
}

module.exports = {
  config,
  SERVE_SITES,
  ALL_SITES,
  ARTICLES,
  LIST_CHANNELS,
  ARTICLE_CHANNELS,
  channelPageCount,
  CHANNEL_TITLES,
  CHANNEL_LABELS,
  baseUrlOf,
  getSite,
  getArticle,
  isExtendedArticle,
  contentDate,
  fillPlaceholders,
  replaceText,
  richDescription,
  renderHome,
  renderList,
  renderArticle,
  renderSitemap,
  renderSitemapHtm,
  renderSitemapIndex,
  renderRobots,
};
