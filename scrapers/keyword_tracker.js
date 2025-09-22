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

    const parsedTime = JSON.parse(interestOverTime);
    const parsedRegion = JSON.parse(interestByRegion);

    const values = parsedTime.default.timelineData.map(d => parseInt(d.value[0] || 0));
    const avgScore = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const growth = values.length > 1 ? values[values.length - 1] - values[0] : 0
