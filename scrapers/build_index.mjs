/**
 * build_index.mjs
 * ✅ Automatically generates index.json files
 * for /products and /keywords folders.
 */

import fs from "fs";
import path from "path";

/**
 * Build index.json for a specific folder
 */
export function buildFolderIndex(dirPath, outFileName = "index.json") {
  if (!fs.existsSync(dirPath)) {
    console.warn(`⚠️ Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith(".json"))
    .map(name => {
      const fullPath = path.join(dirPath, name);
      const stats = fs.statSync(fullPath);
      return {
        file: name,
        modified: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified)); // newest first

  const indexPath = path.join(dirPath, outFileName);
  fs.writeFileSync(indexPath, JSON.stringify(files, null, 2));
  console.log(`📁 Index built → ${indexPath} (${files.length} entries)`);
}

/**
 * Build indexes for both products & keywords folders
 */
export function buildAllIndexes() {
  const root = process.cwd();
  const productsDir = path.join(root, "products");
  const keywordsDir = path.join(root, "keywords");

  buildFolderIndex(productsDir);
  buildFolderIndex(keywordsDir);
}
