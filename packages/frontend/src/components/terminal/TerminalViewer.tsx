// packages/frontend/src/components/terminal/TerminalViewer.tsx
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

type Props = {
  instanceId: string;
  userId: string;
};

export default function TerminalViewer({ instanceId, userId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const fitAddonRef  = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize:    13,
      fontFamily:  'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background:  '#0f1117',
        foreground:  '#e2e8f0',
        cursor:      '#60a5fa',
        black:       '#1e293b',
        brightBlack: '#475569',
      },
      scrollback: 5000,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current     = term;
    fitAddonRef.current = fitAddon;

    // バックエンドのWebSocketポート(3001)に直接接続
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001/terminal/${instanceId}?uid=${encodeURIComponent(userId)}`;
    const ws       = new WebSocket(wsUrl);
    ws.binaryType  = 'arraybuffer';
    wsRef.current  = ws;

    ws.onopen = () => {
      term.write('\r\n\x1b[32mConnected\x1b[0m\r\n');
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data as string);
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data); // テキストとして送信
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }));
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [instanceId]);

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden p-3">
      <div ref={containerRef} style={{ height: '420px' }} />
    </div>
  );
}
