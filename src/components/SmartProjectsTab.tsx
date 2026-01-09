'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completedAt: string | null;
  dueOn: string | null;
  startOn: string | null;
  assignee: { gid: string; name: string; email: string } | null;
  section: string | null;
  tags: { name: string; color: string }[];
  customFields: { name: string; value: string | number | null; type: string }[];
  notes: string | null;
  createdAt: string;
  modifiedAt: string;
}

interface ProjectData {
  project: { gid: string; name: string; color: string };
  sections: { gid: string; name: string }[];
  tasks: AsanaTask[];
  stats: { total: number; completed: number; incomplete: number; overdue: number; dueSoon: number; unassigned: number };
  count: number;
  lastUpdated: string;
}

type SmartView = 'needs_attention' | 'this_week' | 'by_status' | 'all';

interface PriorityScore {
  taskId: string;
  score: number;
  reasons: string[];
  category: 'critical' | 'high' | 'medium' | 'low';
}

// Helper functions
function getCustomField(task: AsanaTask, fieldName: string): string | null {
  const field = task.customFields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
  return field?.value as string | null;
}

function getTaskStatus(task: AsanaTask): 'confirmed' | 'placeholder' | null {
  const hasConfirmedTag = task.tags?.some(t => t?.name?.toLowerCase() === 'confirmed');
  if (hasConfirmedTag) return 'confirmed';
  const hasPlaceholderTag = task.tags?.some(t => t?.name?.toLowerCase() === 'placeholder');
  if (hasPlaceholderTag) return 'placeholder';
  const scheduleStatus = getCustomField(task, 'Schedule Status')?.toLowerCase();
  if (scheduleStatus?.includes('confirmed')) return 'confirmed';
  if (scheduleStatus?.includes('placeholder')) return 'placeholder';
  return null;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Priority Scoring Algorithm
function calculatePriorityScore(task: AsanaTask, now: Date): PriorityScore {
  let score = 0;
  const reasons: string[] = [];

  const taskDate = task.startOn || task.dueOn;
  const taskStatus = getTaskStatus(task);
  const modifiedDate = new Date(task.modifiedAt);

  // Time-based urgency (up to 40 points)
  if (taskDate) {
    const date = new Date(taskDate);
    const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      score += 40;
      reasons.push(`Overdue by ${Math.abs(daysUntil)} days`);
    } else if (daysUntil <= 3) {
      score += 35;
      reasons.push(`Due in ${daysUntil} days`);
    } else if (daysUntil <= 7) {
      score += 30;
      reasons.push('Due this week');
    } else if (daysUntil <= 14) {
      score += 15;
      reasons.push('Due in 2 weeks');
    }
  }

  // Status-based (up to 25 points)
  if (taskStatus === 'placeholder') {
    score += 20;
    reasons.push('Needs confirmation');
  }

  // Unassigned penalty (up to 15 points)
  if (!task.assignee) {
    score += 15;
    reasons.push('No assignee');
  }

  // Staleness penalty (up to 20 points)
  const daysSinceUpdate = Math.floor((now.getTime() - modifiedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceUpdate > 14) {
    score += 15;
    reasons.push(`Not updated in ${daysSinceUpdate} days`);
  } else if (daysSinceUpdate > 7) {
    score += 10;
    reasons.push('Stale (>7 days)');
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Categorize
  let category: 'critical' | 'high' | 'medium' | 'low';
  if (score >= 70) category = 'critical';
  else if (score >= 50) category = 'high';
  else if (score >= 30) category = 'medium';
  else category = 'low';

  return { taskId: task.gid, score, reasons, category };
}

// Colors
const COLORS = {
  confirmed: '#7FBA7A',
  placeholder: '#F1BD6C',
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#38BDF8',
  low: '#22C55E',
};

// Smart View Tab Button
function ViewTab({ view, activeView, onClick, label, count, icon }: {
  view: SmartView;
  activeView: SmartView;
  onClick: (view: SmartView) => void;
  label: string;
  count?: number;
  icon: React.ReactNode;
}) {
  const isActive = view === activeView;
  return (
    <button
      onClick={() => onClick(view)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 font-medium text-[13px] ${
        isActive
          ? 'bg-[#E16259]/20 text-[#E16259] border border-[#E16259]/30 shadow-[0_0_12px_rgba(225,98,89,0.15)]'
          : 'text-[#8FA3BF] hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className={isActive ? 'text-[#E16259]' : 'text-[#64748B]'}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#E16259]/30' : 'bg-white/10'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Priority Card Component
function PriorityCard({ task, priority, onClick }: {
  task: AsanaTask;
  priority: PriorityScore;
  onClick?: () => void;
}) {
  const taskStatus = getTaskStatus(task);
  const statusColor = taskStatus === 'confirmed' ? COLORS.confirmed : taskStatus === 'placeholder' ? COLORS.placeholder : '#64748B';
  const categoryColor = COLORS[priority.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: `0 12px 32px rgba(0,0,0,0.4), 0 0 20px ${categoryColor}20` }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="rounded-xl bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden cursor-pointer"
    >
      {/* Priority Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between" style={{ backgroundColor: `${categoryColor}10` }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor }} />
          <span className="text-[11px] font-semibold uppercase" style={{ color: categoryColor }}>
            {priority.category} Priority
          </span>
        </div>
        <span className="text-[11px] font-medium text-[#8FA3BF]">Score: {priority.score}/100</span>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="text-[14px] font-medium text-white mb-2">{task.name}</div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {taskStatus && (
            <span className="text-[10px] px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: statusColor }}>
              {taskStatus === 'confirmed' ? 'Confirmed' : 'Placeholder'}
            </span>
          )}
          {task.startOn && (
            <span className="text-[11px] text-[#8FA3BF] flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatShortDate(task.startOn)}
            </span>
          )}
          {task.assignee && (
            <span className="text-[11px] text-[#8FA3BF]">{task.assignee.name}</span>
          )}
        </div>

        {/* Reasons */}
        <div className="space-y-1">
          {priority.reasons.slice(0, 3).map((reason, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[11px] text-[#64748B]">
              <svg className="w-3 h-3" style={{ color: categoryColor }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {reason}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Collapsible Status Group
function StatusGroup({
  title,
  tasks,
  priorities,
  defaultExpanded = true
}: {
  title: string;
  tasks: AsanaTask[];
  priorities: Map<string, PriorityScore>;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const statusColor = title.includes('Confirm') ? COLORS.confirmed :
                      title.includes('Placeholder') ? COLORS.placeholder : '#64748B';

  return (
    <div className="rounded-xl bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between bg-[#0F1722] border-b border-white/[0.06] hover:bg-[#1E293B] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: statusColor }} />
          <span className="font-semibold text-[14px] text-white">{title}</span>
          <span className="text-[11px] text-[#8FA3BF] bg-white/5 px-2 py-0.5 rounded">
            {tasks.length} projects
          </span>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <svg className="w-5 h-5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="divide-y divide-white/[0.04]">
              {tasks.map((task, idx) => {
                const priority = priorities.get(task.gid);
                const taskStatus = getTaskStatus(task);

                return (
                  <div
                    key={task.gid}
                    className={`px-5 py-3 flex items-center gap-4 ${idx % 2 === 0 ? 'bg-[#0F1722]' : 'bg-[#151F2E]'} hover:bg-[#1E293B] transition-colors`}
                  >
                    {/* Priority Indicator */}
                    {priority && (
                      <div
                        className="w-1 h-8 rounded-full"
                        style={{ backgroundColor: COLORS[priority.category] }}
                        title={`Priority: ${priority.score}`}
                      />
                    )}

                    {/* Date */}
                    <div className="w-20 text-center">
                      <div className={`text-[13px] font-semibold ${task.startOn && new Date(task.startOn) < new Date() ? 'text-[#EF4444]' : 'text-white'}`}>
                        {formatShortDate(task.startOn || task.dueOn)}
                      </div>
                    </div>

                    {/* Task Name */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white truncate">{task.name}</div>
                      <div className="text-[10px] text-[#64748B]">{task.assignee?.name || 'Unassigned'}</div>
                    </div>

                    {/* Status Badge */}
                    {taskStatus && (
                      <span
                        className="text-[9px] px-2 py-1 rounded font-medium text-white"
                        style={{ backgroundColor: taskStatus === 'confirmed' ? COLORS.confirmed : COLORS.placeholder }}
                      >
                        {taskStatus === 'confirmed' ? 'Confirmed' : 'Placeholder'}
                      </span>
                    )}

                    {/* Region */}
                    {getCustomField(task, 'Region') && (
                      <span className="text-[10px] text-[#8FA3BF]">{getCustomField(task, 'Region')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main Component
export default function SmartProjectsTab({
  data,
  loading
}: {
  data: ProjectData | null;
  loading: boolean;
}) {
  const [activeView, setActiveView] = useState<SmartView>('needs_attention');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate priorities for all tasks
  const { priorities, needsAttentionTasks, thisWeekTasks, byStatusGroups, allTasks, stats } = useMemo(() => {
    if (!data) return {
      priorities: new Map<string, PriorityScore>(),
      needsAttentionTasks: [],
      thisWeekTasks: [],
      byStatusGroups: {},
      allTasks: [],
      stats: { needsAttention: 0, thisWeek: 0, confirmed: 0, placeholder: 0 }
    };

    const now = new Date();
    const priorities = new Map<string, PriorityScore>();
    const incompleteTasks = data.tasks.filter(t => !t.completed);

    // Calculate priorities
    incompleteTasks.forEach(task => {
      priorities.set(task.gid, calculatePriorityScore(task, now));
    });

    // Filter by search
    const filteredTasks = searchQuery
      ? incompleteTasks.filter(t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.assignee?.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : incompleteTasks;

    // Needs Attention: High priority tasks (score >= 50)
    const needsAttentionTasks = filteredTasks
      .filter(t => (priorities.get(t.gid)?.score || 0) >= 50)
      .sort((a, b) => (priorities.get(b.gid)?.score || 0) - (priorities.get(a.gid)?.score || 0));

    // This Week: Tasks due within 7 days
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thisWeekTasks = filteredTasks
      .filter(t => {
        const taskDate = t.startOn || t.dueOn;
        if (!taskDate) return false;
        const date = new Date(taskDate);
        return date >= now && date <= weekFromNow;
      })
      .sort((a, b) => {
        const dateA = new Date(a.startOn || a.dueOn || 0);
        const dateB = new Date(b.startOn || b.dueOn || 0);
        return dateA.getTime() - dateB.getTime();
      });

    // By Status Groups
    const confirmed: AsanaTask[] = [];
    const placeholder: AsanaTask[] = [];
    const other: AsanaTask[] = [];

    filteredTasks.forEach(task => {
      const status = getTaskStatus(task);
      if (status === 'confirmed') confirmed.push(task);
      else if (status === 'placeholder') placeholder.push(task);
      else other.push(task);
    });

    const byStatusGroups = {
      'Confirmed Projects': confirmed,
      'Placeholder (Tentative)': placeholder,
      'Other / Unclassified': other.length > 0 ? other : undefined,
    };

    // All tasks sorted by date
    const allTasks = [...filteredTasks].sort((a, b) => {
      const dateA = new Date(a.startOn || a.dueOn || '9999');
      const dateB = new Date(b.startOn || b.dueOn || '9999');
      return dateA.getTime() - dateB.getTime();
    });

    return {
      priorities,
      needsAttentionTasks,
      thisWeekTasks,
      byStatusGroups,
      allTasks,
      stats: {
        needsAttention: needsAttentionTasks.length,
        thisWeek: thisWeekTasks.length,
        confirmed: confirmed.length,
        placeholder: placeholder.length,
      }
    };
  }, [data, searchQuery]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#E16259]/20 border-t-[#E16259] rounded-full animate-spin mx-auto mb-4" />
          <div className="text-[#8FA3BF]">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2, boxShadow: '0 12px 32px rgba(0,0,0,0.4), 0 0 20px rgba(225,98,89,0.1)' }}
          className="relative overflow-hidden rounded-xl p-5 bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#E16259]" />
          <div className="text-[11px] font-medium text-[#64748B] mb-2">Active Projects</div>
          <div className="text-[28px] font-semibold text-white">{data.stats.incomplete}</div>
          <div className="text-[12px] text-[#8FA3BF] mt-1">In progress</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          whileHover={{ y: -2, boxShadow: '0 12px 32px rgba(0,0,0,0.4), 0 0 20px rgba(239,68,68,0.1)' }}
          onClick={() => setActiveView('needs_attention')}
          className="relative overflow-hidden rounded-xl p-5 bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#EF4444]" />
          <div className="text-[11px] font-medium text-[#64748B] mb-2">Needs Attention</div>
          <div className="text-[28px] font-semibold text-white">{stats.needsAttention}</div>
          <div className="text-[12px] text-[#8FA3BF] mt-1">High priority</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ y: -2, boxShadow: '0 12px 32px rgba(0,0,0,0.4), 0 0 20px rgba(56,189,248,0.1)' }}
          onClick={() => setActiveView('this_week')}
          className="relative overflow-hidden rounded-xl p-5 bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#38BDF8]" />
          <div className="text-[11px] font-medium text-[#64748B] mb-2">This Week</div>
          <div className="text-[28px] font-semibold text-white">{stats.thisWeek}</div>
          <div className="text-[12px] text-[#8FA3BF] mt-1">Upcoming</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ y: -2, boxShadow: `0 12px 32px rgba(0,0,0,0.4), 0 0 20px ${COLORS.confirmed}20` }}
          className="relative overflow-hidden rounded-xl p-5 bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: COLORS.confirmed }} />
          <div className="text-[11px] font-medium text-[#64748B] mb-2">Confirmed</div>
          <div className="text-[28px] font-semibold text-white">{stats.confirmed}</div>
          <div className="text-[12px] text-[#8FA3BF] mt-1">Ready to go</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ y: -2, boxShadow: `0 12px 32px rgba(0,0,0,0.4), 0 0 20px ${COLORS.placeholder}20` }}
          className="relative overflow-hidden rounded-xl p-5 bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: COLORS.placeholder }} />
          <div className="text-[11px] font-medium text-[#64748B] mb-2">Placeholder</div>
          <div className="text-[28px] font-semibold text-white">{stats.placeholder}</div>
          <div className="text-[12px] text-[#8FA3BF] mt-1">Tentative</div>
        </motion.div>
      </div>

      {/* Search + View Tabs */}
      <div className="flex items-center justify-between mb-6 p-4 rounded-xl bg-[#151F2E] border border-white/[0.06] shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
        <div className="flex items-center gap-2">
          <ViewTab
            view="needs_attention"
            activeView={activeView}
            onClick={setActiveView}
            label="Needs Attention"
            count={stats.needsAttention}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <ViewTab
            view="this_week"
            activeView={activeView}
            onClick={setActiveView}
            label="This Week"
            count={stats.thisWeek}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
          <ViewTab
            view="by_status"
            activeView={activeView}
            onClick={setActiveView}
            label="By Status"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
          <ViewTab
            view="all"
            activeView={activeView}
            onClick={setActiveView}
            label="All Projects"
            count={allTasks.length}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            }
          />
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 text-[13px] rounded-lg bg-[#0F1722] border border-white/[0.06] text-white placeholder:text-[#64748B] focus:outline-none focus:border-[#E16259]/50 focus:ring-1 focus:ring-[#E16259]/20 w-64"
          />
        </div>
      </div>

      {/* Content Views */}
      <AnimatePresence mode="wait">
        {/* Needs Attention View */}
        {activeView === 'needs_attention' && (
          <motion.div
            key="needs_attention"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {needsAttentionTasks.length === 0 ? (
              <div className="text-center py-16 rounded-xl bg-[#151F2E] border border-white/[0.06]">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#22C55E]/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-[16px] font-medium text-white mb-1">All caught up!</div>
                <div className="text-[13px] text-[#8FA3BF]">No high-priority projects need immediate attention</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {needsAttentionTasks.map((task, idx) => (
                  <motion.div
                    key={task.gid}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <PriorityCard task={task} priority={priorities.get(task.gid)!} />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* This Week View */}
        {activeView === 'this_week' && (
          <motion.div
            key="this_week"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {thisWeekTasks.length === 0 ? (
              <div className="text-center py-16 rounded-xl bg-[#151F2E] border border-white/[0.06]">
                <div className="text-[16px] font-medium text-white mb-1">No projects this week</div>
                <div className="text-[13px] text-[#8FA3BF]">Nothing scheduled for the next 7 days</div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden">
                <div className="px-5 py-3 bg-[#0F1722] border-b border-white/[0.06]">
                  <span className="font-semibold text-[14px] text-white">Projects Due This Week</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {thisWeekTasks.map((task, idx) => {
                    const priority = priorities.get(task.gid);
                    const taskStatus = getTaskStatus(task);

                    return (
                      <div
                        key={task.gid}
                        className={`px-5 py-3 flex items-center gap-4 ${idx % 2 === 0 ? 'bg-[#0F1722]' : 'bg-[#151F2E]'} hover:bg-[#1E293B] transition-colors`}
                      >
                        {priority && (
                          <div className="w-1 h-8 rounded-full" style={{ backgroundColor: COLORS[priority.category] }} />
                        )}
                        <div className="w-20 text-center">
                          <div className="text-[13px] font-semibold text-white">{formatShortDate(task.startOn || task.dueOn)}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-white truncate">{task.name}</div>
                          <div className="text-[10px] text-[#64748B]">{task.assignee?.name || 'Unassigned'}</div>
                        </div>
                        {taskStatus && (
                          <span
                            className="text-[9px] px-2 py-1 rounded font-medium text-white"
                            style={{ backgroundColor: taskStatus === 'confirmed' ? COLORS.confirmed : COLORS.placeholder }}
                          >
                            {taskStatus === 'confirmed' ? 'Confirmed' : 'Placeholder'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* By Status View */}
        {activeView === 'by_status' && (
          <motion.div
            key="by_status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {Object.entries(byStatusGroups).map(([title, tasks]) => {
              if (!tasks || tasks.length === 0) return null;
              return (
                <StatusGroup
                  key={title}
                  title={title}
                  tasks={tasks}
                  priorities={priorities}
                  defaultExpanded={title !== 'Other / Unclassified'}
                />
              );
            })}
          </motion.div>
        )}

        {/* All Projects View */}
        {activeView === 'all' && (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="rounded-xl bg-[#151F2E] border border-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="grid gap-4 px-5 py-2.5 text-[10px] font-medium text-[#64748B] uppercase border-b border-white/[0.06] bg-[#0F1722]" style={{ gridTemplateColumns: '60px 100px 2fr 100px 100px 80px' }}>
                <div>Priority</div>
                <div>Date</div>
                <div>Project Name</div>
                <div>Status</div>
                <div>Assignee</div>
                <div>Region</div>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {allTasks.map((task, idx) => {
                  const priority = priorities.get(task.gid);
                  const taskStatus = getTaskStatus(task);
                  const region = getCustomField(task, 'Region');

                  return (
                    <div
                      key={task.gid}
                      className={`grid gap-4 px-5 py-3 items-center border-b border-white/[0.04] ${idx % 2 === 0 ? 'bg-[#0F1722]' : 'bg-[#151F2E]'} hover:bg-[#1E293B] transition-colors`}
                      style={{ gridTemplateColumns: '60px 100px 2fr 100px 100px 80px' }}
                    >
                      {/* Priority */}
                      <div className="flex items-center gap-2">
                        {priority && (
                          <>
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[priority.category] }} />
                            <span className="text-[10px] text-[#8FA3BF]">{priority.score}</span>
                          </>
                        )}
                      </div>

                      {/* Date */}
                      <div className={`text-[12px] font-medium ${task.startOn && new Date(task.startOn) < new Date() ? 'text-[#EF4444]' : 'text-white'}`}>
                        {formatShortDate(task.startOn || task.dueOn)}
                      </div>

                      {/* Name */}
                      <div className="text-[13px] text-white truncate">{task.name}</div>

                      {/* Status */}
                      <div>
                        {taskStatus && (
                          <span
                            className="text-[9px] px-2 py-1 rounded font-medium text-white"
                            style={{ backgroundColor: taskStatus === 'confirmed' ? COLORS.confirmed : COLORS.placeholder }}
                          >
                            {taskStatus === 'confirmed' ? 'Confirmed' : 'Placeholder'}
                          </span>
                        )}
                      </div>

                      {/* Assignee */}
                      <div className="text-[11px] text-[#8FA3BF] truncate">{task.assignee?.name || '-'}</div>

                      {/* Region */}
                      <div className="text-[10px] text-[#64748B]">{region || '-'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
