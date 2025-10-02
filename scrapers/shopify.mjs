// scrapers/shopify.mjs
import fs from "fs";
import path from "path";
import axios from "axios";

const OUTPUT_PATH = path.resolve("./products/shopify_products.json");

/**
 * 🛍️ Fetch trending Shopify products (demo version)
 * Replace API URL below with your affiliate feed or Shopify API if you have one.
 */
export async function fetchShopifyProducts() {
  console.log("🛍️ Fetching Shopify trending products...");

  try {
    // 🔹 Example: DummyJSON API (replace with your source)
    const { data } = await axios.get("https://dummyjson.com/products?limit=10");

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const products = data.products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      price: p.price,
      rating: p.rating,
      brand: p.brand,
      thumbnail: p.thumbnail,
      url: `https://dummyjson.com/products/${p.id}`,
    }));

    // 🗂️ Ensure directory exists
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let history = [];

    // 🧠 Read existing data (if any)
    if (fs.existsSync(OUTPUT_PATH)) {
      const fileData = fs.readFileSync(OUTPUT_PATH, "utf8");
      history = JSON.parse(fileData || "[]");
    }

    // 🆕 Add new record
    history.push({
      date: today,
      products,
    });

    // 🧹 Keep only last 30 days
    if (history.length > 30) {
      history = history.slice(history.length - 30);
    }

    // 💾 Save updated JSON
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(history, null, 2), "utf8");

    console.log(`✅ Added ${products.length} products for ${today}`);
    console.log(`📆 Kept last ${history.length} days of data`);
    console.log(`💾 Saved to → ${OUTPUT_PATH}`);
    return products;
  } catch (error) {
    console.error("❌ Shopify fetch error:", error.message);
    return [];
  }
}

// 🚀 Run standalone
if (process.argv[1].includes("shopify.mjs")) {
  fetchShopifyProducts()
    .then(() => console.log("✅ Done fetching Shopify products"))
    .catch(console.error);
}
