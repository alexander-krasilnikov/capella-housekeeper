/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
