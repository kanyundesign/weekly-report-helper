/** @type {import('next').NextConfig} */

const isGithubPages = process.env.GITHUB_ACTIONS === 'true'

const nextConfig = {
  reactStrictMode: true,
  // 仅在 GitHub Pages 部署时启用静态导出
  ...(isGithubPages && {
    output: 'export',
    basePath: '/weekly-report-helper',
    assetPrefix: '/weekly-report-helper/',
    images: {
      unoptimized: true,
    },
    trailingSlash: true,
  }),
}

module.exports = nextConfig
