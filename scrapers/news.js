import axios from "axios";

export async function fetchProductNews(apiKey, keywords) {
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
