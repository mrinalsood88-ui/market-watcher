/**
 * walmart.mjs
 * ------------------------------------------------------
 * Filters Walmart-related trending searches from SerpApi data.
 */

import axios from "axios";

export async function fetchWalmartTrending() {
  console.log("🛒 Fetching Walmart-related trends via SerpApi...");

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

    const walmartQueries = data.daily_trending_searches
      .flatMap((day) =>
        day.trending_searches.map((s) => s.query.trim())
      )
      .filter((q) => q.toLowerCase().includes("walmart"));

    console.log(`✅ Found ${walmartQueries.length} Walmart-related trends`);

    return walmartQueries.map((q, i) => ({
      rank: i + 1,
      name: q,
      source: "SerpApi-Walmart",
      collectedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error("❌ SerpApi Walmart fetch error:", err.message);
    return [];
  }
}
