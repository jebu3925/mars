'use client';

import { useEffect, useCallback, useRef } from 'react';

export interface ShortcutAction {
  key: string;
  description: string;
  action: () => void;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  // For sequence shortcuts like G+P (go to pipeline)
  sequence?: string[];
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  onCommandPalette?: () => void;
}

/**
 * Linear-style keyboard shortcuts hook
 *
 * Supports:
 * - Single key shortcuts (T, /, J, K)
 * - Modifier shortcuts (Cmd+K, Ctrl+K)
 * - Sequence shortcuts (G then P for "Go to Pipeline")
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutAction[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, onCommandPalette } = options;

  // Track sequence state (for G+P, G+T style shortcuts)
  const sequenceBufferRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    const isEditable = target.isContentEditable;

    if (isInput || isEditable) {
      // Allow Escape to blur inputs
      if (event.key === 'Escape') {
        target.blur();
      }
      return;
    }

    // Command palette trigger (Cmd+K / Ctrl+K)
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      onCommandPalette?.();
      return;
    }

    // Check for modifier-based shortcuts first
    const modifierShortcut = shortcuts.find(s => {
      const needsCtrl = s.ctrl || s.meta;
      const hasCtrl = event.ctrlKey || event.metaKey;
      const needsShift = s.shift;
      const hasShift = event.shiftKey;

      if (needsCtrl && !hasCtrl) return false;
      if (needsShift && !hasShift) return false;
      if (!needsCtrl && !needsShift && (hasCtrl || hasShift)) return false;

      return s.key.toLowerCase() === event.key.toLowerCase() && !s.sequence;
    });

    if (modifierShortcut) {
      event.preventDefault();
      modifierShortcut.action();
      return;
    }

    // Handle sequence shortcuts (like G+P)
    const key = event.key.toLowerCase();

    // Clear sequence buffer after timeout
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }
    sequenceTimeoutRef.current = setTimeout(() => {
      sequenceBufferRef.current = [];
    }, 500); // 500ms window for sequence

    // Add key to buffer
    sequenceBufferRef.current.push(key);

    // Check for sequence matches
    const sequenceShortcut = shortcuts.find(s => {
      if (!s.sequence) return false;
      const buffer = sequenceBufferRef.current;
      if (buffer.length !== s.sequence.length) return false;
      return s.sequence.every((k, i) => k.toLowerCase() === buffer[i]);
    });

    if (sequenceShortcut) {
      event.preventDefault();
      sequenceBufferRef.current = [];
      sequenceShortcut.action();
      return;
    }

    // Check for single-key shortcuts (no modifiers, not in a sequence)
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      const singleKeyShortcut = shortcuts.find(s =>
        !s.ctrl && !s.meta && !s.shift && !s.sequence &&
        s.key.toLowerCase() === key
      );

      if (singleKeyShortcut) {
        // Don't prevent default for navigation keys that might be in a sequence
        if (sequenceBufferRef.current.length === 1 && key !== 'g') {
          event.preventDefault();
          singleKeyShortcut.action();
          sequenceBufferRef.current = [];
        }
      }
    }
  }, [shortcuts, enabled, onCommandPalette]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  return {
    clearSequence: () => {
      sequenceBufferRef.current = [];
    },
  };
}

/**
 * Format shortcut for display
 */
export function formatShortcut(shortcut: ShortcutAction): string {
  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    // Use Cmd on Mac, Ctrl on others
    parts.push(typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push('⇧');
  }

  if (shortcut.sequence) {
    return shortcut.sequence.map(k => k.toUpperCase()).join(' then ');
  }

  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}

/**
 * Default shortcuts for the contracts dashboard
 */
export function getDefaultShortcuts(handlers: {
  openCommandPalette: () => void;
  createTask: () => void;
  focusSearch: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  expandContract: () => void;
  goToPipeline: () => void;
  goToTasks: () => void;
  goToDocuments: () => void;
  openInSalesforce: () => void;
  toggleFilters: () => void;
  refresh: () => void;
}): ShortcutAction[] {
  return [
    // Command palette
    {
      key: 'k',
      meta: true,
      description: 'Open command palette',
      action: handlers.openCommandPalette,
    },
    // Quick actions
    {
      key: 't',
      description: 'Create new task',
      action: handlers.createTask,
    },
    {
      key: '/',
      description: 'Focus search',
      action: handlers.focusSearch,
    },
    {
      key: 'f',
      description: 'Toggle filters',
      action: handlers.toggleFilters,
    },
    {
      key: 'r',
      description: 'Refresh data',
      action: handlers.refresh,
    },
    // Vim-style navigation
    {
      key: 'j',
      description: 'Navigate down',
      action: handlers.navigateDown,
    },
    {
      key: 'k',
      description: 'Navigate up',
      action: handlers.navigateUp,
    },
    {
      key: 'Enter',
      description: 'Expand selected contract',
      action: handlers.expandContract,
    },
    // Go to sequences
    {
      key: 'p',
      sequence: ['g', 'p'],
      description: 'Go to Pipeline view',
      action: handlers.goToPipeline,
    },
    {
      key: 't',
      sequence: ['g', 't'],
      description: 'Go to Tasks view',
      action: handlers.goToTasks,
    },
    {
      key: 'd',
      sequence: ['g', 'd'],
      description: 'Go to Documents view',
      action: handlers.goToDocuments,
    },
    // External
    {
      key: 'o',
      description: 'Open in Salesforce',
      action: handlers.openInSalesforce,
    },
  ];
}
