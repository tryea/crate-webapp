/**
 * WHY THE `test` SCRIPT SPELLS OUT `node --experimental-vm-modules`:
 *
 * The FR-32 waitlist suite asserts against a real Postgres (PGlite, Postgres
 * compiled to wasm) so the UNIQUE constraint under test is the one the
 * migration actually creates. PGlite reaches its wasm payload with a dynamic
 * `import()`, and Jest's CommonJS VM refuses that callback without the flag
 * ("A dynamic import callback was invoked without --experimental-vm-modules").
 *
 * The flag is an argv flag on an explicitly named `node`, not `NODE_OPTIONS`
 * in front of `jest`, on purpose. CI runs the suite through `bun run test`,
 * and whether an env prefix survives that depends on the runner: spelling out
 * the interpreter and the flag makes the invocation identical under bun, npm,
 * or a bare shell. Jest is a Node tool either way; this says so.
 *
 * Measured on this branch before the flag was added: the 22 pre-existing
 * suites and 308 tests pass identically with and without it, the only
 * difference is about 2.5s of startup.
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/e2e/",
  ],
};

export default createJestConfig(config);
