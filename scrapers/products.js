// Node 20+ has global fetch
import fs from "fs";
import path from "path";

const OUT_DIR = path.join("out", "products");
const OUT_FILE = path.join(OUT_DIR, "hot_all.json");

/**
 * Source: Fake Store API (demo, ToS-safe)
 * Swap `src` later to your own API or scraper output.
 */
const src = "https://fakestoreapi.com/products";

async function fetchProducts() {
  const res = await fetch(src, { timeout: 30000 });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  return res.json();
}

function transform(products) {
  // Score by (rating * reviews). Convert USD->INR approx for demo.
  return products
    .map((p) => ({
      id: String(p.id),
      title: p.title,
      price: Math.round(Number(p.price) * 84), // demo INR
      currency: "INR",
      url: `https://fakestoreapi.com/products/${p.id}`,
      image: p.image,
      rating: p.rating?.rate ?? null,
      reviews: p.rating?.count ?? null,
      category: p.category,
      source_site: "fakestoreapi.com",
      updated_at: new Date().toISOString(),
      _score: (p.rating?.rate ?? 0) * (p.rating?.count ?? 0)
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...rest }) => rest);
}

async function main() {
  const products = await fetchProducts();
  const top = transform(products);

  const payload = {
    ok: true,
    source: "scraper-v1",
    timestamp: new Date().toISOString(),
    items_count: top.length,
    top_items: top
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${top.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
