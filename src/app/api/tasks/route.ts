import { NextRequest, NextResponse } from 'next/server'
import { fetchTasks } from '@/lib/notion'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const member = searchParams.get('member')

  if (!member) {
    return NextResponse.json(
      { error: '缺少 member 参数' },
      { status: 400 }
    )
  }

  try {
    const tasks = await fetchTasks(member)
    return NextResponse.json(tasks)
  } catch (error) {
    console.error('获取任务失败:', error)
    return NextResponse.json(
      { error: '获取任务失败', details: String(error) },
      { status: 500 }
    )
  }
}
