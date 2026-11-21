import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from '../firebase/client';

export interface Profile {
  orgId: string;
  role: 'tech' | 'dispatcher';
  displayName?: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; user: User; profile: Profile | null };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi>({
  state: { status: 'signed-out' },
  signIn: async () => {},
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
      signOut: () => signOut(getAuthClient()),
    }),
    [state],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
