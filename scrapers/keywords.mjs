/**
 * keywords.mjs
 * ------------------------------------------------------
 * Fetches daily trending searches (US) from SerpApi.
 * ✅ 100% reliable (official Google data)
 * ✅ Requires SERP_API_KEY (private key)
 * ✅ No scraping or proxy needed
 */

import axios from "axios";

export async function fetchUSTrendingKeywords() {
  console.log("📈 Fetching Google Trends (US) via SerpApi...");

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.error("❌ SERP_API_KEY not set. Please run: set SERP_API_KEY=your_key_here");
    return [];
  }

  const url = "https://serpapi.com/search.json";
  const params = {
    engine: "google_trends_daily_trending_searches",
    geo: "US",
    api_key: apiKey,
  };

  try {
    const { data } = await axios.get(url, { params, timeout: 20000 });

    if (!data?.daily_trending_searches?.length) {
      console.warn("⚠️ No trending data found from SerpApi");
      return [];
    }

    const keywords = data.daily_trending_searches.flatMap((day) =>
      day.trending_searches.map((s) => s.query)
    );

    console.log(`✅ Found ${keywords.length} trending keywords`);

    return keywords.map((term, i) => ({
      rank: i + 1,
      keyword: term,
      source: "SerpApi-GoogleTrends",
      collectedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error("❌ SerpApi Google Trends fetch error:", err.message);
    return [];
  }
}
