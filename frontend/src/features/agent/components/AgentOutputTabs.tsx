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
                    ? "border-chart-1 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  tab.disabled && "cursor-not-allowed opacity-40 hover:border-transparent hover:text-muted-foreground"
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
    <div className="space-y-6">
      <section className="border-b border-border/60 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Overview</p>
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-[1.2px]",
              output.executionReady ? "text-chart-2" : "text-muted-foreground"
            )}
          >
            {output.executionReady ? "execution-ready" : "advisory only"}
          </span>
        </div>
        <p className="mt-3 max-w-[960px] font-sans text-[18px] leading-[1.5] tracking-[-0.01em] text-foreground/95 md:text-[20px]">{plainText(output.summary)}</p>
        {firstSources.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {firstSources.map((source) => (
              <SourceChip key={source.id} source={source} onClick={onSourceClick} />
            ))}
          </div>
        ) : null}
      </section>

      {reliabilityWarnings.length ? <ReliabilityWarnings warnings={reliabilityWarnings} /> : null}

      <div className="grid gap-5 lg:grid-cols-3">
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Audit Logs</p>
          <p className="mt-1 font-sans text-[12px] leading-[1.5] text-muted-foreground">Filter claims, inspect support, and resolve citations.</p>
        </div>
        <div className="inline-flex w-fit overflow-hidden rounded-full border border-border/70 bg-secondary/20 p-0.5">
          {evidenceFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                filter === item.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleEvidence.length ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="divide-y divide-border/55 border-y border-border/60">
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
                    "grid w-full grid-cols-[4px_minmax(0,1fr)] gap-3 py-3 pr-3 text-left transition-colors",
                    !hasSources
                      ? isActive
                        ? "bg-destructive/5"
                        : "hover:bg-destructive/5"
                      : isActive
                        ? "bg-accent/35"
                        : "hover:bg-accent/20"
                  )}
                >
                  <span className={cn("h-full min-h-16 border-l", isActive ? "border-chart-1" : hasSources ? "border-border/70" : "border-destructive/60")} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                        <span>{item.id}</span>
                        <span>{hasSources ? `${item.sourceIds.length} sources` : "no source link"}</span>
                      </span>
                      <ConfidenceBadge value={item.confidence} />
                    </span>
                    <span className="mt-2 block line-clamp-2 font-sans text-[15px] leading-[1.35] text-foreground">{plainText(item.claim)}</span>
                    <span className="mt-2 block line-clamp-2 font-sans text-[12px] leading-[1.55] text-foreground/55">{plainText(item.detail)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="min-h-[320px] border-y border-border/60 py-4">
            {activeEvidence ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Selected Evidence / {activeEvidence.id}</p>
                    <h3 className="mt-3 font-sans text-[21px] font-medium leading-[1.25] tracking-[-0.02em] text-foreground">{plainText(activeEvidence.claim)}</h3>
                  </div>
                  <ConfidenceBadge value={activeEvidence.confidence} />
                </div>

                <p className="font-sans text-[14px] leading-[1.7] text-foreground/75">{plainText(activeEvidence.detail)}</p>

                {activeEvidence.calculation ? (
                  <Callout label="Calculation" value={activeEvidence.calculation} />
                ) : null}

                {!activeEvidence.sourceIds.length ? (
                  <Callout label="Source Link" value="No source citation is attached to this evidence item." tone="risk" />
                ) : (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Linked Sources</p>
                    <SourceChipList sourceIds={activeEvidence.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
                  </div>
                )}

                {(activeEvidence.agentIds ?? []).length ? (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Contributing Agents</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/75">
                      {(activeEvidence.agentIds ?? []).map((agentId) => (
                        <span key={agentId}>{agentId.replace(/-/g, " ")}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
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
    <div className="space-y-6">
      {output.recommendations.length ? (
        <div className="divide-y divide-border/55 border-y border-border/60">
          {output.recommendations.map((item) => {
            const supportStatus = item.supportStatus ?? (item.sourceIds.length ? "supported" : "unsupported");
            return (
              <article
                key={item.id}
                className={cn("grid gap-4 px-3 py-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]", supportStatus === "unsupported" && "border-l border-l-destructive/50")}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{item.id}</p>
                    <SupportBadge value={supportStatus} />
                    <ConfidenceBadge value={item.confidence} />
                  </div>
                  <h3 className="mt-3 font-sans text-[18px] font-medium leading-[1.35] tracking-[-0.015em] text-foreground">{plainText(item.title)}</h3>
                  <p className="mt-2 font-sans text-[13px] leading-[1.65] text-foreground/70">{plainText(item.rationale)}</p>
                </div>
                <div className="grid content-start gap-2">
                  {item.supportReason ? <Callout label="Evidence Status" value={item.supportReason} tone={supportStatus === "supported" ? undefined : "risk"} /> : null}
                  <Callout label="Risk" value={item.risk} tone="risk" />
                  <Callout label="Next Action" value={item.nextAction} />
                  <SourceChipList sourceIds={item.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
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
    <section>
      <div className="border-b border-border/60 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Decision Table</p>
      </div>
      <div className="border-y border-border/60">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr>
              {["Holding", "Status", "Finding", "Suggested Action", "Confidence", "Sources"].map((header) => (
                <th key={header} className="break-words border-b border-border/60 px-3 py-3 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/75">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.holding}-${index}`} className="hover:bg-accent/20">
                <td className="break-words border-b border-border/45 px-3 py-3 font-sans text-[13px] text-foreground">{plainText(row.holding)}</td>
                <td className="break-words border-b border-border/45 px-3 py-3 font-sans text-[13px] text-foreground/70">{plainText(row.status)}</td>
                <td className="break-words border-b border-border/45 px-3 py-3 font-sans text-[13px] text-foreground/70">{plainText(row.finding)}</td>
                <td className="break-words border-b border-border/45 px-3 py-3 font-sans text-[13px] text-foreground/70">{plainText(row.suggestedAction)}</td>
                <td className="border-b border-border/45 px-3 py-3"><ConfidenceBadge value={row.confidence} /></td>
                <td className="border-b border-border/45 px-3 py-3">
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
    <section className="border-l border-destructive/50 px-4 py-1">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-destructive">Evidence Audit</p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`} className="font-sans text-[13px] leading-[1.6] text-foreground/75">
            {warning}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  return (
    <section className={cn("border-t border-border/60 pt-4", tone === "risk" && "border-l border-l-destructive/50 pl-4")}>
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="font-sans text-[13px] leading-[1.6] text-foreground/70">
            {plainText(item)}
          </li>
        ))}
      </ul>
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
    <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getConfidenceTone(value))}>
      {value} confidence
    </span>
  );
}

function SupportBadge({ value }: { value: "supported" | "partial" | "unsupported" }) {
  return (
    <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getSupportTone(value))}>
      {value}
    </span>
  );
}

function FreshnessBadge({ value }: { value: AgentSourceReference["freshness"] }) {
  return (
    <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getFreshnessTone(value))}>
      {value}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="border-y border-border/60 px-3 py-5 font-sans text-[14px] leading-[1.6] text-muted-foreground">{label}</div>;
}

function getConfidenceTone(value: "low" | "medium" | "high") {
  if (value === "high") return "border-chart-2/50 text-chart-2";
  if (value === "low") return "border-destructive/50 text-destructive";
  return "border-border text-foreground/55";
}

function getSupportTone(value: "supported" | "partial" | "unsupported") {
  if (value === "supported") return "border-chart-2/50 text-chart-2";
  if (value === "unsupported") return "border-destructive/50 text-destructive";
  return "border-chart-1/50 text-chart-1";
}

function getFreshnessTone(value: AgentSourceReference["freshness"]) {
  if (value === "current" || value === "recent") return "border-chart-2/50 text-chart-2";
  if (value === "stale") return "border-destructive/50 text-destructive";
  return "border-border text-muted-foreground";
}

function sourceFreshnessNeedsReview(source: AgentSourceReference) {
  return source.freshness === "stale" || source.freshness === "unknown";
}
