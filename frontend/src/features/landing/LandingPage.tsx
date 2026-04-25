import {
    ArrowRightIcon,
    ShieldCheckIcon,
    ChartBarIcon,
    CommandLineIcon,
    ServerIcon,
    CircleStackIcon
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import homeHeroImage from "@/assets/home_hero.jpeg";

const architectureBlocks = [
    {
        icon: ShieldCheckIcon,
        title: "SECURITY",
        body: "Stateless authentication and key-based worker identity ensure privileged actions remain isolated from public surfaces.",
    },
    {
        icon: CircleStackIcon,
        title: "INGESTION",
        body: "Distributed collectors synchronize macro releases and market history into high-throughput storage on fixed intervals.",
    },
    {
        icon: CommandLineIcon,
        title: "AGENTIC",
        body: "LangChain orchestration converts unstructured narratives into executable sentiment and transparent decision traces.",
    },
    {
        icon: ChartBarIcon,
        title: "QUANTITATIVE",
        body: "Chronos-based forecasting evaluates short-horizon probabilities directly from local market microstructure.",
    },
    {
        icon: ServerIcon,
        title: "AGGREGATION",
        body: "Sentiment and time-series outputs are finalized into executable trade signals within the core engine.",
    },
    {
        icon: ArrowRightIcon,
        title: "AUDIT",
        body: "Execution stays in a sandbox while every model step, policy check, and signal remains visible and explainable.",
    },
];

const navLinks = [
    { to: "/research", label: "RESEARCH" },
    { to: "/portfolio", label: "PORTFOLIO" },
    { to: "/trading", label: "TRADING" },
];

export const LandingPage = () => {
    const architectureSectionRef = useRef<HTMLElement | null>(null);
    const [isArchitectureSectionVisible, setIsArchitectureSectionVisible] = useState(false);

    useEffect(() => {
        const section = architectureSectionRef.current;

        if (!section) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsArchitectureSectionVisible(entry.isIntersecting);
            },
            {
                threshold: 0,
            },
        );

        observer.observe(section);

        return () => {
            observer.disconnect();
        };
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-white selection:text-background">
            {/* Header */}
            <header
                className={[
                    "sticky top-0 z-50 border-b transition-[background-color,backdrop-filter] duration-300",
                    isArchitectureSectionVisible
                        ? "border-white/1 bg-background"
                        : "border-white/1 bg-background/1 backdrop-blur-md",
                ].join(" ")}
            >
                <div className="max-w-[1400px] mx-auto flex items-center justify-between px-8 py-6">
                    <div className="flex items-center gap-12">
                        <Link to="/" className="font-mono text-[14px] uppercase tracking-[1.4px] text-white">
                            AGOS
                        </Link>

                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map((item) => (
                                <Link
                                    key={item.label}
                                    to={item.to}
                                    className="font-sans text-[14px] text-white transition-opacity hover:opacity-50"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link
                            to="/login"
                            className="hidden sm:block font-mono text-[12px] uppercase tracking-[1.4px] border border-white/20 px-4 py-2 hover:bg-white hover:text-background transition-colors"
                        >
                            ACCESS TERMINAL
                        </Link>
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                            <span className="size-1.5 bg-white/70 animate-pulse" />
                            LIVE_OPS
                        </div>
                    </div>
                </div>
            </header>

            <main>
                {/* Hero Section */}
                <section className="relative overflow-hidden pt-28 -top-18 pb-56 border-b border-white/10">
                    <div className="absolute inset-0">
                        <img
                            src={homeHeroImage}
                            alt="Night skyline"
                            fetchPriority="high"
                            loading="eager"
                            decoding="async"
                            className="h-full w-full object-cover object-[center_42%] opacity-68"
                        />
                        <div className="absolute inset-0 bg-black/50" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(9,11,15,0.14)_0%,rgba(9,11,15,0.22)_22%,rgba(9,11,15,0.42)_48%,rgba(9,11,15,0.62)_72%,rgba(9,11,15,0.78)_100%)]" />
                        <div
                            className="absolute left-1/2 top-[12%] h-[66%] w-[min(78vw,1040px)] -translate-x-1/2 rounded-full bg-white/[0.03] backdrop-blur-[9px]"
                            style={{
                                WebkitMaskImage: "radial-gradient(ellipse at center, black 0%, black 38%, transparent 72%)",
                                maskImage: "radial-gradient(ellipse at center, black 0%, black 38%, transparent 72%)",
                            }}
                        />
                    </div>

                    <div className="relative max-w-[1400px] mx-auto px-8 text-center">
                        <div className="flex justify-center mb-12">
                            <Badge variant="outline" className="rounded-none border-white/20 text-white/50 font-mono py-1 px-3 uppercase tracking-[1px] text-[10px]">
                                AGENTIC GRAPH OBSERVATION SYSTEM — V1.0.0
                            </Badge>
                        </div>

                        <h1 className="display-hero mb-12 select-none">
                            AGOS
                        </h1>

                        <p className="max-w-[900px] mx-auto font-sans text-[24px] md:text-[32px] lg:text-[42px] leading-[1.1] text-white mb-16 tracking-tight">
                            A next-generation automated trading framework combining LLM reasoning, neural forecasting, and quantitative logic.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/research"
                                className="w-full sm:w-auto bg-white text-background font-mono text-[14px] uppercase tracking-[1.4px] px-12 py-4 transition-opacity hover:opacity-90"
                            >
                                TRY AGOS
                            </Link>
                            <Link
                                to="/portfolio"
                                className="w-full sm:w-auto border border-white/20 text-white font-mono text-[14px] uppercase tracking-[1.4px] px-12 py-4 transition-all hover:bg-white/5"
                            >
                                VIEW PORTFOLIO
                            </Link>
                        </div>
                    </div>

                    {/* Decorative lines */}
                    <div className="absolute top-0 left-1/4 w-px h-full bg-white/5" />
                    <div className="absolute top-0 right-1/4 w-px h-full bg-white/5" />
                </section>

                {/* Architecture Section */}
                <section ref={architectureSectionRef} className="py-32 border-b border-white/10">
                    <div className="max-w-[1400px] mx-auto px-8">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-24">
                            <div className="lg:col-span-5">
                                <h2 className="font-sans text-[48px] leading-[1] text-white mb-8">
                                    SYSTEM<br />ARCHITECTURE
                                </h2>
                            </div>
                            <div className="lg:col-span-7">
                                <p className="font-sans text-[20px] text-white/60 leading-relaxed max-w-[600px]">
                                    The system decouples ingestion, reasoning, and execution so each layer remains independently verifiable and audited in real-time.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
                            {architectureBlocks.map((block) => {
                                const Icon = block.icon;
                                return (
                                    <article
                                        key={block.title}
                                        className="bg-background p-10 group hover:bg-white/[0.02] transition-colors"
                                    >
                                        <div className="size-12 border border-white/20 flex items-center justify-center mb-8">
                                            <Icon className="size-5 text-white/40 group-hover:text-white transition-colors" />
                                        </div>
                                        <h3 className="font-mono text-[12px] uppercase tracking-[2px] text-white/60 mb-4 group-hover:text-white transition-colors">
                                            {block.title}
                                        </h3>
                                        <p className="font-sans text-[16px] leading-[1.6] text-white/60">
                                            {block.body}
                                        </p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="py-48 bg-background">
                    <div className="max-w-[1400px] mx-auto px-8 text-center">
                        <h2 className="font-sans text-[32px] md:text-[54px] leading-[1] text-white mb-16 max-w-[800px] mx-auto">
                            MOVE FROM OVERVIEW INTO LIVE DECISION SURFACES.
                        </h2>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                            <Link
                                to="/research"
                                className="font-mono text-[14px] uppercase tracking-[1.4px] text-white border-b border-white/40 pb-1 hover:border-white transition-colors"
                            >
                                INSPECT MODEL TRACES
                            </Link>
                            <span className="hidden sm:inline text-white/20 font-mono">—</span>
                            <Link
                                to="/trading"
                                className="font-mono text-[14px] uppercase tracking-[1.4px] text-white border-b border-white/40 pb-1 hover:border-white transition-colors"
                            >
                                OPEN TERMINAL
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-white/10 py-12">
                <div className="max-w-[1400px] mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="font-mono text-[12px] text-white/55 uppercase tracking-[1.4px]">
                        © 2026 AGOS INFRASTRUCTURE
                    </div>
                    <div className="flex gap-8">
                        <a href="#" className="font-sans text-[12px] text-white/55 hover:text-white transition-colors">API_DOCS</a>
                        <a href="#" className="font-sans text-[12px] text-white/55 hover:text-white transition-colors">SYSTEM_STATUS</a>
                        <a href="#" className="font-sans text-[12px] text-white/55 hover:text-white transition-colors">AUDIT_LOGS</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};
