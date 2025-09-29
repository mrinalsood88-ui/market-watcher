import axios from "axios";
import * as cheerio from "cheerio";

export async function scrapeAmazonUSBestsellers() {
  console.log("🛒 Scraping Amazon Best Sellers (US)...");
  const url = "https://www.amazon.com/Best-Sellers/zgbs";
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const $ = cheerio.load(data);
  const items = [];

  $("._cDEzb_p13n-sc-css-line-clamp-3_g3dy1").each((i, el) => {
    const name = $(el).text().trim();
    const link = "https://www.amazon.com" + $(el).closest("a").attr("href");
    if (name) items.push({ rank: i + 1, name, link, source: "Amazon" });
  });

  console.log(`✅ Found ${items.length} Amazon products`);
  return items;
}
