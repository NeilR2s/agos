import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getUserId } from "@/api/backend/client";
import { engineClient } from "@/api/engine/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TickerAutocompleteInput } from "@/components/shared/TickerAutocomplete";
import { extractErrorMessage, formatCurrency, formatNumber } from "@/lib/format";
import { normalizeEngineHealth, normalizeTradeDecision, type TradeDecision } from "@/data/normalizeEngine";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSignedInUserIdentity } from "@/lib/authIdentity";
import { useAuthStore } from "@/store/authStore";

const evaluationStages = [
  "Ingesting price series",
  "Resolving portfolio state",
  "Executing forecast model",
  "Scoring signal vectors",
  "Validating rule gate",
  "Finalizing decision",
];

const actionTone = (action: string | null | undefined) => {
  if (action === "BUY") return "text-chart-2";
  if (action === "SELL") return "text-destructive";
  if (action === "HOLD") return "text-chart-1";
  return "text-foreground";
};

const traceTone = (status: string | null | undefined) => {
  if (status === "done") return "text-chart-2";
  if (status === "warn") return "text-chart-1";
  if (status === "blocked") return "text-destructive";
  return "text-muted-foreground";
};

const formatTraceMetricLabel = (label: string) => label.replace(/_/g, " ");

const formatTraceMetricValue = (key: string, value: unknown) => {
  if (value === null || value === undefined) return "---";
  if (typeof value === "boolean") return value ? "YES" : "NO";
  if (typeof value === "number") {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("confidence") || normalizedKey.includes("threshold")) {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (normalizedKey.includes("price") || normalizedKey.includes("cash") || normalizedKey.includes("value")) {
      return formatCurrency(value);
    }
    if (normalizedKey.includes("quantity") || normalizedKey.includes("points") || normalizedKey.includes("positions") || normalizedKey.includes("days")) {
      return formatNumber(value, "en-PH", 0);
    }
    return formatNumber(value);
  }
  return String(value);
};

type TradeWorkbenchProps = {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  showHeader?: boolean;
  compact?: boolean;
  className?: string;
};

