// 全局内存存储（用于 Vercel 无服务器环境）
// 注意：每个函数实例有自己的内存，但在同一请求周期内共享

interface SubmissionsData {
  weekOf: string
  pageId?: string
  submissions: Record<string, { submitted: boolean; time: string }>
  leaves: Record<string, boolean>
}

export const globalStore: { submissions: SubmissionsData | null } = {
  submissions: null
}


