import axios from "axios";

export async function fetchUSTrendingKeywords() {
  console.log("📈 Fetching Google Trends (US) via JSON API...");

  const url =
    "https://corsproxy.io/?" +
    encodeURIComponent("https://trends.google.com/trends/api/dailytrends?geo=US&hl=en-US");

  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    // Google Trends JSON is prefixed with )]}'
    const clean = data.replace(")]}',", "");
    const parsed = JSON.parse(clean);

    const keywords = parsed.default.trendingSearchesDays.flatMap(day =>
      day.trendingSearches.map(s => s.title.query)
    );

    console.log(`✅ Found ${keywords.length} trending keywords`);
    return keywords;
  } catch (err) {
    console.error("❌ Google Trends fetch error:", err.message);
    return [];
  }
}
