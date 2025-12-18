import { NextRequest, NextResponse } from 'next/server'
import { 
  getWeekMonday, 
  findWeeklyReportPage, 
  createWeeklyReportPage,
  updateMemberReport 
} from '@/lib/notion'
import membersConfig from '../../../../config/members.json'
import { globalStore } from '../members/route'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { member, content, extraInfo } = body as {
      member: string
      content: string
      extraInfo?: string
    }

    if (!member || !content) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      )
    }

    const weekOf = getWeekMonday()
    
    // 从全局存储获取提交状态
    const submissions = globalStore.submissions

    // 检查是否已提交
    if (submissions?.weekOf === weekOf && submissions.submissions?.[member]?.submitted) {
      return NextResponse.json(
        { error: '本周已提交，如需修改请前往 Notion' },
        { status: 400 }
      )
    }

    // 拼接完整周报内容
    let fullContent = content
    if (extraInfo && extraInfo.trim()) {
      fullContent += `\n\n### 3. 信息同步/问题暴露/学习分享\n\n${extraInfo}`
    } else {
      fullContent += `\n\n### 3. 信息同步/问题暴露/学习分享\n\na. 暂无`
    }

    // 查找或创建周报页面
    let pageId = await findWeeklyReportPage(weekOf)
    
    if (!pageId) {
      // 从内存存储读取请假状态
      const currentLeaves = submissions?.weekOf === weekOf ? (submissions.leaves || {}) : {}
      
      // 创建新页面（传递成员信息包含请假状态）
      const memberInfos = membersConfig.members.map((m: any) => ({
        name: m.name,
        onLeave: currentLeaves[m.id] || false,
      }))
      pageId = await createWeeklyReportPage(weekOf, memberInfos)
    }

    // 更新成员周报
    const memberName = membersConfig.members.find(m => m.id === member)?.name || member
    const success = await updateMemberReport(pageId, memberName, fullContent)

    if (!success) {
      return NextResponse.json(
        { error: '更新周报失败' },
        { status: 500 }
      )
    }

    // 更新内存中的提交状态
    if (!globalStore.submissions || globalStore.submissions.weekOf !== weekOf) {
      globalStore.submissions = {
        weekOf,
        pageId,
        submissions: {},
        leaves: {},
      }
    }
    
    globalStore.submissions.submissions[member] = {
      submitted: true,
      time: new Date().toISOString(),
    }

    return NextResponse.json({ 
      success: true, 
      pageId,
      message: '周报提交成功！' 
    })
  } catch (error) {
    console.error('提交周报失败:', error)
    return NextResponse.json(
      { error: '提交周报失败', details: String(error) },
      { status: 500 }
    )
  }
}
