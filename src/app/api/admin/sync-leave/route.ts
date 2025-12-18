import { NextRequest, NextResponse } from 'next/server'
import { 
  getWeekMonday, 
  findWeeklyReportPage, 
  createWeeklyReportPage,
  updateMemberReport 
} from '@/lib/notion'
import membersConfig from '../../../../../config/members.json'

// 同步请假信息到 Notion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leaveMembers } = body as { leaveMembers: string[] }
    
    if (!leaveMembers || leaveMembers.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要同步的请假信息',
        updated: 0,
      })
    }

    const weekOf = getWeekMonday()

    // 查找或创建周报页面
    let pageId = await findWeeklyReportPage(weekOf)
    
    if (!pageId) {
      // 创建新页面（传递成员信息包含请假状态）
      const memberInfos = membersConfig.members.map((m: any) => ({
        name: m.name,
        onLeave: leaveMembers.includes(m.id),
      }))
      pageId = await createWeeklyReportPage(weekOf, memberInfos)
      
      return NextResponse.json({
        success: true,
        message: `已创建周报页面，${leaveMembers.length} 人请假`,
        updated: leaveMembers.length,
        created: true,
      })
    }

    // 更新每个请假成员的内容
    let updatedCount = 0
    for (const memberId of leaveMembers) {
      const member = membersConfig.members.find((m: any) => m.id === memberId)
      if (member) {
        const success = await updateMemberReport(pageId, member.name, '（请假）')
        if (success) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `已同步 ${updatedCount} 人的请假信息`,
      updated: updatedCount,
    })
  } catch (error) {
    console.error('同步请假信息失败:', error)
    return NextResponse.json(
      { error: '同步请假信息失败', details: String(error) },
      { status: 500 }
    )
  }
}
