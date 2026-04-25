import type { ComponentProps } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

type LoginFormProps = ComponentProps<"form"> & {
  isSigningIn?: boolean;
};

export function LoginForm({ className, isSigningIn = false, ...props }: LoginFormProps) {
  const isDevBypassEnabled = import.meta.env.VITE_ENABLE_DEV_BYPASS === "true";
  const toggleDevBypass = useAuthStore((state) => state.toggleDevBypass);

  return (
    <form
      className={cn(
        "w-full max-w-[520px] border border-border bg-card p-6 text-foreground sm:p-8 lg:p-10",
        className,
      )}
      {...props}
    >
      <div className="space-y-8">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/"
              className="font-mono text-[14px] uppercase tracking-[1.4px] text-white transition-opacity hover:opacity-50"
            >
              AGOS
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
              PRIVATE ACCESS
            </span>
          </div>

          <div className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
              GOOGLE AUTH ONLY
            </p>
            <h1 className="font-sans text-[30px] leading-[1.2] text-white sm:text-[36px]">
              SIGN IN TO THE TERMINAL
            </h1>
            <p className="max-w-[460px] font-sans text-[16px] leading-[1.5] text-white/70">
              Use your Google account to enter Research, Portfolio, and Trading.
            </p>
          </div>
        </div>

        <div className="h-px bg-white/10" />

        <div className="space-y-4">
          <Button type="submit" className="w-full" disabled={isSigningIn}>
            {isSigningIn ? "SIGNING IN..." : "LOGIN WITH GOOGLE"}
          </Button>
          {isDevBypassEnabled ? (
            <Button type="button" variant="outline" className="w-full" onClick={toggleDevBypass}>
              LOGIN AS DEV ADMIN
            </Button>
          ) : null}
          <p className="font-sans text-[14px] leading-[1.5] text-white/40">
            After authentication you will be sent to Research.
          </p>
          {isDevBypassEnabled ? (
            <p className="font-sans text-[12px] leading-[1.5] text-white/30">
              Dev bypass is enabled in the frontend env and uses the shared local token.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
