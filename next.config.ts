import type { NextConfig } from "next";

/**
 * Security headers — applied to every response.
 *
 * Phase 0 baseline. Tightened per surface in later phases (status page,
 * kiosk, approvals) via per-route headers below or in proxy.ts.
 *
 * CSP rationale:
 *  - default-src 'self'         — deny everything by default
 *  - script-src 'self'          — only first-party scripts; 'unsafe-eval' in
 *                                 dev because React reconstructs server stacks
 *                                 via eval for the error overlay
 *  - style-src 'self' 'unsafe-inline' — Tailwind v4 + Next inject inline
 *                                 <style> on first paint; we accept this
 *                                 trade-off for now and revisit when we add
 *                                 nonces in U0
 *  - img-src 'self' blob: data: — uploaded part-invoice previews + favicons
 *  - connect-src 'self' <supabase> — Server Actions + Supabase REST/Realtime
 *  - frame-ancestors 'none'     — clickjacking protection (also X-Frame-Options)
 *  - object-src 'none'          — no plugins
 *  - base-uri 'self'            — block <base> hijacking
 *  - form-action 'self'         — block exfiltration via <form action>
 *  - upgrade-insecure-requests  — force HTTPS sub-resources
 */
const isDev = process.env.NODE_ENV === "development";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = (() => {
  if (!supabaseOrigin) return "";
  try {
    const url = new URL(supabaseOrigin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseHost.replace(/^http/, "ws");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseHost ? ` ${supabaseHost}` : ""}${supabaseWs ? ` ${supabaseWs}` : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
];

const baseSecurityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  {
    // 2 years, include subdomains, eligible for browser preload list
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Default: nothing. Camera enabled per-route on the kiosk only (Phase 6).
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Hides the "X-Powered-By: Next.js" fingerprint header
  poweredByHeader: false,

  // Strict React for catching subtle render bugs
  reactStrictMode: true,

  // CRITICAL: never ship source maps to production. They expose internal
  // helper names and module paths that make zero-day exploitation trivial.
  productionBrowserSourceMaps: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: baseSecurityHeaders,
      },
      {
        // Tablet kiosk: needs camera for part-invoice photo capture, but
        // is otherwise the same closed environment.
        source: "/kiosk/:path*",
        headers: [
          ...baseSecurityHeaders.filter((h) => h.key !== "Permissions-Policy"),
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=(), autoplay=(), browsing-topics=(), camera=(self), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(self), usb=(), xr-spatial-tracking=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
