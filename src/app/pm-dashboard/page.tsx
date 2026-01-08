'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/Sidebar';

type TabType = 'timeline' | 'mcc' | 'punchlist' | 'docusign';

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

interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  emailSubject: string;
  sentDateTime?: string;
  completedDateTime?: string;
  declinedDateTime?: string;
  statusChangedDateTime?: string;
  sender?: { userName: string; email: string };
}

interface DocuSignData {
  envelopes: DocuSignEnvelope[];
  stats: { total: number; completed: number; pending: number; declined: number; avgDaysToSign: number };
  isLive: boolean;
  authError?: string | null;
  lastUpdated: string;
}


// Helper functions
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCustomField(task: AsanaTask, fieldName: string): string | null {
  const field = task.customFields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
  return field?.value as string | null;
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isDueSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 7;
}

// Tab Button
function TabButton({ tab, activeTab, onClick, label, count, icon }: {
  tab: TabType; activeTab: TabType; onClick: (tab: TabType) => void; label: string; count?: number; icon: React.ReactNode;
}) {
  const isActive = tab === activeTab;
  return (
    <button onClick={() => onClick(tab)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium text-[13px] ${isActive ? 'bg-[#E16259]/20 text-[#E16259] border border-[#E16259]/30' : 'text-[#8FA3BF] hover:bg-white/5 hover:text-[#CBD5E1]'}`}>
      <span className={isActive ? 'text-[#E16259]' : 'text-[#64748B]'}>{icon}</span>
      {label}
      {count !== undefined && <span className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? 'bg-[#E16259]/20' : 'bg-white/5'}`}>{count}</span>}
    </button>
  );
}

