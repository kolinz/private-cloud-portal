// packages/frontend/src/pages/ProxyPage.tsx
import { useState, useEffect } from 'react';
import { api, ApiError } from '../api/client.ts';
import type { ProxyRouteDTO, InstanceDTO } from '../api/client.ts';

export default function ProxyPage() {
  const [routes,    setRoutes]    = useState<ProxyRouteDTO[]>([]);
  const [instances, setInstances] = useState<InstanceDTO[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState({ targetInstanceId: '', path: '', targetPort: '80' });
  const [error,     setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    try {
      const [r, i] = await Promise.all([api.proxy.list(), api.instances.list()]);
      setRoutes(r.routes);
      setInstances(i.instances.filter(inst => inst.status === 'running'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.proxy.create({
        targetInstanceId: form.targetInstanceId,
        path:             form.path,
        targetPort:       Number(form.targetPort),
      });
      setForm({ targetInstanceId: '', path: '', targetPort: '80' });
      await fetchAll();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.error === 'HOSTNAME_TAKEN')    setError('このパスはすでに使用中です');
        else if (err.error === 'TARGET_NOT_RUNNING') setError('接続先コンテナが起動していません');
        else setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async (id: string, path: string) => {
    if (!confirm(`"${path}" の接続を切断しますか？`)) return;
    await api.proxy.delete(id);
    await fetchAll();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Proxy Routes</h1>
        <p className="text-sm text-slate-500 mt-0.5">ホスト上のnginxでパスベースのリバースプロキシを管理します</p>
      </div>

      {/* 説明バナー */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
        <div>
          <span className="font-semibold">アクセス方法：</span>{' '}
          <code className="bg-blue-100 px-1 rounded font-mono text-xs">http://localhost:8880/app1</code>
          {' '}のようにアクセスすると、対応するコンテナにリクエストが転送されます。
          <span className="block mt-0.5 text-blue-600 text-xs">
            ※ ホスト上のnginxが8880番ポートで動作します。nginx未インストールの場合は
            <code className="bg-blue-100 px-0.5 rounded font-mono">sudo apt install nginx</code> を実行してください。
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Active Routes */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Active Routes</h2>
          </div>
          {routes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No active routes</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">パス</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">転送先</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {routes.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <code className="font-mono text-sm text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        {r.path}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      {r.targetInstanceName}
                      <span className="text-slate-400 text-xs ml-1">:{r.targetPort}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDisconnect(r.id, r.path)}
                        className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                      >
                        切断
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* New Connection Form */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Connection</h2>
          <form onSubmit={handleConnect} className="space-y-4">

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                接続先コンテナ（Running のみ）
              </label>
              <select
                required
                value={form.targetInstanceId}
                onChange={e => setForm(f => ({ ...f, targetInstanceId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {instances.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.ipAddress ?? 'no IP'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                パス <span className="text-slate-400 font-normal">（例: /app1）</span>
              </label>
              <input
                type="text"
                required
                placeholder="/app1"
                value={form.path}
                onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">/ で始まる英数字・ハイフン・アンダースコア</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                コンテナのポート番号
              </label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={form.targetPort}
                onChange={e => setForm(f => ({ ...f, targetPort: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? '接続中...' : '接続する'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
