// packages/frontend/src/api/client.ts

// ── インライン型定義 ────────────────────────────────────
export type UserDTO = {
  id: string; username: string; role: 'admin' | 'user';
  isActive: boolean; createdAt: string;
};

export type TemplateDTO = {
  id: string; name: string; description: string | null;
  type: 'preset' | 'custom'; role: 'general' | 'reverse_proxy';
  imageAlias: string; cpuLimit: number | null;
  memoryLimit: string | null; diskLimit: string | null;
  isActive: boolean; createdAt: string;
};

export type InstanceDTO = {
  id: string; name: string;
  ownerUserId: string; ownerUsername: string;
  templateId: string | null; templateName: string | null; templateRole: 'general' | 'reverse_proxy' | null;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  nodeName: string; ipAddress: string | null; createdAt: string;
};

export type PortForwardDTO = {
  id: string; instanceId: string;
  hostPort: number; containerPort: number;
  protocol: 'tcp' | 'udp'; description: string | null; isEnabled: boolean;
};

export type ProxyRouteDTO = {
  id: string;
  proxyInstanceId: string; proxyInstanceName: string;
  targetInstanceId: string; targetInstanceName: string;
  path: string; targetPort: number; createdAt: string;
};

// ── ストレージ型定義（STEP 15 追加） ──────────────────────
export type StorageVolumeDTO = {
  id: string;
  name: string;           // Incus上の内部名 (vol-xxxxxxxx)
  displayName: string;
  ownerUserId: string;
  ownerUsername: string;
  poolName: string;
  size: string;
  description: string | null;
  createdAt: string;
  attachments: {
    instanceId: string;
    instanceName: string;
    mountPath: string;
  }[];
};

export type StorageAttachmentDTO = {
  id: string;
  instanceId: string;
  volumeId: string;
  displayName: string;
  volumeName: string;
  poolName: string;
  mountPath: string;
  deviceName: string;
  attachedAt: string;
};

export type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'NAME_TAKEN' | 'PORT_CONFLICT'
  | 'HOSTNAME_TAKEN' | 'TEMPLATE_IN_USE' | 'INSTANCE_RUNNING'
  | 'TARGET_NOT_RUNNING' | 'ALREADY_INITIALIZED' | 'INCUS_ERROR'
  | 'INTERNAL_ERROR' | 'CANNOT_DELETE_SELF'
  | 'VOLUME_IN_USE' | 'MOUNT_PATH_CONFLICT' | 'VOLUME_ALREADY_ATTACHED' | 'VOLUME_NOT_OWNED';

export class ApiError extends Error {
  constructor(
    public error: ErrorCode,
    public message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── fetchラッパー ─────────────────────────────────────
const BASE = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options.body !== null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let body: { error: ErrorCode; message: string; details?: unknown };
    try {
      body = await res.json();
    } catch {
      throw new ApiError('INTERNAL_ERROR', `HTTP ${res.status}`, res.status);
    }
    throw new ApiError(body.error, body.message, res.status, body.details);
  }

  return res.json() as Promise<T>;
}

