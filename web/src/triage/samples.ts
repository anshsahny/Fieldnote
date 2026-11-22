/** Synthetic customer photos (scripts/make-triage-samples.swift), each matching a published pack. */
export interface TriageSample {
  id: string;
  label: string;
  src: string;
  message: string;
  /** The demo job this photo belongs to (seeded jobs). */
  jobId?: string;
}

export const SAMPLES: TriageSample[] = [
  {
    id: 'goodman-ee2',
    label: 'Goodman display',
    src: '/samples/goodman-ee2.jpg',
    message: "No heat since this morning. The little screen on the furnace says something and the fan outside isn't running.",
    jobId: 'job-1001',
  },
  {
    id: 'carrier-led',
    label: 'Carrier status light',
    src: '/samples/carrier-led.jpg',
    message: 'The furnace keeps turning on and off. The red light blinks once, pauses, then blinks 3 times, over and over.',
    jobId: 'job-1002',
  },
  {
    id: 'rheem-45',
    label: 'Rheem display',
    src: '/samples/rheem-45.jpg',
    message: 'Heat comes on then shuts off after a minute. The display shows a number.',
    jobId: 'job-1003',
  },
  {
    id: 'nameplate-only',
    label: 'Nameplate only',
    src: '/samples/nameplate-only.jpg',
    message: "Upstairs is cold. Here's the sticker on the furnace, I couldn't find any code.",
    jobId: 'job-1005',
  },
];
