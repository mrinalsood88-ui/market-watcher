import fetch from "node-fetch";
import fs from "fs";

async function run() {
  console.log("Scraper is running...");
  const data = { ok: true, ts: Date.now() };
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync("out/hot_all.json", JSON.stringify(data, null, 2));
  console.log("Wrote out/hot_all.json");
}

run();
