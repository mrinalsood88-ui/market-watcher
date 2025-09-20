// shopify.js
// Entrypoint for Shopify fetcher (CommonJS style).
// Minimal change: dynamic import of p-retry which is an ESM-only package.

const axios = require('axios'); // keep using CommonJS require for other deps
const fs = require('fs');
const path = require('path');

// Config: change values as needed
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'your-store.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''; // set in CI secrets
const OUTPUT_FILE = path.resolve(__dirname, 'shopify-data.json');

// Example request: fetch product list (GraphQL or REST). This uses the REST endpoint as example.
async function fetchProductsPage(page = 1) {
  // Example REST API request (change path/query as needed)
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-07/products.json?page=${page}&limit=50`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Accept': 'application/json',
  };

  const resp = await axios.get(url, { headers, timeout: 15000 });
  return resp.data;
}

// Wrapper to load p-retry dynamically and use it
(async () => {
  try {
    // dynamic import of ESM package
    const pRetryModule = await import('p-retry');
    const pRetry = pRetryModule.default ?? pRetryModule; // safety for default export

    // Retry options - tune as needed
    const retryOptions = {
      retries: 3,
      factor: 2,
      minTimeout: 1000, // 1s
      maxTimeout: 8000, // 8s
      onFailedAttempt: (err) => {
        const attempt = err.attemptNumber;
        const retriesLeft = err.retriesLeft;
        console.warn(`Attempt ${attempt} failed. ${retriesLeft} retries left. Error: ${err.message}`);
      }
    };

    // Example usage: fetch a single page with retries
    async function fetchProductsWithRetry(page = 1) {
      return pRetry(() => fetchProductsPage(page), retryOptions);
    }

    // Example main logic: fetch first N pages (adjust as required)
    const maxPages = 3;
    const collected = [];

    for (let p = 1; p <= maxPages; p++) {
      console.log(`Fetching page ${p} ...`);
      try {
        const data = await fetchProductsWithRetry(p);
        // adapt depending on API shape: here we expect data.products
        if (data && data.products && data.products.length) {
          collected.push(...data.products);
        } else {
          console.log(`No products on page ${p}, stopping.`);
          break;
        }
      } catch (err) {
        console.error(`Failed to fetch page ${p} after retries:`, err.message || err);
        // Decide whether to continue or stop — we'll stop for safety
        throw err;
      }
    }

    // Write results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected, null, 2), 'utf8');
    console.log(`Wrote ${collected.length} products to ${OUTPUT_FILE}`);

    // Exit normally
    process.exit(0);

  } catch (err) {
    // Top-level error handling
    console.error('Fatal error in shopify fetcher:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
