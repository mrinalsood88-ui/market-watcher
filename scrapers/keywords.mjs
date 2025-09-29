import googleTrends from "google-trends-api";

export async function fetchUSTrendingKeywords() {
  console.log("📈 Fetching Google Trends (US)...");
  const results = await googleTrends.dailyTrends({ geo: "US" });
  const parsed = JSON.parse(results);
  const keywords = parsed.default.trendingSearchesDays.flatMap(day =>
    day.trendingSearches.map(s => s.title.query)
  );
  console.log(`✅ Found ${keywords.length} trending keywords`);
  return keywords;
}
