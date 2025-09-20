// shopify.js
// CommonJS entrypoint that dynamically imports p-retry (ESM) and fetches Shopify products.
// Writes shopify-data.json in repo root.
// Exits with non-zero code on fatal errors.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. your-store.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const OUTPUT_FILE = path.resolve(__dirname, 'shopify-data.json');
const DEBUG = String(process.env.DEBUG).toLowerCase() === 'true';

if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing required environment variables. Please set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.');
  console.error('Example: SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ACCESS_TOKEN=xxxxx node shopify.js');
  process.exit(1);
}

async function fetchProductsPage(page = 1) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-07/products.json?page=${page}&limit=50`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    Accept: 'application/json',
    'User-Agent': 'market-watcher-scraper/1.0'
  };

  if (DEBUG) {
    console.log('Request URL:', url);
    console.log('Request headers (token hidden):', Object.assign({}, headers, { 'X-Shopify-Access-Token': '[REDACTED]' }));
  }

  try {
    const resp = await axios.get(url, { headers, timeout: 15000 });
    if (DEBUG) console.log('Response status:', resp.status);
    return resp.data;
  } catch (err) {
    // axios error handling
    if (err.response) {
      const status = err.response.status;
      if (DEBUG) {
        console.error('Response status:', status);
        try { console.error('Response data (truncated):', JSON.stringify(err.response.data).slice(0, 1000)); } catch (e) {}
      }
      // If 401 unauthorized -> abort (no retries)
      if (status === 401) {
        const e = new Error('Shopify returned 401 Unauthorized. Check SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE.');
        e.__abort = true;
        throw e;
      }
      // For other statuses, throw and allow retry policy to handle it
      throw err;
    } else if (err.request) {
      // Request made but no response
      throw err;
    } else {
      // Something else
      throw err;
    }
  }
}

(async () => {
  try {
    // dynamic import of p-retry (ESM-only)
    const pRetryModule = await import('p-retry');
    const pRetry = pRetryModule.default ?? pRetryModule;

    const retryOptions = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      onFailedAttempt: (err) => {
        // If marked abort, convert to AbortError to stop retries
        if (err && err.__abort) {
          const AbortError = pRetry.AbortError ?? (pRetryModule && pRetryModule.AbortError);
          if (AbortError) throw new AbortError(err);
          throw err;
        } else {
          console.warn(`Attempt ${err.attemptNumber} failed. ${err.retriesLeft} retries left. Error: ${err.message}`);
        }
      }
    };

    const fetchProductsWithRetry = (page) => pRetry(() => fetchProductsPage(page), retryOptions);

    // Example: fetch up to N pages (adjust as needed)
    const maxPages = 10; // increase/decrease depending on store
    const collected = [];

    for (let p = 1; p <= maxPages; p++) {
      console.log(`Fetching page ${p} ...`);
      try {
        const data = await fetchProductsWithRetry(p);
        if (data && Array.isArray(data.products) && data.products.length) {
          collected.push(...data.products);
          // if this is the last page break logic, adapt if API gives pagination metadata
          if (data.products.length < 50) {
            // last page (less than page limit)
            break;
          }
        } else {
          console.log(`No products returned for page ${p}. Stopping.`);
          break;
        }
      } catch (err) {
        const isAbort = err && (err.__abort || err.name === 'AbortError');
        if (isAbort) {
          console.error('Non-retryable error (abort):', err.message || err);
        } else {
          console.error(`Failed to fetch page ${p} after retries:`, err.message || err);
        }
        throw err;
      }
    }

    // Write output file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected, null, 2), 'utf8');
    console.log(`Wrote ${collected.length} products to ${OUTPUT_FILE}`);

    process.exit(0);
  } catch (err) {
    console.error('Fatal error in shopify fetcher:', (err && err.stack) ? err.stack : err);
    process.exit(1);
  }
})();
