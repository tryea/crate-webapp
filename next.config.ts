import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Required for the Dockerfile runner stage — emits a self-contained
  // .next/standalone/ bundle that ships server.js + minimal node_modules,
  // without needing the full node_modules at runtime.
  output: "standalone",
};

// DEC-007: points next-intl at our cookie-based request config. No locale
// routing/middleware — the plugin only wires the RSC message loader.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
