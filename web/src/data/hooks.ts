import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { getDb } from '../firebase/client';
import type { FixPackDocFields } from '../fixpack/firestore';
import type { Job, LedgerRow, Report, Session } from './types';

export interface Live<T> {
  data: T;
  loading: boolean;
  error?: string;
}

function friendly(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'permission-denied') return "Your account can't see this data.";
  if (code === 'unavailable') return 'Offline: showing what was loaded last.';
  return 'Could not load data. Refresh to try again.';
}

/** Live query; `key` re-subscribes when inputs change. Returns [] while loading. */
function useLiveQuery<T>(key: string | null, build: () => Query<DocumentData>, map: (id: string, d: DocumentData) => T): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true });
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      build(),
      (snap) => setState({ data: snap.docs.map((d) => map(d.id, d.data())), loading: false }),
      (e) => setState({ data: [], loading: false, error: friendly(e) }),
    );
    // build/map are derived from key by the callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useJobs(orgId: string | undefined): Live<Job[]> {
  return useLiveQuery(
    orgId ? `jobs:${orgId}` : null,
    () => query(collection(getDb(), 'orgs', orgId!, 'jobs'), orderBy('scheduledFor')),
    (id, d) => ({ id, ...(d as Omit<Job, 'id'>) }),
  );
}

export function useJob(orgId: string | undefined, jobId: string | undefined): Live<Job | null> {
  const [state, setState] = useState<Live<Job | null>>({ data: null, loading: true });
  useEffect(() => {
    if (!orgId || !jobId) return;
    return onSnapshot(
      doc(getDb(), 'orgs', orgId, 'jobs', jobId),
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Job, 'id'>) } : null, loading: false }),
      (e) => setState({ data: null, loading: false, error: friendly(e) }),
    );
  }, [orgId, jobId]);
  return state;
}

export function useSessions(orgId: string | undefined, jobId: string | undefined): Live<Session[]> {
  return useLiveQuery(
    orgId && jobId ? `sessions:${orgId}:${jobId}` : null,
    () => query(collection(getDb(), 'orgs', orgId!, 'jobs', jobId!, 'sessions'), orderBy('startedAt', 'desc')),
    (id, d) => ({ ...(d as Session), id }),
  );
}

export function useReports(orgId: string | undefined, jobId?: string): Live<Report[]> {
  return useLiveQuery(
    orgId ? `reports:${orgId}:${jobId ?? '*'}` : null,
    () =>
      jobId
        ? query(collection(getDb(), 'orgs', orgId!, 'reports'), where('jobId', '==', jobId))
        : query(collection(getDb(), 'orgs', orgId!, 'reports'), orderBy('updatedAt', 'desc'), limit(50)),
    (id, d) => ({ ...(d as Report), id }),
  );
}

/** Ledger rows from the last `days` days (newest first). */
export function useLedger(orgId: string | undefined, days: number): Live<LedgerRow[]> {
  return useLiveQuery(
    orgId ? `ledger:${orgId}:${days}` : null,
    () =>
      query(
        collection(getDb(), 'orgs', orgId!, 'inferenceEvents'),
        where('ts', '>=', Timestamp.fromMillis(Date.now() - days * 86_400_000)),
        orderBy('ts', 'desc'),
        limit(2000),
      ),
    (id, d) => ({ ...(d as Omit<LedgerRow, 'id'>), id }),
  );
}

export type PackDoc = FixPackDocFields & { id: string };

export function usePacks(orgId: string | undefined): Live<PackDoc[]> {
  return useLiveQuery(
    orgId ? `packs:${orgId}` : null,
    () => query(collection(getDb(), 'orgs', orgId!, 'fixpacks'), orderBy('brand')),
    (id, d) => ({ id, ...(d as FixPackDocFields) }),
  );
}
