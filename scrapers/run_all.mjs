/**
 * run_all.mjs
 * Unified Market Watcher scraper with:
 *  ✅ SerpApi + NewsAPI support
 *  📅 15-day rolling data snapshots
 *  💾 Master & daily files
 *  🧹 Automatic cleanup of older files
 */

import fs from "fs";
import path from "path";
import 'dotenv/config';

// Import individual modules
import { fetchUSTrendingKeywords } from "./keywords.mjs";
import { fetchWalmartTrending } from "./walmart.mjs";
import { fetchProductNews } from "./news.mjs";

/* -----------------------------------
   Utility Functions
----------------------------------- */

// ✅ Ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// 🧹 Keep only last N files
function cleanupOldFiles(dir, days = 15) {
  const files = fs.readdirSync(dir)
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(dir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time); // newest → oldest

  if (files.length > days) {
    const oldFiles = files.slice(days);
    for (const f of oldFiles) {
      fs.unlinkSync(path.join(dir, f.name));
      console.log(`🧹 Deleted old file: ${f.name}`);
    }
  }
}

// 🧱 Safe wrapper for scrapers
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

/* -----------------------------------
   Main Collector
----------------------------------- */
async function runCollector() {
  console.log("🚀 Starting USA Market Collector...");

  // 📁 Create directories if not exist
  const productsDir = path.join(process.cwd(), "products");
  const keywordsDir = path.join(process.cwd(), "keywords");
  ensureDir(productsDir);
  ensureDir(keywordsDir);

  // 🔹 Final compiled arrays
  const fullData = [];
  const keywordData = [];

  // 📈 Step 1 — Google Trends (SerpApi autocomplete)
  const trends = await safeRun("Google Trends", fetchUSTrendingKeywords);
  fullData.push(...trends);
  keywordData.push(...trends);

  // 🛒 Step 2 — Walmart Trends
  const walmart = await safeRun("Walmart Trends", fetchWalmartTrending);
  fullData.push(...walmart);

  // 📰 Step 3 — NewsAPI (optional)
  let news = [];
  if (!process.env.NEWS_API_KEY) {
    console.warn("⚠️ NEWS_API_KEY not set. Skipping NewsAPI fetch.");
  } else {
    news = await safeRun("NewsAPI", fetchProductNews);
    fullData.push(...news);
  }

  // 🗓 Date string for snapshot
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // 💾 Master JSONs
  const fullOut = path.join(productsDir, "hot_all.json");
  const keywordOut = path.join(keywordsDir, "keyword_hot.json");
  fs.writeFileSync(fullOut, JSON.stringify(fullData, null, 2));
  fs.writeFileSync(keywordOut, JSON.stringify(k
