import { create } from 'zustand';
import { signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

const DEV_BYPASS_STORAGE_KEY = "agos.auth.dev-bypass.v1";
const DEV_ADMIN_TOKEN = "dev_admin_token";
const DEV_ADMIN_USER = { uid: "dev-admin", displayName: "Dev Admin", email: "dev@admin.com" } as unknown as User;

const isDevBypassAllowed = () => import.meta.env.VITE_ENABLE_DEV_BYPASS === 'true';

const getStoredDevBypass = () => {
  if (typeof window === "undefined" || !isDevBypassAllowed()) {
    return false;
  }

  return window.localStorage.getItem(DEV_BYPASS_STORAGE_KEY) === "1";
};

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

export const useAuthStore = create<AuthState>((set, get) => {
  const storedDevBypass = getStoredDevBypass();

  return ({
  user: storedDevBypass ? DEV_ADMIN_USER : null,
  token: storedDevBypass ? DEV_ADMIN_TOKEN : null,
  isDevBypass: storedDevBypass,
  isLoading: !storedDevBypass,
  
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
      window.localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
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
    if (!isDevBypassAllowed()) return; // Only allow if explicitly enabled in env
    
    const newBypassState = !get().isDevBypass;
    if (newBypassState) {
      window.localStorage.setItem(DEV_BYPASS_STORAGE_KEY, "1");
      set({
        isDevBypass: true,
        token: DEV_ADMIN_TOKEN,
        user: DEV_ADMIN_USER,
        isLoading: false,
      });
    } else {
      window.localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
      set({
        isDevBypass: false,
        token: null,
        user: null,
        isLoading: false,
      });
      // Optionally sign back into firebase silently if needed, or just let them be logged out.
    }
  },

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setIsLoading: (isLoading) => set({ isLoading }),
});
});

// Set up the Firebase listener
auth.onIdTokenChanged(async (user) => {
  const store = useAuthStore.getState();
  if (store.isDevBypass) return;

  if (user) {
    const token = await user.getIdToken();
    useAuthStore.setState({ user, token, isLoading: false });
  } else {
    useAuthStore.setState({ user: null, token: null, isLoading: false });
  }
});
