// packages/backend/src/services/incus.ts

import { fetch, Agent } from 'undici';

const SOCKET  = process.env.INCUS_SOCKET_PATH ?? '/var/lib/incus/unix.socket';
const PROJECT = process.env.INCUS_PROJECT     ?? 'default';
const MOCK    = process.env.INCUS_MOCK        === 'true';

const agent = new Agent({ connect: { socketPath: SOCKET } });

// ─── エラー型 ────────────────────────────────────────────────────────────────

export class IncusError extends Error {
  constructor(
    public incusMessage: string,
    public statusCode: number,
  ) {
    super(`Incus error (${statusCode}): ${incusMessage}`);
    this.name = 'IncusError';
  }
}

// ─── リソース型 ──────────────────────────────────────────────────────────────

export interface InstanceResources {
  memory: { usage: number; peak: number; total: number };
  disk:   { rootUsage: number };
  cpu:    { usageNs: number };
}

/** ホスト物理リソース（GET /1.0/resources） */
export interface HostResources {
  memory: {
    total: number;  // bytes (ホスト搭載RAM)
    used:  number;  // bytes (ホスト全体の使用中RAM)
  };
  disk: {
    total: number;  // bytes (主要ディスクの合計)
    used:  number;  // bytes (主要ディスクの使用済み)
  };
  cpu: {
    cores:   number;
    threads: number;
  };
}

/** ローカルイメージ */
export interface LocalImage {
  fingerprint:  string;
  aliases:      { name: string; description: string }[];
  architecture: string;
  type:         string;
  size:         number;
  createdAt:    string;
}

// ─── 低レベルヘルパー ────────────────────────────────────────────────────────

function url(path: string): string {
  // /1.0/resources はプロジェクトパラメータ不要
  if (path.startsWith('/1.0/resources')) return `http://localhost${path}`;
  return `http://localhost${path}${path.includes('?') ? '&' : '?'}project=${PROJECT}`;
}

async function incusFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url(path), {
    ...init,
    // @ts-expect-error undici dispatcher
    dispatcher: agent,
  });
  return res;
}

async function incusJSON<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res  = await incusFetch(path, init);
  const body = await res.json() as { metadata?: unknown; error?: string };
  if (!res.ok) throw new IncusError(body.error ?? 'unknown error', res.status);
  return body.metadata as T;
}

async function waitOperation(opUrl: string, timeoutMs = 300_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await incusJSON<{ status: string; err?: string }>(opUrl);
    if (op.status === 'Success') return;
    if (op.status === 'Failure') throw new IncusError(op.err ?? 'operation failed', 500);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new IncusError('operation timed out', 504);
}

// ─── ホストリソース ──────────────────────────────────────────────────────────

/**
 * ホストの物理リソース情報を取得する
 * GET /1.0/resources
 */
export async function getHostResources(): Promise<HostResources> {
  if (MOCK) {
    return {
      memory: { total: 16 * 1024 ** 3, used: 4 * 1024 ** 3 },
      disk:   { total: 100 * 1024 ** 3, used: 20 * 1024 ** 3 },
      cpu:    { cores: 4, threads: 8 },
    };
  }

  const res = await incusJSON<{
    memory?: { total?: number; used?: number };
    storage?: {
      disks?: {
        size?: number;
        partitions?: { size?: number; used?: number }[];
      }[];
    };
    cpu?: {
      total?: number;
      sockets?: { cores?: number; threads?: number }[];
    };
  }>('/1.0/resources');

  // ---- memory ----
  const memTotal = res.memory?.total ?? 0;
  const memUsed  = res.memory?.used  ?? 0;

  // ---- disk: 全ディスクのサイズ合計、パーティション使用量合計 ----
  let diskTotal = 0;
  let diskUsed  = 0;
  for (const disk of res.storage?.disks ?? []) {
    diskTotal += disk.size ?? 0;
    for (const part of disk.partitions ?? []) {
      diskUsed += part.used ?? 0;
    }
  }

  // ---- cpu ----
  let cpuCores   = 0;
  let cpuThreads = 0;
  for (const socket of res.cpu?.sockets ?? []) {
    cpuCores   += socket.cores   ?? 0;
    cpuThreads += socket.threads ?? 0;
  }

  return {
    memory: { total: memTotal, used: memUsed },
    disk:   { total: diskTotal, used: diskUsed },
    cpu:    { cores: cpuCores, threads: cpuThreads },
  };
}

// ─── インスタンスリソース ────────────────────────────────────────────────────

