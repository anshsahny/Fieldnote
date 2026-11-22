import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ScanSearch } from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { useJobs, useReports } from '../../data/hooks';
import { toDate, type Job } from '../../data/types';
import { Callout, Card, EmptyState, PageHeader, Segmented, SkeletonRows } from '../../ui/components';
import { whenLabel } from '../../ui/format';
import { equipmentLabel, isOnTodaysBoard, PriorityBadge, ReportBadge, reportFor, StatusBadge } from './jobUi';

type Filter = 'board' | 'all' | 'unassigned' | 'done';

const FILTERS: { value: Filter; label: string; test: (j: Job) => boolean }[] = [
  { value: 'board', label: "Today's board", test: (j) => isOnTodaysBoard(j) },
  { value: 'all', label: 'All', test: () => true },
  { value: 'unassigned', label: 'Unassigned', test: (j) => !j.assignedTo },
  { value: 'done', label: 'Done', test: (j) => j.status === 'done' },
];

export function JobsPage() {
  const profile = useProfile();
  const jobs = useJobs(profile?.orgId);
  const reports = useReports(profile?.orgId);
  const [filter, setFilter] = useState<Filter>('all');
  const navigate = useNavigate();
  const rows = useMemo(() => jobs.data.filter(FILTERS.find((f) => f.value === filter)!.test), [jobs.data, filter]);

  return (
    <div className="stack">
      <PageHeader
        title="Jobs"
        description="Every visit, its field session and the customer report. Open a job to see which model answered each step."
      />
      <div className="row">
        <Segmented label="Filter jobs" value={filter} onChange={setFilter} options={FILTERS} />
        <span className="spacer" />
        <span className="subtle num" aria-live="polite">
          {rows.length} {rows.length === 1 ? 'job' : 'jobs'}
        </span>
      </div>
      <Card flush>
        {jobs.loading ? (
          <div style={{ padding: 22 }}>
            <SkeletonRows rows={5} />
          </div>
        ) : jobs.error ? (
          <div style={{ padding: 22 }}>
            <Callout tone="danger">{jobs.error}</Callout>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No jobs match this filter" />
        ) : (
          <div className="table-wrap">
            <table data-testid="jobs-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Equipment</th>
                  <th scope="col">Technician</th>
                  <th scope="col">Status</th>
                  <th scope="col">Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => (
                  <tr key={job.id} className="clickable" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td className="num" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {whenLabel(toDate(job.scheduledFor))}
                    </td>
                    <td>
                      {/* The link is the keyboard/screen-reader path; the row click is a mouse shortcut. */}
                      <a href={`/jobs/${job.id}`} onClick={(e) => (e.preventDefault(), navigate(`/jobs/${job.id}`))} className="list-title" style={{ color: 'inherit', textDecoration: 'none' }}>
                        {job.customer.name}
                      </a>
                      <div className="list-sub">{job.reported}</div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {equipmentLabel(job)}
                        {job.triage && (
                          <span className="badge badge-outline" title="Photo triage attached">
                            <ScanSearch size={12} aria-hidden="true" />
                            Triaged
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{job.assignedName ?? <span className="subtle">Unassigned</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <PriorityBadge priority={job.priority} />
                        <StatusBadge status={job.status} />
                      </div>
                    </td>
                    <td>
                      <ReportBadge report={reportFor(job.id, reports.data)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
