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

// 生成周报的 Prompt
function buildPrompt(assignee: string, currentTasks: Task[], doneTasks: Task[]): string {
  // 本周计划（Next Up、In Progress、Review）
  const currentInfo = currentTasks.map(task => {
    const subtasks = task.content.length > 0 
      ? task.content.map((c, i) => `   ${i + 1}. ${c}`).join('\n')
      : '   （无子任务详情）'
    return `- 任务: ${task.title}
  状态: ${task.status}
  项目: ${task.project || '未分类'}
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

  return `你是一个设计团队周报助手。请根据以下任务数据，为设计师 ${assignee} 生成格式化的周报。

## 任务数据

### 本周计划（Next Up / In Progress / Review 中的任务）：
${currentInfo || '（无计划任务）'}

### 上周完成（Done 中的任务）：
${doneInfo || '（无已完成任务）'}

## 周报格式要求

请按以下格式生成周报：

### 1. 上周完成

a. [已完成的任务名] ✅
b. [另一个已完成的任务] ✅

（如果没有已完成的任务，显示"暂无"）

### 2. 本周计划

a. [任务名] — [进度百分比，根据子任务完成情况计算]
   i. [子任务1] ✅ （如已完成）
   ii. [子任务2] ✅
   iii. [子任务3]（未完成则不加 ✅）

b. [另一个任务名] — [进度]
   ...

## 进度计算规则

1. 如果子任务中有工时信息（如 0.5pd、2pd），计算 已完成工时/总工时
2. 如果没有工时信息，计算 已完成子任务数/总子任务数
3. 子任务末尾有 ✅ 表示已完成

请直接输出周报内容，不要有额外的解释。使用中文。`
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

// 解析工时（如 "1pd"、"0.5pd"、"2h" 等）
function parseWorktime(text: string): number {
  // 匹配 数字 + pd/PD/天 或 数字 + h/H/小时
  const pdMatch = text.match(/(\d+\.?\d*)\s*(pd|PD|天)/i)
  if (pdMatch) {
    return parseFloat(pdMatch[1])
  }
  
  const hourMatch = text.match(/(\d+\.?\d*)\s*(h|H|小时)/i)
  if (hourMatch) {
    return parseFloat(hourMatch[1]) / 8  // 8小时 = 1pd
  }
  
  return 0
}

// 计算任务进度（基于工时）
function calculateProgress(subtasks: string[]): { percentage: number; hasWorktime: boolean } {
  let totalWorktime = 0
  let completedWorktime = 0
  
  subtasks.forEach(subtask => {
    const worktime = parseWorktime(subtask)
    if (worktime > 0) {
      totalWorktime += worktime
      if (subtask.includes('✅')) {
        completedWorktime += worktime
      }
    }
  })
  
  if (totalWorktime > 0) {
    return {
      percentage: Math.round((completedWorktime / totalWorktime) * 100),
      hasWorktime: true
    }
  }
  
  // 如果没有工时信息，按子任务数量计算
  if (subtasks.length > 0) {
    const completed = subtasks.filter(s => s.includes('✅')).length
    return {
      percentage: Math.round((completed / subtasks.length) * 100),
      hasWorktime: false
    }
  }
  
  return { percentage: 0, hasWorktime: false }
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
  
  if (currentTasks.length === 0) {
    report += '暂无计划任务\n'
  } else {
    currentTasks.forEach((task, index) => {
      const letter = String.fromCharCode(97 + index)
      
      // 计算进度（基于工时）
      let progress = ''
      if (task.content.length > 0) {
        const { percentage, hasWorktime } = calculateProgress(task.content)
        if (hasWorktime || percentage > 0) {
          progress = ` — ${percentage}%`
        }
      }

      report += `${letter}. ${task.title}${progress}\n`
      
      // 子任务
      task.content.forEach((subtask, i) => {
        const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i] || `${i + 1}`
        report += `   ${roman}. ${subtask}\n`
      })
      report += '\n'
    })
  }

  return report
}