export async function getInstanceResources(name: string): Promise<InstanceResources> {
  if (MOCK) {
    const seed = name.charCodeAt(0) || 65;
    return {
      memory: {
        usage: (seed % 400 + 100) * 1024 * 1024,
        peak:  (seed % 400 + 200) * 1024 * 1024,
        total: 512 * 1024 * 1024,
      },
      disk: { rootUsage: (seed % 8000 + 1000) * 1024 * 1024 },
      cpu:  { usageNs: seed * 1_000_000_000 },
    };
  }

  const state = await incusJSON<{
    cpu?:    { usage?: number };
    memory?: { usage?: number; usage_peak?: number; total?: number };
    disk?:   { root?: { usage?: number } };
  }>(`/1.0/instances/${name}/state`);

  return {
    memory: {
      usage: state.memory?.usage      ?? 0,
      peak:  state.memory?.usage_peak ?? 0,
      total: state.memory?.total      ?? 0,
    },
    disk: { rootUsage: state.disk?.root?.usage ?? 0 },
    cpu:  { usageNs:   state.cpu?.usage        ?? 0 },
  };
}

// ─── イメージ管理 ────────────────────────────────────────────────────────────

export async function listLocalImages(): Promise<LocalImage[]> {
  if (MOCK) {
    return [{
      fingerprint:  'abc123def456',
      aliases:      [{ name: 'ubuntu/22.04', description: 'Ubuntu 22.04 LTS' }],
      architecture: 'x86_64', type: 'container',
      size:         400 * 1024 * 1024,
      createdAt:    new Date().toISOString(),
    }];
  }

  const images = await incusJSON<{
    fingerprint: string; aliases: { name: string; description: string }[];
    architecture: string; type: string; size: number; created_at: string;
  }[]>('/1.0/images?recursion=1');

  return (images ?? []).map(img => ({
    fingerprint:  img.fingerprint,
    aliases:      img.aliases ?? [],
    architecture: img.architecture ?? '',
    type:         img.type ?? 'container',
    size:         img.size ?? 0,
    createdAt:    img.created_at ?? '',
  }));
}

export async function downloadImage(alias: string): Promise<void> {
  if (MOCK) { await new Promise(r => setTimeout(r, 500)); return; }

  const res = await incusFetch('/1.0/images', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: {
        type: 'image', mode: 'pull',
        server: 'https://images.linuxcontainers.org',
        protocol: 'simplestreams', alias,
      },
    }),
  });

  const json = await res.json() as { operation?: string; error?: string };
  if (!res.ok) throw new IncusError(json.error ?? 'downloadImage failed', res.status);
  if (json.operation) await waitOperation(json.operation, 300_000);
}

// ─── インスタンス操作 ────────────────────────────────────────────────────────

export async function listInstances(): Promise<string[]> {
  if (MOCK) return [];
  const list = await incusJSON<string[]>('/1.0/instances');
  return list.map((p: string) => p.replace('/1.0/instances/', ''));
}

export async function getInstance(name: string): Promise<unknown> {
  if (MOCK) return { name, status: 'Stopped', config: {}, devices: {} };
  return incusJSON(`/1.0/instances/${name}`);
}

export async function getInstanceState(
  name: string,
): Promise<{ status: string; ipAddress: string | null }> {
  if (MOCK) return { status: 'Running', ipAddress: '10.0.0.2' };

  const state = await incusJSON<{
    status: string;
    network?: Record<string, { addresses: { family: string; address: string }[] }>;
  }>(`/1.0/instances/${name}/state`);

  const eth0      = state.network?.['eth0'];
  const inet      = eth0?.addresses.find(a => a.family === 'inet');
  return { status: state.status, ipAddress: inet?.address ?? null };
}

export async function createInstance(params: {
  name: string; imageAlias: string;
  cpuLimit?: number; memoryLimit?: string; diskLimit?: string;
}): Promise<void> {
  if (MOCK) { await new Promise(r => setTimeout(r, 500)); return; }

  const config: Record<string, string> = {};
  if (params.cpuLimit)    config['limits.cpu']    = String(params.cpuLimit);
  if (params.memoryLimit) config['limits.memory'] = params.memoryLimit;

  const devices: Record<string, Record<string, string>> = {
    root: {
      type: 'disk', pool: 'default', path: '/',
      ...(params.diskLimit ? { size: params.diskLimit } : {}),
    },
  };

  const res = await incusFetch('/1.0/instances', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name, config, devices,
      source: {
        type: 'image', mode: 'pull',
        server: 'https://images.linuxcontainers.org',
        protocol: 'simplestreams', alias: params.imageAlias,
      },
    }),
  });

  const json = await res.json() as { operation?: string; error?: string };
  if (!res.ok) throw new IncusError(json.error ?? 'createInstance failed', res.status);
  if (json.operation) await waitOperation(json.operation, 300_000);
}

