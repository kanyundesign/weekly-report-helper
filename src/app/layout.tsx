import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '设计团队周报助手',
  description: '自动从 Notion 工作看板生成周报',
  icons: {
    icon: '/favicon.svg',
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

