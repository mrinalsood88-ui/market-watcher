// scrapers/run.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");

async function scrapeProducts() {
  const url = "https://example.com"; // replace with real target
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });

  const $ = cheerio.load(res.data);
  // Example: grab all h2 text as "products"
  const products = [];
  $("h2").each((i, el) => {
    products.push($(el).text().trim());
  });

  await fs.outputJson("scrapers/out/products/hot_all.json", {
    ok: true,
    timestamp: new Date().toISOString(),
    top_items: products
  }, { spaces: 2 });

  console.log("✅ Products scraped");
}

async function scrapeKeywords() {
  // Example static keywords (replace with real logic)
  const keywords = [
    { keyword: "wireless earbuds", avgScore: 80 },
    { keyword: "car seat organizer", avgScore: 75 }
  ];

  await fs.outputJson("scrapers/out/keywords/keyword_hot.json", keywords, { spaces: 2 });
  console.log("✅ Keywords scraped");
}

(async () => {
  await scrapeProducts();
  await scrapeKeywords();
})();
