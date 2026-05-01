import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    BriefcaseIcon,
    CommandLineIcon,
    ChatBubbleLeftRightIcon,
    MagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon,
    PlusIcon,
    GlobeAltIcon,
} from "@heroicons/react/24/outline";

import { agentApi, backendClient } from "@/api/backend/client";
import { engineClient } from "@/api/engine/client";
import { AgentThreadList } from "@/features/agent/components/AgentThreadList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { TerminalSkeleton } from "@/components/ui/terminal-skeleton";
import { cn } from "@/lib/utils";
import { normalizeEngineHealth } from "@/data/normalizeEngine";
import { normalizePortfolio } from "@/data/normalizePortfolio";
import { formatCurrency } from "@/lib/format";
import { getSignedInUserIdentity } from "@/lib/authIdentity";
import { useAuthStore } from "@/store/authStore";

type SidebarProps = {
    onOpenPalette: () => void;
    onNavigate?: () => void;
    onToggleExpanded?: () => void;
    showLabels?: boolean;
    isAgentMode?: boolean;
    className?: string;
};

const navItems = [
    { to: "/research", label: "Research", icon: MagnifyingGlassIcon, aliases: ["/market"] },
    { to: "/portfolio", label: "Portfolio", icon: BriefcaseIcon, aliases: ["/dashboard"] },
    { to: "/trading", label: "Trading", icon: CommandLineIcon, aliases: [] },
    { to: "/map", label: "Map", icon: GlobeAltIcon, aliases: [] },
    { to: "/agent", label: "Agent", icon: ChatBubbleLeftRightIcon, aliases: [] },
];

const hiddenRevealClass = "max-w-0 overflow-hidden whitespace-nowrap px-0 opacity-0";

