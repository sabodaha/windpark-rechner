import type { NextConfig } from "next";

// Static export for Cloudflare Pages: plain HTML/JS/CSS, no server, no runtime requests.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // Two root layouts (English at the root, German under /de/, each with its own lang): one 404 page for both.
  experimental: { globalNotFound: true },
};

export default nextConfig;