// ── API クライアント ──────────────────────────────────
export const api = {
  auth: {
    login: (body: { username: string; password: string }) =>
      apiFetch<{ user: UserDTO }>('/auth/login', {
        method: 'POST', body: JSON.stringify(body),
      }),
    logout: () =>
      apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),
    me: () =>
      apiFetch<{ user: UserDTO }>('/auth/me'),
  },

  onboarding: {
    status: () =>
      apiFetch<{ initialized: boolean }>('/onboarding/status'),
    setup: (body: { systemName: string; adminUsername: string; adminPassword: string }) =>
      apiFetch<{ ok: true }>('/onboarding', {
        method: 'POST', body: JSON.stringify(body),
      }),
  },

  instances: {
    list: () =>
      apiFetch<{ instances: InstanceDTO[] }>('/instances'),
    get: (id: string) =>
      apiFetch<{ instance: InstanceDTO }>(`/instances/${id}`),
    create: (body: { name: string; templateId: string }) =>
      apiFetch<{ instance: InstanceDTO }>('/instances', {
        method: 'POST', body: JSON.stringify(body),
      }),
    start: (id: string) =>
      apiFetch<{ instance: InstanceDTO }>(`/instances/${id}/start`, { method: 'POST' }),
    stop: (id: string) =>
      apiFetch<{ instance: InstanceDTO }>(`/instances/${id}/stop`, { method: 'POST' }),
    restart: (id: string) =>
      apiFetch<{ instance: InstanceDTO }>(`/instances/${id}/restart`, { method: 'POST' }),
    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/instances/${id}`, { method: 'DELETE' }),
    publish: (id: string, body: { alias: string }) =>
      apiFetch<{ ok: true; alias: string }>(`/instances/${id}/publish`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    logs: (id: string, params: { type?: 'instance' | 'console'; lines?: number }) => {
      const q = new URLSearchParams();
      if (params.type)  q.set('type',  params.type);
      if (params.lines) q.set('lines', String(params.lines));
      return apiFetch<{ logs: string[]; totalLines: number }>(`/instances/${id}/logs?${q}`);
    },
  },

  templates: {
    localImages: () =>
      apiFetch<{ aliases: string[] }>('/templates/images/local'),
    downloadImage: (alias: string) =>
      apiFetch<{ ok: true; alias: string }>('/templates/images/download', {
        method: 'POST', body: JSON.stringify({ alias }),
      }),
    list: () =>
      apiFetch<{ templates: TemplateDTO[] }>('/templates'),
    create: (body: Partial<TemplateDTO>) =>
      apiFetch<{ template: TemplateDTO }>('/templates', {
        method: 'POST', body: JSON.stringify(body),
      }),
    patch: (id: string, body: Partial<TemplateDTO>) =>
      apiFetch<{ template: TemplateDTO }>(`/templates/${id}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/templates/${id}`, { method: 'DELETE' }),
  },

  users: {
    list: () =>
      apiFetch<{ users: UserDTO[] }>('/users'),
    create: (body: { username: string; password: string; role: 'admin' | 'user' }) =>
      apiFetch<{ user: UserDTO }>('/users', {
        method: 'POST', body: JSON.stringify(body),
      }),
    patch: (id: string, body: { password?: string; role?: 'admin' | 'user'; isActive?: boolean }) =>
      apiFetch<{ user: UserDTO }>(`/users/${id}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/users/${id}`, { method: 'DELETE' }),
  },

  portForwards: {
    list: (instanceId: string) =>
      apiFetch<{ portForwards: PortForwardDTO[] }>(`/instances/${instanceId}/portforwards`),
    create: (instanceId: string, body: { hostPort: number; containerPort: number; protocol: 'tcp' | 'udp'; description?: string }) =>
      apiFetch<{ portForward: PortForwardDTO }>(`/instances/${instanceId}/portforwards`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    patch: (instanceId: string, pfId: string, body: { isEnabled: boolean }) =>
      apiFetch<{ portForward: PortForwardDTO }>(`/instances/${instanceId}/portforwards/${pfId}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }),
    delete: (instanceId: string, pfId: string) =>
      apiFetch<{ ok: true }>(`/instances/${instanceId}/portforwards/${pfId}`, { method: 'DELETE' }),
  },

  proxy: {
    list: () =>
      apiFetch<{ routes: ProxyRouteDTO[] }>('/proxy/routes'),
    create: (body: { targetInstanceId: string; path: string; targetPort?: number }) =>
      apiFetch<{ route: ProxyRouteDTO }>('/proxy/routes', {
        method: 'POST', body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/proxy/routes/${id}`, { method: 'DELETE' }),
  },

  // ── ストレージ管理（STEP 15 追加） ────────────────────
  storage: {
    listPools: () =>
      apiFetch<{ pools: string[] }>('/storage/pools'),

    listVolumes: () =>
      apiFetch<{ volumes: StorageVolumeDTO[] }>('/storage/volumes'),

    createVolume: (body: {
      displayName: string;
      size: string;
      description?: string;
      poolName: string;
    }) =>
      apiFetch<{ volume: StorageVolumeDTO }>('/storage/volumes', {
        method: 'POST', body: JSON.stringify(body),
      }),

    deleteVolume: (id: string) =>
      apiFetch<{ ok: true }>(`/storage/volumes/${id}`, { method: 'DELETE' }),

    listAttachments: (instanceId: string) =>
      apiFetch<{ attachments: StorageAttachmentDTO[] }>(`/instances/${instanceId}/storage`),

    attach: (instanceId: string, body: { volumeId: string; mountPath: string }) =>
      apiFetch<{ attachment: StorageAttachmentDTO }>(`/instances/${instanceId}/storage`, {
        method: 'POST', body: JSON.stringify(body),
      }),

    detach: (instanceId: string, attachmentId: string) =>
      apiFetch<{ ok: true }>(`/instances/${instanceId}/storage/${attachmentId}`, {
        method: 'DELETE',
      }),
  },
};
