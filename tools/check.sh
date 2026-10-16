#!/bin/sh
# Bundle once to catch syntax and import errors early.
cd "$(dirname "$0")/.." && npx esbuild src/main.js --bundle --format=esm --external:three --outfile=/dev/null --log-level=warning
