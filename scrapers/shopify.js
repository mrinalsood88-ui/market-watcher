/**
 * scrapers/shopify.js
 *
 * Fetch /products.json from a list of stores (shopify-style domains),
 * save snapshots to scrapers/data/shopify/<store>.<timestamp>.json
 *
 * Usage:
 *   node shopify.js
 *
 * Notes:
 *  - config file: scrapers/config/shopify_stores.json
 *    { "stores": ["examplestore.myshopify.com", "another.com"], "concurrency": 3 }
 *
 *  - Requires: axios, p-retry
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pRetry = require('p-retry').default; // << important: use .default for CommonJS
const os = require('os');

const CONFIG_PATH = path.join(__dirname, 'config', 'shopify_stores.json');
const OUT_DIR = path.join(__dirname, 'data', 'shopify');
const CONCURRENCY_DEFAULT = 3;
const USER_AGENT = 'MarketWatcher-Scraper/1.0 (+https://github.com/)';

// Ensure output dir exists
fs.mkdirSync(OUT_DIR, { recursive: true });

// Load config
let config = { stores: [], concurrency: CONCURRENCY_DEFAULT };
try {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  config = Object.assign(config, JSON.parse(raw));
} catch (err) {
  console.warn('Could not read config/shopify_stores.json - using defaults. Create file to customize stores.');
}

// normalize stores array
const stores = (config.stores || []).filter(Boolean);
const concurrency = Number(config.concurrency) || CONCURRENCY_DEFAULT;

if (!stores.length) {
  console.error('No stores found in', CONFIG_PATH, '. Please add some shop domains and retry.');
  process.exit(1);
}

console.log('Shopify fetcher starting. Stores:', stores.length, 'Concurrency:', concurrency);

// Helper: timestamp string
function tsForFilename() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

// helper to write file
function writeSnapshot(store, body) {
  const fileName = `${store}.${tsForFilename()}.json`;
  const out = path.join(OUT_DIR, fileName);
  fs.writeFileSync(out, JSON.stringify({ fetched_at: new Date().toISOString(), source: store, body }, null, 2), 'utf8');
  console.log('WROTE', out);
}

// single fetch with retry
async function fetchStoreProducts(store) {
  const base = store.startsWith('http') ? store.replace(/\/+$/, '') : `https://${store.replace(/\/+$/, '')}`;
  // Common paths to try (Shopify common)
  const attempts = [
    `${base}/products.json?limit=250`,
    `${base}/products.json`,
  ];

  return pRetry(async () => {
    // try each path until success
    let lastErr = null;
    for (const url of attempts) {
      try {
        const res = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 15000,
          validateStatus: status => (status >= 200 && status < 300) || status === 403 || status === 404
        });
        if (res.status === 200 && res.data) {
          return { url, status: res.status, data: res.data };
        }
        // if 403/404 return error to allow retry to skip or try again
        lastErr = new Error(`HTTP ${res.status} on ${url}`);
      } catch (err) {
        lastErr = err;
      }
    }
    // none succeeded -> throw so pRetry will retry
    throw lastErr || new Error('Unknown fetch error');
  }, {
    retries: 3,
    onFailedAttempt: error => {
      const attempt = error.attemptNumber;
      const retriesLeft = error.retriesLeft;
      console.warn(`${store} - attempt ${attempt} failed. ${retriesLeft} retries left. ${error.message}`);
    }
  });
}

// run with limited concurrency
async function runAll() {
  const queue = stores.slice();
  let inFlight = 0;
  const results = [];

  async function runNext() {
    if (!queue.length) return;
    if (inFlight >= concurrency) return;
    const store = queue.shift();
    inFlight++;
    try {
      console.log('Fetching', store);
      const r = await fetchStoreProducts(store);
      if (r && r.data) {
        writeSnapshot(store, r.data);
        results.push({ store, ok: true });
      } else {
        console.warn('No data for', store, 'response:', r && r.status);
        results.push({ store, ok: false, reason: 'no-data' });
      }
    } catch (err) {
      console.error('ERR fetch', store, err && err.message ? err.message : err);
      results.push({ store, ok: false, reason: (err && err.message) || 'error' });
    } finally {
      inFlight--;
      // start next item
      await runNext();
    }
  }

  // bootstrap concurrency
  const starters = [];
  for (let i=0;i<concurrency;i++) starters.push(runNext());
  await Promise.all(starters);

  return results;
}

(async () => {
  try {
    const res = await runAll();
    console.log('Done shopify fetcher');
    const ok = res.filter(r=>r.ok).length;
    console.log(`Successful: ${ok} / ${res.length}`);
    // summary file
    const summaryPath = path.join(OUT_DIR, `summary.${tsForFilename()}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify({ ts: new Date().toISOString(), summary: res }, null, 2), 'utf8');
    console.log('Summary written to', summaryPath);
  } catch (err) {
    console.error('Fatal error in shopify fetcher', err);
    process.exit(1);
  }
})();
