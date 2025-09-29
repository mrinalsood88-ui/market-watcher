
// scrapers/index.js
// Generates sellable, buyer-ready JSON per state and aggregated hot_all.json
// CommonJS; no external dependencies.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'out');
const COUNTRY = 'USA';
const TIMESTAMP = new Date().toISOString();

// 50 US states + DC
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

// Sample product pool and categories. Replace with real scraping later.
const SAMPLE_PRODUCTS = [
  { title: 'Wireless Earbuds', category: 'Electronics', base_price: 39.99 },
  { title: 'Portable Blender', category: 'Home', base_price: 29.99 },
  { title: 'LED Strip Lights', category: 'Home', base_price: 18.5 },
  { title: 'Fitness Resistance Bands', category: 'Fitness', base_price: 15.0 },
  { title: 'Magnetic Phone Holder', category: 'Auto', base_price: 12.95 },
  { title: 'Reusable Grocery Bags', category: 'Home', base_price: 9.99 },
  { title: 'Memory Foam Pillow', category: 'Home', base_price: 24.99 },
  { title: 'Car Seat Organizer', category: 'Auto', base_price: 19.99 },
  { title: 'Pet Grooming Glove', category: 'Pets', base_price: 8.5 },
  { title: 'Stainless Steel Water Bottle', category: 'Outdoors', base_price: 22.0 }
];

// Simple deterministic RNG by seed (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function ensureOut() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function safeReadJSON(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function writeJSON(filename, obj) {
  const full = path.join(OUT_DIR, filename);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
  console.log('WROTE', filename);
}

// Build items for a state (deterministic via state seed)
function buildItemsForState(stateCode) {
  const seedBase = 1000;
  const seed = seedBase + (stateCode.charCodeAt(0) || 0) * 31 + (stateCode.charCodeAt(1) || 0);
  const rand = mulberry32(seed);

  // Shuffle a copy of sample products
  const pool = SAMPLE_PRODUCTS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  // pick 5-8 top candidates
  const count = 5 + Math.floor(rand() * 4);
  const items = [];
  for (let i = 0; i < count; i++) {
    const p = pool[i % pool.length];
    // price variation +/-10%
    const priceFluct = (1 + (rand() - 0.5) * 0.2);
    const price = Math.max(1, +(p.base_price * priceFluct).toFixed(2));
    // estimated quantity sold in this period (e.g., last 24h or last run window): random but realistic
    const qty = Math.max(1, Math.round((50 + rand() * 450) * (1 + (rand() - 0.5) * 0.4)));
    const revenue = +(qty * price).toFixed(2);
    const score = Math.round(60 + rand() * 40); // 60..100

    items.push({
      id: `${stateCode}-${i}-${String(Date.now()).slice(-5)}`,
      title: p.title,
      category: p.category,
      price,
      estimated_quantity_sold: qty,
      estimated_revenue: revenue,
      score
    });
  }
  return items;
}

// Determine trend by comparing with previous state's file
function computeTrend(prevQty, newQty) {
  if (prevQty == null) return 'new';
  if (newQty >= prevQty * 1.1) return 'rising';
  if (newQty <= prevQty * 0.9) return 'falling';
  return 'stable';
}

function aggregateAllStates(perStateData) {
  // flatten all items and aggregate by title (sum qty & revenue)
  const map = {};
  perStateData.forEach(({ state, top_items }) => {
    top_items.forEach(item => {
      const key = item.title.toLowerCase();
      if (!map[key]) {
        map[key] = {
          title: item.title,
          category: item.category,
          total_quantity: 0,
          total_revenue: 0,
          states: {}
        };
      }
      map[key].total_quantity += item.estimated_quantity_sold || 0;
      map[key].total_revenue += item.estimated_revenue || 0;
      map[key].states[item.state] = (map[key].states[item.state] || 0) + (item.estimated_quantity_sold || 0);
    });
  });

  // convert to array and sort by total_quantity desc
  const arr = Object.keys(map).map(k => ({
    title: map[k].title,
    category: map[k].category,
    estimated_quantity_sold: map[k].total_quantity,
    estimated_revenue: +(map[k].total_revenue).toFixed(2),
    by_state: map[k].states
  }));

  arr.sort((a,b) => b.estimated_quantity_sold - a.estimated_quantity_sold);
  return arr;
}

// MAIN
(async function run() {
  try {
    console.log('Market watcher — generating structured sellable JSON...');
    ensureOut();

    const perStateResults = [];

    // Process each state
    for (const st of STATES) {
      const fname = `hot_${COUNTRY}-${st}.json`;
      const prev = safeReadJSON(path.join(OUT_DIR, fname));

      // build current items
      const itemsRaw = buildItemsForState(st);

      // compute total qty to derive market share
      const totalQty = itemsRaw.reduce((s, it) => s + (it.estimated_quantity_sold || 0), 0) || 1;

      // build top_items with rank and trend/history
      const top_items = [];
      for (let i = 0; i < itemsRaw.length; i++) {
        const it = itemsRaw[i];
        const prevItem = prev && prev.top_items && prev.top_items.find(pi => pi.title === it.title);
        const prevQty = prevItem ? prevItem.estimated_quantity_sold : null;
        const trend = computeTrend(prevQty, it.estimated_quantity_sold);

        // history: start from prev.history if exists, append current snapshot
        const history = (prevItem && prevItem.history && Array.isArray(prevItem.history)) ? prevItem.history.slice() : [];
        history.push({ ts: TIMESTAMP, estimated_quantity_sold: it.estimated_quantity_sold, estimated_revenue: it.estimated_revenue });

        top_items.push({
          rank: i + 1,
          title: it.title,
          category: it.category,
          price: it.price,
          estimated_quantity_sold: it.estimated_quantity_sold,
          estimated_revenue: it.estimated_revenue,
          market_share: +( (it.estimated_quantity_sold / totalQty) ).toFixed(4), // fraction of state's top-items qty
          score: it.score,
          trend,
          history
        });
      }

      // Compose state payload
      const payload = {
        ok: true,
        state: `${COUNTRY}-${st}`,
        timestamp: TIMESTAMP,
        top_items_count: top_items.length,
        total_estimated_quantity: totalQty,
        top_items
      };

      writeJSON(fname, payload);
      perStateResults.push({ state: `${COUNTRY}-${st}`, top_items: top_items, total_estimated_quantity: totalQty });
    }

    // Build aggregated hot_all.json (top products across states)
    const aggregated = aggregateAllStates(perStateResults);

    // Build top summary (top 50 or fewer)
    const hotAll = {
      ok: true,
      country: COUNTRY,
      timestamp: TIMESTAMP,
      states_processed: perStateResults.length,
      items_count: aggregated.length,
      top_items: aggregated.slice(0, 200) // slice to limit size; adjust as needed
    };

    writeJSON('hot_all.json', hotAll);

    console.log('Done — wrote per-state JSON and hot_all.json');
    process.exit(0);
  } catch (err) {
    console.error('Scraper failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
