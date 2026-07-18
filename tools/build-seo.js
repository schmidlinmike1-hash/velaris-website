#!/usr/bin/env node
/**
 * build-seo.js — regeneriert alle SEO-Artefakte der Velaris-Website aus dem
 * Live-Bundle in index.html (single source of truth):
 *
 *   1. Statischer SEO-Content-Block in index.html (zwischen SEO:BEGIN/SEO:END-Markern)
 *   2. Meta-Tags + JSON-LD im <helmet> des __bundler/template (gerendertes <head>)
 *   3. Statische Seiten: en/index.html, fraktionen.html, flotte.html, admirale.html + EN-Pendants
 *   4. sitemap.xml
 *
 * Nach einer Bundle-Regenerierung einfach erneut ausführen:  node tools/build-seo.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://velarisgalacticstrategy.com';
const PLAY = 'https://play.google.com/store/apps/details?id=space.manus.velaris.mobile.t20260219083207';
const DISCORD = 'https://discord.gg/dTHDwuk63';
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- Extraktion
const indexPath = path.join(ROOT, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

function grabScript(html, type) {
  const re = new RegExp(`(<script type="${type.replace('/', '\\/')}">)([\\s\\S]*?)(<\\/script>)`);
  const m = html.match(re);
  if (!m) throw new Error('script tag not found: ' + type);
  return { full: m[0], open: m[1], body: m[2], close: m[3], index: m.index };
}

const manifest = JSON.parse(grabScript(indexHtml, '__bundler/manifest').body);
let D = null;
for (const entry of Object.values(manifest)) {
  if (!/javascript/.test(entry.mime)) continue;
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = zlib.gunzipSync(bytes);
  const text = bytes.toString('utf8');
  if (text.includes('VELARIS_DATA')) {
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(text, ctx);
    D = ctx.window.VELARIS_DATA;
    break;
  }
}
if (!D) throw new Error('VELARIS_DATA asset not found');

const tplTag = grabScript(indexHtml, '__bundler/template');
const template = JSON.parse(tplTag.body);

function sliceObject(src, startIdx) {
  const open = src[startIdx], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = null;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
    } else if (c === "'" || c === '"' || c === '`') inStr = c;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced object literal');
}
function extractLiteral(marker) {
  const idx = template.indexOf(marker);
  if (idx === -1) throw new Error('marker not found: ' + marker);
  const start = template.slice(idx + marker.length).search(/[{[]/) + idx + marker.length;
  return sliceObject(template, start);
}
const evalCtx = vm.createContext({});
const TR = vm.runInContext('(' + extractLiteral('TR = ') + ')', evalCtx);
const FEATURES = vm.runInContext('(' + extractLiteral('FEATURES = ') + ')', evalCtx);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- Meta-Bausteine
const META = {
  de: {
    title: 'Velaris: Galactic Strategy — Erobere die Galaxie',
    desc: 'Velaris: Galactic Strategy — Ein episches Weltraum-Strategiespiel für Android. Baue dein Imperium, erforsche Technologien, befehlige Flotten und erobere die Galaxie. Derzeit in geschlossener Android-Beta über Google Play — nur für freigeschaltete Testkonten. Web- und iOS-Versionen sind geplant.',
    ogDesc: 'Erobere die Galaxie in diesem epischen Weltraum-Strategiespiel. Derzeit in geschlossener Android-Beta über Google Play — Web- und iOS-Versionen sind geplant.',
  },
  en: {
    title: 'Velaris: Galactic Strategy — Space Strategy Game for Android',
    desc: 'Velaris: Galactic Strategy — an epic space strategy game for Android. Build your empire, research technologies, command fleets, and conquer the galaxy. Currently in closed Android beta through Google Play — approved testing accounts only. Web and iOS versions are planned.',
    ogDesc: 'Conquer the galaxy in this epic space strategy game. Currently in closed Android beta on Google Play — Web and iOS versions are planned.',
  },
};

function jsonldGame(lang) {
  return {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'MobileApplication'],
    name: 'Velaris: Galactic Strategy',
    url: SITE + (lang === 'en' ? '/en/' : '/'),
    image: SITE + '/og-image.png',
    description: META[lang].ogDesc,
    operatingSystem: 'Android',
    applicationCategory: 'GameApplication',
    genre: ['Strategy', '4X', 'Science Fiction'],
    gamePlatform: 'Android',
    playMode: ['SinglePlayer', 'MultiPlayer'],
    inLanguage: ['de', 'en', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'tr', 'ja', 'ko', 'zh'],
    installUrl: PLAY,
    publisher: { '@type': 'Organization', name: 'Velorian Studios', url: SITE + '/' },
  };
}

function metaBlock({ lang, title, desc, ogDesc, canonical, altDe, altEn, breadcrumb }) {
  const lines = [
    `<link rel="canonical" href="${canonical}">`,
    `<link rel="alternate" hreflang="de" href="${altDe}">`,
    `<link rel="alternate" hreflang="en" href="${altEn}">`,
    `<link rel="alternate" hreflang="x-default" href="${altDe}">`,
    `<meta name="theme-color" content="#04060C">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(ogDesc || desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:site_name" content="Velaris: Galactic Strategy">`,
    `<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'de_DE'}">`,
    `<meta property="og:locale:alternate" content="${lang === 'en' ? 'de_DE' : 'en_US'}">`,
    `<meta property="og:image" content="${SITE}/og-image.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(ogDesc || desc)}">`,
    `<meta name="twitter:image" content="${SITE}/og-image.png">`,
  ];
  if (breadcrumb) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`);
  }
  return lines.join('\n  ');
}

// ---------------------------------------------------------------- 1) Helmet-Metas im Template
const HELMET_MARK = '<!-- seo-meta -->';
let newTemplate = template;
if (!newTemplate.includes(HELMET_MARK)) {
  const helmetMeta = [
    HELMET_MARK,
    `<link rel="canonical" href="${SITE}/">`,
    `<link rel="alternate" hreflang="de" href="${SITE}/">`,
    `<link rel="alternate" hreflang="en" href="${SITE}/en/">`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
    `<meta name="description" content="${esc(META.de.desc)}">`,
    `<meta property="og:title" content="Velaris: Galactic Strategy">`,
    `<meta property="og:description" content="${esc(META.de.ogDesc)}">`,
    `<meta property="og:url" content="${SITE}/">`,
    `<meta property="og:image" content="${SITE}/og-image.png">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${JSON.stringify(jsonldGame('de'))}</script>`,
  ].join('\n  ');
  const titleEnd = newTemplate.indexOf('</title>');
  if (titleEnd === -1) throw new Error('no <title> in template helmet');
  newTemplate = newTemplate.slice(0, titleEnd + 8) + '\n  ' + helmetMeta + newTemplate.slice(titleEnd + 8);
  newTemplate = newTemplate.replace('<html><head>', '<html lang="de"><head>');
  const serialized = JSON.stringify(newTemplate).replace(/<\//g, '<\\/');
  indexHtml = indexHtml.slice(0, tplTag.index) + tplTag.open + serialized + tplTag.close +
    indexHtml.slice(tplTag.index + tplTag.full.length);
  console.log('helmet: SEO-Metas ins Template injiziert');
} else {
  console.log('helmet: bereits vorhanden, übersprungen');
}

// ---------------------------------------------------------------- 2) SEO-Content-Block
const t = TR.de, te = TR.en;
const factionCards = D.FACTIONS.map(f => `
      <article>
        <h3>${esc(f.name.de)}</h3>
        <img src="${f.img}" alt="${esc(f.name.de)} — Fraktion in Velaris: Galactic Strategy" width="160" height="160" loading="lazy">
        <p><em>${esc(f.subtitle ? (f.subtitle.de || '') : '')}</em></p>
        <p>${esc(f.lore.de)}</p>
      </article>`).join('');

const shipItems = D.SHIPS.map(s => `
        <li><strong>${esc(s.name.de)}</strong> — ${esc(s.desc.de)}</li>`).join('');

const flagshipItems = D.FLAGSHIPS.map(f => `
        <li><strong>${esc(f.name)}</strong>${f.title && f.title.de ? ' („' + esc(f.title.de) + '“)' : ''} — ${esc((f.lore && f.lore.de) || '')}</li>`).join('');

const admiralItems = D.ADMIRALS.map(a => `
        <li><strong>${esc(a.name)}</strong> — ${esc(a.title.de)}${a.rarity ? ' (' + esc(a.rarity) + ')' : ''}</li>`).join('');

const featureItems = FEATURES.map(f => `
        <li><strong>${esc(f.de[0])}:</strong> ${esc(f.de[1])}</li>`).join('');

const SEO_BEGIN = '<!-- SEO:BEGIN — statischer Inhalt für Suchmaschinen & Nutzer ohne JavaScript; wird beim App-Render ersetzt. Regenerierbar via: node tools/build-seo.js -->';
const SEO_END = '<!-- SEO:END -->';
const seoBlock = `${SEO_BEGIN}
  <main id="seo-content" style="max-width:860px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a2233;line-height:1.65;">
    <header>
      <nav aria-label="Seiten">
        <a href="/">Start</a> ·
        <a href="/fraktionen.html">Fraktionen</a> ·
        <a href="/flotte.html">Flotte</a> ·
        <a href="/admirale.html">Admirale</a> ·
        <a href="/en/">English</a>
      </nav>
      <h1>Velaris: Galactic Strategy — ${esc(t.heroTitle)}</h1>
      <p>${esc(t.heroTagline)}</p>
      <p><strong>Velaris: Galactic Strategy befindet sich derzeit in einer geschlossenen Android-Beta über Google Play.</strong> Der Download ist nur für freigeschaltete Testkonten verfügbar. Web- und iOS-Versionen sind geplant.</p>
      <p>Weltraum-Strategiespiel (4X) für Android in 12 Sprachen — Android: ${esc(t.statusClosedBeta)} · Web: ${esc(t.statusPlanned)} · iOS: ${esc(t.statusPlanned)}</p>
      <p><a href="${PLAY}" rel="noopener">${esc(t.btnCta)}</a> — ${esc(t.betaHint)} · <a href="${DISCORD}" rel="noopener noreferrer">${esc(t.btnDiscord)}</a></p>
    </header>
    <section>
      <h2>${esc(t.factionsTitle)}</h2>
      <p>${esc(t.factionsSubB)}</p>${factionCards}
      <p><a href="/fraktionen.html">Alle Details zu den Fraktionen →</a></p>
    </section>
    <section>
      <h2>${esc(t.shipsTitle)}</h2>
      <p>${esc(t.shipsSubB)}</p>
      <ul>${shipItems}
      </ul>
      <h2>${esc(t.flagshipsTitle)}</h2>
      <ul>${flagshipItems}
      </ul>
      <p><a href="/flotte.html">Alle Schiffe &amp; Flaggschiffe im Detail →</a></p>
    </section>
    <section>
      <h2>${esc(t.admiralsTitle)}</h2>
      <p>${esc(t.admiralsSubB)}</p>
      <ul>${admiralItems}
      </ul>
      <p><a href="/admirale.html">Alle Admirale mit Dossiers →</a></p>
    </section>
    <section>
      <h2>${esc(t.featuresTitle)}</h2>
      <ul>${featureItems}
      </ul>
    </section>
    <section>
      <h2>${esc(t.ctaTitle)}</h2>
      <p>${esc(t.ctaDesc)}</p>
      <p><a href="${PLAY}" rel="noopener">${esc(t.btnCta)}</a> — ${esc(t.betaHint)}</p>
      <p>${esc(t.securityNote)}</p>
      <p><a href="${DISCORD}" rel="noopener noreferrer">${esc(t.btnDiscord)}</a></p>
    </section>
    <footer>
      <p>
        <a href="/privacy-policy.html">${esc(t.footerPrivacy)}</a> ·
        <a href="/delete-account.html">${esc(t.footerDelete)}</a> ·
        <a href="${DISCORD}" rel="noopener noreferrer">Discord</a> ·
        <a href="/en/">English version</a>
      </p>
    </footer>
  </main>
  ${SEO_END}`;

const beginIdx = indexHtml.indexOf(SEO_BEGIN.slice(0, 14)); // '<!-- SEO:BEGIN'
if (beginIdx !== -1) {
  const endIdx = indexHtml.indexOf(SEO_END, beginIdx);
  indexHtml = indexHtml.slice(0, beginIdx) + seoBlock + indexHtml.slice(endIdx + SEO_END.length);
  console.log('seo-block: ersetzt');
} else {
  const anchor = '<div id="__bundler_loading">Unpacking...</div>';
  if (!indexHtml.includes(anchor)) throw new Error('anchor for seo block not found');
  indexHtml = indexHtml.replace(anchor, anchor + '\n\n  ' + seoBlock);
  console.log('seo-block: eingefügt');
}
fs.writeFileSync(indexPath, indexHtml);

// ---------------------------------------------------------------- 3) Statische Seiten
const CSS = `
    :root { --bg:#0A0E17; --surface:#131A2B; --text:#E8ECF4; --muted:#8B9AB9; --primary:#00E5FF; --border:#1E2A42; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--text); line-height:1.7; }
    .container { max-width:960px; margin:0 auto; padding:32px 20px 64px; }
    header.site { display:flex; flex-wrap:wrap; gap:12px 24px; align-items:center; justify-content:space-between; padding:18px 20px; border-bottom:1px solid var(--border); }
    header.site .brand { font-weight:900; letter-spacing:3px; color:var(--primary); text-decoration:none; font-size:1.05rem; }
    header.site nav { display:flex; flex-wrap:wrap; gap:16px; }
    header.site a { color:var(--text); text-decoration:none; font-size:.95rem; }
    header.site a:hover, header.site a.active { color:var(--primary); }
    h1 { font-size:clamp(1.7rem,4.5vw,2.6rem); color:#fff; line-height:1.15; margin:18px 0 10px; }
    h2 { font-size:1.35rem; color:var(--primary); margin:40px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--border); }
    h3 { font-size:1.1rem; color:#fff; margin:0 0 6px; }
    p { margin:0 0 14px; } .muted { color:var(--muted); }
    .lead { font-size:1.08rem; color:var(--muted); margin-bottom:22px; }
    .cta { display:inline-block; background:var(--primary); color:#04121A; font-weight:700; padding:12px 26px; border-radius:8px; text-decoration:none; margin:8px 0 4px; }
    .cta:hover { filter:brightness(1.1); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:18px; margin:18px 0; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; }
    .card img { width:96px; height:96px; object-fit:cover; border-radius:10px; float:right; margin:0 0 10px 12px; }
    .card .tag { font-size:.78rem; letter-spacing:1px; color:var(--primary); text-transform:uppercase; }
    ul.plain { list-style:none; } ul.plain li { padding:8px 0; border-bottom:1px solid var(--border); }
    a { color:var(--primary); }
    footer.site { border-top:1px solid var(--border); margin-top:48px; padding:24px 20px; text-align:center; color:var(--muted); font-size:.9rem; }
    footer.site a { color:var(--muted); }
`;

const NAV = {
  de: [['/', 'Start'], ['/fraktionen.html', 'Fraktionen'], ['/flotte.html', 'Flotte'], ['/admirale.html', 'Admirale']],
  en: [['/en/', 'Home'], ['/en/factions.html', 'Factions'], ['/en/fleet.html', 'Fleet'], ['/en/admirals.html', 'Admirals']],
};

function pageShell({ lang, title, desc, ogDesc, canonical, altDe, altEn, active, body, jsonld, langSwitch }) {
  const nav = NAV[lang].map(([href, label]) =>
    `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`).join('\n      ');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  ${metaBlock({ lang, title, desc, ogDesc, canonical, altDe, altEn })}
  <link rel="icon" type="image/png" href="/icon.png">
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
  <style>${CSS}</style>
</head>
<body>
  <header class="site">
    <a class="brand" href="${lang === 'en' ? '/en/' : '/'}">VELARIS</a>
    <nav>
      ${nav}
      <a href="${DISCORD}" target="_blank" rel="noopener noreferrer">Discord</a>
      <a href="${langSwitch.href}" lang="${langSwitch.lang}" hreflang="${langSwitch.lang}">${langSwitch.label}</a>
    </nav>
  </header>
  <div class="container">
${body}
  </div>
  <footer class="site">
    <p>
      <a href="/privacy-policy.html">${lang === 'en' ? 'Privacy Policy' : 'Datenschutzerklärung'}</a> ·
      <a href="/delete-account.html">${lang === 'en' ? 'Delete Account' : 'Konto löschen'}</a> ·
      <a href="${PLAY}" rel="noopener">Google Play</a> ·
      <a href="${DISCORD}" target="_blank" rel="noopener noreferrer">Discord</a>
    </p>
    <p>© 2026 Velorian Studios — Velaris: Galactic Strategy. ${lang === 'en' ? 'All rights reserved' : 'Alle Rechte vorbehalten'}.</p>
  </footer>
</body>
</html>
`;
}

const L = (obj, lang) => (obj && (obj[lang] != null ? obj[lang] : obj.de)) || '';

function factionsBody(lang) {
  const tr = TR[lang === 'en' ? 'en' : 'de'];
  const cards = D.FACTIONS.map(f => `
    <article class="card">
      <img src="/${f.img}" alt="${esc(L(f.name, lang))}${lang === 'en' ? ' — faction in Velaris: Galactic Strategy' : ' — Fraktion in Velaris: Galactic Strategy'}" width="96" height="96" loading="lazy">
      <span class="tag">${esc(L(f.subtitle, lang))}</span>
      <h3>${esc(L(f.name, lang))}</h3>
      <p>${esc(L(f.lore, lang))}</p>
    </article>`).join('');
  return `
    <h1>${esc(tr.factionsTitle)} — Velaris: Galactic Strategy</h1>
    <p class="lead">${esc(tr.factionsSubB)}</p>
    <div class="grid">${cards}</div>
    <p><a class="cta" href="${PLAY}" rel="noopener">${esc(tr.btnCta)}</a><br><span class="muted" style="font-size:.85rem;">${esc(tr.betaHint)}</span></p>`;
}

function fleetBody(lang) {
  const tr = TR[lang === 'en' ? 'en' : 'de'];
  const ships = D.SHIPS.map(s => `
    <article class="card">
      <img src="/${s.img}" alt="${esc(L(s.name, lang))} — Velaris: Galactic Strategy" width="96" height="96" loading="lazy">
      <h3>${esc(L(s.name, lang))}</h3>
      <p>${esc(L(s.desc, lang))}</p>
    </article>`).join('');
  const flags = D.FLAGSHIPS.map(f => `
    <article class="card">
      <img src="/${f.img}" alt="${esc(f.name)} — Flagship" width="96" height="96" loading="lazy">
      <span class="tag">${esc(L(f.title, lang))}</span>
      <h3>${esc(f.name)}</h3>
      <p>${esc(L(f.lore, lang))}</p>
    </article>`).join('');
  return `
    <h1>${esc(tr.shipsTitle)} — Velaris: Galactic Strategy</h1>
    <p class="lead">${esc(tr.shipsSubB)}</p>
    <div class="grid">${ships}</div>
    <h2>${esc(tr.flagshipsTitle)}</h2>
    <div class="grid">${flags}</div>
    <p><a class="cta" href="${PLAY}" rel="noopener">${esc(tr.btnCta)}</a><br><span class="muted" style="font-size:.85rem;">${esc(tr.betaHint)}</span></p>`;
}

function admiralsBody(lang) {
  const tr = TR[lang === 'en' ? 'en' : 'de'];
  const factionName = id => { const f = D.FACTIONS.find(x => x.id === id); return f ? L(f.name, lang) : (lang === 'en' ? 'Independent' : 'Fraktionslos'); };
  const rarityLabel = D.RARITY_LABEL || {};
  const cards = D.ADMIRALS.map(a => {
    const img = path.join(ROOT, 'assets', 'admirals', a.id.replace(/'/g, '') + '.webp');
    const imgFile = fs.existsSync(img) ? `/assets/admirals/${a.id.replace(/'/g, '')}.webp` : null;
    const rar = rarityLabel[a.rarity] ? L(rarityLabel[a.rarity], lang) : a.rarity;
    return `
    <article class="card">
      ${imgFile ? `<img src="${imgFile}" alt="${esc(a.name)} — Admiral in Velaris: Galactic Strategy" width="96" height="96" loading="lazy">` : ''}
      <span class="tag">${esc(factionName(a.faction))} · ${esc(rar || '')}</span>
      <h3>${esc(a.name)} — ${esc(L(a.title, lang))}</h3>
      <p>${esc(L(a.lore, lang))}</p>
    </article>`;
  }).join('');
  return `
    <h1>${esc(tr.admiralsTitle)} — Velaris: Galactic Strategy</h1>
    <p class="lead">${esc(tr.admiralsSubB)}</p>
    <div class="grid">${cards}</div>
    <p><a class="cta" href="${PLAY}" rel="noopener">${esc(tr.btnCta)}</a><br><span class="muted" style="font-size:.85rem;">${esc(tr.betaHint)}</span></p>`;
}

function enHomeBody() {
  const tr = TR.en;
  // 70 (23 Gebäude + 47 Technologien) und 32 Admirale sind gegen den Spielcode
  // (Velaris/lib/game/data.ts bzw. admirals.ts) verifiziert; Schiffe und spielbare
  // Fraktionen kommen direkt aus dem Website-Datensatz (VELARIS_DATA).
  const playableFactions = D.FACTIONS.filter(f => f.bonuses && f.bonuses.length).length;
  const stats = `
    <ul class="plain">
      <li><strong>70</strong> ${esc(tr.stat1)}</li>
      <li><strong>${D.SHIPS.length}</strong> ${esc(tr.stat2)}</li>
      <li><strong>32</strong> ${esc(tr.stat3)}</li>
      <li><strong>${playableFactions}</strong> ${esc(tr.stat4)}</li>
    </ul>`;
  const feats = FEATURES.map(f => `
    <article class="card"><h3>${esc(f.en[0])}</h3><p>${esc(f.en[1])}</p></article>`).join('');
  const factions = D.FACTIONS.map(f => `
    <article class="card">
      <img src="/${f.img}" alt="${esc(L(f.name, 'en'))} — faction in Velaris: Galactic Strategy" width="96" height="96" loading="lazy">
      <h3>${esc(L(f.name, 'en'))}</h3>
      <p>${esc(L(f.lore, 'en'))}</p>
    </article>`).join('');
  return `
    <p class="muted">${esc(tr.heroBadge)}</p>
    <h1>Velaris: Galactic Strategy — ${esc(tr.heroTitle)}</h1>
    <p class="lead">${esc(tr.heroTagline)} 4X space strategy for Android in 12 languages — currently in closed Android beta through Google Play.</p>
    <p><a class="cta" href="${PLAY}" rel="noopener">${esc(tr.btnCta)}</a><br><span class="muted" style="font-size:.85rem;">${esc(tr.betaHint)}</span></p>
    <p class="muted">Android: ${esc(tr.statusClosedBeta)} · Web: ${esc(tr.statusPlanned)} · iOS: ${esc(tr.statusPlanned)} · <a href="${DISCORD}" target="_blank" rel="noopener noreferrer">${esc(tr.btnDiscord)}</a></p>
    ${stats}
    <h2>${esc(tr.factionsTitle)}</h2>
    <p>${esc(tr.factionsSubB)}</p>
    <div class="grid">${factions}</div>
    <p><a href="/en/factions.html">All faction details →</a></p>
    <h2>${esc(tr.featuresTitle)}</h2>
    <div class="grid">${feats}</div>
    <h2>${esc(tr.shipsTitle)} &amp; ${esc(tr.admiralsTitle)}</h2>
    <p>${esc(tr.shipsSubB)} <a href="/en/fleet.html">Browse the full fleet →</a></p>
    <p>${esc(tr.admiralsSubB)} <a href="/en/admirals.html">Meet the admirals →</a></p>
    <h2>${esc(tr.ctaTitle)}</h2>
    <p>${esc(tr.ctaDesc)}</p>
    <p><a class="cta" href="${PLAY}" rel="noopener">${esc(tr.btnCta)}</a><br><span class="muted" style="font-size:.85rem;">${esc(tr.betaHint)}</span></p>
    <p class="muted">${esc(tr.securityNote)}</p>
    <p><a href="${DISCORD}" target="_blank" rel="noopener noreferrer">${esc(tr.btnDiscord)}</a></p>`;
}

const pages = [
  {
    file: 'en/index.html', lang: 'en',
    title: META.en.title, desc: META.en.desc, ogDesc: META.en.ogDesc,
    canonical: `${SITE}/en/`, altDe: `${SITE}/`, altEn: `${SITE}/en/`,
    active: '/en/', body: enHomeBody(), jsonld: jsonldGame('en'),
    langSwitch: { href: '/', lang: 'de', label: 'Deutsch' },
  },
  {
    file: 'fraktionen.html', lang: 'de',
    title: 'Die 5 Fraktionen — Velaris: Galactic Strategy',
    desc: 'Alle fünf Fraktionen in Velaris: Galactic Strategy im Überblick — Aurelian Concordance, Nythera Collective, Khar\'Vex Dominion, Virellian Consortia und der Xal\'Thyrr-Schwarm. Lore, Spielstil und Boni.',
    canonical: `${SITE}/fraktionen.html`, altDe: `${SITE}/fraktionen.html`, altEn: `${SITE}/en/factions.html`,
    active: '/fraktionen.html', body: factionsBody('de'),
    langSwitch: { href: '/en/factions.html', lang: 'en', label: 'English' },
  },
  {
    file: 'en/factions.html', lang: 'en',
    title: 'The 5 Factions — Velaris: Galactic Strategy',
    desc: 'All five factions of Velaris: Galactic Strategy — Aurelian Concordance, Nythera Collective, Khar\'Vex Dominion, Virellian Consortia and the Xal\'Thyrr Swarm. Lore, playstyle and bonuses.',
    canonical: `${SITE}/en/factions.html`, altDe: `${SITE}/fraktionen.html`, altEn: `${SITE}/en/factions.html`,
    active: '/en/factions.html', body: factionsBody('en'),
    langSwitch: { href: '/fraktionen.html', lang: 'de', label: 'Deutsch' },
  },
  {
    file: 'flotte.html', lang: 'de',
    title: 'Schiffe & Flaggschiffe — Velaris: Galactic Strategy',
    desc: '19 Schiffsklassen und 3 legendäre Flaggschiffe in Velaris: Galactic Strategy — vom Jäger bis zum Schlachtkreuzer, inkl. acht einzigartiger Fraktionsschiffe. Alle Rollen und Stärken im Überblick.',
    canonical: `${SITE}/flotte.html`, altDe: `${SITE}/flotte.html`, altEn: `${SITE}/en/fleet.html`,
    active: '/flotte.html', body: fleetBody('de'),
    langSwitch: { href: '/en/fleet.html', lang: 'en', label: 'English' },
  },
  {
    file: 'en/fleet.html', lang: 'en',
    title: 'Ships & Flagships — Velaris: Galactic Strategy',
    desc: '19 ship classes and 3 legendary flagships in Velaris: Galactic Strategy — from fighters to battle cruisers, including eight unique faction ships. All roles and strengths at a glance.',
    canonical: `${SITE}/en/fleet.html`, altDe: `${SITE}/flotte.html`, altEn: `${SITE}/en/fleet.html`,
    active: '/en/fleet.html', body: fleetBody('en'),
    langSwitch: { href: '/flotte.html', lang: 'de', label: 'Deutsch' },
  },
  {
    file: 'admirale.html', lang: 'de',
    title: 'Admirale — Velaris: Galactic Strategy',
    desc: 'Alle Admirale in Velaris: Galactic Strategy mit Dossier, Fraktion und Seltenheit — von Analyst Seyr bis zu den legendären fraktionslosen Admiralen Valdris und Xel\'Nara.',
    canonical: `${SITE}/admirale.html`, altDe: `${SITE}/admirale.html`, altEn: `${SITE}/en/admirals.html`,
    active: '/admirale.html', body: admiralsBody('de'),
    langSwitch: { href: '/en/admirals.html', lang: 'en', label: 'English' },
  },
  {
    file: 'en/admirals.html', lang: 'en',
    title: 'Admirals — Velaris: Galactic Strategy',
    desc: 'All admirals in Velaris: Galactic Strategy with dossier, faction and rarity — from Analyst Seyr to the legendary independent admirals Valdris and Xel\'Nara.',
    canonical: `${SITE}/en/admirals.html`, altDe: `${SITE}/admirale.html`, altEn: `${SITE}/en/admirals.html`,
    active: '/en/admirals.html', body: admiralsBody('en'),
    langSwitch: { href: '/admirale.html', lang: 'de', label: 'Deutsch' },
  },
];

fs.mkdirSync(path.join(ROOT, 'en'), { recursive: true });
for (const p of pages) {
  fs.writeFileSync(path.join(ROOT, p.file), pageShell(p));
  console.log('page:', p.file);
}

// ---------------------------------------------------------------- 4) Sitemap
const urls = [
  { loc: `${SITE}/`, prio: '1.0', alt: { de: `${SITE}/`, en: `${SITE}/en/` } },
  { loc: `${SITE}/en/`, prio: '0.9', alt: { de: `${SITE}/`, en: `${SITE}/en/` } },
  { loc: `${SITE}/fraktionen.html`, prio: '0.7', alt: { de: `${SITE}/fraktionen.html`, en: `${SITE}/en/factions.html` } },
  { loc: `${SITE}/en/factions.html`, prio: '0.7', alt: { de: `${SITE}/fraktionen.html`, en: `${SITE}/en/factions.html` } },
  { loc: `${SITE}/flotte.html`, prio: '0.7', alt: { de: `${SITE}/flotte.html`, en: `${SITE}/en/fleet.html` } },
  { loc: `${SITE}/en/fleet.html`, prio: '0.7', alt: { de: `${SITE}/flotte.html`, en: `${SITE}/en/fleet.html` } },
  { loc: `${SITE}/admirale.html`, prio: '0.7', alt: { de: `${SITE}/admirale.html`, en: `${SITE}/en/admirals.html` } },
  { loc: `${SITE}/en/admirals.html`, prio: '0.7', alt: { de: `${SITE}/admirale.html`, en: `${SITE}/en/admirals.html` } },
  { loc: `${SITE}/privacy-policy.html`, prio: '0.2' },
  { loc: `${SITE}/delete-account.html`, prio: '0.2' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <priority>${u.prio}</priority>${u.alt ? `
    <xhtml:link rel="alternate" hreflang="de" href="${u.alt.de}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${u.alt.en}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${u.alt.de}"/>` : ''}
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
console.log('sitemap.xml geschrieben (' + urls.length + ' URLs)');
console.log('Fertig.');
