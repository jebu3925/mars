'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, useSidebar } from '@/components/Sidebar';

interface GuideTopic {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface GuideData {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  topics: GuideTopic[];
}

const guideContent: Record<string, GuideData> = {
  pipeline: {
    title: 'Contracts Pipeline Guide',
    description: 'Master the contract lifecycle with powerful pipeline management tools.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: '#38BDF8',
    topics: [
      {
        id: 'stages',
        title: 'Understanding Pipeline Stages',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              MARS uses a 6-stage pipeline to track contracts from initial discussions to purchase order:
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { stage: 'Discussions Not Started', desc: 'Lead identified, no engagement yet', color: '#64748B' },
                { stage: 'Initial Agreement Development', desc: 'Active negotiations, drafting terms', color: '#38BDF8' },
                { stage: 'Review & Redlines', desc: 'Legal review, tracking changes', color: '#F59E0B' },
                { stage: 'Approval & Signature', desc: 'Final approval and signing', color: '#EC4899' },
                { stage: 'Agreement Submission', desc: 'Contract submitted to customer', color: '#8B5CF6' },
                { stage: 'PO Received', desc: 'Purchase order received - won!', color: '#22C55E' },
              ].map((item) => (
                <div key={item.stage} className="p-4 bg-[#0B1220] rounded-lg border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-white font-medium text-sm">{item.stage}</span>
                  </div>
                  <p className="text-[#64748B] text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'kpis',
        title: 'KPI Cards & Metrics',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              The interactive KPI cards at the top of the Pipeline view show key metrics and can be clicked to filter the contract list:
            </p>
            <ul className="space-y-2">
              {[
                { title: 'Total Pipeline', desc: 'Click to see all active contracts' },
                { title: 'Due Next 30 Days', desc: 'Contracts with close dates in the next month' },
                { title: 'Overdue', desc: 'Contracts past their expected close date' },
                { title: 'High Value', desc: 'Contracts above the average deal size' },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-3 p-3 bg-[#0B1220] rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-[#38BDF8] mt-2" />
                  <div>
                    <span className="text-white font-medium">{item.title}</span>
                    <p className="text-[#64748B] text-sm">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        id: 'filters',
        title: 'Filtering & Search',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Use the powerful filtering system to find specific contracts:
            </p>
            <div className="bg-[#0B1220] rounded-lg p-4 border border-white/[0.04]">
              <h4 className="text-white font-medium mb-3">Available Filters</h4>
              <ul className="space-y-2 text-sm">
                <li className="text-[#8FA3BF]"><strong className="text-white">Status:</strong> Filter by pipeline stage</li>
                <li className="text-[#8FA3BF]"><strong className="text-white">Year:</strong> Filter by close date year</li>
                <li className="text-[#8FA3BF]"><strong className="text-white">Contract Type:</strong> Equipment, Service, etc.</li>
                <li className="text-[#8FA3BF]"><strong className="text-white">Budgeted:</strong> Show only forecasted deals</li>
                <li className="text-[#8FA3BF]"><strong className="text-white">Probability:</strong> Filter by close probability</li>
                <li className="text-[#8FA3BF]"><strong className="text-white">Search:</strong> Full-text search on contract names</li>
              </ul>
            </div>
            <p className="text-[#64748B] text-sm">
              Pro tip: Use <kbd className="px-1.5 py-0.5 bg-[#1E293B] rounded text-xs">Cmd+K</kbd> to open the command palette for quick filtering.
            </p>
          </div>
        ),
      },
      {
        id: 'salesforce',
        title: 'Salesforce Integration',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              MARS syncs with Salesforce to keep your pipeline data up-to-date:
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-[#0B1220] rounded-lg border border-white/[0.04]">
                <h4 className="text-[#38BDF8] font-medium mb-2">Automatic Sync</h4>
                <p className="text-[#64748B] text-sm">Contract data syncs from Salesforce automatically, including stage, value, and dates.</p>
              </div>
              <div className="p-4 bg-[#0B1220] rounded-lg border border-white/[0.04]">
                <h4 className="text-[#38BDF8] font-medium mb-2">Direct Links</h4>
                <p className="text-[#64748B] text-sm">Click the SF link on any contract to open it directly in Salesforce.</p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'shortcuts',
        title: 'Keyboard Shortcuts',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Navigate the pipeline faster with keyboard shortcuts:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'Cmd+K', action: 'Open Command Palette' },
                { key: 'J', action: 'Move down in list' },
                { key: 'K', action: 'Move up in list' },
                { key: 'Enter', action: 'Select/Open contract' },
                { key: '/', action: 'Focus search' },
                { key: 'Escape', action: 'Clear selection' },
                { key: '1-5', action: 'Quick filter by stage' },
                { key: 'G then P', action: 'Go to Pipeline' },
              ].map((shortcut) => (
                <div key={shortcut.key} className="flex items-center gap-3 p-3 bg-[#0B1220] rounded-lg">
                  <kbd className="px-2 py-1 bg-[#1E293B] border border-white/[0.1] rounded text-sm text-white font-mono min-w-[80px] text-center">
                    {shortcut.key}
                  </kbd>
                  <span className="text-[#8FA3BF] text-sm">{shortcut.action}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  documents: {
    title: 'Document Management Guide',
    description: 'Track contract documents and ensure completeness throughout the contract lifecycle.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    color: '#8B5CF6',
    topics: [
      {
        id: 'types',
        title: 'Document Types',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              MARS tracks several document types for each contract:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: 'Original Contract', desc: 'Initial contract from customer', required: true },
                { type: 'MARS Redlines', desc: 'Our tracked changes version', required: true },
                { type: 'Client Response', desc: 'Customer\'s response to redlines', required: false },
                { type: 'Final Agreement', desc: 'Agreed final version', required: true },
                { type: 'Executed Contract', desc: 'Signed contract', required: true },
                { type: 'Purchase Order', desc: 'Customer PO document', required: true },
              ].map((doc) => (
                <div key={doc.type} className="p-3 bg-[#0B1220] rounded-lg border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium text-sm">{doc.type}</span>
                    {doc.required && (
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded">Required</span>
                    )}
                  </div>
                  <p className="text-[#64748B] text-xs">{doc.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'completeness',
        title: 'Completeness Tracking',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              The completeness score shows what percentage of required documents are uploaded:
            </p>
            <div className="bg-[#0B1220] rounded-lg p-4 border border-white/[0.04]">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="35" fill="none" stroke="#1E293B" strokeWidth="6" />
                    <circle cx="40" cy="40" r="35" fill="none" stroke="#38BDF8" strokeWidth="6" strokeDasharray="165 220" strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-white font-bold">75%</span>
                </div>
                <div>
                  <p className="text-white font-medium">Document Completeness</p>
                  <p className="text-[#64748B] text-sm">3 of 4 required documents uploaded</p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'views',
        title: 'Smart Views',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Smart views help you focus on what matters most:
            </p>
            <ul className="space-y-2">
              {[
                { name: 'Needs Attention', desc: 'Contracts missing documents or overdue' },
                { name: 'Closing Soon', desc: 'Contracts with dates in the next 90 days' },
                { name: 'Budgeted', desc: 'Only budgeted/forecasted contracts' },
                { name: 'By Account', desc: 'Grouped by customer account' },
                { name: 'Recently Updated', desc: 'Documents uploaded in the last 7 days' },
              ].map((view) => (
                <li key={view.name} className="flex items-start gap-3 p-3 bg-[#0B1220] rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-[#8B5CF6] mt-2" />
                  <div>
                    <span className="text-white font-medium">{view.name}</span>
                    <p className="text-[#64748B] text-sm">{view.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
    ],
  },
  tasks: {
    title: 'Task Management Guide',
    description: 'Stay on top of contract activities with auto-generated tasks and powerful tracking.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: '#F59E0B',
    topics: [
      {
        id: 'auto-tasks',
        title: 'Auto-Generated Tasks',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              MARS automatically creates tasks based on contract stage transitions:
            </p>
            <div className="bg-[#0B1220] rounded-lg p-4 border border-white/[0.04]">
              <p className="text-[#64748B] text-sm mb-3">When a contract moves to a new stage, relevant tasks are created automatically. For example:</p>
              <ul className="space-y-2 text-sm">
                <li className="text-[#8FA3BF]">• Moving to "Review & Redlines" creates "Review contract terms" task</li>
                <li className="text-[#8FA3BF]">• Moving to "Approval & Signature" creates "Obtain signature" task</li>
                <li className="text-[#8FA3BF]">• Tasks inherit the contract's due date when applicable</li>
              </ul>
            </div>
          </div>
        ),
      },
      {
        id: 'views',
        title: 'Task Views',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              View your tasks in three different ways:
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'By Contract', desc: 'Tasks grouped by their associated contract' },
                { name: 'List View', desc: 'Flat list sorted by due date' },
                { name: 'Board View', desc: 'Kanban board with drag-and-drop' },
              ].map((view) => (
                <div key={view.name} className="p-4 bg-[#0B1220] rounded-lg border border-white/[0.04] text-center">
                  <span className="text-white font-medium">{view.name}</span>
                  <p className="text-[#64748B] text-xs mt-1">{view.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'priorities',
        title: 'Due Dates & Priorities',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Prioritize tasks effectively with due dates and priority levels:
            </p>
            <div className="flex gap-4">
              {[
                { level: 'Urgent', color: '#EF4444' },
                { level: 'High', color: '#F59E0B' },
                { level: 'Medium', color: '#38BDF8' },
                { level: 'Low', color: '#22C55E' },
              ].map((priority) => (
                <div key={priority.level} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: priority.color }} />
                  <span className="text-white text-sm">{priority.level}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  review: {
    title: 'Contract Review Guide',
    description: 'AI-powered contract review with redlines, clause detection, and comparison tools.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: '#22C55E',
    topics: [
      {
        id: 'compare',
        title: 'Document Comparison',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Compare two versions of a contract to see what changed:
            </p>
            <ol className="space-y-2 text-sm list-decimal list-inside text-[#8FA3BF]">
              <li>Upload the original document</li>
              <li>Upload the revised document</li>
              <li>Click "Compare" to see side-by-side differences</li>
              <li>Changes are highlighted: <span className="text-green-400">additions</span> and <span className="text-red-400 line-through">deletions</span></li>
            </ol>
          </div>
        ),
      },
      {
        id: 'ai-redlines',
        title: 'AI Redlines',
        content: (
          <div className="space-y-4">
            <p className="text-[#8FA3BF]">
              Let Claude AI suggest redlines based on MARS standard provisions:
            </p>
            <div className="bg-[#0B1220] rounded-lg p-4 border border-white/[0.04]">
              <ol className="space-y-2 text-sm list-decimal list-inside text-[#8FA3BF]">
                <li>Select a contract provision type</li>
                <li>Review the suggested changes</li>
                <li>Accept, modify, or reject each suggestion</li>
                <li>Export the final redlined document</li>
              </ol>
            </div>
          </div>
        ),
      },
    ],
  },
};

export default function GuideCategoryPage() {
  const params = useParams();
  const { isCollapsed } = useSidebar();
  const category = params.category as string;
  const guide = guideContent[category];

  if (!guide) {
    return (
      <div className="flex min-h-screen bg-[#0B1220]">
        <Sidebar />
        <motion.main
          animate={{
            marginLeft: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
            width: `calc(100% - ${isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px)`,
          }}
          className="flex-1 flex items-center justify-center"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Guide Not Found</h1>
            <Link href="/guides" className="text-[#38BDF8] hover:underline">
              Return to Guides
            </Link>
          </div>
        </motion.main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0B1220]">
      <Sidebar />

      <motion.main
        animate={{
          marginLeft: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          width: `calc(100% - ${isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px)`,
        }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="flex-1 min-h-screen"
      >
        <div className="max-w-5xl mx-auto px-8 py-12">
          {/* Back Link */}
          <Link href="/guides" className="inline-flex items-center gap-2 text-[#64748B] hover:text-white mb-8 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Guides
          </Link>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-6 mb-12"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${guide.color}15` }}
            >
              <span style={{ color: guide.color }}>{guide.icon}</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{guide.title}</h1>
              <p className="text-[#8FA3BF] text-lg">{guide.description}</p>
            </div>
          </motion.div>

          {/* Table of Contents */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#111827] rounded-xl border border-white/[0.06] p-6 mb-8"
          >
            <h3 className="text-sm font-semibold text-[#64748B] uppercase tracking-wider mb-4">In This Guide</h3>
            <div className="flex flex-wrap gap-2">
              {guide.topics.map((topic) => (
                <a
                  key={topic.id}
                  href={`#${topic.id}`}
                  className="px-3 py-1.5 bg-[#0B1220] hover:bg-[#1E293B] text-[#8FA3BF] hover:text-white rounded-lg text-sm transition-colors"
                >
                  {topic.title}
                </a>
              ))}
            </div>
          </motion.div>

          {/* Topics */}
          <div className="space-y-12">
            {guide.topics.map((topic, index) => (
              <motion.section
                key={topic.id}
                id={topic.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="scroll-mt-8"
              >
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: `${guide.color}15`, color: guide.color }}
                  >
                    {index + 1}
                  </span>
                  {topic.title}
                </h2>
                <div className="pl-11">
                  {topic.content}
                </div>
              </motion.section>
            ))}
          </div>

          {/* Navigation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-16 pt-8 border-t border-white/[0.06]"
          >
            <div className="flex items-center justify-between">
              <Link href="/guides" className="text-[#64748B] hover:text-white transition-colors">
                ← All Guides
              </Link>
              <Link
                href="/contracts-dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#38BDF8]/10 text-[#38BDF8] rounded-lg hover:bg-[#38BDF8]/20 transition-colors"
              >
                Open Dashboard
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.main>
    </div>
  );
}
