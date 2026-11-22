import type { Timestamp } from 'firebase/firestore';

/** Firestore shapes written by the iOS app and the seed (orgs/{org}/...). Read-only on the web. */

export type TS = Timestamp | undefined | null;

export function toDate(t: TS): Date | undefined {
  return t && typeof (t as Timestamp).toDate === 'function' ? (t as Timestamp).toDate() : undefined;
}

export interface Triage {
  brand?: string;
  model?: string;
  errorCode?: string;
  likelyFault: string;
  partsToBring?: string[];
  confidence?: number;
  source: 'ON_DEVICE' | 'IN_CLOUD';
  latencyMs?: number;
  packId?: string;
  matchedCode?: string;
  photoStayedOnDevice?: boolean;
  attachedAt: TS;
}

export interface Job {
  id: string;
  customer: { name: string; phone?: string; address?: string };
  equipment: { type?: string; brand?: string; model?: string; serial?: string };
  reported: string;
  priority: 'urgent' | 'normal' | 'low' | string;
  status: 'new' | 'scheduled' | 'assigned' | 'in_progress' | 'done' | string;
  assignedTo: string | null;
  assignedName?: string | null;
  scheduledFor: TS;
  updatedAt?: TS;
  triage?: Triage;
}

/** ios/Fieldnote/Core/SessionState.swift */
export interface SessionStep {
  stepId: string;
  instruction: string;
  answer: string;
  via: 'tap' | 'reading' | 'note' | string;
  input?: string;
  source?: 'ON_DEVICE' | 'IN_CLOUD';
  latencyMs?: number;
  model?: string;
  confidence?: number;
  say?: string;
}

export interface Session {
  id: string;
  jobId: string;
  techUid: string;
  packId: string;
  packVersion: number;
  faultCode: string;
  status: 'active' | 'concluded' | 'abandoned';
  stepId: string;
  history: SessionStep[];
  acknowledgedStops: string[];
  createdOffline: boolean;
  startedAt: TS;
  updatedAt: TS;
}

/** ios/Fieldnote/Services/ReportStore.swift */
export interface ReportContent {
  summary: string;
  workPerformed: string[];
  findings: string[];
  recommendations: string[];
  safetyNotes: string[];
}

export interface ReportVersion {
  generatedBy: 'ON_DEVICE' | 'IN_CLOUD' | 'PLAIN';
  model?: string;
  kind: 'draft' | 'full';
  createdAt: TS;
  latencyMs?: number;
  content: ReportContent;
}

export interface Report {
  id: string;
  jobId: string;
  sessionId: string;
  techUid: string;
  facts: {
    equipment: string;
    brand: string;
    faultCode: string;
    fault: string;
    outcomeKind: string;
    outcomeTitle: string;
    outcome: string;
    parts: string[];
    repairDone?: boolean;
  };
  versions: ReportVersion[];
  status: 'draft' | 'final';
  generatedBy: string;
  createdOffline: boolean;
  createdAt: TS;
  updatedAt: TS;
  upgradedAt?: TS;
}

/** orgs/{org}/inferenceEvents: metadata only. */
export interface LedgerRow {
  id: string;
  feature: string;
  platform: 'ios' | 'web';
  source: 'ON_DEVICE' | 'IN_CLOUD' | 'NONE';
  latencyMs: number;
  ok?: boolean;
  promptTokensEst?: number;
  model?: string;
  mode?: string;
  ts: TS;
}
