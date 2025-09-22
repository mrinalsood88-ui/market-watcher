/**
 * discover_shops.js
 *
 * Robust Shopify discovery crawler for scrapers/.
 *
 * Usage examples:
 *  node discover_shops.js --seeds seeds.txt --out shopify_stores.json --maxPages 200 --depth 2 --delay 600 --concurrency 3 --respectRobots false
 *
 * Flags:
 *  --seeds <file-or-comma-list>   : path to seeds file (one URL per line) or comma-separated seeds string
 *  --out <file>                   : output JSON file (default: shopify_stores.json)
 *  --maxPages <n>                 : maximum pages to fetch (default 200)
 *  --depth <n>                    : max crawl depth (default 3)
 *  --delay <ms>                   : delay between requests in ms (default 600)
 *  --concurrency <n>              : concurrent fetches (default 2)
 *  --respectRobots <true|false>   : respect robots.txt? (default: false)
 *  --onlyMyshopify <true|false>   : only record *.myshopify.com (default: false)
 *  --verbose <true|false>         : verbose logs (default: true)
 *
 * Requires packages: axios, cheerio, p-retry
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const pRetry = require('p-retry').default;
const { URL } = require('url');

const USER_AGENT = 'market-watcher-discoverer/1.0 (+https://github.com/)';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      opts[k] = v;
    }
  }
  return opts;
}

function toBool(v, def = false) {
  if (v === undefined) return def;
  if (typeof v === 'boolean') return v;
  v = String(v).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

async function safeGet(url, opts = {}) {
  const cfg = Object.assign(
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: (s) => s < 500,
    },
    opts
  );

  return pRetry(
    async () => {
      const res = await axios.get(url, cfg);
      if (res.status >= 500) {
        const err = new Error(`Server ${res.status}`);
        err.response = res;
        throw err;
      }
      return res;
    },
    {
      retries: 2,
      onFailedAttempt: (err) =>
        console.warn(`Request attempt ${err.attemptNumber} failed for ${url}: ${err.message}`),
    }
  );
}

async function fetchRobots(hostname) {
  try {
    const url = `https://${hostname}/robots.txt`;
    const res = await safeGet(url, { headers: { Accept: 'text/plain' } });
    return res.data ? String(res.data) : '';
  } catch (e) {
    return '';
  }
}

function extractLinks(baseUrl, html) {
  const $ = cheerio.load(html || '');
  const links = new Set();
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl).toString();
      // ignore anchors and javascript/mailto/tel:
      if (/^(mailto:|tel:|javascript:|#)/i.test(resolved)) return;
      if (resolved.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|webm|mp3)(\?|$)/i)) return;
      links.add(resolved);
    } catch (e) {
      // ignore bad urls
    }
  });
  return Array.from(links);
}

function hostnameFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (e) {
    return null;
  }
}

function looksLikeShopify(html, hostname, url) {
  if (!hostname) return false;
  // 1) direct myshopify host
  if (/\.myshopify\.com$/i.test(hostname)) return true;

  if (!html) return false;

  const $ = cheerio.load(html);

  // 2) common Shopify globals/js
  if ($('script').toArray().some(s => {
    const src = $(s).attr('src') || '';
    return /cdn\.shopify\.com|shopify\.js|shopify_common|shopify_assets/i.test(src);
  })) return true;

  // 3) theme /shopify markers
  const body = $('body').html() || '';
  if (/Shopify\.analytics|Shopify\.theme|Shopify\.shop|data-shopify|shopify-section/i.test(body)) return true;

  // 4) product path found on same host
  try {
    const pathpart = new URL(url).pathname || '';
    if (/\/products\//i.test(pathpart)) return true;
  } catch (e) {}

  // 5) cdn assets in page
  if (html.match(/cdn\.shopify\.com|global\.js.shopify/i)) return true;

  // 6) presence of 'product' link pattern /collections/ or /products/
  if (html.match(/\/(collections|products)\/[a-z0-9-]+/i)) return true;

  return false;
}

async function isAllowedByRobots(hostname) {
  // basic: if robots contains "User-agent: *" + "Disallow: /" -> block
  const txt = await fetchRobots(hostname);
  if (!txt) return true;
  const lines = txt.split(/\r?\n/).map(l => l.trim());
  let withinAll = false;
  for (const line of lines) {
    if (/^User-agent:\s*\*/i.test(line)) { withinAll = true; continue; }
    if (withinAll && /^Disallow:\s*\/\s*$/i.test(line)) return false;
    if (/^User-agent:/i.test(line) && !/^User-agent:\s*\*/i.test(line)) withinAll = false;
  }
  return true;
}

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function run() {
  const opts = parseArgs();
  const seedsArg = opts.seeds || 'seeds.txt';
  let seeds = [];

  if (fs.existsSync(path.resolve(seedsArg))) {
    const txt = fs.readFileSync(path.resolve(seedsArg), 'utf8').trim();
    seeds = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } else {
    // maybe comma separated list
    seeds = String(seedsArg).split(',').map(s => s.trim()).filter(Boolean);
  }

  if (seeds.length === 0) {
    console.error('No seeds found. Create seeds.txt or pass --seeds "url1,url2"');
    process.exit(1);
  }

  const outFile = path.resolve(opts.out || 'shopify_stores.json');
  const maxPages = parseInt(opts.maxPages || 200, 10);
  const maxDepth = parseInt(opts.depth || 3, 10);
  const delayMs = parseInt(opts.delay || 600, 10);
  const concurrency = Math.max(1, parseInt(opts.concurrency || 2, 10));
  const respectRobots = toBool(opts.respectRobots, false);
  const onlyMyshopify = toBool(opts.onlyMyshopify, false);
  const verbose = toBool(opts.verbose, true);

  if (verbose) {
    console.log('Seeds:', seeds);
    console.log('Out file:', outFile);
    console.log('maxPages:', maxPages, 'depth:', maxDepth, 'delayMs:', delayMs, 'concurrency:', concurrency);
    console.log('respectRobots:', respectRobots, 'onlyMyshopify:', onlyMyshopify);
  }

  // load existing
  let existing = [];
  if (fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch (e) {
      existing = [];
    }
  }

  const discovered = new Set(existing.map(h => h.toLowerCase()));
  const visitedUrls = new Set();
  const queue = []; // {url, depth}
  for (const s of seeds) queue.push({ url: s, depth: 0 });

  let fetched = 0;
  const robotsCache = new Map();

  // concurrency worker pool
  const workers = new Array(concurrency).fill(null).map(() => processQueue());

  await Promise.all(workers);

  // write out
  const final = Array.from(new Set([...Array.from(discovered), ...existing])).sort();
  fs.writeFileSync(outFile, JSON.stringify(final, null, 2), 'utf8');
  console.log(`WROTE ${outFile} with ${final.length} hosts`);
  console.log('Done.');

  // worker function
  async function processQueue() {
    while (true) {
      if (fetched >= maxPages) return;
      const item = queue.shift();
      if (!item) {
        // nothing left
        await delay(200);
        if (queue.length === 0) return;
        continue;
      }
      const { url, depth } = item;
      if (!url || visitedUrls.has(url) || depth > maxDepth) continue;
      visitedUrls.add(url);

      const hostname = hostnameFromUrl(url);
      if (!hostname) continue;

      // robots check caching
      if (respectRobots) {
        if (!robotsCache.has(hostname)) {
          const ok = await isAllowedByRobots(hostname);
          robotsCache.set(hostname, ok);
        }
        if (!robotsCache.get(hostname)) {
          if (verbose) console.log(`Skipping ${hostname} due to robots Disallow: /`);
          continue;
        }
      }

      // fetch page
      try {
        if (verbose) console.log(`Fetching (${fetched + 1}/${maxPages}) [depth ${depth}]: ${url}`);
        const res = await safeGet(url, { headers: { 'User-Agent': USER_AGENT } });
        fetched++;
        const html = res && res.data ? String(res.data) : '';

        // detect Shopify heuristics
        const isShop = looksLikeShopify(html, hostname, url);

        if (isShop) {
          if (onlyMyshopify) {
            // only add if hostname is myshopify
            if (/\.myshopify\.com$/i.test(hostname)) {
              if (!discovered.has(hostname)) {
                discovered.add(hostname);
                console.log(`ADDED (myshopify): ${hostname}`);
              }
            } else {
              if (verbose) console.log(`Candidate ${hostname} looks shopify-like but isn't *.myshopify.com (skipped by --onlyMyshopify).`);
            }
          } else {
            if (!discovered.has(hostname)) {
              discovered.add(hostname);
              console.log(`ADDED: ${hostname}  (reason: shopify heuristics)`);
            }
          }
        } else {
          if (verbose) console.log(`Not shopify: ${hostname}`);
        }

        // extract links and enqueue
        if (depth < maxDepth) {
          const links = extractLinks(url, html);
          for (const l of links) {
            if (!visitedUrls.has(l) && !queue.find(q => q.url === l)) {
              queue.push({ url: l, depth: depth + 1 });
            }
          }
        }

        if (delayMs > 0) await delay(delayMs);
      } catch (err) {
        console.warn(`Fetch failed: ${url} ${err && err.message ? err.message : err}`);
        if (delayMs > 0) await delay(delayMs);
      }
    }
  }
}

run().catch(err => {
  console.error('Fatal crawler error:', err && err.message ? err.message : err);
  process.exit(1);
});