export function Sidebar({
    onOpenPalette,
    onNavigate,
    onToggleExpanded,
    showLabels = false,
    isAgentMode = false,
    className,
}: SidebarProps) {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const authUser = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const userId = authUser?.uid ?? "";
    const signedInUser = getSignedInUserIdentity(authUser);
    const [threadQuery, setThreadQuery] = useState("");
    const activeThreadId = searchParams.get("thread");
    const currentMode = searchParams.get("mode") ?? "general";
    const currentTicker = searchParams.get("ticker");

    const portfolioQuery = useQuery({
        queryKey: ["portfolio", userId],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/portfolio/{user_id}", {
                params: { path: { user_id: userId } },
            });

            if (error) throw error;
            return normalizePortfolio(data);
        },
        enabled: Boolean(userId),
        refetchInterval: 10000,
        staleTime: 5000,
    });

    const healthQuery = useQuery({
        queryKey: ["engine-health"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/health", {});
            if (error) throw error;
            return normalizeEngineHealth(data);
        },
        refetchInterval: 30000,
        staleTime: 10000,
    });

    const versionQuery = useQuery({
        queryKey: ["engine-version"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/version", {});
            if (error) throw error;
            return data as Record<string, unknown>;
        },
        refetchInterval: 30000,
        staleTime: 10000,
    });

    const threadsQuery = useQuery({
        queryKey: ["agent-threads"],
        queryFn: () => agentApi.listThreads(),
        enabled: isAgentMode,
    });

    const holdings = useMemo(() => portfolioQuery.data?.holdings.slice(0, 6) ?? [], [portfolioQuery.data]);
    const filteredThreads = useMemo(() => {
        const items = threadsQuery.data ?? [];
        const normalized = threadQuery.trim().toUpperCase();
        if (!normalized) {
            return items;
        }

        return items.filter((thread) => {
            const haystack = `${thread.title} ${thread.selectedTicker ?? ""} ${thread.lastAssistantPreview ?? ""}`.toUpperCase();
            return haystack.includes(normalized);
        });
    }, [threadQuery, threadsQuery.data]);

    const health = healthQuery.data ?? { status: "CHECKING", version: "---", model: "---" };
    const status = healthQuery.isError ? "OFFLINE" : health.status.toUpperCase();
    const version = health.version !== "---"
        ? health.version
        : typeof versionQuery.data?.version === "string"
            ? versionQuery.data.version
            : "---";

    const updateAgentSearchParams = (patch: Record<string, string | null>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => {
            if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }
        });
        setSearchParams(next, { replace: true });
    };

    const handleSelectThread = (threadId: string) => {
        const thread = (threadsQuery.data ?? []).find((item) => item.id === threadId);
        updateAgentSearchParams({
            thread: threadId,
            run: null,
            mode: thread?.mode ?? currentMode,
            ticker: thread?.selectedTicker ?? null,
        });
        onNavigate?.();
    };

    const handleNewThread = () => {
        updateAgentSearchParams({ thread: null, run: null, ticker: currentTicker, mode: currentMode });
        onNavigate?.();
    };

    const handleDeleteThread = async (threadId: string) => {
        await agentApi.deleteThread(threadId);
        await queryClient.invalidateQueries({ queryKey: ["agent-threads"] });

        if (threadId === activeThreadId) {
            const remaining = (threadsQuery.data ?? []).filter((thread) => thread.id !== threadId);
            const nextThread = remaining[0] ?? null;
            updateAgentSearchParams({
                thread: nextThread?.id ?? null,
                run: null,
                mode: nextThread?.mode ?? currentMode,
                ticker: nextThread?.selectedTicker ?? currentTicker ?? null,
            });
        }
    };

    return (
        <div className={cn("group/sidebar flex h-full w-full flex-col justify-between gap-6 overflow-hidden bg-background px-2 py-4 text-foreground", showLabels && "px-4", className)}>
            <div className={cn("flex min-h-0 flex-1 flex-col", !showLabels ? "gap-5" : "gap-6")}>
                <div className={cn("relative flex items-center", showLabels ? "justify-between gap-3" : "justify-center")}>
                    <Link
                        to="/"
                        onClick={() => onNavigate?.()}
                        aria-label="AGOS home"
                        className={cn(
                            "block font-mono text-[14px] uppercase tracking-[1.4px] text-white transition-colors hover:text-white/50",
                            showLabels ? "flex-none" : "flex-none text-center group-hover/sidebar:invisible"
                        )}
                    >
                        <span className="inline-block whitespace-nowrap">AGOS</span>
                    </Link>
                    <div
                        className={cn(
                            "flex items-center gap-1",
                            !showLabels && "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/sidebar:pointer-events-auto group-hover/sidebar:opacity-100"
                        )}
                    >
                        {onToggleExpanded ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={onToggleExpanded}
                                className="text-white/40 hover:text-white"
                                aria-label={showLabels ? "Collapse sidebar" : "Expand sidebar"}
                            >
                                {showLabels ? <ChevronDoubleLeftIcon className="size-4" /> : <ChevronDoubleRightIcon className="size-4" />}
                            </Button>
                        ) : null}
                        {showLabels ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={onOpenPalette}
                                className="text-white/40 hover:text-white"
                                aria-label="Open command palette"
                            >
                                <CommandLineIcon className="size-4" />
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div
                    className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 transition-[max-width,opacity,padding] duration-200", showLabels ? "px-2 opacity-100" : hiddenRevealClass)}
                >
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
                                    showLabels ? "justify-start gap-3 px-2" : "justify-center gap-0 px-0",
                                    isActive ? "text-white" : "text-white/50 hover:text-white"
                                )}
                            >
                                <Icon className="size-4 shrink-0" />
                                <span
                                    className={cn(
                                        "min-w-0 whitespace-nowrap transition-[max-width,opacity] duration-200",
                                        showLabels ? "max-w-full opacity-100" : hiddenRevealClass
                                    )}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                {isAgentMode ? (
                    showLabels ? (
                        <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-4">
                            <div className="mb-3 flex items-center justify-between gap-3 px-2">
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">History</p>
                                    <p className="mt-1 font-sans text-[12px] leading-[1.5] text-white/45">Agent threads and saved runs</p>
                                </div>
                                <Button type="button" variant="outline" size="icon-sm" onClick={handleNewThread} className="border-white/15 text-white/75 hover:bg-white/[0.05]">
                                    <PlusIcon className="size-4" />
                                </Button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-hidden">
                                <AgentThreadList
                                    threads={filteredThreads}
                                    activeThreadId={activeThreadId}
                                    query={threadQuery}
                                    onQueryChange={setThreadQuery}
                                    onSelect={handleSelectThread}
                                    onNewThread={handleNewThread}
                                    onDelete={(threadId) => {
                                        void handleDeleteThread(threadId);
                                    }}
                                    isLoading={threadsQuery.isLoading}
                                    variant="sidebar"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="border-t border-border pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleNewThread}
                                className="mx-auto flex text-white/45 hover:text-white"
                                aria-label="Create new agent thread"
                            >
                                <PlusIcon className="size-4" />
                            </Button>
                        </div>
                    )
                ) : (
                    <div className="space-y-3 border-t border-border pt-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : hiddenRevealClass)}>Holdings</span>
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
                                                showLabels ? "max-w-full opacity-100" : hiddenRevealClass
                                            )}
                                        >
                                            {formatCurrency(holding.marketValue)}
                                        </span>
                                    </Link>
                                ))
                            ) : (
                                <p className={cn("px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/20 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : hiddenRevealClass)}>No positions</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
                <div className={cn("space-y-1 transition-[max-width,opacity,padding] duration-200", showLabels ? "opacity-100" : hiddenRevealClass)}>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Signed In</p>
                    <p className="truncate font-sans text-[12px] text-white">{signedInUser.primary}</p>
                    {signedInUser.secondary ? (
                        <p className="truncate font-mono text-[10px] uppercase tracking-[1.2px] text-white/30">{signedInUser.secondary}</p>
                    ) : null}
                </div>

                {!isAgentMode ? (
                    <div className="flex items-center justify-between gap-3">
                        <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 transition-[max-width,opacity] duration-200", showLabels ? "opacity-100" : hiddenRevealClass)}>Engine</span>
                        <Badge variant="outline" className={cn("border-border text-white/70 transition-[max-width,opacity,padding] duration-200", showLabels ? "opacity-100" : "max-w-0 overflow-hidden border-transparent px-0 opacity-0")}>
                            {status}
                        </Badge>
                    </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                    <span>{!isAgentMode ? `v${version}` : "agent console"}</span>
                    <button onClick={logout} className={cn("flex items-center gap-1 text-white/50 transition-colors hover:text-white", showLabels ? "opacity-100" : hiddenRevealClass)}>
                        LOGOUT <ArrowLeftOnRectangleIcon className="size-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
