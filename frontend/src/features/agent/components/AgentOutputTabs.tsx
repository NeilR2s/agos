import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
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
  const [copyStatus, setCopyStatus] = useState<{ kind: "memo" | "evidence"; ok: boolean } | null>(null);
  const sourceById = useMemo(() => new Map(output.sources.map((source) => [source.id, source])), [output.sources]);
  const tabItems = useMemo<TabItem[]>(() => [
    { id: "summary", label: "Summary", count: output.reliabilityWarnings?.length || undefined },
    { id: "evidence", label: "Evidence", count: output.evidence.length },
    { id: "recommendations", label: "Recommendations", count: output.recommendations.length },
    { id: "memo", label: "Memo" },
    { id: "trace", label: "Agent Trace", disabled: !traceNode },
    { id: "sources", label: "Sources", count: output.sources.length },
  ], [output.evidence.length, output.recommendations.length, output.reliabilityWarnings?.length, output.sources.length, traceNode]);

  useEffect(() => {
    if (activeTab !== "sources" || !highlightedSourceId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`agent-source-${highlightedSourceId}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [activeTab, highlightedSourceId]);

  const showSource = (sourceId: string) => {
    setHighlightedSourceId(sourceId);
    setActiveTab("sources");
  };

  const copyText = async (kind: "memo" | "evidence", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus({ kind, ok: true });
    } catch {
      setCopyStatus({ kind, ok: false });
    }
    window.setTimeout(() => setCopyStatus(null), 1800);
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

  const panelId = `${tabBaseId}-${activeTab}-panel`;

  return (
    <div className="max-w-[1120px] overflow-hidden border border-white/10 bg-[#14181e]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div role="tablist" aria-label="Agent output sections" className="flex flex-wrap gap-1.5">
          {tabItems.map((tab) => {
            return (
              <button
                key={tab.id}
                id={`${tabBaseId}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={panelId}
                tabIndex={activeTab === tab.id ? 0 : -1}
                disabled={tab.disabled}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                className={cn(
                  "inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                  activeTab === tab.id
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-white/10 text-white/45 hover:border-white/20 hover:text-white",
                  tab.disabled && "cursor-not-allowed opacity-40 hover:border-white/10 hover:text-white/45"
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? <span className="text-white/30">{tab.count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText("memo", markdown)} className="border-white/15 text-white/70">
            <ClipboardDocumentIcon className="size-4" /> {copyStatus?.kind === "memo" ? (copyStatus.ok ? "Memo Copied" : "Copy Failed") : "Copy Memo"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText("evidence", JSON.stringify(output, null, 2))} className="border-white/15 text-white/70">
            <ClipboardDocumentIcon className="size-4" /> {copyStatus?.kind === "evidence" ? (copyStatus.ok ? "Evidence Copied" : "Copy Failed") : "Copy Evidence JSON"}
          </Button>
        </div>
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${tabBaseId}-${activeTab}`} className="p-5">
        {activeTab === "summary" ? <SummaryTab output={output} onSourceClick={showSource} /> : null}
        {activeTab === "evidence" ? <EvidenceTab output={output} sourceById={sourceById} onSourceClick={showSource} /> : null}
        {activeTab === "recommendations" ? <RecommendationsTab output={output} sourceById={sourceById} onSourceClick={showSource} /> : null}
        {activeTab === "memo" ? <MemoTab markdown={markdown} /> : null}
        {activeTab === "trace" ? traceNode ?? <EmptyPanel label="No trace is attached to this message." /> : null}
        {activeTab === "sources" ? <SourcesTab sources={output.sources} highlightedSourceId={highlightedSourceId} /> : null}
      </div>
    </div>
  );
}

function SummaryTab({ output, onSourceClick }: { output: AgentStructuredOutput; onSourceClick: (sourceId: string) => void }) {
  const firstSources = output.sources.slice(0, 4);
  const reliabilityWarnings = output.reliabilityWarnings ?? [];
  return (
    <div className="space-y-5">
      <section className="border border-white/10 bg-white/[0.02] px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Main Finding</p>
          <span
            className={cn(
              "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.2px]",
              output.executionReady ? "border-[#6e9973]/50 text-[#a7c9ab]" : "border-white/10 text-white/45"
            )}
          >
            {output.executionReady ? "execution-ready" : "advisory only"}
          </span>
        </div>
        <p className="mt-3 max-w-[920px] font-sans text-[22px] leading-[1.35] text-white">{plainText(output.summary)}</p>
        {firstSources.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {firstSources.map((source) => (
              <SourceChip key={source.id} source={source} onClick={onSourceClick} />
            ))}
          </div>
        ) : null}
      </section>

      {reliabilityWarnings.length ? <ReliabilityWarnings warnings={reliabilityWarnings} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
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
    return <EmptyPanel label="No structured evidence was captured for this run." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.02] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Evidence Inspector</p>
          <p className="mt-1 font-sans text-[12px] leading-[1.5] text-white/45">Filter claims, inspect support, then jump to source records.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {evidenceFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                filter === item.value ? "border-white/20 bg-white/[0.06] text-white" : "border-white/10 text-white/45 hover:border-white/20 hover:text-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleEvidence.length ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
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
                    "w-full border px-4 py-4 text-left transition-colors",
                    !hasSources
                      ? isActive
                        ? "border-[#8b5862] bg-[#322229]"
                        : "border-[#5f3941] bg-[#281c21] hover:bg-[#2d1f25]"
                      : isActive
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.03]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
                      <span>{item.id}</span>
                      <span>{hasSources ? `${item.sourceIds.length} sources` : "no source link"}</span>
                    </div>
                    <ConfidenceBadge value={item.confidence} />
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-sans text-[15px] leading-[1.35] text-white">{plainText(item.claim)}</h3>
                  <p className="mt-2 line-clamp-2 font-sans text-[12px] leading-[1.55] text-white/55">{plainText(item.detail)}</p>
                </button>
              );
            })}
          </div>

          <section className="min-h-[320px] border border-white/10 bg-[#171a20] px-5 py-5">
            {activeEvidence ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Selected Evidence / {activeEvidence.id}</p>
                    <h3 className="mt-3 font-sans text-[22px] leading-[1.25] text-white">{plainText(activeEvidence.claim)}</h3>
                  </div>
                  <ConfidenceBadge value={activeEvidence.confidence} />
                </div>

                <p className="font-sans text-[14px] leading-[1.7] text-white/75">{plainText(activeEvidence.detail)}</p>

                {activeEvidence.calculation ? (
                  <Callout label="Calculation" value={activeEvidence.calculation} />
                ) : null}

                {!activeEvidence.sourceIds.length ? (
                  <Callout label="Source Link" value="No source citation is attached to this evidence item." tone="risk" />
                ) : (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Linked Sources</p>
                    <SourceChipList sourceIds={activeEvidence.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
                  </div>
                )}

                {(activeEvidence.agentIds ?? []).length ? (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Contributing Agents</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(activeEvidence.agentIds ?? []).map((agentId) => (
                        <span key={agentId} className="border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-white/45">
                          {agentId.replace(/-/g, " ")}
                        </span>
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
    <div className="space-y-5">
      {output.recommendations.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {output.recommendations.map((item) => {
            const supportStatus = item.supportStatus ?? (item.sourceIds.length ? "supported" : "unsupported");
            return (
              <article
                key={item.id}
                className={cn("border bg-white/[0.02] px-4 py-4", supportStatus === "unsupported" ? "border-[#5f3941]" : "border-white/10")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">{item.id}</p>
                    <SupportBadge value={supportStatus} />
                  </div>
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <h3 className="mt-3 font-sans text-[18px] leading-[1.35] text-white">{plainText(item.title)}</h3>
                <p className="mt-2 font-sans text-[13px] leading-[1.65] text-white/70">{plainText(item.rationale)}</p>
                <div className="mt-4 grid gap-2">
                  {item.supportReason ? <Callout label="Evidence Status" value={item.supportReason} tone={supportStatus === "supported" ? undefined : "risk"} /> : null}
                  <Callout label="Risk" value={item.risk} tone="risk" />
                  <Callout label="Next Action" value={item.nextAction} />
                </div>
                <SourceChipList sourceIds={item.sourceIds} sourceById={sourceById} onSourceClick={onSourceClick} />
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
    <section className="overflow-hidden border border-white/10 bg-[#171a20]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Decision Table</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-white/[0.04]">
            <tr>
              {["Holding", "Status", "Finding", "Suggested Action", "Confidence", "Sources"].map((header) => (
                <th key={header} className="border-b border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[1.2px] text-white/45">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.holding}-${index}`}>
                <td className="border-b border-white/10 px-4 py-3 font-sans text-[13px] text-white">{plainText(row.holding)}</td>
                <td className="border-b border-white/10 px-4 py-3 font-sans text-[13px] text-white/70">{plainText(row.status)}</td>
                <td className="border-b border-white/10 px-4 py-3 font-sans text-[13px] text-white/70">{plainText(row.finding)}</td>
                <td className="border-b border-white/10 px-4 py-3 font-sans text-[13px] text-white/70">{plainText(row.suggestedAction)}</td>
                <td className="border-b border-white/10 px-4 py-3"><ConfidenceBadge value={row.confidence} /></td>
                <td className="border-b border-white/10 px-4 py-3">
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
    return <EmptyPanel label="No structured sources were captured for this run." />;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {sources.map((source) => (
        <a
          id={`agent-source-${source.id}`}
          key={source.id}
          href={source.href ?? undefined}
          target={source.href ? "_blank" : undefined}
          rel={source.href ? "noreferrer" : undefined}
          className={cn(
            "block border px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.03]",
            highlightedSourceId === source.id ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/45">{source.id}</p>
            <FreshnessBadge value={source.freshness} />
          </div>
          <h3 className="mt-3 font-sans text-[15px] leading-[1.45] text-white">{plainText(source.label)}</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">{source.source} / {source.kind}</p>
          {source.excerpt ? <p className="mt-3 font-sans text-[12px] leading-[1.55] text-white/55">{plainText(source.excerpt)}</p> : null}
          {sourceFreshnessNeedsReview(source) ? (
            <p className="mt-3 border border-[#5f3941] bg-[#281c21] px-3 py-2 font-mono text-[10px] uppercase tracking-[1.2px] text-[#d7a5ad]">
              Freshness requires verification before action
            </p>
          ) : null}
          <div className="mt-4 grid gap-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-white/35">
            <span>Published: {formatDate(source.publishedAt)}</span>
            <span>Retrieved: {formatDate(source.retrievedAt)}</span>
            <span>Used by: {source.agentLabel ?? source.agentId ?? "AGOS"}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

function MemoTab({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-[980px] border border-white/10 bg-white/[0.02] px-5 py-5">
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
    <section className="border border-[#5f3941] bg-[#281c21] px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-[#d7a5ad]">Evidence Audit</p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`} className="font-sans text-[13px] leading-[1.6] text-white/75">
            {warning}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  return (
    <section className={cn("border px-4 py-4", tone === "risk" ? "border-[#5f3941] bg-[#281c21]" : "border-white/10 bg-white/[0.02]")}>
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="font-sans text-[13px] leading-[1.6] text-white/70">
            {plainText(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Callout({ label, value, tone }: { label: string; value: string; tone?: "risk" }) {
  return (
    <div className={cn("border px-3 py-3", tone === "risk" ? "border-[#5f3941] bg-[#281c21]" : "border-white/10 bg-[#171a20]")}>
      <p className="font-mono text-[10px] uppercase tracking-[1.3px] text-white/35">{label}</p>
      <p className="mt-1 font-sans text-[12px] leading-[1.55] text-white/70">{plainText(value)}</p>
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
        "border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors hover:border-white/25 hover:text-white",
        getFreshnessTone(source.freshness)
      )}
      title={source.label}
    >
      {source.id}
    </button>
  );
}

function plainText(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesEvidenceFilter(item: AgentStructuredOutput["evidence"][number], filter: EvidenceFilter) {
  if (filter === "all") return true;
  if (filter === "no-source") return item.sourceIds.length === 0;
  return item.confidence === filter;
}

function ConfidenceBadge({ value }: { value: "low" | "medium" | "high" }) {
  return (
    <span className={cn("border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getConfidenceTone(value))}>
      {value} confidence
    </span>
  );
}

function SupportBadge({ value }: { value: "supported" | "partial" | "unsupported" }) {
  return (
    <span className={cn("border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getSupportTone(value))}>
      {value}
    </span>
  );
}

function FreshnessBadge({ value }: { value: AgentSourceReference["freshness"] }) {
  return (
    <span className={cn("border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px]", getFreshnessTone(value))}>
      {value}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="border border-white/10 bg-white/[0.02] px-5 py-5 font-sans text-[14px] leading-[1.6] text-white/50">{label}</div>;
}

function getConfidenceTone(value: "low" | "medium" | "high") {
  if (value === "high") return "border-[#6e9973]/50 text-[#a7c9ab]";
  if (value === "low") return "border-[#5f3941] text-[#d7a5ad]";
  return "border-white/10 text-white/55";
}

function getSupportTone(value: "supported" | "partial" | "unsupported") {
  if (value === "supported") return "border-[#6e9973]/50 text-[#a7c9ab]";
  if (value === "unsupported") return "border-[#5f3941] text-[#d7a5ad]";
  return "border-[#75613b] text-[#d8c79a]";
}

function getFreshnessTone(value: AgentSourceReference["freshness"]) {
  if (value === "current" || value === "recent") return "border-[#6e9973]/50 text-[#a7c9ab]";
  if (value === "stale") return "border-[#5f3941] text-[#d7a5ad]";
  return "border-white/10 text-white/45";
}

function sourceFreshnessNeedsReview(source: AgentSourceReference) {
  return source.freshness === "stale" || source.freshness === "unknown";
}
