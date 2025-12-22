import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { Task } from './notion'

// 初始化 Bedrock 客户端
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// 模型 ARN
const MODEL_ARN = process.env.AWS_BEDROCK_MODEL_ARN || 'anthropic.claude-3-sonnet-20240229-v1:0'

// 生成进度条字符
function generateProgressBar(percent: number): string {
  const filled = Math.round(percent / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// 解析工时（如 "1pd", "0.5pd", "2h"）
function parseWorktime(text: string): number {
  const pdMatch = text.match(/(\d+\.?\d*)\s*pd/i)
  if (pdMatch) {
    return parseFloat(pdMatch[1])
  }
  const hMatch = text.match(/(\d+\.?\d*)\s*h/i)
  if (hMatch) {
    return parseFloat(hMatch[1]) / 8 // 转换为 pd
  }
  return 0
}

// 计算任务进度
function calculateProgress(subtasks: string[]): { percent: number; completed: number; total: number; totalPd: number; completedPd: number } {
  let totalPd = 0
  let completedPd = 0
  let completed = 0
  let total = 0
  
  for (const subtask of subtasks) {
    const worktime = parseWorktime(subtask)
    const isCompleted = subtask.includes('✅')
    
    if (worktime > 0) {
      totalPd += worktime
      if (isCompleted) {
        completedPd += worktime
      }
    }
    
    // 只统计看起来像子任务的内容（有数字开头或有工时）
    if (/^\d+\.?\s*/.test(subtask) || worktime > 0) {
      total++
      if (isCompleted) {
        completed++
      }
    }
  }
  
  // 优先使用工时计算进度
  let percent = 0
  if (totalPd > 0) {
    percent = Math.round((completedPd / totalPd) * 100)
  } else if (total > 0) {
    percent = Math.round((completed / total) * 100)
  }
  
  return { percent, completed, total, totalPd, completedPd }
}

// 生成周报的 Prompt
function buildPrompt(assignee: string, currentTasks: Task[], doneTasks: Task[]): string {
  // 本周计划（Next Up、In Progress、Review）- 包含日期、延期信息和进度条
  const currentInfo = currentTasks.map(task => {
    const subtasks = task.content.length > 0 
      ? task.content.map((c, i) => `   ${i + 1}. ${c}`).join('\n')
      : '   （无子任务详情）'
    
    // 计算进度
    const progress = calculateProgress(task.content)
    const progressBar = generateProgressBar(progress.percent)
    
    // 判断是否进度落后（时间进度 > 工作进度 + 10%）
    const isBehindSchedule = task.timeProgress > 0 && 
                             progress.percent < task.timeProgress - 10 &&
                             task.status !== 'Done'
    
    // 状态标记
    let statusMark = ''
    if (task.isOverdue) {
      statusMark = ' 🔴 已延期'
    } else if (isBehindSchedule) {
      statusMark = ' ⚠️ 进度落后'
    } else if (task.daysRemaining > 0 && task.daysRemaining <= 2) {
      statusMark = ' ⏰ 即将到期'
    }
    
    // 进度信息
    let progressInfo = ''
    if (progress.totalPd > 0) {
      progressInfo = `  📊 进度: ${progressBar} ${progress.percent}% (${progress.completedPd}pd/${progress.totalPd}pd)`
    } else if (progress.total > 0) {
      progressInfo = `  📊 进度: ${progressBar} ${progress.percent}% (${progress.completed}/${progress.total})`
    }
    
    // 日期信息
    let dateInfo = ''
    if (task.startDate && task.endDate) {
      dateInfo = `  📅 计划: ${task.startDate} ~ ${task.endDate}`
    } else if (task.endDate) {
      dateInfo = `  📅 截止: ${task.endDate}`
    }
    
    // 延期/剩余时间信息
    let timeStatus = ''
    if (task.isOverdue) {
      timeStatus = `  🔴 已延期 ${task.daysOverdue} 天`
    } else if (task.daysRemaining > 0 && task.daysRemaining <= 2) {
      timeStatus = `  ⏰ 还剩 ${task.daysRemaining} 天`
    }
    
    // 延期预警信息
    let warningInfo = ''
    if (task.isOverdue) {
      warningInfo = `  ⚠️ 延期预警: 已延期 ${task.daysOverdue} 天，请关注！`
    } else if (isBehindSchedule) {
      const behindPercent = task.timeProgress - progress.percent
      warningInfo = `  ⚠️ 进度预警: 时间已过 ${task.timeProgress}%，但工作进度仅 ${progress.percent}%，落后 ${behindPercent}%！`
    } else if (task.daysRemaining > 0 && task.daysRemaining <= 2) {
      warningInfo = `  ⚠️ 临期预警: 还剩 ${task.daysRemaining} 天，请加快进度！`
    }
    
    return `- 任务: ${task.title}${statusMark}
  状态: ${task.status}
  项目: ${task.project || '未分类'}${progressInfo}${dateInfo}${timeStatus}${warningInfo}
  子任务:
${subtasks}`
  }).join('\n\n')

  // 上周完成（Done）
  const doneInfo = doneTasks.map(task => {
    const subtasks = task.content.length > 0 
      ? task.content.map((c, i) => `   ${i + 1}. ${c}`).join('\n')
      : '   （无子任务详情）'
    return `- 任务: ${task.title}
  项目: ${task.project || '未分类'}
  子任务:
${subtasks}`
  }).join('\n\n')

  // 统计延期任务
  const overdueTasks = currentTasks.filter(t => t.isOverdue)
  const urgentTasks = currentTasks.filter(t => !t.isOverdue && t.daysRemaining > 0 && t.daysRemaining <= 2)

  return `你是一个设计团队周报助手。请根据以下任务数据，为设计师 ${assignee} 生成格式化的周报。

## 任务数据

### 本周计划（Next Up / In Progress / Review 中的任务）：
${currentInfo || '（无计划任务）'}

### 上周完成（Done 中的任务）：
${doneInfo || '（无已完成任务）'}

### ⚠️ 延期任务：${overdueTasks.length} 个
### ⏰ 即将到期任务（2天内）：${urgentTasks.length} 个

## 周报格式要求（必须严格遵守）

### 1. 上周完成

• [已完成的任务名] ✅

（如果没有已完成的任务，显示"• 暂无"）

### 2. 本周计划

**重要：必须复制任务数据中的状态标记（🔴 或 ⚠️）和进度条信息！**

格式：• [任务名] [状态标记] — [进度条] [百分比] [(工时)]
- 如果任务名后有 🔴，必须保留 🔴
- 如果任务名后有 ⚠️，必须保留 ⚠️

示例：

• 集团工牌需求设计 🔴 — ████████░░ 80% (4pd/5pd)
  ◦ 需求分析 1pd ✅
  ◦ 方案设计 2pd ✅
  ◦ 视觉输出 1.5pd

• 年会海报设计 ⚠️ — ██░░░░░░░░ 20% (1pd/5pd)
  ◦ 创意构思 0.5pd ✅
  ◦ 视觉设计 2pd

### 3. 时间偏差分析

**如果有延期或即将到期的任务，必须添加此部分！**

对于每个有 🔴 或 ⚠️ 标记的任务，说明：
• 🔴 [任务名] — 计划 [截止日期] 完成，已延期 [X] 天，当前进度 [X]%，需要 [建议措施]
• ⚠️ [任务名] — 还剩 [X] 天，当前进度 [X]%，[能否按时完成的评估]

请直接输出周报内容，不要有额外的解释。使用中文。必须使用 █ 和 ░ 符号生成进度条。`
}

// 调用 Claude 生成周报
export async function generateReport(
  assignee: string,
  inProgress: Task[],
  nextUp: Task[]
): Promise<string> {
  const prompt = buildPrompt(assignee, inProgress, nextUp)

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ARN,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    const response = await client.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))
    
    return responseBody.content?.[0]?.text || '生成失败，请重试'
  } catch (error) {
    console.error('Claude API 错误:', error)
    throw error
  }
}

