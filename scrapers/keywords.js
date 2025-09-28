import fs from "fs";
import path from "path";

const OUT_DIR = path.join("out", "keywords");
const OUT_FILE = path.join(OUT_DIR, "keyword_hot.json");

const src = "https://fakestoreapi.com/products";

const STOP = new Set([
  "with","and","for","the","a","an","of","to","in","on","by","at","from",
  "&","-","–","—",":","'", "\""
]);

function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

async function fetchAll() {
  const res = await fetch(src, { timeout: 30000 });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const products = await fetchAll();

  const freq = new Map();
  for (const p of products) {
    for (const w of tokenize(p.title)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword, count]) => ({
      keyword,
      // Synthetic but stable-ish numbers for demo UI
      search_volume: Math.max(1200, count * 3200 + Math.floor(Math.random() * 800)),
      trend: count >= 3 ? "up" : count === 2 ? "steady" : "down"
    }));

  const payload = {
    ok: true,
    source: "scraper-v1",
    timestamp: new Date().toISOString(),
    items_count: ranked.length,
    top_keywords: ranked.slice(0, 10)
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${payload.items_count} keywords`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
