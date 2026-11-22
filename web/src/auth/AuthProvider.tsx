import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from '../firebase/client';
import { DEMO_ORG_ID } from '../fixpack/firestore';

export interface Profile {
  orgId: string;
  /** guest = "Try the demo": anonymous, read-mostly access to the demo org (see firestore.rules). */
  role: 'tech' | 'dispatcher' | 'guest';
  displayName?: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; user: User; profile: Profile | null };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  /** One click for judges: no account, no password, demo org only, nothing destructive. */
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const GUEST_PROFILE: Profile = { orgId: DEMO_ORG_ID, role: 'guest', displayName: 'Demo guest' };

const AuthContext = createContext<AuthApi>({
  state: { status: 'signed-out' },
  signIn: async () => {},
  signInAsGuest: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    return onAuthStateChanged(getAuthClient(), async (user) => {
      if (!user) {
        setState({ status: 'signed-out' });
        return;
      }
      if (user.isAnonymous) {
        setState({ status: 'signed-in', user, profile: GUEST_PROFILE });
        return;
      }
      try {
        const snap = await getDoc(doc(getDb(), 'users', user.uid));
        setState({ status: 'signed-in', user, profile: snap.exists() ? (snap.data() as Profile) : null });
      } catch {
        setState({ status: 'signed-in', user, profile: null });
      }
    });
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      state,
      signIn: async (email, password) => {
        try {
          await signInWithEmailAndPassword(getAuthClient(), email, password);
        } catch (e) {
          const code = (e as { code?: string }).code ?? '';
          const message = /invalid-credential|wrong-password|user-not-found/.test(code)
            ? 'Email or password is incorrect.'
            : 'Sign-in failed. Try again.';
          setState({ status: 'signed-out', error: message });
          throw e;
        }
      },
      signInAsGuest: async () => {
        try {
          await signInAnonymously(getAuthClient());
        } catch {
          setState({ status: 'signed-out', error: 'The demo is unavailable right now. Try again in a minute.' });
        }
      },
      signOut: () => signOut(getAuthClient()),
    }),
    [state],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** The signed-in profile, or null while loading / signed out. */
export function useProfile(): (Profile & { uid: string }) | null {
  const { state } = useAuth();
  if (state.status !== 'signed-in' || !state.profile) return null;
  return { ...state.profile, uid: state.user.uid };
}
