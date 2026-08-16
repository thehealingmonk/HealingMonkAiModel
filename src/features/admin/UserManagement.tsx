import { useEffect, useState } from 'react';
import { Mail, Lock, User as UserIcon, Plus, ShieldCheck, RefreshCw, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import { AuthUser, Role, listUsers, createUser, setUserActive, updateUser, deleteUser } from '@/services/api';

const ROLE_TABS: { label: string; value: Role | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Doctors', value: 'doctor' },
  { label: 'Reception', value: 'reception' },
  { label: 'Patients', value: 'patient' },
  { label: 'Admins', value: 'admin' },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20',
  doctor: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  reception: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20',
  patient: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
};

const fieldInput =
  'w-full pl-10 pr-4 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent';

interface Props {
  /** Pre-select a role tab (e.g. when navigating from a module card). */
  initialRole?: Role | 'all';
}

export default function UserManagement({ initialRole = 'all' }: Props) {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState<Role | 'all'>(initialRole);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create-user form state.
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: Role }>({
    name: '',
    email: '',
    password: '',
    role: 'doctor',
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit-user modal state (null = closed). `password` is optional — blank keeps
  // the current one.
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; role: Role; password: string }>({
    name: '',
    email: '',
    role: 'doctor',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { users } = await listUsers(filter === 'all' ? undefined : filter);
      setUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', role: 'doctor' });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (u: AuthUser) => {
    try {
      await setUserActive(u.id, !u.active);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
    }
  };

  const openEdit = (u: AuthUser) => {
    setEditError('');
    setEditForm({ name: u.name, email: u.email, role: u.role, password: '' });
    setEditing(u);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditError('');
    setSaving(true);
    try {
      const { user: updated } = await updateUser(editing.id, {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        // Only send a password when the admin actually typed a new one.
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: AuthUser) => {
    if (!window.confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    setError('');
    setDeletingId(u.id);
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete user');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-slate-400 text-sm">Add staff and patient accounts, and enable or disable access.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 font-medium py-2 px-3 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2 px-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
          >
            <Plus className="w-4 h-4" />
            Add user
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="glass-dark rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full name</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={fieldInput}
                  placeholder="Dr. Jane Doe"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full px-3 py-2 rounded-lg border border-white/15 bg-[#1f2b48] text-white focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent"
              >
                <option value="doctor">Doctor</option>
                <option value="reception">Reception</option>
                <option value="patient">Patient</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={fieldInput}
                  placeholder="staff@clinic.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Temporary password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={fieldInput}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </div>
            </div>
          </div>

          {formError && (
            <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mt-4">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 font-medium py-2 px-4 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-60 text-white font-semibold py-2 px-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
            >
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
                : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <div className="glass-dark rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[u.role]}`}>
                        {u.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20' : 'bg-white/10 text-slate-400'}`}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => openEdit(u)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-sky-400 hover:text-sky-300"
                          title="Edit user"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={isSelf}
                          title={isSelf ? 'You cannot change your own status' : ''}
                          className={`text-sm font-medium ${
                            isSelf
                              ? 'text-slate-600 cursor-not-allowed'
                              : u.active
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-emerald-400 hover:text-emerald-300'
                          }`}
                        >
                          {u.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={isSelf || deletingId === u.id}
                          title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
                          className={`inline-flex items-center gap-1 text-sm font-medium ${
                            isSelf
                              ? 'text-slate-600 cursor-not-allowed'
                              : 'text-rose-400 hover:text-rose-300'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingId === u.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => !saving && setEditing(null)}
        >
          <form
            onSubmit={handleUpdate}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-8 rounded-2xl border border-white/10 bg-[#1f2b48] text-slate-200 shadow-2xl shadow-black/50"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="text-lg font-bold text-white">Edit user</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className={fieldInput}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                  disabled={me?.id === editing.id}
                  title={me?.id === editing.id ? 'You cannot change your own role' : ''}
                  className="w-full px-3 py-2 rounded-lg border border-white/15 bg-[#1f2b48] text-white focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent disabled:opacity-60"
                >
                  <option value="doctor">Doctor</option>
                  <option value="reception">Reception</option>
                  <option value="patient">Patient</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className={fieldInput}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  New password <span className="text-slate-500">(optional)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className={fieldInput}
                    placeholder="Leave blank to keep current"
                    minLength={6}
                  />
                </div>
              </div>
            </div>

            {editError && (
              <div className="mx-5 bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm">
                {editError}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-white/10 p-4 mt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 font-medium py-2 px-4 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-60 text-white font-semibold py-2 px-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
