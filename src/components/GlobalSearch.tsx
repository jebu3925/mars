'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  type: 'contract' | 'document' | 'task';
  title: string;
  subtitle?: string;
  value?: number;
  status?: string;
  url?: string;
  matchedField?: string;
  documentType?: string;
  uploadedAt?: string;
  dueDate?: string;
}

interface SearchResults {
  contracts: SearchResult[];
  documents: SearchResult[];
  tasks: SearchResult[];
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  contract: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  task: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

const TYPE_COLORS: Record<string, string> = {
  contract: 'text-[#38BDF8]',
  document: 'text-[#A78BFA]',
  task: 'text-[#22C55E]',
};

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ contracts: [], documents: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeScope, setActiveScope] = useState<'all' | 'contracts' | 'documents' | 'tasks'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Flatten results for keyboard navigation
  const allResults = [
    ...results.contracts,
    ...results.documents,
    ...results.tasks,
  ];

  // Keyboard shortcut to open (Cmd+K or Ctrl+K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults({ contracts: [], documents: [], tasks: [] });
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search with debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ contracts: [], documents: [], tasks: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/contracts/search?q=${encodeURIComponent(query)}&scope=${activeScope}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data.results);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeScope]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(allResults[selectedIndex]);
    }
  }, [allResults, selectedIndex]);

  // Handle result selection
  const handleSelect = (result: SearchResult) => {
    setIsOpen(false);
    if (result.url) {
      if (result.url.startsWith('/')) {
        router.push(result.url);
      } else {
        window.open(result.url, '_blank');
      }
    }
  };

  // Scope tabs
  const scopes = [
    { id: 'all', label: 'All', count: allResults.length },
    { id: 'contracts', label: 'Contracts', count: results.contracts.length },
    { id: 'documents', label: 'Documents', count: results.documents.length },
    { id: 'tasks', label: 'Tasks', count: results.tasks.length },
  ] as const;

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#0B1220] border border-white/[0.08] rounded-lg text-[#64748B] hover:text-white hover:border-white/[0.15] transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/[0.05] rounded text-xs">
          <span className="text-[10px]">&#8984;</span>K
        </kbd>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            {/* Search Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.15 }}
              className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50"
            >
              <div className="bg-[#111827] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
                  <svg className="w-5 h-5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search contracts, documents, tasks..."
                    className="flex-1 bg-transparent text-white placeholder-[#64748B] focus:outline-none text-lg"
                  />
                  {loading && (
                    <div className="w-5 h-5 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
                  )}
                  <kbd className="px-2 py-1 bg-white/[0.05] rounded text-xs text-[#64748B]">ESC</kbd>
                </div>

                {/* Scope Tabs */}
                {query.length >= 2 && (
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.04]">
                    {scopes.map((scope) => (
                      <button
                        key={scope.id}
                        onClick={() => setActiveScope(scope.id)}
                        className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                          activeScope === scope.id
                            ? 'bg-[#38BDF8]/10 text-[#38BDF8]'
                            : 'text-[#64748B] hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {scope.label}
                        {scope.count > 0 && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-white/[0.1] rounded text-xs">
                            {scope.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Results */}
                <div className="max-h-[400px] overflow-y-auto">
                  {query.length < 2 ? (
                    <div className="p-8 text-center">
                      <p className="text-[#64748B]">Type at least 2 characters to search</p>
                      <div className="mt-4 flex items-center justify-center gap-6 text-sm text-[#64748B]">
                        <span className="flex items-center gap-2">
                          <kbd className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs">&#8593;&#8595;</kbd>
                          Navigate
                        </span>
                        <span className="flex items-center gap-2">
                          <kbd className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs">&#8629;</kbd>
                          Select
                        </span>
                        <span className="flex items-center gap-2">
                          <kbd className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs">ESC</kbd>
                          Close
                        </span>
                      </div>
                    </div>
                  ) : allResults.length === 0 && !loading ? (
                    <div className="p-8 text-center">
                      <p className="text-[#64748B]">No results found for "{query}"</p>
                    </div>
                  ) : (
                    <div className="py-2">
                      {/* Contracts */}
                      {results.contracts.length > 0 && (activeScope === 'all' || activeScope === 'contracts') && (
                        <div className="px-4 py-2">
                          <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-2">
                            Contracts ({results.contracts.length})
                          </p>
                          {results.contracts.map((result, idx) => {
                            const globalIndex = idx;
                            return (
                              <ResultItem
                                key={result.id}
                                result={result}
                                isSelected={selectedIndex === globalIndex}
                                onSelect={() => handleSelect(result)}
                                onHover={() => setSelectedIndex(globalIndex)}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Documents */}
                      {results.documents.length > 0 && (activeScope === 'all' || activeScope === 'documents') && (
                        <div className="px-4 py-2">
                          <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-2">
                            Documents ({results.documents.length})
                          </p>
                          {results.documents.map((result, idx) => {
                            const globalIndex = results.contracts.length + idx;
                            return (
                              <ResultItem
                                key={result.id}
                                result={result}
                                isSelected={selectedIndex === globalIndex}
                                onSelect={() => handleSelect(result)}
                                onHover={() => setSelectedIndex(globalIndex)}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Tasks */}
                      {results.tasks.length > 0 && (activeScope === 'all' || activeScope === 'tasks') && (
                        <div className="px-4 py-2">
                          <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-2">
                            Tasks ({results.tasks.length})
                          </p>
                          {results.tasks.map((result, idx) => {
                            const globalIndex = results.contracts.length + results.documents.length + idx;
                            return (
                              <ResultItem
                                key={result.id}
                                result={result}
                                isSelected={selectedIndex === globalIndex}
                                onSelect={() => handleSelect(result)}
                                onHover={() => setSelectedIndex(globalIndex)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-white/[0.04] bg-[#0B1220]/50">
                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span>
                      {allResults.length} result{allResults.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-white/[0.05] rounded">Tab</kbd>
                        Switch scope
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-white/[0.05] rounded">&#8984;K</kbd>
                        Toggle search
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Result Item Component
function ResultItem({
  result,
  isSelected,
  onSelect,
  onHover,
}: {
  result: SearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        isSelected ? 'bg-[#38BDF8]/10' : 'hover:bg-white/[0.04]'
      }`}
    >
      <div className={`flex-shrink-0 ${TYPE_COLORS[result.type]}`}>
        {TYPE_ICONS[result.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{result.title}</p>
        {result.subtitle && (
          <p className="text-[#64748B] text-sm truncate">{result.subtitle}</p>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        {result.value && (
          <p className="text-[#22C55E] text-sm font-medium">{formatCurrency(result.value)}</p>
        )}
        {result.status && (
          <p className="text-[#64748B] text-xs capitalize">{result.status.replace(/_/g, ' ')}</p>
        )}
        {result.documentType && (
          <p className="text-[#A78BFA] text-xs">{result.documentType}</p>
        )}
      </div>
      {isSelected && (
        <div className="flex-shrink-0 text-[#64748B]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      )}
    </button>
  );
}
