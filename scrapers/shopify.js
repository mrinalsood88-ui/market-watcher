// shopify.js
// Fetch /products.json for each store in config and write timestamped snapshots
// Usage: node shopify.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pRetry = require('p-retry');

const CONFIG_FILE = path.join(__dirname, 'config', 'shopify_stores.json');
const OUTDIR = path.join(__dirname, 'data', 'shopify');
fs.mkdirSync(OUTDIR, { recursive: true });

function loadConfig(){
  if(!fs.existsSync(CONFIG_FILE)) throw new Error('Missing config/shopify_stores.json');
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

async function fetchProductsJson(storeDomain){
  const urls = [
    `https://${storeDomain}/products.json?limit=250`,
    `https://${storeDomain}/products.json`
  ];
  for(const url of urls){
    try{
      const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'MarketWatcher/1.0' } });
      if(res && res.data){
        const products = res.data.products || res.data;
        return { url, products };
      }
    }catch(e){
      // ignore and try next url
    }
  }
  return null;
}

function normalize(store, products){
  const rows = [];
  for(const p of (products||[])){
    const title = p.title || p.handle || 'Unnamed';
    const category = p.product_type || (p.tags || []).join(',') || '';
    const variants = p.variants && p.variants.length ? p.variants : [{ id: p.id, price: p.price, inventory_quantity: p.inventory_quantity || null }];
    for(const v of variants){
      rows.push({
        store,
        product_id: p.id || `${store}-${p.handle||title}`,
        variant_id: v.id || null,
        title,
        category,
        price: Number(v.price || v.presentment_price || p.price || 0),
        inventory_quantity: Number.isFinite(v.inventory_quantity) ? v.inventory_quantity : null,
        sku: v.sku || '',
        ts: new Date().toISOString()
      });
    }
  }
  return rows;
}

async function main(){
  const cfg = loadConfig();
  const stores = cfg.stores || [];
  const concurrency = cfg.concurrency || 3;

  console.log('Shopify fetcher starting. Stores:', stores.length);
  // simple concurrency loop
  for(let i=0;i<stores.length;i+=concurrency){
    const group = stores.slice(i, i+concurrency);
    await Promise.all(group.map(async store=>{
      try{
        const result = await pRetry(()=>fetchProductsJson(store), { retries: 1 });
        if(!result){
          console.warn('No products.json for', store);
          return;
        }
        const rows = normalize(store, result.products);
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        const fname = path.join(OUTDIR, `${store.replace(/[:\/]/g,'_')}.${ts}.json`);
        fs.writeFileSync(fname, JSON.stringify({ ts: new Date().toISOString(), store, source: 'shopify', count: rows.length, items: rows }, null, 2));
        console.log('WROTE', fname, 'items', rows.length);
      }catch(err){
        console.error('ERR fetch', store, err && err.message || err);
      }
    }));
    // polite pause between groups
    await new Promise(r=>setTimeout(r, 1000 + Math.random()*2000));
  }
  console.log('Done shopify fetcher');
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
