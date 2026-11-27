import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, FileText, PiggyBank, ScanSearch, Smartphone, Sparkles } from 'lucide-react';
import { useAIConfig } from '../ai/useAIConfig';
import { useProfile } from '../auth/AuthProvider';
import { useJobs, useLedger, useReports } from '../data/hooks';
import { toDate } from '../data/types';
import { summarize } from '../ledger/aggregate';
import { ShareBar } from '../ui/charts';
import { Callout, Card, CodeChip, EmptyState, PageHeader, SkeletonRows, Stat, SourceBadge } from '../ui/components';
import { dollars, percent, relativeTime, seconds, whenLabel } from '../ui/format';
import { equipmentLabel, isOnTodaysBoard, PriorityBadge, ReportBadge, reportFor, StatusBadge } from './jobs/jobUi';

export function DashboardPage() {
  const profile = useProfile();
  const orgId = profile?.orgId;
  const jobs = useJobs(orgId);
  const reports = useReports(orgId);
  const ledger = useLedger(orgId, 7);
  const config = useAIConfig();
  const now = new Date();

  const board = useMemo(() => jobs.data.filter((j) => isOnTodaysBoard(j)), [jobs.data]);
  const summary = useMemo(() => summarize(ledger.data, config.pricing, 7), [ledger.data, config.pricing]);
  // Field diagnosis is the on-device-first feature (manual compile is cloud-only by design), so the
  // headline is how many technician notes were understood on the phone; the ledger has every call.
  const diagnosis = summary.byFeature.find((f) => f.feature === 'diagnosis');
  const diagnosisTotal = diagnosis ? diagnosis.onDevice + diagnosis.cloud : 0;
  const urgent = board.filter((j) => j.priority === 'urgent' && j.status !== 'done').length;
  const inProgress = jobs.data.filter((j) => j.status === 'in_progress').length;
  const drafts = reports.data.filter((r) => r.status === 'draft').length;
  const jobName = (id: string) => jobs.data.find((j) => j.id === id)?.customer.name ?? id;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Today's dispatch"
        description="Jobs, field progress and how much of the AI work ran on devices instead of the cloud."
        actions={
          <Link to="/triage" className="btn">
            <ScanSearch size={16} aria-hidden="true" />
            Triage a customer photo
          </Link>
        }
      />

      {profile?.role === 'guest' && (
        <Callout tone="cloud" icon={Sparkles} title="You're exploring the demo company">
          Everything here is fictional. The jobs, sessions and reports were made by a real iPhone running Fieldnote, much of it in
          airplane mode. Try <Link to="/triage">photo triage</Link>, open a <Link to="/jobs">job</Link> to see which model answered each
          step, or check the <Link to="/ledger">hybrid ledger</Link>.
        </Callout>
      )}

      <div className="stats">
        <Stat
          label="On today's board"
          icon={ClipboardList}
          tone="brand"
          loading={jobs.loading}
          value={board.length}
          hint={urgent ? `${urgent} urgent · ${inProgress} in progress` : `${inProgress} in progress`}
        />
        <Stat
          label="Customer reports"
          icon={FileText}
          tone="cloud"
          loading={reports.loading}
          value={reports.data.length}
          hint={drafts ? `${drafts} drafted offline, waiting for signal` : 'All written in the cloud'}
        />
        <Stat
          label="Diagnosis on-device (7 days)"
          icon={Smartphone}
          tone="ondevice"
          loading={ledger.loading}
          value={diagnosisTotal ? percent(diagnosis!.onDevice, diagnosisTotal) : '–'}
          hint={
            diagnosisTotal
              ? `${diagnosis!.onDevice} of ${diagnosisTotal} tech notes · median ${seconds(diagnosis!.medianOnDeviceMs) || '–'}`
              : 'No technician notes yet this week'
          }
        />
        <Stat
          label="Cost avoided (7 days)"
          icon={PiggyBank}
          tone="ondevice"
          loading={ledger.loading}
          value={dollars(summary.costAvoided)}
          hint={<Link to="/about#cost">How this is estimated</Link>}
        />
      </div>

      <div className="grid grid-main">
        <Card
          flush
          title="On the board"
          icon={ClipboardList}
          labelledBy="board-title"
          actions={
            <Link to="/jobs" className="btn btn-ghost" style={{ minHeight: 30 }}>
              All jobs <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          {jobs.loading ? (
            <div style={{ padding: 22 }}>
              <SkeletonRows rows={4} />
            </div>
          ) : jobs.error ? (
            <div style={{ padding: 22 }}>
              <Callout tone="danger">{jobs.error}</Callout>
            </div>
          ) : board.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nothing on today's board">
              New jobs appear here as soon as they're booked.
            </EmptyState>
          ) : (
            <ul className="list" style={{ marginTop: 6 }}>
              {board.map((job) => (
                <li key={job.id}>
                  <Link to={`/jobs/${job.id}`} className="list-item">
                    <span className="num subtle" style={{ width: 92, flex: 'none', fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                      {whenLabel(toDate(job.scheduledFor), now)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="list-title">{job.customer.name}</span>
                      <span className="list-sub" style={{ display: 'block' }}>
                        {equipmentLabel(job)} · {job.assignedName ?? 'Unassigned'}
                      </span>
                    </span>
                    <span className="row" style={{ justifyContent: 'flex-end' }}>
                      <PriorityBadge priority={job.priority} />
                      <ReportBadge report={reportFor(job.id, reports.data)} />
                      <StatusBadge status={job.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="stack">
          <Card
            title="Where the AI ran"
            hint="Last 7 days"
            labelledBy="mix-title"
            footer={
              <>
                <span className="num">
                  Median {seconds(summary.medianMs.onDevice) || '–'} on-device · {seconds(summary.medianMs.cloud) || '–'} cloud
                </span>
                <span className="spacer" />
                <Link to="/ledger" style={{ whiteSpace: 'nowrap' }}>
                  Ledger
                </Link>
              </>
            }
          >
            {ledger.loading ? (
              <SkeletonRows rows={2} />
            ) : summary.aiCalls === 0 ? (
              <p className="muted">No AI calls yet this week.</p>
            ) : (
              <ShareBar onDevice={summary.onDevice} cloud={summary.cloud} />
            )}
          </Card>

          <Card flush title="Latest reports" icon={FileText} labelledBy="reports-title">
            {reports.loading ? (
              <div style={{ padding: 22 }}>
                <SkeletonRows rows={3} />
              </div>
            ) : reports.data.length === 0 ? (
              <EmptyState icon={FileText} title="No reports yet">
                Reports arrive when a technician finishes a diagnosis.
              </EmptyState>
            ) : (
              <ul className="list" style={{ marginTop: 6 }}>
                {reports.data.slice(0, 5).map((r) => {
                  const latest = r.versions.at(-1);
                  return (
                    <li key={r.id}>
                      <Link to={`/jobs/${r.jobId}`} className="list-item">
                        <CodeChip code={r.facts.faultCode} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="list-title">{jobName(r.jobId)}</span>
                          <span className="list-sub" style={{ display: 'block' }}>
                            {r.versions.length > 1 ? 'Drafted on-device, rewritten in the cloud' : r.status === 'draft' ? 'Draft' : 'Cloud'} ·{' '}
                            {relativeTime(toDate(r.updatedAt))}
                          </span>
                        </span>
                        {latest && <SourceBadge source={latest.generatedBy} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
