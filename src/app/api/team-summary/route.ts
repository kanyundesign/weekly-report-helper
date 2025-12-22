import { NextRequest, NextResponse } from 'next/server'
import { 
  getWeekMonday, 
  findWeeklyReportPage,
  fetchTasks,
  addTeamSummary,
  Task
} from '@/lib/notion'
import membersConfig from '../../../../config/members.json'

export async function POST(request: NextRequest) {
  try {
    const weekOf = getWeekMonday()
    
    // 查找本周周报页面
    const pageId = await findWeeklyReportPage(weekOf)
    
    if (!pageId) {
      return NextResponse.json(
        { error: '未找到本周周报页面' },
        { status: 404 }
      )
    }
    
    // 获取所有成员的任务
    const allTasks: { memberName: string; tasks: Task[] }[] = []
    
    for (const member of membersConfig.members) {
      try {
        const { inProgress, nextUp } = await fetchTasks(member.name)
        // 合并所有任务
        const tasks = [...inProgress, ...nextUp]
        allTasks.push({ memberName: member.name, tasks })
      } catch (err) {
        console.error(`获取 ${member.name} 的任务失败:`, err)
      }
    }
    
    // 添加团队总览
    const success = await addTeamSummary(pageId, allTasks)
    
    if (!success) {
      return NextResponse.json(
        { error: '添加团队总览失败' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: '团队任务总览已添加',
    })
  } catch (error) {
    console.error('生成团队总览失败:', error)
    return NextResponse.json(
      { error: '生成团队总览失败', details: String(error) },
      { status: 500 }
    )
  }
}


