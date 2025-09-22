
/**
 * keyword_tracker.js
 *
 * Fetches Google Trends for keywords and writes a single file:
 *   out/keywords/keyword_hot.json
 *
 * Robust mapping of region data so keys are not "undefined".
 */

const fs = require('fs');
const path = require('path');
const googleTrends = require('google-trends-api');

const KEYWORDS = [
  "wireless earbuds",
  "air fryer",
  "smartwatch",
  "yoga mat",
  "gaming chair"
];

const OUT_PATH = path.join(__dirname, 'out', 'keywords', 'keyword_hot.json');

async function fetchKeywordData(keyword) {
  try {
    const today = new Date();
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 30);

    const [interestOverTimeRaw, interestByRegionRaw] = await Promise.all([
      googleTrends.interestOverTime({
        keyword,
        startTime: last30Days,
        endTime: today,
        geo: 'US',
      }),
      googleTrends.interestByRegion({
        keyword,
        startTime: last30Days,
        endTime: today,
        geo: 'US',
        resolution: 'REGION'
      })
    ]);

    const parsedTime = interestOverTimeRaw ? JSON.parse(interestOverTimeRaw) : null;
    const parsedRegion = interestByRegionRaw ? JSON.parse(interestByRegionRaw) : null;

    // timeline safe access
    const timelineData = (parsedTime && parsedTime.default && parsedTime.default.timelineData) || [];
    const values = timelineData.map(d => {
      // value might be array or number
      if (!d) return 0;
      const v = Array.isArray(d.value) ? d.value[0] : d.value;
      return Number.isFinite(Number(v)) ? Number(v) : 0;
    });

    const avgScore = values.length ? Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)) : 0;
    const growth = values.length > 1 ? values[values.length - 1] - values[0] : 0;

    // region safe access - google-trends usually returns default.geoMapData as an array
    const geoMapData = (parsedRegion && parsedRegion.default && parsedRegion.default.geoMapData) || [];

    // Build a stable by_state map with safe key fallbacks
    const by_state = {};
    for (const item of geoMapData) {
      // try several possible fields for a human-readable key
      const keyCandidates = [
        item.geoName,
        item.region,
        (item.info && item.info.name), // rare shape
        item.geoCode,
        item.country,
        item.state
      ];

      // find first non-empty string candidate
      let regionKey = keyCandidates.find(k => typeof k === 'string' && k.trim().length > 0);

      // If still not found, try to detect a code inside item (e.g., value[1]?) or fallback
      if (!regionKey) {
        // try to build a key from available fields
        if (item.geoName === undefined && item.value && item.value.length) {
          // no name, but has numeric value -> mark 'Unknown'
          regionKey = 'Unknown';
        } else {
          regionKey = 'Unknown';
        }
      }

      // Use numeric score if available
      const score = (item.value && (Array.isArray(item.value) ? item.value[0] : item.value)) || 0;
      by_state[regionKey] = Number(score);
    }

    return {
      keyword,
      avgScore,
      growth,
      timelinePoints: values,
      by_state,
      fetchedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Error for', keyword, err && err.message ? err.message : err);
    return { keyword, error: true, errorMessage: (err && err.message) || String(err) };
  }
}

(async function main() {
  try {
    const results = [];

    for (const kw of KEYWORDS) {
      // polite delay
      await new Promise(r => setTimeout(r, 400));
      const data = await fetchKeywordData(kw);
      results.push(data);
    }

    // Ensure directory exists
    const outDir = path.dirname(OUT_PATH);
    fs.mkdirSync(outDir, { recursive: true });

    // Write single combined file
    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf8');
    console.log('WROTE', OUT_PATH);
  } catch (err) {
    console.error('Tracker failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
