// packages/frontend/src/pages/DashboardPage.tsx

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.tsx';

// ─── 型 ──────────────────────────────────────────────────────────────────────

type InstanceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

interface HostResources {
  memory: { total: number; used: number };
  disk:   { total: number; used: number };
  cpu:    { cores: number; threads: number };
}

interface AllocatedCapacity { memoryBytes: number; diskBytes: number }

interface ResourceMetrics {
  memory: { usage: number; peak: number; total: number };
  disk:   { rootUsage: number };
  cpu:    { usageNs: number };
}

interface InstanceResourceRow {
  id: string; name: string; status: InstanceStatus;
  ownerUserId: string; ownerUsername: string;
  templateName: string | null; ipAddress: string | null; createdAt: string;
  resources: ResourceMetrics | null;
  memoryLimitBytes: number | null; diskLimitBytes: number | null;
}

interface UserResourceSummary {
  userId: string; username: string;
  instanceCount: number; runningCount: number;
  memoryUsage: number; diskUsage: number;
  memoryAlloc: number; diskAlloc: number;
}

interface DashboardData {
  instances: {
    total: number; running: number; stopped: number;
    starting: number; stopping: number; error: number;
    list: InstanceResourceRow[];
  };
  users:     { total: number; active: number; admins: number };
  templates: { total: number; active: number };
  resources: {
    host:          HostResources;
    containerUsage: { memory: number; disk: number };
    allocated:     AllocatedCapacity;
    perUser:       UserResourceSummary[];
  };
  system: {
    name: string; uptimeSeconds: number;
    nodeVersion: string; platform: string; generatedAt: string;
  };
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function fmtBytes(b: number, d = 1): string {
  if (b <= 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / k**i).toFixed(d)} ${sizes[i]}`;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

function barColor(p: number, base: string): string {
  if (p >= 90) return 'bg-red-500';
  if (p >= 70) return 'bg-yellow-400';
  return base;
}

function remainColor(p: number): string {
  if (p >= 90) return 'text-red-600';
  if (p >= 70) return 'text-yellow-600';
  return 'text-green-600';
}

// ─── ホストリソースゲージ ─────────────────────────────────────────────────────
//
// ホスト物理量を土台に、3層で表示する:
//   [████████░░░░░░░░░░░░]
//    ↑コンテナ使用  ↑割り当て済み(上限)  ↑残余(未割り当て)

function HostGauge({
  label, icon, color,
  hostTotal, hostUsed,
  containerUsed, allocated,
  noHostNote,
}: {
  label:         string;
  icon:          React.ReactNode;
  color:         'blue' | 'emerald';
  hostTotal:     number;
  hostUsed:      number;
  containerUsed: number;
  allocated:     number;
  noHostNote?:   string;
}) {
  const hasHost = hostTotal > 0;
  const base    = color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500';

  // パーセント計算（ホスト物理量基準）
  const containerPct  = pct(containerUsed, hostTotal);
  const allocatedPct  = pct(allocated, hostTotal);
  const hostUsedPct   = pct(hostUsed, hostTotal);

  // 残余 = ホスト物理量 - 割り当て済み容量
  const remaining     = hasHost ? Math.max(0, hostTotal - allocated) : null;
  const remainingPct  = pct(remaining ?? 0, hostTotal);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={color === 'emerald' ? 'text-emerald-600' : 'text-blue-600'}>{icon}</span>
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
        {hasHost && (
          <span className="ml-auto text-xs font-mono text-slate-400">
            ホスト物理: {fmtBytes(hostTotal)}
          </span>
        )}
      </div>

      {hasHost ? (
        <>
          {/* スタック型プログレスバー */}
          <div className="relative h-5 bg-slate-100 rounded-full overflow-hidden">
            {/* 割り当て済み（薄い色・背景） */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 opacity-25 ${base}`}
              style={{ width: `${allocatedPct}%` }}
            />
            {/* コンテナ実使用量（濃い色・前面） */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${barColor(containerPct, base)}`}
              style={{ width: `${containerPct}%` }}
            />
            {/* 割り当て済み境界線 */}
            {allocatedPct > 0 && (
              <div
                className="absolute top-0 h-full w-px bg-slate-400/50"
                style={{ left: `${allocatedPct}%` }}
                title={`割り当て済み上限: ${fmtBytes(allocated)}`}
              />
            )}
          </div>

          {/* 凡例 */}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${base}`} />
              <span className="text-slate-600">コンテナ使用</span>
              <span className="font-mono font-semibold text-slate-800">{fmtBytes(containerUsed)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm opacity-30 ${base}`} />
              <span className="text-slate-600">割り当て済み</span>
              <span className="font-mono font-semibold text-slate-800">{fmtBytes(allocated)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-200" />
              <span className="text-slate-600">ホスト OS 使用</span>
              <span className="font-mono font-semibold text-slate-800">{fmtBytes(hostUsed)}</span>
            </span>
          </div>

          {/* 数値パネル */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5 text-xs">
              <p className="text-slate-400">コンテナ使用</p>
              <p className="font-mono font-semibold text-slate-700 mt-0.5">{fmtBytes(containerUsed)}</p>
              <p className="text-slate-400 mt-0.5">{containerPct}%</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 text-xs">
              <p className="text-slate-400">割り当て済み上限</p>
              <p className="font-mono font-semibold text-slate-700 mt-0.5">{fmtBytes(allocated)}</p>
              <p className="text-slate-400 mt-0.5">{allocatedPct}%</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 text-xs">
              <p className="text-slate-400">未割り当て残量</p>
              <p className={`font-mono font-semibold mt-0.5 ${remainColor(100 - remainingPct)}`}>
                {fmtBytes(remaining!)}
              </p>
              <p className={`mt-0.5 ${remainColor(100 - remainingPct)}`}>{remainingPct}%</p>
            </div>
          </div>

          {/* ホスト OS の使用量注釈 */}
          <p className="text-xs text-slate-400">
            ※ ホスト OS 自体の使用量 {fmtBytes(hostUsed)}（{hostUsedPct}%）を含む
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <div className="h-5 bg-slate-100 rounded-full" />
          <p className="text-xs text-slate-400 italic">{noHostNote ?? 'ホスト情報を取得できません'}</p>
          <div className="text-xs font-mono text-slate-500">
            コンテナ使用: {fmtBytes(containerUsed)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ユーザー別テーブル ──────────────────────────────────────────────────────

function PerUserSection({ perUser, hostMemory, hostDisk }: {
  perUser:    UserResourceSummary[];
  hostMemory: number;
  hostDisk:   number;
}) {
  if (perUser.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">ユーザー別リソース使用状況</h2>
      <p className="text-sm text-slate-400">インスタンスなし</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">ユーザー別リソース使用状況</h2>
        <p className="text-xs text-slate-400 mt-0.5">バーはホスト物理量基準。実使用 / 割り当て上限 / 残量を表示</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-32">ユーザー</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-24">状態</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 min-w-[240px]">メモリ</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 min-w-[200px]">ディスク</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {perUser.map(u => {
              const mUsePct   = pct(u.memoryUsage, hostMemory);
              const mAllocPct = pct(u.memoryAlloc, hostMemory);
              const dUsePct   = pct(u.diskUsage,   hostDisk);
              const dAllocPct = pct(u.diskAlloc,   hostDisk);

              return (
                <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{u.username}</p>
                    <p className="text-xs text-slate-400">{u.instanceCount} 件</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-green-600 font-semibold text-sm">{u.runningCount}
                      <span className="text-xs font-normal text-slate-400 ml-1">running</span>
                    </p>
                  </td>

                  {/* メモリ */}
                  <td className="px-4 py-3">
                    <div className="w-48 space-y-1">
                      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`absolute h-full rounded-full opacity-30 bg-blue-400`}
                          style={{ width: `${mAllocPct}%` }} />
                        <div className={`absolute h-full rounded-full ${barColor(mUsePct, 'bg-blue-500')}`}
                          style={{ width: `${mUsePct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-slate-600">{fmtBytes(u.memoryUsage)}</span>
                        <span className="text-slate-400">/ {fmtBytes(u.memoryAlloc)}</span>
                      </div>
                      {u.memoryAlloc > 0 && (
                        <p className={`text-xs font-mono ${remainColor(100 - pct(u.memoryAlloc, hostMemory))}`}>
                          残 {fmtBytes(Math.max(0, u.memoryAlloc - u.memoryUsage))}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* ディスク */}
                  <td className="px-4 py-3">
                    <div className="w-40 space-y-1">
                      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="absolute h-full rounded-full opacity-30 bg-emerald-400"
                          style={{ width: `${dAllocPct}%` }} />
                        <div className={`absolute h-full rounded-full ${barColor(dUsePct, 'bg-emerald-500')}`}
                          style={{ width: `${dUsePct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-slate-600">{fmtBytes(u.diskUsage)}</span>
                        <span className="text-slate-400">/ {fmtBytes(u.diskAlloc)}</span>
                      </div>
                      {u.diskAlloc > 0 && (
                        <p className={`text-xs font-mono ${remainColor(100 - pct(u.diskAlloc, hostDisk))}`}>
                          残 {fmtBytes(Math.max(0, u.diskAlloc - u.diskUsage))}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── インスタンス一覧 ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InstanceStatus }) {
  const map: Record<InstanceStatus, { cls: string; dot: string; label: string }> = {
    running:  { cls: 'bg-green-50 text-green-700',   dot: 'bg-green-500 animate-pulse',  label: 'Running' },
    stopped:  { cls: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-400',                label: 'Stopped' },
    starting: { cls: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400 animate-pulse', label: 'Starting' },
    stopping: { cls: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400 animate-pulse', label: 'Stopping' },
    error:    { cls: 'bg-red-50 text-red-700',       dot: 'bg-red-500',                  label: 'Error' },
  };
  const { cls, dot, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function InstanceTable({ list }: { list: InstanceResourceRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">インスタンス リソース一覧</h2>
          <p className="text-xs text-slate-400 mt-0.5">起動中のみ実使用量を表示 / バーは割り当て上限基準</p>
        </div>
        <Link to="/instances" className="text-xs text-blue-600 hover:underline font-medium">管理画面 →</Link>
      </div>
      {list.length === 0 ? (
        <div className="px-5 py-10 text-center text-slate-400 text-sm">インスタンスなし</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">名前</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">状態</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 hidden sm:table-cell">オーナー</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 min-w-[160px]">メモリ（使用 / 上限 / 残）</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 min-w-[140px] hidden md:table-cell">ディスク</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 hidden lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map(inst => {
                const memUsage  = inst.resources?.memory.usage ?? 0;
                const memLimit  = inst.memoryLimitBytes ?? 0;
                const memPct    = pct(memUsage, memLimit);
                const memRemain = memLimit > 0 ? Math.max(0, memLimit - memUsage) : null;
                const diskUsage = inst.resources?.disk.rootUsage ?? 0;
                const diskLimit = inst.diskLimitBytes ?? 0;
                const diskRemain = diskLimit > 0 ? Math.max(0, diskLimit - diskUsage) : null;

                return (
                  <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/instances/${inst.id}`} className="font-mono text-sm text-blue-600 hover:underline">
                        {inst.name}
                      </Link>
                      {inst.templateName && <p className="text-xs text-slate-400 mt-0.5">{inst.templateName}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inst.status} /></td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell text-xs">{inst.ownerUsername}</td>

                    <td className="px-4 py-3">
                      {inst.resources ? (
                        <div className="w-36 space-y-1">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor(memPct, 'bg-blue-400')}`}
                              style={{ width: memLimit > 0 ? `${memPct}%` : '5%', opacity: memLimit > 0 ? 1 : 0.3 }} />
                          </div>
                          <p className="text-xs font-mono text-slate-500">
                            {fmtBytes(memUsage)}{memLimit > 0 && <span className="text-slate-400"> / {fmtBytes(memLimit)}</span>}
                          </p>
                          {memRemain !== null && (
                            <p className={`text-xs font-mono ${remainColor(memPct)}`}>残 {fmtBytes(memRemain)}</p>
                          )}
                        </div>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      {inst.resources ? (
                        <div className="space-y-0.5">
                          <p className="text-xs font-mono text-slate-500">{fmtBytes(diskUsage)}</p>
                          {diskRemain !== null && (
                            <p className={`text-xs font-mono ${remainColor(pct(diskUsage, diskLimit))}`}>残 {fmtBytes(diskRemain)}</p>
                          )}
                        </div>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-slate-500 hidden lg:table-cell">
                      {inst.ipAddress ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user }                      = useAuth();
  const [data,       setData]         = useState<DashboardData | null>(null);
  const [loading,    setLoading]      = useState(true);
  const [error,      setError]        = useState<string | null>(null);
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard/stats', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as DashboardData);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(false); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(() => fetchData(true), 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500 mt-3">リソース情報を取得中…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 text-center">
      <div>
        <p className="text-red-500 font-medium">{error ?? 'データを取得できません'}</p>
        <button onClick={() => fetchData(false)}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          再試行
        </button>
      </div>
    </div>
  );

  const { instances: inst, users: u, resources, system } = data;
  const { host, containerUsage, allocated, perUser } = resources;

  // サマリーカード用: ホスト残量
  const memRemaining  = host.memory.total > 0 ? Math.max(0, host.memory.total - allocated.memoryBytes) : null;
  const diskRemaining = host.disk.total   > 0 ? Math.max(0, host.disk.total   - allocated.diskBytes)   : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{system.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            管理者: <span className="font-medium text-slate-700">{user?.username}</span>
            <span className="mx-2 text-slate-300">|</span>
            Uptime: <span className="font-mono">{fmtUptime(system.uptimeSeconds)}</span>
            {host.cpu.threads > 0 && (
              <><span className="mx-2 text-slate-300">|</span>
                CPU: <span className="font-mono">{host.cpu.cores}C/{host.cpu.threads}T</span></>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <button onClick={() => fetchData(false)} disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
            <RefreshIcon spinning={refreshing} /> 更新
          </button>
          {lastUpdate && <p className="text-xs text-slate-400 mt-1">{lastUpdate.toLocaleTimeString('ja-JP')} 時点</p>}
        </div>
      </div>

      {/* アラート */}
      {inst.error > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{inst.error} 件のインスタンスでエラーが発生しています</p>
          <Link to="/instances" className="ml-auto text-xs text-red-600 hover:underline font-medium">確認する →</Link>
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Instances', value: inst.total,
            sub: `${inst.running} running / ${inst.stopped} stopped`,
            accent: 'blue' as const, icon: <ServerIcon />,
          },
          {
            label: 'メモリ 残量',
            value: memRemaining !== null ? fmtBytes(memRemaining) : fmtBytes(containerUsage.memory),
            sub: memRemaining !== null
              ? `ホスト ${fmtBytes(host.memory.total)} 中 割り当て ${fmtBytes(allocated.memoryBytes)}`
              : `コンテナ使用 ${fmtBytes(containerUsage.memory)}`,
            accent: 'blue' as const, icon: <MemIcon />,
          },
          {
            label: 'ディスク 残量',
            value: diskRemaining !== null ? fmtBytes(diskRemaining) : fmtBytes(containerUsage.disk),
            sub: diskRemaining !== null
              ? `ホスト ${fmtBytes(host.disk.total)} 中 割り当て ${fmtBytes(allocated.diskBytes)}`
              : `コンテナ使用 ${fmtBytes(containerUsage.disk)}`,
            accent: 'green' as const, icon: <DiskIcon />,
          },
          {
            label: 'Users', value: u.total,
            sub: `${u.active} active / ${u.admins} admin`,
            accent: 'slate' as const, icon: <UsersIcon />,
          },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 ${
              { blue: 'bg-blue-50 text-blue-600 ring-blue-100', green: 'bg-green-50 text-green-600 ring-green-100', slate: 'bg-slate-100 text-slate-500 ring-slate-200' }[c.accent]
            }`}>{c.icon}</div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-slate-800 leading-none">{c.value}</p>
              <p className="text-sm font-medium text-slate-500 mt-1">{c.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ホストリソースゲージ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-slate-700">ホストリソース使用状況</h2>
          <span className="text-xs text-slate-400">running {inst.running} 件のコンテナ合計</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <HostGauge
            label="Memory" icon={<MemIcon />} color="blue"
            hostTotal={host.memory.total} hostUsed={host.memory.used}
            containerUsed={containerUsage.memory} allocated={allocated.memoryBytes}
            noHostNote="ホスト情報を取得できません"
          />
          <HostGauge
            label="Disk" icon={<DiskIcon />} color="emerald"
            hostTotal={host.disk.total} hostUsed={host.disk.used}
            containerUsed={containerUsage.disk} allocated={allocated.diskBytes}
            noHostNote="dir ドライバー / ホスト情報を取得できません"
          />
        </div>
      </div>

      {/* ユーザー別 */}
      <PerUserSection
        perUser={perUser}
        hostMemory={host.memory.total}
        hostDisk={host.disk.total}
      />

      {/* インスタンス一覧 */}
      <InstanceTable list={data.instances.list} />
    </div>
  );
}

// ─── アイコン ─────────────────────────────────────────────────────────────────
function ServerIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" />
    <circle cx="6" cy="7" r="1" fill="currentColor" /><circle cx="6" cy="17" r="1" fill="currentColor" />
  </svg>;
}
function MemIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 6V4M10 6V4M14 6V4M18 6V4M6 18v2M10 18v2M14 18v2M18 18v2M2 12h20" />
  </svg>;
}
function DiskIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
  </svg>;
}
function UsersIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>;
}
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return <svg className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>;
}
