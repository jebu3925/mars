'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// Context for sidebar state - allows dashboards to respond to collapse
export const SidebarContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
}>({
  isCollapsed: false,
  setIsCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

// Dashboard access by role
const DASHBOARD_ACCESS: Record<string, string[]> = {
  admin: ['/contracts-dashboard', '/mcc-dashboard', '/closeout-dashboard', '/pm-dashboard', '/contracts/review', '/admin'],
  sales: ['/contracts-dashboard'],
  finance: ['/mcc-dashboard', '/closeout-dashboard'],
  pm: ['/closeout-dashboard', '/pm-dashboard'],
  legal: ['/contracts/review'],
  viewer: [],
};

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

interface NavCategory {
  name: string;
  items: NavItem[];
}

const navCategories: NavCategory[] = [
  {
    name: 'Contracts',
    items: [
      {
        name: 'Contracts Pipeline',
        href: '/contracts-dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        badge: 'Salesforce',
      },
      {
        name: 'Contract Review',
        href: '/contracts/review',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ),
        badge: 'Claude',
      },
    ],
  },
  {
    name: 'Project Management',
    items: [
      {
        name: 'Project Tracker',
        href: '/pm-dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
        badge: 'Asana',
      },
    ],
  },
  {
    name: 'Finance',
    items: [
      {
        name: 'MCC Profitability',
        href: '/mcc-dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        badge: 'Excel',
      },
      {
        name: 'Project Profitability',
        href: '/closeout-dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        badge: 'Excel',
      },
    ],
  },
  {
    name: 'Operations',
    items: [
      {
        name: 'Coming Soon',
        href: '#',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        ),
        disabled: true,
      },
    ],
  },
  {
    name: 'Administration',
    items: [
      {
        name: 'User Management',
        href: '/admin',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
    ],
  },
];

// Badge dot color mapping (matches Data Sources colors)
function getBadgeDotColor(badge: string): string {
  switch (badge) {
    case 'Salesforce':
      return 'bg-[#38BDF8]'; // Blue - matches Salesforce in data sources
    case 'Asana':
      return 'bg-[#E16259]'; // Red - matches Asana in data sources
    case 'Excel':
      return 'bg-[#22C55E]'; // Green
    case 'Claude':
      return 'bg-[#D97706]'; // Orange
    default:
      return 'bg-[#64748B]';
  }
}

interface SidebarProps {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function Sidebar({ isCollapsed: controlledCollapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [loggingOut, setLoggingOut] = useState(false);

  // Use controlled or internal state
  const isCollapsed = controlledCollapsed ?? internalCollapsed;

  // Load user and role on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Get user role from user_roles table
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        setUserRole(roleData?.role || 'viewer');
      }
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserRole('viewer');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      const value = saved === 'true';
      setInternalCollapsed(value);
      onCollapsedChange?.(value);
    }
  }, []);

  // Filter nav items based on user role
  const allowedPaths = DASHBOARD_ACCESS[userRole] || [];
  const filteredNavCategories = navCategories.map(category => ({
    ...category,
    items: category.items.filter(item =>
      item.disabled || allowedPaths.some(path => item.href.startsWith(path) || item.href === path)
    ),
  })).filter(category => category.items.length > 0);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  };

  const toggleCollapsed = () => {
    const newValue = !isCollapsed;
    setInternalCollapsed(newValue);
    onCollapsedChange?.(newValue);
    localStorage.setItem('sidebar-collapsed', String(newValue));
  };

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{
        x: 0,
        opacity: 1,
        width: isCollapsed ? 72 : 256,
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed left-0 top-0 h-full bg-[#0B1220] z-50 overflow-hidden flex flex-col"
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={toggleCollapsed}
        className="absolute top-4 right-2 z-10 p-1.5 rounded-lg bg-[#1E293B] hover:bg-[#2D3B4F] text-[#64748B] hover:text-white transition-all group"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <motion.svg
          animate={{ rotate: isCollapsed ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </motion.svg>
      </button>

      {/* Logo */}
      <div className={`flex-shrink-0 p-6 ${isCollapsed ? 'px-3' : ''}`}>
        <Link href="/" className="block">
          {isCollapsed ? (
            <div className="w-10 h-10 rounded-lg bg-[#1E293B] flex items-center justify-center">
              <span className="text-[#38BDF8] font-bold text-lg">M</span>
            </div>
          ) : (
            <img
              src="/mars-logo-horizontal.png"
              alt="MARS"
              className="h-10 object-contain"
            />
          )}
        </Link>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-[#64748B] mt-2 tracking-[0.08em] uppercase"
            >
              Executive Dashboards
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation by Category */}
      <nav className={`flex-1 px-3 space-y-4 overflow-y-auto ${isCollapsed ? 'px-2' : ''}`}>
        {filteredNavCategories.map((category) => (
          <div key={category.name}>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-semibold text-[#475569] uppercase tracking-[0.08em] px-3 mb-2"
                >
                  {category.name}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-0.5">
              {category.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.href}
                    href={item.disabled ? '#' : item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                      ${isCollapsed ? 'justify-center px-0' : ''}
                      ${isActive
                        ? 'bg-[#15233A] text-[#EAF2FF]'
                        : item.disabled
                          ? 'text-[#475569] cursor-not-allowed'
                          : 'text-[#8FA3BF] hover:bg-[#151F2E] hover:text-[#CBD5E1]'
                      }
                    `}
                    onClick={(e) => item.disabled && e.preventDefault()}
                    title={isCollapsed ? item.name : undefined}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#38BDF8] rounded-r" />
                    )}
                    <span className={`flex-shrink-0 ${isActive ? 'text-[#38BDF8]' : 'text-[#64748B] group-hover:text-[#8FA3BF]'}`}>
                      {item.icon}
                    </span>
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="font-medium text-[13px] whitespace-nowrap overflow-hidden"
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {item.badge && !isCollapsed && (
                      <span className={`ml-auto w-2 h-2 rounded-full ${getBadgeDotColor(item.badge)}`} title={item.badge} />
                    )}

                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-[#1E293B] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                        {item.name}
                        {item.badge && (
                          <span className={`ml-2 w-1.5 h-1.5 rounded-full ${getBadgeDotColor(item.badge)} inline-block`} />
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Section - Data Sources + User Info */}
      <div className="flex-shrink-0 border-t border-[#1E293B]">
        {/* Data Sources - only show when expanded */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 pb-2"
            >
              <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-[0.08em] px-3 mb-2">
                Data Sources
              </p>
              <div className="space-y-0.5">
                <div className="flex items-center gap-3 px-3 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
                  <span className="text-[11px] text-[#8FA3BF]">Salesforce</span>
                  <span className="ml-auto text-[9px] text-[#22C55E] font-medium">Live</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E16259]" />
                  <span className="text-[11px] text-[#8FA3BF]">Asana</span>
                  <span className="ml-auto text-[9px] text-[#22C55E] font-medium">Live</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FFD700]" />
                  <span className="text-[11px] text-[#8FA3BF]">DocuSign</span>
                  <span className="ml-auto text-[9px] text-[#22C55E] font-medium">Live</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed Data Sources indicator */}
        {isCollapsed && (
          <div className="flex justify-center py-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" title="Data sources connected" />
          </div>
        )}

        {/* User info and Logout */}
        {user && (
          <div className={`p-3 pt-2 border-t border-[#1E293B] ${isCollapsed ? 'px-2' : ''}`}>
            {!isCollapsed && (
              <div className="flex items-center gap-2 mb-2 px-2">
                <div className="w-6 h-6 rounded-full bg-[#1E293B] flex items-center justify-center">
                  <span className="text-[10px] text-[#8FA3BF] font-medium">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#8FA3BF] truncate">{user.email}</p>
                  <p className="text-[9px] text-[#475569] capitalize">{userRole}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className={`
                flex items-center gap-2 w-full px-2 py-2 rounded-lg
                text-[#8FA3BF] hover:bg-[#1E293B] hover:text-white transition-all
                ${isCollapsed ? 'justify-center' : ''}
                disabled:opacity-50
              `}
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {!isCollapsed && (
                <span className="text-[12px]">{loggingOut ? 'Signing out...' : 'Sign out'}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Export width constants for use in dashboards
export const SIDEBAR_WIDTH = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
