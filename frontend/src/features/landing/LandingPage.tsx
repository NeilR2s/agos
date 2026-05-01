import {
    ArrowRightIcon,
    ChartBarIcon,
    CommandLineIcon,
    ServerIcon,
    ShieldCheckIcon,
    CircleStackIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import homeHeroImage from "@/assets/home_hero.jpeg";

const architectureBlocks = [
    {
        icon: ShieldCheckIcon,
        title: "Security",
        body: "Stateless authentication and key-based worker identity keep privileged actions isolated from public surfaces.",
        label: "AUTH / POLICY",
    },
    {
        icon: CircleStackIcon,
        title: "Ingestion",
        body: "Distributed collectors synchronize macro releases and market history into high-throughput storage on fixed intervals.",
        label: "CRON / COSMOS",
    },
    {
        icon: CommandLineIcon,
        title: "Agentic",
        body: "LangChain orchestration converts unstructured narratives into transparent sentiment, tool use, and decision traces.",
        label: "TRACE / REASON",
    },
    {
        icon: ChartBarIcon,
        title: "Forecasting",
        body: "Chronos-based forecasting evaluates short-horizon probabilities directly from local market microstructure.",
        label: "ENGINE / MODEL",
    },
    {
        icon: ServerIcon,
        title: "Aggregation",
        body: "Sentiment and time-series outputs are finalized into executable trade signals within the core engine.",
        label: "SIGNAL / RISK",
    },
    {
        icon: ArrowRightIcon,
        title: "Audit",
        body: "Execution stays in a sandbox while every model step, policy check, and signal remains visible and explainable.",
        label: "LOG / VERIFY",
    },
];

const navLinks = [
    { to: "/research", label: "RESEARCH" },
    { to: "/portfolio", label: "PORTFOLIO" },
    { to: "/trading", label: "TRADING" },
    { to: "/agent", label: "AGENT" },
];

const metrics = [
    { value: "04", label: "Runtime surfaces" },
    { value: "30s", label: "Engine health cadence" },
    { value: "CPU", label: "Forecast serving target" },
];

export const LandingPage = () => {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
            <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
                    <div className="flex items-center gap-10">
                        <Link to="/" className="font-mono text-[14px] uppercase tracking-[0.18em] text-foreground transition-colors hover:text-muted-foreground">
                            AGOS
                        </Link>

                        <nav className="hidden items-center gap-7 md:flex">
                            {navLinks.map((item) => (
                                <Link
                                    key={item.label}
                                    to={item.to}
                                    className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:flex">
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
                <section className="relative isolate overflow-hidden border-b border-border/70 pb-28 pt-24 sm:pb-36 sm:pt-36 lg:min-h-[880px] lg:pb-44 lg:pt-48">
                    <div className="absolute inset-0 -z-20">
                        <img
                            src={homeHeroImage}
                            alt="Night skyline"
                            fetchPriority="high"
                            loading="eager"
                            decoding="async"
                            className="h-full w-full object-cover object-[center_42%] opacity-35 grayscale"
                        />
                        <div className="absolute inset-0 bg-background/70" />
                    </div>
                    <div
                        className="absolute right-[-18%] top-[-20%] -z-10 h-[760px] w-[760px] rounded-full blur-3xl"
                        style={{
                            background: "radial-gradient(circle, color-mix(in oklch, var(--foreground) 22%, transparent) 0%, color-mix(in oklch, var(--chart-3) 28%, transparent) 24%, transparent 64%)",
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent"
                        aria-hidden="true"
                    />
                    <div className="absolute left-[18%] top-0 -z-10 hidden h-full w-px bg-border/50 lg:block" aria-hidden="true" />
                    <div className="absolute right-[24%] top-0 -z-10 hidden h-full w-px bg-border/40 lg:block" aria-hidden="true" />

                    <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
                        <Badge variant="outline" className="border-border/70 bg-background/40 px-3 py-1 text-[10px] text-muted-foreground backdrop-blur-md">
                            AGENTIC GRAPH OBSERVATION SYSTEM / V1
                        </Badge>

                        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.46fr)] lg:items-end lg:gap-24">
                            <div>
                                <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">[ MARKET INTELLIGENCE ]</p>
                                <h1 className="mt-7 max-w-[900px] font-sans text-[58px] font-light leading-[0.96] tracking-[-0.055em] text-foreground sm:text-[82px] lg:text-[108px]">
                                    Automated trading in a black-box universe.
                                </h1>
                            </div>

                            <div className="space-y-7 lg:pb-3">
                                <p className="max-w-[520px] font-sans text-[17px] font-medium leading-[1.6] text-foreground/80 sm:text-[19px]">
                                    AGOS combines LLM reasoning, neural forecasting, and quantitative guardrails into inspectable decision surfaces for research, portfolio, and execution workflows.
                                </p>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <Link
                                        to="/research"
                                        className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-85"
                                    >
                                        Try AGOS <ArrowRightIcon className="ml-2 size-4" />
                                    </Link>
                                    <Link
                                        to="/agent"
                                        className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-transparent px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70"
                                    >
                                        Open Copilot <ArrowRightIcon className="ml-2 size-4" />
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <div className="mt-28 grid border-y border-border/70 lg:grid-cols-3">
                            {metrics.map((metric, index) => (
                                <div key={metric.label} className={index === 0 ? "py-7 lg:pr-10" : "border-t border-border/70 py-7 lg:border-l lg:border-t-0 lg:px-10"}>
                                    <p className="font-sans text-[52px] font-light leading-none tracking-[-0.04em] text-foreground">{metric.value}</p>
                                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-b border-border/70 py-28 sm:py-36 lg:py-44">
                    <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
                        <div className="grid gap-10 lg:grid-cols-[0.42fr_0.58fr] lg:gap-24">
                            <div>
                                <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">[ SYSTEM ARCHITECTURE ]</p>
                                <h2 className="mt-6 max-w-[520px] font-sans text-[42px] font-light leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[58px]">
                                    Research lab, console, and execution policy in one loop.
                                </h2>
                            </div>
                            <p className="max-w-[700px] font-sans text-[18px] leading-[1.65] text-foreground/75 lg:pt-12">
                                The system separates ingestion, model evaluation, and execution review so every layer can be audited without collapsing operational context into a single opaque signal.
                            </p>
                        </div>

                        <div className="mt-24 grid border border-border/70 md:grid-cols-2 lg:grid-cols-3">
                            {architectureBlocks.map((block, index) => {
                                const Icon = block.icon;
                                return (
                                    <article
                                        key={block.title}
                                        className={[
                                            "group min-h-[320px] bg-background p-7 transition-colors hover:bg-card/30 sm:p-9",
                                            index >= 1 ? "border-t border-border/70 md:border-t-0 md:border-l" : "",
                                            index === 2 ? "lg:border-l" : "",
                                            index >= 3 ? "lg:border-t" : "",
                                            index === 3 ? "md:border-l-0 lg:border-l-0" : "",
                                            index === 4 ? "md:border-l" : "",
                                            index === 5 ? "md:border-l lg:border-l" : "",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-start justify-between gap-6">
                                            <Icon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
                                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">{block.label}</span>
                                        </div>
                                        <h3 className="mt-20 font-sans text-[28px] font-light leading-[1.1] tracking-[-0.02em] text-foreground">{block.title}</h3>
                                        <p className="mt-5 font-sans text-[15px] leading-[1.65] text-muted-foreground">{block.body}</p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section className="relative overflow-hidden py-28 sm:py-36 lg:py-44">
                    <div
                        className="absolute inset-x-0 bottom-[-28%] h-[420px] blur-3xl"
                        style={{
                            background: "radial-gradient(ellipse at bottom, color-mix(in oklch, var(--chart-1) 34%, transparent) 0%, color-mix(in oklch, var(--chart-1) 10%, transparent) 34%, transparent 72%)",
                        }}
                        aria-hidden="true"
                    />
                    <div className="relative mx-auto max-w-[1280px] px-5 text-center sm:px-8">
                        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">[ DEPLOYMENT SURFACES ]</p>
                        <h2 className="mx-auto mt-6 max-w-[900px] font-sans text-[42px] font-light leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[64px]">
                            Move from overview into live decision surfaces.
                        </h2>
                        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link
                                to="/research"
                                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-transparent px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70"
                            >
                                Inspect Model Traces
                            </Link>
                            <Link
                                to="/trading"
                                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-85"
                            >
                                Open Terminal
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="relative border-t border-border/70 py-14">
                <div className="mx-auto grid max-w-[1280px] gap-10 px-5 sm:px-8 md:grid-cols-[1fr_auto] md:items-start">
                    <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">AGOS Infrastructure</p>
                        <p className="mt-3 max-w-[420px] font-sans text-[14px] leading-[1.6] text-muted-foreground">
                            Agentic graph observation for inspectable market reasoning and execution review.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-12 gap-y-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:grid-cols-4">
                        <Link to="/research" className="transition-colors hover:text-foreground">Research</Link>
                        <Link to="/portfolio" className="transition-colors hover:text-foreground">Portfolio</Link>
                        <Link to="/trading" className="transition-colors hover:text-foreground">Trading</Link>
                        <Link to="/agent" className="transition-colors hover:text-foreground">Agent</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};
