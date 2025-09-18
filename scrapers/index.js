// scrapers/index.js
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'out');
const STATES = ['CA','NY','TX','FL','IL']; // shorten list for test

function ensureOut() { fs.mkdirSync(OUT_DIR, { recursive: true }); }
function writeJSON(filename, obj) {
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(obj, null, 2));
  console.log('WROTE', filename);
}

function makeProducts(state) {
  return [
    { id: `${state}-1`, title: "Wireless Earbuds", price: 39.99, score: 90 },
    { id: `${state}-2`, title: "Fitness Resistance Bands", price: 15.0, score: 85 }
  ];
}

async function run() {
  ensureOut();
  let all = [];
  for (const st of STATES) {
    const items = makeProducts(st);
    all.push(...items);
    writeJSON(`hot_USA-${st}.json`, { ok: true, region: st, ts: Date.now(), items });
  }
  writeJSON('hot_all.json', { ok: true, ts: Date.now(), items: all });
}
run();
