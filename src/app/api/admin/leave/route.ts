import { NextRequest, NextResponse } from 'next/server'
import { getWeekMonday } from '@/lib/notion'
import { globalStore } from '@/lib/store'

// 设置请假状态
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { memberId, onLeave } = body as {
      memberId: string
      onLeave: boolean
    }

    if (!memberId) {
      return NextResponse.json(
        { error: '缺少成员 ID' },
        { status: 400 }
      )
    }

    const weekOf = getWeekMonday()
    
    // 初始化或获取现有数据
    if (!globalStore.submissions || globalStore.submissions.weekOf !== weekOf) {
      globalStore.submissions = {
        weekOf,
        submissions: {},
        leaves: {},
      }
    }

    if (!globalStore.submissions.leaves) {
      globalStore.submissions.leaves = {}
    }

    // 设置请假状态
    globalStore.submissions.leaves[memberId] = onLeave

    return NextResponse.json({
      success: true,
      memberId,
      onLeave,
      message: '请假状态已更新'
    })
  } catch (error) {
    console.error('设置请假状态失败:', error)
    return NextResponse.json(
      { error: '设置请假状态失败: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
