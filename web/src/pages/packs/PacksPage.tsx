import { useState } from 'react';
import { BookOpen, ShieldCheck, Smartphone } from 'lucide-react';
import { useAIConfig } from '../../ai/useAIConfig';
import { useAuth } from '../../auth/AuthProvider';
import { usePacks } from '../../data/hooks';
import { Callout, Card, EmptyState, PageHeader, SkeletonRows } from '../../ui/components';
import { CompilePanel } from './CompilePanel';
import { PackReview } from './PackReview';
import { publishPack } from './publish';

export function PacksPage() {
  const { state } = useAuth();
  const config = useAIConfig();
  const profile = state.status === 'signed-in' ? state.profile : null;
  const orgId = profile?.orgId;
  const packs = usePacks(orgId);
  const [reviewJson, setReviewJson] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (state.status !== 'signed-in' || !profile || !orgId) {
    return (
      <div className="stack">
        <PageHeader title="Fix packs" />
        <Callout tone="caution">Your account has no organization profile yet.</Callout>
      </div>
    );
  }

  const isDispatcher = profile.role === 'dispatcher';

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Knowledge"
        title="Fix packs"
        description="Manufacturer manuals compiled by Gemini into step-by-step trees, checked by Fieldnote's validator, reviewed here, then published to technicians' phones for offline use."
      />

      <div className="grid grid-3">
        <Callout tone="cloud" icon={BookOpen} title="Compiled in the cloud">
          Only the manual's troubleshooting pages go to the model, one fault code at a time.
        </Callout>
        <Callout tone="info" icon={ShieldCheck} title="Validated in code">
          Every step must lead somewhere, every pack carries the safety stops, and size stays under 25 KB.
        </Callout>
        <Callout tone="ondevice" icon={Smartphone} title="Used offline">
          Phones keep the latest version and re-validate it before use.
        </Callout>
      </div>

      <Card flush title="Published" icon={BookOpen} labelledBy="published-title" hint={notice ?? undefined}>
        {packs.loading ? (
          <div style={{ padding: 22 }}>
            <SkeletonRows rows={3} />
          </div>
        ) : packs.error ? (
          <div style={{ padding: 22 }}>
            <Callout tone="danger" title="Packs couldn't load">
              {packs.error}
            </Callout>
          </div>
        ) : packs.data.length === 0 ? (
          <EmptyState icon={BookOpen} title="No packs published yet">
            Compile a manual below to create the first one.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table data-testid="published-packs">
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Version</th>
                  <th scope="col">Fault codes</th>
                  <th scope="col">Steps</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {packs.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="list-title">{p.brand}</div>
                      <div className="list-sub">{p.family}</div>
                    </td>
                    <td>
                      <span className="badge badge-brand">v{p.version}</span>
                    </td>
                    <td className="num">{p.faultCodeCount}</td>
                    <td className="num">{p.stepCount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="secondary"
                        aria-pressed={reviewing === p.id}
                        onClick={() => {
                          setReviewing(p.id);
                          setReviewJson(p.packJson);
                          requestAnimationFrame(() => document.getElementById('review-title')?.scrollIntoView({ behavior: 'smooth' }));
                        }}
                      >
                        {reviewing === p.id ? 'Reviewing' : 'Review'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isDispatcher ? (
        <CompilePanel config={config} orgId={orgId} onCompiled={(json) => (setReviewing(null), setReviewJson(json))} />
      ) : (
        <Callout tone="info" title="Compiling and publishing need a dispatcher account">
          Open a published pack with Review to see how a manual became a decision tree: each step's question, answers, safety stops
          and the manual pages it came from.
        </Callout>
      )}

      {reviewJson && (
        <PackReview
          json={reviewJson}
          onApply={setReviewJson}
          canPublish={isDispatcher}
          onPublish={async (pack) => {
            const { version, json } = await publishPack(orgId, state.user.uid, pack);
            setReviewJson(json);
            setNotice(`Published ${pack.packId} v${version}`);
          }}
        />
      )}
    </div>
  );
}
