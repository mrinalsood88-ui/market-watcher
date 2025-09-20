/**
 * scrapers/keyword_tracker.js
 * Track trending product keywords (Google Trends).
 *
 * Run: node keyword_tracker.js
 * Output: scrapers/out/keyword_hot.json
 *
 * Requires: npm install google-trends-api
 */

const fs = require("fs");
const path = require("path");
const gtrends = require("google-trends-api");

const OUT = path.join(__dirname, "out", "keyword_hot.json");

// 🔹 Seed keywords — you can expand this list manually or from stores
const seedKeywords = [
  "wireless earbuds",
  "automatic pet feeder",
  "car vacuum cleaner",
  "standing desk",
  "air fryer",
  "portable blender",
  "yoga mat",
  "gaming chair"
];

// Config
const TIMEFRAME = "now 30-d"; // last 30 days
const GEO = "US";             // USA only
const DELAY = 1500;           // ms between API calls

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function analyzeKeyword(keyword) {
  try {
    console.log(`Fetching trends for "${keyword}"...`);

    // Interest over time
    const overTime = JSON.parse(
      await gtrends.interestOverTime({ keyword, geo: GEO, timeframe: TIMEFRAME })
    );

    const timeline = overTime.default?.timelineData || [];
    const values = timeline.map((t) => (t.value[0] || 0));
    const maxVal = values.length ? Math.max(...values) : 0;

    // Growth %
    const half = Math.floor(values.length / 2);
    const firstAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
    const lastAvg = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half || 1);
    const growthPct = firstAvg === 0 ? (lastAvg > 0 ? 100 : 0) : ((lastAvg - firstAvg) / firstAvg) * 100;

    // Interest by region (states)
    const byRegion = JSON.parse(
      await gtrends.interestByRegion({ keyword, geo: GEO, resolution: "REGION", timeframe: TIMEFRAME })
    );
    const interestByState = {};
    (byRegion.default?.geoMapData || []).forEach((r) => {
      interestByState[r.geoName] = r.value[0] || 0;
    });

    // Related queries
    let related = [];
    try {
      const rq = JSON.parse(
        await gtrends.relatedQueries({ keyword, geo: GEO, timeframe: TIMEFRAME })
      );
      related = rq.default?.rankedList?.[0]?.rankedKeyword?.map((x) => x.query) || [];
    } catch {}

    return {
      keyword,
      score: maxVal,
      growth_pct: Math.round(growthPct * 100) / 100,
      interest_by_state: interestByState,
      related
    };
  } catch (err) {
    console.error("Error fetching keyword:", keyword, err.message);
    return { keyword, error: err.message };
  }
}

(async () => {
  const results = [];
  for (const kw of seedKeywords) {
    const res = await analyzeKeyword(kw);
    results.push(res);
    await sleep(DELAY);
  }

  results.sort((a, b) => (b.score * (1 + b.growth_pct / 100)) - (a.score * (1 + a.growth_pct / 100)));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), keywords: results }, null, 2));
  console.log("✅ Wrote", OUT);
})();
