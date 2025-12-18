/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // GitHub Pages 静态导出配置
  output: 'export',
  basePath: '/weekly-report-helper',
  assetPrefix: '/weekly-report-helper/',
  images: {
    unoptimized: true,
  },
  // 禁用尾部斜杠
  trailingSlash: true,
}

module.exports = nextConfig
