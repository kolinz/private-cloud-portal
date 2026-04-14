// packages/frontend/src/pages/InstancesPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.tsx';
import { useInstances } from '../hooks/useInstances.ts';
import InstanceStatusBadge from '../components/instances/InstanceStatusBadge.tsx';
import InstanceCreateModal from '../components/instances/InstanceCreateModal.tsx';
import { ApiError } from '../api/client.ts';

export default function InstancesPage() {
  const { isAdmin }                   = useAuth();
  const { instances, isLoading, error, create, start, stop, restart, remove } = useInstances();
  const navigate                      = useNavigate();
  const [modalOpen, setModalOpen]     = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // サマリー集計
  const total   = instances.length;
  const running = instances.filter(i => i.status === 'running').length;
  const stopped = instances.filter(i => i.status === 'stopped').length;

  const handleAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try { await fn(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Operation failed'); }
  };

  const isTransient = (status: string) => status === 'starting' || status === 'stopping';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Instances</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage your containers</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New Instance
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total',   value: total,   color: 'text-slate-700', bg: 'bg-white' },
          { label: 'Running', value: running, color: 'text-emerald-600', bg: 'bg-white' },
          { label: 'Stopped', value: stopped, color: 'text-slate-500',  bg: 'bg-white' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} border border-slate-200 rounded-xl px-5 py-4`}>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* エラー表示 */}
      {(error || actionError) && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error ?? actionError}
        </div>
      )}

      {/* テーブル */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5"/>
              <path d="M8 21h8M12 17v4" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="text-sm">No instances yet</p>
            <button onClick={() => setModalOpen(true)} className="mt-3 text-sm text-blue-600 hover:underline">
              Create your first instance
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Template</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Owner</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">IP</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instances.map(inst => (
                <tr
                  key={inst.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/instances/${inst.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-slate-800 font-medium">{inst.name}</td>
                  <td className="px-4 py-3 text-slate-500">{inst.templateName ?? '—'}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-500">{inst.ownerUsername}</td>}
                  <td className="px-4 py-3 font-mono text-slate-500 text-xs">{inst.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3">
                    <InstanceStatusBadge status={inst.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Start */}
                      {inst.status === 'stopped' && (
                        <button
                          onClick={() => handleAction(() => start(inst.id))}
                          disabled={isTransient(inst.status)}
                          className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-40"
                        >
                          Start
                        </button>
                      )}
                      {/* Stop */}
                      {inst.status === 'running' && (
                        <button
                          onClick={() => handleAction(() => stop(inst.id))}
                          disabled={isTransient(inst.status)}
                          className="px-2.5 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-40"
                        >
                          Stop
                        </button>
                      )}
                      {/* Restart */}
                      {inst.status === 'running' && (
                        <button
                          onClick={() => handleAction(() => restart(inst.id))}
                          disabled={isTransient(inst.status)}
                          className="px-2.5 py-1 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-40"
                        >
                          Restart
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${inst.name}"?`)) handleAction(() => remove(inst.id));
                        }}
                        disabled={inst.status === 'running' || isTransient(inst.status)}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 作成モーダル */}
      <InstanceCreateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={create}
      />
    </div>
  );
}
