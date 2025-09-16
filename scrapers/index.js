// scrapers/index.js
const fs = require('fs');

async function run() {
  try {
    console.log('Scraper running...');

    // Example sample data (you can replace this later with real scrape results)
    const data = {
      ok: true,
      ts: Date.now(),
      items: [
        { title: "Test Product A", score: 95 },
        { title: "Test Product B", score: 88 }
      ]
    };

    // Ensure output folder exists
    fs.mkdirSync('out', { recursive: true });

    // Write JSON file with formatted data
    fs.writeFileSync('out/hot_all.json', JSON.stringify(data, null, 2), 'utf8');

    console.log('✅ Wrote out/hot_all.json with sample data');
    process.exit(0);
  } catch (err) {
    console.error('❌ Scraper error:', err);
    process.exit(1);
  }
}

run();