async function changeState(name: string, action: string): Promise<void> {
  const res = await incusFetch(`/1.0/instances/${name}/state`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, timeout: 30, force: false }),
  });
  const json = await res.json() as { operation?: string; error?: string };
  if (!res.ok) throw new IncusError(json.error ?? `${action} failed`, res.status);
  if (json.operation) await waitOperation(json.operation);
}

export const startInstance   = (name: string) => MOCK ? Promise.resolve() : changeState(name, 'start');
export const stopInstance    = (name: string) => MOCK ? Promise.resolve() : changeState(name, 'stop');
export const restartInstance = (name: string) => MOCK ? Promise.resolve() : changeState(name, 'restart');

export async function deleteInstance(name: string): Promise<void> {
  if (MOCK) return;
  const res  = await incusFetch(`/1.0/instances/${name}`, { method: 'DELETE' });
  const json = await res.json() as { operation?: string; error?: string };
  if (!res.ok) throw new IncusError(json.error ?? 'deleteInstance failed', res.status);
  if (json.operation) await waitOperation(json.operation);
}

export async function getInstanceLog(name: string): Promise<string> {
  if (MOCK) return `[mock] instance log for ${name}\n`;
  const listRes  = await incusFetch(`/1.0/instances/${name}/logs`);
  const listBody = await listRes.json() as { metadata?: string[] };
  const logFiles = listBody.metadata ?? [];
  if (logFiles.length === 0) return '';
  const logFileName = logFiles[logFiles.length - 1]?.split('/').pop();
  return (await incusFetch(`/1.0/instances/${name}/logs/${logFileName}`)).text();
}

export async function getConsoleLog(name: string): Promise<string> {
  if (MOCK) return `[mock] console log for ${name}\n`;
  const res = await incusFetch(`/1.0/instances/${name}/console`);
  if (!res.ok) return '';
  return res.text();
}

// ─── ストレージプール ────────────────────────────────────────────────────────

export async function listStoragePools(): Promise<string[]> {
  if (MOCK) return ['default', 'ssd'];
  const list = await incusJSON<string[]>('/1.0/storage-pools');
  return list.map((p: string) => p.replace('/1.0/storage-pools/', ''));
}

export async function listVolumes(pool: string): Promise<string[]> {
  if (MOCK) return [];
  const list = await incusJSON<string[]>(`/1.0/storage-pools/${pool}/volumes/custom`);
  return list.map((p: string) => p.split('/').pop() ?? p);
}

export async function createVolume(pool: string, name: string, size: string): Promise<void> {
  if (MOCK) return;
  const res = await incusFetch(`/1.0/storage-pools/${pool}/volumes/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config: { size } }),
  });
  if (!res.ok) {
    const json = await res.json() as { error?: string };
    throw new IncusError(json.error ?? 'createVolume failed', res.status);
  }
}

export async function deleteVolume(pool: string, name: string): Promise<void> {
  if (MOCK) return;
  const res = await incusFetch(
    `/1.0/storage-pools/${pool}/volumes/custom/${name}`, { method: 'DELETE' });
  if (!res.ok) {
    const json = await res.json() as { error?: string };
    throw new IncusError(json.error ?? 'deleteVolume failed', res.status);
  }
}

export async function attachVolume(params: {
  instanceName: string; deviceName: string;
  poolName: string; volumeName: string; mountPath: string;
}): Promise<void> {
  if (MOCK) return;
  const res = await incusFetch(`/1.0/instances/${params.instanceName}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      devices: {
        [params.deviceName]: {
          type: 'disk', pool: params.poolName,
          source: params.volumeName, path: params.mountPath,
        },
      },
    }),
  });
  if (!res.ok) {
    const json = await res.json() as { error?: string };
    throw new IncusError(json.error ?? 'attachVolume failed', res.status);
  }
}

export async function detachVolume(instanceName: string, deviceName: string): Promise<void> {
  if (MOCK) return;

  const meta = await incusJSON<{
    devices?:     Record<string, Record<string, string>>;
    config?:      Record<string, string>;
    description?: string;
    profiles?:    string[];
  }>(`/1.0/instances/${instanceName}`);

  const devices = { ...(meta.devices ?? {}) };
  delete devices[deviceName];

  const res = await incusFetch(`/1.0/instances/${instanceName}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...meta, devices }),
  });
  if (!res.ok) {
    const json = await res.json() as { error?: string };
    throw new IncusError(json.error ?? 'detachVolume failed', res.status);
  }
}
