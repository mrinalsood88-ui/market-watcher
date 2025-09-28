// scrapers/run_all.mjs
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function sh(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

async function main() {
  // NOTE: .mjs here
  sh("node scrapers/products.mjs");
  sh("node scrapers/keywords.mjs");

  copy(path.join("out","products","hot_all.json"), path.join("products","hot_all.json"));
  copy(path.join("out","keywords","keyword_hot.json"), path.join("keywords","keyword_hot.json"));
  console.log("✅ Copied outputs to /products and /keywords");
}

main().catch((err) => {
  console.error("❌ run_all.mjs error:", err);
  process.exit(1);
});
