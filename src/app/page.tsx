'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

// 成员类型
interface Member {
  id: string
  name: string
  role?: string
  submitted?: boolean
  submittedAt?: string
  onLeave?: boolean
}

// 任务类型
interface Task {
  id: string
  title: string
  status: string
  assignee: string
  project: string
  lastEditedTime: string
  content: string[]
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([])
  const [weekRange, setWeekRange] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [reportContent, setReportContent] = useState('')
  const [extraInfo, setExtraInfo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<{ inProgress: Task[], nextUp: Task[] } | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [isSyncingLeave, setIsSyncingLeave] = useState(false)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentMember: '' })
  const [successModal, setSuccessModal] = useState<{ show: boolean; message: string; pageId: string | null }>({ show: false, message: '', pageId: null })

  // 加载成员列表
  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members')
      const data = await res.json()
      setMembers(data.members || [])
      setWeekRange(data.weekRange || '')
    } catch (err) {
      console.error('获取成员列表失败:', err)
      setError('获取成员列表失败')
    }
  }

  // 选择成员
  const handleSelectMember = async (member: Member) => {
    setSelectedMember(member)
    setIsDropdownOpen(false)
    setExtraInfo('')
    setError('')
    setReportContent('')

    // 请假的成员不能填写周报
    if (member.onLeave) {
      setReportContent('（请假中，无需提交周报）')
      return
    }

    if (member.submitted) {
      setReportContent('（已提交，请前往 Notion 查看或修改）')
      return
    }

    setIsLoading(true)
    
    try {
      // 1. 获取任务数据
      const tasksRes = await fetch(`/api/tasks?member=${encodeURIComponent(member.name)}`)
      const tasksData = await tasksRes.json()
      
      if (!tasksRes.ok) {
        throw new Error(tasksData.error || '获取任务失败')
      }
      
      setTasks(tasksData)

      // 2. 生成周报
      const generateRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member: member.name,
          inProgress: tasksData.inProgress,
          nextUp: tasksData.nextUp,
        }),
      })
      const generateData = await generateRes.json()
      
      if (!generateRes.ok) {
        throw new Error(generateData.error || '生成周报失败')
      }

      setReportContent(generateData.report)
    } catch (err: any) {
      console.error('生成周报失败:', err)
      setError(err.message || '生成周报失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  // 提交周报
  const handleSubmit = async () => {
    if (!selectedMember || selectedMember.submitted || !reportContent) return

    setIsSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member: selectedMember.id,
          content: reportContent,
          extraInfo: extraInfo,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '提交失败')
      }

      // 更新成员状态
      setMembers(prev => prev.map(m =>
        m.id === selectedMember.id
          ? { ...m, submitted: true, submittedAt: new Date().toLocaleString('zh-CN') }
          : m
      ))
      setSelectedMember(prev => prev ? { ...prev, submitted: true } : null)
      
      // 显示成功模态框
      setSuccessModal({
        show: true,
        message: '周报提交成功！',
        pageId: data.pageId || null
      })
    } catch (err: any) {
      console.error('提交失败:', err)
      setError(err.message || '提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 切换请假状态
  const toggleLeave = async (member: Member) => {
    const newLeaveStatus = !member.onLeave
    
    // 立即更新本地状态（乐观更新）
    setMembers(prev => prev.map(m =>
      m.id === member.id ? { ...m, onLeave: newLeaveStatus } : m
    ))
    
    try {
      const res = await fetch('/api/admin/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          onLeave: newLeaveStatus,
        }),
      })
      
      if (!res.ok) {
        // API 失败，但本地状态已更新，不回滚
        console.warn('API 保存失败，但本地状态已更新')
      }
    } catch (err) {
      console.error('设置请假状态失败:', err)
      // 网络错误时也不回滚，让用户继续操作
    }
  }

  // 同步请假信息到 Notion
  const syncLeaveToNotion = async () => {
    setIsSyncingLeave(true)
    try {
      // 获取请假成员的 ID 列表
      const leaveMemberIds = members.filter(m => m.onLeave).map(m => m.id)
      
      const res = await fetch('/api/admin/sync-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveMembers: leaveMemberIds }),
      })
      const data = await res.json()
      
      if (res.ok) {
        alert(`✅ ${data.message}`)
      } else {
        alert(`❌ 同步失败: ${data.error}`)
      }
    } catch (err) {
      console.error('同步请假信息失败:', err)
      alert('❌ 同步失败，请重试')
    } finally {
      setIsSyncingLeave(false)
    }
  }

  // 一键批量生成所有人周报
  const batchGenerateAll = async () => {
    // 获取需要生成周报的成员（未提交且不请假，排除管理者）
    const pendingMembers = members.filter(m => !m.submitted && !m.onLeave && m.role !== 'manager')
    
    if (pendingMembers.length === 0) {
      alert('没有需要生成周报的成员')
      return
    }

    if (!confirm(`确定要为 ${pendingMembers.length} 位成员生成并提交周报吗？\n\n这可能需要几分钟时间。`)) {
      return
    }

    setIsBatchGenerating(true)
    setBatchProgress({ current: 0, total: pendingMembers.length, currentMember: '' })

    const results: { name: string; success: boolean; error?: string }[] = []
    let reportPageId: string | null = null

    for (let i = 0; i < pendingMembers.length; i++) {
      const member = pendingMembers[i]
      setBatchProgress({ current: i + 1, total: pendingMembers.length, currentMember: member.name })

      try {
        // 1. 获取任务数据
        const tasksRes = await fetch(`/api/tasks?member=${encodeURIComponent(member.name)}`)
        const tasksData = await tasksRes.json()
        
        if (!tasksRes.ok) {
          results.push({ name: member.name, success: false, error: tasksData.error || '获取任务失败' })
          continue
        }

        // 2. 生成周报
        const generateRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            member: member.name,
            inProgress: tasksData.inProgress,
            nextUp: tasksData.nextUp,
          }),
        })
        const generateData = await generateRes.json()
        
        if (!generateRes.ok) {
          results.push({ name: member.name, success: false, error: generateData.error || '生成周报失败' })
          continue
        }

        // 3. 提交周报
        const submitRes = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            member: member.id,
            content: generateData.report,
            extraInfo: '',
          }),
        })
        const submitData = await submitRes.json()
        
        if (submitRes.ok) {
          results.push({ name: member.name, success: true })
          // 保存周报页面 ID
          if (submitData.pageId) {
            reportPageId = submitData.pageId
          }
          // 更新本地状态
          setMembers(prev => prev.map(m =>
            m.id === member.id ? { ...m, submitted: true } : m
          ))
        } else {
          results.push({ name: member.name, success: false, error: submitData.error || '提交失败' })
        }
      } catch (err) {
        results.push({ name: member.name, success: false, error: String(err) })
      }
    }

    setIsBatchGenerating(false)
    setBatchProgress({ current: 0, total: 0, currentMember: '' })

    // 显示结果
    const successCount = results.filter(r => r.success).length
    const failedResults = results.filter(r => !r.success)
    
    let message = `✅ 批量生成完成！\n\n成功: ${successCount}/${pendingMembers.length}`
    if (failedResults.length > 0) {
      message += `\n\n❌ 失败的成员:\n${failedResults.map(r => `- ${r.name}: ${r.error}`).join('\n')}`
    }
    
    // 如果有成功提交的，添加团队任务总览
    if (successCount > 0 && reportPageId) {
      setBatchProgress({ current: pendingMembers.length, total: pendingMembers.length, currentMember: '正在生成团队总览...' })
      try {
        await fetch('/api/team-summary', { method: 'POST' })
      } catch (err) {
        console.error('生成团队总览失败:', err)
      }
    }

    // 显示成功模态框
    setSuccessModal({
      show: true,
      message: `批量生成完成！\n\n成功: ${successCount}/${pendingMembers.length}${failedResults.length > 0 ? `\n\n失败: ${failedResults.map(r => r.name).join(', ')}` : ''}`,
      pageId: reportPageId
    })

    // 刷新成员列表
    fetchMembers()
  }

  // 统计提交情况（排除管理者）
  const regularMembers = members.filter(m => m.role !== 'manager')
  const submittedCount = regularMembers.filter(m => m.submitted).length
  const leaveCount = regularMembers.filter(m => m.onLeave).length
  const totalCount = regularMembers.length

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* 头部 */}
        <header className="text-center mb-10 animate-fade-in relative">
          {/* 管理按钮 */}
          <button
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`absolute right-0 top-0 px-3 py-1.5 text-xs rounded-lg transition-all ${
              isAdminMode 
                ? 'bg-orange-100 text-orange-600 border border-orange-200' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {isAdminMode ? '退出管理' : '⚙️ 管理'}
          </button>
          
          <div className="inline-flex items-center justify-center w-12 h-12 bg-black rounded-xl mb-4 shadow-lg shadow-black/20 p-1">
            <Image src="/logo.png" alt="周报过去式" width={36} height={36} className="invert" />
          </div>
          <h1 className="text-2xl font-bold text-navy-800 mb-2">周报过去式</h1>
          <p className="text-slate-500">自动生成周报，让周报成为过去式</p>
        </header>

        {/* 管理模式 - 请假设置 */}
        {isAdminMode && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 mb-6 animate-fade-in">
            <h2 className="text-lg font-semibold text-orange-800 mb-4 flex items-center gap-2">
              🏖️ 请假管理
              <span className="text-sm font-normal text-orange-600">（点击成员切换请假状态）</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {regularMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => toggleLeave(member)}
                  disabled={member.submitted}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    member.submitted
                      ? 'bg-emerald-100 text-emerald-600 cursor-not-allowed'
                      : member.onLeave
                        ? 'bg-orange-200 text-orange-700 hover:bg-orange-300'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {member.submitted ? '✅' : member.onLeave ? '🏖️' : '👤'} {member.name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-orange-600">
                💡 已提交的成员无法设为请假。设置后点击提交同步到周报。
                {typeof window !== 'undefined' && window.location.hostname.includes('vercel') && (
                  <span className="block mt-1 text-orange-500">⚠️ 在线版本的请假状态刷新后会重置，建议在本地操作。</span>
                )}
              </p>
              <button
                onClick={syncLeaveToNotion}
                disabled={isSyncingLeave || leaveCount === 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  leaveCount === 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/25'
                }`}
              >
                {isSyncingLeave ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>
                    📤 提交请假信息 ({leaveCount}人)
                  </>
                )}
              </button>
            </div>

            {/* 批量操作区域 */}
            <div className="mt-6 pt-6 border-t border-orange-200">
              <h3 className="text-md font-semibold text-orange-800 mb-3 flex items-center gap-2">
                🚀 批量操作
              </h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={batchGenerateAll}
                  disabled={isBatchGenerating || regularMembers.filter(m => !m.submitted && !m.onLeave).length === 0}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    regularMembers.filter(m => !m.submitted && !m.onLeave).length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/25'
                  }`}
                >
                  {isBatchGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      生成中 ({batchProgress.current}/{batchProgress.total})
                    </>
                  ) : (
                    <>
                      ⚡ 一键生成全部周报 ({regularMembers.filter(m => !m.submitted && !m.onLeave).length}人)
                    </>
                  )}
                </button>
                {isBatchGenerating && batchProgress.currentMember && (
                  <span className="text-sm text-orange-600">
                    正在处理: {batchProgress.currentMember}
                  </span>
                )}
              </div>
              <p className="text-xs text-orange-500 mt-2">
                💡 将为所有未提交且未请假的成员自动生成周报并提交到 Notion
              </p>
            </div>
          </div>
        )}

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
                  <div className="absolute z-50 mt-2 w-full sm:w-64 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-100 py-2 animate-fade-in max-h-80 overflow-y-auto">
                    {regularMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => !member.onLeave && handleSelectMember(member)}
                        disabled={member.onLeave}
                        className={`w-full px-4 py-2.5 text-left flex items-center gap-2 transition-colors ${
                          member.onLeave 
                            ? 'bg-slate-50 cursor-not-allowed opacity-60' 
                            : 'hover:bg-slate-50'
                        } ${selectedMember?.id === member.id ? 'bg-primary-50' : ''}`}
                      >
                        {member.onLeave ? (
                          <span className="text-orange-400">🏖️</span>
                        ) : member.submitted ? (
                          <span className="text-emerald-500">✅</span>
                        ) : (
                          <span className="text-slate-400">👤</span>
                        )}
                        <span className={
                          member.onLeave 
                            ? 'text-slate-400' 
                            : member.submitted 
                              ? 'text-emerald-700' 
                              : 'text-navy-800'
                        }>
                          {member.name}
                        </span>
                        {member.onLeave ? (
                          <span className="text-xs text-orange-500 ml-auto">请假</span>
                        ) : member.submitted ? (
                          <span className="text-xs text-slate-400 ml-auto">已提交</span>
                        ) : null}
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
                  <span>{weekRange}</span>
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

          {/* 错误提示 */}
          {error && (
            <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* 周报内容区域 */}
          {selectedMember && (
            <div className="p-6 animate-fade-in">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" style={{ borderWidth: '3px' }} />
                  <p>正在生成周报...</p>
                  <p className="text-xs mt-2">读取 Notion 任务数据中</p>
                </div>
              ) : reportContent ? (
                <>
                  {/* 成员标题 */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium">
                      {selectedMember.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-navy-800">{selectedMember.name} 的周报</h2>
                      <p className="text-sm text-slate-400">{weekRange}</p>
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
                      <span>AI 自动生成（如需编辑，前往 Notion 周报页面）</span>
                    </div>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-navy-800 leading-relaxed font-sans text-sm bg-transparent p-0 m-0">
                        {reportContent}
                      </pre>
                    </div>
                  </div>

                  {/* 信息同步输入（可编辑） */}
                  {!selectedMember.submitted && (
                    <div className="mb-6">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
                        <span>📝</span>
                        <span>信息同步 / 问题暴露 / 学习分享</span>
                        <span className="text-slate-400 font-normal">（选填）</span>
                      </label>
                      <textarea
                        value={extraInfo}
                        onChange={(e) => setExtraInfo(e.target.value)}
                        placeholder="在此输入你想同步的信息、遇到的问题或学习心得..."
                        className="w-full h-32 px-4 py-3 bg-white border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
                      />
                      <p className="mt-2 text-xs text-slate-400">💡 此项为选填，留空则显示「暂无」</p>
                    </div>
                  )}

                  {/* 提交按钮 */}
                  {!selectedMember.submitted && (
                    <div className="flex flex-col items-center gap-2 mt-4">
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
                      <p className="text-xs text-slate-400 text-center">提交后将立即写入 Notion，如需修改请前往 Notion 文档</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* 未选择成员时的提示 */}
          {!selectedMember && (
            <div className="p-12 text-center text-slate-400 min-h-[320px] flex flex-col items-center justify-center">
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
          <p>Designed & Developed by yifan</p>
        </footer>
      </div>

      {/* 成功模态框 */}
      {successModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">✅ {successModal.message}</h3>
              {successModal.pageId && (
                <p className="text-slate-500 mb-6">点击下方按钮前往 Notion 进行校对</p>
              )}
              <div className="flex flex-col gap-3">
                {successModal.pageId && (
                  <a
                    href={`https://www.notion.so/${successModal.pageId.replace(/-/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                    onClick={() => setSuccessModal({ show: false, message: '', pageId: null })}
                  >
                    <span>打开 Notion 周报页面</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={() => setSuccessModal({ show: false, message: '', pageId: null })}
                  className="w-full px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-xl transition-all duration-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
