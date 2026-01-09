'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

interface Contract {
  id: string;
  name: string;
  status: string;
  value: number;
  contractType: string[];
}

interface ReviewResult {
  redlinedText: string;
  originalText: string;
  modifiedText: string;
  summary: string[];
  timestamp: string;
}

interface ReviewHistory {
  id: string;
  contractId: string;
  contractName: string;
  provisionName: string;
  createdAt: string;
  status: 'draft' | 'sent_to_boss' | 'sent_to_client' | 'approved';
}

// Types for document comparison
interface CompareChange {
  id: number;
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

interface CompareStats {
  totalChanges: number;
  deletions: number;
  insertions: number;
  originalLength: number;
  revisedLength: number;
  characterChanges: number;
}

interface CompareSection {
  section: string;
  changes: CompareChange[];
}

interface CompareResult {
  changes: CompareChange[];
  stats: CompareStats;
  sections: CompareSection[];
  normalizedOriginal: string;
  normalizedRevised: string;
}

interface CategorizedChange extends CompareChange {
  category?: 'substantive' | 'formatting' | 'minor';
  explanation?: string;
}

// Models for contract review via OpenRouter - legal-grade only
const MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', desc: 'Best quality (Recommended)' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', desc: 'Proven, slightly faster' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'Reliable alternative' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: 'Budget reasoning model' },
];

