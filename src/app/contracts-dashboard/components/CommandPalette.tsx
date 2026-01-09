'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
  category?: string;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  contracts?: Array<{
    id: string;
    salesforceId?: string;
    name: string;
    status: string;
    value: number;
  }>;
  onContractSelect?: (contractId: string) => void;
  placeholder?: string;
}

// Icons
const icons = {
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  task: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  filter: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  navigate: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  ),
  contract: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  external: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  refresh: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

/**
 * Linear-style Command Palette
 *
 * Features:
 * - Fuzzy search across commands and contracts
 * - Keyboard navigation (up/down arrows, enter to select)
 * - Categories with visual grouping
 * - Shortcut hints
 */
export default function CommandPalette({
  isOpen,
  onClose,
  commands,
  contracts = [],
  onContractSelect,
  placeholder = 'Type a command or search...',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter and combine results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();

    // Filter commands
    const filteredCommands = q
      ? commands.filter(cmd =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some(k => k.toLowerCase().includes(q)) ||
          cmd.category?.toLowerCase().includes(q)
        )
      : commands;

    // Filter contracts (only when searching)
    const filteredContracts = q && contracts.length > 0
      ? contracts
          .filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.salesforceId?.toLowerCase().includes(q) ||
            c.status.toLowerCase().includes(q)
          )
          .slice(0, 5) // Limit to 5 contracts
          .map(c => ({
            id: `contract-${c.id}`,
            label: c.name,
            description: `${c.status} - $${(c.value / 1000).toFixed(0)}K`,
            icon: icons.contract,
            category: 'Contracts',
            action: () => onContractSelect?.(c.id),
          }))
      : [];

    // Group by category
    const grouped: Record<string, CommandItem[]> = {};

    // Add contracts first if searching
    if (filteredContracts.length > 0) {
      grouped['Contracts'] = filteredContracts;
    }

    // Group commands
    filteredCommands.forEach(cmd => {
      const cat = cmd.category || 'Actions';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(cmd);
    });

    return grouped;
  }, [query, commands, contracts, onContractSelect]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    return Object.values(results).flat();
  }, [results]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatResults[selectedIndex]) {
            flatResults[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  let currentFlatIndex = -1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Palette */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="absolute top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl"
        >
          <div className="mx-4 bg-[#1A2332] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              <span className="text-[#64748B]">{icons.search}</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-white placeholder-[#64748B] text-[15px] outline-none"
              />
              <kbd className="px-2 py-0.5 text-[11px] font-medium text-[#64748B] bg-[#0B1220] rounded border border-white/[0.08]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[400px] overflow-y-auto py-2"
            >
              {Object.entries(results).length === 0 ? (
                <div className="px-4 py-8 text-center text-[#64748B]">
                  No results found
                </div>
              ) : (
                Object.entries(results).map(([category, items]) => (
                  <div key={category}>
                    {/* Category header */}
                    <div className="px-4 py-1.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      {category}
                    </div>

                    {/* Items */}
                    {items.map((item) => {
                      currentFlatIndex++;
                      const isSelected = currentFlatIndex === selectedIndex;

                      return (
                        <button
                          key={item.id}
                          data-selected={isSelected}
                          onClick={() => {
                            item.action();
                            onClose();
                          }}
                          onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-[#38BDF8]/10 text-white'
                              : 'text-[#A1B4C9] hover:bg-white/[0.03]'
                          }`}
                        >
                          {/* Icon */}
                          <span className={isSelected ? 'text-[#38BDF8]' : 'text-[#64748B]'}>
                            {item.icon || icons.navigate}
                          </span>

                          {/* Label & description */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{item.label}</div>
                            {item.description && (
                              <div className="text-[12px] text-[#64748B] truncate">
                                {item.description}
                              </div>
                            )}
                          </div>

                          {/* Shortcut */}
                          {item.shortcut && (
                            <kbd className="px-2 py-0.5 text-[11px] font-medium text-[#64748B] bg-[#0B1220] rounded border border-white/[0.08]">
                              {item.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-4 text-[11px] text-[#64748B]">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[#0B1220] rounded border border-white/[0.08]">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-[#0B1220] rounded border border-white/[0.08]">↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[#0B1220] rounded border border-white/[0.08]">↵</kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[#0B1220] rounded border border-white/[0.08]">ESC</kbd>
                Close
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Default commands for contracts dashboard
 */
export function getDefaultCommands(handlers: {
  createTask: () => void;
  filterOverdue: () => void;
  filterDue30: () => void;
  filterHighValue: () => void;
  clearFilters: () => void;
  goToPipeline: () => void;
  goToTasks: () => void;
  goToDocuments: () => void;
  refresh: () => void;
  exportData: () => void;
}): CommandItem[] {
  return [
    // Actions
    {
      id: 'create-task',
      label: 'Create Task',
      description: 'Add a new task to a contract',
      shortcut: 'T',
      icon: icons.task,
      category: 'Actions',
      keywords: ['add', 'new', 'task', 'todo'],
      action: handlers.createTask,
    },
    {
      id: 'refresh',
      label: 'Refresh Data',
      description: 'Sync latest data from Salesforce',
      shortcut: 'R',
      icon: icons.refresh,
      category: 'Actions',
      keywords: ['sync', 'reload', 'update'],
      action: handlers.refresh,
    },
    {
      id: 'export',
      label: 'Export Data',
      description: 'Download contracts as CSV',
      icon: icons.external,
      category: 'Actions',
      keywords: ['download', 'csv', 'excel'],
      action: handlers.exportData,
    },

    // Filters
    {
      id: 'filter-overdue',
      label: 'Show Overdue',
      description: 'Filter to contracts past due date',
      icon: icons.filter,
      category: 'Filters',
      keywords: ['late', 'past due', 'urgent'],
      action: handlers.filterOverdue,
    },
    {
      id: 'filter-due30',
      label: 'Show Due in 30 Days',
      description: 'Filter to contracts due soon',
      icon: icons.filter,
      category: 'Filters',
      keywords: ['upcoming', 'soon', 'deadline'],
      action: handlers.filterDue30,
    },
    {
      id: 'filter-high-value',
      label: 'Show High Value',
      description: 'Filter to contracts over $250K',
      icon: icons.filter,
      category: 'Filters',
      keywords: ['big', 'large', 'important'],
      action: handlers.filterHighValue,
    },
    {
      id: 'clear-filters',
      label: 'Clear Filters',
      description: 'Reset all filters',
      icon: icons.filter,
      category: 'Filters',
      keywords: ['reset', 'all', 'remove'],
      action: handlers.clearFilters,
    },

    // Navigation
    {
      id: 'go-pipeline',
      label: 'Go to Pipeline',
      description: 'View contract pipeline',
      shortcut: 'G P',
      icon: icons.navigate,
      category: 'Navigation',
      keywords: ['contracts', 'list', 'table'],
      action: handlers.goToPipeline,
    },
    {
      id: 'go-tasks',
      label: 'Go to Tasks',
      description: 'View all tasks',
      shortcut: 'G T',
      icon: icons.navigate,
      category: 'Navigation',
      keywords: ['todo', 'checklist'],
      action: handlers.goToTasks,
    },
    {
      id: 'go-documents',
      label: 'Go to Documents',
      description: 'View contract documents',
      shortcut: 'G D',
      icon: icons.navigate,
      category: 'Navigation',
      keywords: ['files', 'uploads'],
      action: handlers.goToDocuments,
    },
  ];
}
