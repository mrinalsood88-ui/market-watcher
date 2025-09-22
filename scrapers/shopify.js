/**
 * shopify.js
 *
 * Attempts Admin API if token is present for a matching shop, otherwise
 * falls back to public endpoints:
 *  - /products.json?limit=250
 *  - discover product links from HTML and fetch per-product JSON or structured data
 *
 * Writes output to scrapers/out/products/shopify_products.json
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const pRetry = require('p-retry');

const OUT_DIR = path.join(__dirname, 'out', 'products');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const USER_AGENT = 'market-watcher-bot/1.0 (+https://github.com/)';

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function safeGet(url, opts = {}) {
  const cfg = Object.assign(
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    },
    opts
  );

  return pRetry(
    async () => {
      const res = await axios.get(url, cfg);
      if (res.status >= 400) {
        const e = new Error(`HTTP ${res.status}`);
        e.response = res;
        throw e;
      }
      return res;
    },
    { retries: 3, onFailedAttempt: (err) => console.warn('Request attempt failed:', err.message) }
  );
}

async function fetchProductsFromAdmin(shop, token) {
  const url = `https://${shop}/admin/api/2023-10/products.json?limit=250`;
  console.log('Using Admin API (token present). Fetching:', url);
  const res = await safeGet(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      'User-Agent': USER_AGENT,
    },
  });
  return res.data && res.data.products ? res.data.products : [];
}

async function fetchProductsFromPublicJson(shop) {
  const url = `https://${shop}/products.json?limit=250`;
  console.log('Trying public products.json:', url);
  const res = await safeGet(url, { headers: { 'Content-Type': 'application/json' } });
  if (typeof res.data === 'object' && res.data.products) return res.data.products;
  try {
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return parsed.products || [];
  } catch (err) {
    console.warn('products.json not available as JSON:', err.message);
    return [];
  }
}

async function fetchProductUrlsFromCollectionHtml(shop) {
  const root = `https://${shop}/`;
  console.log('Fetching home page to discover product links:', root);
  const res = await safeGet(root);
  const $ = cheerio.load(res.data);
  const urls = new Set();
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.includes('/products/')) {
      let clean = href;
      if (clean.startsWith('/')) clean = `https://${shop}${clean}`;
      if (clean.startsWith('http')) urls.add(clean.split('?')[0]);
    }
  });
  return Array.from(urls).slice(0, 200);
}

async function fetchProductJsonFromProductPage(productPageUrl) {
  const candidates = [
    productPageUrl + '.json',
    productPageUrl.replace(/(\.html)?$/, '.json'),
  ];
  for (const c of candidates) {
    try {
      const res = await safeGet(c, { headers: { Accept: 'application/json' } });
      if (res && res.data) {
        if (res.data.product) return res.data.product;
        if (res.data.products && res.data.products.length) return res.data.products[0];
      }
    } catch (err) {
      // ignore and try next
    }
  }

  // Fetch HTML and try to extract structured JSON-LD or embedded product data
  try {
    const res = await safeGet(productPageUrl, { headers: { Accept: 'text/html' } });
    const $ = cheerio.load(res.data);
    const ld = $('script[type="application/ld+json"]').text();
    if (ld) {
      try {
        const parsed = JSON.parse(ld);
        if (Array.isArray(parsed)) return parsed[0];
        return parsed;
      } catch (err) {}
    }

    const scripts = $('script:not([src])').map((i, el) => $(el).html()).get().join('\n');
    const match =
      scripts.match(/var meta = (\{[\s\S]*?\});/i) ||
      scripts.match(/window\.meta\s*=\s*(\{[\s\S]*?\});/i);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (err) {}
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function normalizeProduct(p) {
  if (!p) return null;
  const images = (p.images || p.images || []).map((i) => (i && i.src) || i);
  return {
    id: p.id || p.product_id || null,
    title: p.title || p.name || null,
    handle: p.handle || (p.url && p.url.split('/').pop()) || null,
    vendor: p.vendor || p.vendor || null,
    price_min:
      (p.variants && p.variants[0] && p.variants[0].price) ||
      (p.price && p.price.amount) ||
      null,
    images: images,
    raw: p,
  };
}

async function main() {
  const storesPath = path.join(__dirname, 'shopify_stores.json');
  let shops = [];
  if (fs.existsSync(storesPath)) {
    try {
      const stores = JSON.parse(fs.readFileSync(storesPath, 'utf8'));
      shops = Array.isArray(stores) ? stores.map((s) => (typeof s === 'string' ? s : s.domain || s.shop)) : [];
    } catch (err) {
      console.warn('Could not parse shopify_stores.json:', err.message);
    }
  } else {
    console.log('No shopify_stores.json found — nothing to scrape.');
  }

  const adminToken = process.env.SHOPIFY_API_TOKEN || null;
  const adminShop = process.env.SHOPIFY_SHOP || null;

  let allProducts = [];

  for (const shop of shops) {
    console.log('Processing shop:', shop);
    try {
      let products = [];
      if (adminToken && adminShop && adminShop.includes(shop)) {
        try {
          products = await fetchProductsFromAdmin(adminShop, adminToken);
        } catch (err) {
          console.warn('Admin API fetch failed:', err.message);
        }
      }

      if (!products || products.length === 0) {
        try {
          products = await fetchProductsFromPublicJson(shop);
        } catch (err) {
          console.warn('public products.json failed for', shop, err.message);
        }
      }

      if (!products || products.length === 0) {
        const productUrls = await fetchProductUrlsFromCollectionHtml(shop);
        console.log(`Discovered ${productUrls.length} product URLs for ${shop}`);
        for (const url of productUrls) {
          await delay(600);
          const p = await fetchProductJsonFromProductPage(url);
          if (p) products.push(p);
        }
      }

      const normalized = (products || []).map(normalizeProduct).filter(Boolean);
      console.log(`Collected ${normalized.length} products for ${shop}`);
      allProducts.push(...normalized);
      await delay(1000);
    } catch (err) {
      console.warn('Error processing shop', shop, err.message);
    }
  }

  // dedupe
  const unique = {};
  for (const p of allProducts) {
    const key = p.handle || p.title || p.id || JSON.stringify(p.raw).slice(0, 80);
    if (!unique[key]) unique[key] = p;
  }
  const out = Object.values(unique);

  const outFile = path.join(OUT_DIR, 'shopify_products.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outFile, 'with', out.length, 'products');
}

main().catch((err) => {
  console.error('shopify scraper failed:', err && err.message ? err.message : err);
  process.exit(1);
});
