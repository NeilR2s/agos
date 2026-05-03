import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildAgentTraceBuckets, describeEvent, stripMarkdownArtifacts } from "@/features/agent/lib/traces";
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
                            <p className="font-sans text-[15px] font-medium tracking-[-0.015em] text-foreground">{title}</p>
                            <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">
                                <span>{resolvedCount}/{countBuckets.length} complete</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/65">
                            <span>AGOS</span>
                            <span>·</span>
                            <span>{countBuckets.length} agents</span>
                            {duration ? <><span>·</span><span>{duration}</span></> : null}
                            <span>·</span>
                            <span>{isStreaming ? `${activeCount || countBuckets.length} live` : `${completedCount} complete`}</span>
                            {errorCount ? <><span>·</span><span className="text-destructive/80">{errorCount} errors</span></> : null}
                            <span>·</span>
                            <span>{toolTotal} tools</span>
                            <span>·</span>
                            <span>{sourceTotal} sources</span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 self-end md:self-auto">
                        {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    <div className="space-y-1">
                        {workerProgress.slice(0, 4).map((item, index) => (
                            <AgentProgressRow key={item.bucket.agentId} item={item} index={index} />
                        ))}
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/55">
                        {isStreaming ? "Live operations trace · expand for worker detail" : "Completed operations trace · expand for worker detail"}
                    </p>
                </div>
            </button>

            {expanded ? (
                <div className="divide-y divide-border/45 border-t border-border/70 bg-background/5">
                    {buckets.map((bucket, index) => {
                        const latest = bucket.events[bucket.events.length - 1];
                        const isSelected = bucket.agentId === selectedAgentId;
                        const highlights = bucket.events
                            .filter((event) => event.type !== "message.delta")
                            .slice(-2)
                            .map((event) => stripMarkdownArtifacts(describeEvent(event)));
                        const bucketProgress = getBucketProgress(bucket);
                        const isRunning = bucket.status === "running";

                        return (
                            <button
                                key={bucket.agentId}
                                type="button"
                                onClick={() => onSelectAgent(bucket.agentId)}
                                className={cn(
                                    "grid w-full gap-3 py-3 pl-4 pr-3 text-left transition-colors md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-start md:pl-5 md:pr-4",
                                    getBucketRowTone(bucket.status, isSelected)
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-sans text-[13px] leading-[1.35] text-foreground/86">{bucket.role.replace(/-/g, " ")}</p>
                                    <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/65">Agent {String(index + 1).padStart(2, "0")}</p>
                                </div>
                                <div className="min-w-0 space-y-2">
                                    <div className="flex items-center gap-3">
                                        {isRunning ? (
                                            <DotMatrixProgress progress={bucketProgress.value} compact tone="active" />
                                        ) : (
                                            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/60">{bucket.status}</span>
                                        )}
                                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/60">{bucketProgress.stage}</span>
                                    </div>
                                    <p className="line-clamp-2 break-words font-sans text-[13px] leading-[1.55] text-foreground/80">
                                        {stripMarkdownArtifacts(bucket.summary) ?? (latest ? stripMarkdownArtifacts(describeEvent(latest)) : "Awaiting trace output.")}
                                    </p>
                                    {highlights.length ? (
                                        <div className="space-y-1">
                                            {highlights.map((highlight, index) => (
                                                <div key={`${bucket.agentId}-${index}`} className="flex items-start gap-2">
                                                    <span className="mt-[5px] size-1 shrink-0 rounded-full bg-border/80" />
                                                    <p className="line-clamp-1 break-words font-sans text-[12px] leading-[1.5] text-muted-foreground">
                                                        {highlight}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/65 md:justify-end">
                                    <span className={cn(getStatusBadgeTone(bucket.status))}>{bucket.status}</span>
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
            ? "bg-destructive/[0.04] border-l-2 border-l-destructive/50 pl-[14px] md:pl-[18px]"
            : "hover:bg-destructive/[0.025]";
    }

    if (status === "running") {
        return isSelected
            ? "bg-chart-1/[0.03] border-l-2 border-l-chart-1 pl-[14px] md:pl-[18px]"
            : "hover:bg-accent/15";
    }

    if (status === "completed") {
        return isSelected
            ? "bg-chart-2/[0.02] border-l-2 border-l-chart-2/50 pl-[14px] md:pl-[18px]"
            : "hover:bg-accent/15";
    }

    return isSelected ? "bg-accent/20 border-l-2 border-l-border/50 pl-[14px] md:pl-[18px]" : "hover:bg-accent/15";
}

function getStatusBadgeTone(status: "idle" | "running" | "completed" | "error") {
    switch (status) {
        case "error":
            return "text-destructive";
        case "running":
            return "text-chart-1";
        case "completed":
            return "text-chart-2";
        default:
            return "text-muted-foreground";
    }
}

function useSmoothedProgress(targetProgress: number) {
    const [displayProgress, setDisplayProgress] = useState(() => clampProgress(targetProgress));
    const currentRef = useRef(displayProgress);
    const targetRef = useRef(displayProgress);
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        const nextTarget = clampProgress(targetProgress);
        targetRef.current = nextTarget;

        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
        }

        const tick = () => {
            const current = currentRef.current;
            const delta = targetRef.current - current;

            if (Math.abs(delta) < 0.08) {
                currentRef.current = targetRef.current;
                setDisplayProgress(targetRef.current);
                frameRef.current = null;
                return;
            }

            // Ease out in tiny steps so coarse bucket updates feel continuous.
            const next = current + delta * 0.12;
            currentRef.current = next;
            setDisplayProgress(next);
            frameRef.current = requestAnimationFrame(tick);
        };

        if (Math.abs(targetRef.current - currentRef.current) < 0.08) {
            currentRef.current = targetRef.current;
            setDisplayProgress(targetRef.current);
            frameRef.current = null;
            return;
        }

        frameRef.current = requestAnimationFrame(tick);

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [targetProgress]);

    return displayProgress;
}

function DotMatrixProgress({ progress, tone, compact = false }: { progress: number; tone: "active" | "complete" | "error"; compact?: boolean }) {
    const displayProgress = useSmoothedProgress(progress);
    const color = tone === "error" ? "var(--destructive)" : tone === "complete" ? "var(--chart-2)" : "var(--chart-1)";
    const basePattern = "radial-gradient(circle, color-mix(in oklch, var(--foreground) 13%, transparent) 0 1px, transparent 1.75px)";
    const activePattern = `radial-gradient(circle, color-mix(in oklch, ${color} 62%, transparent) 0 1px, transparent 1.75px)`;

    return (
        <div className={cn("relative w-full overflow-hidden rounded-sm", compact ? "h-[11px]" : "h-[16px]")} aria-hidden="true">
            <div className="absolute inset-0 opacity-75" style={{ backgroundImage: basePattern, backgroundSize: "7px 7px" }} />
            <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${displayProgress}%` }}>
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

function AgentProgressRow({ item }: { item: BucketProgress; index: number }) {
    const tone = item.bucket.status === "error" ? "error" : item.bucket.status === "completed" ? "complete" : "active";
    const isRunning = tone === "active";
    const isError = tone === "error";

    return (
        <div className="grid min-h-6 items-center gap-3 md:grid-cols-[140px_minmax(0,1fr)_100px]">
            <div className="flex min-w-0 items-center justify-between gap-3 md:block">
                <p className="truncate font-sans text-[13px] leading-[1.35] text-foreground/80">{item.bucket.role.replace(/-/g, " ")}</p>
            </div>
            
            <div className="flex min-w-0 items-center gap-3">
                {isRunning ? (
                    <DotMatrixProgress progress={item.value} compact tone={tone} />
                ) : (
                    <p className="truncate font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/60">
                        {isError ? "execution failed" : item.bucket.status}
                    </p>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/60 md:justify-end">
                {isError ? (
                    <span className="text-destructive">failed</span>
                ) : (
                    <>
                        <span>{Math.round(item.value)}%</span>
                        {isRunning ? <span>{item.stage}</span> : null}
                        {!isRunning && !isError ? <span className="size-1.5 rounded-full bg-chart-2" /> : null}
                    </>
                )}
            </div>
        </div>
    );
}

function clampProgress(value: number) {
    return Math.min(100, Math.max(0, value));
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
