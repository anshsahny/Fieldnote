import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CircleCheck,
  FileText,
  Gauge,
  Hand,
  MessageSquareText,
  OctagonAlert,
  ScanSearch,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { useJob, useReports, useSessions } from '../../data/hooks';
import { toDate, type Report, type Session, type SessionStep, type Triage } from '../../data/types';
import { Callout, Card, CodeChip, EmptyState, PageHeader, Segmented, SkeletonRows, SourceBadge } from '../../ui/components';
import { capitalize, relativeTime, timeOfDay, whenLabel } from '../../ui/format';
import { equipmentLabel, PriorityBadge, StatusBadge } from './jobUi';

const SAFETY_TITLE: Record<string, string> = {
  GAS: 'Possible gas leak',
  CO: 'Possible carbon monoxide',
  BURNING: 'Overheating or burning',
  WATER_ELECTRICAL: 'Water near live electrical',
  EXPOSED_WIRING: 'Exposed live wiring',
  FLAME_ROLLOUT: 'Flame rollout',
};

export function JobDetailPage() {
  const { jobId } = useParams();
  const profile = useProfile();
  const job = useJob(profile?.orgId, jobId);
  const sessions = useSessions(profile?.orgId, jobId);
  const reports = useReports(profile?.orgId, jobId);

  if (job.loading) {
    return <SkeletonRows rows={6} />;
  }
  if (!job.data) {
    return (
      <div className="stack">
        <PageHeader back={{ to: '/jobs', label: 'Jobs' }} title="Job not found" />
        {job.error && <Callout tone="danger">{job.error}</Callout>}
      </div>
    );
  }
  const j = job.data;
  const session = sessions.data[0];

  return (
    <div className="stack">
      <PageHeader
        back={{ to: '/jobs', label: 'Jobs' }}
        eyebrow={whenLabel(toDate(j.scheduledFor))}
        title={j.customer.name}
        description={j.reported}
        actions={
          <div className="row">
            <PriorityBadge priority={j.priority} />
            <StatusBadge status={j.status} />
          </div>
        }
      />

      <div className="grid grid-main">
        <div className="stack">
          <Card title="Field session" icon={Stethoscope} labelledBy="session-title" hint={session ? sessionHint(session) : undefined}>
            {sessions.loading ? (
              <SkeletonRows rows={4} />
            ) : session ? (
              <SessionTimeline session={session} />
            ) : (
              <EmptyState icon={Stethoscope} title="No diagnosis yet">
                The technician's steps appear here as they work, even if they start offline.
              </EmptyState>
            )}
          </Card>
          <ReportCard reports={reports.data} loading={reports.loading} />
        </div>

        <div className="stack">
          <Card title="Customer & equipment" labelledBy="customer-title">
            <dl className="kv">
              <dt>Address</dt>
              <dd>{j.customer.address ?? '–'}</dd>
              <dt>Phone</dt>
              <dd>{j.customer.phone ?? '–'}</dd>
              <dt>Equipment</dt>
              <dd>{equipmentLabel(j)}</dd>
              {j.equipment.serial ? (
                <>
                  <dt>Serial</dt>
                  <dd className="mono">{j.equipment.serial}</dd>
                </>
              ) : null}
              <dt>Technician</dt>
              <dd>{j.assignedName ?? 'Unassigned'}</dd>
            </dl>
          </Card>
          <TriageCard jobId={j.id} triage={j.triage} />
        </div>
      </div>
    </div>
  );
}

function sessionHint(s: Session): string {
  const parts = [s.status === 'concluded' ? 'Concluded' : s.status === 'active' ? 'In progress' : 'Abandoned'];
  const updated = toDate(s.updatedAt);
  if (updated) parts.push(relativeTime(updated));
  return parts.join(' · ');
}

function viaIcon(step: SessionStep) {
  if (step.via === 'note') return MessageSquareText;
  if (step.via === 'reading') return Gauge;
  return Hand;
}

