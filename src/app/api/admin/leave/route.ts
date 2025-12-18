import { NextRequest, NextResponse } from 'next/server'
import { getWeekMonday } from '@/lib/notion'
import fs from 'fs'
import path from 'path'

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL === '1'

// 内存存储（用于 Vercel 环境）
let memoryStorage: Record<string, any> = {}

// 获取提交状态文件路径
function getSubmissionsPath() {
  return path.join(process.cwd(), 'data', 'submissions.json')
}

// 读取提交状态
function readSubmissions() {
  if (isVercel) {
    return memoryStorage.submissions || null
  }
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

// 保存提交状态
function saveSubmissions(data: any) {
  if (isVercel) {
    memoryStorage.submissions = data
    return
  }
  const filePath = getSubmissionsPath()
  const dir = path.dirname(filePath)
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

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
    let submissions = readSubmissions()

    // 初始化数据结构
    if (!submissions || submissions.weekOf !== weekOf) {
      submissions = {
        weekOf,
        submissions: {},
        leaves: {},
      }
    }

    if (!submissions.leaves) {
      submissions.leaves = {}
    }

    // 设置请假状态
    submissions.leaves[memberId] = onLeave

    saveSubmissions(submissions)

    return NextResponse.json({
      success: true,
      memberId,
      onLeave,
      isVercel, // 返回环境信息
    })
  } catch (error) {
    console.error('设置请假状态失败:', error)
    return NextResponse.json(
      { error: '设置请假状态失败' },
      { status: 500 }
    )
  }
}



