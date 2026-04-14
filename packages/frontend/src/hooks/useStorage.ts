// packages/frontend/src/hooks/useStorage.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.ts';
import type { StorageVolumeDTO, StorageAttachmentDTO } from '../api/client.ts';

// ── ボリューム管理フック ───────────────────────────────────────────────────

export function useStorageVolumes() {
  const [volumes, setVolumes]   = useState<StorageVolumeDTO[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.storage.listVolumes();
      setVolumes(data.volumes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load volumes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createVolume = useCallback(async (body: {
    displayName: string;
    size: string;
    description?: string;
    poolName: string;
  }) => {
    const data = await api.storage.createVolume(body);
    await load();
    return data.volume;
  }, [load]);

  const deleteVolume = useCallback(async (id: string) => {
    await api.storage.deleteVolume(id);
    await load();
  }, [load]);

  return { volumes, loading, error, reload: load, createVolume, deleteVolume };
}

// ── インスタンスのアタッチメント管理フック ────────────────────────────────

export function useInstanceStorage(instanceId: string) {
  const [attachments, setAttachments] = useState<StorageAttachmentDTO[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!instanceId) return;
    try {
      setLoading(true);
      const data = await api.storage.listAttachments(instanceId);
      setAttachments(data.attachments);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  const attach = useCallback(async (volumeId: string, mountPath: string) => {
    const data = await api.storage.attach(instanceId, { volumeId, mountPath });
    await load();
    return data.attachment;
  }, [instanceId, load]);

  const detach = useCallback(async (attachmentId: string) => {
    await api.storage.detach(instanceId, attachmentId);
    await load();
  }, [instanceId, load]);

  return { attachments, loading, error, reload: load, attach, detach };
}

export type { StorageVolumeDTO, StorageAttachmentDTO };
