import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import landingHero from "@/assets/landing_hero.jpeg";
import { LoginForm } from "@/components/login-form";
import { useAuthStore } from "@/store/authStore";

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
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
        <div className="border border-border bg-card px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
          AUTHENTICATING...
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
      <section className="relative min-h-[280px] overflow-hidden border-b border-white/10 lg:min-h-dvh lg:border-b-0 lg:border-r lg:border-white/10">
        <img
          src={landingHero}
          alt="AGOS terminal cover"
          className="absolute inset-0 size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-background/25" />

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
          <div className="max-w-[500px] border border-white/10 bg-background/70 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
              PRIVATE ACCESS
            </p>
            <p className="mt-3 font-sans text-[16px] leading-[1.5] text-white/70">
              The public edge is visual only. Sign in to open the research and trading
              surfaces.
            </p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-8 lg:px-12">
        <LoginForm onSubmit={handleSubmit} isSigningIn={isSigningIn} />
      </section>
    </div>
  );
};
