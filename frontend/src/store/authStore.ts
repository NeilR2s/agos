import { create } from 'zustand';
import { signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthState {
  user: User | null;
  token: string | null;
  isDevBypass: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  toggleDevBypass: () => void;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isDevBypass: false,
  isLoading: true,
  
  loginWithGoogle: async () => {
    if (get().isDevBypass) return;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      set({ user: result.user, token });
    } catch (error) {
      console.error("Error logging in with Google", error);
    }
  },

  logout: async () => {
    if (get().isDevBypass) {
      set({ user: null, token: null, isDevBypass: false });
      return;
    }
    try {
      await signOut(auth);
      set({ user: null, token: null });
    } catch (error) {
      console.error("Error logging out", error);
    }
  },

  toggleDevBypass: () => {
    const isBypassEnabled = import.meta.env.VITE_ENABLE_DEV_BYPASS === 'true';
    if (!isBypassEnabled) return; // Only allow if explicitly enabled in env
    
    const newBypassState = !get().isDevBypass;
    if (newBypassState) {
      set({
        isDevBypass: true,
        token: "dev_admin_token",
        user: { uid: "dev-admin", displayName: "Dev Admin", email: "dev@admin.com" } as unknown as User,
      });
    } else {
      set({
        isDevBypass: false,
        token: null,
        user: null,
      });
      // Optionally sign back into firebase silently if needed, or just let them be logged out.
    }
  },

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));

// Set up the Firebase listener
auth.onIdTokenChanged(async (user) => {
  const store = useAuthStore.getState();
  if (store.isDevBypass) return;

  if (user) {
    const token = await user.getIdToken();
    store.setUser(user);
    store.setToken(token);
  } else {
    store.setUser(null);
    store.setToken(null);
  }
  store.setIsLoading(false);
});
