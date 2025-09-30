/**
 * keywords.mjs
 * Fetch trending keywords using SerpApi's google_trends_autocomplete engine (FREE)
 */
import axios from "axios";
import 'dotenv/config';
import fs from "fs";
import path from "path";

export async function fetchUSTrendingKeywords() {
  console.log("📈 Fetching Google Trends (US) via SerpApi (free)...");

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ SERP_API_KEY not set. Skipping SerpApi fetch.");
    return [];
  }

  const query = "trending products";
  const url = `https://serpapi.com/search.json?engine=google_trends_autocomplete&q=${encodeURIComponent(query)}&api_key=${apiKey}`;

  try {
    const res = await axios.get(url);
    const data = res.data;

    if (!data?.suggestions?.length) {
      console.warn("⚠️ No trending keywords found.");
      return [];
    }

    const trends = data.suggestions.map((item, i) => ({
      rank: i + 1,
      keyword: item.query || item,
      source: "SerpApi - google_trends_autocomplete",
      collectedAt: new Date().toISOString(),
    }));

    const outDir = path.join(process.cwd(), "keywords");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "keyword_hot.json"), JSON.stringify(trends, null, 2));

    console.log(`✅ Found ${trends.length} trending keywords.`);
    return trends;
  } catch (err) {
    console.error("❌ SerpApi Trends fetch error:", err.message);
    return [];
  }
}
