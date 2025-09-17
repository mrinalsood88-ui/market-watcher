// scrapers/index.js
// Simple generator that writes out/hot_all.json and hot_USA-<STATE>.json files
// Written as CommonJS so it runs in GitHub Actions Node by default.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'out');
const COUNTRY = 'USA';

// List of US states (2-letter codes + DC)
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

// SAMPLE product pool (placeholder). Replace with real scraping results later.
const SAMPLE_PRODUCTS = [
  { title: 'Portable Blender', category: 'Kitchen', price: 29.99 },
  { title: 'Magnetic Phone Holder', category: 'Auto', price: 12.95 },
  { title: 'LED Strip Lights', category: 'Home', price: 18.50 },
  { title: 'Reusable Grocery Bags', category: 'Home', price: 9.99 },
  { title: 'Wireless Earbuds', category: 'Electronics', price: 39.99 },
  { title: 'Fitness Resistance Bands', category: 'Fitness', price: 15.00 },
  { title: 'Pet Grooming Glove', category: 'Pets', price: 8.50 },
  { title: 'Memory Foam Pillow', category: 'Home', price: 24.99 },
  { title: 'Car Seat Organizer', category: 'Auto', price: 19.99 },
  { title: 'Stainless Steel Water Bottle', category: 'Outdoors', price: 22.00 }
];

// Utility: deterministic-ish pseudo-random by seed (simple mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Build sample "hot list" for a given state
function buildHotListForState(stateCode, seedBase = 12345) {
  // create RNG seeded with stateCode so outputs are stable between runs for same state
  const seed = seedBase + stateCode.charCodeAt(0) + (stateCode.charCodeAt(1) || 0);
  const rand = mulberry32(seed);

  // choose number of items 3..6
  const count = 3 + Math.floor(rand() * 4);
  const items = [];

  // pick shuffled sample products with slight variations (score, price_shown)
  const pool = SAMPLE_PRODUCTS.slice();
  // simple shuffle using rand
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length];
    const fluct = (rand() - 0.5) * 0.2; // +/- 10% price fluct
    const price = Math.max(1, +(base.price * (1 + fluct)).toFixed(2));
    const score = Math.round(60 + rand() * 40); // score 60..100

    items.push({
      id: `${stateCode}-${i}-${Date.now().toString().slice(-5)}`,
      title: base.title,
      category: base.category,
      price,
      score,
      source: 'sample', // change to 'amazon'/'shopify' when scraping actual source
      ts: Date.now()
    });
  }

  return items;
}

// Ensure output dir exists
function ensureOut() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Write JSON file with 2-space indentation
function writeJSON(filename, obj) {
  const full = path.join(OUT_DIR, filename);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
  console.log('WROTE', full);
}

// Main
async function run() {
  try {
    console.log('market-watcher scraper (placeholder) started');
    ensureOut();

    const allItems = [];
    const perStateSummary = {};

    for (const st of STATES) {
      const items = buildHotListForState(st);
      // store per-state file name: hot_USA-CA.json
      const fname = `hot_${COUNTRY}-${st}.json`;
      const payload = {
        ok: true,
        country: COUNTRY,
        region: st,
        ts: Date.now(),
        items
      };
      writeJSON(fname, payload);
      perStateSummary[st] = { count: items.length, ts: payload.ts };
      // append to global list (use small sample or full; here we append items)
      allItems.push(...items);
    }

    // Build hot_all.json — you can change aggregation logic as needed
    const hotAll = {
      ok: true,
      country: COUNTRY,
      ts: Date.now(),
      total_states: STATES.length,
      states: perStateSummary,
      items_count: allItems.length,
      items: allItems // careful: could be large — you can limit or summarise instead
    };

    writeJSON('hot_all.json', hotAll);

    console.log('Done — wrote per-state JSON and hot_all.json');
    process.exit(0);
  } catch (err) {
    console.error('Scraper failed:', err);
    process.exit(1);
  }
}

run();
