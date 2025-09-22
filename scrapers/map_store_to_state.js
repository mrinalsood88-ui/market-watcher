
// map_store_to_state.js
// Attempt to find a US state for each store by scraping common pages: /contact, /about, homepage
// Writes config/store_metadata.json with {store, state, confidence}

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const CONFIG_DIR = path.join(__dirname, 'config');
const DISCOVERED = path.join(CONFIG_DIR, 'discovered_stores.json'); // optional
const STORE_CONFIG = path.join(CONFIG_DIR, 'shopify_stores.json');
const OUT = path.join(CONFIG_DIR, 'store_metadata.json');

const STATE_RE = new RegExp('\\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\\b', 'i');

function loadStoreList(){
  if(fs.existsSync(DISCOVERED)){
    const j = JSON.parse(fs.readFileSync(DISCOVERED,'utf8'));
    if(j && j.stores) return j.stores.map(s=>s.host);
  }
  if(fs.existsSync(STORE_CONFIG)){
    const j = JSON.parse(fs.readFileSync(STORE_CONFIG,'utf8'));
    return j.stores || [];
  }
  return [];
}

async function tryFetch(url){
  try{
    const r = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'MarketWatcher/1.0' } });
    return r.data;
  }catch(e){
    return null;
  }
}

function findStateInText(text){
  if(!text) return null;
  const m = text.match(STATE_RE);
  if(m) return m[1].toUpperCase();
  return null;
}

async function inspectStore(store){
  const pages = [
    `https://${store}/contact`,
    `https://${store}/contact-us`,
    `https://${store}/about`,
    `https://${store}/about-us`,
    `https://${store}/`,
    `https://${store}/pages/contact-us`
  ];
  for(const p of pages){
    const html = await tryFetch(p);
    if(!html) continue;
    const $ = cheerio.load(html);
    const text = $('body').text().replace(/\s+/g,' ');
    const state = findStateInText(text);
    if(state) return { store, state, confidence: 'medium', source: p };
    // look for structured address
    const ld = $('script[type="application/ld+json"]').map((i,el)=>$(el).html()).get();
    for(const s of ld){
      try{
        const j = JSON.parse(s);
        const jtxt = JSON.stringify(j);
        const st = findStateInText(jtxt);
        if(st) return { store, state: st, confidence: 'high', source: p };
      }catch(e){}
    }
  }
  return { store, state: 'Unknown', confidence: 'low', source: null };
}

async function main(){
  const stores = loadStoreList();
  const out = [];
  for(const s of stores){
    console.log('Inspecting', s);
    const md = await inspectStore(s);
    out.push(md);
    // polite delay
    await new Promise(r=>setTimeout(r, 800 + Math.random()*400));
  }
  fs.writeFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), count: out.length, stores: out }, null, 2));
  console.log('WROTE', OUT);
}

main().catch(e=>{ console.error(e); process.exit(1); });
