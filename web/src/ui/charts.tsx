import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DayRow, FeatureRow } from '../ledger/aggregate';
import { featureLabel } from '../ledger/aggregate';
import { Segmented } from './components';
import { percent } from './format';

/*
 * Charts follow the dataviz skill specs: two categorical series (On-device, Cloud) whose colors
 * were run through the palette validator in both themes (--chart-ondevice / --chart-cloud);
 * bars <= 24px with a 4px rounded data end and a square baseline; 2px surface gaps between
 * stacked parts; hairline grid; legend for 2 series; per-mark hover/focus tooltip; table view.
 */

const SERIES = [
  { key: 'onDevice', label: 'On-device', color: 'var(--chart-ondevice)' },
  { key: 'cloud', label: 'Cloud', color: 'var(--chart-cloud)' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Clean tick step for 0..max (1, 2, 5 × 10^n) and about `count` ticks. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Rect path with only the top corners rounded (data end up, square at the baseline). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Rect path with only the right corners rounded (horizontal bar data end). */
function rightRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

export function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      {SERIES.map((s) => (
        <span key={s.key}>
          <span className="swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <div className="chart-tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="chart-tip-row">
          {r.color && <span className="chart-tip-key" style={{ background: r.color }} />}
          <strong className="num">{r.value}</strong>
          <span className="muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function ChartFrame({
  title,
  table,
  children,
}: {
  title: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div className="stack-sm">
      <div className="row">
        <Legend />
        <span className="spacer" />
        <Segmented
          label={`${title}: chart or table`}
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>
      {view === 'chart' ? children : <div className="table-wrap">{table}</div>}
    </div>
  );
}

/* ---------- daily stacked columns ---------- */

export function DailyColumns({ data, title = 'AI calls per day' }: { data: DayRow[]; title?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const height = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.onDevice + d.cloud));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(6, band * 0.55));
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 64)));

  function show(i: number, cx: number) {
    const d = data[i]!;
    setActive(i);
    setTip({
      x: Math.min(Math.max(cx, 80), width - 80),
      y: y(d.onDevice + d.cloud) - 8,
      title: d.label,
      rows: [
        { label: 'on-device', value: String(d.onDevice), color: SERIES[0].color },
        { label: 'cloud', value: String(d.cloud), color: SERIES[1].color },
        { label: 'on-device share', value: percent(d.onDevice, d.onDevice + d.cloud) },
      ],
    });
  }

  const table = (
    <table>
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">On-device</th>
          <th scope="col">Cloud</th>
          <th scope="col">On-device share</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.day}>
            <td>{d.label}</td>
            <td className="num">{d.onDevice}</td>
            <td className="num">{d.cloud}</td>
            <td className="num">{percent(d.onDevice, d.onDevice + d.cloud)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame title={title} table={table}>
      <div ref={ref} className="chart-wrap" onMouseLeave={() => (setTip(null), setActive(null))}>
        <svg className="chart" width={width} height={height} role="img" aria-label={`${title}, stacked by source. Use Table for the values.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2;
            const x = cx - barW / 2;
            const on = (d.onDevice / top) * plotH;
            const cl = (d.cloud / top) * plotH;
            const gap = on > 0 && cl > 0 ? 2 : 0;
            const base = pad.top + plotH;
            const onIsTop = cl === 0;
            return (
              <g
                key={d.day}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${d.onDevice} on-device, ${d.cloud} cloud`}
                onMouseEnter={() => show(i, cx)}
                onFocus={() => show(i, cx)}
                onBlur={() => (setTip(null), setActive(null))}
                className="chart-mark"
                opacity={active === null || active === i ? 1 : 0.55}
              >
                {/* hit area: the whole band, taller than the marks */}
                <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH} fill="transparent" />
                {on > 0 && (
                  <path
                    d={onIsTop ? topRounded(x, base - on, barW, on, 4) : `M${x},${base}V${base - on}H${x + barW}V${base}Z`}
                    fill={SERIES[0].color}
                  />
                )}
                {cl > 0 && <path d={topRounded(x, base - on - gap - cl, barW, cl, 4)} fill={SERIES[1].color} />}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} style={{ stroke: 'var(--border-strong)' }} />
        </svg>
        <Tooltip tip={tip} />
      </div>
    </ChartFrame>
  );
}

/* ---------- calls by feature: horizontal stacked bars ---------- */

