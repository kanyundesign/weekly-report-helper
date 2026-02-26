import { Client } from '@notionhq/client'

// 初始化 Notion 客户端
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const DATABASE_ID = process.env.NOTION_DATABASE_ID!
const REPORT_DATABASE_ID = process.env.NOTION_REPORT_DATABASE_ID!

// 任务类型
export interface Task {
  id: string
  title: string
  status: string
  assignee: string
  project: string
  lastEditedTime: string
  content: string[]
  // 新增日期字段
  startDate: string | null    // 开始日期
  endDate: string | null      // 结束日期
  isOverdue: boolean          // 是否延期
  daysOverdue: number         // 延期天数
  daysRemaining: number       // 剩余天数（负数表示已过期）
  // 进度相关
  timeProgress: number        // 时间进度（已用时间/总时间）
  isBehindSchedule: boolean   // 进度是否落后
}

// ⚠️ 测试模式：如需模拟日期，将 TEST_MODE 设为 true
const TEST_MODE = false
const TEST_DATE = new Date('2025-12-22T10:00:00')

// 获取当前日期（支持测试模式）
export function getCurrentDate(): Date {
  return TEST_MODE ? new Date(TEST_DATE) : new Date()
}

// 获取过去 7 天的日期
function getSevenDaysAgo(): string {
  const date = getCurrentDate()
  date.setDate(date.getDate() - 7)
  return date.toISOString()
}

// 获取本周周一的日期
export function getWeekMonday(): string {
  const now = getCurrentDate()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return monday.toISOString().split('T')[0]
}

