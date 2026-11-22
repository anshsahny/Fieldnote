import type { Part } from 'firebase/ai';

export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Downscales a photo in the browser (longest side ≤ maxSide, JPEG) before it goes to any model:
 * smaller prompts on-device, smaller uploads to the cloud. Phone photos are 12 MP+.
 */
export async function downscale(blob: Blob, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

export function toInlinePart(blob: Blob): Promise<Part> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const data = String(reader.result).split(',')[1] ?? '';
      // Same shape the P1 spike verified on-device in Chrome and in the cloud.
      resolve({ type: 'inlineData', inlineData: { data, mimeType: blob.type || 'image/jpeg' } } as Part);
    };
    reader.readAsDataURL(blob);
  });
}
