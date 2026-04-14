// packages/frontend/src/components/logs/LogViewer.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/client.ts';

type Props = {
  instanceId: string;
};

type LogType = 'instance' | 'console';

function parseLine(line: string): { text: string; color: string } {
  if (/\[ERROR\]|\[FAIL\]/i.test(line))        return { text: line, color: 'text-red-400' };
  if (/\[WARN\]|\[WARNING\]/i.test(line))       return { text: line, color: 'text-amber-400' };
  if (/\[OK\]|\[SUCCESS\]/i.test(line))         return { text: line, color: 'text-emerald-400' };
  if (/\[INFO\]/i.test(line))                   return { text: line, color: 'text-blue-400' };
  if (/^\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/.test(line)) return { text: line, color: 'text-slate-400' };
  return { text: line, color: 'text-slate-300' };
}

export default function LogViewer({ instanceId }: Props) {
  const [logType,     setLogType]     = useState<LogType>('instance');
  const [lines,       setLines]       = useState<string[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.instances.logs(instanceId, { type: logType, lines: 200 });
      setLines(res.logs);
    } catch {
      setLines(['[ERROR] Failed to fetch logs']);
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, logType]);

  // logType変更時に再取得
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ツールバー */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* ログタイプ切替 */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {(['instance', 'console'] as LogType[]).map(t => (
            <button
              key={t}
              onClick={() => setLogType(t)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                logType === t
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t === 'instance' ? 'Instance Log' : 'Console Log'}
            </button>
          ))}
        </div>

        {/* Auto refresh トグル */}
        <button
          onClick={() => setAutoRefresh(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            autoRefresh
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
          Auto refresh
        </button>

        {/* 手動更新 */}
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>

        {/* 最新へスクロール */}
        <button
          onClick={scrollToBottom}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors ml-auto"
        >
          ↓ 最新へ
        </button>
      </div>

      {/* ログ表示エリア */}
      <div className="bg-slate-900 rounded-xl overflow-auto h-96 p-4 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-slate-500 italic">No logs available</p>
        ) : (
          lines.map((line, i) => {
            const { text, color } = parseLine(line);
            return (
              <div key={i} className={`whitespace-pre-wrap break-all ${color}`}>
                {text}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
