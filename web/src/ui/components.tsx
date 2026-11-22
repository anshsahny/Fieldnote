import type { ReactNode } from 'react';
import {
  ArrowLeft,
  CircleCheck,
  Cloud,
  Info,
  ListChecks,
  OctagonAlert,
  Smartphone,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { seconds } from './format';

/* ---------- inference source badge (same wording and colors as the iOS InferenceBadge) ---------- */

export type BadgeSource = 'ON_DEVICE' | 'IN_CLOUD' | 'NONE' | 'PLAIN' | 'UNKNOWN' | 'OFFLINE';

export function SourceBadge({
  source,
  latencyMs,
  where,
}: {
  source: BadgeSource | string;
  latencyMs?: number | null;
  /** "This browser" / "iPhone": shown for on-device runs. */
  where?: string;
}) {
  const time = latencyMs ? ` · ${seconds(latencyMs)}` : '';
  if (source === 'ON_DEVICE') {
    return (
      <span className="badge badge-ondevice" title="Answered by the on-device model; nothing left the device">
        <Smartphone size={12} aria-hidden="true" />
        On-device{where ? ` (${where})` : ''}
        {time} · $0
      </span>
    );
  }
  if (source === 'IN_CLOUD') {
    return (
      <span className="badge badge-cloud" title="Answered by Gemini in the cloud">
        <Cloud size={12} aria-hidden="true" />
        Cloud{time}
      </span>
    );
  }
  if (source === 'OFFLINE') {
    return (
      <span className="badge badge-caution">
        <WifiOff size={12} aria-hidden="true" />
        Offline
      </span>
    );
  }
  return (
    <span className="badge" title="No model: answered from the fix pack">
      <ListChecks size={12} aria-hidden="true" />
      Plain
    </span>
  );
}

export function CodeChip({ code, large }: { code: string; large?: boolean }) {
  return (
    <span className={`code-chip${large ? ' lg' : ''}`} aria-label={`Fault code ${code}`}>
      {code}
    </span>
  );
}

/* ---------- layout ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="page-header">
      <div className="titles">
        {back && (
          <Link to={back.to} className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="lede">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  hint,
  icon: Icon,
  actions,
  flush,
  footer,
  children,
  className,
  labelledBy,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`card${flush ? ' card-flush' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      {(title || actions) && (
        <div className="card-header">
          {Icon && <Icon size={18} aria-hidden="true" className="subtle" />}
          {title && <h2 id={labelledBy}>{title}</h2>}
          {hint && <span className="hint">{hint}</span>}
          {actions && <span style={{ marginLeft: hint ? 8 : 'auto' }}>{actions}</span>}
        </div>
      )}
      {children}
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}

export type Tone = 'brand' | 'ondevice' | 'cloud' | 'caution' | 'neutral';

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <div className="card stat">
      <span className="stat-label">
        {Icon && (
          <span className={`stat-icon tone-${tone}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
        {label}
      </span>
      {loading ? <span className="skeleton" style={{ height: 32, width: '60%' }} /> : <span className="stat-value">{value}</span>}
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

const CALLOUT_ICON: Record<string, LucideIcon> = {
  info: Info,
  ondevice: Smartphone,
  cloud: Cloud,
  caution: TriangleAlert,
  danger: OctagonAlert,
  ok: CircleCheck,
};

export function Callout({
  tone = 'info',
  title,
  children,
  icon,
}: {
  tone?: 'info' | 'ondevice' | 'cloud' | 'caution' | 'danger' | 'ok';
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? CALLOUT_ICON[tone] ?? Info;
  const cls = tone === 'ok' ? 'tone-ondevice' : tone === 'info' ? '' : `tone-${tone}`;
  return (
    <div className={`callout ${cls}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden="true" />
      <div>
        {title && <div className="callout-title">{title}</div>}
        {children && <div className="muted">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={32} aria-hidden="true" />
      <div className="empty-title">{title}</div>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack-sm" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ height: 18, width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
