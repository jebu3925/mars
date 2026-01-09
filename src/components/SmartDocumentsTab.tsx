'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface Document {
  id: string;
  contract_id: string | null;
  salesforce_id: string | null;
  account_name: string;
  opportunity_name: string | null;
  opportunity_year: number | null;
  document_type: string;
  status: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  version: number;
  is_current_version: boolean;
  expiration_date: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
}

interface PriorityScore {
  contractId: string;
  score: number;
  reasons: string[];
  category: 'critical' | 'high' | 'medium' | 'low';
}

interface CompletenessScore {
  total: number;
  required: number;
  optional: number;
  percentage: number;
  missingRequired: string[];
  missingOptional: string[];
}

interface ContractDocuments {
  contractId: string;
  contractName: string;
  opportunityYear: number | null;
  documents: Document[];
  completeness: CompletenessScore;
  priority: PriorityScore;
}

interface AccountGroup {
  accountName: string;
  contracts: Record<string, ContractDocuments>;
}

interface Contract {
  id: string;
  salesforceId?: string;
  name: string;
  opportunityName?: string;
  value: number;
  status: string;
  closeDate: string | null;
  contractDate: string | null;
}

interface DocumentsData {
  documents: Document[];
  byAccount: Record<string, AccountGroup>;
  priorityScores: Record<string, PriorityScore>;
  completenessScores: Record<string, CompletenessScore>;
  stats: {
    totalDocuments: number;
    totalContracts: number;
    needsAttention: number;
    closingSoon: number;
    complete: number;
    averageCompleteness: number;
  };
  documentTypes: string[];
  requiredTypes: string[];
  optionalTypes: string[];
}

interface SavedView {
  id: string;
  name: string;
  filters: {
    view?: string;
    documentType?: string;
    status?: string;
    accountName?: string;
  };
}

type SmartView = 'needs_attention' | 'closing_soon' | 'by_account' | 'recent' | 'all';

const SMART_VIEWS: { id: SmartView; label: string; icon: string; description: string }[] = [
  { id: 'needs_attention', label: 'Needs Attention', icon: '!', description: 'Missing docs, overdue, or stalled' },
  { id: 'closing_soon', label: 'Closing Soon', icon: 'calendar', description: 'Due in next 90 days' },
  { id: 'by_account', label: 'By Account', icon: 'folder', description: 'Organized by account hierarchy' },
  { id: 'recent', label: 'Recently Updated', icon: 'clock', description: 'Last 7 days activity' },
  { id: 'all', label: 'All Documents', icon: 'list', description: 'Complete document list' },
];

const DOCUMENT_TYPES = [
  'Original Contract',
  'MARS Redlines',
  'Client Response',
  'Final Agreement',
  'Executed Contract',
  'Purchase Order',
  'Amendment',
  'Other',
];

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
  under_review: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  awaiting_signature: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  executed: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  expired: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  superseded: { bg: 'bg-gray-500/10', text: 'text-gray-500', border: 'border-gray-500/20' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', glow: 'shadow-red-500/20' },
  high: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' },
  medium: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', glow: 'shadow-blue-500/20' },
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', glow: 'shadow-green-500/20' },
};

// Format file size
function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateStr);
}

