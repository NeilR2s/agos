import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
    BriefcaseIcon,
    CommandLineIcon,
    ChatBubbleLeftRightIcon,
    HomeIcon,
    MagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";

import { backendClient, getUserId } from "@/api/backend/client";
import { engineClient } from "@/api/engine/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { TerminalSkeleton } from "@/components/ui/terminal-skeleton";
import { cn } from "@/lib/utils";
import { normalizeEngineHealth } from "@/data/normalizeEngine";
import { normalizePortfolio } from "@/data/normalizePortfolio";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/store/authStore";

type SidebarProps = {
    onOpenPalette: () => void;
    onNavigate?: () => void;
    showLabels?: boolean;
    className?: string;
};

const navItems = [
    { to: "/", label: "Landing", icon: HomeIcon, aliases: ["/index"] },
    { to: "/research", label: "Research", icon: MagnifyingGlassIcon, aliases: ["/market"] },
    { to: "/portfolio", label: "Portfolio", icon: BriefcaseIcon, aliases: ["/dashboard"] },
    { to: "/trading", label: "Trading", icon: CommandLineIcon, aliases: [] },
    { to: "/agent", label: "Agent", icon: ChatBubbleLeftRightIcon, aliases: [] },
];

const compactRevealClass =
    "max-w-0 overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity] duration-200 group-hover/sidebar:delay-200 group-hover/sidebar:max-w-full group-hover/sidebar:opacity-100";

export function Sidebar({ onOpenPalette, onNavigate, showLabels = false, className }: SidebarProps) {
    const location = useLocation();
    const userId = getUserId();
    const logout = useAuthStore((state) => state.logout);

    const portfolioQuery = useQuery({
        queryKey: ["sidebar-portfolio", userId],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/portfolio/{user_id}", {
                params: { path: { user_id: userId } },
            });

            if (error) throw error;
            return normalizePortfolio(data);
        },
        refetchInterval: 10000,
    });

    const healthQuery = useQuery({
        queryKey: ["sidebar-engine-health"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/health", {});
            if (error) throw error;
            return normalizeEngineHealth(data);
        },
        refetchInterval: 30000,
    });

    const versionQuery = useQuery({
        queryKey: ["sidebar-engine-version"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/version", {});
            if (error) throw error;
            return data as Record<string, unknown>;
        },
        refetchInterval: 30000,
    });

    const holdings = useMemo(() => portfolioQuery.data?.holdings.slice(0, 6) ?? [], [portfolioQuery.data]);

    const health = healthQuery.data ?? { status: "CHECKING", version: "---", model: "---" };
    const status = healthQuery.isError ? "OFFLINE" : health.status.toUpperCase();
    const version = health.version !== "---"
        ? health.version
        : typeof versionQuery.data?.version === "string"
            ? versionQuery.data.version
            : "---";

    return (
        <div className={cn("flex h-full w-full flex-col justify-between gap-6 overflow-hidden bg-background px-2 py-4 text-foreground", showLabels && "px-4", className)}>
            <div className={cn("space-y-6", !showLabels && "space-y-5")}>
                <div className={cn("relative flex items-center", showLabels ? "justify-between gap-3" : "justify-center")}>
                    <Link
                        to="/"
                        onClick={() => onNavigate?.()}
                        aria-label="AGOS home"
                        className={cn(
                            "block font-mono text-[14px] uppercase tracking-[1.4px] text-white transition-colors hover:text-white/50",
                            showLabels ? "flex-none" : "flex-1 text-center group-hover/sidebar:flex-none group-hover/sidebar:text-left"
                        )}
                    >
                        <span className="inline-block whitespace-nowrap">AGOS</span>
                    </Link>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={onOpenPalette}
                        className={cn(
                            "text-white/40 hover:text-white",
                            showLabels
                                ? "flex-none"
                                : "pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover/sidebar:static group-hover/sidebar:pointer-events-auto group-hover/sidebar:delay-200 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-y-0"
                        )}
                        aria-label="Open command palette"
                    >
                        <CommandLineIcon className="size-4" />
                    </Button>
                </div>

                <div className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30", showLabels ? "px-2 opacity-100" : "max-w-0 overflow-hidden px-0 opacity-0 transition-[max-width,opacity,padding] duration-200 group-hover/sidebar:delay-200 group-hover/sidebar:max-w-full group-hover/sidebar:px-2 group-hover/sidebar:opacity-100")}>
                    <Kbd>Ctrl</Kbd>
                    <Kbd>Shift</Kbd>
                    <Kbd>P</Kbd>
                    <span>Palette</span>
                </div>

                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.to === "/"
                            ? location.pathname === "/"
                            : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`) || item.aliases.includes(location.pathname);

                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                onClick={() => onNavigate?.()}
                                aria-label={item.label}
                                title={item.label}
                                className={cn(
                                    "flex w-full items-center py-2 font-mono text-[12px] uppercase tracking-[1.4px] transition-colors",
                                    showLabels ? "justify-start gap-3 px-2" : "justify-center gap-0 px-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-2",
                                    isActive ? "text-white" : "text-white/50 hover:text-white"
                                )}
                            >
                                <Icon className="size-4 shrink-0" />
                                <span
                                    className={cn(
                                        "min-w-0 whitespace-nowrap transition-[max-width,opacity] duration-200",
                                        showLabels ? "max-w-full opacity-100" : compactRevealClass
                                    )}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : compactRevealClass)}>Holdings</span>
                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{holdings.length}</span>
                    </div>

                    <div className="space-y-1">
                        {portfolioQuery.isLoading ? (
                            <TerminalSkeleton lines={3} label="SYNCING" compact={!showLabels} />
                        ) : holdings.length ? (
                            holdings.map((holding) => (
                                <Link
                                    key={holding.id}
                                    to={`/research?ticker=${holding.ticker}`}
                                    onClick={() => onNavigate?.()}
                                    className="group flex items-center justify-between gap-3 px-2 py-2 text-white/50 transition-colors hover:text-white"
                                    title={holding.ticker}
                                >
                                    <span className="font-mono text-[12px] uppercase tracking-[1.4px] text-white">{holding.ticker}</span>
                                    <span
                                        className={cn(
                                            "min-w-0 truncate font-sans text-[12px] text-white/30 transition-[max-width,opacity] duration-200",
                                            showLabels ? "max-w-full opacity-100" : compactRevealClass
                                        )}
                                    >
                                        {formatCurrency(holding.marketValue)}
                                    </span>
                                </Link>
                            ))
                        ) : (
                            <p className={cn("px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/20 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : compactRevealClass)}>No positions</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : compactRevealClass)}>Engine</span>
                    <Badge variant="outline" className={cn("border-border text-white/70 transition-[max-width,opacity,padding] duration-200", showLabels ? "opacity-100" : "max-w-0 overflow-hidden border-transparent px-0 opacity-0 group-hover/sidebar:delay-200 group-hover/sidebar:max-w-full group-hover/sidebar:border-border group-hover/sidebar:px-[8px] group-hover/sidebar:opacity-100")}>
                        {status}
                    </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                    <span>v{version}</span>
                    <button onClick={logout} className={cn("text-white/50 hover:text-white transition-colors flex items-center gap-1", showLabels ? "opacity-100" : compactRevealClass)}>
                        LOGOUT <ArrowLeftOnRectangleIcon className="size-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
