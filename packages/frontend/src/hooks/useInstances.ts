// packages/frontend/src/hooks/useInstances.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, type InstanceDTO, ApiError } from '../api/client.ts';

export function useInstances() {
  const [instances, setInstances] = useState<InstanceDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const res = await api.instances.list();
      setInstances(res.instances);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch instances');
    }
  }, []);

  // ポーリング開始
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(fetchInstances, 3000);
  }, [fetchInstances]);

  // ポーリング停止
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 起動中/停止中のインスタンスがあればポーリング
  useEffect(() => {
    const hasTransient = instances.some(
      i => i.status === 'starting' || i.status === 'stopping',
    );
    if (hasTransient) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [instances, startPolling, stopPolling]);

  // 初回取得
  useEffect(() => {
    fetchInstances().finally(() => setIsLoading(false));
    return () => stopPolling();
  }, [fetchInstances, stopPolling]);

  const create = async (body: { name: string; templateId: string }) => {
    const res = await api.instances.create(body);
    await fetchInstances();
    return res.instance;
  };

  const start = async (id: string) => {
    await api.instances.start(id);
    await fetchInstances();
  };

  const stop = async (id: string) => {
    await api.instances.stop(id);
    await fetchInstances();
  };

  const restart = async (id: string) => {
    await api.instances.restart(id);
    await fetchInstances();
  };

  const remove = async (id: string) => {
    await api.instances.delete(id);
    await fetchInstances();
  };

  return {
    instances,
    isLoading,
    error,
    refetch: fetchInstances,
    create,
    start,
    stop,
    restart,
    remove,
  };
}
