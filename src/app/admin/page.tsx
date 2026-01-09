'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/Sidebar';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  lastSignIn: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#EF4444',
  sales: '#3B82F6',
  finance: '#22C55E',
  pm: '#F59E0B',
  legal: '#8B5CF6',
  viewer: '#64748B',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Full access to all dashboards and admin settings',
  sales: 'Access to Contracts Pipeline dashboard',
  finance: 'Access to MCC and Project Profitability dashboards',
  pm: 'Access to Project Tracker and Project Profitability dashboards',
  legal: 'Access to Contract Review dashboard',
  viewer: 'No dashboard access (can only view home page)',
};

const DASHBOARD_ACCESS: Record<string, string[]> = {
  admin: ['Contracts Pipeline', 'MCC Profitability', 'Project Profitability', 'Project Tracker', 'Contract Review', 'Admin'],
  sales: ['Contracts Pipeline'],
  finance: ['MCC Profitability', 'Project Profitability'],
  pm: ['Project Tracker', 'Project Profitability'],
  legal: ['Contract Review'],
  viewer: [],
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Add user modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit role modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users);
        setRoles(data.roles);
      }
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Add user
  const handleAddUser = async () => {
    if (!newEmail || !newPassword) {
      setAddError('Email and password are required');
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setAddError(data.error);
      } else {
        setShowAddModal(false);
        setNewEmail('');
        setNewPassword('');
        setNewRole('viewer');
        fetchUsers();
      }
    } catch (err) {
      setAddError('Failed to add user');
    } finally {
      setAdding(false);
    }
  };

  // Update role
  const handleUpdateRole = async () => {
    if (!editingUser) return;

    setSaving(true);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editRole,
        }),
      });

      const data = await response.json();

      if (!data.error) {
        setEditingUser(null);
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete user
  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/users?userId=${deletingUser.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.error) {
        setDeletingUser(null);
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setDeleting(false);
    }
  };

  const marginLeft = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="min-h-screen bg-[#0B1220]">
      <Sidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      <main
        className="transition-all duration-200 ease-out min-h-screen"
        style={{ marginLeft }}
      >
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">User Management</h1>
              <p className="text-[#64748B] mt-1">Manage user access and permissions</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-[#0B1220] font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#38BDF8]/20 border-t-[#38BDF8] rounded-full animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {/* Users Table */}
          {!loading && !error && (
            <div className="bg-[#151F2E] rounded-xl border border-white/[0.04] overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 bg-[#0F1722] border-b border-white/[0.04] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                <div>User</div>
                <div>Role</div>
                <div>Created</div>
                <div>Last Sign In</div>
                <div>Actions</div>
              </div>

              {users.length === 0 ? (
                <div className="px-6 py-12 text-center text-[#64748B]">
                  No users found
                </div>
              ) : (
                users.map((user, index) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 items-center border-b border-white/[0.04] hover:bg-[#1E293B]/50 transition-colors ${
                      index % 2 === 0 ? 'bg-[#151F2E]' : 'bg-[#131B28]'
                    }`}
                  >
                    {/* Email */}
                    <div>
                      <div className="text-white font-medium">{user.email}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">ID: {user.id.slice(0, 8)}...</div>
                    </div>

                    {/* Role */}
                    <div>
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                        style={{
                          background: `${ROLE_COLORS[user.role]}20`,
                          color: ROLE_COLORS[user.role],
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: ROLE_COLORS[user.role] }}
                        />
                        {user.role}
                      </span>
                    </div>

                    {/* Created */}
                    <div className="text-[13px] text-[#94A3B8]">
                      {formatDate(user.createdAt)}
                    </div>

                    {/* Last Sign In */}
                    <div className="text-[13px] text-[#94A3B8]">
                      {formatDate(user.lastSignIn)}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setEditRole(user.role);
                        }}
                        className="p-2 text-[#64748B] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 rounded-lg transition-colors"
                        title="Edit role"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeletingUser(user)}
                        className="p-2 text-[#64748B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* Role Legend */}
          <div className="mt-8 bg-[#151F2E] rounded-xl border border-white/[0.04] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Role Permissions</h2>
            <div className="grid grid-cols-2 gap-4">
              {roles.map(role => (
                <div key={role} className="flex items-start gap-3 p-3 rounded-lg bg-[#0F1722]">
                  <span
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                    style={{ background: ROLE_COLORS[role] }}
                  />
                  <div>
                    <div className="font-medium text-white capitalize">{role}</div>
                    <div className="text-[12px] text-[#64748B] mt-0.5">
                      {ROLE_DESCRIPTIONS[role]}
                    </div>
                    {DASHBOARD_ACCESS[role]?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {DASHBOARD_ACCESS[role].map(dash => (
                          <span key={dash} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#94A3B8]">
                            {dash}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#151F2E] rounded-xl border border-white/10 shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">Add New User</h3>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0F1722] border border-white/10 text-white placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8]/50"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0F1722] border border-white/10 text-white placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8]/50"
                    placeholder="Minimum 6 characters"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">Role</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0F1722] border border-white/10 text-white focus:outline-none focus:border-[#38BDF8]/50"
                  >
                    {roles.map(role => (
                      <option key={role} value={role} className="bg-[#0F1722]">
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {addError && (
                  <div className="text-red-400 text-[13px]">{addError}</div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-[#64748B] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={adding}
                  className="px-4 py-2 bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-[#0B1220] font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add User'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Role Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#151F2E] rounded-xl border border-white/10 shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">Edit User Role</h3>
                <p className="text-[13px] text-[#64748B] mt-1">{editingUser.email}</p>
              </div>

              <div className="p-6">
                <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0F1722] border border-white/10 text-white focus:outline-none focus:border-[#38BDF8]/50"
                >
                  {roles.map(role => (
                    <option key={role} value={role} className="bg-[#0F1722]">
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>

                <div className="mt-4 p-3 rounded-lg bg-[#0F1722] text-[12px] text-[#64748B]">
                  <strong className="text-[#94A3B8]">Access:</strong> {ROLE_DESCRIPTIONS[editRole]}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-[#64748B] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateRole}
                  disabled={saving}
                  className="px-4 py-2 bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-[#0B1220] font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDeletingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#151F2E] rounded-xl border border-white/10 shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">Delete User</h3>
              </div>

              <div className="p-6">
                <p className="text-[#94A3B8]">
                  Are you sure you want to delete <strong className="text-white">{deletingUser.email}</strong>?
                </p>
                <p className="text-[13px] text-[#64748B] mt-2">
                  This action cannot be undone. The user will lose access to all dashboards.
                </p>
              </div>

              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 text-[#64748B] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
