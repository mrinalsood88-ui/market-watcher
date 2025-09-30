/**
 * walmart.mjs
 * Fetch Walmart-related keywords using SerpApi (free)
 */
import axios from "axios";
import 'dotenv/config';
import fs from "fs";
import path from "path";

export async function fetchWalmartTrending() {
  console.log("🛒 Fetching Walmart-related trends via SerpApi (free)...");

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ SERP_API_KEY not set. Skipping Walmart fetch.");
    return [];
  }

  const query = "walmart trending products";
  const url = `https://serpapi.com/search.json?engine=google_trends_autocomplete&q=${encodeURIComponent(query)}&api_key=${apiKey}`;

  try {
    const res = await axios.get(url);
    const data = res.data;
    if (!data?.suggestions?.length) {
      console.warn("⚠️ No Walmart-related keywords found.");
      return [];
    }

    const items = data.suggestions.map((item, i) => ({
      rank: i + 1,
      name: item.query || item,
      source: "SerpApi - Walmart Autocomplete",
      collectedAt: new Date().toISOString(),
    }));

    const outDir = path.join(process.cwd(), "products");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "hot_all.json"), JSON.stringify(items, null, 2));

    console.log(`✅ Found ${items.length} Walmart-related keywords.`);
    return items;
  } catch (err) {
    console.error("❌ Walmart fetch error:", err.message);
    return [];
  }
}
