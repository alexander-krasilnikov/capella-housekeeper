/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // The dev server only allows requests (including the HMR websocket) from
  // the origin it was initialized with (localhost by default) - visiting it
  // via 127.0.0.1 instead trips this and breaks the HMR websocket, which can
  // leave the page's client JS partially hydrated (event handlers silently
  // not attaching) without any error banner to explain why.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      // VS Code's forwarded dev-tunnel URL (https://<id>-<port>.<region>.devtunnels.ms)
      // is a different origin than the one `next dev` itself sees, so Server
      // Actions' CSRF check (Origin vs Host) rejects it by default with
      // "Invalid Server Actions request." - this trusts that forwarding
      // domain for local development. Dev-only; irrelevant to `next build`/`start`.
      allowedOrigins: ["**.devtunnels.ms"],
    },
  },
};

module.exports = nextConfig;
