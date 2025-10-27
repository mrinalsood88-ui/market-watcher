#!/bin/bash
set -e
cd "$(dirname "$0")/../scrapers"
if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi
node shopify.js   # change to run.js if needed
