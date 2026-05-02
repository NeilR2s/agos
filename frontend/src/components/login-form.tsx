import type { ComponentProps } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

type LoginFormProps = ComponentProps<"form"> & {
  isSigningIn?: boolean;
};

const authRows = [
  { label: "Provider", value: "Google OAuth" },
  { label: "Session", value: "Firebase Token" },
  { label: "Destination", value: "Research" },
];

export function LoginForm({ className, isSigningIn = false, ...props }: LoginFormProps) {
  const isDevBypassEnabled = import.meta.env.VITE_ENABLE_DEV_BYPASS === "true";
  const toggleDevBypass = useAuthStore((state) => state.toggleDevBypass);

  return (
    <form
      className={cn(
        "relative z-10 w-full max-w-[520px] overflow-hidden border border-border/70 bg-card/55 p-6 text-foreground backdrop-blur-2xl sm:p-8 lg:p-10",
        className,
      )}
      {...props}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/35 to-transparent" aria-hidden="true" />

      <div className="space-y-9">
        <div className="space-y-7">
          <div className="flex items-center justify-between gap-5">
            <Link
              to="/"
              className="font-mono text-[13px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-muted-foreground"
            >
              AGOS
            </Link>
            <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/65">
              <span className="size-1.5 rounded-full bg-chart-2" aria-hidden="true" />
              Private Access
            </span>
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              [ Identity Gate ]
            </p>
            <h1 className="mt-5 max-w-[430px] font-sans text-[42px] font-light leading-[1.04] tracking-[-0.045em] text-foreground sm:text-[54px]">
              Sign in to the terminal.
            </h1>
            <p className="mt-5 max-w-[420px] font-sans text-[16px] leading-[1.65] text-foreground/72">
              Use Google SSO to enter Research, Portfolio, and Trading with authenticated operator context.
            </p>
          </div>
        </div>

        <div className="grid gap-px border border-border/70 bg-border/70">
          {authRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 bg-background/55 px-4 py-3 backdrop-blur-sm">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/65">{row.label}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/82">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-5">
          <Button type="submit" size="lg" className="h-12 w-full justify-between px-6 text-[12px] tracking-[0.16em]" disabled={isSigningIn}>
            <span>{isSigningIn ? "Signing in..." : "Continue with Google"}</span>
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Button>
          <p className="font-sans text-[13px] leading-[1.6] text-muted-foreground/70">
            After authentication, AGOS opens the Research surface and restores your protected session.
          </p>
          {isDevBypassEnabled ? (
            <div className="border-t border-border/60 pt-4">
              <p className="font-sans text-[12px] leading-[1.6] text-muted-foreground/55">
                Local dev bypass is enabled.{" "}
                <button
                  type="button"
                  onClick={toggleDevBypass}
                  className="font-mono uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Continue as dev admin
                </button>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
