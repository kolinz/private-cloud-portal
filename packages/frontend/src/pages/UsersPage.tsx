// packages/frontend/src/pages/UsersPage.tsx
import { useState, useEffect } from 'react';
import { api, type UserDTO, ApiError } from '../api/client.ts';
import { useAuth } from '../hooks/useAuth.tsx';

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter(r => r.test(password)).length;
  const levels = [
    { label: 'Too short', color: 'bg-slate-200' },
    { label: 'Weak',      color: 'bg-red-400' },
    { label: 'Fair',      color: 'bg-amber-400' },
    { label: 'Good',      color: 'bg-blue-400' },
    { label: 'Strong',    color: 'bg-emerald-500' },
  ];
  if (!password) return null;
  const level = levels[score] ?? levels[0];
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex gap-0.5 flex-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < score ? level.color : 'bg-slate-200'}`} />
        ))}
      </div>
      <span className="text-xs text-slate-500">{level.label}</span>
    </div>
  );
}

export default function UsersPage() {
  const { user: me }               = useAuth();
  const [users,     setUsers]      = useState<UserDTO[]>([]);
  const [loading,   setLoading]    = useState(true);
  const [modalOpen, setModalOpen]  = useState(false);
  const [editUser,  setEditUser]   = useState<UserDTO | null>(null);
  const [form,      setForm]       = useState({ username: '', password: '', role: 'user' as 'admin' | 'user' });
  const [saving,    setSaving]     = useState(false);
  const [error,     setError]      = useState('');
  const [nameErr,   setNameErr]    = useState('');

  const fetchUsers = async () => {
    try { const res = await api.users.list(); setUsers(res.users); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => {
    setEditUser(null); setForm({ username: '', password: '', role: 'user' });
    setError(''); setNameErr(''); setModalOpen(true);
  };
  const openEdit = (u: UserDTO) => {
    setEditUser(u); setForm({ username: u.username, password: '', role: u.role });
    setError(''); setNameErr(''); setModalOpen(true);
  };

  const validateName = (v: string) => {
    if (!v) return 'ユーザー名を入力してください';
    if (v.length < 3 || v.length > 32) return '3〜32文字で入力してください';
    if (!/^[a-zA-Z0-9_]+$/.test(v)) return '英数字とアンダースコアのみ使用可';
    return '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) {
      const err = validateName(form.username);
      if (err) { setNameErr(err); return; }
    }
    setSaving(true); setError('');
    try {
      if (!editUser) {
        await api.users.create({ username: form.username, password: form.password, role: form.role });
      } else {
        const patch: { password?: string; role?: 'admin'|'user' } = { role: form.role };
        if (form.password) patch.password = form.password;
        await api.users.patch(editUser.id, patch);
      }
      setModalOpen(false); await fetchUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save user');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (u: UserDTO) => {
    await api.users.patch(u.id, { isActive: !u.isActive });
    await fetchUsers();
  };

  const handleDelete = async (u: UserDTO) => {
    if (!confirm(`Delete "${u.username}"?`)) return;
    try { await api.users.delete(u.id); await fetchUsers(); }
    catch (e) { alert(e instanceof ApiError ? e.message : 'Failed to delete user'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Users</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage portal users</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New User
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Username</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.username}
                  {u.id === me?.id && <span className="ml-2 text-xs text-blue-500">(you)</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    u.role === 'admin'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggleActive(u)}
                    disabled={u.id === me?.id}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors disabled:cursor-default ${
                      u.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(u)}
                      className="text-xs px-2.5 py-1 border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(u)}
                      disabled={u.id === me?.id}
                      className="text-xs px-2.5 py-1 border border-red-200 text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-5">
              {editUser ? `Edit: ${editUser.username}` : 'New User'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              {!editUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input required value={form.username}
                    onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setNameErr(validateName(e.target.value)); }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${nameErr ? 'border-red-300' : 'border-slate-300'}`} />
                  {nameErr && <p className="mt-1 text-xs text-red-500">{nameErr}</p>}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editUser ? 'New Password (blank = no change)' : 'Password'}
                </label>
                <input type="password" required={!editUser} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <PasswordStrength password={form.password} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin'|'user' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