export function FeatureBars({ data, title = 'AI calls by feature' }: { data: FeatureRow[]; title?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const labelW = Math.min(150, Math.max(110, width * 0.3));
  const valueW = 44;
  const rowH = 36;
  const barH = 16;
  const height = Math.max(1, data.length) * rowH + 6;
  const plotW = Math.max(40, width - labelW - valueW);
  const max = Math.max(1, ...data.map((d) => d.onDevice + d.cloud));
  const scale = (v: number) => (v / max) * plotW;

  function show(i: number, yTop: number) {
    const d = data[i]!;
    setActive(i);
    setTip({
      x: Math.min(labelW + scale(d.onDevice + d.cloud) / 2 + 40, width - 90),
      y: yTop,
      title: featureLabel(d.feature),
      rows: [
        { label: 'on-device', value: String(d.onDevice), color: SERIES[0].color },
        { label: 'cloud', value: String(d.cloud), color: SERIES[1].color },
        { label: 'on-device share', value: percent(d.onDevice, d.onDevice + d.cloud) },
      ],
    });
  }

  const table = (
    <table>
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr>
          <th scope="col">Feature</th>
          <th scope="col">On-device</th>
          <th scope="col">Cloud</th>
          <th scope="col">Share on-device</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.feature}>
            <td>{featureLabel(d.feature)}</td>
            <td className="num">{d.onDevice}</td>
            <td className="num">{d.cloud}</td>
            <td className="num">{percent(d.onDevice, d.onDevice + d.cloud)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame title={title} table={table}>
      <div ref={ref} className="chart-wrap" onMouseLeave={() => (setTip(null), setActive(null))}>
        <svg className="chart" width={width} height={height} role="img" aria-label={`${title}, stacked by source. Use Table for the values.`}>
          {data.map((d, i) => {
            const yTop = i * rowH + (rowH - barH) / 2;
            const on = scale(d.onDevice);
            const cl = scale(d.cloud);
            const gap = on > 0 && cl > 0 ? 2 : 0;
            const total = d.onDevice + d.cloud;
            return (
              <g
                key={d.feature}
                tabIndex={0}
                role="img"
                aria-label={`${featureLabel(d.feature)}: ${d.onDevice} on-device, ${d.cloud} cloud`}
                onMouseEnter={() => show(i, yTop)}
                onFocus={() => show(i, yTop)}
                onBlur={() => (setTip(null), setActive(null))}
                className="chart-mark"
                opacity={active === null || active === i ? 1 : 0.55}
              >
                <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
                <text x={0} y={yTop + barH / 2} dy="0.32em" className="chart-label">
                  {featureLabel(d.feature)}
                </text>
                {on > 0 && (
                  <path
                    d={cl > 0 ? `M${labelW},${yTop}H${labelW + on}V${yTop + barH}H${labelW}Z` : rightRounded(labelW, yTop, on, barH, 4)}
                    fill={SERIES[0].color}
                  />
                )}
                {cl > 0 && <path d={rightRounded(labelW + on + gap, yTop, cl, barH, 4)} fill={SERIES[1].color} />}
                <text x={labelW + on + gap + cl + 8} y={yTop + barH / 2} dy="0.32em" className="num chart-value">
                  {total}
                </text>
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </ChartFrame>
  );
}

/* ---------- thin share bar (one whole, two parts) ---------- */

export function ShareBar({ onDevice, cloud }: { onDevice: number; cloud: number }) {
  const total = onDevice + cloud;
  const pOn = total ? (onDevice / total) * 100 : 0;
  return (
    <div className="stack-sm">
      <div
        className="share-bar"
        role="img"
        aria-label={`On-device ${onDevice} of ${total} AI calls (${percent(onDevice, total)}); cloud ${cloud}.`}
      >
        {onDevice > 0 && <span style={{ width: `${pOn}%`, background: SERIES[0].color }} />}
        {cloud > 0 && <span style={{ flex: 1, background: SERIES[1].color }} />}
      </div>
      <div className="legend">
        <span>
          <span className="swatch" style={{ background: SERIES[0].color }} />
          On-device <strong className="num">{onDevice}</strong>
        </span>
        <span>
          <span className="swatch" style={{ background: SERIES[1].color }} />
          Cloud <strong className="num">{cloud}</strong>
        </span>
      </div>
    </div>
  );
}

export type { SeriesKey };
