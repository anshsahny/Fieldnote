// DEV ONLY. Serves the gitignored local copies in content/manuals/ to the /packs page so manuals can
// be compiled without a file picker. Imported only behind import.meta.env.DEV, so production builds
// never include (or even reference) the PDFs.
const urls = import.meta.glob('../../../../content/manuals/*.pdf', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const LOCAL_MANUAL_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.split('/').pop()!, url]),
);
