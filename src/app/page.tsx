'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// Animated background grid
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F1722] via-[#0F1722]/95 to-[#0F1722]" />

      {/* Animated grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(to right, rgba(56, 189, 248, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(56, 189, 248, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* Radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#0189CB]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#38BDF8]/5 rounded-full blur-[100px]" />
    </div>
  );
}

// Floating particles
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-[#38BDF8]/30 rounded-full"
          initial={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
          }}
          animate={{
            y: [null, -20, 20],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            repeatType: 'reverse',
            delay: Math.random() * 2,
          }}
        />
      ))}
    </div>
  );
}

// Dashboard card component
function DashboardCard({
  title,
  description,
  icon,
  href,
  color,
  delay,
  stats
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  delay: number;
  stats?: { label: string; value: string }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
    >
      <Link href={href}>
        <motion.div
          whileHover={{ y: -8, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="group relative bg-[#151E2C]/80 backdrop-blur-sm border border-[#1E293B] rounded-2xl p-6 h-full cursor-pointer overflow-hidden"
        >
          {/* Hover glow effect */}
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${color} rounded-2xl blur-xl -z-10`} />

          {/* Top accent line */}
          <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${color} opacity-60`} />

          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
              {icon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-[#38BDF8] transition-colors">
                {title}
              </h3>
              <p className="text-sm text-[#8FA3BF] leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          {stats && (
            <div className="mt-5 pt-4 border-t border-[#1E293B] grid grid-cols-2 gap-3">
              {stats.map((stat, i) => (
                <div key={i}>
                  <p className="text-xs text-[#64748B] uppercase tracking-wide">{stat.label}</p>
                  <p className="text-lg font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Arrow indicator */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
            <svg className="w-5 h-5 text-[#38BDF8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// Data source badge
function DataSourceBadge({ name, color, delay }: { name: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-center gap-2 px-4 py-2 bg-[#151E2C]/60 backdrop-blur-sm border border-[#1E293B] rounded-full"
    >
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-sm text-[#8FA3BF]">{name}</span>
      <span className="text-xs text-[#22C55E] font-medium">Connected</span>
    </motion.div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#0F1722] text-white relative overflow-hidden">
      <GridBackground />
      {mounted && <FloatingParticles />}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex items-center justify-between px-8 py-6"
      >
        <img
          src="/mars-logo-horizontal.png"
          alt="MARS"
          className="h-10 object-contain"
        />
        <Link href="/login">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2.5 text-sm font-medium text-white bg-[#1E293B] hover:bg-[#2D3B4F] rounded-lg transition-colors"
          >
            Sign In
          </motion.button>
        </Link>
      </motion.header>

      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-12 pb-20">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#0189CB]/10 border border-[#0189CB]/20 rounded-full mb-6"
          >
            <div className="w-2 h-2 bg-[#22C55E] rounded-full animate-pulse" />
            <span className="text-sm text-[#38BDF8]">All Systems Operational</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl md:text-6xl font-bold mb-6 leading-tight"
          >
            <span className="text-white">Executive </span>
            <span className="bg-gradient-to-r from-[#0189CB] to-[#38BDF8] bg-clip-text text-transparent">
              Intelligence
            </span>
            <br />
            <span className="text-white">Platform</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-xl text-[#8FA3BF] max-w-2xl mx-auto mb-10"
          >
            Real-time insights across contracts, projects, and financial operations.
            Unified data from Salesforce, Asana, and DocuSign in one powerful platform.
          </motion.p>

          {/* Data Sources */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-3 mb-12"
          >
            <DataSourceBadge name="Salesforce" color="bg-[#38BDF8]" delay={0.5} />
            <DataSourceBadge name="Asana" color="bg-[#E16259]" delay={0.6} />
            <DataSourceBadge name="DocuSign" color="bg-[#FFD700]" delay={0.7} />
            <DataSourceBadge name="Supabase" color="bg-[#22C55E]" delay={0.8} />
          </motion.div>
        </div>

        {/* Dashboard Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <DashboardCard
            title="Contracts Pipeline"
            description="Track contract status from negotiations through signature and PO receipt."
            icon={
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            href="/contracts-dashboard"
            color="from-[#0189CB]/20 to-[#38BDF8]/10"
            delay={0.5}
            stats={[
              { label: 'Pipeline', value: '$34.9M' },
              { label: 'Active', value: '200' },
            ]}
          />

          <DashboardCard
            title="Project Tracker"
            description="Monitor project milestones, tasks, and team deliverables in real-time."
            icon={
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
            href="/pm-dashboard"
            color="from-[#E16259]/20 to-[#F87171]/10"
            delay={0.6}
            stats={[
              { label: 'Projects', value: '24' },
              { label: 'On Track', value: '92%' },
            ]}
          />

          <DashboardCard
            title="MCC Profitability"
            description="Analyze master cost center performance and financial metrics."
            icon={
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            href="/mcc-dashboard"
            color="from-[#22C55E]/20 to-[#4ADE80]/10"
            delay={0.7}
            stats={[
              { label: 'Margin', value: '34.2%' },
              { label: 'Revenue', value: '$12.8M' },
            ]}
          />

          <DashboardCard
            title="Project Closeout"
            description="Review completed projects and analyze profitability outcomes."
            icon={
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            href="/closeout-dashboard"
            color="from-[#A855F7]/20 to-[#C084FC]/10"
            delay={0.8}
            stats={[
              { label: 'Closed', value: '156' },
              { label: 'Avg Margin', value: '28.6%' },
            ]}
          />
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="text-center"
        >
          <Link href="/contracts-dashboard">
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-3 px-10 py-4 rounded-xl bg-gradient-to-r from-[#0189CB] to-[#38BDF8] text-white font-semibold text-lg shadow-lg shadow-[#0189CB]/30 hover:shadow-[#0189CB]/50 transition-all"
            >
              <span>Enter Dashboard</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </motion.button>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="relative z-10 border-t border-[#1E293B] py-6"
      >
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-sm text-[#64748B]">
            MARS Water Solutions - Business Intelligence Platform
          </p>
          <div className="flex items-center gap-6">
            <Link href="/contracts/review" className="text-sm text-[#64748B] hover:text-white transition-colors">
              Contract Review
            </Link>
            <Link href="/admin" className="text-sm text-[#64748B] hover:text-white transition-colors">
              Admin
            </Link>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
