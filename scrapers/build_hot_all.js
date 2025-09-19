// build_hot_all.js
// Merge aggregated shopify sales + store metadata into out/hot_all.json (sellable schema)

const fs = require('fs');
const path = require('path');

const AGGDIR = path.join(__dirname, 'data', 'aggregated');
const METADATA = path.join(__dirname, 'config', 'store_metadata.json');
const OUTDIR = path.join(__dirname, 'out');
fs.mkdirSync(OUTDIR, { recursive: true });

function latestAggregated(){
  if(!fs.existsSync(AGGDIR)) return null;
  const files = fs.readdirSync(AGGDIR).filter(f=>f.endsWith('.json')).map(f=>path.join(AGGDIR,f));
  if(files.length === 0) return null;
  files.sort();
  return files[files.length-1];
}

function loadJson(file){
  try{ return JSON.parse(fs.readFileSync(file,'utf8')); }catch(e){ return null; }
}

function buildItem(row, storeMetaMap){
  const storeMeta = storeMetaMap[row.store] || { state: 'Unknown', confidence: 'low' };
  const state = storeMeta.state || 'Unknown';
  const stateConfidence = storeMeta.confidence || 'low';
  const avgPrice = row.price || null;
  return {
    state,
    state_confidence: stateConfidence,
    timestamp: new Date().toISOString(),
    product_id: row.product_id,
    title: row.title,
    category: row.category || '',
    average_price: avgPrice,
    net_quantity_sold: row.sold_units,
    net_revenue: row.estimated_revenue,
    source: 'shopify',
    store: row.store,
    sale_window: { from: row.ts_prev || null, to: row.ts_now || null },
    confidence: { quantity: row.sold_units>0 ? 'high' : 'low', price: avgPrice!=null ? 'high' : 'low', state: stateConfidence, revenue: (row.estimated_revenue!=null ? 'high' : 'low') }
  };
}

function main(){
  const aggFile = latestAggregated();
  if(!aggFile) { console.log('No aggregated file found. Run diff_shopify_snapshots.js first.'); return; }
  const agg = loadJson(aggFile);
  const meta = loadJson(METADATA);
  const storeMetaMap = {};
  if(meta && meta.stores){
    for(const s of meta.stores) storeMetaMap[s.store] = { state: s.state, confidence: s.confidence };
  }
  const items = (agg.items || []).map(r => buildItem(r, storeMetaMap));
  const out = {
    ok: true,
    timestamp: new Date().toISOString(),
    source: 'shopify_aggregated',
    items_count: items.length,
    top_items: items
  };
  const outFile = path.join(OUTDIR, 'hot_all.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outFile, 'items', items.length);
}

main();
