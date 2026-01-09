'use client';

import { motion } from 'framer-motion';

interface TaskBadgeProps {
  total: number;
  pending: number;
  overdue?: number;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

/**
 * Task count badge for contract rows
 *
 * Shows:
 * - Total pending tasks count
 * - Overdue indicator if any tasks are past due
 * - Click to expand task view
 */
export default function TaskBadge({
  total,
  pending,
  overdue = 0,
  onClick,
  size = 'sm',
}: TaskBadgeProps) {
  if (total === 0) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#38BDF8] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <span>Add task</span>
      </button>
    );
  }

  const hasOverdue = overdue > 0;
  const allComplete = pending === 0;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium
        transition-colors cursor-pointer
        ${allComplete
          ? 'bg-[#22C55E]/10 text-[#22C55E]'
          : hasOverdue
            ? 'bg-[#EF4444]/10 text-[#EF4444]'
            : 'bg-[#38BDF8]/10 text-[#38BDF8]'
        }
      `}
    >
      {/* Icon */}
      {allComplete ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : hasOverdue ? (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </motion.div>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      )}

      {/* Count */}
      <span>
        {allComplete ? (
          'Done'
        ) : hasOverdue ? (
          `${overdue} overdue`
        ) : (
          `${pending} task${pending !== 1 ? 's' : ''}`
        )}
      </span>
    </motion.button>
  );
}

/**
 * Compact task indicator for tight spaces
 */
export function TaskIndicator({
  pending,
  overdue = 0,
}: {
  pending: number;
  overdue?: number;
}) {
  if (pending === 0) {
    return (
      <div className="w-2 h-2 rounded-full bg-[#22C55E]" title="All tasks complete" />
    );
  }

  if (overdue > 0) {
    return (
      <motion.div
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="w-2 h-2 rounded-full bg-[#EF4444]"
        title={`${overdue} overdue tasks`}
      />
    );
  }

  return (
    <div className="w-2 h-2 rounded-full bg-[#F59E0B]" title={`${pending} pending tasks`} />
  );
}
