import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { user, token, isLoading, isDevBypass } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="font-mono text-white/50 text-sm">AUTHENTICATING...</div>
      </div>
    );
  }

  if (!user && !token && !isDevBypass) {
    return <Navigate replace to="/login" />;
  }

  return <>{children}</>;
};
