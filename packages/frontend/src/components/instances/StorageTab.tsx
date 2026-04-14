// packages/frontend/src/components/instances/StorageTab.tsx
// InstanceDetailPage の Storage タブとして使うコンポーネント
import { useState } from 'react';
import { useInstanceStorage } from '../../hooks/useStorage.ts';
import { useStorageVolumes } from '../../hooks/useStorage.ts';
import type { StorageAttachmentDTO } from '../../hooks/useStorage.ts';

type Props = {
  instanceId: string;
  instanceStatus: string;
};

export default function StorageTab({ instanceId, instanceStatus }: Props) {
  const { attachments, loading, error, attach, detach, reload } = useInstanceStorage(instanceId);
  const { volumes } = useStorageVolumes();

  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [mountPath,        setMountPath]         = useState('/mnt/data');
  const [attachError,      setAttachError]       = useState<string | null>(null);
  const [attaching,        setAttaching]         = useState(false);
  const [detachingId,      setDetachingId]       = useState<string | null>(null);

  // 未アタッチのボリュームだけフィルタ
  const attachedVolumeIds = new Set(attachments.map((a) => a.volumeId));
  const availableVolumes  = volumes.filter((v) => !attachedVolumeIds.has(v.id));

  const handleAttach = async () => {
    if (!selectedVolumeId) { setAttachError('ボリュームを選択してください'); return; }
    if (!mountPath.trim()) { setAttachError('マウントパスを入力してください'); return; }
    try {
      setAttaching(true); setAttachError(null);
      await attach(selectedVolumeId, mountPath.trim());
      setSelectedVolumeId(''); setMountPath('/mnt/data');
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      if (err?.error === 'MOUNT_PATH_CONFLICT') {
        setAttachError('このマウントパスはすでに使用中です');
      } else if (err?.error === 'VOLUME_ALREADY_ATTACHED') {
        setAttachError('このボリュームはすでにアタッチされています');
      } else if (err?.error === 'VOLUME_NOT_OWNED') {
        setAttachError('このボリュームへのアクセス権がありません');
      } else {
        setAttachError(err?.message ?? 'アタッチに失敗しました');
      }
    } finally {
      setAttaching(false);
    }
  };

  const handleDetach = async (a: StorageAttachmentDTO) => {
    if (!window.confirm(
      `ボリューム "${a.displayName}" を ${a.mountPath} からデタッチしますか？\nデータは保持されます。`,
    )) return;
    try {
      setDetachingId(a.id);
      await detach(a.id);
    } catch {
      // エラーは reload で状態を同期
      reload();
    } finally {
      setDetachingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* ── アタッチ済みボリューム一覧 ── */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">
          アタッチ済みボリューム
          <span className="ml-2 text-xs font-normal text-slate-400">
            ({attachments.length}件)
          </span>
        </h3>

        {attachments.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center border border-dashed border-slate-200 rounded-xl">
            ボリュームがアタッチされていません
          </p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-600">表示名</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">内部名</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">プール</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">マウントパス</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">アタッチ日時</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{a.displayName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.volumeName}</td>
                    <td className="px-4 py-3 text-slate-600">{a.poolName}</td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">{a.mountPath}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(a.attachedAt).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDetach(a)}
                        disabled={detachingId === a.id}
                        className="text-red-500 hover:text-red-700 text-xs disabled:text-slate-300"
                      >
                        {detachingId === a.id ? 'デタッチ中...' : 'デタッチ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── アタッチフォーム ── */}
      <div className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-medium text-slate-700 mb-3">ボリュームをアタッチ</h3>

        {instanceStatus === 'running' && (
          <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-lg px-3 py-2">
            💡 起動中のインスタンスへのアタッチは即時反映されます
          </div>
        )}

        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">ボリューム</label>
            <select
              value={selectedVolumeId}
              onChange={(e) => setSelectedVolumeId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選択してください</option>
              {availableVolumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.size}) — {v.poolName}
                </option>
              ))}
            </select>
            {availableVolumes.length === 0 && volumes.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">利用可能なボリュームがありません</p>
            )}
            {volumes.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                ボリュームが存在しません。
                <a href="/storage" className="text-blue-600 hover:underline ml-1">
                  Storage ページ
                </a>
                で作成してください
              </p>
            )}
          </div>

          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">マウントパス</label>
            <input
              type="text"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
              placeholder="/mnt/data"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleAttach}
            disabled={attaching || !selectedVolumeId}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {attaching && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            アタッチ
          </button>
        </div>

        {attachError && (
          <p className="mt-2 text-xs text-red-600">{attachError}</p>
        )}
      </div>
    </div>
  );
}
