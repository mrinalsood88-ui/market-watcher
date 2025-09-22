
// top10_ranker.js
// Compute Top-10 product rankings globally and per-state and inject into hot_all.json
// Usage: node top10_ranker.js

const fs = require('fs');
const path = require('path');

const HOT_ALL = path.join(__dirname, 'out', 'hot_all.json');
const OUT_DIR = path.join(__dirname, 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Config: weights (tune as you like)
const w_trends = 0.6;   // weight of keyword/search interest score (0-100)
const w_sales = 0.3;    // weight of confirmed sales signal (normalized)
const w_revenue = 0.1;  // weight of revenue (normalized)

function safeRead(p){ try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) { return null; } }
function safeWrite(p, obj){ fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }

const data = safeRead(HOT_ALL);
if(!data){ console.error('hot_all.json not found at', HOT_ALL); process.exit(1); }

const items = (data.top_items || data.items || []).map((it, idx) => {
  // ensure fields exist
  return Object.assign({}, it, {
    _idx: idx,
    keyword_score: Number(it.keyword_score||0),
    net_quantity_sold: Number(it.net_quantity_sold||it.estimated_quantity_sold||0),
    net_revenue: Number(it.net_revenue||it.estimated_revenue||0)
  });
});

// Helper: normalize an array of numbers to 0-100
function normalizeZeroOneTo100(arr){
  const vals = arr.map(v => (isFinite(v) && v >= 0) ? v : 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  // If max==min -> give equal weights
  if(max === min) return vals.map(_ => 50);
  return vals.map(v => Math.round(( (v - min) / (max - min) ) * 100));
}

// Build arrays for normalization
const trendArr = items.map(i => i.keyword_score || 0);
const salesArr = items.map(i => i.net_quantity_sold || 0);
const revArr   = items.map(i => i.net_revenue || 0);

const normTrends = normalizeZeroOneTo100(trendArr);
const normSales  = normalizeZeroOneTo100(salesArr);
const normRev    = normalizeZeroOneTo100(revArr);

// attach normalized values and compute demand_score
items.forEach((it, i) => {
  it._norm_trend = normTrends[i];
  it._norm_sales = normSales[i];
  it._norm_rev = normRev[i];
  // final demand_score 0-100
  const score = (w_trends * it._norm_trend) + (w_sales * it._norm_sales) + (w_revenue * it._norm_rev);
  it.demand_score = Math.round(score);
});

// Sort global top10
items.sort((a,b) => b.demand_score - a.demand_score || b._norm_sales - a._norm_sales);
const top10_global = items.slice(0, 10).map(pickForOutput);

// Per-state ranking
// We'll use item's search_interest_by_state (if present) or by_state counts as fallback.
const stateMap = {}; // stateCode -> array of items with per-state score
items.forEach(it => {
  // preferred: search_interest_by_state field (map of {CA:score})
  if(it.search_interest_by_state && typeof it.search_interest_by_state === 'object'){
    for(const [st, val] of Object.entries(it.search_interest_by_state)){
      const score = Number(val||0);
      if(!stateMap[st]) stateMap[st] = [];
      // compute local demand combining global demand_score and state interest
      const localScore = Math.round( (it.demand_score * 0.6) + (score * 0.4) );
      const clone = Object.assign({}, it, { local_score: localScore, state: st });
      stateMap[st].push(clone);
    }
  } else if(it.by_state && typeof it.by_state === 'object'){
    // fallback: by_state counts -> normalize within that item? we'll use raw count as proxy
    for(const [st,val] of Object.entries(it.by_state)){
      const stClean = (st==='undefined' ? 'Unknown' : st);
      if(!stateMap[stClean]) stateMap[stClean] = [];
      const localScore = Math.round( (it.demand_score * 0.6) + (Number(val||0) * 0.4) );
      const clone = Object.assign({}, it, { local_score: localScore, state: stClean });
      stateMap[stClean].push(clone);
    }
  } else {
    // no per-state info -> attach to Unknown
    const st = 'Unknown';
    if(!stateMap[st]) stateMap[st] = [];
    const clone = Object.assign({}, it, { local_score: it.demand_score, state: st });
    stateMap[st].push(clone);
  }
});

// reduce each state's list to top 10
const top10_by_state = {};
for(const [st, arr] of Object.entries(stateMap)){
  arr.sort((a,b) => b.local_score - a.local_score);
  top10_by_state[st] = arr.slice(0,10).map(pickForOutputState);
  // also write individual state file
  safeWrite(path.join(OUT_DIR, `hot_state_top10_${st}.json`), { ts: new Date().toISOString(), state: st, top10: top10_by_state[st] });
}

// write global top10 file too
safeWrite(path.join(OUT_DIR, 'hot_all_top10.json'), { ts: new Date().toISOString(), top10: top10_global });
console.log('WROTE top10 files. Global top10 count:', top10_global.length);

// Inject into hot_all.json and overwrite
data.top10_global = top10_global;
data.top10_by_state = top10_by_state;
safeWrite(HOT_ALL, data);
console.log('Injected top10 into', HOT_ALL);

// small formatter for output objects
function pickForOutput(it){
  return {
    product_id: it.product_id,
    title: it.title,
    category: it.category,
    average_price: it.average_price || it.price || it._norm_rev? it.price : null,
    demand_score: it.demand_score,
    keyword_score: it.keyword_score,
    net_quantity_sold: it.net_quantity_sold,
    net_revenue: it.net_revenue,
    store: it.store,
    source: it.source || 'shopify'
  };
}
function pickForOutputState(it){
  return Object.assign(pickForOutput(it), { local_score: it.local_score, state: it.state });
}
