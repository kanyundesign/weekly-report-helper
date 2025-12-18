import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '周报过去式',
  description: '自动从 Notion 工作看板生成周报，让周报成为过去式',
  icons: {
    icon: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
        {children}
      </body>
    </html>
  )
}

