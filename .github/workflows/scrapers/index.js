// scrapers/index.js
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sha1 = require('sha1');
const targets = require('./targets.json').targets;
const regionMap = require('./region-mapper.json');

const OUT_DIR = path.join(__dirname, 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function normalizeText(t){ return (t||'').toString().toLowerCase().replace(/\s+/g,' ').trim(); }

function detectRegionFromText(txt){
  if (!txt) return null;
  const lower = normalizeText(txt);
  // check USA
  for (const [code, names] of Object.entries(regionMap.USA)) {
    for (const n of names) if (lower.includes(n)) return { country:'USA', code };
  }
  for (const [code, names] of Object.entries(regionMap.CANADA)) {
    for (const n of names) if (lower.includes(n)) return { country:'CANADA', code };
  }
  for (const [code, names] of Object.entries(regionMap.MEXICO)) {
    for (const n of names) if (lower.includes(n)) return { country:'MEXICO', code };
  }
  // try zip code
  const zip = txt.match(/\b\d{5}\b/);
  if (zip) {
    // map US zip to state? (not implemented here). return UNKNOWN.
    return { country:'USA', code: 'UNKNOWN' };
  }
  return null;
}

async function scrapeTarget(t){
  try {
    const res = await fetch(t.url, { headers: { 'User-Agent': 'market-watcher-bot/1.0 (+https://github.com)' }, timeout: 20000 });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Basic heuristics: find product-like anchors or product schema
    const results = [];

    // Attempt LD+JSON Product entries
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const j = JSON.parse($(el).text());
        if (!j) return;
        const prod = Array.isArray(j) ? j.find(x => x['@type']==='Product') : (j['@type']==='Product' ? j : null);
        if (prod) {
          results.push({
            title: prod.name || prod.title || '',
            url: prod.url || t.url,
            price: prod.offers && prod.offers.price ? prod.offers.price : null,
            sellerLocation: prod.offers && prod.offers.seller && prod.offers.seller.name ? prod.offers.seller.name : null
          });
        }
      } catch(e){}
    });

    // Generic find product anchors
    $('a').each((i, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text() || '';
      if (href.includes('/products/') || href.toLowerCase().includes('product')) {
        results.push({ title: text.trim() || href, url: new URL(href, t.url).toString(), sellerLocation: null });
      }
    });

    // eBay listing heuristics: look for listings with sold counts or deal items
    $('.ebayui-ellipsis-2, .s-item__title').each((i, el) => {
      const title = $(el).text().trim();
      const par = $(el).closest('a').attr('href') || t.url;
      if (title) results.push({ title, url: new URL(par, t.url).toString(), sellerLocation: null });
    });

    // dedupe by url
    const dedup = {};
    for (const r of results) {
      const key = sha1(r.url);
      if (!dedup[key]) dedup[key] = r;
    }

    // attempt to extract on-page signals: limited stock phrases
    const bodyText = normalizeText($('body').text().slice(0, 20000));
    const signals = [];
    ['only','left','limited stock','selling fast','sold','bestseller','hot','trending','few left','hurry'].forEach(k => { if (bodyText.includes(k)) signals.push(k); });

    // try to extract any location text in the page and map to region
    const possibleLocationText = [];
    // common labels
    const shipFrom = $(':contains("Ships from")').text() || $(':contains("Item location")').text() || '';
    if (shipFrom) possibleLocationText.push(shipFrom);
    const foot = $('footer').text() || '';
    possibleLocationText.push(foot);
    const loc = detectRegionFromText(possibleLocationText.join(' '));

    return { target: t, items: Object.values(dedup).slice(0, 100), signals, detectedRegion: loc };
  } catch (e) {
    console.warn('scrape fail', t.url, e && e.message);
    return { target: t, items: [], signals: [], detectedRegion: null, error: String(e) };
  }
}

(async function main(){
  console.log('Starting scrapes for', targets.length, 'targets');
  const aggregated = {}; // regionKey -> { key -> {title, domain, sampleUrl, count, score, signals: [] } }

  for (let i=0;i<targets.length;i++){
    const t = targets[i];
    console.log('Scraping', t.url);
    const r = await scrapeTarget(t);
    // throttle
    await sleep(2000);

    // for each found item, attribute to region (target-level or item-level detection)
    const regionDetected = r.detectedRegion ? (r.detectedRegion.country + '-' + r.detectedRegion.code) : 'UNKNOWN-UNKNOWN';
    for (const it of r.items) {
      const key = sha1(it.url);
      // decide region: if item has location text map it; else use target-level; else UNKNOWN
      let regionKey = regionDetected;
      // basic: look for location text in title/url
      const itemReg = detectRegionFromText(it.title + ' ' + it.url);
      if (itemReg) regionKey = itemReg.country + '-' + itemReg.code;
      if (!aggregated[regionKey]) aggregated[regionKey] = {};
      if (!aggregated[regionKey][key]) aggregated[regionKey][key] = { title: it.title || '', domain: new URL(it.url).hostname, sampleUrl: it.url, count: 0, score:0, signals: [] };
      aggregated[regionKey][key].count += 1;
      // simple scoring: count + presence of page-level signals
      aggregated[regionKey][key].score += 1 + (r.signals && r.signals.length? 2:0);
      aggregated[regionKey][key].signals = Array.from(new Set([...(aggregated[regionKey][key].signals||[]), ...(r.signals||[])]));
    }
  }

  // Build outputs
  const outAll = [];
  for (const region in aggregated) {
    const list = Object.entries(aggregated[region]).map(([k,v]) => ({ key:k, title:v.title, domain:v.domain, sampleUrl:v.sampleUrl, count:v.count, score:v.score, signals:v.signals }));
    list.sort((a,b) => b.score - a.score || b.count - a.count);
    // write per-region file (safe filename)
    const safeRegion = region.replace(/[^\w\-]/g,'_');
    const perFile = { region, generatedAt: Date.now(), items: list.slice(0,200) };
    fs.writeFileSync(path.join(OUT_DIR, `hot_${safeRegion}.json`), JSON.stringify(perFile, null, 2), 'utf8');
    outAll.push({ region, top: list.slice(0,20) });
  }
  // Write aggregated hot_all.json
  fs.writeFileSync(path.join(OUT_DIR, 'hot_all.json'), JSON.stringify({ generatedAt: Date.now(), regions: outAll }, null, 2), 'utf8');

  console.log('Wrote', fs.readdirSync(OUT_DIR));
})();
