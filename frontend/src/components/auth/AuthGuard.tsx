import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { user, token, isLoading, isDevBypass } = useAuthStore();
  const hasAuth = Boolean(user || token || isDevBypass);

  useEffect(() => {
    if (!isLoading && hasAuth) {
      // Pre-fetch heavy route chunks to reduce "LOADING WORKSPACE" delays
      import("../../features/research/ResearchView");
      import("../../features/portfolio/Dashboard");
      import("../../features/trading/TradingTerminal");
      import("../../features/agent/AgentPage");
      import("../../features/map/MapPage");
    }
  }, [isLoading, hasAuth]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="font-mono text-white/50 text-sm">AUTHENTICATING...</div>
      </div>
    );
  }

  if (!hasAuth) {
    return <Navigate replace to="/login" />;
  }

  return <>{children}</>;
};
