import fs from "fs";
import path from "path";
import { scrapeAmazonUSBestsellers } from "./products.js";
import { fetchUSTrendingKeywords } from "./keywords.js";
import { fetchProductNews } from "./news.js";

async function runCollector() {
  try {
    console.log("🚀 Starting USA Market Collector...");

    // 1️⃣ Fetch trending keywords (Google Trends US)
    const keywords = await fetchUSTrendingKeywords();

    // 2️⃣ Scrape Amazon US Bestsellers
    const amazon = await scrapeAmazonUSBestsellers();

    // 3️⃣ Get related product mentions (NewsAPI)
    const news = await fetchProductNews(process.env.NEWS_API_KEY, keywords);

    // 4️⃣ Build full dataset
    const fullData = {
      collectedAt: new Date().toISOString(),
      trending_keywords: keywords,
      top_items: amazon,
      mentions: news
    };

    // 5️⃣ Write full dataset to /products/hot_all.json
    fs.mkdirSync("products", { recursive: true });
    const productsPath = path.join("products", "hot_all.json");
    fs.writeFileSync(productsPath, JSON.stringify(fullData, null, 2));
    console.log("💾 Saved full data →", productsPath);

    // 6️⃣ Write keywords-only dataset to /keywords/keyword_hot.json
    fs.mkdirSync("keywords", { recursive: true });
    const keywordsData = { collectedAt: new Date().toISOString(), keywords };
    const keywordsPath = path.join("keywords", "keyword_hot.json");
    fs.writeFileSync(keywordsPath, JSON.stringify(keywordsData, null, 2));
    console.log("💾 Saved keywords-only data →", keywordsPath);

    console.log("✅ Collection complete!");
  } catch (e) {
    console.error("🚨 Collector error:", e.message);
  }
}

runCollector();
