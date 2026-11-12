import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The browser must check for a new GLB on every visit (it revalidates with an ETag, so an unchanged file is not downloaded again).
  async headers() {
    return [
      {
        source: "/models/:file*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
