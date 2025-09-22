/**
 * scrapers/keyword_tracker.js
 *
 * - Reads scrapers/config/keywords.json for seeds
 * - Queries Google Trends via google-trends-api
 * - Produces scrapers/out/keyword_hot.json with fields:
 *   keyword, keyword_score (0-100), trend_growth_pct, interest_by_state (map),
 *   top_state, keyword_volume_estimate (naive), times_searched (alias of score)
 *
 * NOTE: google-trends-api returns relative interest (0-100). For absolute volumes
 * we provide an optional naive estimator (not accurate) controlled by config.use_volume_estimate.
 *
 * Install: npm install google-trends-api
 * Run: node keyword_tracker.js
 */

const fs = require('fs');
const path = require('path');
const gtrends = require('google-trends-api');

const CFG_PATH = path.join(__dirname, 'config', 'keywords.json');
const OUT_PATH = path.join(__dirname, 'out', 'keyword_hot.json');

function readCfg() {
  if (!fs.existsSync(CFG_PATH)) throw new Error('Missing config/keywords.json');
  return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Naive estimator: convert Trends score (0-100) to monthly search volume estimate.
// This is a VERY rough heuristic: adjust multipliers by niche or disable it.
function estimateVolumeFromTrendScore(score) {
  // bucket approach: bigger score -> exponentially larger estimate
  if (score <= 5) return Math.round(score * 5);         // tiny terms
  if (score <= 20) return Math.round(score * 50);       // low-volume
  if (score <= 40) return Math.round(score * 200);      // modest
  if (score <= 70) return Math.round(score * 800);      // good volume
  return Math.round(score * 2000);                      // very large
}

async function fetchTrends(keyword, geo, timeframe) {
  const result = { keyword, error: null };

  try {
    // interest over time
    const iotRaw = await gtrends.interestOverTime({ keyword, geo, timeframe });
    const iotObj = JSON.parse(iotRaw);
    const timeline = iotObj.default && iotObj.default.timelineData ? iotObj.default.timelineData : [];
    const values = timeline.map(t => (t.value && t.value[0]) ? t.value[0] : 0);
    result.timeline = timeline;
    result.keyword_score = values.length ? Math.max(...values) : 0;
    result.times_searched = result.keyword_score; // alias: relative counts

    // compute trend growth: last half vs first half
    if (values.length >= 2) {
      const half = Math.floor(values.length / 2);
      const firstAvg = values.slice(0, half).reduce((a,b)=>a+b,0)/(half || 1);
      const lastAvg  = values.slice(half).reduce((a,b)=>a+b,0)/(values.length-half || 1);
      result.trend_growth_pct = firstAvg === 0 ? (lastAvg>0 ? 100 : 0) : ((lastAvg-firstAvg)/firstAvg)*100;
    } else {
      result.trend_growth_pct = 0;
    }

    // interest by region (US states)
    const regionRaw = await gtrends.interestByRegion({ keyword, geo, resolution: 'REGION', timeframe });
    const regionObj = JSON.parse(regionRaw);
    const geoMap = regionObj.default && regionObj.default.geoMapData ? regionObj.default.geoMapData : [];
    result.interest_by_state = {};
    geoMap.forEach(r => {
      const name = r.geoName || r.geoCode || 'unknown';
      const val = Array.isArray(r.value) ? (r.value[0] || 0) : (r.value || 0);
      result.interest_by_state[name] = val;
    });

    // top state
    let topState = null;
    let topVal = -1;
    for (const [k,v] of Object.entries(result.interest_by_state)) {
      if (v > topVal) { topVal = v; topState = k; }
    }
    result.top_state = topState || 'Unknown';

    // related queries (optional)
    try {
      const relatedRaw = await gtrends.relatedQueries({ keyword, geo, timeframe });
      const relatedObj = JSON.parse(relatedRaw);
      const lists = relatedObj.default && relatedObj.default.rankedList ? relatedObj.default.rankedList : [];
      // flatten top related queries
      const rq = (lists[0] && lists[0].rankedKeyword) ? lists[0].rankedKeyword.map(x => x.query) : [];
      result.related_queries = rq;
    } catch (e) {
      result.related_queries = [];
    }

    return result;
  } catch (err) {
    result.error = (err && err.message) ? err.message : String(err);
    return result;
  }
}

(async function main(){
  const cfg = readCfg();
  const keywords = Array.isArray(cfg.keywords) ? cfg.keywords : [];
  const geo = cfg.geo || 'US';
  const timeframe = cfg.timeframe || 'now 30-d';
  const delay = Number.isFinite(cfg.delay_ms) ? cfg.delay_ms : 1400;
  const useEstimate = !!cfg.use_volume_estimate;

  if (!keywords.length) {
    console.error('No keywords in config.');
    process.exit(1);
  }

  console.log('Keyword tracker starting. Keywords:', keywords.length, 'Geo:', geo, 'Timeframe:', timeframe);

  const out = { ts: new Date().toISOString(), geo, timeframe, results: [] };

  for (let i=0;i<keywords.length;i++) {
    const kw = keywords[i];
    console.log(`[${i+1}/${keywords.length}] Fetching "${kw}"`);
    const r = await fetchTrends(kw, geo, timeframe);

    // estimate volume if configured and if we have a trend score
    let volumeEstimate = null;
    if (!r.error && useEstimate) {
      volumeEstimate = estimateVolumeFromTrendScore(r.keyword_score || 0);
    }

    out.results.push({
      keyword: kw,
      keyword_score: r.keyword_score || 0,
      trend_growth_pct: Number((r.trend_growth_pct || 0).toFixed(2)),
      times_searched: r.times_searched || 0,
      keyword_volume_estimate: volumeEstimate,
      top_state: r.top_state || 'Unknown',
      interest_by_state: r.interest_by_state || {},
      related_queries: r.related_queries || [],
      error: r.error || null
    });

    // polite delay
    await sleep(delay);
  }

  // sort by combined metric: score * (1 + growth%)
  out.results.sort((a,b) => {
    const as = (a.keyword_score || 0) * (1 + Math.max(0, a.trend_growth_pct||0)/100);
    const bs = (b.keyword_score || 0) * (1 + Math.max(0, b.trend_growth_pct||0)/100);
    return bs - as;
  });

  // ensure out dir exists
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', OUT_PATH, 'items:', out.results.length);
})();
