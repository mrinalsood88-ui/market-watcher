/**
 * run_all.mjs
 * ------------------------------------------------------
 * Unified data collector using SerpApi + NewsAPI
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { fetchUSTrendingKeywords } from "./keywords.mjs";
import { fetchWalmartTrending } from "./walmart.mjs";
import { fetchProductNews } from "./news.mjs";

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsDir = path.join(__dirname, "../products");
const keywordsDir = path.join(__dirname, "../keywords");

if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir, { recursive: true });
if (!fs.existsSync(keywordsDir)) fs.mkdirSync(keywordsDir, { recursive: true });

async function runCollector() {
  console.log("🚀 Starting USA Market Collector...");

  const fullData = [];
  const keywordList = [];

  // 1️⃣ Google Trends via SerpApi
  const keywords = await fetchUSTrendingKeywords();
  fullData.push(...keywords);
  keywordList.push(...keywords.map(k => k.keyword));

  // 2️⃣ Walmart Trends
  const walmart = await fetchWalmartTrending();
  fullData.push(...walmart);
  keywordList.push(...walmart.map(w => w.name));

  // 3️⃣ News Mentions
  const news = await fetchProductNews();
  fullData.push(...news);
  keywordList.push(...news.map(n => n.keyword));

  // 💾 Save
  const timestamp = new Date().toISOString();
  fs.writeFileSync(
    path.join(productsDir, "hot_all.json"),
    JSON.stringify({ updated: timestamp, data: fullData }, null, 2)
  );
  fs.writeFileSync(
    path.join(keywordsDir, "keyword_hot.json"),
    JSON.stringify({ updated: timestamp, keywords: keywordList }, null, 2)
  );

  console.log("✅ Collection complete!");
}

runCollector().catch((err) => console.error("🚨 Collector error:", err));
