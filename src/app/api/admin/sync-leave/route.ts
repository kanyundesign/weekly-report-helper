import { NextResponse } from 'next/server'
import membersConfig from '../../../../../config/members.json'
import { 
  getWeekMonday, 
  findWeeklyReportPage, 
  createWeeklyReportPage,
  updateMemberReport 
} from '@/lib/notion'
import fs from 'fs'
import path from 'path'

// 获取提交状态文件路径
function getSubmissionsPath() {
  return path.join(process.cwd(), 'data', 'submissions.json')
}

// 读取提交状态
function readSubmissions() {
  try {
    const filePath = getSubmissionsPath()
    if (!fs.existsSync(filePath)) {
      return null
    }
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

// 同步请假信息到 Notion
export async function POST() {
  try {
    const weekOf = getWeekMonday()
    const submissions = readSubmissions()
    
    // 获取当前周的请假列表
    const currentLeaves = submissions?.weekOf === weekOf ? (submissions.leaves || {}) : {}
    
    // 获取请假的成员
    const leaveMembers = membersConfig.members.filter((m: any) => currentLeaves[m.id])
    
    if (leaveMembers.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要同步的请假信息',
        updated: 0,
      })
    }

    // 查找或创建周报页面
    let pageId = await findWeeklyReportPage(weekOf)
    
    if (!pageId) {
      // 创建新页面（传递成员信息包含请假状态）
      const memberInfos = membersConfig.members.map((m: any) => ({
        name: m.name,
        onLeave: currentLeaves[m.id] || false,
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
    for (const member of leaveMembers) {
      const success = await updateMemberReport(pageId, member.name, '（请假）')
      if (success) {
        updatedCount++
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

