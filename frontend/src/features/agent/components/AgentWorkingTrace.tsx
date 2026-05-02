import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildAgentTraceBuckets, describeEvent } from "@/features/agent/lib/traces";
import type { AgentSSEEvent } from "@/features/agent/types";

type AgentWorkingTraceProps = {
    events: AgentSSEEvent[];
    isStreaming: boolean;
    selectedAgentId: string | null;
    onSelectAgent: (agentId: string) => void;
};

export function AgentWorkingTrace({ events, isStreaming, selectedAgentId, onSelectAgent }: AgentWorkingTraceProps) {
    const [expanded, setExpanded] = useState(false);
    const buckets = useMemo(() => buildAgentTraceBuckets(events), [events]);
    const workerBuckets = useMemo(
        () => buckets.filter((bucket) => bucket.role !== "runtime" && bucket.role !== "synthesizer"),
        [buckets]
    );

    if (!buckets.length) {
        return null;
    }

    const countBuckets = workerBuckets.length ? workerBuckets : buckets;
    const activeCount = countBuckets.filter((bucket) => bucket.status === "running").length;
    const completedCount = countBuckets.filter((bucket) => bucket.status === "completed").length;
    const errorCount = countBuckets.filter((bucket) => bucket.status === "error").length;
    const resolvedCount = completedCount + errorCount;
    const toolTotal = buckets.reduce((sum, bucket) => sum + bucket.toolCount, 0);
    const sourceTotal = buckets.reduce((sum, bucket) => sum + bucket.citationCount, 0);
    const workerProgress = countBuckets.map((bucket) => getBucketProgress(bucket));
    const duration = formatTraceDuration(events, isStreaming);
    const title = isStreaming ? "Agents Working" : errorCount ? "Completed With Errors" : "Run Complete";

    return (
        <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/35 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] backdrop-blur-xl">
            <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="w-full bg-gradient-to-b from-foreground/[0.025] to-transparent px-4 py-3.5 text-left transition-colors hover:bg-accent/25 md:px-5"
            >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <span
                                className={cn(
                                    "size-2 rounded-full",
                                    isStreaming && "bg-chart-1 shadow-[0_0_18px_color-mix(in_oklch,var(--chart-1)_36%,transparent)]",
                                    errorCount && "bg-destructive shadow-[0_0_18px_color-mix(in_oklch,var(--destructive)_32%,transparent)]",
                                    !isStreaming && !errorCount && "bg-chart-2 shadow-[0_0_18px_color-mix(in_oklch,var(--chart-2)_34%,transparent)]"
                                )}
                            />
                            <p className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
                            <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                                <span>AGOS</span>
                                <span>/</span>
                                <span>{countBuckets.length} agents</span>
                                {duration ? <><span>/</span><span>{duration}</span></> : null}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.35px] text-muted-foreground/75">
                            <span className="rounded-full border border-border/50 bg-secondary/20 px-2 py-0.5">{isStreaming ? `${activeCount || countBuckets.length} live` : `${completedCount} complete`}</span>
                            <span className="rounded-full border border-border/50 bg-secondary/20 px-2 py-0.5">{errorCount} errors</span>
                            <span className="rounded-full border border-border/50 bg-secondary/20 px-2 py-0.5">{toolTotal} tools</span>
                            <span className="rounded-full border border-border/50 bg-secondary/20 px-2 py-0.5">{sourceTotal} sources</span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 self-end md:self-auto">
                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                            {resolvedCount}/{countBuckets.length} done
                        </span>
                        {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    </div>
                </div>

                <div className="mt-3 space-y-2.5">
                    <div className="space-y-2">
                        {workerProgress.slice(0, 4).map((item, index) => (
                            <AgentProgressRow key={item.bucket.agentId} item={item} index={index} />
                        ))}
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/65">
                        {isStreaming ? "Live operations trace" : "Completed operations trace"} / expand for worker detail
                    </p>
                </div>
            </button>

            {expanded ? (
                <div className="divide-y divide-border/55 border-t border-border/70 bg-background/10">
                    {buckets.map((bucket, index) => {
                        const latest = bucket.events[bucket.events.length - 1];
                        const isSelected = bucket.agentId === selectedAgentId;
                        const highlights = bucket.events
                            .filter((event) => event.type !== "message.delta")
                            .slice(-2)
                            .map((event) => describeEvent(event));
                        const bucketProgress = getBucketProgress(bucket);

                        return (
                            <button
                                key={bucket.agentId}
                                type="button"
                                onClick={() => onSelectAgent(bucket.agentId)}
                                className={cn(
                                    "grid w-full gap-3 px-4 py-3 text-left transition-colors md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-start md:px-5",
                                    getBucketRowTone(bucket.status, isSelected)
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-[11px] uppercase tracking-[1.4px] text-foreground/90">Agent {String(index + 1).padStart(2, "0")}</p>
                                    <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{bucket.role.replace(/-/g, " ")}</p>
                                </div>
                                <div className="min-w-0 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <DotMatrixProgress progress={bucketProgress.value} compact tone={bucket.status === "error" ? "error" : bucket.status === "completed" ? "complete" : "active"} />
                                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground/75">{bucketProgress.stage}</span>
                                    </div>
                                    <p className="line-clamp-2 font-sans text-[13px] leading-[1.55] text-foreground/80">
                                        {bucket.summary ?? (latest ? describeEvent(latest) : "Awaiting trace output.")}
                                    </p>
                                    {highlights.length ? (
                                        <div className="space-y-1 border-l border-border/70 pl-3">
                                            {highlights.map((highlight, index) => (
                                                <p key={`${bucket.agentId}-${index}`} className="line-clamp-1 font-sans text-[12px] leading-[1.45] text-muted-foreground">
                                                    {highlight}
                                                </p>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground md:justify-end">
                                    <span className={cn("rounded-full border px-2 py-0.5", getStatusBadgeTone(bucket.status))}>{bucket.status}</span>
                                    <span>{Math.round(bucketProgress.value)}%</span>
                                    <span>{bucket.toolCount} tools</span>
                                    <span>{bucket.citationCount} sources</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function getBucketRowTone(status: "idle" | "running" | "completed" | "error", isSelected: boolean) {
    if (status === "error") {
        return isSelected
            ? "bg-destructive/[0.07]"
            : "hover:bg-destructive/[0.045]";
    }

    if (status === "running") {
        return isSelected
            ? "bg-chart-1/[0.045]"
            : "hover:bg-chart-1/[0.03]";
    }

    if (status === "completed") {
        return isSelected
            ? "bg-chart-2/[0.04]"
            : "hover:bg-chart-2/[0.025]";
    }

    return isSelected ? "bg-accent/35" : "hover:bg-accent/25";
}

function getStatusBadgeTone(status: "idle" | "running" | "completed" | "error") {
    switch (status) {
        case "error":
            return "border-destructive/40 bg-destructive/10 text-destructive";
        case "running":
            return "border-chart-1/35 bg-chart-1/[0.06] text-chart-1";
        case "completed":
            return "border-chart-2/35 bg-chart-2/[0.06] text-chart-2";
        default:
            return "border-border/60 bg-secondary/20 text-muted-foreground";
    }
}

function DotMatrixProgress({ progress, tone, compact = false }: { progress: number; tone: "active" | "complete" | "error"; compact?: boolean }) {
    const color = tone === "error" ? "var(--destructive)" : tone === "complete" ? "var(--chart-2)" : "var(--chart-1)";
    const basePattern = "radial-gradient(circle, color-mix(in oklch, var(--foreground) 13%, transparent) 0 1px, transparent 1.75px)";
    const activePattern = `radial-gradient(circle, color-mix(in oklch, ${color} 62%, transparent) 0 1px, transparent 1.75px)`;

    return (
        <div className={cn("relative w-full overflow-hidden rounded-sm", compact ? "h-[11px]" : "h-[16px]")} aria-hidden="true">
            <div className="absolute inset-0 opacity-75" style={{ backgroundImage: basePattern, backgroundSize: "7px 7px" }} />
            <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}>
                <div className="h-full w-full" style={{ backgroundImage: activePattern, backgroundSize: "7px 7px" }} />
            </div>
        </div>
    );
}

type BucketProgress = {
    bucket: ReturnType<typeof buildAgentTraceBuckets>[number];
    value: number;
    stage: string;
};

function AgentProgressRow({ item, index }: { item: BucketProgress; index: number }) {
    const tone = item.bucket.status === "error" ? "error" : item.bucket.status === "completed" ? "complete" : "active";
    return (
        <div className="grid items-center gap-2 md:grid-cols-[108px_minmax(0,1fr)_118px]">
            <div className="flex min-w-0 items-center justify-between gap-2 md:block">
                <p className="font-mono text-[9px] uppercase tracking-[1.2px] text-foreground/75">Agent {String(index + 1).padStart(2, "0")}</p>
                <p className="truncate font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/65 md:mt-0.5">{item.bucket.role.replace(/-/g, " ")}</p>
            </div>
            <DotMatrixProgress progress={item.value} compact tone={tone} />
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/70 md:justify-end">
                <span>{Math.round(item.value)}%</span>
                <span>{item.stage}</span>
            </div>
        </div>
    );
}

function getBucketProgress(bucket: ReturnType<typeof buildAgentTraceBuckets>[number]): BucketProgress {
    if (bucket.status === "completed" || bucket.status === "error") {
        return { bucket, value: 100, stage: bucket.status === "error" ? "error" : "complete" };
    }

    const pass = bucket.events.reduce((maxPass, event) => {
        const title = typeof event.data.title === "string" ? event.data.title : "";
        const detail = typeof event.data.detail === "string" ? event.data.detail : "";
        const match = `${title} ${detail}`.match(/pass\s+(\d+)/i);
        return match ? Math.max(maxPass, Number(match[1])) : maxPass;
    }, 0);
    const started = bucket.events.some((event) => event.type === "agent.started");
    const toolStartedCount = bucket.events.filter((event) => event.type === "tool.started").length;
    const pendingToolCount = Math.max(0, toolStartedCount - bucket.toolCount);
    const base = pass ? 14 + (Math.min(pass, 6) / 6) * 66 : started ? 14 : 6;
    const toolLift = Math.min(10, bucket.toolCount * 4 + pendingToolCount * 2);
    const sourceLift = Math.min(6, bucket.citationCount * 2);
    const value = Math.min(92, Math.max(started ? 14 : 6, base + toolLift + sourceLift));
    const latest = [...bucket.events].reverse().find((event) => event.type !== "message.delta");

    if (latest?.type === "tool.started") {
        return { bucket, value, stage: "tooling" };
    }

    if (pass) {
        return { bucket, value, stage: `pass ${Math.min(pass, 6)}/6` };
    }

    return { bucket, value, stage: started ? "starting" : "queued" };
}

function formatTraceDuration(events: AgentSSEEvent[], isStreaming: boolean) {
    const startedAt = new Date(events[0]?.timestamp ?? "");
    if (Number.isNaN(startedAt.getTime())) {
        return null;
    }

    const endedAt = isStreaming ? new Date() : new Date(events[events.length - 1]?.timestamp ?? "");
    if (Number.isNaN(endedAt.getTime())) {
        return null;
    }

    const totalSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}