// Drag and Drop Upload Zone Component
function DropZone({
  documentType,
  contractId,
  contractName,
  accountName,
  onUpload,
  existingDoc,
  isUploading,
}: {
  documentType: string;
  contractId: string;
  contractName: string;
  accountName: string;
  onUpload: (file: File, type: string, contractId: string, contractName: string, accountName: string) => void;
  existingDoc?: Document;
  isUploading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onUpload(file, documentType, contractId, contractName, accountName);
    }
  };

  const handleClick = () => {
    if (existingDoc) {
      // Open existing document
      if (existingDoc.file_url && !existingDoc.file_url.startsWith('#')) {
        window.open(existingDoc.file_url, '_blank');
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file, documentType, contractId, contractName, accountName);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const hasDoc = !!existingDoc;
  const statusColor = existingDoc ? STATUS_COLORS[existingDoc.status] || STATUS_COLORS.draft : null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative flex items-center gap-2 p-2 rounded-lg text-sm cursor-pointer transition-all duration-200
        ${isDragOver ? 'ring-2 ring-[#38BDF8] bg-[#38BDF8]/10 scale-[1.02]' : ''}
        ${hasDoc
          ? `${statusColor?.bg} ${statusColor?.text} hover:brightness-110 border ${statusColor?.border}`
          : 'bg-[#151F2E] text-[#64748B] hover:bg-[#1E293B] hover:text-white border border-transparent hover:border-white/10'
        }
        ${isUploading ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
      />

      {isUploading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : hasDoc ? (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      )}

      <span className="truncate flex-1">{documentType}</span>

      {hasDoc && existingDoc.version > 1 && (
        <span className="text-xs opacity-60">v{existingDoc.version}</span>
      )}

      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#38BDF8]/20 rounded-lg">
          <span className="text-[#38BDF8] text-xs font-medium">Drop to upload</span>
        </div>
      )}
    </div>
  );
}

