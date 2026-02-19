import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
