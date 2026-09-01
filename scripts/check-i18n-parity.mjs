#!/usr/bin/env node
// DEC-007 CI guardrail.
//
// Fails if any locale catalog in messages/*.json has a different key set
// than the reference locale (en). Catches the most-likely i18n regression:
// a string added to one catalog but forgotten in the other, which would
// render a raw key (e.g. "command.stockIn") to the user at runtime.
//
// Compares the full nested key path (dot-joined), so a key that exists in
// both files but at a different nesting depth still counts as a mismatch.
//
// Usage: node scripts/check-i18n-parity.mjs
// Exit:  0 = green · 1 = at least one catalog diverges from the reference.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE_LOCALE = "en";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(repoRoot, "messages");

// Recursively collect dot-joined leaf key paths from a message object.
function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function loadCatalog(file) {
  const raw = readFileSync(join(messagesDir, file), "utf8");
  return new Set(flattenKeys(JSON.parse(raw)));
}

const localeFiles = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
const referenceFile = `${REFERENCE_LOCALE}.json`;

if (!localeFiles.includes(referenceFile)) {
  console.error(`✗ Reference catalog messages/${referenceFile} not found.`);
  process.exit(1);
}

const reference = loadCatalog(referenceFile);
let violations = 0;

for (const file of localeFiles) {
  if (file === referenceFile) continue;
  const locale = loadCatalog(file);

  const missing = [...reference].filter((k) => !locale.has(k)).sort();
  const extra = [...locale].filter((k) => !reference.has(k)).sort();

  if (missing.length || extra.length) {
    violations++;
    console.error(`✗ messages/${file} diverges from messages/${referenceFile}:`);
    for (const k of missing) console.error(`    missing: ${k}`);
    for (const k of extra) console.error(`    extra:   ${k}`);
  }
}

if (violations > 0) {
  console.error("");
  console.error(`i18n parity check FAILED: ${violations} catalog(s) diverge.`);
  console.error("See DEC-007: every locale must define the same key set.");
  process.exit(1);
}

console.log(
  `✓ i18n parity check passed (${reference.size} keys × ${localeFiles.length} locales).`,
);
