/** Display formatting shared by console pages (pure; unit-tested). */

export function seconds(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return '';
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

export function percent(part: number, total: number): string {
  if (total <= 0) return '–';
  return `${Math.round((part / total) * 100)}%`;
}

/** Dollars with sensible precision for tiny API costs ($0.0042) and larger totals ($12.40). */
export function dollars(value: number): string {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '$0';
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(date: Date | undefined, now: Date = new Date()): string {
  if (!date) return '';
  const diff = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return RTF.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return RTF.format(Math.round(diff / 3600), 'hour');
  return RTF.format(Math.round(diff / 86_400), 'day');
}

export function timeOfDay(date: Date | undefined): string {
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

/** "9:30 AM" today, "Tomorrow 9:30 AM", "Yesterday 9:30 AM", otherwise "Tue 9:30 AM". */
export function whenLabel(date: Date | undefined, now: Date = new Date()): string {
  if (!date) return 'Unscheduled';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const delta = Math.round((day(date) - day(now)) / 86_400_000);
  const time = timeOfDay(date);
  if (delta === 0) return time;
  if (delta === 1) return `Tomorrow ${time}`;
  if (delta === -1) return `Yesterday ${time}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/[\s.@_-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?').slice(0, 2);
}

export function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
