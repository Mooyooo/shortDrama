#!/usr/bin/env bash
# Builds a self-contained API release in apps/api/release/: compiled JavaScript, the SQL
# migrations, and a package.json + lockfile with only the runtime dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf release
npm run build >/dev/null
mkdir -p release
cp -R dist release/dist
cp -R db release/db

node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// @shortdrama/shared is types only; nothing from it exists at runtime.
const { "@shortdrama/shared": _types, ...dependencies } = pkg.dependencies;
writeFileSync("release/package.json", JSON.stringify({
  name: "shortdrama-api",
  private: true,
  type: "module",
  engines: { node: ">=20.6" },
  scripts: {
    start: "node --env-file=.env dist/index.js",
    migrate: "node --env-file=.env dist/migrate.js",
  },
  dependencies,
}, null, 2) + "\n");
'
# Pin exact versions for the server.
(cd release && npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)
echo "Release built in $(pwd)/release"
