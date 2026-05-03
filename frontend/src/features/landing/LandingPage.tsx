import {
    ArrowRightIcon,
    ChartBarIcon,
    CircleStackIcon,
    CommandLineIcon,
    ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const navLinks = [
    { to: "/research", label: "Research" },
    { to: "/portfolio", label: "Portfolio" },
    { to: "/trading", label: "Trading" },
    { to: "/agent", label: "Agent" },
];

const operatingModel = [
    { step: "01", label: "Research", detail: "Market context and source evidence" },
    { step: "02", label: "Forecast", detail: "Model output, target window, confidence" },
    { step: "03", label: "Policy Gate", detail: "Risk, cash, and position constraints" },
    { step: "04", label: "Execution Review", detail: "Human approval before order intent" },
    { step: "05", label: "Audit", detail: "Trace, reasoning, and final decision log" },
];

const productSurfaces = [
    {
        icon: ChartBarIcon,
        title: "Research",
        body: "Company fundamentals, filings, market context, forecasts, and signal reasoning.",
    },
    {
        icon: CircleStackIcon,
        title: "Portfolio",
        body: "Holdings, cash, exposure, concentration, and performance drift.",
    },
    {
        icon: ShieldCheckIcon,
        title: "Trading",
        body: "Ticker evaluation, model confidence, safety gates, and manual override.",
    },
    {
        icon: CommandLineIcon,
        title: "Agent",
        body: "Tool-using workflows with source traces, run history, and audit logs.",
    },
];

const systemLoop = [
    { step: "01", label: "Ingest", detail: "Market data, news, macro context, and portfolio state." },
    { step: "02", label: "Forecast", detail: "Target ranges, probability windows, and model confidence." },
    { step: "03", label: "Reason", detail: "Narrative explanation with source and tool trace." },
    { step: "04", label: "Constrain", detail: "Policy, risk, cash, and position guardrails." },
    { step: "05", label: "Review", detail: "Sandboxed trade intent before execution." },
    { step: "06", label: "Audit", detail: "Evidence log, final decision, and operator context." },
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

export const LandingPage = () => {
    return (
        <div className="min-h-dvh bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
            <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
                <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between px-6 sm:px-8">
                    <div className="flex items-center gap-10">
                        <Link to="/" className="font-mono text-[14px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-muted-foreground">
                            AGOS
                        </Link>

                        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
                            {navLinks.map((item) => (
                                <Link key={item.label} to={item.to} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground">
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link
                            to="/login"
                            className="rounded-full border border-border/50 bg-transparent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/70"
                        >
                            Open terminal
                        </Link>
                    </div>
                </div>
            </header>

            <main>
                {/* HERO SECTION */}
                <section className="relative isolate border-b border-border/50 overflow-hidden">
                    <LightMask />

                    <div className="mx-auto flex min-h-[calc(100svh-76px)] max-w-[1200px] flex-col justify-center px-6 py-20 sm:px-8 lg:py-32">
                        <div className="max-w-[960px]">
                            <h1 className="font-sans text-[clamp(3.5rem,7vw,5.5rem)] font-light leading-[1.05] tracking-[-0.04em] text-foreground">
                                Market decisions with visible reasoning.
                            </h1>
                            <p className="mt-8 max-w-[680px] font-sans text-[18px] leading-[1.65] text-foreground/80 sm:text-[20px]">
                                A controlled workspace for market research, portfolio review, policy-gated trading decisions, and audit-ready agent runs.
                            </p>

                            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
                                <Link
                                    to="/login"
                                    className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
                                >
                                    Open terminal <ArrowRightIcon className="ml-2 size-4" />
                                </Link>
                                <a
                                    href="#workflow"
                                    className="inline-flex h-12 items-center justify-center rounded-full border border-transparent bg-transparent px-7 font-mono text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary/50"
                                >
                                    View workflow
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* OPERATING MODEL SECTION */}
                <section id="workflow" className="border-b border-border/50 py-24 sm:py-32">
                    <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Decision Control</p>
                                <h2 className="max-w-[600px] font-sans text-[36px] font-light leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[48px]">
                                    Evidence before execution.
                                </h2>
                            </div>
                            <p className="max-w-[480px] font-sans text-[16px] leading-[1.65] text-foreground/70 lg:pt-8">
                                Every recommendation carries source context, model output, policy constraints, and execution evidence before it reaches a trade decision.
                            </p>
                        </div>

                        <div className="mt-20 flex flex-col gap-8 md:flex-row md:items-start md:gap-4">
                            {operatingModel.map((item, index) => (
                                <div key={item.step} className="flex flex-1 flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/50">{item.step}</span>
                                        <span className="font-sans text-[18px] text-foreground">{item.label}</span>
                                        {index < operatingModel.length - 1 && (
                                            <span className="ml-auto hidden font-mono text-[14px] text-muted-foreground/30 md:block">→</span>
                                        )}
                                    </div>
                                    <p className="font-sans text-[14px] leading-[1.5] text-muted-foreground/80 md:pr-4">
                                        {item.detail}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* AUDIT PROOF SECTION */}
                <section className="border-b border-border/50 py-24 sm:py-32">
                    <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
                        <div className="mx-auto max-w-[600px] rounded-lg border border-border/50 bg-secondary/10 p-8 font-mono text-[12px] uppercase tracking-[0.12em] text-muted-foreground/80">
                            <div className="mb-8 border-b border-border/50 pb-4 text-foreground">
                                Audit Log
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <span>01 Historical Data</span>
                                    <span className="text-foreground">Done</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>02 Portfolio State</span>
                                    <span className="text-foreground">Done</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>03 AI Signal</span>
                                    <span className="text-foreground">Done</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>04 Rule Gate</span>
                                    <span className="text-chart-2">Approved</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
                                    <span>05 Final Decision</span>
                                    <span className="text-foreground font-medium">HOLD</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* PRODUCT SURFACES SECTION */}
                <section className="border-b border-border/50 py-24 sm:py-32 bg-secondary/10">
                    <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
                        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground mb-16">[ Product Surfaces ]</p>

                        <div className="grid gap-12 sm:grid-cols-2 lg:gap-x-24 lg:gap-y-16">
                            {productSurfaces.map((surface) => {
                                const Icon = surface.icon;
                                return (
                                    <article key={surface.title} className="flex flex-col border-t border-border/50 pt-8">
                                        <Icon className="mb-6 size-6 text-foreground" />
                                        <h3 className="font-sans text-[24px] font-light leading-[1.1] tracking-[-0.02em] text-foreground">
                                            {surface.title}
                                        </h3>
                                        <p className="mt-4 font-sans text-[16px] leading-[1.6] text-muted-foreground">
                                            {surface.body}
                                        </p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* SYSTEM LOOP SECTION */}
                <section className="border-b border-border/50 py-24 sm:py-32">
                    <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
                        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground mb-16">[ Agent Workflow ]</p>

                        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                            {systemLoop.map((item) => (
                                <div key={item.step} className="flex flex-col border-l border-border/50 pl-6">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">{item.step}</span>
                                    <p className="mt-4 font-sans text-[22px] font-light leading-none tracking-[-0.02em] text-foreground">{item.label}</p>
                                    <p className="mt-3 font-sans text-[15px] leading-[1.5] text-muted-foreground/80">{item.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA SECTION */}
                <section className="py-32 sm:py-48 text-center">
                    <div className="mx-auto max-w-[800px] px-6 sm:px-8">
                        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground mb-6">[ Execution Review ]</p>
                        <h2 className="font-sans text-[36px] font-light leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[52px]">
                            Move from automation to reviewable intelligence.
                        </h2>
                        <p className="mx-auto mt-6 max-w-[600px] font-sans text-[18px] leading-[1.65] text-muted-foreground">
                            Inspect the evidence behind every recommendation before it becomes an action.
                        </p>

                        <div className="mt-12 flex justify-center">
                            <Link
                                to="/login"
                                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                Open terminal
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-border/50 py-16">
                <div className="mx-auto grid max-w-[1200px] gap-12 px-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">AGOS</p>
                        <p className="mt-4 max-w-[320px] font-sans text-[14px] leading-[1.6] text-muted-foreground">
                            Market intelligence terminal for operators who need forecasts, reasoning, policy checks, and execution review in one workspace.
                        </p>
                    </div>

                    <div className="grid gap-12 sm:grid-cols-2">
                        {footerGroups.map((group) => (
                            <div key={group.title}>
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">{group.title}</p>
                                <div className="mt-6 flex flex-col gap-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
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

const LightMask = () => {
    return (
        <motion.div
            key="overview"
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
            aria-hidden="true"
        >
            <div
                className="absolute -inset-y-[25%] -right-24 flex w-[100vw] flex-col blur-3xl transform-none opacity-100 md:-right-6 md:w-[1200px]"
                style={{
                    maskImage: "linear-gradient(to right, transparent, white)",
                    WebkitMaskImage: "linear-gradient(to right, transparent, white)",
                }}
            >
                <div
                    className="grow"
                    style={{
                        background:
                            "conic-gradient(from 180deg at 99.78% 35% in lab, color-mix(in oklch, var(--foreground) 90%, transparent) 18deg, color-mix(in oklch, var(--chart-3) 80%, transparent) 36deg, color-mix(in oklch, var(--chart-3) 40%, transparent) 72deg, transparent 90deg, transparent 342deg, color-mix(in oklch, var(--foreground) 90%, transparent) 360deg)",
                    }}
                />

                <div
                    className="grow"
                    style={{
                        background:
                            "conic-gradient(at 99.78% 65% in lab, color-mix(in oklch, var(--foreground) 90%, transparent) 0deg, transparent 18deg, transparent 270deg, color-mix(in oklch, var(--chart-3) 40%, transparent) 288deg, color-mix(in oklch, var(--chart-3) 80%, transparent) 324deg, color-mix(in oklch, var(--foreground) 90%, transparent) 342deg)",
                    }}
                />

                <canvas
                    className="absolute inset-0 h-full w-full"
                    width="430"
                    height="1395"
                />
            </div>
        </motion.div>
    );
};
