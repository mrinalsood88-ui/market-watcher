/**
 * run_all.mjs
 * Unified Market Watcher scraper
 * ✅ SerpApi + NewsAPI integration
 * 📅 15-day snapshot rotation
 * 🧭 Auto index.json builder
 */

import fs from "fs";
import path from "path";
import 'dotenv/config';
import { fetchUSTrendingKeywords } from "./keywords.mjs";
import { fetchWalmartTrending } from "./walmart.mjs";
import { fetchProductNews } from "./news.mjs";
import { buildAllIndexes } from "./build_index.mjs";

/* Utility Helpers */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function cleanupOldFiles(dir, days = 15) {
  const files = fs.readdirSync(dir)
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(dir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length > days) {
    const oldFiles = files.slice(days);
    for (const f of oldFiles) {
      fs.unlinkSync(path.join(dir, f.name));
      console.log(`🧹 Deleted old file: ${f.name}`);
    }
  }
}

async function safeRun(label, fn) {
  try {
    const data = await fn();
    console.log(`✅ ${label} success (${data.length || 0} items)`);
    return data;
  } catch (err) {
    console.error(`❌ ${label} error:`, err.message);
    return [];
  }
}

/* Main Collector */
async function runCollector() {
  console.log("🚀 Starting USA Market Collector...");

  const productsDir = path.join(process.cwd(), "products");
  const keywordsDir = path.join(process.cwd(), "keywords");
  ensureDir(productsDir);
  ensureDir(keywordsDir);

  const fullData = [];
  const keywordData = [];

  // 📈 Google Trends
  const trends = await safeRun("Google Trends", fetchUSTrendingKeywords);
  fullData.push(...trends);
  keywordData.push(...trends);

  // 🛒 Walmart Trends
  const walmart = await safeRun("Walmart Trends", fetchWalmartTrending);
  fullData.push(...walmart);

  // 📰 NewsAPI
  let news = [];
  if (!process.env.NEWS_API_KEY) {
    console.warn("⚠️ NEWS_API_KEY not set. Skipping NewsAPI fetch.");
  } else {
    news = await safeRun("NewsAPI", fetchProductNews);
    fullData.push(...news);
  }

  // 📅 Date string
  const dateStr = new Date().toISOString().split("T")[0];

  // 💾 Save master files
  fs.writeFileSync(path.join(productsDir, "hot_all.json"), JSON.stringify(fullData, null, 2));
  fs.writeFileSync(path.join(keywordsDir, "keyword_hot.json"), JSON.stringify(keywordData, null, 2));

  // 💾 Save daily snapshots
  fs.writeFileSync(path.join(productsDir, `hot_all_${dateStr}.json`), JSON.stringify(fullData, null, 2));
  fs.writeFileSync(path.join(keywordsDir, `keyword_hot_${dateStr}.json`), JSON.stringify(keywordData, null, 2));
  console.log(`📅 Snapshot saved for ${dateStr}`);

  // 🧹 Cleanup old snapshots
  cleanupOldFiles(productsDir, 15);
  cleanupOldFiles(keywordsDir, 15);

  // 🧭 Build index.json files
  buildAllIndexes();

  console.log("✅ Collection complete!");
}

runCollector().catch(err => console.error("🚨 Collector failed:", err.message));
