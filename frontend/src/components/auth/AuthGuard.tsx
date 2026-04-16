import React from "react";
import { useAuthStore } from "../../store/authStore";
import { Button } from "@/components/ui/button";

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, token, isLoading, isDevBypass, loginWithGoogle, toggleDevBypass } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="font-mono text-white/50 text-sm">AUTHENTICATING...</div>
      </div>
    );
  }

  if (!user && !token && !isDevBypass) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md border border-border bg-card p-8 text-center">
          <h2 className="mb-2 font-sans text-2xl text-white">System Access Required</h2>
          <p className="mb-8 font-sans text-sm text-white/70">
            Please authenticate to access the trading and research modules.
          </p>
          
          <div className="flex flex-col gap-4">
            <Button onClick={loginWithGoogle} variant="default" className="w-full">
              Login with Google
            </Button>
            
            {import.meta.env.VITE_ENABLE_DEV_BYPASS === 'true' && (
              <Button onClick={toggleDevBypass} variant="outline" className="w-full">
                Enable Dev Bypass
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
