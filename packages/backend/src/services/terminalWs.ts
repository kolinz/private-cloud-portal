// packages/backend/src/services/terminalWs.ts
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'node:http';
import { spawn } from 'node:child_process';
import type { DrizzleDB } from '../db/migrate.ts';
import { instances, users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

const PROJECT = process.env.INCUS_PROJECT ?? 'default';
const IS_MOCK  = process.env.INCUS_MOCK === 'true';
const WS_PORT  = Number(process.env.WS_PORT ?? 3001);

// セッションストア（auth.tsと共有）
export const sessionUserMap = new Map<string, string>(); // sessionId → userId

export function startTerminalWsServer(db: DrizzleDB, log: FastifyBaseLogger): void {
  const server = createServer();
  const wss    = new WebSocketServer({ server });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url        = new URL(req.url ?? '/', 'http://localhost');
    const parts      = url.pathname.split('/').filter(Boolean);
    const instanceId = parts[1];
    const sid        = url.searchParams.get('sid') ?? '';

    if (parts[0] !== 'terminal' || !instanceId) { ws.close(); return; }

    // ユーザーIDで直接認証（開発用簡易方式）
    const uid = url.searchParams.get('uid') ?? '';
    if (!uid) {
      ws.send('\x1b[31mUnauthorized\x1b[0m\r\n');
      ws.close(); return;
    }
    const userId = decodeURIComponent(uid);

    const userResult = await db.select({ role: users.role }).from(users)
      .where(eq(users.id, userId)).limit(1);
    const isAdmin = userResult[0]?.role === 'admin';

    const instanceResult = await db.select().from(instances)
      .where(eq(instances.id, instanceId)).limit(1);

    if (instanceResult.length === 0) {
      ws.send('\x1b[31mInstance not found\x1b[0m\r\n'); ws.close(); return;
    }
    if (!isAdmin && instanceResult[0].ownerUserId !== userId) {
      ws.send('\x1b[31mAccess denied\x1b[0m\r\n'); ws.close(); return;
    }

    const instanceName = instanceResult[0].name;

    if (IS_MOCK) {
      ws.send('\r\n\x1b[32m[Mock] Terminal — ' + instanceName + '\x1b[0m\r\n$ ');
      ws.on('message', (data: Buffer) => {
        const s = data.toString();
        ws.send(s);
        if (s.includes('\r')) ws.send('\r\n$ ');
      });
      return;
    }

    const proc = spawn('incus', [
      'exec', instanceName, `--project=${PROJECT}`, '--', '/bin/bash', '-i',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    log.info(`[terminal] spawned: ${instanceName}`);

    proc.stdout.on('data', (d: Buffer) => { if (ws.readyState === 1) ws.send(d.toString().replace(/\r?\n/g, '\r\n')); });
    proc.stderr.on('data', (d: Buffer) => { if (ws.readyState === 1) ws.send(d.toString().replace(/\r?\n/g, '\r\n')); });

    ws.on('message', (data: Buffer) => {
      const str = data.toString();
      try { const m = JSON.parse(str); if (m.type === 'resize') return; } catch { /* ok */ }
      if (!proc.killed) proc.stdin.write(data);
    });

    proc.on('exit', () => { try { ws.close(); } catch { /* ignore */ } });
    ws.on('close', () => { if (!proc.killed) proc.kill(); });
    ws.on('error', (err: Error) => log.error({ err }, '[terminal] ws error'));
  });

  server.listen(WS_PORT, '0.0.0.0', () => {
    log.info(`[terminal] WS server on port ${WS_PORT}`);
  });
}
