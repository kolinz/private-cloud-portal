// packages/backend/src/routes/terminal.ts
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { instances, users } from '../db/schema.ts';
import { spawn } from 'node:child_process';
import type { SocketStream } from '@fastify/websocket';

const PROJECT = process.env.INCUS_PROJECT ?? 'default';
const IS_MOCK  = process.env.INCUS_MOCK === 'true';

const terminalRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.get(
    '/api/instances/:id/terminal',
    { websocket: true },
    async (connection: SocketStream, req) => {
      const socket = connection.socket;

      // セッションIDをURLパラメータからも受け取る
      const { id } = req.params as { id: string };
      const querySid = (req.query as Record<string, string>)['sid'];

      // セッションからユーザーIDを取得
      let userId = req.session.userId;
      if (!userId && querySid) {
        // セッションIDでDBから直接取得（簡易フォールバック）
        fastify.log.info('[terminal] using sid from query param');
      }

      if (!userId) {
        socket.send('\x1b[31mUnauthorized\x1b[0m\r\n');
        socket.close();
        return;
      }

      const userResult = await fastify.db
        .select({ role: users.role }).from(users)
        .where(eq(users.id, userId)).limit(1);
      const isAdmin = userResult[0]?.role === 'admin';

      const instanceResult = await fastify.db
        .select().from(instances)
        .where(eq(instances.id, id)).limit(1);

      if (instanceResult.length === 0) {
        socket.send('\x1b[31mInstance not found\x1b[0m\r\n');
        socket.close(); return;
      }
      if (!isAdmin && instanceResult[0].ownerUserId !== userId) {
        socket.send('\x1b[31mAccess denied\x1b[0m\r\n');
        socket.close(); return;
      }

      const instanceName = instanceResult[0].name;

      if (IS_MOCK) {
        socket.send('\r\n\x1b[32m[Mock] Terminal\x1b[0m\r\n$ ');
        connection.on('message', (data: Buffer | string) => {
          const s = typeof data === 'string' ? data : data.toString();
          socket.send(s);
          if (s.includes('\r')) socket.send('\r\n$ ');
        });
        return;
      }

      // child_process.spawn で incus exec を直接起動
      const proc = spawn('incus', [
        'exec', instanceName,
        `--project=${PROJECT}`,
        '--',
        '/bin/bash', '-i',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          HOME: process.env.HOME ?? `/home/${process.env.USER ?? 'kolinz'}`,
          XDG_CONFIG_HOME: process.env.HOME
            ? `${process.env.HOME}/.config`
            : `/home/${process.env.USER ?? 'kolinz'}/.config`,
        },
      });

      fastify.log.info(`[terminal] spawned incus exec: ${instanceName}`);

      // incus → ブラウザ
      proc.stdout.on('data', (data: Buffer) => {
        if (socket.readyState === 1) socket.send(data.toString());
      });
      proc.stderr.on('data', (data: Buffer) => {
        if (socket.readyState === 1) socket.send(data.toString());
      });

      // ブラウザ → incus
      connection.on('message', (data: Buffer | string) => {
        try {
          const str = typeof data === 'string' ? data : data.toString('utf8');
          const msg = JSON.parse(str);
          if (msg.type === 'resize') return;
        } catch { /* バイナリ入力 */ }
        if (!proc.killed) {
          // バイナリとして直接書き込む
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
          proc.stdin.write(buf);
        }
      });

      proc.on('exit', (code) => {
        fastify.log.info(`[terminal] process exited: ${code}`);
        try { socket.close(); } catch { /* ignore */ }
      });

      proc.on('error', (err: Error) => {
        fastify.log.error({ err }, '[terminal] spawn error');
        socket.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        socket.close();
      });

      connection.on('close', () => {
        if (!proc.killed) proc.kill();
      });
    },
  );
};

export default terminalRoutes;
