/**
 * news.mjs
 * ------------------------------------------------------
 * Fetches trending product mentions via NewsAPI.
 * ✅ Safe guard for missing API key
 * ✅ Returns top 10 articles
 */

import axios from "axios";

export async function fetchProductNews() {
  console.log("📰 Fetching trending product mentions from NewsAPI...");

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.log("⚠️ NEWS_API_KEY not set. Skipping NewsAPI fetch.");
    return [];
  }

  try {
    const { data } = await axios.get("https://newsapi.org/v2/top-headlines", {
      params: {
        country: "us",
        category: "business",
        pageSize: 10,
        apiKey,
      },
      timeout: 20000,
    });

    if (!data?.articles?.length) {
      console.log("⚠️ No articles found in NewsAPI response");
      return [];
    }

    const articles = data.articles.map((a, i) => ({
      rank: i + 1,
      keyword: a.title,
      source: "NewsAPI",
      url: a.url,
      publishedAt: a.publishedAt,
    }));

    console.log(`✅ Found ${articles.length} trending articles`);
    return articles;
  } catch (err) {
    console.error("❌ NewsAPI fetch error:", err.message);
    return [];
  }
}
