import {
  ArrowRightIcon,
  ChartBarIcon,
  CircleStackIcon,
  CommandLineIcon,
  ServerIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

import homeHeroImage from "@/assets/home_hero.jpeg";
import landingHeroImage from "@/assets/landing_hero.jpeg";
import { cn } from "@/lib/utils";

const navLinks = [
  { to: "/research", label: "Research" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/trading", label: "Trading" },
  { to: "/agent", label: "Agent" },
];

const telemetry = [
  { value: "04", label: "Runtime Surfaces", detail: "research / portfolio / trade / agent" },
  { value: "30s", label: "Health Pulse", detail: "engine, backend, cron cadence" },
  { value: "CPU", label: "Forecast Target", detail: "local Chronos serving path" },
];

const operatingLayers = [
  {
    icon: ShieldCheckIcon,
    index: "01",
    label: "AUTH / POLICY",
    title: "Security Boundary",
    body: "Stateless authentication and worker credentials isolate privileged actions from public research and review surfaces.",
  },
  {
    icon: CircleStackIcon,
    index: "02",
    label: "CRON / COSMOS",
    title: "Market Memory",
    body: "Collectors synchronize macro releases, price history, and news context before models are allowed to reason over them.",
  },
  {
    icon: CommandLineIcon,
    index: "03",
    label: "TRACE / REASON",
    title: "Agentic Review",
    body: "LLM orchestration converts unstructured narratives into inspectable sentiment, tool calls, citations, and decision traces.",
  },
  {
    icon: ChartBarIcon,
    index: "04",
    label: "ENGINE / MODEL",
    title: "Forecast Surface",
    body: "Short-horizon probabilities are generated from local market microstructure and held separate from execution policy.",
  },
  {
    icon: ServerIcon,
    index: "05",
    label: "SIGNAL / RISK",
    title: "Signal Assembly",
    body: "Forecasts, sentiment, position state, and risk limits converge into trade candidates without hiding their inputs.",
  },
  {
    icon: ArrowRightIcon,
    index: "06",
    label: "LOG / VERIFY",
    title: "Execution Audit",
    body: "Every model step, policy gate, and sandboxed execution draft remains visible before capital is committed.",
  },
];

const systemLoop = [
  { step: "01", label: "Ingest", detail: "Macro, news, price history" },
  { step: "02", label: "Forecast", detail: "Chronos probability windows" },
  { step: "03", label: "Reason", detail: "Narrative and tool trace" },
  { step: "04", label: "Constrain", detail: "Policy and risk guardrails" },
  { step: "05", label: "Stage", detail: "Sandboxed trade intent" },
  { step: "06", label: "Audit", detail: "Evidence and execution log" },
];

const artifactNodes = [
  { label: "DATA", value: "COSMOS", tone: "muted" },
  { label: "MODEL", value: "CHRONOS", tone: "active" },
  { label: "AGENT", value: "LANGCHAIN", tone: "muted" },
  { label: "POLICY", value: "GUARDRAIL", tone: "muted" },
  { label: "SIGNAL", value: "CANDIDATE", tone: "active" },
  { label: "AUDIT", value: "TRACE", tone: "verified" },
];

const auditRows = [
  { label: "forecast window", value: "30s cadence" },
  { label: "agent review", value: "sources attached" },
  { label: "execution mode", value: "sandbox" },
];

const footerGroups = [
  { title: "Surfaces", links: navLinks },
  {
    title: "System",
    links: [
      { to: "/research", label: "Model traces" },
      { to: "/agent", label: "Agent runbook" },
      { to: "/trading", label: "Execution review" },
    ],
  },
];

const warmMaskStyle = {
  maskImage: "linear-gradient(to top, white 0%, white 30%, transparent 86%)",
  WebkitMaskImage: "linear-gradient(to top, white 0%, white 30%, transparent 86%)",
};

const warmLightUpperStyle = {
  background:
    "conic-gradient(from 180deg at 50% 94% in lab, color-mix(in oklch, var(--foreground) 20%, transparent) 18deg, color-mix(in oklch, var(--chart-1) 42%, transparent) 38deg, color-mix(in oklch, var(--chart-1) 18%, transparent) 72deg, transparent 98deg, transparent 328deg, color-mix(in oklch, var(--foreground) 16%, transparent) 360deg)",
};

const warmLightLowerStyle = {
  background:
    "conic-gradient(at 50% 6% in lab, color-mix(in oklch, var(--foreground) 18%, transparent) 0deg, transparent 18deg, transparent 262deg, color-mix(in oklch, var(--chart-1) 16%, transparent) 286deg, color-mix(in oklch, var(--chart-1) 40%, transparent) 324deg, color-mix(in oklch, var(--foreground) 16%, transparent) 342deg)",
};

export const LandingPage = () => {
  return (
    <div className="min-h-dvh bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/86 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-10">
            <Link to="/" className="font-mono text-[14px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-muted-foreground">
              AGOS
            </Link>

            <nav className="hidden items-center gap-7 md:flex" aria-label="Primary navigation">
              {navLinks.map((item) => (
                <Link key={item.label} to={item.to} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-chart-2" />
              Live Ops
            </div>
            <Link
              to="/login"
              className="rounded-full border border-border bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70 sm:px-5"
            >
              Access Terminal
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 -z-30">
            <img
              src={homeHeroImage}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-[center_44%] opacity-45 grayscale contrast-125"
            />
          </div>
          <div className="absolute inset-0 -z-20 bg-gradient-to-b from-background via-background/50 to-background" aria-hidden="true" />
          <div className="absolute inset-0 -z-20 bg-gradient-to-r from-background via-background/45 to-background/80" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" aria-hidden="true" />
          <div className="absolute left-[18%] top-0 -z-10 hidden h-full w-px bg-border/45 lg:block" aria-hidden="true" />
          <div className="absolute right-[24%] top-0 -z-10 hidden h-full w-px bg-border/35 lg:block" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-[18%] -z-10 hidden h-px bg-border/35 lg:block" aria-hidden="true" />

          <div className="relative mx-auto flex min-h-[calc(100svh-76px)] max-w-[1280px] flex-col justify-between px-5 py-16 sm:px-8 lg:py-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex w-fit rounded-full border border-border/70 bg-background/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-md">
                Agentic Graph Observation System / V1
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">Lat 00.00 / Market Lab / Audit Armed</span>
            </div>

            <div className="grid gap-12 py-20 lg:grid-cols-[minmax(0,0.76fr)_minmax(340px,0.34fr)] lg:items-end lg:gap-24 lg:py-28">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">[ Frontier Market Lab ]</p>
                <h1 className="mt-7 max-w-[920px] font-sans text-[clamp(4rem,9vw,8.35rem)] font-light leading-[0.92] tracking-[-0.065em] text-foreground">
                  Market agents, made observable.
                </h1>
              </div>

              <div className="border-l border-border/70 pl-6 lg:mb-3">
                <p className="max-w-[520px] font-sans text-[17px] font-medium leading-[1.65] text-foreground/82 sm:text-[19px]">
                  AGOS stages research, forecasting, and execution review as inspectable decision surfaces, so every signal carries evidence before it reaches a trade desk.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link
                    to="/research"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-85"
                  >
                    Inspect Research <ArrowRightIcon className="ml-2 size-4" />
                  </Link>
                  <Link
                    to="/agent"
                    className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-transparent px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70"
                  >
                    Open Agent <ArrowRightIcon className="ml-2 size-4" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-px border border-border/70 bg-border/70 sm:grid-cols-3">
              {telemetry.map((metric) => (
                <div key={metric.label} className="bg-background/72 px-5 py-5 backdrop-blur-sm sm:px-7">
                  <p className="font-sans text-[44px] font-light leading-none tracking-[-0.045em] text-foreground sm:text-[54px]">{metric.value}</p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-b border-border/70 py-28 sm:py-36 lg:py-44">
          <div className="absolute left-0 top-0 hidden h-full w-px bg-border/35 lg:left-[18%] lg:block" aria-hidden="true" />
          <div className="absolute right-[24%] top-0 hidden h-full w-px bg-border/25 lg:block" aria-hidden="true" />

          <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.42fr_0.58fr] lg:gap-24">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">[ Decision Surface ]</p>
                <h2 className="mt-6 max-w-[590px] font-sans text-[42px] font-light leading-[1.04] tracking-[-0.04em] text-foreground sm:text-[64px]">
                  A lab instrument for reasoning under market uncertainty.
                </h2>
              </div>
              <p className="max-w-[720px] font-sans text-[18px] leading-[1.7] text-foreground/76 lg:pt-12">
                The system separates data collection, model evaluation, agent reasoning, and execution policy without flattening operational context into a single opaque score.
              </p>
            </div>

            <div className="mt-24 grid border border-border/70 lg:grid-cols-[0.82fr_1.18fr]">
              <div className="flex min-h-[560px] flex-col justify-between bg-background p-6 sm:p-9">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Architecture / Separation</p>
                  <h3 className="mt-7 max-w-[450px] font-sans text-[34px] font-light leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[46px]">
                    Each layer can fail, recover, and be audited independently.
                  </h3>
                </div>

                <div className="mt-12 space-y-0 border-y border-border/70">
                  {auditRows.map((row) => (
                    <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 border-b border-border/70 py-4 last:border-b-0">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">{row.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/85">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <DecisionArtifact />
            </div>
          </div>
        </section>

        <section className="border-b border-border/70 py-28 sm:py-36 lg:py-44">
          <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.45fr_0.55fr] lg:gap-24">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">[ System Loop ]</p>
                <h2 className="mt-6 max-w-[560px] font-sans text-[42px] font-light leading-[1.04] tracking-[-0.04em] text-foreground sm:text-[62px]">
                  Research, model context, and execution policy on one rail.
                </h2>
              </div>
              <div className="space-y-8 lg:pt-12">
                <p className="max-w-[720px] font-sans text-[18px] leading-[1.7] text-foreground/76">
                  AGOS is structured for operators who need live context without surrendering control to an invisible automation loop.
                </p>
                <div className="grid gap-px border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
                  {systemLoop.map((item, index) => (
                    <div key={item.step} className="bg-background px-5 py-5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{item.step}</span>
                        <span className={cn("size-1.5 rounded-full", index === systemLoop.length - 1 ? "bg-chart-2" : index === 2 ? "bg-chart-1" : "bg-muted-foreground/45")} />
                      </div>
                      <p className="mt-8 font-sans text-[23px] font-light leading-none tracking-[-0.03em] text-foreground">{item.label}</p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-24 grid gap-px border border-border/70 bg-border/70 md:grid-cols-2 lg:grid-cols-3">
              {operatingLayers.map((layer) => {
                const Icon = layer.icon;
                return (
                  <article key={layer.title} className="group min-h-[315px] bg-background p-7 transition-colors hover:bg-card/30 sm:p-9">
                    <div className="flex items-start justify-between gap-6">
                      <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                      <div className="text-right">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">{layer.index}</p>
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">{layer.label}</p>
                      </div>
                    </div>
                    <h3 className="mt-20 font-sans text-[28px] font-light leading-[1.08] tracking-[-0.025em] text-foreground">{layer.title}</h3>
                    <p className="mt-5 font-sans text-[15px] leading-[1.7] text-muted-foreground">{layer.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden border-b border-border/70 py-32 sm:py-40 lg:py-52">
          <WarmLightMask />
          <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" aria-hidden="true" />

          <div className="mx-auto max-w-[1280px] px-5 text-center sm:px-8">
            <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">[ Deployment Surfaces ]</p>
            <h2 className="mx-auto mt-6 max-w-[920px] font-sans text-[42px] font-light leading-[1.02] tracking-[-0.045em] text-foreground sm:text-[66px]">
              Move from black-box automation into live review.
            </h2>
            <p className="mx-auto mt-7 max-w-[620px] font-sans text-[17px] leading-[1.65] text-foreground/70">
              Open the lab surfaces when you need evidence, forecasts, policy gates, and execution context in the same field of view.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/research"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-transparent px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70"
              >
                Inspect Model Traces
              </Link>
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-85"
              >
                Open Terminal
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden py-14 sm:py-16">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">AGOS Infrastructure</p>
            <p className="mt-3 max-w-[460px] font-sans text-[14px] leading-[1.7] text-muted-foreground">
              Agentic graph observation for inspectable market reasoning, forecast review, and sandboxed execution policy.
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-2">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/65">{group.title}</p>
                <div className="mt-4 grid gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {group.links.map((item) => (
                    <Link key={`${group.title}-${item.label}`} to={item.to} className="transition-colors hover:text-foreground">
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

const WarmLightMask = () => {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0 -z-10 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2.5, ease: "easeInOut" }}
    >
      <div
        className="absolute -bottom-[42%] left-1/2 flex h-[680px] w-[120vw] max-w-[1320px] -translate-x-1/2 flex-col blur-3xl opacity-100 md:-bottom-[48%] md:h-[760px]"
        style={warmMaskStyle}
      >
        <div className="grow" style={warmLightUpperStyle} />
        <div className="grow" style={warmLightLowerStyle} />
        <canvas className="absolute inset-0 h-full w-full" width="1200" height="760" />
      </div>
    </motion.div>
  );
};

const DecisionArtifact = () => {
  return (
    <div className="relative min-h-[560px] overflow-hidden border-t border-border/70 bg-background lg:border-l lg:border-t-0">
      <img src={landingHeroImage} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-28 grayscale contrast-125" />
      <div className="absolute inset-0 bg-background/68" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/20 to-background" aria-hidden="true" />
      <div className="absolute left-1/2 top-0 h-full w-px bg-border/55" aria-hidden="true" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/45" aria-hidden="true" />

      <div className="relative z-10 flex min-h-[560px] flex-col justify-between p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          <span>Agent Graph / Live Simulation</span>
          <span>Audit Lock: On</span>
        </div>

        <div className="my-12 grid gap-px border border-border/70 bg-border/70 sm:grid-cols-3">
          {artifactNodes.map((node) => (
            <div key={node.label} className="bg-background/78 px-4 py-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">{node.label}</span>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    node.tone === "active" ? "bg-chart-1" : node.tone === "verified" ? "bg-chart-2" : "bg-muted-foreground/45"
                  )}
                />
              </div>
              <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">{node.value}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto w-full max-w-[520px] border border-border/80 bg-background/82 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Policy Kernel</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-chart-2">Verified</p>
          </div>
          <p className="mt-5 font-sans text-[24px] font-light leading-[1.15] tracking-[-0.03em] text-foreground">No signal exits without evidence, limits, and trace context.</p>
          <div className="mt-6 grid gap-px bg-border/70 sm:grid-cols-3">
            {auditRows.map((row) => (
              <div key={`artifact-${row.label}`} className="bg-background px-3 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">{row.label}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/85">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
