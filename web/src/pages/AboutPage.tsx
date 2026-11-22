import { Cloud, ListChecks, Lock, PiggyBank, Smartphone } from 'lucide-react';
import type { Feature } from '../ai/routing';
import { useAIConfig } from '../ai/useAIConfig';
import { ASSUMED_OUTPUT_TOKENS, DEFAULT_PROMPT_TOKENS, featureLabel } from '../ledger/aggregate';
import { Card, PageHeader } from '../ui/components';
import { dollars } from '../ui/format';

/** The routing table from PLAN.md §4; the live route comes from Remote Config. */
const ROUTING: { feature: Feature | null; label: string; platform: string; fixed?: string; why: string }[] = [
  { feature: 'compile', label: 'Manual PDF → fix pack', platform: 'Web', why: 'PDF input is cloud-only; heavy, done once per model.' },
  { feature: null, label: 'Validate fix pack', platform: 'Web + iPhone', fixed: 'Code', why: 'Deterministic: bad model output is rejected.' },
  { feature: null, label: 'Read nameplate text', platform: 'iPhone', fixed: 'Apple Vision OCR', why: 'Offline, instant; no LLM needed to read text.' },
  { feature: 'nameplate', label: 'Disambiguate nameplate', platform: 'iPhone', why: 'Tiny prompt; works in a basement.' },
  { feature: null, label: 'Fault code lookup', platform: 'iPhone', fixed: 'Code', why: 'Facts come from the pack, never the model.' },
  { feature: 'diagnosis', label: 'Diagnosis notes', platform: 'iPhone', why: 'Offline, ~1 s, $0; the model only picks among allowed answers.' },
  { feature: null, label: 'Safety stops', platform: 'iPhone', fixed: 'Code', why: 'Never delegated to a model.' },
  { feature: 'report', label: 'Customer report', platform: 'iPhone', why: 'Better long-form in the cloud; drafted on-device offline.' },
  { feature: 'triage', label: 'Photo pre-triage', platform: 'Web', why: "Customers' home photos stay in the browser when possible." },
  { feature: 'job_summary', label: 'Job summary', platform: 'Web', why: 'Short and free on-device.' },
];

const ROUTE_TEXT: Record<string, string> = {
  prefer_on_device: 'On-device first, cloud fallback',
  only_on_device: 'On-device only',
  prefer_in_cloud: 'Cloud first, on-device fallback',
  only_in_cloud: 'Cloud only',
};

export function AboutPage() {
  const config = useAIConfig();
  const p = config.pricing;
  const example = (520 * p.inputPerMTok + 80 * p.outputPerMTok) / 1_000_000;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="How it works"
        title="Three tiers, never a dead end"
        description="Fieldnote decides per feature where AI runs. Routes live in Firebase Remote Config, so they change without an app release."
      />

      <div className="grid grid-3">
        <Card>
          <div className="stack-sm">
            <span className="stat-icon tone-ondevice">
              <Smartphone size={16} aria-hidden="true" />
            </span>
            <h2>On-device first</h2>
            <p className="muted">
              Apple's Foundation Model on iPhone and Gemini Nano in Chrome, through Firebase AI Logic hybrid inference. Works with no
              signal, answers in about a second, costs nothing, and the data stays on the device.
            </p>
          </div>
        </Card>
        <Card>
          <div className="stack-sm">
            <span className="stat-icon tone-cloud">
              <Cloud size={16} aria-hidden="true" />
            </span>
            <h2>Cloud when it helps</h2>
            <p className="muted">
              Gemini ({config.cloudModelFast}) compiles manuals and writes the full customer report, and steps in whenever a device
              can't run a model. App Check protects every call.
            </p>
          </div>
        </Card>
        <Card>
          <div className="stack-sm">
            <span className="stat-icon">
              <ListChecks size={16} aria-hidden="true" />
            </span>
            <h2>Plain fix packs</h2>
            <p className="muted">
              With no model at all, the validated fix pack still guides every step with taps, readings are compared in code, and safety
              stops are always code.
            </p>
          </div>
        </Card>
      </div>

      <Card flush title="Routing table" labelledBy="routing-title" hint={config.origin === 'remote' ? 'Live from Remote Config' : 'Built-in defaults'}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Where</th>
                <th scope="col">Runs on</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {ROUTING.map((r) => (
                <tr key={r.label}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td>{r.platform}</td>
                  <td>
                    {r.feature ? (
                      <span className="badge badge-outline mono">{ROUTE_TEXT[config.routes[r.feature]] ?? config.routes[r.feature]}</span>
                    ) : (
                      <span className="badge">{r.fixed}</span>
                    )}
                  </td>
                  <td className="muted">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2">
        <section className="card" id="cost" aria-labelledby="cost-title">
          <div className="card-header">
            <PiggyBank size={18} aria-hidden="true" className="subtle" />
            <h2 id="cost-title">How "cloud cost avoided" is estimated</h2>
          </div>
          <div className="stack-sm">
            <p className="muted">Each call that ran on a device is priced as if it had gone to the cloud model:</p>
            <p className="inset mono" style={{ fontSize: 'var(--t-sm)' }}>
              cost = prompt tokens × ${p.inputPerMTok} / 1M + output tokens × ${p.outputPerMTok} / 1M
            </p>
            <p className="muted">
              Prompt tokens come from each call's estimate in the ledger ({DEFAULT_PROMPT_TOKENS} when a call didn't record one). Output
              tokens are typical sizes per feature:{' '}
              {Object.entries(ASSUMED_OUTPUT_TOKENS)
                .map(([f, n]) => `${featureLabel(f).toLowerCase()} ${n}`)
                .join(', ')}
              . Example: a 520-token diagnosis note ≈ {dollars(example)}.
            </p>
            <p className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
              Prices: {p.source}. Stored in Remote Config, so they can be updated without a release.
            </p>
          </div>
        </section>

        <Card title="What is stored" icon={Lock} labelledBy="privacy-title">
          <ul className="stack-sm" style={{ margin: 0, paddingLeft: 20 }}>
            <li>The ledger keeps metadata only: feature, device, on-device or cloud, latency, prompt size. Never prompts, notes or photos.</li>
            <li>Customer reports are written from equipment, fault and findings. Names, addresses, phone numbers and serials never reach a model.</li>
            <li>Triage photos stay in the browser when Chrome can run the model; otherwise they go to Gemini through Firebase with App Check.</li>
            <li>Technicians' free-text notes stay on the iPhone's model unless the route sends them to the cloud.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
