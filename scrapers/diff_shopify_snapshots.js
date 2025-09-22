
// diff_shopify_snapshots.js
// For each store, find the two latest snapshots and compute sold units per variant
// Writes intermediate aggregated files to data/aggregated/shopify_[timestamp].json

const fs = require('fs');
const path = require('path');

const DATADIR = path.join(__dirname, 'data', 'shopify');
const OUTDIR = path.join(__dirname, 'data', 'aggregated');
fs.mkdirSync(OUTDIR, { recursive: true });

function listStoreFiles(){
  if(!fs.existsSync(DATADIR)) return [];
  return fs.readdirSync(DATADIR).filter(f=>f.endsWith('.json')).map(f=>path.join(DATADIR,f));
}

function groupByStore(files){
  const map = {};
  for(const f of files){
    const base = path.basename(f);
    const store = base.split('.')[0]; // store_domain.timestamp.json
    if(!map[store]) map[store]=[];
    map[store].push(f);
  }
  for(const k of Object.keys(map)){
    map[k].sort(); // lexicographic sort by timestamp in filename
  }
  return map;
}

function loadJson(f){
  try{ return JSON.parse(fs.readFileSync(f,'utf8')); }catch(e){ return null; }
}

function computeDiff(prevSnap, curSnap){
  // build map prev variant -> qty
  const prevMap = new Map();
  (prevSnap.items||[]).forEach(it=>{
    const key = `${it.product_id}::${it.variant_id||''}`;
    prevMap.set(key, it.inventory_quantity == null ? null : Number(it.inventory_quantity));
  });
  const rows = [];
  (curSnap.items||[]).forEach(it=>{
    const key = `${it.product_id}::${it.variant_id||''}`;
    const prevQty = prevMap.has(key) ? prevMap.get(key) : null;
    const curQty = it.inventory_quantity == null ? null : Number(it.inventory_quantity);
    const sold = (prevQty != null && curQty != null) ? Math.max(0, prevQty - curQty) : 0;
    const revenue = sold * (it.price || 0);
    rows.push({
      store: curSnap.store,
      product_id: it.product_id,
      variant_id: it.variant_id,
      title: it.title,
      category: it.category,
      price: it.price,
      inventory_prev: prevQty,
      inventory_now: curQty,
      sold_units: sold,
      estimated_revenue: Number(revenue.toFixed(2)),
      ts_prev: prevSnap.ts,
      ts_now: curSnap.ts
    });
  });
  return rows;
}

function writeAggregated(rows){
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const fname = path.join(OUTDIR, `shopify_aggregated.${ts}.json`);
  fs.writeFileSync(fname, JSON.stringify({ ts: new Date().toISOString(), count: rows.length, items: rows }, null, 2));
  console.log('WROTE', fname);
  return fname;
}

function main(){
  const files = listStoreFiles();
  const grouped = groupByStore(files);
  const allRows = [];
  for(const store of Object.keys(grouped)){
    const arr = grouped[store];
    if(arr.length < 2) continue; // need at least two snapshots
    const prev = loadJson(arr[arr.length-2]);
    const cur = loadJson(arr[arr.length-1]);
    if(!prev || !cur) continue;
    const diffs = computeDiff(prev, cur).filter(r=>r.sold_units>0);
    allRows.push(...diffs);
  }
  if(allRows.length === 0){
    console.log('No sales detected in diff step.');
    return;
  }
  writeAggregated(allRows);
}

main();