// Collapsible Account Section
function AccountSection({
  accountName,
  contracts,
  isExpanded,
  onToggle,
  onUpload,
  uploadingKey,
  documentTypes,
}: {
  accountName: string;
  contracts: Record<string, ContractDocuments>;
  isExpanded: boolean;
  onToggle: () => void;
  onUpload: (file: File, type: string, contractId: string, contractName: string, accountName: string) => void;
  uploadingKey: string | null;
  documentTypes: string[];
}) {
  const contractList = Object.values(contracts);
  const totalDocs = contractList.reduce((sum, c) => sum + c.documents.length, 0);
  const avgCompleteness = Math.round(
    contractList.reduce((sum, c) => sum + c.completeness.percentage, 0) / Math.max(contractList.length, 1)
  );
  const highPriorityCount = contractList.filter(c => c.priority.category === 'critical' || c.priority.category === 'high').length;

  return (
    <div className="bg-[#111827] rounded-xl border border-white/[0.04] overflow-hidden">
      {/* Account Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[#64748B]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.div>
          <div className="text-left">
            <h3 className="text-white font-medium">{accountName}</h3>
            <p className="text-[#64748B] text-sm">
              {contractList.length} contract{contractList.length !== 1 ? 's' : ''} &bull; {totalDocs} documents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {highPriorityCount > 0 && (
            <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded-full">
              {highPriorityCount} need attention
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-[#151F2E] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#38BDF8] to-[#22C55E] transition-all"
                style={{ width: `${avgCompleteness}%` }}
              />
            </div>
            <span className="text-[#64748B] text-sm w-10">{avgCompleteness}%</span>
          </div>
        </div>
      </button>

      {/* Contracts List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04]">
              {contractList
                .sort((a, b) => b.priority.score - a.priority.score)
                .map((contract) => (
                  <ContractCard
                    key={contract.contractId}
                    contract={contract}
                    onUpload={onUpload}
                    accountName={accountName}
                    uploadingKey={uploadingKey}
                    documentTypes={documentTypes}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Contract Card Component
function ContractCard({
  contract,
  onUpload,
  accountName,
  uploadingKey,
  documentTypes,
}: {
  contract: ContractDocuments;
  onUpload: (file: File, type: string, contractId: string, contractName: string, accountName: string) => void;
  accountName: string;
  uploadingKey: string | null;
  documentTypes: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const priorityColor = PRIORITY_COLORS[contract.priority.category];

  return (
    <div className={`border-b border-white/[0.02] last:border-0 ${priorityColor.bg}`}>
      {/* Contract Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 pl-12 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[#64748B]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">{contract.contractName}</h4>
              {contract.opportunityYear && (
                <span className="px-2 py-0.5 bg-[#151F2E] text-[#64748B] text-xs rounded">
                  Year {contract.opportunityYear}
                </span>
              )}
            </div>
            {contract.priority.reasons.length > 0 && (
              <p className={`text-sm ${priorityColor.text}`}>
                {contract.priority.reasons[0]}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Priority Badge */}
          <span className={`px-2 py-1 ${priorityColor.bg} ${priorityColor.text} text-xs font-medium rounded-full border ${priorityColor.border}`}>
            {contract.priority.score}/100
          </span>

          {/* Completeness */}
          <div className="flex items-center gap-2">
            <span className="text-[#64748B] text-sm">
              {contract.completeness.required}/{4} required
            </span>
            <div className="w-16 h-2 bg-[#151F2E] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  contract.completeness.percentage === 100
                    ? 'bg-[#22C55E]'
                    : contract.completeness.percentage >= 50
                      ? 'bg-[#38BDF8]'
                      : 'bg-amber-500'
                }`}
                style={{ width: `${contract.completeness.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Document Grid */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-16">
              {/* Missing Required Documents Alert */}
              {contract.completeness.missingRequired.length > 0 && (
                <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-amber-400 text-sm">
                    <span className="font-medium">Missing required:</span> {contract.completeness.missingRequired.join(', ')}
                  </p>
                </div>
              )}

              {/* Document Type Grid */}
              <div className="grid grid-cols-3 gap-2">
                {documentTypes.map((docType) => {
                  const doc = contract.documents.find(d => d.document_type === docType && d.is_current_version);
                  const isUploading = uploadingKey === `${contract.contractId}-${docType}`;

                  return (
                    <DropZone
                      key={docType}
                      documentType={docType}
                      contractId={contract.contractId}
                      contractName={contract.contractName}
                      accountName={accountName}
                      onUpload={onUpload}
                      existingDoc={doc}
                      isUploading={isUploading}
                    />
                  );
                })}
              </div>

              {/* Recent Documents List */}
              {contract.documents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-[#64748B] text-xs mb-2">Recent uploads</p>
                  <div className="space-y-1">
                    {contract.documents
                      .filter(d => d.is_current_version)
                      .slice(0, 3)
                      .map(doc => (
                        <div key={doc.id} className="flex items-center justify-between text-xs">
                          <span className="text-white truncate flex-1">{doc.file_name}</span>
                          <span className="text-[#64748B] ml-2">{formatRelativeTime(doc.uploaded_at)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Priority Contract Card (for Needs Attention view)
function PriorityCard({
  contract,
  accountName,
  onUpload,
  uploadingKey,
  documentTypes,
}: {
  contract: ContractDocuments;
  accountName: string;
  onUpload: (file: File, type: string, contractId: string, contractName: string, accountName: string) => void;
  uploadingKey: string | null;
  documentTypes: string[];
}) {
  const priorityColor = PRIORITY_COLORS[contract.priority.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border ${priorityColor.border} ${priorityColor.bg} shadow-lg ${priorityColor.glow}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 ${priorityColor.bg} ${priorityColor.text} text-xs font-bold rounded border ${priorityColor.border}`}>
              {contract.priority.category.toUpperCase()}
            </span>
            <span className="text-[#64748B] text-xs">Score: {contract.priority.score}/100</span>
          </div>
          <h3 className="text-white font-semibold">{contract.contractName}</h3>
          <p className="text-[#64748B] text-sm">{accountName}</p>
        </div>

        {/* Completeness Ring */}
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 transform -rotate-90">
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="#151F2E"
              strokeWidth="4"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke={contract.completeness.percentage === 100 ? '#22C55E' : '#38BDF8'}
              strokeWidth="4"
              strokeDasharray={`${contract.completeness.percentage * 1.51} 151`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-medium">
            {contract.completeness.percentage}%
          </span>
        </div>
      </div>

      {/* Reasons */}
      <div className="mb-3 space-y-1">
        {contract.priority.reasons.map((reason, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <svg className={`w-4 h-4 ${priorityColor.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-[#94A3B8]">{reason}</span>
          </div>
        ))}
      </div>

      {/* Missing Documents */}
      {contract.completeness.missingRequired.length > 0 && (
        <div className="mb-3">
          <p className="text-amber-400 text-xs font-medium mb-2">Upload missing documents:</p>
          <div className="grid grid-cols-2 gap-2">
            {contract.completeness.missingRequired.map(docType => (
              <DropZone
                key={docType}
                documentType={docType}
                contractId={contract.contractId}
                contractName={contract.contractName}
                accountName={accountName}
                onUpload={onUpload}
                isUploading={uploadingKey === `${contract.contractId}-${docType}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
        <button className="flex-1 px-3 py-2 bg-[#151F2E] hover:bg-[#1E293B] text-white text-sm rounded-lg transition-colors">
          View Contract
        </button>
        <button className="px-3 py-2 bg-[#151F2E] hover:bg-[#1E293B] text-[#64748B] hover:text-white text-sm rounded-lg transition-colors">
          Snooze
        </button>
      </div>
    </motion.div>
  );
}

// Filter Chip Component
function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#38BDF8]/10 text-[#38BDF8] text-xs rounded-full">
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
      <button onClick={onRemove} className="ml-1 hover:text-white">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// Main Smart Documents Tab Component
export default function SmartDocumentsTab({ contracts }: { contracts: Contract[] }) {
  // State
  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<SmartView>('needs_attention');
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  // Filters
  const [filters, setFilters] = useState<{
    documentType: string | null;
    status: string | null;
    accountName: string | null;
  }>({
    documentType: null,
    status: null,
    accountName: null,
  });

  // Fetch documents data
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/contracts/documents');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Load saved views from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('documentSavedViews');
    if (stored) {
      try {
        setSavedViews(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse saved views:', e);
      }
    }
  }, []);

  // Handle file upload
  const handleUpload = async (
    file: File,
    documentType: string,
    contractId: string,
    contractName: string,
    accountName: string
  ) => {
    const uploadKey = `${contractId}-${documentType}`;
    setUploadingKey(uploadKey);

    try {
      // In production, upload to S3/Supabase storage first
      // For now, create document record with placeholder URL
      const response = await fetch('/api/contracts/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          accountName,
          opportunityName: contractName,
          documentType,
          fileName: file.name,
          fileUrl: `#local:${file.name}`, // Placeholder
          fileSize: file.size,
          fileMimeType: file.type,
          status: 'draft',
          notes: `Uploaded: ${file.name} (${formatFileSize(file.size)})`,
        }),
      });

      if (response.ok) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingKey(null);
    }
  };

  // Toggle account expansion
  const toggleAccount = (accountName: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountName)) {
        next.delete(accountName);
      } else {
        next.add(accountName);
      }
      return next;
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({ documentType: null, status: null, accountName: null });
    setSearchQuery('');
  };

  // Save current view
  const saveCurrentView = () => {
    const name = prompt('Enter a name for this view:');
    if (!name) return;

    const newView: SavedView = {
      id: Date.now().toString(),
      name,
      filters: {
        view: activeView,
        documentType: filters.documentType || undefined,
        status: filters.status || undefined,
        accountName: filters.accountName || undefined,
      },
    };

    const updated = [...savedViews, newView];
    setSavedViews(updated);
    localStorage.setItem('documentSavedViews', JSON.stringify(updated));
  };

  // Filter and sort data based on active view
  const filteredData = useMemo(() => {
    if (!data) return { accounts: [], priorityContracts: [], recentDocs: [] };

    const accounts = Object.entries(data.byAccount);

    // Apply search filter
    let filtered = accounts;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = accounts.filter(([name, account]) =>
        name.toLowerCase().includes(query) ||
        Object.values(account.contracts).some(c =>
          c.contractName.toLowerCase().includes(query) ||
          c.documents.some(d => d.file_name.toLowerCase().includes(query))
        )
      );
    }

    // Apply other filters
    if (filters.accountName) {
      filtered = filtered.filter(([name]) => name === filters.accountName);
    }

    // Get priority contracts for needs attention view
    const allContracts = filtered.flatMap(([accountName, account]) =>
      Object.values(account.contracts).map(c => ({ ...c, accountName }))
    );

    const priorityContracts = allContracts
      .filter(c => c.priority.category === 'critical' || c.priority.category === 'high')
      .sort((a, b) => b.priority.score - a.priority.score);

    // Get contracts closing soon
    const closingSoonContracts = allContracts
      .filter(c => {
        const contract = contracts.find(ct => ct.id === c.contractId);
        if (!contract?.contractDate && !contract?.closeDate) return false;
        const targetDate = new Date(contract.contractDate || contract.closeDate!);
        const daysUntil = Math.floor((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= 90;
      })
      .sort((a, b) => {
        const contractA = contracts.find(c => c.id === a.contractId);
        const contractB = contracts.find(c => c.id === b.contractId);
        const dateA = new Date(contractA?.contractDate || contractA?.closeDate || 0);
        const dateB = new Date(contractB?.contractDate || contractB?.closeDate || 0);
        return dateA.getTime() - dateB.getTime();
      });

    // Get recent documents
    const recentDocs = data.documents
      .filter(d => {
        const uploadedDate = new Date(d.uploaded_at);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return uploadedDate >= sevenDaysAgo;
      })
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());

    return {
      accounts: filtered,
      priorityContracts,
      closingSoonContracts,
      recentDocs,
    };
  }, [data, searchQuery, filters, contracts]);

  // Active filter chips
  const activeFilters = Object.entries(filters)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: value as string }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Total Documents', value: data?.stats.totalDocuments || 0, color: 'text-white' },
          { label: 'Needs Attention', value: data?.stats.needsAttention || 0, color: 'text-red-400' },
          { label: 'Closing Soon', value: data?.stats.closingSoon || 0, color: 'text-amber-400' },
          { label: 'Complete', value: data?.stats.complete || 0, color: 'text-green-400' },
          { label: 'Avg Completeness', value: `${data?.stats.averageCompleteness || 0}%`, color: 'text-[#38BDF8]' },
        ].map((stat, i) => (
          <div key={i} className="p-4 bg-[#111827] rounded-xl border border-white/[0.04]">
            <p className="text-[#64748B] text-sm">{stat.label}</p>
            <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Smart View Tabs */}
      <div className="flex items-center gap-2 p-1 bg-[#0B1220] rounded-xl">
        {SMART_VIEWS.map((view) => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              activeView === view.id
                ? 'bg-[#38BDF8]/10 text-[#38BDF8]'
                : 'text-[#64748B] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {view.id === 'needs_attention' && (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                activeView === view.id ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-400'
              }`}>
                {data?.stats.needsAttention || 0}
              </span>
            )}
            <span>{view.label}</span>
          </button>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#64748B]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search accounts, contracts, or documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0B1220] border border-white/[0.08] rounded-lg text-white placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8]/50"
          />
        </div>

        {/* Document Type Filter */}
        <select
          value={filters.documentType || ''}
          onChange={(e) => setFilters(f => ({ ...f, documentType: e.target.value || null }))}
          className="px-3 py-2 bg-[#0B1220] border border-white/[0.08] rounded-lg text-white text-sm"
        >
          <option value="">All Types</option>
          {DOCUMENT_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        {/* Save View */}
        <button
          onClick={saveCurrentView}
          className="px-3 py-2 bg-[#0B1220] border border-white/[0.08] rounded-lg text-[#64748B] hover:text-white text-sm transition-colors"
        >
          Save View
        </button>
      </div>

      {/* Active Filter Chips */}
      {(activeFilters.length > 0 || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap">
          {searchQuery && (
            <FilterChip
              label="Search"
              value={searchQuery}
              onRemove={() => setSearchQuery('')}
            />
          )}
          {activeFilters.map(({ key, value }) => (
            <FilterChip
              key={key}
              label={key.replace(/([A-Z])/g, ' $1').trim()}
              value={value}
              onRemove={() => setFilters(f => ({ ...f, [key]: null }))}
            />
          ))}
          <button
            onClick={clearFilters}
            className="text-[#64748B] hover:text-white text-xs"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Content based on active view */}
      <div className="space-y-4">
        {activeView === 'needs_attention' && (
          <>
            {filteredData.priorityContracts.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-500/10 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-white text-lg font-medium mb-1">All caught up!</h3>
                <p className="text-[#64748B]">No contracts need immediate attention</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredData.priorityContracts.map((contract) => (
                  <PriorityCard
                    key={contract.contractId}
                    contract={contract}
                    accountName={contract.accountName}
                    onUpload={handleUpload}
                    uploadingKey={uploadingKey}
                    documentTypes={data?.requiredTypes || []}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeView === 'closing_soon' && (
          <>
            {filteredData.closingSoonContracts?.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-[#38BDF8]/10 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#38BDF8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white text-lg font-medium mb-1">No upcoming deadlines</h3>
                <p className="text-[#64748B]">No contracts closing in the next 90 days</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredData.closingSoonContracts?.map((contract) => (
                  <PriorityCard
                    key={contract.contractId}
                    contract={contract}
                    accountName={contract.accountName}
                    onUpload={handleUpload}
                    uploadingKey={uploadingKey}
                    documentTypes={data?.documentTypes || []}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeView === 'by_account' && (
          <div className="space-y-4">
            {filteredData.accounts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#64748B]">No accounts found</p>
              </div>
            ) : (
              filteredData.accounts.map(([accountName, account]) => (
                <AccountSection
                  key={accountName}
                  accountName={accountName}
                  contracts={account.contracts}
                  isExpanded={expandedAccounts.has(accountName)}
                  onToggle={() => toggleAccount(accountName)}
                  onUpload={handleUpload}
                  uploadingKey={uploadingKey}
                  documentTypes={data?.documentTypes || []}
                />
              ))
            )}
          </div>
        )}

        {activeView === 'recent' && (
          <div className="bg-[#111827] rounded-xl border border-white/[0.04]">
            {filteredData.recentDocs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#64748B]">No documents uploaded in the last 7 days</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {filteredData.recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#38BDF8]/10 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#38BDF8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium">{doc.file_name}</p>
                        <p className="text-[#64748B] text-sm">
                          {doc.account_name} &bull; {doc.document_type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[#64748B] text-sm">{formatRelativeTime(doc.uploaded_at)}</p>
                      <p className="text-[#64748B] text-xs">{formatFileSize(doc.file_size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'all' && (
          <div className="space-y-4">
            {filteredData.accounts.map(([accountName, account]) => (
              <AccountSection
                key={accountName}
                accountName={accountName}
                contracts={account.contracts}
                isExpanded={true}
                onToggle={() => {}}
                onUpload={handleUpload}
                uploadingKey={uploadingKey}
                documentTypes={data?.documentTypes || []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Saved Views Sidebar (if any) */}
      {savedViews.length > 0 && (
        <div className="fixed bottom-4 right-4">
          <div className="bg-[#111827] rounded-xl border border-white/[0.04] p-3 shadow-xl">
            <p className="text-[#64748B] text-xs mb-2">Saved Views</p>
            <div className="space-y-1">
              {savedViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => {
                    if (view.filters.view) setActiveView(view.filters.view as SmartView);
                    setFilters({
                      documentType: view.filters.documentType || null,
                      status: view.filters.status || null,
                      accountName: view.filters.accountName || null,
                    });
                  }}
                  className="block w-full text-left px-2 py-1 text-sm text-white hover:bg-white/[0.04] rounded"
                >
                  {view.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
