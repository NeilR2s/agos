import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import landingHero from "@/assets/landing_hero.jpeg";
import { LoginForm } from "@/components/login-form";
import { useAuthStore } from "@/store/authStore";

const authHeroGridStyle = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in oklch, var(--foreground) 10%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 8%, transparent) 1px, transparent 1px)",
  backgroundSize: "118px 118px",
  maskImage: "linear-gradient(to right, transparent 0%, black 18%, black 74%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 18%, black 74%, transparent 100%)",
};

const authHeroVeilStyle = {
  background:
    "radial-gradient(circle at 34% 30%, color-mix(in oklch, var(--foreground) 16%, transparent) 0%, transparent 22%), radial-gradient(ellipse at 20% 94%, color-mix(in oklch, var(--foreground) 10%, transparent) 0%, transparent 52%), linear-gradient(90deg, color-mix(in oklch, var(--background) 24%, transparent) 0%, color-mix(in oklch, var(--background) 70%, transparent) 56%, var(--background) 100%)",
};

const authPanelGlowStyle = {
  background:
    "radial-gradient(ellipse at 50% 50%, color-mix(in oklch, var(--foreground) 12%, transparent) 0%, color-mix(in oklch, var(--foreground) 5%, transparent) 28%, transparent 68%)",
};

const accessNodes = [
  { label: "Identity", value: "Google" },
  { label: "Entry", value: "Research" },
  { label: "Policy", value: "Private" },
];

export const LoginPage = () => {
  const navigate = useNavigate();
  const { user, token, isDevBypass, isLoading, loginWithGoogle } = useAuthStore();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!isLoading && (user || token || isDevBypass)) {
      navigate("/research", { replace: true });
    }
  }, [isDevBypass, isLoading, navigate, token, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSigningIn) {
      return;
    }

    setIsSigningIn(true);

    try {
      await loginWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-6 text-center text-foreground">
        <div className="absolute inset-x-0 bottom-0 h-1/2 xai-horizon-glow opacity-25" aria-hidden="true" />
        <div className="relative border border-border/70 bg-card/60 px-7 py-5 backdrop-blur-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Authentication Handshake</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/80">Resolving session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,1.08fr)_minmax(520px,0.92fr)]">
      <section className="relative isolate min-h-[430px] overflow-hidden border-b border-border/70 lg:min-h-dvh lg:border-b-0 lg:border-r">
        <img
          src={landingHero}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-30 size-full object-cover object-[42%_50%] opacity-75 grayscale contrast-125"
        />
        <div className="absolute inset-0 -z-20" style={authHeroVeilStyle} aria-hidden="true" />
        <div className="absolute inset-0 -z-10 opacity-35" style={authHeroGridStyle} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" aria-hidden="true" />
        <div className="absolute bottom-0 left-[18%] top-0 -z-10 hidden w-px bg-border/45 lg:block" aria-hidden="true" />
        <div className="absolute bottom-0 right-[22%] top-0 -z-10 hidden w-px bg-border/35 lg:block" aria-hidden="true" />

        <div className="relative z-10 flex min-h-[430px] flex-col justify-between p-5 sm:p-8 lg:min-h-dvh lg:p-10 xl:p-14">
          <div className="flex items-center justify-between gap-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>AGOS / Access Edge</span>
            <span className="hidden sm:inline">Audit Armed</span>
          </div>

          <div className="max-w-[760px] pb-2 lg:pb-8">
            <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">[ Private Lab Surface ]</p>
            <h2 className="mt-6 max-w-[680px] font-sans text-[44px] font-light leading-[1.02] tracking-[-0.045em] text-foreground sm:text-[62px] lg:text-[78px]">
              Verified access for frontier market operations.
            </h2>
            <p className="mt-7 max-w-[560px] font-sans text-[17px] leading-[1.65] text-foreground/72 sm:text-[18px]">
              Public artifacts are visible. Session-locked research and trading require identity resolution.
            </p>

            <div className="mt-10 grid gap-px border border-border/70 bg-border/70 sm:max-w-[620px] sm:grid-cols-3">
              {accessNodes.map((node) => (
                <div key={node.label} className="bg-background/58 px-4 py-4 backdrop-blur-md">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">{node.label}</p>
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/90">{node.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[620px] items-center justify-center overflow-hidden px-5 py-12 sm:px-8 lg:min-h-dvh lg:px-12">
        <div className="absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 blur-3xl" style={authPanelGlowStyle} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent lg:hidden" aria-hidden="true" />
        <LoginForm onSubmit={handleSubmit} isSigningIn={isSigningIn} />
      </section>
    </div>
  );
};
