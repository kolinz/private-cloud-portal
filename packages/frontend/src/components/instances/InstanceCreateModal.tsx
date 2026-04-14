// packages/frontend/src/components/instances/InstanceCreateModal.tsx
import { useState, useEffect } from 'react';
import { api, type TemplateDTO, ApiError } from '../../api/client.ts';

type Props = {
  isOpen:   boolean;
  onClose:  () => void;
  onCreate: (body: { name: string; templateId: string }) => Promise<unknown>;
};

const NAME_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export default function InstanceCreateModal({ isOpen, onClose, onCreate }: Props) {
  const [name,       setName]       = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates,  setTemplates]  = useState<TemplateDTO[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [nameError,  setNameError]  = useState('');

  useEffect(() => {
    if (isOpen) {
      api.templates.list().then(res => {
        const active = res.templates.filter(t => t.isActive);
        setTemplates(active);
        if (active.length > 0) setTemplateId(active[0].id);
      });
      setName('');
      setError('');
      setNameError('');
    }
  }, [isOpen]);

  const validateName = (value: string) => {
    if (!value) return 'インスタンス名を入力してください';
    if (value.length < 2) return '2文字以上で入力してください';
    if (value.length > 63) return '63文字以内で入力してください';
    if (!NAME_REGEX.test(value)) return '小文字英数字とハイフンのみ使用可（先頭・末尾は英数字）';
    return '';
  };

  const handleNameChange = (v: string) => {
    setName(v);
    setNameError(validateName(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(name);
    if (err) { setNameError(err); return; }
    if (!templateId) { setError('テンプレートを選択してください'); return; }

    setLoading(true);
    setError('');
    try {
      await onCreate({ name, templateId });
      onClose();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'Failed to create instance');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* モーダル */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-800">New Instance</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* インスタンス名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Instance Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="my-instance"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono ${
                nameError ? 'border-red-300 bg-red-50' : 'border-slate-300'
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
            <p className="mt-1 text-xs text-slate-400">小文字英数字・ハイフン、2〜63文字</p>
          </div>

          {/* テンプレート選択 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Template
            </label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.cpuLimit ? ` — ${t.cpuLimit} vCPU` : ''}
                  {t.memoryLimit ? ` / ${t.memoryLimit}` : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!nameError}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