export function TradeWorkbench({
  ticker,
  onTickerChange,
  showHeader = true,
  compact = false,
  className,
}: TradeWorkbenchProps) {
  const [tickerInput, setTickerInput] = useState(ticker);
  const generatedId = useId().replace(/:/g, "");
  const tickerInputId = `trade-ticker-${generatedId}`;
  const actionInputId = `trade-action-${generatedId}`;
  const quantityInputId = `trade-quantity-${generatedId}`;
  const reasonInputId = `trade-reason-${generatedId}`;
  const authUser = useAuthStore((state) => state.user);
  const signedInUser = getSignedInUserIdentity(authUser);
  const [decision, setDecision] = useState<TradeDecision | null>(null);
  const [displayedReasoning, setDisplayedReasoning] = useState("");
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [evaluationId, setEvaluationId] = useState(0);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [openTraceSteps, setOpenTraceSteps] = useState<Record<number, boolean>>({});

  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    setTickerInput(ticker);
  }, [ticker]);

  const healthQuery = useQuery({
    queryKey: ["engine-health"],
    queryFn: async () => {
      const { data, error } = await engineClient.GET("/api/v1/health", {});
      if (error) throw error;
      return normalizeEngineHealth(data);
    },
    refetchInterval: 30000,
  });

  const versionQuery = useQuery({
    queryKey: ["engine-version"],
    queryFn: async () => {
      const { data, error } = await engineClient.GET("/api/v1/version", {});
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    refetchInterval: 30000,
  });

  const evaluateMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const { data, error } = await engineClient.POST("/api/v1/trading/evaluate", {
        body: { ticker: symbol, user_id: getUserId(), lookback_days: 30 },
      });

      if (error) throw error;
      return normalizeTradeDecision(data);
    },
    onMutate: () => {
      setEvaluationId((value) => value + 1);
      setDecision(null);
      setDisplayedReasoning("");
    },
    onSuccess: (data) => {
      setDecision(data);
      setDisplayedReasoning("");
    },
    onError: (error) => {
      toast.error(`Evaluation failed: ${extractErrorMessage(error)}`);
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (payload: { action: TradeDecision["action"]; quantity: number; reason: string }) => {
      const { data, error } = await engineClient.POST("/api/v1/trading/override", {
        body: { ...payload, user_id: getUserId(), ticker: decision?.ticker ?? ticker },
      });

      if (error) throw error;
      return normalizeTradeDecision(data);
    },
    onSuccess: (data) => {
      setDecision(data);
      toast.success("Manual override submitted successfully");
      setIsOverrideOpen(false);
    },
    onError: (error) => {
      toast.error(`Override rejected: ${extractErrorMessage(error)}`);
    },
  });

  const engineStatus = useMemo(() => {
    const health = healthQuery.data ?? { status: "CHECKING", version: "---", model: "---" };
    const versionData = versionQuery.data ?? { version: "---" };

    return {
      status: healthQuery.isError ? "OFFLINE" : health.status.toUpperCase(),
      version: health.version !== "---" ? health.version : typeof versionData.version === "string" ? versionData.version : "---",
      model: health.model,
    };
  }, [healthQuery.data, healthQuery.isError, versionQuery.data]);

  const reasoning = decision?.ai_signal.reasoning ?? "";

  useEffect(() => {
    setDecision(null);
    setDisplayedReasoning("");
    setIsOverrideOpen(false);
  }, [ticker]);

  useEffect(() => {
    if (!reasoning) {
      setDisplayedReasoning("");
      return;
    }

    setDisplayedReasoning("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayedReasoning(reasoning.slice(0, index));

      if (index >= reasoning.length) {
        window.clearInterval(timer);
      }
    }, 12);

    return () => window.clearInterval(timer);
  }, [evaluationId, reasoning]);

  useEffect(() => {
    if (!evaluateMutation.isPending) {
      setActiveStageIndex(0);
      return;
    }

    setActiveStageIndex(0);
    const timer = window.setInterval(() => {
      setActiveStageIndex((index) => Math.min(index + 1, evaluationStages.length - 1));
    }, 250);

    return () => window.clearInterval(timer);
  }, [evaluateMutation.isPending]);

  const highlightReasoning = (text: string) => {
    if (!text) return text;
    
    const keywords = [
      { regex: /(bullish)/gi, className: "text-chart-2 font-medium" },
      { regex: /(bearish)/gi, className: "text-destructive font-medium" },
      { regex: /(volatility|momentum|oversold|overbought)/gi, className: "text-chart-1 font-medium" },
    ];

    let segments: (string | React.ReactNode)[] = [text];

    keywords.forEach(({ regex, className }) => {
      const nextSegments: (string | React.ReactNode)[] = [];
      segments.forEach((segment) => {
        if (typeof segment !== "string") {
          nextSegments.push(segment);
          return;
        }

        const parts = segment.split(regex);
        parts.forEach((part, i) => {
          if (i % 2 === 1) {
            nextSegments.push(<span key={i} className={className}>{part}</span>);
          } else if (part) {
            nextSegments.push(part);
          }
        });
      });
      segments = nextSegments;
    });

    return segments;
  };

  const handleExportTrace = () => {
    if (!decision?.trace) return;
    const blob = new Blob([JSON.stringify(decision.trace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agos-trace-${decision.ticker}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Trace exported successfully");
  };

  const hasTrace = Boolean(decision?.trace?.length);
  const portfolioImpact = decision?.portfolio_impact;
  const hasPortfolioImpact = Boolean(portfolioImpact);

  return (
    <div className={cn("space-y-12", className)}>
      {showHeader ? (
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h1 className="font-sans text-[26px] font-medium tracking-tight text-foreground">Decision Matrix</h1>
            <p className="max-w-[700px] font-sans text-[15px] leading-relaxed text-muted-foreground/60">
              Evaluate ticker, inspect model reasoning, and confirm safety gates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50">
            <div className="flex items-center gap-2">
              <div className={cn("size-1 rounded-full", healthQuery.isError ? "bg-destructive" : "bg-chart-2")} />
              <span>{engineStatus.status}</span>
            </div>
            <span>v{engineStatus.version}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{engineStatus.model}</span>
            {decision?.latency_ms ? (
              <span className="text-chart-2">{decision.latency_ms.toFixed(0)}ms</span>
            ) : null}
            <Link to={`/agent?ticker=${ticker}&mode=trading`} className="text-muted-foreground/60 hover:text-primary transition-colors">
              [ Open in Copilot ]
            </Link>
          </div>
        </header>
      ) : null}

      <section className="flex flex-col gap-8 border-t border-border/30 pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md" onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)}>
            <TickerAutocompleteInput
              id={tickerInputId}
              name="ticker"
              ariaLabel="Trading ticker"
              value={tickerInput}
              onChange={setTickerInput}
              onSelect={(item) => onTickerChange(item.ticker)}
              className="w-full"
              inputClassName="bg-transparent border-x-0 border-t-0 border-b border-border/60 rounded-none px-0 h-10 font-sans text-[18px] focus-visible:ring-0 focus-visible:border-primary/50 transition-colors"
              showHint={false}
              placeholder="Enter ticker..."
            />
            <div className={cn(
              "absolute -bottom-5 left-0 font-mono text-[9px] uppercase tracking-[1.2px] text-white/50 transition-opacity duration-200",
              isInputFocused ? "opacity-100" : "opacity-0"
            )}>
              Tab to accept · Enter to evaluate
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-2 sm:mt-0">
            <Button
              className="h-10 px-8 bg-foreground text-background hover:bg-foreground/90 font-sans font-medium rounded-none transition-all"
              onClick={() => {
                const nextTicker = tickerInput.trim().toUpperCase() || ticker;
                setTickerInput(nextTicker);
                onTickerChange(nextTicker);
                evaluateMutation.mutate(nextTicker);
              }}
              disabled={evaluateMutation.isPending}
            >
              {evaluateMutation.isPending ? "Evaluating..." : "Evaluate"}
            </Button>

            {decision && (
              <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-10 border-border/40 bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground rounded-none transition-colors">
                    Override
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-border/40 bg-[#080808] text-foreground shadow-none sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle className="font-sans text-[20px] font-medium">Manual Override</DialogTitle>
                    <DialogDescription className="font-sans text-[14px] text-muted-foreground/60">
                      All overrides are logged for {signedInUser.primary} and the current ticker context.
                    </DialogDescription>
                  </DialogHeader>

                  <form
                    className="space-y-6 pt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      overrideMutation.mutate({
                        action: formData.get("action") as TradeDecision["action"],
                        quantity: Number(formData.get("quantity") ?? 0),
                        reason: String(formData.get("reason") ?? ""),
                      });
                    }}
                  >
                    <div className="space-y-2">
                      <label htmlFor={actionInputId} className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50">Action</label>
                      <select
                        id={actionInputId}
                        name="action"
                        defaultValue={decision.action}
                        className="flex h-10 w-full border border-border/40 bg-transparent px-3 py-2 font-sans text-sm text-white outline-none focus:border-primary/50 transition-colors"
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                        <option value="HOLD">HOLD</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={quantityInputId} className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50">Quantity</label>
                      <input
                        id={quantityInputId}
                        name="quantity"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={decision.quantity}
                        required
                        className="flex h-10 w-full border border-border/40 bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/50 focus:border-primary/50 transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={reasonInputId} className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50">Justification</label>
                      <textarea
                        id={reasonInputId}
                        name="reason"
                        required
                        placeholder="Provide technical justification..."
                        className="min-h-24 w-full border border-border/40 bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/50 focus:border-primary/50 transition-colors"
                      />
                    </div>

                    <DialogFooter className="gap-3">
                      <Button type="button" variant="ghost" onClick={() => setIsOverrideOpen(false)} className="text-muted-foreground/60">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={overrideMutation.isPending} className="bg-foreground text-background hover:bg-foreground/90">
                        {overrideMutation.isPending ? "Submitting..." : "Confirm Override"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </section>

      <section className={cn("grid gap-12", compact ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]")}>
        <div className="space-y-12">
          <section className="space-y-8">
            <div className="flex flex-col gap-1">
              <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Reasoning</h3>
              <p className="font-sans text-[13px] text-muted-foreground/50">Signal decomposition from model output.</p>
            </div>

            {decision ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <div className={cn("font-sans text-[42px] font-medium leading-none tracking-tight", actionTone(decision.ai_signal.action))}>
                    {decision.ai_signal.action}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] uppercase tracking-[1.5px] text-muted-foreground/60 tabular-nums">
                    <span className={cn(decision.is_approved ? "text-chart-2" : "text-destructive")}>
                      {decision.is_approved ? "Gate Approved" : "Gate Blocked"}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{(decision.ai_signal.confidence_score * 100).toFixed(1)}% confidence</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{formatCurrency(decision.target_price)} target</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>qty {formatNumber(decision.quantity, "en-PH", 0)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Pipeline</p>
                  <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/50">
                    <PipelineStep label="Data" active={true} />
                    <PipelineArrow />
                    <PipelineStep label="AI Signal" active={true} />
                    <PipelineArrow />
                    <PipelineStep label="Rule Gate" active={decision.is_approved} color={decision.is_approved ? "text-chart-2" : "text-destructive"} />
                    <PipelineArrow />
                    <PipelineStep label="Portfolio" active={true} />
                    <PipelineArrow />
                    <PipelineStep label="Action" active={true} highlight={true} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-4 border-y border-border/50 px-6">
                <div className="font-sans text-[20px] font-medium text-white/5 italic">
                  Awaiting evaluation trigger...
                </div>
              </div>
            )}

            <div className="relative min-h-[120px] pt-4">
              {evaluateMutation.isPending && (
                <div className="space-y-4">
                  <div className="space-y-3 font-mono text-[11px] uppercase tracking-[1.5px]">
                    {evaluationStages.map((stage, index) => {
                      const isVisible = index <= Math.min(activeStageIndex + 1, evaluationStages.length - 1);
                      if (!isVisible) return null;

                      const isComplete = index < activeStageIndex;
                      const isActive = index === activeStageIndex;

                      return (
                        <div
                          key={stage}
                          className={cn(
                            "flex items-center justify-between gap-3 transition-colors duration-300",
                            isActive ? "text-foreground" : isComplete ? "text-muted-foreground/60" : "text-muted-foreground/50"
                          )}
                        >
                          <span>{isComplete ? "✓" : isActive ? "→" : "○"} {stage}</span>
                          <span className={cn("text-[9px] tabular-nums", isActive ? "animate-pulse text-primary/60" : "text-muted-foreground/50")}>
                            {isComplete ? "done" : isActive ? "running" : "queued"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {displayedReasoning && (
                <p className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-foreground/80 max-w-[640px]">
                  {highlightReasoning(displayedReasoning)}
                  <span className="ml-1 inline-block h-4 w-1 align-middle bg-primary/60 animate-pulse" />
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-12">
          <section className="space-y-6">
            <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Decision Facts</h3>
            
            <div className="space-y-4 font-sans text-[14px]">
              <div className="flex justify-between border-b border-border/50 pb-3">
                <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-[1px]">Ticker</span>
                <span className="text-foreground font-medium">{decision?.ticker ?? ticker}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-3">
                <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-[1px]">Action</span>
                <span className={cn("font-medium", actionTone(decision?.action))}>{decision?.action ?? "---"}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-3">
                <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-[1px]">Quantity</span>
                <span className="text-foreground tabular-nums">{formatNumber(decision?.quantity ?? null, "en-PH", 0)}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-3">
                <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-[1px]">Target</span>
                <span className="text-foreground tabular-nums">{formatCurrency(decision?.target_price ?? null)}</span>
              </div>
              
              <div className="space-y-2 pt-2">
                <span className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/50">Safety Protocol</span>
                <p className="text-[13px] leading-relaxed text-muted-foreground/70 italic">
                  {decision?.rule_gate_reasoning ?? "Run evaluation to populate decision trace."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="space-y-12 border-t border-border/30 pt-12">
        {hasTrace ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Execution Trace</h3>
                <p className="font-sans text-[13px] text-muted-foreground/50">Audit trail of the decision pipeline.</p>
              </div>
              <button
                onClick={handleExportTrace}
                className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                [ Export JSON ]
              </button>
            </div>

            <div className="flex flex-col border-t border-border/50">
              {decision?.trace?.map((step, index) => {
                const isOpen = openTraceSteps[index] ?? false;

                return (
                  <div key={`${step.title}-${index}`} className="border-b border-border/50">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenTraceSteps((s) => ({ ...s, [index]: !isOpen }))
                      }
                      className="flex w-full items-center justify-between gap-4 py-4 text-left group"
                    >
                      <div className="flex items-baseline gap-6">
                        <span className="font-mono text-[10px] text-muted-foreground/50">{String(index + 1).padStart(2, "0")}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground group-hover:text-foreground transition-colors">{step.title}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className={cn("font-mono text-[10px] uppercase tracking-[1.5px] tabular-nums", traceTone(step.status))}>
                          {step.status}
                        </span>
                        <span className="font-mono text-[12px] text-muted-foreground/50 group-hover:text-muted-foreground/50 transition-colors w-4 text-center">{isOpen ? "−" : "+"}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="pb-6 pl-16 pr-4 space-y-4">
                        <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80 max-w-3xl">{step.detail}</p>

                        {step.metrics && Object.keys(step.metrics).length ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-3 pt-2">
                            {Object.entries(step.metrics).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-baseline border-b border-border/50 pb-1">
                                <span className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50">{formatTraceMetricLabel(key)}</span>
                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{formatTraceMetricValue(key, value)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasPortfolioImpact ? (
          <div className="space-y-6 max-w-2xl">
            <div className="flex flex-col gap-1">
              <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Risk Context</h3>
              <p className="font-sans text-[13px] text-muted-foreground/50">Portfolio impact and allocation delta.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
              {Object.entries(portfolioImpact ?? {}).map(([key, value]) => {
                const label = key.replace(/_/g, " ");
                const formattedValue = typeof value === "number"
                  ? (key.includes("weight") || key.includes("ratio") ? `${(value * 100).toFixed(1)}%` : formatCurrency(value))
                  : String(value);

                return (
                  <div key={key} className="flex flex-col gap-1 border-b border-border/50 pb-4">
                    <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground/50">{label}</span>
                    <span className="font-sans text-[15px] text-muted-foreground/90 font-medium">{formattedValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PipelineStep({ label, active, highlight, color }: { label: string; active: boolean; highlight?: boolean; color?: string }) {
  return (
    <div className="relative flex flex-col items-center">
       <span className={cn(
        "transition-colors",
        active ? (highlight ? "text-white font-medium" : "text-white/80") : "text-white/50",
        color
      )}>
        {label}
      </span>
      {highlight && active && (
        <div className="absolute -bottom-2 size-1 rounded-full bg-chart-1" />
      )}
    </div>
  );
}

function PipelineArrow() {
  return <div className="text-white/50">→</div>;
}