// KPI Card
function KPICard({ title, value, subtitle, color }: { title: string; value: React.ReactNode; subtitle: string; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-xl p-4 bg-[#151F2E] border border-white/[0.04]">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: color }} />
      <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">{title}</div>
      <div className="text-[24px] font-semibold text-[#EAF2FF]">{value}</div>
      <div className="text-[11px] text-[#64748B]">{subtitle}</div>
    </motion.div>
  );
}

// Timeline Tab - Calendar focused view
function TimelineTab({ data, loading }: { data: ProjectData | null; loading: boolean }) {
  const [scheduleFilter, setScheduleFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'all'>('month');

  // Get unique schedule statuses
  const scheduleStatuses = useMemo(() => {
    if (!data) return [];
    const statuses = new Set<string>();
    data.tasks.forEach(t => {
      const status = getCustomField(t, 'Schedule Status');
      if (status) statuses.add(status);
    });
    return Array.from(statuses).sort();
  }, [data]);

  // Filter and group tasks by date
  const groupedByDate = useMemo(() => {
    if (!data) return {};

    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (dateRange) {
      case 'week':
        cutoffDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        cutoffDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        cutoffDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
    }

    let tasks = data.tasks.filter(t => !t.completed && (t.dueOn || t.startOn));

    // Filter by schedule status
    if (scheduleFilter !== 'all') {
      tasks = tasks.filter(t => getCustomField(t, 'Schedule Status') === scheduleFilter);
    }

    // Filter by date range
    if (cutoffDate) {
      tasks = tasks.filter(t => {
        const taskDate = t.startOn || t.dueOn;
        if (!taskDate) return false;
        const date = new Date(taskDate);
        return date >= now && date <= cutoffDate;
      });
    }

    // Sort by date
    tasks.sort((a, b) => {
      const dateA = new Date(a.startOn || a.dueOn || 0);
      const dateB = new Date(b.startOn || b.dueOn || 0);
      return dateA.getTime() - dateB.getTime();
    });

    // Group by week
    const groups: Record<string, AsanaTask[]> = {};
    tasks.forEach(task => {
      const taskDate = new Date(task.startOn || task.dueOn || 0);
      const weekStart = new Date(taskDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(task);
    });

    return groups;
  }, [data, scheduleFilter, dateRange]);

  if (loading || !data) {
    return <LoadingState />;
  }

  const tasksWithDates = data.tasks.filter(t => t.dueOn || t.startOn).length;

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <KPICard title="Total Projects" value={data.stats.total} subtitle={`${tasksWithDates} scheduled`} color="#E16259" />
        <KPICard title="This Week" value={Object.values(groupedByDate)[0]?.length || 0} subtitle="Upcoming" color="#38BDF8" />
        <KPICard title="Overdue" value={data.stats.overdue} subtitle="Need attention" color="#EF4444" />
        <KPICard title="Next 7 Days" value={data.stats.dueSoon} subtitle="Due soon" color="#F59E0B" />
        <KPICard title="Unassigned" value={data.stats.unassigned} subtitle="Need owner" color="#8B5CF6" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-[#111827] border border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#475569] uppercase">Date Range:</span>
          {(['week', 'month', 'quarter', 'all'] as const).map(range => (
            <button key={range} onClick={() => setDateRange(range)} className={`text-[11px] px-3 py-1.5 rounded-lg capitalize ${dateRange === range ? 'bg-[#E16259]/20 text-[#E16259] border border-[#E16259]/30' : 'bg-white/5 text-[#64748B] hover:text-white'}`}>
              {range === 'all' ? 'All Time' : range}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#475569] uppercase">Type:</span>
          <select value={scheduleFilter} onChange={e => setScheduleFilter(e.target.value)} className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white">
            <option value="all">All Types</option>
            {scheduleStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <span className="ml-auto text-[11px] text-[#64748B]">{Object.values(groupedByDate).flat().length} tasks</span>
      </div>

      {/* Calendar View by Week */}
      {Object.entries(groupedByDate).length === 0 ? (
        <div className="text-center py-12 text-[#64748B]">No scheduled tasks in this date range</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([week, tasks]) => (
            <div key={week} className="rounded-xl bg-[#111827] border border-white/[0.04] overflow-hidden">
              <div className="px-5 py-3 bg-[#0B1220] border-b border-white/[0.04] flex items-center justify-between">
                <span className="font-semibold text-[#EAF2FF] text-[13px]">Week of {week}</span>
                <span className="text-[10px] text-[#64748B]">{tasks.length} tasks</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {tasks.map((task, idx) => {
                  const scheduleStatus = getCustomField(task, 'Schedule Status');
                  const region = getCustomField(task, 'Region');
                  const overdue = isOverdue(task.dueOn);

                  return (
                    <div key={task.gid} className={`px-5 py-3 flex items-center gap-4 ${idx % 2 === 0 ? 'bg-[#131B28]' : 'bg-[#111827]'} hover:bg-[#1a2740] transition-colors`}>
                      {/* Date */}
                      <div className="w-20 text-center">
                        <div className={`text-[13px] font-semibold ${overdue ? 'text-[#EF4444]' : 'text-[#EAF2FF]'}`}>
                          {formatShortDate(task.startOn || task.dueOn)}
                        </div>
                        {task.startOn && task.dueOn && task.startOn !== task.dueOn && (
                          <div className="text-[9px] text-[#64748B]">to {formatShortDate(task.dueOn)}</div>
                        )}
                      </div>

                      {/* Task Name */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#EAF2FF] truncate">{task.name}</div>
                        <div className="text-[10px] text-[#64748B]">{task.assignee?.name || 'Unassigned'}</div>
                      </div>

                      {/* Schedule Status Badge */}
                      {scheduleStatus && (
                        <span className="text-[9px] px-2 py-1 rounded bg-[#E16259]/20 text-[#E16259]">{scheduleStatus}</span>
                      )}

                      {/* Region */}
                      {region && <span className="text-[10px] text-[#8FA3BF]">{region}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// MCC Status Tab - Date and status focused
function MCCStatusTab({ data, loading }: { data: ProjectData | null; loading: boolean }) {
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'region' | 'status'>('date');

  // Get unique values for filters
  const { regions, categories } = useMemo(() => {
    if (!data) return { regions: [], categories: [] };
    const r = new Set<string>();
    const c = new Set<string>();
    data.tasks.forEach(t => {
      const region = getCustomField(t, 'Region');
      const category = getCustomField(t, 'Catagory'); // Note: typo in Asana
      if (region) r.add(region);
      if (category) c.add(category);
    });
    return { regions: Array.from(r).sort(), categories: Array.from(c).sort() };
  }, [data]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    if (!data) return [];

    let tasks = [...data.tasks].filter(t => !t.completed);

    if (regionFilter !== 'all') {
      tasks = tasks.filter(t => getCustomField(t, 'Region') === regionFilter);
    }
    if (categoryFilter !== 'all') {
      tasks = tasks.filter(t => getCustomField(t, 'Catagory') === categoryFilter);
    }

    // Sort
    tasks.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          const dateA = new Date(a.startOn || a.dueOn || '9999');
          const dateB = new Date(b.startOn || b.dueOn || '9999');
          return dateA.getTime() - dateB.getTime();
        case 'region':
          return (getCustomField(a, 'Region') || '').localeCompare(getCustomField(b, 'Region') || '');
        case 'status':
          return (getCustomField(a, 'Schedule Status') || '').localeCompare(getCustomField(b, 'Schedule Status') || '');
        default:
          return 0;
      }
    });

    return tasks;
  }, [data, regionFilter, categoryFilter, sortBy]);

  if (loading || !data) {
    return <LoadingState />;
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard title="Active MCCs" value={data.stats.incomplete} subtitle="Scheduled" color="#38BDF8" />
        <KPICard title="Completed" value={data.stats.completed} subtitle="This period" color="#22C55E" />
        <KPICard title="Overdue" value={data.stats.overdue} subtitle="Past due date" color="#EF4444" />
        <KPICard title="This Month" value={filteredTasks.filter(t => {
          const d = new Date(t.startOn || t.dueOn || '');
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length} subtitle="Scheduled" color="#F59E0B" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-[#111827] border border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#475569] uppercase">Region:</span>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white">
            <option value="all">All Regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#475569] uppercase">Category:</span>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white">
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#475569] uppercase">Sort:</span>
          {(['date', 'region', 'status'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} className={`text-[11px] px-3 py-1.5 rounded-lg capitalize ${sortBy === s ? 'bg-[#E16259]/20 text-[#E16259] border border-[#E16259]/30' : 'bg-white/5 text-[#64748B] hover:text-white'}`}>{s}</button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-[#64748B]">{filteredTasks.length} MCCs</span>
      </div>

      {/* MCC Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.04] overflow-hidden">
        <div className="grid gap-4 px-5 py-2.5 text-[10px] font-semibold text-[#475569] uppercase tracking-wider border-b border-white/[0.04] bg-[#0B1220]" style={{ gridTemplateColumns: '100px 2fr 100px 100px 120px 100px' }}>
          <div>Dates</div>
          <div>MCC Name</div>
          <div>Region</div>
          <div>Category</div>
          <div>Status</div>
          <div>Sales Lead</div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {filteredTasks.map((task, idx) => {
            const region = getCustomField(task, 'Region');
            const category = getCustomField(task, 'Catagory');
            const status = getCustomField(task, 'Schedule Status');
            const salesLead = getCustomField(task, 'Sales Lead');
            const docuSign = getCustomField(task, 'DocuSign MCC');
            const overdue = isOverdue(task.dueOn);
            const dueSoon = isDueSoon(task.dueOn);

            return (
              <div key={task.gid} className={`grid gap-4 px-5 py-3 items-center border-b border-white/[0.03] ${idx % 2 === 0 ? 'bg-[#131B28]' : 'bg-[#111827]'} hover:bg-[#1a2740] transition-colors`} style={{ gridTemplateColumns: '100px 2fr 100px 100px 120px 100px' }}>
                {/* Dates */}
                <div>
                  <div className={`text-[12px] font-medium ${overdue ? 'text-[#EF4444]' : dueSoon ? 'text-[#F59E0B]' : 'text-[#EAF2FF]'}`}>
                    {formatShortDate(task.startOn)}
                  </div>
                  {task.dueOn && task.startOn !== task.dueOn && (
                    <div className="text-[9px] text-[#64748B]">to {formatShortDate(task.dueOn)}</div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <div className="text-[13px] text-[#EAF2FF] truncate">{task.name}</div>
                  {docuSign && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#FFD700]/20 text-[#FFD700] mt-1 inline-block">DocuSign: {docuSign}</span>}
                </div>

                {/* Region */}
                <div className="text-[11px] text-[#8FA3BF]">{region || '-'}</div>

                {/* Category */}
                <div className="text-[11px] text-[#8FA3BF]">{category || '-'}</div>

                {/* Status */}
                <div>
                  {status && <span className="text-[9px] px-2 py-1 rounded bg-[#38BDF8]/20 text-[#38BDF8]">{status}</span>}
                </div>

                {/* Sales Lead */}
                <div className="text-[11px] text-[#8FA3BF]">{salesLead || '-'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Punch List Tab
function PunchListTab({ data, loading }: { data: ProjectData | null; loading: boolean }) {
  const [showCompleted, setShowCompleted] = useState(false);

  const { groupedTasks, progress } = useMemo(() => {
    if (!data) return { groupedTasks: {}, progress: 0 };
    const tasks = showCompleted ? data.tasks : data.tasks.filter(t => !t.completed);
    const groups: Record<string, AsanaTask[]> = {};
    tasks.forEach(t => {
      const section = t.section || 'No Section';
      if (!groups[section]) groups[section] = [];
      groups[section].push(t);
    });
    const prog = data.stats.total > 0 ? Math.round((data.stats.completed / data.stats.total) * 100) : 0;
    return { groupedTasks: groups, progress: prog };
  }, [data, showCompleted]);

  if (loading || !data) {
    return <LoadingState />;
  }

  return (
    <div>
      {/* Progress Overview */}
      <div className="mb-6 p-6 rounded-xl bg-[#111827] border border-white/[0.04]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#EAF2FF]">Punch List Progress</h3>
            <p className="text-[11px] text-[#64748B]">{data.stats.completed} of {data.stats.total} items complete</p>
          </div>
          <div className="text-[32px] font-bold text-[#22C55E]">{progress}%</div>
        </div>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#38BDF8]" />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4 text-center">
          <div><div className="text-[20px] font-semibold text-[#EAF2FF]">{data.stats.total}</div><div className="text-[10px] text-[#64748B]">Total</div></div>
          <div><div className="text-[20px] font-semibold text-[#22C55E]">{data.stats.completed}</div><div className="text-[10px] text-[#64748B]">Done</div></div>
          <div><div className="text-[20px] font-semibold text-[#EF4444]">{data.stats.overdue}</div><div className="text-[10px] text-[#64748B]">Overdue</div></div>
          <div><div className="text-[20px] font-semibold text-[#8B5CF6]">{data.stats.unassigned}</div><div className="text-[10px] text-[#64748B]">Unassigned</div></div>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCompleted(!showCompleted)} className={`text-[11px] px-3 py-1.5 rounded-lg ${showCompleted ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-white/5 text-[#64748B] hover:text-white'}`}>
          {showCompleted ? 'Hide Completed' : 'Show Completed'}
        </button>
      </div>

      {/* Grouped Tasks */}
      {Object.entries(groupedTasks).map(([section, tasks]) => (
        <div key={section} className="mb-4 rounded-xl bg-[#111827] border border-white/[0.04] overflow-hidden">
          <div className="px-5 py-3 bg-[#0B1220] border-b border-white/[0.04] flex items-center justify-between">
            <span className="font-semibold text-[#EAF2FF] text-[13px]">{section}</span>
            <span className="text-[10px] text-[#64748B]">{tasks.filter(t => t.completed).length}/{tasks.length}</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {tasks.map((task, idx) => (
              <div key={task.gid} className={`px-5 py-3 flex items-center gap-4 ${idx % 2 === 0 ? 'bg-[#131B28]' : 'bg-[#111827]'}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${task.completed ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[#475569]'}`}>
                  {task.completed && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className={`flex-1 text-[13px] ${task.completed ? 'text-[#64748B] line-through' : 'text-[#EAF2FF]'}`}>{task.name}</div>
                <div className="text-[11px] text-[#8FA3BF]">{task.assignee?.name || <span className="text-[#475569]">Unassigned</span>}</div>
                <div className={`text-[11px] ${isOverdue(task.dueOn) ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>{formatShortDate(task.dueOn)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// DocuSign Tab - Project Acceptance
function DocuSignTab({ data, loading }: { data: DocuSignData | null; loading: boolean }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showVoided, setShowVoided] = useState<boolean>(false);

  const filteredEnvelopes = useMemo(() => {
    if (!data) return [];
    let envelopes = data.envelopes;

    // Filter out voided unless showVoided is true
    if (!showVoided) {
      envelopes = envelopes.filter(e => e.status !== 'voided');
    }

    if (statusFilter === 'all') return envelopes;
    if (statusFilter === 'pending') return envelopes.filter(e => ['sent', 'delivered', 'created'].includes(e.status));
    if (statusFilter === 'acceptance') return envelopes.filter(e => e.emailSubject?.toLowerCase().includes('acceptance'));
    return envelopes.filter(e => e.status === statusFilter);
  }, [data, statusFilter, showVoided]);

  const handleViewInDocuSign = async (envelopeId: string) => {
    try {
      const res = await fetch(`/api/docusign?action=viewUrl&envelopeId=${envelopeId}`);
      const data = await res.json();
      if (data.viewUrl) {
        window.open(data.viewUrl, '_blank');
      }
    } catch (error) {
      console.error('Error getting view URL:', error);
    }
  };

  const handleDownload = (envelopeId: string) => {
    // Direct download link
    window.open(`/api/docusign?action=download&envelopeId=${envelopeId}`, '_blank');
  };


  if (loading || !data) {
    return <LoadingState />;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': case 'signed': return '#22C55E';
      case 'sent': case 'delivered': return '#F59E0B';
      case 'created': return '#8B5CF6';
      case 'declined': case 'voided': return '#EF4444';
      default: return '#64748B';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Signed';
      case 'sent': return 'Awaiting';
      case 'delivered': return 'Opened';
      case 'created': return 'Draft';
      case 'declined': return 'Declined';
      case 'voided': return 'Voided';
      default: return status;
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <KPICard title="Total Sent" value={data.stats.total} subtitle="All time" color="#FFD700" />
        <KPICard title="Completed" value={data.stats.completed} subtitle="Signed" color="#22C55E" />
        <KPICard title="Pending" value={data.stats.pending} subtitle="Awaiting signature" color="#F59E0B" />
        <KPICard title="Declined" value={data.stats.declined} subtitle="Rejected" color="#EF4444" />
        <KPICard title="Avg Days" value={data.stats.avgDaysToSign} subtitle="To sign" color="#38BDF8" />
      </div>

      {/* Status indicator */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${data.isLive ? 'bg-[#22C55E]' : 'bg-[#F59E0B]'}`} />
        {data.isLive ? (
          <span className="text-[11px] text-[#22C55E]">Connected to DocuSign</span>
        ) : data.authError?.includes('consent') ? (
          <span className="text-[11px] text-[#F59E0B]">
            Consent required -{' '}
            <a
              href={data.authError.split('at: ')[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#FFD700]"
            >
              Click here to authorize DocuSign access
            </a>
          </span>
        ) : (
          <span className="text-[11px] text-[#64748B]">Using demo data</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-[11px] font-semibold text-[#475569] uppercase">Status:</span>
        {['all', 'pending', 'completed', 'declined', 'acceptance'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-[11px] px-3 py-1.5 rounded-lg capitalize ${statusFilter === s ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/30' : 'bg-white/5 text-[#64748B] hover:text-white'}`}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
        <label className="flex items-center gap-2 ml-4 cursor-pointer">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-[#475569] bg-transparent text-[#FFD700] focus:ring-[#FFD700]/50"
          />
          <span className="text-[11px] text-[#64748B]">Show voided</span>
        </label>
        <span className="ml-auto text-[11px] text-[#64748B]">{filteredEnvelopes.length} documents</span>
      </div>

      {/* Envelope List */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.04] overflow-hidden">
        <div className="grid gap-4 px-5 py-2.5 text-[10px] font-semibold text-[#475569] uppercase tracking-wider border-b border-white/[0.04] bg-[#0B1220]" style={{ gridTemplateColumns: '2fr 90px 100px 100px 80px 150px' }}>
          <div>Document</div>
          <div>Status</div>
          <div>Sent</div>
          <div>Completed</div>
          <div>Sender</div>
          <div>Actions</div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {filteredEnvelopes.map((envelope, idx) => {
            const color = getStatusColor(envelope.status);
            const label = getStatusLabel(envelope.status);

            return (
              <div key={envelope.envelopeId} className={`grid gap-4 px-5 py-3 items-center border-b border-white/[0.03] ${idx % 2 === 0 ? 'bg-[#131B28]' : 'bg-[#111827]'} hover:bg-[#1a2740] transition-colors`} style={{ gridTemplateColumns: '2fr 90px 100px 100px 80px 150px' }}>
                <div className="text-[13px] text-[#EAF2FF] truncate">{envelope.emailSubject}</div>
                <div>
                  <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ backgroundColor: `${color}20`, color }}>{label}</span>
                </div>
                <div className="text-[11px] text-[#8FA3BF]">{formatDate(envelope.sentDateTime || null)}</div>
                <div className="text-[11px] text-[#8FA3BF]">{formatDate(envelope.completedDateTime || envelope.declinedDateTime || null)}</div>
                <div className="text-[11px] text-[#8FA3BF]">{envelope.sender?.userName?.split(' ')[0] || '-'}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewInDocuSign(envelope.envelopeId)}
                    className="text-[10px] px-2 py-1 rounded bg-[#38BDF8]/10 text-[#38BDF8] hover:bg-[#38BDF8]/20 transition-colors"
                    title="View in DocuSign"
                  >
                    View
                  </button>
                  {['completed', 'signed'].includes(envelope.status) && (
                      <button
                        onClick={() => handleDownload(envelope.envelopeId)}
                        className="text-[10px] px-2 py-1 rounded bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20 transition-colors"
                        title="Download PDF"
                      >
                        PDF
                      </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Loading State
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#E16259]/20 border-t-[#E16259] rounded-full animate-spin mx-auto mb-4" />
        <div className="text-[#8FA3BF]">Loading data...</div>
      </div>
    </div>
  );
}

export default function PMDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [timelineData, setTimelineData] = useState<ProjectData | null>(null);
  const [mccData, setMccData] = useState<ProjectData | null>(null);
  const [punchlistData, setPunchlistData] = useState<ProjectData | null>(null);
  const [docusignData, setDocusignData] = useState<DocuSignData | null>(null);
  const [loading, setLoading] = useState({ timeline: true, mcc: true, punchlist: true, docusign: true });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const PROJECT_IDS = {
    timeline: '1201960046391431',
    mcc: '1201980443577645',
    punchlist: '1207232263537984',
  };

  async function fetchAsanaProject(projectId: string, type: 'timeline' | 'mcc' | 'punchlist') {
    try {
      setLoading(prev => ({ ...prev, [type]: true }));
      const response = await fetch(`/api/asana/tasks?projectId=${projectId}`);
      const result = await response.json();
      if (!result.error) {
        switch (type) {
          case 'timeline': setTimelineData(result); break;
          case 'mcc': setMccData(result); break;
          case 'punchlist': setPunchlistData(result); break;
        }
        setLastUpdated(result.lastUpdated);
      }
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  }

  async function fetchDocuSign() {
    try {
      setLoading(prev => ({ ...prev, docusign: true }));
      const response = await fetch('/api/docusign');
      const result = await response.json();
      if (!result.error) {
        setDocusignData(result);
      }
    } finally {
      setLoading(prev => ({ ...prev, docusign: false }));
    }
  }

  useEffect(() => {
    fetchAsanaProject(PROJECT_IDS.timeline, 'timeline');
    fetchAsanaProject(PROJECT_IDS.mcc, 'mcc');
    fetchAsanaProject(PROJECT_IDS.punchlist, 'punchlist');
    fetchDocuSign();
  }, []);

  const handleRefresh = () => {
    fetchAsanaProject(PROJECT_IDS.timeline, 'timeline');
    fetchAsanaProject(PROJECT_IDS.mcc, 'mcc');
    fetchAsanaProject(PROJECT_IDS.punchlist, 'punchlist');
    fetchDocuSign();
  };

  const isLoading = Object.values(loading).some(l => l);

  return (
    <div className="min-h-screen bg-[#0B1220]">
      <Sidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0F1722] via-[#0B1220] to-[#0B1220]" />

      <motion.div
        className="relative z-10 text-white"
        animate={{ marginLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Header */}
        <header className="border-b border-white/[0.04] bg-[#0B1220]/90 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-[#EAF2FF]">Project Management</h1>
                <p className="text-[11px] text-[#475569] mt-0.5">Asana + DocuSign Integration</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[11px] text-[#475569] flex items-center gap-2 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                    {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Loading...'}
                  </div>
                </div>
                <button onClick={handleRefresh} disabled={isLoading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                  <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 mt-4">
              <TabButton tab="timeline" activeTab={activeTab} onClick={setActiveTab} label="Master Timeline" count={timelineData?.stats.incomplete} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
              <TabButton tab="mcc" activeTab={activeTab} onClick={setActiveTab} label="MCC Status" count={mccData?.stats.incomplete} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} />
              <TabButton tab="punchlist" activeTab={activeTab} onClick={setActiveTab} label="Punch List" count={punchlistData?.stats.incomplete} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>} />
              <TabButton tab="docusign" activeTab={activeTab} onClick={setActiveTab} label="DocuSign" count={docusignData?.stats.pending} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
            </div>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
              {activeTab === 'timeline' && <TimelineTab data={timelineData} loading={loading.timeline} />}
              {activeTab === 'mcc' && <MCCStatusTab data={mccData} loading={loading.mcc} />}
              {activeTab === 'punchlist' && <PunchListTab data={punchlistData} loading={loading.punchlist} />}
              {activeTab === 'docusign' && <DocuSignTab data={docusignData} loading={loading.docusign} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}
