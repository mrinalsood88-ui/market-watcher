// scrapers/index.js (uses public demo API to produce real-ish product data)
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUT_DIR = path.join(__dirname, 'out');
const COUNTRY = 'USA';
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

function ensureOut() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}
function writeJSON(filename, obj) {
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(obj, null, 2), 'utf8');
  console.log('WROTE', filename);
}

async function fetchProducts() {
  // demo public API - replace with your real sources later
  const url = 'https://fakestoreapi.com/products?limit=20';
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data || [];
}

function distributeToStates(products) {
  // Round-robin distribute sample products across states, add metadata
  const perState = {};
  const all = [];
  for (let i = 0; i < STATES.length; i++) perState[STATES[i]] = [];

  for (let i = 0; i < products.length; i++) {
    const st = STATES[i % STATES.length];
    const p = products[i];
    const item = {
      id: `ext-${p.id}-${st}`,
      title: p.title,
      price: p.price,
      category: p.category,
      source: 'fakestoreapi',
      ts: Date.now(),
      score: Math.round(60 + Math.random() * 40)
    };
    perState[st].push(item);
    all.push(item);
  }
  return { perState, all };
}

async function run() {
  try {
    console.log('Scraper: fetching demo product data...');
    ensureOut();
    const products = await fetchProducts();
    if (!products || products.length === 0) {
      console.log('No products fetched. Exiting with empty dataset.');
    }
    const { perState, all } = distributeToStates(products);

    // write per-state files
    for (const st of Object.keys(perState)) {
      const fname = `hot_${COUNTRY}-${st}.json`;
      const payload = {
        ok: true,
        country: COUNTRY,
        region: st,
        ts: Date.now(),
        items: perState[st]
      };
      writeJSON(fname, payload);
    }

    // write hot_all.json
    const hotAll = {
      ok: true,
      country: COUNTRY,
      ts: Date.now(),
      total_states: Object.keys(perState).length,
      items_count: all.length,
      items: all
    };
    writeJSON('hot_all.json', hotAll);

    console.log('Scrape run complete');
    process.exit(0);
  } catch (err) {
    console.error('Scraper error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

run();
