import { NextResponse } from 'next/server'
import membersConfig from '../../../../config/members.json'
import { getWeekMonday, getWeekRange } from '@/lib/notion'
import { globalStore } from '@/lib/store'

export async function GET() {
  try {
    const weekOf = getWeekMonday()
    const weekRange = getWeekRange()
    
    // 从内存获取提交状态
    const submissions = globalStore.submissions
    
    // 如果是新的一周，重置提交状态
    const currentWeekSubmissions = submissions?.weekOf === weekOf ? submissions.submissions : {}
    const currentWeekLeaves = submissions?.weekOf === weekOf ? (submissions.leaves || {}) : {}

    const members = membersConfig.members.map((member: any) => ({
      id: member.id,
      name: member.name,
      submitted: currentWeekSubmissions[member.id]?.submitted || false,
      submittedAt: currentWeekSubmissions[member.id]?.time || null,
      onLeave: currentWeekLeaves[member.id] || false,
    }))

    return NextResponse.json({
      weekOf,
      weekRange,
      members,
    })
  } catch (error) {
    console.error('获取成员列表失败:', error)
    return NextResponse.json(
      { error: '获取成员列表失败' },
      { status: 500 }
    )
  }
}
