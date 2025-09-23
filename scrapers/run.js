// scrapers/run.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const OUT_PRODUCTS = path.join(__dirname, "out", "products", "hot_all.json");
const OUT_KEYWORDS = path.join(__dirname, "out", "keywords", "keyword_hot.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, opts = {}, attempts = 3, backoff = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, opts);
      return res;
    } catch (err) {
      const isLast = i === attempts - 1;
      console.warn(`Fetch failed (${i+1}/${attempts}) for ${url}: ${err.message}`);
      if (isLast) throw err;
      await sleep(backoff * (i + 1));
    }
  }
}

async function scrapeProducts() {
  const url = "https://example.com"; // <<-- replace with real target URL
  console.log("Fetching products from:", url);

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept-Language": "en-US,en;q=0.9"
  };

  const res = await fetchWithRetries(url, { headers }, 3, 1500);
  const $ = cheerio.load(res.data);

  // TODO: update this selector to match the real site
  const products = [];
  $("h2").each((i, el) => {
    const title = $(el).text().trim();
    if (title) products.push({ title });
  });

  const payload = {
    ok: true,
    source: "scraper-v1",
    timestamp: new Date().toISOString(),
    items_count: products.length,
    top_items: products
  };

  await fs.outputJson(OUT_PRODUCTS, payload, { spaces: 2 });
  console.log(`✅ Products scraped — ${products.length} items written to ${OUT_PRODUCTS}`);
}

async function scrapeKeywords() {
  // If you need to scrape a page, replace this with real fetch + parse.
  const keywords = [
    { keyword: "wireless earbuds", avgScore: 80, timestamp: new Date().toISOString() },
    { keyword: "car seat organizer", avgScore: 75, timestamp: new Date().toISOString() }
  ];

  const payload = {
    ok: true,
    source: "keyword-generator-v1",
    timestamp: new Date().toISOString(),
    items_count: keywords.length,
    keywords: keywords
  };

  await fs.outputJson(OUT_KEYWORDS, payload, { spaces: 2 });
  console.log(`✅ Keywords scraped — ${keywords.length} items written to ${OUT_KEYWORDS}`);
}

(async () => {
  try {
    // ensure dirs exist
    await fs.ensureDir(path.dirname(OUT_PRODUCTS));
    await fs.ensureDir(path.dirname(OUT_KEYWORDS));

    await scrapeProducts();
    // throttle briefly in case next call hits same host
    await sleep(500);
    await scrapeKeywords();

    console.log("All done.");
    process.exit(0);
  } catch (err) {
    console.error("Scraper failed:", err && err.message ? err.message : err);
    // write a small diagnostics file so Actions logs show failure reason
    try {
      await fs.outputJson(path.join(__dirname, "out", "scrape_error.json"), {
        timestamp: new Date().toISOString(),
        error: String(err && err.message ? err.message : err)
      }, { spaces: 2 });
    } catch (e) { /* ignore */ }
    process.exit(2);
  }
})();

