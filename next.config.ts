import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Dockerfile runner stage — emits a self-contained
  // .next/standalone/ bundle that ships server.js + minimal node_modules,
  // without needing the full node_modules at runtime.
  output: "standalone",
};

export default nextConfig;
