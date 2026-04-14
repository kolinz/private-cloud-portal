// packages/frontend/src/components/instances/InstanceStatusBadge.tsx
import type { InstanceDTO } from '../../api/client.ts';

type Props = {
  status: InstanceDTO['status'];
};

export default function InstanceStatusBadge({ status }: Props) {
  const configs = {
    running: {
      dot:  'bg-emerald-400',
      text: 'text-emerald-700',
      bg:   'bg-emerald-50 border-emerald-200',
      label: 'Running',
      animate: false,
    },
    stopped: {
      dot:  'bg-slate-400',
      text: 'text-slate-600',
      bg:   'bg-slate-50 border-slate-200',
      label: 'Stopped',
      animate: false,
    },
    starting: {
      dot:  'bg-amber-400',
      text: 'text-amber-700',
      bg:   'bg-amber-50 border-amber-200',
      label: 'Starting',
      animate: true,
    },
    stopping: {
      dot:  'bg-amber-400',
      text: 'text-amber-700',
      bg:   'bg-amber-50 border-amber-200',
      label: 'Stopping',
      animate: true,
    },
    error: {
      dot:  'bg-red-400',
      text: 'text-red-700',
      bg:   'bg-red-50 border-red-200',
      label: 'Error',
      animate: false,
    },
  } as const;

  const cfg = configs[status] ?? configs.error;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${cfg.animate ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}
