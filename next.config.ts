import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// DEC-027: app-layer security response headers (OWASP A05). `frame-ancestors`
// is a CSP directive with NO default-src fallback, so a `frame-ancestors`-only
// policy blocks framing without touching script/style: the inline THEME_SCRIPT
// FOUC guard and Turbopack inline styles are unaffected (a full content-CSP is
// deliberately NOT done here, see DEC-027 scope/residual). HSTS is gated to
// production: over dev HTTP browsers ignore it anyway, and gating keeps intent
// explicit (the TLS edge may also set it, browsers honor the strictest).
const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  // Required for the Dockerfile runner stage: emits a self-contained
  // .next/standalone/ bundle that ships server.js + minimal node_modules,
  // without needing the full node_modules at runtime.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// DEC-007: points next-intl at our cookie-based request config. No locale
// routing/middleware: the plugin only wires the RSC message loader.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
