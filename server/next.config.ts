import type { NextConfig } from "next";

/**
 * API 型 Next.js 应用：
 * - standalone 产物用于容器化部署（deploy/compose.yaml）
 * - 服务端组件/路由一律动态渲染，禁止构建期访问数据库
 */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
