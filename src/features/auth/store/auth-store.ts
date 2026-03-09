import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearRelayTokenCache } from "@/lib/tunnel-prefs";

const STORAGE_KEY = "ihostmc-auth";

export interface AuthUser {
  token: string;
  userId: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => {
        clearRelayTokenCache();
        set({ user: null });
      },
    }),
    { name: STORAGE_KEY }
  )
);

export function getToken(): string | null {
  return useAuthStore.getState().user?.token ?? null;
}
