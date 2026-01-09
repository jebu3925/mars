'use client';

import { motion } from 'framer-motion';

// Contract pipeline stages in order
const STAGES = [
  { key: 'Discussions Not Started', short: 'DNS', color: '#64748B' },
  { key: 'Initial Agreement Development', short: 'IAD', color: '#38BDF8' },
  { key: 'Review & Redlines', short: 'R&R', color: '#F59E0B' },
  { key: 'Agreement Submission', short: 'SUB', color: '#A78BFA' },
  { key: 'Approval & Signature', short: 'A&S', color: '#EC4899' },
  { key: 'PO Received', short: 'PO', color: '#22C55E' },
];

interface StageProgressDotsProps {
  currentStage: string;
  size?: 'sm' | 'md';
  showLabels?: boolean;
  className?: string;
}

/**
 * Mini pipeline visualization showing contract progress through stages
 *
 * Displays a horizontal row of dots/circles:
 * - Filled = completed stages
 * - Current = highlighted with glow
 * - Future = outlined/dimmed
 */
export default function StageProgressDots({
  currentStage,
  size = 'sm',
  showLabels = false,
  className = '',
}: StageProgressDotsProps) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStage);
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const gapSize = size === 'sm' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`flex items-center ${gapSize} ${className}`}>
      {STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={stage.key} className="flex items-center gap-1">
            {/* Connector line (except for first) */}
            {index > 0 && (
              <div
                className={`h-[1px] transition-colors ${size === 'sm' ? 'w-1.5' : 'w-2'}`}
                style={{
                  backgroundColor: isCompleted || isCurrent ? stage.color : '#334155',
                  opacity: isFuture ? 0.3 : 1,
                }}
              />
            )}

            {/* Stage dot */}
            <div className="relative group">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: isCurrent ? Infinity : 0,
                  repeatType: 'loop',
                }}
                className={`${dotSize} rounded-full transition-all`}
                style={{
                  backgroundColor: isCompleted || isCurrent ? stage.color : 'transparent',
                  borderWidth: '1.5px',
                  borderColor: stage.color,
                  opacity: isFuture ? 0.3 : 1,
                  boxShadow: isCurrent ? `0 0 8px ${stage.color}60` : 'none',
                }}
              />

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1A2332] border border-white/[0.08] rounded text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {stage.short}
                {isCurrent && <span className="ml-1 text-[#38BDF8]">(Current)</span>}
              </div>
            </div>

            {/* Label (optional) */}
            {showLabels && (
              <span
                className={`text-[9px] font-medium uppercase tracking-wider ${
                  isCurrent ? 'text-white' : 'text-[#64748B]'
                }`}
              >
                {stage.short}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact version for table rows
 */
export function StageProgressCompact({
  currentStage,
  className = '',
}: {
  currentStage: string;
  className?: string;
}) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStage);
  const stage = STAGES[currentIndex] || STAGES[0];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Progress bar */}
      <div className="flex-1 h-1 bg-[#1E293B] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / STAGES.length) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: stage.color }}
        />
      </div>

      {/* Stage badge */}
      <span
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: `${stage.color}20`,
          color: stage.color,
        }}
      >
        {stage.short}
      </span>
    </div>
  );
}

/**
 * Get stage info helper
 */
export function getStageInfo(stageName: string) {
  const stage = STAGES.find(s => s.key === stageName);
  const index = STAGES.findIndex(s => s.key === stageName);

  return {
    stage: stage || STAGES[0],
    index: index === -1 ? 0 : index,
    total: STAGES.length,
    progress: index === -1 ? 0 : ((index + 1) / STAGES.length) * 100,
    isFirst: index === 0,
    isLast: index === STAGES.length - 1,
  };
}
