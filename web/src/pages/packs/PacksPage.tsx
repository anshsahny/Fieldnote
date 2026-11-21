import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { loadAIConfig, type AIConfig } from '../../ai/config';
import { useAuth } from '../../auth/AuthProvider';
import { getDb, getFirebase } from '../../firebase/client';
import type { FixPackDocFields } from '../../fixpack/firestore';
import { CompilePanel } from './CompilePanel';
import { PackReview } from './PackReview';
import { publishPack } from './publish';

type PublishedPack = FixPackDocFields & { id: string };

export function PacksPage() {
  const { state } = useAuth();
  const [config, setConfig] = useState<AIConfig>();
  const [published, setPublished] = useState<PublishedPack[]>([]);
  const [reviewJson, setReviewJson] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const profile = state.status === 'signed-in' ? state.profile : null;
  const orgId = profile?.orgId;

  useEffect(() => {
    void loadAIConfig(getFirebase().app).then(setConfig);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    const q = query(collection(getDb(), 'orgs', orgId, 'fixpacks'), orderBy('brand'));
    return onSnapshot(q, (snap) => setPublished(snap.docs.map((d) => ({ id: d.id, ...(d.data() as FixPackDocFields) }))));
  }, [orgId]);

  if (state.status !== 'signed-in' || !profile || !orgId) {
    return (
      <section className="card">
        <h1>Fix packs</h1>
        <p className="lede">Your account has no organization profile yet.</p>
      </section>
    );
  }

  const isDispatcher = profile.role === 'dispatcher';

  return (
    <div className="stack">
      <section className="card" aria-labelledby="packs-title">
        <h1 id="packs-title">Fix packs</h1>
        <p className="lede">
          Compiled from manufacturer manuals by the cloud model, checked by the validator, reviewed here, then published to
          technicians' phones for offline use.
        </p>
        {published.length === 0 ? (
          <p className="lede">No packs published yet.</p>
        ) : (
          <div className="table-wrap">
            <table data-testid="published-packs">
              <thead>
                <tr>
                  <th scope="col">Brand</th>
                  <th scope="col">Family</th>
                  <th scope="col">Version</th>
                  <th scope="col">Codes</th>
                  <th scope="col">Steps</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {published.map((p) => (
                  <tr key={p.id}>
                    <td>{p.brand}</td>
                    <td>{p.family}</td>
                    <td>v{p.version}</td>
                    <td>{p.faultCodeCount}</td>
                    <td>{p.stepCount}</td>
                    <td>
                      <button type="button" className="secondary" onClick={() => setReviewJson(p.packJson)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {notice && (
          <p className="pill pill-ok" role="status">
            {notice}
          </p>
        )}
      </section>

      {isDispatcher && config && <CompilePanel config={config} orgId={orgId} onCompiled={setReviewJson} />}

      {reviewJson && (
        <PackReview
          json={reviewJson}
          onApply={setReviewJson}
          canPublish={isDispatcher}
          onPublish={async (pack) => {
            const { version, json } = await publishPack(orgId, state.user.uid, pack);
            setReviewJson(json);
            setNotice(`Published ${pack.packId} v${version}.`);
          }}
        />
      )}
    </div>
  );
}
