// packages/frontend/src/pages/TemplatesPage.tsx
import { useState, useEffect } from 'react';
import { api, type TemplateDTO, ApiError } from '../api/client.ts';

const ROLE_LABELS = { general: 'General', reverse_proxy: 'Reverse Proxy' } as const;
const TYPE_LABELS = { preset: 'Preset', custom: 'Custom' } as const;

type ModalMode = 'create' | 'edit';

const emptyForm = () => ({
  name: '', description: '', type: 'custom' as 'preset' | 'custom',
  role: 'general' as 'general' | 'reverse_proxy',
  imageAlias: '', cpuLimit: '', memoryLimit: '', diskLimit: '', isActive: true,
});

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editId,    setEditId]    = useState<string | null>(null);
  const [form,      setForm]      = useState(emptyForm());
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [deleteErr,    setDeleteErr]    = useState<Record<string, string>>({});
  const [localImages,  setLocalImages]  = useState<string[]>([]);
  const [downloading,  setDownloading]  = useState<Record<string, boolean>>({});

  const fetchTemplates = async () => {
    try {
      const [tplRes, imgRes] = await Promise.all([
        api.templates.list(),
        api.templates.localImages().catch(() => ({ aliases: [] })),
      ]);
      setTemplates(tplRes.templates);
      setLocalImages(imgRes.aliases);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openCreate = () => {
    setForm(emptyForm()); setEditId(null); setModalMode('create');
    setError(''); setModalOpen(true);
  };

  const openEdit = (t: TemplateDTO) => {
    setForm({
      name: t.name, description: t.description ?? '',
      type: t.type, role: t.role, imageAlias: t.imageAlias,
      cpuLimit: t.cpuLimit?.toString() ?? '',
      memoryLimit: t.memoryLimit ?? '', diskLimit: t.diskLimit ?? '',
      isActive: t.isActive,
    });
    setEditId(t.id); setModalMode('edit'); setError(''); setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      name: form.name, description: form.description || undefined,
      type: form.type, role: form.role, imageAlias: form.imageAlias,
      cpuLimit:    form.cpuLimit    ? Number(form.cpuLimit)    : undefined,
      memoryLimit: form.memoryLimit || undefined,
      diskLimit:   form.diskLimit   || undefined,
      isActive: form.isActive,
    };
    try {
      if (modalMode === 'create') await api.templates.create(payload);
      else if (editId) await api.templates.patch(editId, payload);
      setModalOpen(false);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save template');
    } finally { setSaving(false); }
  };

  const handleDownload = async (alias: string) => {
    setDownloading(prev => ({ ...prev, [alias]: true }));
    try {
      await api.templates.downloadImage(alias);
      const res = await api.templates.localImages().catch(() => ({ aliases: [] }));
      setLocalImages(res.aliases);
    } catch (e) {
      alert('ダウンロードに失敗しました');
    } finally {
      setDownloading(prev => ({ ...prev, [alias]: false }));
    }
  };

  const handleDelete = async (t: TemplateDTO) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    setDeleteErr(prev => ({ ...prev, [t.id]: '' }));
    try {
      await api.templates.delete(t.id);
      await fetchTemplates();
    } catch (e) {
      const msg = e instanceof ApiError && e.error === 'TEMPLATE_IN_USE'
        ? '使用中のため削除できません' : '削除に失敗しました';
      setDeleteErr(prev => ({ ...prev, [t.id]: msg }));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Templates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage instance templates</p>
        </div>
      </div>

      {/* Image Alias の説明 */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <p className="font-medium mb-1">Image Alias について</p>
        <p className="text-xs text-blue-700">
          Incus のイメージリポジトリから取得します。利用可能なイメージは{' '}
          <a href="https://images.linuxcontainers.org/" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-blue-900">
            images.linuxcontainers.org
          </a>{' '}
          で確認できます。
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {['ubuntu/22.04', 'ubuntu/24.04', 'debian/12', 'rockylinux/9', 'alpine/3.19'].map(alias => (
            <code key={alias} className="text-xs px-2 py-0.5 bg-white border border-blue-200 rounded font-mono text-blue-700">
              {alias}
            </code>
          ))}
        </div>
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
            {/* アイコン + 名前 */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5"/>
                    <path d="M8 21h8M12 17v4" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">{t.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{t.imageAlias}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 items-end flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  t.type === 'preset'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}>{TYPE_LABELS[t.type]}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  t.role === 'reverse_proxy'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>{ROLE_LABELS[t.role]}</span>
              </div>
            </div>

            {/* 説明 */}
            {t.description && <p className="text-xs text-slate-500">{t.description}</p>}

            {/* リソース情報 */}
            <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
              {t.cpuLimit    && <span>CPU: {t.cpuLimit} vCPU</span>}
              {t.memoryLimit && <span>RAM: {t.memoryLimit}</span>}
              {t.diskLimit   && <span>Disk: {t.diskLimit}</span>}
            </div>

            {/* isActive */}
            {!t.isActive && (
              <span className="text-xs text-slate-400 italic">Inactive</span>
            )}

            {/* イメージダウンロード状態 */}
            <div className="flex items-center justify-between">
              {localImages.includes(t.imageAlias) ? (
                <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-medium">
                  ✓ ダウンロード済み
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full">
                  未ダウンロード
                </span>
              )}
              {!localImages.includes(t.imageAlias) && (
                <button
                  onClick={() => handleDownload(t.imageAlias)}
                  disabled={downloading[t.imageAlias]}
                  className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {downloading[t.imageAlias] ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      DL中...
                    </>
                  ) : '↓ DL'}
                </button>
              )}
            </div>

            {/* エラー */}
            {deleteErr[t.id] && (
              <p className="text-xs text-red-500">{deleteErr[t.id]}</p>
            )}

            {/* アクション */}
            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100">
              <button
                onClick={() => openEdit(t)}
                className="flex-1 text-xs py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >Edit</button>
              <button
                onClick={() => handleDelete(t)}
                className="flex-1 text-xs py-1.5 border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >Delete</button>
            </div>
          </div>
        ))}

        {/* 追加カード */}
        <button
          onClick={openCreate}
          className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors min-h-[160px]"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-medium">Add Template</span>
        </button>
      </div>

      {/* モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-slate-800 mb-5">
              {modalMode === 'create' ? 'New Template' : 'Edit Template'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'preset' | 'custom' }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="preset">Preset</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'general' | 'reverse_proxy' }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="general">General</option>
                    <option value="reverse_proxy">Reverse Proxy</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Image Alias * (例: ubuntu/22.04)</label>
                  <input required value={form.imageAlias} onChange={e => setForm(f => ({ ...f, imageAlias: e.target.value }))}
                    placeholder="ubuntu/22.04"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">CPU Limit (vCPU)</label>
                  <input type="number" min={1} max={32} value={form.cpuLimit}
                    onChange={e => setForm(f => ({ ...f, cpuLimit: e.target.value }))}
                    placeholder="2"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Memory Limit</label>
                  <input value={form.memoryLimit} onChange={e => setForm(f => ({ ...f, memoryLimit: e.target.value }))}
                    placeholder="512MB"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Disk Limit</label>
                  <input value={form.diskLimit} onChange={e => setForm(f => ({ ...f, diskLimit: e.target.value }))}
                    placeholder="10GB"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <input type="checkbox" id="isActive" checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                  <label htmlFor="isActive" className="text-sm text-slate-700">Active</label>
                </div>
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
