// scrapers/products.js — resilient version
// Node 20+ has global fetch
import fs from "fs";
import path from "path";

const OUT_DIR = path.join("out", "products");
const OUT_FILE = path.join(OUT_DIR, "hot_all.json");

// Primary + fallback sources
const SOURCES = [
  {
    name: "fakestore",
    url: "https://fakestoreapi.com/products",
    // normalize to a flat array of product-like objects
    normalize: (json) => Array.isArray(json) ? json : [],
    toItem: (p) => ({
      id: String(p.id),
      title: p.title,
      price: Math.round(Number(p.price) * 84), // USD→INR (demo)
      currency: "INR",
      url: `https://fakestoreapi.com/products/${p.id}`,
      image: p.image,
      rating: p.rating?.rate ?? null,
      reviews: p.rating?.count ?? null,
      category: p.category,
      source_site: "fakestoreapi.com",
    })
  },
  {
    name: "dummyjson",
    url: "https://dummyjson.com/products?limit=100",
    normalize: (json) => Array.isArray(json?.products) ? json.products : [],
    toItem: (p) => ({
      id: String(p.id),
      title: p.title,
      price: Math.round(Number(p.price) * 84), // USD→INR (demo)
      currency: "INR",
      url: `https://dummyjson.com/products/${p.id}`,
      image: Array.isArray(p.images) && p.images.length ? p.images[0] : p.thumbnail,
      rating: p.rating ?? null,
      reviews: p.stock ?? null, // proxy as "reviews" for demo
      category: p.category,
      source_site: "dummyjson.com",
    })
  }
];

async function fetchFromSource(src) {
  console.log(`→ Fetching from ${src.name}: ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  const arr = src.normalize(json);
  console.log(`   ${src.name} returned ${arr.length} items`);
  return arr.map(src.toItem);
}

function rankAndPick(items, limit = 10) {
  // Score by rating*reviews; fall back to rating or reviews so items without one still rank.
  const withScore = items.map((it) => {
    const r = Number(it.rating ?? 0);
    const c = Number(it.reviews ?? 0);
    const score = (isFinite(r) ? r : 0) * (isFinite(c) ? c : 0) + (isFinite(r) ? r : 0) + (isFinite(c) ? c / 100 : 0);
    return { ...it, _score: score };
  });

  return withScore
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => ({
      ...rest,
      updated_at: new Date().toISOString()
    }));
}

async function main() {
  let items = [];
  let usedSource = null;

  for (const src of SOURCES) {
    try {
      const got = await fetchFromSource(src);
      if (got.length > 0) {
        items = got;
        usedSource = src.name;
        break;
      } else {
        console.warn(`   ${src.name} returned 0 items, trying next source...`);
      }
    } catch (err) {
      console.warn(`   ${src.name} failed: ${err.message}`);
    }
  }

  if (items.length === 0) {
    // Last-ditch: write an empty but valid payload (so workflow doesn’t crash)
    console.error("❌ All sources failed or returned 0 items.");
    writePayload([], "none");
    process.exit(0);
  }

  const top = rankAndPick(items, 10);
  writePayload(top, usedSource ?? "unknown");
}

function writePayload(top, sourceName) {
  const payload = {
    ok: true,
    source: `scraper-v1:${sourceName}`,
    timestamp: new Date().toISOString(),
    items_count: top.length,
    top_items: top
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`✅ Wrote ${OUT_FILE} with ${top.length} items from ${sourceName}`);
}

main().catch((err) => {
  console.error("❌ products.js error:", err);
  // still emit a minimal file so your extension doesn't break
  try { writePayload([], "error"); } catch {}
  process.exit(1);
});
