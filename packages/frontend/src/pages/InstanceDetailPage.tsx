// packages/frontend/src/pages/InstanceDetailPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.ts';
import { useAuth } from '../hooks/useAuth.tsx';
import LogViewer from '../components/logs/LogViewer.tsx';
import TerminalViewer from '../components/terminal/TerminalViewer.tsx';
import StorageTab from '../components/instances/StorageTab.tsx';
import type { InstanceDTO, PortForwardDTO } from '../api/client.ts';

type Tab = 'logs' | 'terminal' | 'storage' | 'portforwards';

const TAB_LABELS: Record<Tab, string> = {
  logs:         'Logs',
  terminal:     'Terminal',
  storage:      'Storage',
  portforwards: 'Port Forwards',
};

// ── ステータスバッジ ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InstanceDTO['status'] }) {
  const styles: Record<InstanceDTO['status'], string> = {
    running:  'bg-emerald-100 text-emerald-700',
    stopped:  'bg-slate-100 text-slate-600',
    starting: 'bg-yellow-100 text-yellow-700',
    stopping: 'bg-yellow-100 text-yellow-700',
    error:    'bg-red-100 text-red-700',
  };
  const dots: Record<InstanceDTO['status'], string> = {
    running:  'bg-emerald-500',
    stopped:  'bg-slate-400',
    starting: 'bg-yellow-500 animate-pulse',
    stopping: 'bg-yellow-500 animate-pulse',
    error:    'bg-red-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {status}
    </span>
  );
}

// ── PortForwards タブ ─────────────────────────────────────────────────────

function PortForwardsTab({ instanceId }: { instanceId: string }) {
  const [portForwards, setPortForwards] = useState<PortForwardDTO[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [hostPort,     setHostPort]     = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [protocol,     setProtocol]     = useState<'tcp' | 'udp'>('tcp');
  const [description,  setDescription]  = useState('');
  const [addError,     setAddError]     = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);

  const loadPFs = async () => {
    try {
      setLoading(true);
      const data = await api.portForwards.list(instanceId);
      setPortForwards(data.portForwards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPFs(); }, [instanceId]);

  const handleAdd = async () => {
    setAddError(null);
    try {
      setSubmitting(true);
      await api.portForwards.create(instanceId, {
        hostPort:      Number(hostPort),
        containerPort: Number(containerPort),
        protocol,
        description:   description || undefined,
      });
      setHostPort(''); setContainerPort(''); setDescription('');
      await loadPFs();
    } catch (e: unknown) {
      const err = e as { error?: string };
      if (err?.error === 'PORT_CONFLICT') {
        setAddError('ポートが使用中です');
      } else {
        setAddError('追加に失敗しました');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pfId: string) => {
    await api.portForwards.delete(instanceId, pfId);
    await loadPFs();
  };

  const handleToggle = async (pf: PortForwardDTO) => {
    await api.portForwards.patch(instanceId, pf.id, { isEnabled: !pf.isEnabled });
    await loadPFs();
  };

  if (loading) return <div className="text-slate-400 text-sm py-4">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* 一覧 */}
      {portForwards.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6 border border-dashed border-slate-200 rounded-xl">
          ポートフォワードが設定されていません
        </p>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-2.5 font-medium text-slate-600">ホストポート</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">コンテナポート</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">プロトコル</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">説明</th>
                <th className="px-4 py-2.5 font-medium text-slate-600">有効</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {portForwards.map((pf) => (
                <tr key={pf.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{pf.hostPort}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{pf.containerPort}</td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded uppercase">
                      {pf.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{pf.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(pf)}
                      className={`w-8 h-4 rounded-full transition-colors ${pf.isEnabled ? 'bg-blue-500' : 'bg-slate-300'}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(pf.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 追加フォーム */}
      <div className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-medium text-slate-700 mb-3">ポートフォワードを追加</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">ホストポート</label>
            <input type="number" value={hostPort} onChange={e => setHostPort(e.target.value)}
              min={1024} max={65535} placeholder="8080"
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">コンテナポート</label>
            <input type="number" value={containerPort} onChange={e => setContainerPort(e.target.value)}
              min={1} max={65535} placeholder="80"
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">プロトコル</label>
            <select value={protocol} onChange={e => setProtocol(e.target.value as 'tcp' | 'udp')}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs text-slate-500 mb-1">説明（任意）</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="例: Web サーバー"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={handleAdd} disabled={submitting || !hostPort || !containerPort}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            追加
          </button>
        </div>
        {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
      </div>
    </div>
  );
}

// ── InstanceDetailPage ────────────────────────────────────────────────────

export default function InstanceDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const [instance, setInstance] = useState<InstanceDTO | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('logs');
  const [loading,   setLoading]   = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadInstance = async () => {
    if (!id) return;
    try {
      const data = await api.instances.get(id);
      setInstance(data.instance);
    } catch {
      navigate('/instances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInstance(); }, [id]);

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (!instance) return;
    setActionError(null);
    try {
      if (action === 'delete') {
        if (!window.confirm(`インスタンス "${instance.name}" を削除しますか？`)) return;
        await api.instances.delete(instance.id);
        navigate('/instances');
        return;
      }
      await api.instances[action](instance.id);
      await loadInstance();
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      setActionError(err?.message ?? `${action} に失敗しました`);
    }
  };

  if (loading || !instance) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        読み込み中...
      </div>
    );
  }

  const isRunning  = instance.status === 'running';
  const isBusy     = instance.status === 'starting' || instance.status === 'stopping';

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/instances')}
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            ← 戻る
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold font-mono text-slate-800">{instance.name}</h1>
              <StatusBadge status={instance.status} />
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
              {instance.ipAddress && (
                <span className="font-mono">{instance.ipAddress}</span>
              )}
              <span>{instance.templateName ?? '—'}</span>
              <span>Owner: {instance.ownerUsername}</span>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex items-center gap-2">
          {actionError && (
            <span className="text-xs text-red-600">{actionError}</span>
          )}
          {!isRunning && !isBusy && (
            <button
              onClick={() => handleAction('start')}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
            >
              Start
            </button>
          )}
          {isRunning && (
            <>
              <button
                onClick={() => handleAction('stop')}
                className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300"
              >
                Stop
              </button>
              <button
                onClick={() => handleAction('restart')}
                className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300"
              >
                Restart
              </button>
            </>
          )}
          <button
            onClick={() => handleAction('delete')}
            disabled={isRunning || isBusy}
            className="px-3 py-1.5 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-0">
          {(['logs', 'terminal', 'storage', 'portforwards'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'logs' && (
        <LogViewer instanceId={instance.id} type="instance" />
      )}

      {activeTab === 'terminal' && isRunning && (
        <TerminalViewer instanceId={instance.id} userId={user?.id ?? ''} />
      )}
      {activeTab === 'terminal' && !isRunning && (
        <div className="bg-slate-900 rounded-xl p-8 text-slate-400 text-sm text-center">
          インスタンスを起動してからターミナルに接続できます
        </div>
      )}

      {activeTab === 'storage' && (
        <StorageTab
          instanceId={instance.id}
          instanceStatus={instance.status}
        />
      )}

      {activeTab === 'portforwards' && (
        <PortForwardsTab instanceId={instance.id} />
      )}
    </div>
  );
}
