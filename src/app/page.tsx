'use client'

import { useState, useEffect } from 'react'
import { FlagIcon } from '@/components/icons/FlagIcon'

// 成员类型
interface Member {
  id: string
  name: string
  submitted?: boolean
  submittedAt?: string
}

// 周报数据类型
interface ReportData {
  weekRange: string
  lastWeekProgress: string
  nextWeekPlan: string
}

// 模拟成员数据
const mockMembers: Member[] = [
  { id: 'wujinjin', name: 'wujinjin', submitted: true, submittedAt: '2024-12-16 14:30' },
  { id: 'lixinlu', name: 'lixinlu', submitted: false },
  { id: 'wuxiangyang', name: '吴向阳', submitted: false },
  { id: 'lin', name: 'Lin', submitted: true, submittedAt: '2024-12-16 15:00' },
  { id: 'yifan', name: 'yifan', submitted: false },
  { id: 'lugang', name: 'lugang', submitted: false },
  { id: 'zhengzhenzhen', name: '郑珍珍', submitted: false },
  { id: 'yuhan', name: 'yuhan', submitted: false },
]

// 模拟周报数据
const mockReportData: ReportData = {
  weekRange: '12/11 ~ 12/17',
  lastWeekProgress: `### 1. 上周进展

a. 项目测试-年会 — 79%
   i. 设计沟通 ✅
   ii. 草稿及确认 ✅
   iii. 设计初稿 ✅
   iv. 方案讨论与修改
   v. 定稿输出

b. 集团工牌需求 — 90%
   i. 需求沟通会 ✅
   ii. 概念稿 ✅
   iii. 设计定稿 ✅
   iv. 输出交付`,
  nextWeekPlan: `### 2. 本周计划

a. Paraflow 登录页优化
b. 品牌视觉规范整理`,
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>(mockMembers)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [extraInfo, setExtraInfo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 获取当前周范围
  const getWeekRange = () => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${formatDate(monday)} ~ ${formatDate(sunday)}`
  }

  // 选择成员
  const handleSelectMember = async (member: Member) => {
    setSelectedMember(member)
    setIsDropdownOpen(false)
    setExtraInfo('')
    
    if (!member.submitted) {
      setIsLoading(true)
      // 模拟 API 调用
      await new Promise(resolve => setTimeout(resolve, 1000))
      setReportData({
        ...mockReportData,
        weekRange: getWeekRange(),
      })
      setIsLoading(false)
    } else {
      setReportData({
        ...mockReportData,
        weekRange: getWeekRange(),
      })
    }
  }

  // 提交周报
  const handleSubmit = async () => {
    if (!selectedMember || selectedMember.submitted) return
    
    setIsSubmitting(true)
    // 模拟提交
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // 更新成员状态
    setMembers(prev => prev.map(m => 
      m.id === selectedMember.id 
        ? { ...m, submitted: true, submittedAt: new Date().toLocaleString('zh-CN') }
        : m
    ))
    setSelectedMember(prev => prev ? { ...prev, submitted: true } : null)
    setIsSubmitting(false)
  }

  // 统计提交情况
  const submittedCount = members.filter(m => m.submitted).length
  const totalCount = members.length

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* 头部 */}
        <header className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-navy-800 rounded-2xl mb-4 shadow-lg shadow-navy-800/20">
            <FlagIcon className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-navy-800 mb-2">设计团队周报助手</h1>
          <p className="text-slate-500">自动生成周报，让设计师专注设计</p>
        </header>

        {/* 主卡片 */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* 选择器区域 */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* 成员下拉选择 */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-600 mb-2">选择成员</label>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full sm:w-64 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center justify-between hover:border-primary-400 hover:bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                >
                  <span className={selectedMember ? 'text-navy-800' : 'text-slate-400'}>
                    {selectedMember ? (
                      <span className="flex items-center gap-2">
                        {selectedMember.submitted && <span className="text-emerald-500">✅</span>}
                        {selectedMember.name}
                        {selectedMember.submitted && <span className="text-xs text-slate-400">（已提交）</span>}
                      </span>
                    ) : (
                      '请选择你的名字...'
                    )}
                  </span>
                  <svg className={`w-5 h-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* 下拉菜单 */}
                {isDropdownOpen && (
                  <div className="absolute z-10 mt-2 w-full sm:w-64 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-100 py-2 animate-fade-in">
                    {members.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleSelectMember(member)}
                        className={`w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                          selectedMember?.id === member.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        {member.submitted ? (
                          <span className="text-emerald-500">✅</span>
                        ) : (
                          <span className="text-slate-400">👤</span>
                        )}
                        <span className={member.submitted ? 'text-emerald-700' : 'text-navy-800'}>
                          {member.name}
                        </span>
                        {member.submitted && (
                          <span className="text-xs text-slate-400 ml-auto">已提交</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 周报范围 & 提交统计 */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{getWeekRange()}</span>
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-medium">{submittedCount}</span>
                  <span className="text-slate-400">/</span>
                  <span className="text-slate-500">{totalCount}</span>
                  <span className="text-slate-400 text-xs">已提交</span>
                </div>
              </div>
            </div>
          </div>

          {/* 周报内容区域 */}
          {selectedMember && (
            <div className="p-6 animate-fade-in">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
                  <p>正在生成周报...</p>
                </div>
              ) : reportData ? (
                <>
                  {/* 成员标题 */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium">
                      {selectedMember.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-navy-800">{selectedMember.name} 的周报</h2>
                      <p className="text-sm text-slate-400">{reportData.weekRange}</p>
                    </div>
                    {selectedMember.submitted && (
                      <span className="ml-auto px-3 py-1 bg-emerald-50 text-emerald-600 text-sm rounded-full">
                        ✅ 已提交
                      </span>
                    )}
                  </div>

                  {/* AI 生成的周报内容（只读） */}
                  <div className="bg-slate-50 rounded-xl p-5 mb-6">
                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span>AI 自动生成（只读）</span>
                    </div>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <div className="whitespace-pre-wrap text-navy-800 leading-relaxed">
                        {reportData.lastWeekProgress}
                      </div>
                      <div className="mt-4 whitespace-pre-wrap text-navy-800 leading-relaxed">
                        {reportData.nextWeekPlan}
                      </div>
                    </div>
                  </div>

                  {/* 信息同步输入（可编辑） */}
                  <div className="mb-6">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
                      <span>📝</span>
                      <span>信息同步 / 问题暴露 / 学习分享</span>
                      <span className="text-slate-400 font-normal">（选填）</span>
                    </label>
                    <textarea
                      value={extraInfo}
                      onChange={(e) => setExtraInfo(e.target.value)}
                      disabled={selectedMember.submitted}
                      placeholder="在此输入你想同步的信息、遇到的问题或学习心得..."
                      className="w-full h-32 px-4 py-3 bg-white border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 disabled:bg-slate-50 disabled:text-slate-500 transition-all duration-200"
                    />
                    {!selectedMember.submitted && (
                      <p className="mt-2 text-xs text-slate-400">💡 此项为选填，留空则显示「暂无」</p>
                    )}
                  </div>

                  {/* 提交按钮 */}
                  {!selectedMember.submitted && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium rounded-xl shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>提交中...</span>
                          </>
                        ) : (
                          <>
                            <span>确认并提交到 Notion</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </button>
                      <p className="text-xs text-slate-400">提交后将立即写入 Notion，如需修改请前往 Notion 文档</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* 未选择成员时的提示 */}
          {!selectedMember && (
            <div className="p-12 text-center text-slate-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-lg mb-2">请先选择你的名字</p>
              <p className="text-sm">选择后将自动生成你的周报预览</p>
            </div>
          )}
        </div>

        {/* 页脚 */}
        <footer className="text-center mt-8 text-sm text-slate-400">
          <p>Powered by Notion API + AI</p>
        </footer>
      </div>
    </main>
  )
}