// 备用方案：简单格式化（不使用 AI）
export function generateReportFallback(
  assignee: string,
  currentTasks: Task[],  // 本周计划 (Next Up, In Progress, Review)
  doneTasks: Task[]      // 上周完成 (Done)
): string {
  let report = '### 1. 上周完成\n\n'

  if (doneTasks.length === 0) {
    report += '暂无\n\n'
  } else {
    doneTasks.forEach((task, index) => {
      const letter = String.fromCharCode(97 + index) // a, b, c...
      report += `${letter}. ${task.title} ✅\n`
    })
    report += '\n'
  }

  report += '### 2. 本周计划\n\n'
  
  // 收集需要预警的任务
  const warningTasks: { task: Task; type: string; message: string }[] = []
  
  if (currentTasks.length === 0) {
    report += '暂无计划任务\n'
  } else {
    currentTasks.forEach((task, index) => {
      const letter = String.fromCharCode(97 + index)
      
      // 计算进度（基于工时）
      const { percent, totalPd, completedPd, total, completed } = calculateProgress(task.content)
      const progressBar = generateProgressBar(percent)
      
      // 判断是否进度落后
      const isBehindSchedule = task.timeProgress > 0 && 
                               percent < task.timeProgress - 10 &&
                               task.status !== 'Done'
      
      // 状态标记
      let statusMark = ''
      if (task.isOverdue) {
        statusMark = ' 🔴 已延期'
        warningTasks.push({
          task,
          type: '🔴 延期',
          message: `计划 ${task.endDate} 完成，已延期 ${task.daysOverdue} 天，当前进度 ${percent}%`
        })
      } else if (isBehindSchedule) {
        statusMark = ' ⚠️ 进度落后'
        const behindPercent = task.timeProgress - percent
        warningTasks.push({
          task,
          type: '⚠️ 进度落后',
          message: `时间已过 ${task.timeProgress}%，工作进度仅 ${percent}%，落后 ${behindPercent}%`
        })
      } else if (task.daysRemaining > 0 && task.daysRemaining <= 2) {
        statusMark = ' ⏰ 即将到期'
        warningTasks.push({
          task,
          type: '⏰ 即将到期',
          message: `还剩 ${task.daysRemaining} 天，当前进度 ${percent}%`
        })
      }
      
      // 进度信息
      let progressText = ''
      if (totalPd > 0) {
        progressText = ` — ${progressBar} ${percent}% (${completedPd}pd/${totalPd}pd)`
      } else if (total > 0) {
        progressText = ` — ${progressBar} ${percent}% (${completed}/${total})`
      }

      report += `${letter}. ${task.title}${statusMark}${progressText}\n`
      
      // 子任务
      task.content.forEach((subtask, i) => {
        const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i] || `${i + 1}`
        report += `   ${roman}. ${subtask}\n`
      })
      report += '\n'
    })
  }
  
  // 添加时间偏差分析
  if (warningTasks.length > 0) {
    report += '### ⏰ 时间偏差分析\n\n'
    warningTasks.forEach(({ task, type, message }) => {
      report += `${type} ${task.title} — ${message}\n`
    })
    report += '\n'
  }

  return report
}
