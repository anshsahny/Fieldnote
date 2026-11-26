/**
 * Fieldnote's mark: a field-note page with a diagnostic trace. Same 1024 grid as
 * public/favicon.svg, scripts/make-icons.swift (app icons) and the iOS BrandMark.
 */
export function BrandMark({ size = 34, radius }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id="fn-mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15775F" />
          <stop offset="1" stopColor="#0B4A3C" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx={radius ?? 300} fill="url(#fn-mark-bg)" />
      <path d="M318 212H632L762 342V756A56 56 0 0 1 706 812H318A56 56 0 0 1 262 756V268A56 56 0 0 1 318 212Z" fill="#F4FAF7" />
      <path d="M632 212V342H762Z" fill="#BFE3D6" />
      <path d="M322 332H560M322 412H492" stroke="#A8D3C4" strokeWidth="30" strokeLinecap="round" />
      <path d="M322 602H422L472 492L552 722L612 552L652 602H702" fill="none" stroke="#13805F" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
