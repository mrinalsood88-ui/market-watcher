import googleTrends from "google-trends-api";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

// -----------------------------------------
// 1️⃣ Google Trends (Top searches in the USA)
// -----------------------------------------
async function fetchUSTrendingKeywords() {
  console.log("📈 Fetching Google Trends (US)...");
  const results = await googleTrends.dailyTrends({ geo: "US" });
  const parsed = JSON.parse(results);
  const keywords = parsed.default.trendingSearchesDays.flatMap(day =>
    day.trendingSearches.map(s => s.title.query)
  );
  console.log(`✅ Found ${keywords.length} trending keywords`);
  return keywords;
}

// -----------------------------------------
// 2️⃣ Amazon Best Sellers (US)
// -----------------------------------------
async function scrapeAmazonUSBestsellers() {
  console.log("🛒 Scraping Amazon Best Sellers (US)...");
  const url = "https://www.amazon.com/Best-Sellers/zgbs";
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const $ = cheerio.load(data);
  const items = [];

  $("._cDEzb_p13n-sc-css-line-clamp-3_g3dy1").each((i, el) => {
    const name = $(el).text().trim();
    const link = "https://www.amazon.com" + $(el).closest("a").attr("href");
    if (name) items.push({ rank: i + 1, name, link, source: "Amazon" });
  });

  console.log(`✅ Found ${items.length} Amazon products`);
  return items;
}

// -----------------------------------------
// 3️⃣ NewsAPI (Mentions of top keywords)
// -----------------------------------------
async function fetchProductNews(apiKey, keywords) {
  console.log("📰 Fetching product mentions from NewsAPI...");
  const query = keywords.slice(0, 5).join(" OR "); // top 5 keywords
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    query
  )}&language=en&apiKey=${apiKey}`;

  try {
    const { data } = await axios.get(url);
    const articles = data.articles.map(a => ({
      title: a.title,
      source: a.source.name,
      publishedAt: a.publishedAt,
      url: a.url
    }));
    console.log(`✅ Found ${articles.length} news articles`);
    return articles;
  } catch (err) {
    console.error("❌ NewsAPI error:", err.message);
    return [];
  }
}

// -----------------------------------------
// 🧩 Aggregator
// -----------------------------------------
async function runCollector() {
  try {
    const keywords = await fetchUSTrendingKeywords();
    const amazon = await scrapeAmazonUSBestsellers();
    const news = await fetchProductNews(process.env.NEWS_API_KEY, keywords);

    const data = {
      collectedAt: new Date().toISOString(),
      trending_keywords: keywords,
      top_items: amazon,
      mentions: news
    };

    fs.mkdirSync("products", { recursive: true });
    const outPath = path.join("products", "hot_all.json");
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log("💾 Saved:", outPath);
  } catch (e) {
    console.error("🚨 Collector error:", e.message);
  }
}

runCollector();