// 获取周报范围字符串（上周一 ~ 上周日）
export function getWeekRange(): string {
  const now = getCurrentDate()
  const dayOfWeek = now.getDay()
  
  // 先找到本周一
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  
  // 上周一 = 本周一 - 7 天
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  
  // 上周日 = 上周一 + 6 天
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)

  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${formatDate(lastMonday)} ~ ${formatDate(lastSunday)}`
}

// 从 Notion 获取任务数据
export async function fetchTasks(assigneeName: string): Promise<{
  inProgress: Task[]
  nextUp: Task[]
}> {
  const sevenDaysAgo = getSevenDaysAgo()
  
  try {
    // 分两组并行查询：进行中的任务 + 最近完成的任务
    const activeStatuses = ['Next Up', 'In Progress', 'Review']
    
    const [activeResponse, doneResponse] = await Promise.all([
      notion.databases.query({
        database_id: DATABASE_ID,
        filter: {
          or: activeStatuses.map(status => ({
            property: 'Status',
            select: { equals: status },
          })),
        },
        page_size: 100,
      }),
      notion.databases.query({
        database_id: DATABASE_ID,
        filter: {
          and: [
            { property: 'Status', select: { equals: 'Done' } },
            { timestamp: 'last_edited_time', last_edited_time: { on_or_after: sevenDaysAgo } },
          ],
        },
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 30,
      }),
    ])
    
    const allResults = [...activeResponse.results, ...doneResponse.results]
    
    console.log(`查询到任务总数: ${allResults.length}`)

    // 快速过滤出属于当前用户的任务
    const userPages = allResults.filter((page: any) => {
      const assigneeProp = page.properties['Assignee'] || page.properties['负责人'] || page.properties['assignee']
      
      let assigneeNames: string[] = []
      
      if (assigneeProp?.people) {
        assigneeNames = assigneeProp.people.map((p: any) => p.name || p.email || '').filter(Boolean)
      } else if (assigneeProp?.select) {
        assigneeNames = [assigneeProp.select.name].filter(Boolean)
      } else if (assigneeProp?.multi_select) {
        assigneeNames = assigneeProp.multi_select.map((s: any) => s.name || '').filter(Boolean)
      }
      
      if (assigneeNames.length === 0) return false
      
      return assigneeNames.some((name: string) => 
        name === assigneeName || 
        name.toLowerCase() === assigneeName.toLowerCase()
      )
    })
    
    console.log(`用户 ${assigneeName} 的任务数: ${userPages.length}`)

    // 第二步：只为用户任务获取子任务内容（并行）
    const fetchTaskWithContent = async (page: any): Promise<Task> => {
      const title = page.properties['Name']?.title?.[0]?.plain_text || 
                   page.properties['名称']?.title?.[0]?.plain_text || 
                   '未命名任务'
      
      const status = page.properties['Status']?.select?.name || page.properties['Status']?.status?.name || ''
      const project = page.properties['Project']?.select?.name || ''
      
      // 获取日期信息 - 支持多种属性名
      const dateProp = page.properties['设计排期'] || 
                       page.properties['Date'] || 
                       page.properties['日期'] || 
                       page.properties['Deadline'] ||
                       page.properties['排期']
      let startDate: string | null = null
      let endDate: string | null = null
      
      if (dateProp?.date) {
        startDate = dateProp.date.start || null
        endDate = dateProp.date.end || dateProp.date.start || null
      }
      
      // 调试日志
      console.log(`任务 "${title}" 日期信息: start=${startDate}, end=${endDate}`)
      
      // 计算延期状态和时间进度
      const now = getCurrentDate()
      let isOverdue = false
      let daysOverdue = 0
      let daysRemaining = 0
      let timeProgress = 0  // 时间进度百分比
      
      if (endDate && status !== 'Done') {
        const endDateObj = new Date(endDate)
        const diffTime = endDateObj.getTime() - now.getTime()
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        
        if (daysRemaining < 0) {
          isOverdue = true
          daysOverdue = Math.abs(daysRemaining)
          timeProgress = 100  // 已过期，时间进度100%
        } else if (startDate) {
          // 计算时间进度
          const startDateObj = new Date(startDate)
          const totalDuration = endDateObj.getTime() - startDateObj.getTime()
          const elapsedDuration = now.getTime() - startDateObj.getTime()
          
          if (totalDuration > 0) {
            timeProgress = Math.round((elapsedDuration / totalDuration) * 100)
            timeProgress = Math.max(0, Math.min(100, timeProgress))  // 限制在 0-100
          }
        }
      }

      // 获取页面内容（子任务）
      let content: string[] = []
      try {
        const blocks = await notion.blocks.children.list({
          block_id: page.id,
          page_size: 100,
        })
        
        content = blocks.results
          .filter((block: any) => block.type === 'to_do' || block.type === 'bulleted_list_item' || block.type === 'numbered_list_item' || block.type === 'paragraph')
          .map((block: any) => {
            const type = block.type
            const richTexts = block[type]?.rich_text || []
            const text = richTexts.map((rt: any) => rt.plain_text || '').join('')
            const checked = block.type === 'to_do' ? block.to_do?.checked : text.includes('✅')
            
            if (checked && !text.includes('✅')) {
              return `${text} ✅`
            }
            return text
          })
          .filter((text: string) => text.trim() !== '')
      } catch (e) {
        console.error('获取页面内容失败:', e)
      }

      return {
        id: page.id,
        title,
        status,
        assignee: assigneeName,
        project,
        lastEditedTime: page.last_edited_time,
        content,
        startDate,
        endDate,
        isOverdue,
        daysOverdue,
        daysRemaining,
        timeProgress,
        isBehindSchedule: false,  // 将在 claude.ts 中根据工作进度计算
      }
    }

    // 分批获取用户任务的内容（每批 5 个，避免并发过多导致超时）
    const userTasks: Task[] = []
    const batchSize = 5
    for (let i = 0; i < userPages.length; i += batchSize) {
      const batch = userPages.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map(fetchTaskWithContent))
      userTasks.push(...batchResults)
    }
    
    // 分类：本周计划 (Next Up, In Progress, Review) 和 上周完成 (Done，且在时间范围内)
    const inProgress = userTasks.filter(task => 
      task.status === 'Next Up' || task.status === 'In Progress' || task.status === 'Review'
    )
    
    // 上周完成：只显示过去7天内编辑的 Done 任务
    const sevenDaysAgoDate = new Date(sevenDaysAgo)
    const nextUp = userTasks.filter(task => {
      if (task.status !== 'Done') return false
      const taskDate = new Date(task.lastEditedTime)
      return taskDate >= sevenDaysAgoDate
    })
    
    console.log(`用户 ${assigneeName} 的任务: 本周计划=${inProgress.length}, 上周完成=${nextUp.length}`)

    return { inProgress, nextUp }
  } catch (error) {
    console.error('Notion API 错误:', error)
    throw error
  }
}

// 获取成员列表（从 Notion Assignee 字段）
export async function fetchMembers(): Promise<string[]> {
  try {
    const response = await notion.databases.retrieve({
      database_id: DATABASE_ID,
    })
    
    // 从数据库 schema 获取 Assignee 相关信息比较复杂
    // 这里返回配置文件中的成员列表
    return []
  } catch (error) {
    console.error('获取成员列表失败:', error)
    return []
  }
}

// 检查周报页面是否存在
export async function findWeeklyReportPage(weekOf: string): Promise<string | null> {
  try {
    // 获取数据库中的所有页面，然后手动匹配标题
    const response = await notion.databases.query({
      database_id: REPORT_DATABASE_ID,
      page_size: 100,
    })

    // 遍历结果，找到标题匹配的页面
    for (const page of response.results) {
      const properties = (page as any).properties
      // 遍历所有属性，找到 title 类型的属性
      for (const key of Object.keys(properties)) {
        const prop = properties[key]
        if (prop.type === 'title' && prop.title?.[0]?.plain_text === weekOf) {
          return page.id
        }
      }
    }
    return null
  } catch (error) {
    console.error('查询周报页面失败:', error)
    return null
  }
}

// 成员信息类型
interface MemberInfo {
  name: string
  onLeave?: boolean
  role?: string
}

// 创建周报页面
export async function createWeeklyReportPage(weekOf: string, members: MemberInfo[]): Promise<string> {
  try {
    const weekRange = getWeekRange()
    
    // 先获取数据库结构，找到标题属性的名称
    const dbInfo = await notion.databases.retrieve({ database_id: REPORT_DATABASE_ID })
    let titlePropertyName = 'Name' // 默认
    
    for (const [key, prop] of Object.entries((dbInfo as any).properties)) {
      if ((prop as any).type === 'title') {
        titlePropertyName = key
        break
      }
    }
    
    console.log(`周报数据库标题属性名: ${titlePropertyName}`)
    
    // 创建页面
    const page = await notion.pages.create({
      parent: {
        database_id: REPORT_DATABASE_ID,
      },
      properties: {
        [titlePropertyName]: {
          title: [
            {
              text: {
                content: weekOf,
              },
            },
          ],
        },
      },
      children: [
        // 💡 提醒 callout - 浅灰色背景，红色加粗文字
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [{ 
              type: 'text', 
              text: { content: 'OKR 进展更新了吗？上周会议文档里的 ToDo 进展更新了吗?' },
              annotations: { bold: true, color: 'red' }
            }],
            icon: { type: 'emoji', emoji: '💡' },
            color: 'gray_background',
          },
        },
        // 1. 同步 OKR / 项目进展（含子项"暂无"）
        {
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{ type: 'text', text: { content: '同步 OKR / 项目进展' }, annotations: { bold: true } }],
            children: [
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ type: 'text', text: { content: '暂无' } }],
                },
              },
            ],
          },
        },
        // 2. 工作进展 & 信息同步/讨论（含三个子项）
        {
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{ type: 'text', text: { content: '工作进展 & 信息同步/讨论' }, annotations: { bold: true } }],
            children: [
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ type: 'text', text: { content: '上周进展' } }],
                },
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ type: 'text', text: { content: '本周计划' } }],
                },
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ type: 'text', text: { content: '信息同步/问题暴露/学习分享' } }],
                },
              },
            ],
          },
        },
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
        // 为每个成员创建占位区域
        ...members.flatMap((member): any[] => {
          // 管理者：H2 标题 + 3 个空序号列表 + 分隔线
          if (member.role === 'manager') {
            return [
              {
                object: 'block',
                type: 'heading_2',
                heading_2: {
                  rich_text: [{ type: 'text', text: { content: member.name } }],
                },
              },
              {
                object: 'block',
                type: 'numbered_list_item',
                numbered_list_item: {
                  rich_text: [{ type: 'text', text: { content: '' } }],
                },
              },
              {
                object: 'block',
                type: 'numbered_list_item',
                numbered_list_item: {
                  rich_text: [{ type: 'text', text: { content: '' } }],
                },
              },
              {
                object: 'block',
                type: 'numbered_list_item',
                numbered_list_item: {
                  rich_text: [{ type: 'text', text: { content: '' } }],
                },
              },
              {
                object: 'block',
                type: 'divider',
                divider: {},
              },
            ]
          }
          // 普通成员：H2 标题 + 待提交/请假 + 分隔线
          return [
            {
              object: 'block',
              type: 'heading_2',
              heading_2: {
                rich_text: [{ type: 'text', text: { content: member.name } }],
              },
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ 
                  type: 'text', 
                  text: { content: member.onLeave ? '（请假）' : '（待提交）' } 
                }],
              },
            },
            {
              object: 'block',
              type: 'divider',
              divider: {},
            },
          ]
        }),
      ] as any[],
      })

    return page.id
  } catch (error) {
    console.error('创建周报页面失败:', error)
    throw error
  }
}

// 解析周报内容，生成结构化的 Notion blocks
function parseContentToBlocks(content: string): any[] {
  const lines = content.split('\n').filter(line => line.trim())
  const blocks: any[] = []
  
  // 如果是简单文本（如 "（请假）"），直接返回段落
  if (lines.length === 1 && !lines[0].startsWith('###')) {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: lines[0] } }],
      },
    }]
  }
  
  let currentSection: any = null  // 当前章节（如 1. 上周完成）
  let currentTask: any = null     // 当前任务（如 a. 任务名）
  
  for (const line of lines) {
    // 章节标题：### 1. 上周完成
    if (line.startsWith('### ')) {
      // 保存之前的任务
      if (currentTask && currentSection) {
        currentSection.numbered_list_item.children.push(currentTask)
      }
      // 保存之前的章节
      if (currentSection) {
        blocks.push(currentSection)
      }
      
      currentSection = {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{ 
            type: 'text', 
            text: { content: line.replace('### ', '').replace(/^\d+\.\s*/, '') },
            annotations: { bold: true }
          }],
          children: [],
        },
      }
      currentTask = null
      continue
    }
    
    // 任务标题：a. 任务名 或 a. 任务名 — 40%
    const taskMatch = line.match(/^([a-z])\.\s*(.+)/)
    if (taskMatch && !line.startsWith('   ')) {
      // 保存之前的任务
      if (currentTask && currentSection) {
        currentSection.numbered_list_item.children.push(currentTask)
      }
      
      currentTask = {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: taskMatch[2] } }],
          children: [],
        },
      }
      continue
    }
    
    // 子任务：   i. 子任务内容 或缩进的内容
    const subtaskMatch = line.match(/^\s+([ivx]+|\d+)\.\s*(.+)/) || line.match(/^\s{3,}(.+)/)
    if (subtaskMatch && currentTask) {
      const subtaskText = subtaskMatch[2] || subtaskMatch[1]
      currentTask.bulleted_list_item.children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: subtaskText } }],
        },
      })
      continue
    }
    
    // 其他内容（如 "暂无"）
    if (currentSection && !currentTask) {
      currentSection.numbered_list_item.children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line } }],
        },
      })
    }
  }
  
  // 保存最后的任务和章节
  if (currentTask && currentSection) {
    currentSection.numbered_list_item.children.push(currentTask)
  }
  if (currentSection) {
    blocks.push(currentSection)
  }
  
  return blocks
}

// 更新成员的周报内容
export async function updateMemberReport(
  pageId: string,
  memberName: string,
  content: string
): Promise<boolean> {
  try {
    // 获取页面所有 blocks
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    })

    // 找到该成员的标题 block
    let memberBlockIndex = -1
    let nextDividerIndex = -1
    
    for (let i = 0; i < blocks.results.length; i++) {
      const block = blocks.results[i] as any
      if (block.type === 'heading_2') {
        const text = block.heading_2?.rich_text?.[0]?.plain_text || ''
        if (text === memberName) {
          memberBlockIndex = i
        } else if (memberBlockIndex !== -1 && nextDividerIndex === -1) {
          nextDividerIndex = i
        break
        }
      }
      if (memberBlockIndex !== -1 && block.type === 'divider' && nextDividerIndex === -1) {
        nextDividerIndex = i
      }
    }

    // 如果找不到成员标题，则自动创建
    if (memberBlockIndex === -1) {
      console.log('未找到成员区域，正在创建:', memberName)
      
      // 在页面末尾添加成员标题和分隔线
      await notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: memberName } }],
            },
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: '（待提交）' } }],
            },
          },
          {
            object: 'block',
            type: 'divider',
            divider: {},
          },
        ] as any[],
      })
      
      // 重新获取 blocks 并找到新创建的成员标题
      const newBlocks = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      })
      
      for (let i = 0; i < newBlocks.results.length; i++) {
        const block = newBlocks.results[i] as any
        if (block.type === 'heading_2') {
          const text = block.heading_2?.rich_text?.[0]?.plain_text || ''
          if (text === memberName) {
            memberBlockIndex = i
            // 找到下一个分隔线
            for (let j = i + 1; j < newBlocks.results.length; j++) {
              const nextBlock = newBlocks.results[j] as any
              if (nextBlock.type === 'divider' || nextBlock.type === 'heading_2') {
                nextDividerIndex = j
                break
              }
            }
            break
          }
        }
      }
      
      // 更新 blocks 引用
      Object.assign(blocks, newBlocks)
    }

    // 删除旧内容（标题和分隔线之间的内容）
    const blocksToDelete = blocks.results.slice(memberBlockIndex + 1, nextDividerIndex)
    for (const block of blocksToDelete) {
      await notion.blocks.delete({ block_id: (block as any).id })
    }

    // 解析内容为结构化的 blocks
    const newBlocks = parseContentToBlocks(content)
    
    // 在内容末尾添加空行，与分割线保持间距
    newBlocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [],
      },
    })
    
    console.log('生成的 blocks:', JSON.stringify(newBlocks, null, 2))

    // 在页面级别插入新内容（在成员标题后）
    const memberBlock = blocks.results[memberBlockIndex] as any
    await notion.blocks.children.append({
      block_id: pageId,
      children: newBlocks as any[],
      after: memberBlock.id,
    } as any)

    return true
  } catch (error) {
    console.error('更新成员周报失败:', error)
    return false
  }
}

// 生成进度条字符
function generateProgressBar(percent: number): string {
  const filled = Math.round(percent / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// 在周报底部添加任务状态总览和风险预警
export async function addTeamSummary(
  pageId: string, 
  allTasks: { memberName: string; tasks: Task[] }[]
): Promise<boolean> {
  try {
    // 统计所有任务
    let totalTasks = 0
    let doneTasks = 0
    let inProgressTasks = 0
    let nextUpTasks = 0
    let reviewTasks = 0
    let overdueTasks: { member: string; task: Task }[] = []
    let urgentTasks: { member: string; task: Task }[] = []
    
    for (const { memberName, tasks } of allTasks) {
      for (const task of tasks) {
        totalTasks++
        
        if (task.status === 'Done') {
          doneTasks++
        } else if (task.status === 'In Progress') {
          inProgressTasks++
        } else if (task.status === 'Next Up') {
          nextUpTasks++
        } else if (task.status === 'Review') {
          reviewTasks++
        }
        
        if (task.isOverdue) {
          overdueTasks.push({ member: memberName, task })
        } else if (task.daysRemaining > 0 && task.daysRemaining <= 2) {
          urgentTasks.push({ member: memberName, task })
        }
      }
    }
    
    // 计算百分比
    const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
    const inProgressPercent = totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0
    const nextUpPercent = totalTasks > 0 ? Math.round((nextUpTasks / totalTasks) * 100) : 0
    const reviewPercent = totalTasks > 0 ? Math.round((reviewTasks / totalTasks) * 100) : 0
    
    // 构建 blocks
    const blocks: any[] = [
      // 分隔线
      {
        object: 'block',
        type: 'divider',
        divider: {},
      },
      // 标题
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '📊 团队任务状态总览' } }],
        },
      },
      // 状态统计
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: `✅ 已完成  ${generateProgressBar(donePercent)} ${doneTasks}个 (${donePercent}%)` } },
          ],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: `🔄 进行中  ${generateProgressBar(inProgressPercent)} ${inProgressTasks}个 (${inProgressPercent}%)` } },
          ],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: `📋 待开始  ${generateProgressBar(nextUpPercent)} ${nextUpTasks}个 (${nextUpPercent}%)` } },
          ],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: `👀 评审中  ${generateProgressBar(reviewPercent)} ${reviewTasks}个 (${reviewPercent}%)` } },
          ],
        },
      },
    ]
    
    // 风险预警
    if (overdueTasks.length > 0 || urgentTasks.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [] },
      })
      
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '🚨 风险预警' } }],
        },
      })
      
      // 延期任务
      if (overdueTasks.length > 0) {
        blocks.push({
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '🔴' },
            color: 'red_background',
            rich_text: [
              { type: 'text', text: { content: `延期任务 (${overdueTasks.length}个)` }, annotations: { bold: true } },
            ],
          },
        })
        
        for (const { member, task } of overdueTasks) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
              rich_text: [
                { type: 'text', text: { content: `${task.title}` }, annotations: { bold: true } },
                { type: 'text', text: { content: ` — ${member} — 已延期 ${task.daysOverdue} 天` } },
              ],
            },
          })
        }
      }
      
      // 即将到期任务
      if (urgentTasks.length > 0) {
        blocks.push({
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '⚠️' },
            color: 'yellow_background',
            rich_text: [
              { type: 'text', text: { content: `即将到期任务 (${urgentTasks.length}个)` }, annotations: { bold: true } },
            ],
          },
        })
        
        for (const { member, task } of urgentTasks) {
      blocks.push({
        object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [
                { type: 'text', text: { content: `${task.title}` }, annotations: { bold: true } },
                { type: 'text', text: { content: ` — ${member} — 还剩 ${task.daysRemaining} 天` } },
              ],
        },
      })
    }
  }
    }
    
    // 添加到页面底部
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks,
    })
    
    return true
  } catch (error) {
    console.error('添加团队总览失败:', error)
    return false
  }
}
