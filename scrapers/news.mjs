/**
 * news.mjs
 * Fetch trending product mentions from NewsAPI (free)
 */
import axios from "axios";
import 'dotenv/config';
import fs from "fs";
import path from "path";

export async function fetchProductNews() {
  console.log("📰 Fetching trending product mentions from NewsAPI...");

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ NEWS_API_KEY not set. Skipping NewsAPI fetch.");
    return [];
  }

  const url = `https://newsapi.org/v2/everything?q=trending+products&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;

  try {
    const res = await axios.get(url);
    const articles = res.data.articles || [];

    const news = articles.map((a, i) => ({
      rank: i + 1,
      title: a.title,
      source: a.source.name,
      url: a.url,
      publishedAt: a.publishedAt,
      sourceType: "NewsAPI",
      collectedAt: new Date().toISOString(),
    }));

    const outDir = path.join(process.cwd(), "products");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "news.json"), JSON.stringify(news, null, 2));

    console.log(`✅ Found ${news.length} news articles.`);
    return news;
  } catch (err) {
    console.error("❌ NewsAPI fetch error:", err.message);
    return [];
  }
}
