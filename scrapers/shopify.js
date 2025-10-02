// scrapers/shopify.mjs
import fs from "fs";
import path from "path";
import axios from "axios";

const OUTPUT_PATH = path.resolve("./products/shopify_products.json");

/**
 * Fetch trending Shopify products (demo version)
 * Replace API URL below with your affiliate feed or private Shopify endpoint if available.
 */
export async function fetchShopifyProducts() {
  console.log("🛍️ Fetching Shopify trending products...");

  try {
    // 🔹 Example using DummyJSON (public API)
    const { data } = await axios.get("https://dummyjson.com/products?limit=10");

    // 🔹 Map response to a clean structure
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

    // 🔹 Save JSON file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 2), "utf8");

    console.log(`✅ Saved ${products.length} Shopify products → ${OUTPUT_PATH}`);
    return products;
  } catch (error) {
    console.error("❌ Shopify fetch error:", error.message);
    return [];
  }
}

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchShopifyProducts();
}
