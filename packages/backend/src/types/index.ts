// packages/backend/src/types/index.ts

export type UserDTO = {
  id: string;
  username: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
};

export type TemplateDTO = {
  id: string;
  name: string;
  description: string | null;
  type: 'preset' | 'custom';
  role: 'general' | 'reverse_proxy';
  imageAlias: string;
  cpuLimit: number | null;
  memoryLimit: string | null;
  diskLimit: string | null;
  isActive: boolean;
  createdAt: string;
};

export type InstanceDTO = {
  id: string;
  name: string;
  ownerUserId: string;
  ownerUsername: string;
  templateId: string | null;
  templateName: string | null;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  nodeName: string;
  ipAddress: string | null;
  createdAt: string;
};

export type PortForwardDTO = {
  id: string;
  instanceId: string;
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
  description: string | null;
  isEnabled: boolean;
};

export type ProxyRouteDTO = {
  id: string;
  proxyInstanceId: string;
  proxyInstanceName: string;
  targetInstanceId: string;
  targetInstanceName: string;
  path: string;
  targetPort: number;
  createdAt: string;
};

// ── ストレージ管理（STEP 15 追加） ──────────────────────────────────────

export type StorageVolumeDTO = {
  id: string;
  name: string;          // Incus上の内部名 (vol-xxxxxxxx)
  displayName: string;
  ownerUserId: string;
  ownerUsername: string; // JOIN済み
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
  displayName: string;  // volume.displayName JOIN済み
  volumeName: string;   // volume.name (Incus内部名) JOIN済み
  poolName: string;
  mountPath: string;
  deviceName: string;
  attachedAt: string;
};

// ── エラーコード ──────────────────────────────────────────────────────────

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'USERNAME_TAKEN'
  | 'NAME_TAKEN'
  | 'PORT_CONFLICT'
  | 'HOSTNAME_TAKEN'
  | 'TEMPLATE_IN_USE'
  | 'INSTANCE_RUNNING'
  | 'TARGET_NOT_RUNNING'
  | 'ALREADY_INITIALIZED'
  | 'INCUS_ERROR'
  | 'INTERNAL_ERROR'
  | 'CANNOT_DELETE_SELF'
  | 'VOLUME_IN_USE'           // アタッチ中のため削除不可
  | 'MOUNT_PATH_CONFLICT'     // 同一インスタンスでマウントパス重複
  | 'VOLUME_ALREADY_ATTACHED' // 同一ボリュームを同一インスタンスに二重アタッチ
  | 'VOLUME_NOT_OWNED';       // 他ユーザーのボリュームへのアクセス禁止

export type ErrorResponse = {
  error: ErrorCode;
  message: string;
  details?: unknown;
};
