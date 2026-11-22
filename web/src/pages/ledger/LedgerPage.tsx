import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartColumn, Cloud, OctagonAlert, PiggyBank, Smartphone } from 'lucide-react';
import { useAIConfig } from '../../ai/useAIConfig';
import { useProfile } from '../../auth/AuthProvider';
import { useLedger } from '../../data/hooks';
import { toDate } from '../../data/types';
import { featureLabel, summarize } from '../../ledger/aggregate';
import { DailyColumns, FeatureBars } from '../../ui/charts';
import { Callout, Card, EmptyState, PageHeader, Segmented, SkeletonRows, SourceBadge, Stat } from '../../ui/components';
import { dollars, percent, relativeTime, seconds } from '../../ui/format';

type Range = '7' | '14' | '30';
type Platform = 'all' | 'ios' | 'web';

export function LedgerPage() {
  const profile = useProfile();
  const config = useAIConfig();
  const [range, setRange] = useState<Range>('7');
  const [platform, setPlatform] = useState<Platform>('all');
  const days = Number(range);
  const ledger = useLedger(profile?.orgId, days);
  const rows = useMemo(() => (platform === 'all' ? ledger.data : ledger.data.filter((r) => r.platform === platform)), [ledger.data, platform]);
  const s = useMemo(() => summarize(rows, config.pricing, days), [rows, config.pricing, days]);
  const canRead = profile?.role === 'dispatcher' || profile?.role === 'guest';

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Hybrid ledger"
        title="Where the AI ran"
        description="Every model call from the iPhone app and this console, as metadata only: feature, on-device or cloud, latency. No prompts, notes or photos are stored."
      />

      {!canRead ? (
        <Callout tone="caution">The ledger is visible to dispatchers.</Callout>
      ) : (
        <>
          {/* Filters: one row, scoping everything below. */}
          <div className="row">
            <Segmented
              label="Time range"
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
              ]}
            />
            <Segmented
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={[
                { value: 'all', label: 'All' },
                { value: 'ios', label: 'iPhone' },
                { value: 'web', label: 'Web' },
              ]}
            />
            <span className="spacer" />
            {ledger.loading && <span className="spinner subtle" aria-label="Loading" />}
          </div>

          {ledger.error && <Callout tone="danger">{ledger.error}</Callout>}

          <div className="stats" style={{ opacity: ledger.loading ? 0.6 : 1 }}>
            <Stat
              label="Ran on-device"
              icon={Smartphone}
              tone="ondevice"
              value={s.aiCalls ? percent(s.onDevice, s.aiCalls) : '–'}
              hint={`${s.onDevice} of ${s.aiCalls} AI calls · median ${seconds(s.medianMs.onDevice) || '–'}`}
            />
            <Stat
              label="Ran in the cloud"
              icon={Cloud}
              tone="cloud"
              value={s.cloud}
              hint={`median ${seconds(s.medianMs.cloud) || '–'} · p90 ${seconds(s.p90Ms.cloud) || '–'}`}
            />
            <Stat
              label="Cloud cost avoided"
              icon={PiggyBank}
              tone="ondevice"
              value={dollars(s.costAvoided)}
              hint={
                <>
                  vs {dollars(s.cloudSpend)} spent · <Link to="/about#cost">formula</Link>
                </>
              }
            />
            <Stat
              label="Safety stops"
              icon={OctagonAlert}
              tone="caution"
              value={s.safetyStops}
              hint={`Raised by code with no model call${s.failed ? ` · ${s.failed} failed calls` : ''}`}
            />
          </div>

          {ledger.loading && rows.length === 0 ? (
            <Card>
              <SkeletonRows rows={5} />
            </Card>
          ) : s.aiCalls === 0 ? (
            <Card>
              <EmptyState icon={ChartColumn} title="No AI calls in this range">
                Run a photo triage, or use the iPhone app, and calls appear here within seconds.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-2" style={{ opacity: ledger.loading ? 0.6 : 1 }}>
              <Card title="AI calls per day" labelledBy="daily-title">
                <DailyColumns data={s.daily} />
              </Card>
              <Card title="By feature" labelledBy="feature-title">
                <FeatureBars data={s.byFeature} />
              </Card>
            </div>
          )}

          <div className="grid grid-2">
            <Card title="Latency by feature" labelledBy="latency-title" hint="Median per call">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Feature</th>
                      <th scope="col">On-device</th>
                      <th scope="col">Cloud</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byFeature.map((f) => (
                      <tr key={f.feature}>
                        <td>{featureLabel(f.feature)}</td>
                        <td className="num">{seconds(f.medianOnDeviceMs) || '–'}</td>
                        <td className="num">{seconds(f.medianCloudMs) || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card flush title="Latest calls" labelledBy="latest-title" hint={`iPhone ${s.byPlatform.ios} · web ${s.byPlatform.web}`}>
              {/* Scrolls on its own, so it must be reachable by keyboard (axe: scrollable-region-focusable). */}
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Latest calls">

                <table>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Feature</th>
                      <th scope="col">Device</th>
                      <th scope="col">Answered by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 40).map((r) => (
                      <tr key={r.id}>
                        <td className="num subtle" style={{ whiteSpace: 'nowrap' }}>
                          {relativeTime(toDate(r.ts))}
                        </td>
                        <td>{featureLabel(r.feature)}</td>
                        <td>{r.platform === 'ios' ? 'iPhone' : 'Web'}</td>
                        <td>
                          {r.ok === false ? (
                            <span className="badge badge-danger">Failed</span>
                          ) : r.feature === 'safety_stop' ? (
                            <span className="badge badge-caution">Safety rule</span>
                          ) : (
                            <SourceBadge source={r.source} latencyMs={r.latencyMs} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
