import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * FSD layer enforcement (DEC-002). Import direction:
 *   app → screens → widgets → features → entities → shared
 *   db is sibling infra: only entities + shared may import from it; nothing
 *   in db imports from FSD layers.
 *
 * To prove the rule is live, intentionally write an upward import (e.g.
 * `src/entities/foo/index.ts` importing from `@/features/x`) and run
 * `bun run lint` — boundaries plugin should fail with element-types error.
 */
const fsdElements = [
  { type: "app", pattern: "src/app/*" },
  { type: "screens", pattern: "src/screens/*" },
  { type: "widgets", pattern: "src/widgets/*" },
  { type: "features", pattern: "src/features/*" },
  { type: "entities", pattern: "src/entities/*" },
  { type: "shared", pattern: "src/shared/*" },
  { type: "db", pattern: "src/db/*" },
];

const fsdRules = [
  { from: "app", allow: ["screens", "widgets", "features", "entities", "shared", "db"] },
  { from: "screens", allow: ["widgets", "features", "entities", "shared"] },
  { from: "widgets", allow: ["features", "entities", "shared"] },
  { from: "features", allow: ["entities", "shared"] },
  { from: "entities", allow: ["shared", "db"] },
  { from: "shared", allow: ["shared"] },
  { from: "db", allow: ["shared"] },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": fsdElements,
      "boundaries/include": ["src/**/*"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        { default: "disallow", rules: fsdRules },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Jest co-located test files allowed to cross-import in tests
    "**/__tests__/**",
    "e2e/**",
  ]),
]);

export default eslintConfig;