function SessionTimeline({ session }: { session: Session }) {
  const notes = session.history.filter((h) => h.via === 'note');
  const onDevice = notes.filter((h) => h.source === 'ON_DEVICE').length;
  return (
    <div className="stack-sm">
      <div className="row" style={{ marginBottom: 6 }}>
        <CodeChip code={session.faultCode} large />
        <span className="muted">
          {session.history.length} {session.history.length === 1 ? 'step' : 'steps'}
          {notes.length > 0 && ` · ${notes.length} typed ${notes.length === 1 ? 'note' : 'notes'} understood, ${onDevice} on the iPhone`}
        </span>
        {session.createdOffline && (
          <span className="badge badge-caution">
            <WifiOff size={12} aria-hidden="true" />
            Started offline
          </span>
        )}
      </div>
      {session.acknowledgedStops.length > 0 && (
        <Callout tone="danger" icon={OctagonAlert} title="Safety stop during this visit">
          {session.acknowledgedStops.map((id) => SAFETY_TITLE[id] ?? id).join(', ')}: raised by Fieldnote's safety rules (code, not
          AI) and cleared by the technician before continuing.
        </Callout>
      )}
      <ol className="timeline">
        {session.history.map((step, i) => {
          const Icon = viaIcon(step);
          return (
            <li key={`${step.stepId}-${i}`} className="timeline-item">
              <span className="timeline-num">{i + 1}</span>
              <div className="timeline-body">
                <div>{step.instruction}</div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="timeline-answer">
                    <Icon size={14} aria-hidden="true" />
                    {capitalize(step.answer)}
                  </span>
                  {step.via === 'note' && step.source && <SourceBadge source={step.source} latencyMs={step.latencyMs} where="iPhone" />}
                  {step.via === 'tap' && <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>tapped</span>}
                  {step.via === 'reading' && <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>measured {step.input}</span>}
                </div>
                {step.via === 'note' && step.input && <div className="quote">“{step.input}”</div>}
              </div>
            </li>
          );
        })}
        {session.status === 'concluded' && (
          <li className="timeline-item">
            <span className="timeline-num tone-brand">
              <CircleCheck size={16} aria-hidden="true" />
            </span>
            <div className="timeline-body">
              <strong>Diagnosis concluded</strong>
              <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
                {timeOfDay(toDate(session.updatedAt))}
              </span>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}

function ReportCard({ reports, loading }: { reports: Report[]; loading: boolean }) {
  const report = useMemo(
    () => [...reports].sort((a, b) => (toDate(b.updatedAt)?.getTime() ?? 0) - (toDate(a.updatedAt)?.getTime() ?? 0))[0],
    [reports],
  );
  const [shown, setShown] = useState<number | null>(null);
  if (loading) {
    return (
      <Card title="Customer report" icon={FileText}>
        <SkeletonRows rows={3} />
      </Card>
    );
  }
  if (!report) {
    return (
      <Card title="Customer report" icon={FileText}>
        <EmptyState icon={FileText} title="No report yet">
          The technician creates it on the iPhone when the diagnosis ends. Offline, the phone drafts it; the cloud rewrites it when
          signal returns.
        </EmptyState>
      </Card>
    );
  }
  const index = Math.min(shown ?? report.versions.length - 1, report.versions.length - 1);
  const v = report.versions[index]!;
  const label = (g: string) => (g === 'IN_CLOUD' ? 'Cloud' : g === 'ON_DEVICE' ? 'On-device draft' : 'Plain draft');
  return (
    <Card
      title="Customer report"
      icon={FileText}
      labelledBy="report-title"
      actions={
        report.versions.length > 1 ? (
          <Segmented
            label="Report version"
            value={String(index)}
            onChange={(i) => setShown(Number(i))}
            options={report.versions.map((ver, i) => ({ value: String(i), label: label(ver.generatedBy) }))}
          />
        ) : undefined
      }
      footer={
        <>
          <SourceBadge source={v.generatedBy} latencyMs={v.latencyMs} where={v.generatedBy === 'ON_DEVICE' ? 'iPhone' : undefined} />
          <span>
            {v.generatedBy === 'IN_CLOUD'
              ? `Written in the cloud by ${v.model ?? 'Gemini'}`
              : v.generatedBy === 'ON_DEVICE'
                ? "Drafted on the technician's iPhone with no signal"
                : 'Assembled from the fix pack without AI'}{' '}
            · {timeOfDay(toDate(v.createdAt))}
          </span>
        </>
      }
    >
      <div className="report-doc">
        <div className="row">
          <CodeChip code={report.facts.faultCode} />
          <strong>{report.facts.fault}</strong>
          {report.facts.repairDone === true && <span className="badge badge-ondevice">Repair completed on visit</span>}
          {report.facts.repairDone === false && <span className="badge">Repair recommended</span>}
        </div>
        <p>{v.content.summary}</p>
        <ReportList title="Work performed" items={v.content.workPerformed} />
        <ReportList title="Findings" items={v.content.findings} />
        <ReportList title="Recommendations" items={v.content.recommendations} />
        <ReportList title="Parts" items={report.facts.parts} />
        {v.content.safetyNotes.length > 0 && (
          <Callout tone="caution" title="Safety">
            {v.content.safetyNotes.join(' ')}
          </Callout>
        )}
      </div>
    </Card>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{capitalize(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function TriageCard({ jobId, triage }: { jobId: string; triage?: Triage }) {
  return (
    <Card
      title="Photo triage"
      icon={ScanSearch}
      labelledBy="triage-title"
      footer={
        <Link to={`/triage?job=${encodeURIComponent(jobId)}`}>{triage ? 'Triage another photo' : 'Triage a customer photo for this job'}</Link>
      }
    >
      {triage ? (
        <div className="stack-sm">
          <div className="row">
            {triage.matchedCode ? <CodeChip code={triage.matchedCode} /> : triage.errorCode && <CodeChip code={triage.errorCode} />}
            <strong>{triage.likelyFault}</strong>
          </div>
          {triage.partsToBring && triage.partsToBring.length > 0 && (
            <p className="muted">Bring: {triage.partsToBring.join(', ')}</p>
          )}
          <div className="row">
            <SourceBadge source={triage.source} latencyMs={triage.latencyMs} where={triage.source === 'ON_DEVICE' ? 'browser' : undefined} />
            {triage.photoStayedOnDevice && <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>Photo never left the browser</span>}
          </div>
        </div>
      ) : (
        <p className="muted">No photo triage yet. Customers' photos of the display help the technician bring the right parts.</p>
      )}
    </Card>
  );
}
