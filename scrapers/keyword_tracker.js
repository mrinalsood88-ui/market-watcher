/**
 * scrapers/keyword_tracker.js
 *
 * Tracks trending keywords using Google Trends API.
 * Output: scrapers/out/keywords/keyword_hot.json
 */

const fs = require("fs");
const path = require("path");
const googleTrends = require("google-trends-api");

const KEYWORDS = [
  "wireless earbuds",
  "air fryer",
  "smartwatch",
  "yoga mat",
  "gaming chair"
];

const OUT_PATH = path.join(__dirname, "out", "keywords", "keyword_hot.json");

async function fetchKeywordData(keyword) {
  try {
    const today = new Date();
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 30);

    // Interest over time (last 30 days)
    const interestOverTime = await googleTrends.interestOverTime({
      keyword,
      startTime: last30Days,
      endTime: today,
      geo: "US",
    });

    // Interest by region (state-level in US)
    const interestByRegion = await googleTrends.interestByRegion({
      keyword,
      startTime: last30Days,
      endTime: today,
      geo: "US",
      resolution: "REGION"
    });

    const parsedTime = interestOverTime ? JSON.parse(interestOverTime) : null;
    const parsedRegion = interestByRegion ? JSON.parse(interestByRegion) : null;

    const timelineData = (parsedTime && parsedTime.default && parsedTime.default.timelineData) || [];
    const values = timelineData.map(d => parseInt(d.value[0] || 0, 10));
    const avgScore = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const growth = values.length > 1 ? values[values.length - 1] - values[0] : 0;

    // Region data safe-guarding and mapping
    const geoMapData = (parsedRegion && parsedRegion.default && parsedRegion.default.geoMapData) || [];
    const topRegions = geoMapData
      .slice() // avoid mutating original
      .sort((a, b) => (b.value && b.value[0] || 0) - (a.value && a.value[0] || 0))
      .slice(0, 5)
      .map(r => ({
        region: r.geoName || r.geoName || "Unknown",
        score: (r.value && r.value[0]) || 0
      }));

    return {
      keyword,
      avgScore,
      growth,
      topRegions,
      fetchedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error(`Error fetching data for ${keyword}:`, err && err.message ? err.message : err);
    return { keyword, error: true, errorMessage: err && err.message ? err.message : String(err) };
  }
}

// Main runner
(async function runTracker() {
  try {
    const results = [];
    for (const kw of KEYWORDS) {
      // small pause to be polite to API (optional)
      const data = await fetchKeywordData(kw);
      results.push(data);
    }

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

    // Save results
    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), "utf8");
    console.log("Keyword data saved to:", OUT_PATH);
  } catch (err) {
    console.error("Tracker failed:", err && err.message ? err.message : err);
    process.exit(1);
  }
})();
