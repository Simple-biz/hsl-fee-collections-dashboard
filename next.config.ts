import type { NextConfig } from "next";

// Security headers applied to every route. CSP ships in Report-Only mode
// until the app has been verified on a preview deployment, then promote to
// Content-Security-Policy.
//
// style-src includes 'unsafe-inline' because chart.tsx injects a <style> tag
// via dangerouslySetInnerHTML (developer-defined chart color CSS variables —
// not user input). Remove once chart theming switches to a nonce approach.
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // Report-Only: logs violations without blocking anything.
    // Promote to Content-Security-Policy after verifying on a preview deployment.
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' required for chart.tsx's injected <style> tag.
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
