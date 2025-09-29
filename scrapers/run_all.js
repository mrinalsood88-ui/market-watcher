import fs from "fs";
import path from "path";
import { scrapeAmazonUSBestsellers } from "./products.js";
import { fetchUSTrendingKeywords } from "./keywords.js";
import { fetchProductNews } from "./news.js";
import { fetchWalmartTrending } from "./walmart.js";

async function runCollector() {
  try {
    console.log("🚀 Starting USA Market Collector...");

    // 1️⃣ Keywords
    const keywords = await fetchUSTrendingKeywords();

    // 2️⃣ Products (Amazon + Walmart)
    const amazon = await scrapeAmazonUSBestsellers();
    const walmart = await fetchWalmartTrending();
    const allProducts = [...amazon, ...walmart];

    // 3️⃣ News mentions
    const news = await fetchProductNews(process.env.NEWS_API_KEY, keywords);

    // 4️⃣ Build dataset
    const fullData = {
      collectedAt: new Date().toISOString(),
      trending_keywords: keywords,
      top_items: allProducts,
      mentions: news
    };

    // 5️⃣ Save full data
    fs.mkdirSync("products", { recursive: true });
    const productsPath = path.join("products", "hot_all.json");
    fs.writeFileSync(productsPath, JSON.stringify(fullData, null, 2));
    console.log("💾 Saved full data →", productsPath);

    // 6️⃣ Save keywords-only
    fs.mkdirSync("keywords", { recursive: true });
    const keywordsPath = path.join("keywords", "keyword_hot.json");
    const keywordsData = { collectedAt: new Date().toISOString(), keywords };
    fs.writeFileSync(keywordsPath, JSON.stringify(keywordsData, null, 2));
    console.log("💾 Saved keywords-only data →", keywordsPath);

    console.log("✅ Collection complete!");
  } catch (e) {
    console.error("🚨 Collector error:", e.message);
  }
}

runCollector();
