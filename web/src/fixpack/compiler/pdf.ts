import { PDFDocument } from 'pdf-lib';

/** Parses "42-49, 51" into sorted unique 1-based page numbers, bounded by pageCount. */
export function parsePageRange(input: string, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`"${part}" is not a page or range (use e.g. 42-49, 51).`);
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`"${part}" is outside pages 1-${pageCount}.`);
    }
    for (let p = start; p <= end; p++) pages.add(p);
  }
  if (pages.size === 0) throw new Error('Choose at least one page.');
  return [...pages].sort((a, b) => a - b);
}

/** "42,43,44,46" → "42-44, 46" (for citations and prompts). */
export function formatPages(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++;
    out.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j;
  }
  return out.join(', ');
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Copies only the chosen pages into a new PDF, so each cloud call sends the diagnostics section
 * instead of the whole manual (inline requests are capped at 20 MB; some manuals are larger).
 */
export async function slicePdf(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
