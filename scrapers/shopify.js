// shopify.js
// CommonJS entrypoint. Dynamically imports p-retry (ESM-only).
// Behavior:
// - Immediately aborts on 401 (no retries).
// - Retries on network/5xx up to retries count.
// - Writes output to shopify-data.json

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. your-store.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const OUTPUT_FILE = path.resolve(__dirname, 'shopify-data.json');
const DEBUG = Boolean(process.env.DEBUG);

if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing required environment variables. Please set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.');
  console.error('Example: SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ACCESS_TOKEN=xxxxx node shopify.js');
  process.exit(1);
}

async function fetchProductsPage(page = 1) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-07/products.json?page=${page}&limit=50`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Accept': 'application/json',
    'User-Agent': 'market-watcher-scraper/1.0'
  };
  if (DEBUG) {
    console.log('Request URL:', url);
    console.log('Request headers:', headers);
  }

  try {
    const resp = await axios.get(url, { headers, timeout: 15000 });
    if (DEBUG) {
      console.log('Response status:', resp.status);
    }
    return resp.data;
  } catch (err) {
    // axios error shape
    if (err.response) {
      // Server responded with a status code
      const status = err.response.status;
      if (DEBUG) {
        console.error('Response status:', status);
        // Only safe to log small body in debug
        try { console.error('Response data:', JSON.stringify(err.response.data).slice(0, 1000)); } catch (e) {}
      }
      // If 401, abort further retries immediately
      if (status === 401) {
        // p-retry.AbortError will be created by caller (we throw a special marker)
        const e = new Error(`Shopify returned 401 Unauthorized. Check SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE. (${status})`);
        e.__abort = true;
        throw e;
      }

      // For 4xx other than 401, probably won't succeed with retries but let retry policy decide.
      throw err;
    } else if (err.request) {
      // No response received - network error
      throw err;
    } else {
      // Something else
      throw err;
    }
  }
}

(async () => {
  try {
    const pRetryModule = await import('p-retry');
    const pRetry = pRetryModule.default ?? pRetryModule;

    const retryOptions = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      onFailedAttempt: (err) => {
        // if error was marked __abort, wrap in AbortError to stop retries
        if (err && err.__abort) {
          // pRetry has AbortError class available as property on the function
          const AbortError = pRetry.AbortError ?? (pRetryModule && pRetryModule.AbortError);
          if (AbortError) {
            throw new AbortError(err);
          } else {
            // fallback: rethrow to stop
            throw err;
          }
        } else {
          console.warn(`Attempt ${err.attemptNumber} failed. ${err.retriesLeft} retries left. Error: ${err.message}`);
        }
      }
    };

    async function fetchProductsWithRetry(page) {
      return pRetry(() => fetchProductsPage(page), retryOptions);
    }

    const maxPages = 3;
    const collected = [];

    for (let p = 1; p <= maxPages; p++) {
      console.log(`Fetching page ${p} ...`);
      try {
        const data = await fetchProductsWithRetry(p);
        if (data && data.products && data.products.length) {
          collected.push(...data.products);
        } else {
          console.log(`No products on page ${p}, stopping.`);
          break;
        }
      } catch (err) {
        // If abort error from p-retry, unwrap to show reason
        const isAbort = (err && err.name === 'AbortError') || (err && err.__abort);
        if (isAbort) {
          console.error('Abort (non-retryable) error:', err.message || err);
        } else {
          console.error(`Failed to fetch page ${p} after retries:`, err && err.message ? err.message : err);
        }
        throw err;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected, null, 2), 'utf8');
    console.log(`Wrote ${collected.length} products to ${OUTPUT_FILE}`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in shopify fetcher:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
