

/**
 * scrapers/build_hot_all.js
 *
 * Collects product snapshots, builds a combined "hot_all.json"
 * with top items ranked by sales/revenue.
 *
 * OUTPUT: scrapers/out/products/hot_all.json
 */

const fs = require("fs");
const path = require("path");

const SNAPSHOT_DIR = path.join(__dirname, "snapshots");
const OUT_FILE = path.join(__dirname, "out", "products", "hot_all.json");

function loadSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const full = path.join(SNAPSHOT_DIR, f);
      try {
        return JSON.parse(fs.readFileSync(full, "utf8"));
      } catch (e) {
        console.error("Error reading snapshot", f, e.message);
        return null;
      }
    })
    .filter(Boolean);
}

function aggregate(snapshots) {
  const productMap = {};

  snapshots.forEach(snap => {
    if (!Array.isArray(snap)) return;
    snap.forEach(item => {
      const key = item.product_id || item.title || "unknown";
      if (!productMap[key]) {
        productMap[key] = {
          product_id: item.product_id || key,
          title: item.title || key,
          category: item.category || "",
          price: item.price || 0,
          sold_units: 0,
          estimated_revenue: 0,
          states: {}
        };
      }
      const p = productMap[key];
      const sold = item.sold_units || 0;
      const revenue = item.estimated_revenue || (sold * (item.price || 0));
      p.sold_units += sold;
      p.estimated_revenue += revenue;

      if (item.state) {
        if (!p.states[item.state]) {
          p.states[item.state] = { sold_units: 0, estimated_revenue: 0 };
        }
        p.states[item.state].sold_units += sold;
        p.states[item.state].estimated_revenue += revenue;
      }
    });
  });

  return Object.values(productMap);
}

function topN(products, n = 20) {
  return [...products].sort((a, b) => b.estimated_revenue - a.estimated_revenue).slice(0, n);
}

(function main() {
  console.log("Building hot_all.json ...");

  const snapshots = loadSnapshots();
  if (!snapshots.length) {
    console.warn("No snapshots found.");
    return;
  }

  const aggregated = aggregate(snapshots);
  const topItems = topN(aggregated, 20);

  const outData = {
    ts: new Date().toISOString(),
    total_items: aggregated.length,
    top_items: topItems
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(outData, null, 2), "utf8");

  console.log("✅ Wrote", OUT_FILE, "with", topItems.length, "items.");
})();
