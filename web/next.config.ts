import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 容器化部署：standalone 产物（deploy/compose.yaml）
  output: "standalone",
};

export default nextConfig;
