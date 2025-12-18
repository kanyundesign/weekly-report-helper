import { NextRequest, NextResponse } from 'next/server'
import { generateReport, generateReportFallback } from '@/lib/claude'
import { Task } from '@/lib/notion'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { member, inProgress, nextUp } = body as {
      member: string
      inProgress: Task[]
      nextUp: Task[]
    }

    if (!member) {
      return NextResponse.json(
        { error: '缺少 member 参数' },
        { status: 400 }
      )
    }

    let report: string

    try {
      // 尝试使用 AI 生成
      report = await generateReport(member, inProgress || [], nextUp || [])
    } catch (error) {
      console.error('AI 生成失败，使用降级方案:', error)
      // 降级方案：简单格式化
      report = generateReportFallback(member, inProgress || [], nextUp || [])
    }

    return NextResponse.json({ report })
  } catch (error) {
    console.error('生成周报失败:', error)
    return NextResponse.json(
      { error: '生成周报失败', details: String(error) },
      { status: 500 }
    )
  }
}
