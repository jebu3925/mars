'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task } from '@/lib/supabase';

interface Contract {
  id: string;
  salesforceId?: string;
  name: string;
  status: string;
}

type ViewMode = 'byContract' | 'list' | 'board';
type FilterMode = 'all' | 'overdue' | 'pending' | 'completed' | 'myTasks';

interface TasksTabProps {
  contracts: Contract[];
}

/**
 * Tasks Tab Component - Supabase Backend
 *
 * Features:
 * - View by contract, list, or kanban board
 * - Quick filters (all, overdue, pending, completed)
 * - Inline task creation and editing
 * - Auto-generated task indicators
 */
export default function TasksTabSupabase({ contracts }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('byContract');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState<{
    title: string;
    contractSalesforceId: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  }>({
    title: '',
    contractSalesforceId: '',
    dueDate: '',
    priority: 'medium',
  });

  // Fetch tasks from Supabase
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Task KPIs
  const taskKpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalActive = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
    const overdue = tasks.filter(t => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.due_date) return false;
      return new Date(t.due_date) < today;
    }).length;
    const dueSoon = tasks.filter(t => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.due_date) return false;
      const due = new Date(t.due_date);
      return due >= today && due <= tomorrow;
    }).length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { totalActive, overdue, dueSoon, completed, progressPercent, total };
  }, [tasks]);

  // Group tasks by contract
  const tasksByContract = useMemo(() => {
    const grouped = new Map<string, Task[]>();

    tasks.forEach(task => {
      const key = task.contract_name || 'Unassigned';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(task);
    });

    return Array.from(grouped.entries())
      .map(([contractName, contractTasks]) => ({
        contractName,
        tasks: contractTasks,
        overdueCount: contractTasks.filter(t =>
          t.status !== 'completed' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date) < new Date()
        ).length,
        activeCount: contractTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length,
        totalCount: contractTasks.length,
      }))
      .sort((a, b) => b.overdueCount - a.overdueCount || b.activeCount - a.activeCount);
  }, [tasks]);

  // Group tasks by status for board view
  const tasksByStatus = useMemo(() => ({
    pending: tasks.filter(t => t.status === 'pending'),
    inProgress: tasks.filter(t => t.status === 'in_progress'),
    completed: tasks.filter(t => t.status === 'completed'),
  }), [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filter === 'all') return true;
      if (filter === 'overdue') {
        return task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';
      }
      if (filter === 'pending') return task.status === 'pending' || task.status === 'in_progress';
      if (filter === 'completed') return task.status === 'completed';
      return true;
    });
  }, [tasks, filter]);

  // Handlers
  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;

    const contract = contracts.find(c => c.salesforceId === newTask.contractSalesforceId);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title,
          contract_salesforce_id: newTask.contractSalesforceId || undefined,
          contract_name: contract?.name,
          due_date: newTask.dueDate || undefined,
          priority: newTask.priority,
          status: 'pending',
          is_auto_generated: false,
        }),
      });

      if (response.ok) {
        await fetchTasks();
        setNewTask({ title: '', contractSalesforceId: '', dueDate: '', priority: 'medium' });
        setShowAddTask(false);
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask?.id) return;

    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTask.id,
          title: editingTask.title,
          status: editingTask.status,
          priority: editingTask.priority,
          due_date: editingTask.due_date,
        }),
      });

      if (response.ok) {
        await fetchTasks();
        setEditingTask(null);
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const toggleTaskStatus = async (taskId: string, newStatus: 'pending' | 'completed') => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      await fetchTasks();
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const toggleContractExpanded = (contractName: string) => {
    const newExpanded = new Set(expandedContracts);
    if (newExpanded.has(contractName)) {
      newExpanded.delete(contractName);
    } else {
      newExpanded.add(contractName);
    }
    setExpandedContracts(newExpanded);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Task Row Component
  const TaskRow = ({ task, showContract = false, index = 0 }: { task: Task; showContract?: boolean; index?: number }) => {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';
    const isCompleted = task.status === 'completed';

    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10, height: 0 }}
        transition={{ delay: index * 0.03, duration: 0.2 }}
        whileHover={{ scale: 1.005, transition: { duration: 0.1 } }}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
          isCompleted ? 'bg-[#0B1220]/30 border-white/[0.02] opacity-50' :
          isOverdue ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' :
          'bg-[#0B1220] border-white/[0.04] hover:border-[#38BDF8]/30 hover:bg-[#0B1220]/80'
        }`}
      >
        {/* Checkbox */}
        <motion.button
          onClick={() => toggleTaskStatus(task.id!, isCompleted ? 'pending' : 'completed')}
          whileTap={{ scale: 0.9 }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            isCompleted ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[#475569] hover:border-[#38BDF8] hover:shadow-[0_0_8px_rgba(56,189,248,0.3)]'
          }`}
        >
          {isCompleted && (
            <motion.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </motion.svg>
          )}
        </motion.button>

        {/* Task content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium transition-all ${isCompleted ? 'text-[#64748B] line-through' : 'text-white'}`}>
              {task.title}
            </p>
            {task.is_auto_generated && (
              <span className="text-[9px] px-1.5 py-0.5 bg-[#38BDF8]/10 text-[#38BDF8] rounded font-medium">
                AUTO
              </span>
            )}
          </div>
          {showContract && task.contract_name && (
            <p className="text-[#38BDF8] text-xs truncate">{task.contract_name}</p>
          )}
        </div>

        {/* Due date */}
        {task.due_date && (
          <div className={`text-xs flex-shrink-0 flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-[#64748B]'}`}>
            {isOverdue && (
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                ⚠
              </motion.span>
            )}
            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}

        {/* Priority badge */}
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0 font-medium ${
          task.priority === 'urgent' ? 'bg-red-500/15 text-red-400' :
          task.priority === 'high' ? 'bg-orange-500/15 text-orange-400' :
          task.priority === 'medium' ? 'bg-amber-500/15 text-amber-400' :
          'bg-[#475569]/20 text-[#64748B]'
        }`}>
          {task.priority}
        </span>

        {/* Edit button */}
        <motion.button
          onClick={() => setEditingTask(task)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="p-1.5 rounded-lg hover:bg-white/10 text-[#64748B] hover:text-white transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </motion.button>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Task Summary KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111827] rounded-xl border border-white/[0.04] p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wider">Task Overview</h2>
          <div className="text-xs text-[#64748B]">{taskKpis.total} total tasks</div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active', value: taskKpis.totalActive, color: 'text-white', bgColor: 'bg-[#0B1220]', borderColor: 'border-white/[0.04]' },
            { label: 'Overdue', value: taskKpis.overdue, color: taskKpis.overdue > 0 ? 'text-red-400' : 'text-white', bgColor: taskKpis.overdue > 0 ? 'bg-red-500/10' : 'bg-[#0B1220]', borderColor: taskKpis.overdue > 0 ? 'border-red-500/20' : 'border-white/[0.04]' },
            { label: 'Due Today', value: taskKpis.dueSoon, color: taskKpis.dueSoon > 0 ? 'text-amber-400' : 'text-white', bgColor: taskKpis.dueSoon > 0 ? 'bg-amber-500/10' : 'bg-[#0B1220]', borderColor: taskKpis.dueSoon > 0 ? 'border-amber-500/20' : 'border-white/[0.04]' },
            { label: 'Completed', value: taskKpis.completed, color: 'text-[#22C55E]', bgColor: 'bg-[#0B1220]', borderColor: 'border-white/[0.04]' },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
              className={`${kpi.bgColor} rounded-lg p-4 border ${kpi.borderColor}`}
            >
              <div className={`text-3xl font-bold mb-1 ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs uppercase tracking-wider text-[#64748B]">{kpi.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[#64748B]">Completion Progress</span>
            <span className="text-white font-medium">{taskKpis.progressPercent}%</span>
          </div>
          <div className="h-2 bg-[#0B1220] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${taskKpis.progressPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-[#22C55E] to-[#38BDF8] rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* View Toggle & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-[#0B1220] rounded-lg p-1 border border-white/[0.04]">
          {[
            { key: 'byContract', label: 'By Contract', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
            { key: 'list', label: 'List', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
            { key: 'board', label: 'Board', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
          ].map(view => (
            <button
              key={view.key}
              onClick={() => setViewMode(view.key as ViewMode)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === view.key
                  ? 'bg-[#38BDF8]/20 text-[#38BDF8]'
                  : 'text-[#64748B] hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={view.icon} />
              </svg>
              {view.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {viewMode === 'list' && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterMode)}
              className="bg-[#0B1220] border border-white/[0.04] rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="all">All Tasks</option>
              <option value="overdue">Overdue</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          )}
          <button
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#38BDF8] text-[#0B1220] font-medium text-sm rounded-lg hover:bg-[#38BDF8]/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      {/* Add Task Form */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#111827] rounded-xl border border-white/[0.04] p-6"
          >
            <h3 className="text-sm font-semibold text-white mb-4">New Task</h3>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Task title..."
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="col-span-2 bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm placeholder-[#475569]"
                autoFocus
              />
              <select
                value={newTask.contractSalesforceId}
                onChange={(e) => setNewTask({ ...newTask, contractSalesforceId: e.target.value })}
                className="bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
              >
                <option value="">Link to contract...</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.salesforceId}>{c.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
              />
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent' })}
                className="bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setShowAddTask(false)} className="px-4 py-2 text-[#64748B] hover:text-white text-sm font-medium transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddTask} className="px-6 py-2 bg-[#22C55E] text-white font-medium text-sm rounded-lg hover:bg-[#22C55E]/90 transition-colors">
                  Create Task
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setEditingTask(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111827] rounded-xl border border-white/[0.08] p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4">Edit Task</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[#64748B] text-xs uppercase tracking-wider mb-2">Title</label>
                  <input
                    type="text"
                    value={editingTask.title}
                    onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                    className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[#64748B] text-xs uppercase tracking-wider mb-2">Contract</label>
                  <div className="bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-[#38BDF8] text-sm">
                    {editingTask.contract_name || 'No contract linked'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#64748B] text-xs uppercase tracking-wider mb-2">Due Date</label>
                    <input
                      type="date"
                      value={editingTask.due_date || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                      className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[#64748B] text-xs uppercase tracking-wider mb-2">Status</label>
                    <select
                      value={editingTask.status}
                      onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value as Task['status'] })}
                      className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[#64748B] text-xs uppercase tracking-wider mb-2">Priority</label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as Task['priority'] })}
                    className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setEditingTask(null)} className="px-4 py-2 text-[#64748B] hover:text-white text-sm font-medium transition-colors">
                  Cancel
                </button>
                <button onClick={handleUpdateTask} className="px-6 py-2 bg-[#38BDF8] text-[#0B1220] font-medium text-sm rounded-lg hover:bg-[#38BDF8]/90 transition-colors">
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Views */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#111827] rounded-xl border border-white/[0.04] overflow-hidden"
      >
        {/* By Contract View */}
        {viewMode === 'byContract' && (
          <div className="divide-y divide-white/[0.04]">
            {tasksByContract.length > 0 ? (
              tasksByContract.map(({ contractName, tasks: contractTasks, overdueCount, activeCount, totalCount }) => (
                <div key={contractName}>
                  <button
                    onClick={() => toggleContractExpanded(contractName)}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 text-[#64748B] transition-transform ${expandedContracts.has(contractName) ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium text-white flex-1 text-left">{contractName}</span>
                    <div className="flex items-center gap-3">
                      {overdueCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                          ⚠ {overdueCount}
                        </span>
                      )}
                      <span className="text-xs text-[#64748B] bg-white/[0.04] px-2 py-1 rounded">
                        {activeCount} active / {totalCount} total
                      </span>
                    </div>
                  </button>
                  <AnimatePresence>
                    {expandedContracts.has(contractName) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-4 space-y-2 pl-12">
                          {contractTasks.map((task, idx) => (
                            <TaskRow key={task.id} task={task} index={idx} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            ) : (
              <div className="text-center py-16 text-[#475569]">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <p className="text-sm">No tasks yet</p>
                <p className="text-xs mt-1">Click "Add Task" to create your first task</p>
              </div>
            )}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="p-6 space-y-2">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task, idx) => (
                <TaskRow key={task.id} task={task} showContract index={idx} />
              ))
            ) : (
              <div className="text-center py-12 text-[#475569]">
                <p className="text-sm">No tasks found</p>
              </div>
            )}
          </div>
        )}

        {/* Board View (Kanban) */}
        {viewMode === 'board' && (
          <div className="grid grid-cols-3 divide-x divide-white/[0.04]">
            {[
              { key: 'pending', title: 'To Do', tasks: tasksByStatus.pending, color: '#64748B' },
              { key: 'inProgress', title: 'In Progress', tasks: tasksByStatus.inProgress, color: '#38BDF8' },
              { key: 'completed', title: 'Done', tasks: tasksByStatus.completed, color: '#22C55E' },
            ].map((column) => (
              <div key={column.key} className="min-h-[400px]">
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2 sticky top-0 bg-[#111827] z-10">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }} />
                  <span className="text-sm font-medium text-white">{column.title}</span>
                  <span className="text-xs text-[#64748B] bg-white/[0.04] px-1.5 py-0.5 rounded">
                    {column.tasks.length}
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {column.tasks.map((task, idx) => {
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

                    return (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        whileHover={{ scale: 1.02 }}
                        className={`p-3 rounded-lg border bg-[#0B1220] cursor-pointer ${
                          isOverdue ? 'border-red-500/30' : 'border-white/[0.04]'
                        }`}
                        onClick={() => setEditingTask(task)}
                      >
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-white font-medium flex-1">{task.title}</p>
                          {task.is_auto_generated && (
                            <span className="text-[8px] px-1 py-0.5 bg-[#38BDF8]/10 text-[#38BDF8] rounded flex-shrink-0">
                              AUTO
                            </span>
                          )}
                        </div>
                        {task.contract_name && (
                          <p className="text-xs text-[#38BDF8] mt-1 truncate">{task.contract_name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {task.due_date && (
                            <span className={`text-[10px] ${isOverdue ? 'text-red-400' : 'text-[#64748B]'}`}>
                              {isOverdue && '⚠ '}
                              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                            task.priority === 'urgent' ? 'bg-red-500/15 text-red-400' :
                            task.priority === 'high' ? 'bg-orange-500/15 text-orange-400' :
                            task.priority === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                            'bg-[#475569]/20 text-[#64748B]'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                  {column.tasks.length === 0 && (
                    <div className="text-center py-8 text-[#475569] text-xs">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
