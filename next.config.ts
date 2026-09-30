import type { NextConfig } from "next";

// Static export for Cloudflare Pages: plain HTML/JS/CSS, no server, no runtime requests.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
