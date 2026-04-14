// packages/frontend/src/pages/StorageVolumesPage.tsx
import { useState, useEffect } from 'react';
import { useStorageVolumes } from '../hooks/useStorage.ts';
import { api } from '../api/client.ts';

// ── サイズ選択肢 ──────────────────────────────────────────────────────────
const PRESET_SIZES = ['512MB', '1GB', '5GB', '10GB', '20GB', '50GB'];

// ── VolumeCreateModal ─────────────────────────────────────────────────────

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function VolumeCreateModal({ isOpen, onClose, onCreated }: ModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [poolName,    setPoolName]    = useState('default');
  const [sizePreset,  setSizePreset]  = useState('10GB');
  const [customSize,  setCustomSize]  = useState('');
  const [description, setDescription] = useState('');
  const [pools,       setPools]       = useState<string[]>(['default']);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    api.storage.listPools().then(d => setPools(d.pools)).catch(() => {});
  }, [isOpen]);

  const reset = () => {
    setDisplayName(''); setPoolName('default'); setSizePreset('10GB');
    setCustomSize(''); setDescription(''); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    const size = sizePreset === 'custom' ? customSize.trim() : sizePreset;
    if (!displayName.trim()) { setError('表示名を入力してください'); return; }
    if (!size) { setError('サイズを入力してください'); return; }
    if (sizePreset === 'custom' && !/^\d+(MB|GB)$/.test(size)) {
      setError('サイズは "512MB" または "10GB" の形式で入力してください');
      return;
    }
    try {
      setSubmitting(true); setError(null);
      await api.storage.createVolume({
        displayName: displayName.trim(),
        size,
        poolName,
        description: description.trim() || undefined,
      });
      reset(); onCreated(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ボリュームの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">
          新しいストレージボリューム
        </h2>

        <div className="space-y-4">
          {/* 表示名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              表示名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="例: データストレージ"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* プール選択 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ストレージプール <span className="text-red-500">*</span>
            </label>
            <select
              value={poolName}
              onChange={e => setPoolName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pools.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* サイズ */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              サイズ <span className="text-red-500">*</span>
            </label>
            <select
              value={sizePreset}
              onChange={e => setSizePreset(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            >
              {PRESET_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="custom">カスタム...</option>
            </select>
            {sizePreset === 'custom' && (
              <input
                type="text"
                value={customSize}
                onChange={e => setCustomSize(e.target.value)}
                placeholder="例: 15GB"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* 説明 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              説明（任意）
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="このボリュームの用途など"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            作成
          </button>
        </div>
      </div>
    </div>
  );
}

// ── StorageVolumesPage ────────────────────────────────────────────────────

export default function StorageVolumesPage() {
  const { volumes, loading, error, reload, deleteVolume } = useStorageVolumes();
  const [showModal,    setShowModal]    = useState(false);
  const [deleteError,  setDeleteError]  = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  const handleDelete = async (id: string, displayName: string) => {
    if (!window.confirm(`ボリューム "${displayName}" を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      setDeletingId(id); setDeleteError(null);
      await deleteVolume(id);
    } catch (e: unknown) {
      const err = e as { details?: { attachedTo?: { instanceName: string }[] }; message?: string };
      if (err?.details?.attachedTo) {
        const names = err.details.attachedTo.map((a: { instanceName: string }) => a.instanceName).join(', ');
        setDeleteError(`アタッチ中のため削除できません（${names}）`);
      } else {
        setDeleteError(err?.message ?? '削除に失敗しました');
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Storage Volumes</h1>
          <p className="text-sm text-slate-500 mt-1">
            永続ストレージボリュームの管理。インスタンスとは独立して存在します。
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <span className="text-lg leading-none">+</span>
          新しいボリューム
        </button>
      </div>

      {/* ストレージ種別インフォ */}
      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-blue-500 text-lg leading-tight">🗄️</span>
        <div className="text-sm text-blue-800 leading-relaxed">
          <span className="font-semibold">ファイルストレージ（Amazon EFS 相当）</span>
          <span className="mx-2 text-blue-300">|</span>
          コンテナ内の指定パスにディレクトリとしてマウントされます。通常のファイル操作（読み書き・削除）がそのまま使えます。
          インスタンスを削除してもボリュームのデータは保持され、別のインスタンスに再アタッチできます。
        </div>
      </div>

      {/* エラー表示 */}
      {(error || deleteError) && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error || deleteError}
        </div>
      )}

      {/* テーブル */}
      {volumes.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
          <p className="text-2xl mb-2">🗄️</p>
          <p>ストレージボリュームがありません</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-blue-600 hover:text-blue-800 text-sm"
          >
            最初のボリュームを作成する
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">表示名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">内部名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">プール</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">サイズ</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">オーナー</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">使用中</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">作成日</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((vol) => (
                <tr key={vol.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {vol.displayName}
                    {vol.description && (
                      <p className="text-xs text-slate-400 font-normal mt-0.5">{vol.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{vol.name}</td>
                  <td className="px-4 py-3 text-slate-600">{vol.poolName}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-slate-100 text-slate-700 text-xs font-mono px-2 py-0.5 rounded">
                      {vol.size}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{vol.ownerUsername}</td>
                  <td className="px-4 py-3">
                    {vol.attachments.length === 0 ? (
                      <span className="text-slate-400 text-xs">未使用</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {vol.attachments.map((a) => (
                          <span
                            key={a.instanceId}
                            className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full cursor-help"
                            title={`マウントパス: ${a.mountPath}\n\nターミナルから確認:\n  incus config device show ${a.instanceName}`}
                          >
                            {a.instanceName}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(vol.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(vol.id, vol.displayName)}
                      disabled={vol.attachments.length > 0 || deletingId === vol.id}
                      title={vol.attachments.length > 0 ? 'アタッチ中のため削除不可' : undefined}
                      className="text-red-500 hover:text-red-700 text-xs disabled:text-slate-300 disabled:cursor-not-allowed"
                    >
                      {deletingId === vol.id ? '削除中...' : '削除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VolumeCreateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={reload}
      />
    </div>
  );
}