export default function ContractReviewPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>('');
  const [contractSearch, setContractSearch] = useState('');
  const [showContractDropdown, setShowContractDropdown] = useState(false);
  const [provisionName, setProvisionName] = useState('');
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'paste' | 'upload' | 'compare'>('paste');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [originalDocxBuffer, setOriginalDocxBuffer] = useState<string | null>(null);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [isGeneratingOriginal, setIsGeneratingOriginal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('anthropic/claude-sonnet-4');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contractDropdownRef = useRef<HTMLDivElement>(null);

  // Compare Documents state
  const [compareOriginalFile, setCompareOriginalFile] = useState<File | null>(null);
  const [compareRevisedFile, setCompareRevisedFile] = useState<File | null>(null);
  const [compareOriginalText, setCompareOriginalText] = useState<string | null>(null);
  const [compareRevisedText, setCompareRevisedText] = useState<string | null>(null);
  const [isExtractingOriginal, setIsExtractingOriginal] = useState(false);
  const [isExtractingRevised, setIsExtractingRevised] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [showSectionGrouping, setShowSectionGrouping] = useState(true);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categorizedChanges, setCategorizedChanges] = useState<CategorizedChange[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'substantive' | 'formatting' | 'minor'>('all');

  // Analysis comparison state (for showing diff after AI analysis)
  const [showAnalysisComparison, setShowAnalysisComparison] = useState(false);
  const [analysisCompareResult, setAnalysisCompareResult] = useState<CompareResult | null>(null);
  const [isComparingAnalysis, setIsComparingAnalysis] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contractDropdownRef.current && !contractDropdownRef.current.contains(event.target as Node)) {
        setShowContractDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch contracts on mount
  useEffect(() => {
    fetchContracts();
  }, []);

  async function fetchContracts() {
    try {
      const response = await fetch('/api/contracts');
      if (response.ok) {
        const data = await response.json();
        setContracts(data.contracts || []);
      }
    } catch (err) {
      console.error('Failed to fetch contracts:', err);
    }
  }

  async function handleAnalyze() {
    const textToAnalyze = activeTab === 'paste' ? inputText : extractedText;

    if (!textToAnalyze?.trim()) {
      setError('Please enter or upload contract text to analyze');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/contracts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToAnalyze,
          contractId: selectedContract || undefined,
          provisionName: provisionName || undefined,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      setResult({
        redlinedText: data.redlinedText,
        originalText: data.originalText,
        modifiedText: data.modifiedText,
        summary: data.summary,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploadedFile(file);
    setIsExtracting(true);
    setError(null);
    setExtractedText(null);
    setOriginalDocxBuffer(null);

    try {
      // If it's a DOCX file, store the base64 buffer for later Track Changes generation
      if (file.name.toLowerCase().endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        setOriginalDocxBuffer(base64);
      }

      // Upload to Supabase Storage first (bypasses Vercel 4.5MB limit)
      const filename = `uploads/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('data-files')
        .upload(filename, file, { upsert: true });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Now call API with storage path instead of file
      const response = await fetch('/api/contracts/review/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: filename, originalFilename: file.name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract text');
      }

      const data = await response.json();
      setExtractedText(data.text);

      // Clean up uploaded file from storage after processing
      await supabase.storage.from('data-files').remove([filename]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract text from file');
      setUploadedFile(null);
      setOriginalDocxBuffer(null);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSaveToContract() {
    if (!result || !selectedContract) {
      setError('Please select a contract and complete an analysis first');
      return;
    }

    try {
      const response = await fetch('/api/contracts/review/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: selectedContract,
          provisionName: provisionName || 'Unnamed Provision',
          originalText: activeTab === 'paste' ? inputText : extractedText,
          redlinedText: result.redlinedText,
          summary: result.summary,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save review');
      }

      setError(null);
      alert('Review saved to contract successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review');
    }
  }

  function handleCopyRedlines() {
    if (result?.redlinedText) {
      navigator.clipboard.writeText(result.redlinedText);
      alert('Redlines copied to clipboard');
    }
  }

  function handleNewAnalysis() {
    setResult(null);
    setInputText('');
    setExtractedText(null);
    setUploadedFile(null);
    setProvisionName('');
    setOriginalDocxBuffer(null);
  }

  async function handleDownloadRevised() {
    if (!result || !result.modifiedText) {
      setError('No revised text available');
      return;
    }

    setIsGeneratingDocx(true);
    setError(null);

    try {
      const response = await fetch('/api/contracts/review/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiedText: result.modifiedText,
          filename: uploadedFile?.name || 'contract',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = uploadedFile?.name?.replace(/\.docx$/i, '-REVISED.docx') || 'contract-REVISED.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setIsGeneratingDocx(false);
    }
  }

  async function handleDownloadOriginalPlain() {
    if (!result || !result.originalText) {
      setError('No original text available');
      return;
    }

    setIsGeneratingOriginal(true);
    setError(null);

    try {
      const response = await fetch('/api/contracts/review/generate-original-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: result.originalText,
          filename: uploadedFile?.name || 'contract',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = uploadedFile?.name?.replace(/\.docx$/i, '-ORIGINAL-PLAIN.docx') || 'contract-ORIGINAL-PLAIN.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setIsGeneratingOriginal(false);
    }
  }

  async function handleDownloadBothForCompare() {
    // Download both documents with a delay to prevent browser blocking second download
    await handleDownloadOriginalPlain();
    // Wait 1 second before second download to avoid browser blocking
    await new Promise(resolve => setTimeout(resolve, 1000));
    await handleDownloadRevised();
  }

  // ===== COMPARE DOCUMENTS FUNCTIONS =====

  async function handleCompareFileUpload(file: File, side: 'original' | 'revised') {
    const setFile = side === 'original' ? setCompareOriginalFile : setCompareRevisedFile;
    const setText = side === 'original' ? setCompareOriginalText : setCompareRevisedText;
    const setExtracting = side === 'original' ? setIsExtractingOriginal : setIsExtractingRevised;

    setFile(file);
    setExtracting(true);
    setCompareError(null);
    setCompareResult(null);

    try {
      // Upload to Supabase Storage first (bypasses Vercel 4.5MB limit)
      const filename = `uploads/${Date.now()}-${side}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('data-files')
        .upload(filename, file, { upsert: true });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Now call API with storage path instead of file
      const response = await fetch('/api/contracts/review/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: filename, originalFilename: file.name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract text');
      }

      const data = await response.json();
      setText(data.text);

      // Clean up uploaded file from storage after processing
      await supabase.storage.from('data-files').remove([filename]);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Failed to extract text from file');
      setFile(null);
    } finally {
      setExtracting(false);
    }
  }

  async function handleCompareDocuments() {
    if (!compareOriginalText || !compareRevisedText) {
      setCompareError('Please upload both documents');
      return;
    }

    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);

    try {
      const response = await fetch('/api/contracts/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: compareOriginalText,
          revisedText: compareRevisedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Comparison failed');
      }

      const result = await response.json();
      setCompareResult(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setIsComparing(false);
    }
  }

  function handleResetCompare() {
    setCompareOriginalFile(null);
    setCompareRevisedFile(null);
    setCompareOriginalText(null);
    setCompareRevisedText(null);
    setCompareResult(null);
    setCompareError(null);
    setCategorizedChanges(null);
    setCategoryFilter('all');
  }

  async function handleCategorizeChanges() {
    if (!compareResult) return;

    setIsCategorizing(true);
    setCompareError(null);

    try {
      const response = await fetch('/api/contracts/compare/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: compareResult.changes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Categorization failed');
      }

      const result = await response.json();
      setCategorizedChanges(result.categorizedChanges);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Categorization failed');
    } finally {
      setIsCategorizing(false);
    }
  }

  async function handleExportCompareToWord() {
    if (!compareResult) return;

    setIsGeneratingDocx(true);
    setCompareError(null);

    try {
      const response = await fetch('/api/contracts/compare/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: compareResult.changes,
          originalFilename: compareOriginalFile?.name || 'document',
          revisedFilename: compareRevisedFile?.name || 'document',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comparison-results.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setIsGeneratingDocx(false);
    }
  }

  // ===== ANALYSIS COMPARISON (View Comparison button after AI analysis) =====

  async function handleViewAnalysisComparison() {
    if (!result) return;

    setIsComparingAnalysis(true);
    setShowAnalysisComparison(false);

    try {
      const response = await fetch('/api/contracts/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: result.originalText,
          revisedText: result.modifiedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Comparison failed');
      }

      const compareData = await response.json();
      setAnalysisCompareResult(compareData);
      setShowAnalysisComparison(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setIsComparingAnalysis(false);
    }
  }

  function handleBackToSummary() {
    setShowAnalysisComparison(false);
    setAnalysisCompareResult(null);
  }

  return (
    <div className="min-h-screen bg-[#0B1220]">
      <Sidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      <motion.main
        className="p-8"
        animate={{ marginLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white">Contract Review</h1>
            <p className="text-[#64748B] text-sm mt-1">Contract provision analysis</p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 rounded-lg bg-[#151F2E] text-[#8FA3BF] hover:text-white hover:bg-[#1E293B] transition-colors text-sm font-medium"
          >
            {showHistory ? 'Hide History' : 'View History'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#111827] rounded-xl border border-white/[0.04] p-6"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Input</h2>

            {/* Contract & Provision Selection */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="relative" ref={contractDropdownRef}>
                <label className="block text-[#8FA3BF] text-sm mb-2">Contract (Optional)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={contractSearch}
                    onChange={(e) => {
                      setContractSearch(e.target.value);
                      setShowContractDropdown(true);
                    }}
                    onFocus={() => setShowContractDropdown(true)}
                    placeholder="Search contracts..."
                    className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50"
                  />
                  {selectedContract && (
                    <button
                      onClick={() => {
                        setSelectedContract('');
                        setContractSearch('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Searchable Dropdown */}
                {showContractDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-[#1E293B] border border-white/[0.08] rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {contracts
                      .filter(c =>
                        c.name.toLowerCase().includes(contractSearch.toLowerCase()) ||
                        c.status.toLowerCase().includes(contractSearch.toLowerCase())
                      )
                      .map((contract) => (
                        <button
                          key={contract.id}
                          onClick={() => {
                            setSelectedContract(contract.id);
                            setContractSearch(contract.name);
                            setShowContractDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 hover:bg-[#38BDF8]/10 transition-colors border-b border-white/[0.04] last:border-b-0 ${
                            selectedContract === contract.id ? 'bg-[#38BDF8]/10' : ''
                          }`}
                        >
                          <div className="text-white text-sm font-medium truncate">{contract.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              contract.status === 'PO Received' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                              contract.status === 'Approval & Signature' ? 'bg-[#38BDF8]/20 text-[#38BDF8]' :
                              contract.status === 'Review & Redlines' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                              'bg-white/10 text-[#8FA3BF]'
                            }`}>
                              {contract.status}
                            </span>
                            {contract.value > 0 && (
                              <span className="text-[#64748B] text-xs">
                                ${contract.value.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    {contracts.filter(c =>
                      c.name.toLowerCase().includes(contractSearch.toLowerCase()) ||
                      c.status.toLowerCase().includes(contractSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-4 text-[#64748B] text-sm text-center">
                        No contracts found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[#8FA3BF] text-sm mb-2">Provision Name</label>
                <input
                  type="text"
                  value={provisionName}
                  onChange={(e) => setProvisionName(e.target.value)}
                  placeholder="e.g., Indemnification Clause"
                  className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50"
                />
              </div>
            </div>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-[#8FA3BF] text-sm mb-2">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#0B1220] border border-white/[0.08] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50 cursor-pointer"
              >
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('paste')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'paste'
                    ? 'bg-[#38BDF8]/10 text-[#38BDF8]'
                    : 'text-[#8FA3BF] hover:bg-[#151F2E]'
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'upload'
                    ? 'bg-[#38BDF8]/10 text-[#38BDF8]'
                    : 'text-[#8FA3BF] hover:bg-[#151F2E]'
                }`}
              >
                Upload Document
              </button>
              <button
                onClick={() => setActiveTab('compare')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'compare'
                    ? 'bg-[#A855F7]/10 text-[#A855F7]'
                    : 'text-[#8FA3BF] hover:bg-[#151F2E]'
                }`}
              >
                Compare Documents
              </button>
            </div>

            {/* Input Area */}
            <AnimatePresence mode="wait">
              {activeTab === 'paste' ? (
                <motion.div
                  key="paste"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste contract provision text here..."
                    className="w-full h-64 bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50 resize-none font-mono"
                  />
                </motion.div>
              ) : activeTab === 'upload' ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* File Upload Zone */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      uploadedFile
                        ? 'border-[#22C55E]/50 bg-[#22C55E]/5'
                        : 'border-white/[0.08] hover:border-[#38BDF8]/50 hover:bg-[#38BDF8]/5'
                    }`}
                    onClick={() => document.getElementById('file-upload')?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                  >
                    <input
                      id="file-upload"
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    {isExtracting ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#8FA3BF] text-sm">Extracting text...</p>
                      </div>
                    ) : uploadedFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-10 h-10 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-white font-medium">{uploadedFile.name}</p>
                        <p className="text-[#22C55E] text-sm">Text extracted successfully</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-10 h-10 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-white">Drop file here or click to upload</p>
                        <p className="text-[#64748B] text-sm">Supports PDF, DOCX, DOC, TXT</p>
                      </div>
                    )}
                  </div>

                  {/* Extracted Text Preview */}
                  {extractedText && (
                    <div>
                      <label className="block text-[#8FA3BF] text-sm mb-2">Extracted Text (Review & Edit)</label>
                      <textarea
                        value={extractedText}
                        onChange={(e) => setExtractedText(e.target.value)}
                        className="w-full h-40 bg-[#0B1220] border border-white/[0.08] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50 resize-none font-mono"
                      />
                    </div>
                  )}
                </motion.div>
              ) : activeTab === 'compare' ? (
                <motion.div
                  key="compare"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Two Upload Zones Side by Side */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Original Document Upload */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        compareOriginalFile
                          ? 'border-[#F59E0B]/50 bg-[#F59E0B]/5'
                          : 'border-white/[0.08] hover:border-[#F59E0B]/50 hover:bg-[#F59E0B]/5'
                      }`}
                      onClick={() => document.getElementById('compare-original-upload')?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleCompareFileUpload(file, 'original');
                      }}
                    >
                      <input
                        id="compare-original-upload"
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCompareFileUpload(file, 'original');
                        }}
                      />
                      <h3 className="text-[#F59E0B] font-medium mb-2">Original Document</h3>
                      {isExtractingOriginal ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
                          <p className="text-[#8FA3BF] text-xs">Extracting...</p>
                        </div>
                      ) : compareOriginalFile ? (
                        <div className="flex flex-col items-center gap-1">
                          <svg className="w-8 h-8 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-white text-sm font-medium truncate max-w-full">{compareOriginalFile.name}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <svg className="w-8 h-8 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-[#8FA3BF] text-xs">Drop or click to upload</p>
                        </div>
                      )}
                    </div>

                    {/* Revised Document Upload */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        compareRevisedFile
                          ? 'border-[#22C55E]/50 bg-[#22C55E]/5'
                          : 'border-white/[0.08] hover:border-[#22C55E]/50 hover:bg-[#22C55E]/5'
                      }`}
                      onClick={() => document.getElementById('compare-revised-upload')?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleCompareFileUpload(file, 'revised');
                      }}
                    >
                      <input
                        id="compare-revised-upload"
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCompareFileUpload(file, 'revised');
                        }}
                      />
                      <h3 className="text-[#22C55E] font-medium mb-2">Revised Document</h3>
                      {isExtractingRevised ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
                          <p className="text-[#8FA3BF] text-xs">Extracting...</p>
                        </div>
                      ) : compareRevisedFile ? (
                        <div className="flex flex-col items-center gap-1">
                          <svg className="w-8 h-8 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-white text-sm font-medium truncate max-w-full">{compareRevisedFile.name}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <svg className="w-8 h-8 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-[#8FA3BF] text-xs">Drop or click to upload</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compare Error */}
                  {compareError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {compareError}
                    </div>
                  )}

                  {/* Compare Button */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCompareDocuments}
                      disabled={!compareOriginalText || !compareRevisedText || isComparing}
                      className="flex-1 py-3 bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isComparing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Comparing...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Compare Documents
                        </>
                      )}
                    </button>
                    {(compareOriginalFile || compareRevisedFile) && (
                      <button
                        onClick={handleResetCompare}
                        className="px-4 py-3 bg-[#151F2E] text-[#8FA3BF] font-medium rounded-lg hover:bg-[#1E293B] hover:text-white transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Algorithm Notice */}
                  <div className="p-3 bg-[#A855F7]/10 border border-[#A855F7]/20 rounded-lg">
                    <p className="text-[#A855F7] text-xs">
                      <span className="font-medium">Deterministic Comparison</span> - Uses Google's diff-match-patch algorithm.
                      Character-level accuracy with zero AI assumptions or hallucinations.
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Error Display - only show for paste/upload tabs */}
            {error && activeTab !== 'compare' && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Analyze Button - only show for paste/upload tabs */}
            {activeTab !== 'compare' && (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="mt-4 w-full py-3 bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analyze Contract
                  </>
                )}
              </button>
            )}
          </motion.div>

          {/* Results Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#111827] rounded-xl border border-white/[0.04] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {showAnalysisComparison ? 'Comparison Results' :
                 activeTab === 'compare' && compareResult ? 'Comparison Results' :
                 'Analysis Results'}
              </h2>
              {showAnalysisComparison && (
                <button
                  onClick={handleBackToSummary}
                  className="px-3 py-1.5 text-sm text-[#8FA3BF] hover:text-white bg-[#151F2E] hover:bg-[#1E293B] rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Summary
                </button>
              )}
            </div>

            {/* Analysis Comparison View (triggered from View Comparison button) */}
            {showAnalysisComparison && analysisCompareResult ? (
              <div className="space-y-4">
                {/* Statistics Bar */}
                <div className="flex flex-wrap gap-4 p-4 bg-[#0B1220] rounded-lg">
                  <div className="text-[#8FA3BF]">
                    <span className="text-white font-bold text-lg">{analysisCompareResult.stats.totalChanges}</span>
                    <span className="text-sm ml-1">changes</span>
                  </div>
                  <div className="text-red-400">
                    <span className="font-bold text-lg">{analysisCompareResult.stats.deletions}</span>
                    <span className="text-sm ml-1">deletions</span>
                  </div>
                  <div className="text-green-400">
                    <span className="font-bold text-lg">{analysisCompareResult.stats.insertions}</span>
                    <span className="text-sm ml-1">insertions</span>
                  </div>
                  <div className="text-[#64748B] text-sm flex items-center">
                    <span>{analysisCompareResult.stats.characterChanges.toLocaleString()} chars changed</span>
                  </div>
                </div>

                {/* Diff Display */}
                <div>
                  <label className="block text-[#8FA3BF] text-sm mb-2">Character-Level Diff</label>
                  <div className="bg-[#0B1220] border border-white/[0.08] rounded-lg p-4 max-h-[500px] overflow-y-auto">
                    <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed">
                      {analysisCompareResult.changes.map((change) => (
                        <span
                          key={change.id}
                          className={
                            change.type === 'delete' ? 'bg-red-500/20 text-red-400 line-through' :
                            change.type === 'insert' ? 'bg-green-500/20 text-green-400 underline' :
                            'text-white'
                          }
                        >
                          {change.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Zero Changes Notice */}
                {analysisCompareResult.stats.totalChanges === 0 && (
                  <div className="p-4 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[#22C55E] text-center">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">No changes detected</p>
                    <p className="text-sm opacity-75">The AI analysis didn&apos;t modify the original text</p>
                  </div>
                )}

                {/* Algorithm Notice */}
                <div className="p-3 bg-[#A855F7]/10 border border-[#A855F7]/20 rounded-lg">
                  <p className="text-[#A855F7] text-xs">
                    <span className="font-medium">Deterministic Comparison</span> - Uses Google&apos;s diff-match-patch algorithm.
                    Shows exact character-level changes between original and AI-revised text.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleBackToSummary}
                    className="flex-1 py-2.5 bg-[#151F2E] text-[#8FA3BF] font-medium rounded-lg hover:bg-[#1E293B] hover:text-white transition-colors"
                  >
                    Back to Summary
                  </button>
                  <button
                    onClick={handleDownloadBothForCompare}
                    disabled={isGeneratingDocx || isGeneratingOriginal}
                    className="flex-1 py-2.5 bg-[#22C55E]/10 text-[#22C55E] font-medium rounded-lg hover:bg-[#22C55E]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download for Word
                  </button>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {/* Analysis Complete Banner */}
                <div className="p-3 rounded-lg text-sm font-medium bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Analysis complete - {result.summary.length} changes identified</span>
                  </div>
                </div>

                {/* View Comparison Button - PRIMARY ACTION */}
                <button
                  onClick={handleViewAnalysisComparison}
                  disabled={isComparingAnalysis}
                  className="w-full py-3 bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isComparingAnalysis ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      View Exact Changes (Diff)
                    </>
                  )}
                </button>

                {/* Redlined Text */}
                <div>
                  <label className="block text-[#8FA3BF] text-sm mb-2">Redlined Text</label>
                  <div className="bg-[#0B1220] border border-white/[0.08] rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div
                      className="text-white text-sm font-mono whitespace-pre-wrap contract-redlines"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatRedlines(result.redlinedText), { ALLOWED_TAGS: ['del', 'ins', 'span', 'br'] }) }}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-[#8FA3BF] text-sm mb-2">Summary of Changes</label>
                  <div className="bg-[#0B1220] border border-white/[0.08] rounded-lg p-4">
                    <ul className="space-y-2">
                      {result.summary.map((item, idx) => {
                        // Parse provision label if present: "[Provision] Description"
                        const match = item.match(/^\[([^\]]+)\]\s*(.*)/);
                        const provision = match ? match[1] : null;
                        const text = match ? match[2] : item;

                        return (
                          <li key={idx} className="flex items-start gap-2 text-sm text-[#CBD5E1]">
                            <span className="text-[#38BDF8] mt-1">•</span>
                            <span>
                              {provision && (
                                <span className="text-[#F59E0B] font-medium">[{provision}]</span>
                              )}{provision ? ' ' : ''}{text}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                {/* Word Compare Workflow */}
                {result.modifiedText && (
                  <div className="p-4 bg-[#0B1220] border border-[#38BDF8]/30 rounded-lg">
                    <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-[#38BDF8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Word Track Changes Workflow
                    </h4>

                    {/* Download Both Documents Button - PRIMARY */}
                    <button
                      onClick={handleDownloadBothForCompare}
                      disabled={isGeneratingDocx || isGeneratingOriginal}
                      className="w-full py-3 bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-2"
                    >
                      {(isGeneratingDocx || isGeneratingOriginal) ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating Documents...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Both for Word Compare
                        </>
                      )}
                    </button>

                    {/* Individual download buttons as fallback */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={handleDownloadOriginalPlain}
                        disabled={isGeneratingOriginal}
                        className="flex-1 py-2 bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-sm font-medium rounded-lg hover:bg-[#F59E0B]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Original
                      </button>
                      <button
                        onClick={handleDownloadRevised}
                        disabled={isGeneratingDocx}
                        className="flex-1 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] text-sm font-medium rounded-lg hover:bg-[#22C55E]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Revised
                      </button>
                    </div>

                    {/* Instructions - UPDATED */}
                    <div className="text-sm text-[#8FA3BF] space-y-1.5">
                      <p className="font-medium text-white">To get Track Changes in Word:</p>
                      <ol className="list-decimal list-inside space-y-1.5 ml-2">
                        <li><span className="text-white">Review</span> → <span className="text-white">Compare</span> → <span className="text-white">Compare Documents</span></li>
                        <li>Original document: <span className="text-[#F59E0B]">*-ORIGINAL-PLAIN.docx</span></li>
                        <li>Revised document: <span className="text-[#22C55E]">*-REVISED.docx</span></li>
                        <li>Click <span className="text-white">More ▾</span> → <span className="text-[#38BDF8]">UNCHECK "Formatting"</span></li>
                        <li>Click OK</li>
                      </ol>

                      {/* Important callout - encoding consistency */}
                      <div className="mt-3 p-2.5 bg-[#38BDF8]/10 border border-[#38BDF8]/30 rounded-lg">
                        <p className="text-[#38BDF8] font-medium text-xs">
                          Compare the two downloaded files together - do NOT use your original upload.
                          This ensures encoding consistency for clean track changes.
                        </p>
                      </div>

                    </div>
                  </div>
                )}

                {/* Other Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={handleSaveToContract}
                    disabled={!selectedContract}
                    className="flex-1 min-w-[120px] py-2.5 bg-[#22C55E]/10 text-[#22C55E] font-medium rounded-lg hover:bg-[#22C55E]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save to Notion
                  </button>
                  <button
                    onClick={handleCopyRedlines}
                    className="flex-1 min-w-[100px] py-2.5 bg-[#38BDF8]/10 text-[#38BDF8] font-medium rounded-lg hover:bg-[#38BDF8]/20 transition-colors"
                  >
                    Copy Text
                  </button>
                  <button
                    onClick={handleNewAnalysis}
                    className="flex-1 min-w-[100px] py-2.5 bg-[#151F2E] text-[#8FA3BF] font-medium rounded-lg hover:bg-[#1E293B] hover:text-white transition-colors"
                  >
                    New Analysis
                  </button>
                </div>
              </div>
            ) : activeTab === 'compare' && compareResult ? (
              /* Compare Tab Results */
              <div className="space-y-4">
                {/* Statistics Bar */}
                <div className="flex flex-wrap gap-4 p-4 bg-[#0B1220] rounded-lg">
                  <div className="text-[#8FA3BF]">
                    <span className="text-white font-bold text-lg">{compareResult.stats.totalChanges}</span>
                    <span className="text-sm ml-1">changes</span>
                  </div>
                  <div className="text-red-400">
                    <span className="font-bold text-lg">{compareResult.stats.deletions}</span>
                    <span className="text-sm ml-1">deletions</span>
                  </div>
                  <div className="text-green-400">
                    <span className="font-bold text-lg">{compareResult.stats.insertions}</span>
                    <span className="text-sm ml-1">insertions</span>
                  </div>
                  <div className="text-[#64748B] text-sm flex items-center">
                    <span>{compareResult.stats.characterChanges.toLocaleString()} chars changed</span>
                  </div>

                  {/* Categorize Button */}
                  {!categorizedChanges && (
                    <button
                      onClick={handleCategorizeChanges}
                      disabled={isCategorizing}
                      className="ml-auto px-3 py-1 bg-[#7C3AED]/20 text-[#A855F7] text-xs font-medium rounded hover:bg-[#7C3AED]/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isCategorizing ? (
                        <>
                          <div className="w-3 h-3 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
                          Categorizing...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          Categorize with AI
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Category Filter (shown after categorization) */}
                {categorizedChanges && (
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-[#0B1220] rounded-lg">
                    <span className="text-[#8FA3BF] text-xs font-medium">Filter by:</span>
                    <button
                      onClick={() => setCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        categoryFilter === 'all'
                          ? 'bg-white/10 text-white'
                          : 'text-[#8FA3BF] hover:bg-white/5'
                      }`}
                    >
                      All ({compareResult.stats.totalChanges})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('substantive')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        categoryFilter === 'substantive'
                          ? 'bg-[#DC2626]/20 text-[#DC2626]'
                          : 'text-[#8FA3BF] hover:bg-white/5'
                      }`}
                    >
                      Substantive ({categorizedChanges.filter(c => c.category === 'substantive').length})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('formatting')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        categoryFilter === 'formatting'
                          ? 'bg-[#64748B]/20 text-[#64748B]'
                          : 'text-[#8FA3BF] hover:bg-white/5'
                      }`}
                    >
                      Formatting ({categorizedChanges.filter(c => c.category === 'formatting').length})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('minor')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        categoryFilter === 'minor'
                          ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                          : 'text-[#8FA3BF] hover:bg-white/5'
                      }`}
                    >
                      Minor ({categorizedChanges.filter(c => c.category === 'minor').length})
                    </button>
                  </div>
                )}

                {/* View Toggle */}
                <div className="flex items-center justify-between">
                  <label className="block text-[#8FA3BF] text-sm">Document Comparison</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSectionGrouping(!showSectionGrouping)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        showSectionGrouping
                          ? 'bg-[#A855F7]/20 text-[#A855F7]'
                          : 'bg-[#151F2E] text-[#8FA3BF] hover:text-white'
                      }`}
                    >
                      {showSectionGrouping ? 'Grouped by Section' : 'Inline View'}
                    </button>
                  </div>
                </div>

                {/* Diff Display */}
                <div className="bg-[#0B1220] border border-white/[0.08] rounded-lg p-4 max-h-[500px] overflow-y-auto">
                  {showSectionGrouping && compareResult.sections.length > 0 ? (
                    <div className="space-y-4">
                      {compareResult.sections.map((section, idx) => {
                        const filteredChanges = section.changes.filter(change => {
                          if (categoryFilter === 'all') return true;
                          if (change.type === 'equal') return true;
                          const catChange = categorizedChanges?.find(c => c.id === change.id);
                          return catChange?.category === categoryFilter;
                        });

                        if (categoryFilter !== 'all' && !filteredChanges.some(c => c.type !== 'equal')) {
                          return null;
                        }

                        return (
                          <div key={idx} className="border-l-2 border-[#A855F7]/30 pl-3">
                            <h4 className="text-[#A855F7] font-medium text-sm mb-2">{section.section}</h4>
                            <div className="text-sm font-mono whitespace-pre-wrap">
                              {filteredChanges.map((change) => {
                                const catChange = categorizedChanges?.find(c => c.id === change.id);
                                const categoryColor = catChange?.category === 'substantive' ? 'border-b border-[#DC2626]/50' :
                                                     catChange?.category === 'formatting' ? 'opacity-60' :
                                                     catChange?.category === 'minor' ? 'border-b border-[#F59E0B]/30' : '';

                                return (
                                  <span
                                    key={change.id}
                                    className={`${
                                      change.type === 'delete' ? 'bg-red-500/20 text-red-400 line-through' :
                                      change.type === 'insert' ? 'bg-green-500/20 text-green-400 underline' :
                                      'text-white'
                                    } ${change.type !== 'equal' ? categoryColor : ''}`}
                                    title={catChange?.explanation || undefined}
                                  >
                                    {change.text}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm font-mono whitespace-pre-wrap">
                      {(categorizedChanges || compareResult.changes)
                        .filter(change => {
                          if (categoryFilter === 'all') return true;
                          if (change.type === 'equal') return true;
                          const catChange = categorizedChanges?.find(c => c.id === change.id) as CategorizedChange | undefined;
                          return catChange?.category === categoryFilter;
                        })
                        .map((change) => {
                          const catChange = categorizedChanges?.find(c => c.id === change.id) as CategorizedChange | undefined;
                          const categoryColor = catChange?.category === 'substantive' ? 'border-b border-[#DC2626]/50' :
                                               catChange?.category === 'formatting' ? 'opacity-60' :
                                               catChange?.category === 'minor' ? 'border-b border-[#F59E0B]/30' : '';

                          return (
                            <span
                              key={change.id}
                              className={`${
                                change.type === 'delete' ? 'bg-red-500/20 text-red-400 line-through' :
                                change.type === 'insert' ? 'bg-green-500/20 text-green-400 underline' :
                                'text-white'
                              } ${change.type !== 'equal' ? categoryColor : ''}`}
                              title={catChange?.explanation || undefined}
                            >
                              {change.text}
                            </span>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Zero Changes Notice */}
                {compareResult.stats.totalChanges === 0 && (
                  <div className="p-4 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[#22C55E] text-center">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">Documents are identical</p>
                    <p className="text-sm opacity-75">No differences found after normalization</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCompareToWord}
                    disabled={isGeneratingDocx}
                    className="flex-1 py-2.5 bg-[#38BDF8]/10 text-[#38BDF8] font-medium rounded-lg hover:bg-[#38BDF8]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGeneratingDocx ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export to Word
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleResetCompare}
                    className="flex-1 py-2.5 bg-[#151F2E] text-[#8FA3BF] font-medium rounded-lg hover:bg-[#1E293B] hover:text-white transition-colors"
                  >
                    New Comparison
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[#475569]">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>{activeTab === 'compare' ? 'Comparison results will appear here' : 'Analysis results will appear here'}</p>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 bg-[#111827] rounded-xl border border-white/[0.04] p-6"
            >
              <h2 className="text-lg font-semibold text-white mb-4">Review History</h2>

              {history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-[#0B1220] rounded-lg hover:bg-[#151F2E] transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-white font-medium">{item.provisionName}</p>
                        <p className="text-[#64748B] text-sm">{item.contractName}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.status === 'approved' ? 'bg-[#22C55E]/10 text-[#22C55E]' :
                          item.status === 'sent_to_client' ? 'bg-[#38BDF8]/10 text-[#38BDF8]' :
                          item.status === 'sent_to_boss' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' :
                          'bg-white/5 text-[#8FA3BF]'
                        }`}>
                          {item.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <p className="text-[#64748B] text-xs mt-1">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#475569] text-center py-8">No review history yet</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
      <style dangerouslySetInnerHTML={{ __html: `.contract-redlines del { background-color: rgba(239, 68, 68, 0.2); color: #f87171; text-decoration: line-through; } .contract-redlines ins { background-color: rgba(34, 197, 94, 0.2); color: #4ade80; text-decoration: underline; }` }} />
    </div>
  );
}

// Helper to format redlines with HTML
function formatRedlines(text: string): string {
  return text
    .replace(/\[strikethrough\](.*?)\[\/strikethrough\]/g, '<del>$1</del>')
    .replace(/\[underline\](.*?)\[\/underline\]/g, '<ins>$1</ins>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/\+\+(.*?)\+\+/g, '<ins>$1</ins>');
}
