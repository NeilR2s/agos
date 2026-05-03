import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { stripMarkdownArtifacts } from "@/features/agent/lib/traces";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentSourceReference, AgentStructuredOutput } from "@/features/agent/types";

type AgentOutputTabsProps = {
  output: AgentStructuredOutput;
  markdown: string;
  traceNode?: ReactNode;
};

type OutputTab = "summary" | "evidence" | "recommendations" | "memo" | "trace" | "sources";
type EvidenceFilter = "all" | "high" | "medium" | "low" | "no-source";

type TabItem = { id: OutputTab; label: string; count?: number; disabled?: boolean };

const evidenceFilters: Array<{ value: EvidenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "no-source", label: "No Source" },
];

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div className="agent-markdown-table-wrap">
        <table className="agent-markdown-table">{children}</table>
      </div>
    );
  },
  a({ children, href }) {
    return (
      <a href={href} target={href ? "_blank" : undefined} rel={href ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
};

export function AgentOutputTabs({ output, markdown, traceNode }: AgentOutputTabsProps) {
  const tabBaseId = useId();
  const [activeTab, setActiveTab] = useState<OutputTab>("summary");
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const sourceById = useMemo(() => new Map(output.sources.map((source) => [source.id, source])), [output.sources]);
  const tabItems = useMemo<TabItem[]>(() => {
    const items: TabItem[] = [
      { id: "summary", label: "Synthesis", count: output.reliabilityWarnings?.length || undefined },
      { id: "evidence", label: "Audit", count: output.evidence.length },
      { id: "recommendations", label: "Actions", count: output.recommendations.length },
      { id: "memo", label: "Transcript" },
    ];

    if (traceNode) {
      items.push({ id: "trace", label: "Trace" });
    }

    items.push({ id: "sources", label: "Citations", count: output.sources.length });
    return items;
  }, [output.evidence.length, output.recommendations.length, output.reliabilityWarnings?.length, output.sources.length, traceNode]);

  const resolvedActiveTab = tabItems.some((item) => item.id === activeTab && !item.disabled) ? activeTab : "summary";

  useEffect(() => {
    if (resolvedActiveTab !== "sources" || !highlightedSourceId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`agent-source-${highlightedSourceId}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [resolvedActiveTab, highlightedSourceId]);

  const showSource = (sourceId: string) => {
    setHighlightedSourceId(sourceId);
    setActiveTab("sources");
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: TabItem) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const enabledTabs = tabItems.filter((item) => !item.disabled);
    const currentIndex = Math.max(0, enabledTabs.findIndex((item) => item.id === tab.id));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabledTabs.length - 1
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
          : (currentIndex + 1) % enabledTabs.length;
    const nextTab = enabledTabs[nextIndex];
    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`${tabBaseId}-${nextTab.id}`)?.focus());
  };

  const panelId = `${tabBaseId}-${resolvedActiveTab}-panel`;

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">Run Information</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.45] text-muted-foreground/78">Structured synthesis, evidence, actions, and citations for the selected run.</p>
        </div>
        <div role="tablist" aria-label="Agent output sections" className="flex max-w-full flex-wrap border-b border-border/60 xl:justify-end">
          {tabItems.map((tab) => {
            return (
              <button
                key={tab.id}
                id={`${tabBaseId}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={resolvedActiveTab === tab.id}
                aria-controls={panelId}
                tabIndex={resolvedActiveTab === tab.id ? 0 : -1}
                disabled={tab.disabled}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b px-3 py-2 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                  resolvedActiveTab === tab.id
                    ? "border-chart-1 text-foreground/90"
                    : "border-transparent text-muted-foreground/50 hover:text-foreground/80",
                  tab.disabled && "cursor-not-allowed opacity-40"
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? <span className="text-muted-foreground/70">{tab.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${tabBaseId}-${resolvedActiveTab}`} className="py-5">
        {resolvedActiveTab === "summary" ? <SummaryTab output={output} onSourceClick={showSource} /> : null}
        {resolvedActiveTab === "evidence" ? <EvidenceTab output={output} sourceById={sourceById} onSourceClick={showSource} /> : null}
        {resolvedActiveTab === "recommendations" ? <RecommendationsTab output={output} sourceById={sourceById} onSourceClick={showSource} /> : null}
        {resolvedActiveTab === "memo" ? <MemoTab markdown={markdown} /> : null}
        {resolvedActiveTab === "trace" ? traceNode ?? <EmptyPanel label="Zero session traces returned." /> : null}
        {resolvedActiveTab === "sources" ? <SourcesTab sources={output.sources} highlightedSourceId={highlightedSourceId} /> : null}
      </div>
    </div>
  );
}

function SummaryTab({ output, onSourceClick }: { output: AgentStructuredOutput; onSourceClick: (sourceId: string) => void }) {
  const firstSources = output.sources.slice(0, 4);
  const reliabilityWarnings = output.reliabilityWarnings ?? [];
  return (
    <div className="space-y-8">
      <section className="border-b border-border/60 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={cn(
              "font-mono text-[9px] uppercase tracking-[1.4px]",
              output.executionReady ? "text-chart-2/80" : "text-muted-foreground/50"
            )}
          >
            {output.executionReady ? "execution-ready" : "advisory only"}
          </span>
        </div>
        <p className="mt-4 max-w-[780px] font-sans text-[18px] leading-[1.6] tracking-[-0.01em] text-foreground/90 md:text-[20px]">{plainText(output.summary)}</p>
        {firstSources.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {firstSources.map((source) => (
              <SourceChip key={source.id} source={source} onClick={onSourceClick} />
            ))}
          </div>
        ) : null}
      </section>

      {reliabilityWarnings.length ? <ReliabilityWarnings warnings={reliabilityWarnings} /> : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <ListBlock title="Assumptions" items={output.assumptions} />
        <ListBlock title="Risks" items={output.risks} tone="risk" />
        <ListBlock title="Next Steps" items={output.nextSteps} />
      </div>
    </div>
  );
}

function EvidenceTab({
  output,
  sourceById,
  onSourceClick,
}: {
  output: AgentStructuredOutput;
  sourceById: Map<string, AgentSourceReference>;
  onSourceClick: (sourceId: string) => void;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(output.evidence[0]?.id ?? null);
  const visibleEvidence = useMemo(
    () => output.evidence.filter((item) => matchesEvidenceFilter(item, filter)),
    [filter, output.evidence]
  );
  const resolvedEvidenceId = visibleEvidence.some((item) => item.id === activeEvidenceId)
    ? activeEvidenceId
    : visibleEvidence[0]?.id ?? null;
  const activeEvidence = visibleEvidence.find((item) => item.id === resolvedEvidenceId) ?? null;

  if (!output.evidence.length) {
    return <EmptyPanel label="Zero structured audit traces returned." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Audit Trace</p>
          <p className="mt-1 font-sans text-[13px] leading-none text-muted-foreground/70">Support verification for synthesized claims.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {evidenceFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "font-mono text-[10px] uppercase tracking-[1.4px] transition-colors",
                filter === item.value ? "text-[#ff5f1f]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleEvidence.length ? (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
            {visibleEvidence.map((item) => {
              const hasSources = item.sourceIds.length > 0;
              const isActive = item.id === activeEvidence?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-expanded={isActive}
                  onClick={() => setActiveEvidenceId(item.id)}
                  className={cn(
                    "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 py-4 pr-3 text-left transition-colors",
                    isActive ? "bg-white/[0.02]" : "hover:bg-white/[0.01]"
                  )}
                >
                  <span className={cn(
                    "absolute inset-y-0 left-0 w-0.5 transition-colors",
                    isActive ? "bg-[#ff5f1f]" : "bg-transparent"
                  )} />
                  <span className="min-w-0 pl-4">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">{item.id}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/50">{hasSources ? `${item.sourceIds.length} sources` : "no citation"}</span>
                    </span>
                    <span className={cn(
                      "mt-2 block line-clamp-2 font-sans text-[15px] leading-[1.45]",
                      isActive ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
                    )}>{plainText(item.claim)}</span>
                  </span>
                  <ConfidenceBadge value={item.confidence} />
                </button>
              );
            })}
          </div>

          <section className="min-h-[400px] border-l border-white/[0.08] pl-8">
            {activeEvidence ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">Evidence ID / {activeEvidence.id}</p>
                      <h3 className="mt-3 font-sans text-[22px] font-medium leading-[1.25] tracking-[-0.02em] text-foreground">{plainText(activeEvidence.claim)}</h3>
                    </div>
                    <ConfidenceBadge value={activeEvidence.confidence} />
                  </div>
                  <p className="max-w-[720px] font-sans text-[15px] leading-[1.7] text-foreground/75">{plainText(activeEvidence.detail)}</p>
                </div>

                <div className="h-px bg-white/[0.06]" />

                <div className="grid gap-6 sm:grid-cols-2">
                  {activeEvidence.calculation ? (
                    <Callout label="Calculation" value={activeEvidence.calculation} />
                  ) : null}

                  {(activeEvidence.agentIds ?? []).length ? (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">Contributing Agents</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/50">
                        {(activeEvidence.agentIds ?? []).map((agentId) => (
                          <span key={agentId}>{agentId.replace(/-/g, " ")}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="h-px bg-white/[0.06]" />

                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">Linked Sources</p>
                  {!activeEvidence.sourceIds.length ? (
                    <p className="mt-3 font-sans text-[13px] text-destructive/70">No source citation is attached to this evidence item.</p>
                  ) : (
                    <SourceChipList sourceIds={activeEvidence.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
                  )}
                </div>
              </div>
            ) : (
              <EmptyPanel label="No evidence matches the current filter." />
            )}
          </section>
        </div>
      ) : (
        <EmptyPanel label="No evidence matches the current filter." />
      )}
    </div>
  );
}

function RecommendationsTab({
  output,
  sourceById,
  onSourceClick,
}: {
  output: AgentStructuredOutput;
  sourceById: Map<string, AgentSourceReference>;
  onSourceClick: (sourceId: string) => void;
}) {
  return (
    <div className="space-y-8">
      {output.recommendations.length ? (
        <div className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
          {output.recommendations.map((item) => {
            const supportStatus = item.supportStatus ?? (item.sourceIds.length ? "supported" : "unsupported");
            return (
              <article
                key={item.id}
                className="grid gap-8 px-4 py-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">{item.id}</p>
                    <SupportBadge value={supportStatus} />
                    <ConfidenceBadge value={item.confidence} />
                  </div>
                  <h3 className="mt-4 font-sans text-[20px] font-medium leading-[1.3] tracking-[-0.015em] text-foreground">{plainText(item.title)}</h3>
                  <p className="mt-3 font-sans text-[14px] leading-[1.7] text-foreground/75">{plainText(item.rationale)}</p>
                </div>
                <div className="grid content-start gap-4 border-l border-white/[0.08] pl-8">
                  {item.supportReason ? <Callout label="Evidence Status" value={item.supportReason} tone={supportStatus === "supported" ? undefined : "risk"} /> : null}
                  <Callout label="Risk Assessment" value={item.risk} tone="risk" />
                  <Callout label="Next Action" value={item.nextAction} />
                  <div className="pt-2">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">Linked Sources</p>
                    <SourceChipList sourceIds={item.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyPanel label="No structured recommendations were captured for this run." />
      )}

      {output.decisionTable.length ? <DecisionTable rows={output.decisionTable} sourceById={sourceById} onSourceClick={onSourceClick} /> : null}
    </div>
  );
}

function DecisionTable({
  rows,
  sourceById,
  onSourceClick,
}: {
  rows: AgentStructuredOutput["decisionTable"];
  sourceById: Map<string, AgentSourceReference>;
  onSourceClick: (sourceId: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-border/60 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Decision Table</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-transparent">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="bg-white/[0.02]">
              {["Holding", "Status", "Finding", "Suggested Action", "Confidence", "Sources"].map((header) => (
                <th key={header} className="border-b border-white/[0.06] px-4 py-3 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/60">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((row, index) => (
              <tr key={`${row.holding}-${index}`} className="transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-3.5 font-sans text-[13px] text-foreground/90">{plainText(row.holding)}</td>
                <td className="px-4 py-3.5 font-sans text-[13px] text-foreground/70">{plainText(row.status)}</td>
                <td className="px-4 py-3.5 font-sans text-[13px] text-foreground/70">{plainText(row.finding)}</td>
                <td className="px-4 py-3.5 font-sans text-[13px] text-foreground/70">{plainText(row.suggestedAction)}</td>
                <td className="px-4 py-3.5"><ConfidenceBadge value={row.confidence} /></td>
                <td className="px-4 py-3.5">
                  <SourceChipList sourceIds={row.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourcesTab({ sources, highlightedSourceId }: { sources: AgentSourceReference[]; highlightedSourceId: string | null }) {
  if (!sources.length) {
    return <EmptyPanel label="Zero citation traces returned." />;
  }

  return (
    <div className="divide-y divide-border/55 border-y border-border/60">
      {sources.map((source) => (
        <a
          id={`agent-source-${source.id}`}
          key={source.id}
          href={source.href ?? undefined}
          target={source.href ? "_blank" : undefined}
          rel={source.href ? "noreferrer" : undefined}
          className={cn(
            "grid gap-3 px-3 py-4 transition-colors hover:bg-accent/20 md:grid-cols-[minmax(0,1fr)_230px]",
            highlightedSourceId === source.id && "bg-accent/35"
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{source.id}</p>
              <FreshnessBadge value={source.freshness} />
            </div>
            <h3 className="mt-2 font-sans text-[15px] leading-[1.45] text-foreground">{plainText(source.label)}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{source.source} / {source.kind}</p>
            {source.excerpt ? <p className="mt-2 font-sans text-[12px] leading-[1.55] text-foreground/55">{plainText(source.excerpt)}</p> : null}
            {sourceFreshnessNeedsReview(source) ? (
              <p className="mt-3 border-l border-destructive/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-destructive">
                Freshness requires verification
              </p>
            ) : null}
          </div>
          <div className="grid content-start gap-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground md:text-right">
            <span>Published: {formatDate(source.publishedAt)}</span>
            <span>Retrieved: {formatDate(source.retrievedAt)}</span>
            <span>Origin: {source.agentLabel ?? source.agentId ?? "AGOS"}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

function MemoTab({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-[980px] border-l border-border/80 px-5 py-1">
      <div className="agent-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ReliabilityWarnings({ warnings }: { warnings: string[] }) {
  return (
    <section className="space-y-4">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Evidence Audit</p>
      <div className="space-y-2 border-l border-destructive/40 pl-4">
        {warnings.map((warning, index) => (
          <p key={`${warning}-${index}`} className="font-sans text-[13px] leading-[1.6] text-foreground/75">
            {warning}
          </p>
        ))}
      </div>
      <div className="h-px bg-border/60" />
    </section>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  return (
    <section className={cn("space-y-4", tone === "risk" && "border-l border-destructive/40 pl-6")}>
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="font-sans text-[13px] leading-[1.6] text-foreground/70">
            {plainText(item)}
          </p>
        ))}
      </div>
    </section>
  );
}

function Callout({ label, value, tone }: { label: string; value: string; tone?: "risk" }) {
  return (
    <div className={cn("border-l border-border/70 px-3 py-1", tone === "risk" && "border-l-destructive/50")}>
      <p className="font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-sans text-[12px] leading-[1.55] text-foreground/70">{plainText(value)}</p>
    </div>
  );
}

function SourceChipList({
  sourceIds,
  sourceById,
  onSourceClick,
  compact = false,
}: {
  sourceIds: string[];
  sourceById: Map<string, AgentSourceReference>;
  onSourceClick: (sourceId: string) => void;
  compact?: boolean;
}) {
  const sources = sourceIds.map((sourceId) => sourceById.get(sourceId)).filter((source): source is AgentSourceReference => Boolean(source));
  if (!sources.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "mt-0" : "mt-4")}>
      {sources.map((source) => (
        <SourceChip key={source.id} source={source} onClick={onSourceClick} />
      ))}
    </div>
  );
}

function SourceChip({ source, onClick }: { source: AgentSourceReference; onClick: (sourceId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(source.id)}
      aria-label={`Show source ${source.id}: ${source.label}`}
      className={cn(
        "rounded-full border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors hover:border-ring/60 hover:text-foreground",
        getFreshnessTone(source.freshness)
      )}
      title={source.label}
    >
      {source.id}
    </button>
  );
}

function plainText(value: string) {
  return stripMarkdownArtifacts(value);
}

function matchesEvidenceFilter(item: AgentStructuredOutput["evidence"][number], filter: EvidenceFilter) {
  if (filter === "all") return true;
  if (filter === "no-source") return item.sourceIds.length === 0;
  return item.confidence === filter;
}

function ConfidenceBadge({ value }: { value: "low" | "medium" | "high" }) {
  return (
    <span className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", getConfidenceTone(value))}>
      {value} confidence
    </span>
  );
}

function SupportBadge({ value }: { value: "supported" | "partial" | "unsupported" }) {
  return (
    <span className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", getSupportTone(value))}>
      {value}
    </span>
  );
}

function FreshnessBadge({ value }: { value: AgentSourceReference["freshness"] }) {
  return (
    <span className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", getFreshnessTone(value))}>
      {value}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="border-y border-border/60 px-3 py-5 font-sans text-[14px] leading-[1.6] text-muted-foreground">{label}</div>;
}

function getConfidenceTone(value: "low" | "medium" | "high") {
  if (value === "high") return "text-chart-2/80";
  if (value === "low") return "text-destructive/80";
  return "text-muted-foreground/60";
}

function getSupportTone(value: "supported" | "partial" | "unsupported") {
  if (value === "supported") return "text-chart-2/80";
  if (value === "unsupported") return "text-destructive/80";
  return "text-chart-1/80";
}

function getFreshnessTone(value: AgentSourceReference["freshness"]) {
  if (value === "current" || value === "recent") return "text-chart-2/80";
  if (value === "stale") return "text-destructive/80";
  return "text-muted-foreground/60";
}

function sourceFreshnessNeedsReview(source: AgentSourceReference) {
  return source.freshness === "stale" || source.freshness === "unknown";
}
