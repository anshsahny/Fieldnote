import { CircleDashed, CircleDot, CircleCheck, Clock3, Inbox, Zap } from 'lucide-react';
import type { Job, Report } from '../../data/types';
import { toDate } from '../../data/types';

export const STATUS: Record<string, { label: string; cls: string; icon: typeof CircleDot }> = {
  new: { label: 'New', cls: 'badge-brand', icon: Inbox },
  scheduled: { label: 'Scheduled', cls: '', icon: Clock3 },
  assigned: { label: 'Assigned', cls: '', icon: CircleDashed },
  in_progress: { label: 'In progress', cls: 'badge-caution', icon: CircleDot },
  done: { label: 'Done', cls: 'badge-ondevice', icon: CircleCheck },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: '', icon: CircleDot };
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`}>
      <Icon size={12} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority !== 'urgent') return null;
  return (
    <span className="badge badge-danger">
      <Zap size={12} aria-hidden="true" />
      Urgent
    </span>
  );
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today's jobs plus anything still open from earlier (dispatchers don't lose yesterday's leftovers). */
export function isOnTodaysBoard(job: Job, now: Date = new Date()): boolean {
  const at = toDate(job.scheduledFor);
  if (!at) return job.status !== 'done';
  return sameDay(at, now) || (at < now && job.status !== 'done');
}

export function equipmentLabel(job: Job): string {
  const brand = job.equipment?.brand && job.equipment.brand !== 'Unknown' ? job.equipment.brand : '';
  const model = job.equipment?.model ?? '';
  return [brand, model].filter(Boolean).join(' ') || 'Equipment unknown';
}

/** Report status line for a job: the newest report for any of its sessions. */
export function reportFor(jobId: string, reports: Report[]): Report | undefined {
  return reports.filter((r) => r.jobId === jobId).sort((a, b) => (toDate(b.updatedAt)?.getTime() ?? 0) - (toDate(a.updatedAt)?.getTime() ?? 0))[0];
}

export function ReportBadge({ report }: { report?: Report }) {
  if (!report) return <span className="subtle">No report yet</span>;
  if (report.status === 'final') {
    return <span className="badge badge-cloud">Report · cloud</span>;
  }
  return <span className="badge badge-caution">{report.generatedBy === 'ON_DEVICE' ? 'Draft · on-device' : 'Draft · plain'}</span>;
}
