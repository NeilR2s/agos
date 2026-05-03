import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getUserId } from "@/api/backend/client";
import { engineClient } from "@/api/engine/client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalSkeleton } from "@/components/ui/terminal-skeleton";
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
    }, 850);

    return () => window.clearInterval(timer);
  }, [evaluateMutation.isPending]);

  const highlightReasoning = (text: string) => {
    if (!text) return text;
    
    const keywords = [
      { regex: /(bullish)/gi, className: "text-chart-2 font-bold" },
      { regex: /(bearish)/gi, className: "text-destructive font-bold" },
      { regex: /(volatility|momentum|oversold|overbought)/gi, className: "text-chart-1 font-bold" },
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
    <div className={cn("space-y-6", className)}>
      {showHeader ? (
        <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="border-border text-muted-foreground">
              [ Trading Terminal ]
            </Badge>
            <h1 className="font-sans text-[30px] leading-[1.2]">Decision Matrix</h1>
            <p className="max-w-[760px] font-sans text-[16px] leading-[1.5] text-muted-foreground">
              Evaluate a ticker, inspect the rule gate, and submit manual overrides when required.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            <Badge variant="outline" className="border-border text-muted-foreground">
              {engineStatus.status}
            </Badge>
            <span>v{engineStatus.version}</span>
            <span>{engineStatus.model}</span>
            {decision?.latency_ms ? (
              <span className="text-chart-2">{decision.latency_ms.toFixed(0)}ms</span>
            ) : null}
            <Link to={`/agent?ticker=${ticker}&mode=trading`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open in Copilot
            </Link>
          </div>
        </header>
      ) : null}

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Action Controller</CardTitle>
          <CardDescription>Select ticker, run evaluation, or submit manual override.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-visible">
          <div className="space-y-2">
            <label htmlFor={tickerInputId} className="font-sans text-[14px] text-white/70">Ticker</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end" onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)}>
              <TickerAutocompleteInput
                id={tickerInputId}
                name="ticker"
                ariaLabel="Trading ticker"
                value={tickerInput}
                onChange={setTickerInput}
                onSelect={(item) => onTickerChange(item.ticker)}
                className="w-full min-w-0 sm:flex-1"
                inputClassName="text-white"
                showHint={false}
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  className="w-full whitespace-nowrap bg-white/92 font-sans text-[#050505] hover:bg-white sm:w-auto"
                  onClick={() => {
                    const nextTicker = tickerInput.trim().toUpperCase() || ticker;
                    setTickerInput(nextTicker);
                    onTickerChange(nextTicker);
                    evaluateMutation.mutate(nextTicker);
                  }}
                  disabled={evaluateMutation.isPending}
                >
                  {evaluateMutation.isPending ? "Evaluating..." : "Run Analysis"}
                </Button>

                {decision ? (
                  <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full whitespace-nowrap border-white/10 bg-transparent text-white/60 hover:bg-white/5 hover:text-white sm:w-auto">
                        Manual Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="border-border bg-background text-foreground shadow-none sm:max-w-[480px]">
                      <DialogHeader>
                        <DialogTitle>Manual Override</DialogTitle>
                        <DialogDescription>
                          All overrides are logged for {signedInUser.primary}{signedInUser.secondary ? ` / ${signedInUser.secondary}` : ""} and the current ticker context.
                        </DialogDescription>
                      </DialogHeader>

                      <form
                        className="space-y-4"
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
                          <label htmlFor={actionInputId} className="font-sans text-[14px] text-white/70">Action</label>
                          <select
                            id={actionInputId}
                            name="action"
                            defaultValue={decision.action}
                            className="flex h-10 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="BUY">BUY</option>
                            <option value="SELL">SELL</option>
                            <option value="HOLD">HOLD</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor={quantityInputId} className="font-sans text-[14px] text-white/70">Quantity</label>
                          <input
                            id={quantityInputId}
                            name="quantity"
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={decision.quantity}
                            required
                            className="flex h-10 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor={reasonInputId} className="font-sans text-[14px] text-white/70">Reason</label>
                          <textarea
                            id={reasonInputId}
                            name="reason"
                            required
                            placeholder="Provide technical justification for the override..."
                            className="min-h-24 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <DialogFooter className="gap-3">
                          <Button type="button" variant="outline" onClick={() => setIsOverrideOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={overrideMutation.isPending}>
                            {overrideMutation.isPending ? "Submitting..." : "Confirm Override"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </div>
            {!evaluateMutation.isPending ? (
              <div className={cn(
                "font-mono text-[10px] uppercase tracking-[1.4px] text-white/20 transition-opacity duration-200",
                isInputFocused ? "opacity-100" : "opacity-0"
              )}>
                Tab / Enter to accept · ↑ ↓ to move
              </div>
            ) : null}

          </div>

        </CardContent>
      </Card>

      <section className={cn("grid gap-4", compact ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]")}>
        <Card>
          <CardHeader>
            <CardTitle>Signal Decomposition</CardTitle>
            <CardDescription>Streaming reasoning from engine output.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {decision ? (
              <div className="flex flex-col gap-1 border-b border-border pb-6">
                <div className={cn("font-sans text-[24px] font-medium leading-none", actionTone(decision.ai_signal.action))}>
                  {decision.ai_signal.action}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 font-sans text-[13px] text-white/50">
                  <span>{decision.is_approved ? "Approved" : "Blocked"}</span>
                  <span className="text-white/20">·</span>
                  <span>{(decision.ai_signal.confidence_score * 100).toFixed(1)}% confidence</span>
                  <span className="text-white/20">·</span>
                  <span>{formatCurrency(decision.target_price)} target</span>
                  <span className="text-white/20">·</span>
                  <span>qty {formatNumber(decision.quantity, "en-PH", 0)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 border-b border-border pb-6">
                <div className="font-sans text-[24px] font-medium leading-none text-white/10">
                  ---
                </div>
                <div className="font-sans text-[13px] text-white/20">
                  Awaiting signal decomposition...
                </div>
              </div>
            )}

            {decision ? (
              <div className="space-y-4">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Pipeline</p>
                <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[1px]">
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
            ) : null}

            <div className="min-h-[144px] border border-border bg-white/[0.02] p-6">
              {!evaluateMutation.isPending && !decision ? (
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Awaiting evaluation trigger.</p>
              ) : null}

              {evaluateMutation.isPending ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden border border-border/70 bg-white/[0.03]">
                      <div
                        className="h-full bg-white/20 transition-[width] duration-500"
                        style={{ width: `${((activeStageIndex + 1) / evaluationStages.length) * 100}%` }}
                      />
                    </div>
                    <div className="space-y-2 font-mono text-[10px] uppercase tracking-[1.4px]">
                      {evaluationStages.map((stage, index) => {
                        const isVisible = index <= Math.min(activeStageIndex + 1, evaluationStages.length - 1);
                        if (!isVisible) {
                          return null;
                        }

                        const isComplete = index < activeStageIndex;
                        const isActive = index === activeStageIndex;

                        return (
                          <div
                            key={stage}
                            className={cn(
                              "flex items-center justify-between gap-3 border border-white/10 px-3 py-2",
                              isActive ? "text-white" : isComplete ? "text-white/50" : "text-white/30"
                            )}
                          >
                            <span>{isComplete ? "[x]" : isActive ? "[>]" : "[ ]"} {stage}</span>
                            <span className={cn(isActive ? "animate-pulse text-white/50" : "text-white/20")}>{isComplete ? "done" : isActive ? "running" : "queued"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <TerminalSkeleton lines={4} label="ENGINE PIPELINE" />
                </div>
              ) : null}

              {displayedReasoning ? (
                <p className="whitespace-pre-wrap font-mono text-[13px] leading-[1.6] text-white/90">
                  <span className="mr-2 text-white/50">$</span>
                  {highlightReasoning(displayedReasoning)}
                  <span className="ml-1 inline-block h-4 w-2 align-middle bg-white/50 cursor-block" />
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
              <CardDescription>Final output and safety gate verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Ticker</div>
                <div className="font-sans text-[20px] font-medium text-white">{decision?.ticker ?? ticker}</div>
              </div>

              <div className="space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Action</div>
                <div className={cn("font-sans text-[20px] font-medium", actionTone(decision?.action))}>
                  {decision?.action ?? "---"}
                </div>
              </div>

              <div className="space-y-2 border-y border-border py-4">
                <div className="flex items-center gap-2">
                  <div className={cn("size-1.5 rounded-full", decision?.is_approved ? "bg-chart-2" : "bg-destructive")} />
                  <span className="font-sans text-[13px] text-white/70">
                    {decision ? (decision.is_approved ? "Approved by safety gate" : "Blocked by safety gate") : "Awaiting evaluation"}
                  </span>
                </div>
                {decision?.action === "HOLD" && (
                   <div className="font-sans text-[13px] text-white/40">No order submitted</div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between font-sans text-[13px]">
                  <span className="text-white/40">Quantity</span>
                  <span className="text-white/80">{formatNumber(decision?.quantity ?? null, "en-PH", 0)}</span>
                </div>
                <div className="flex justify-between font-sans text-[13px]">
                  <span className="text-white/40">Target</span>
                  <span className="text-white/80">{formatCurrency(decision?.target_price ?? null)}</span>
                </div>
                <div className="space-y-1.5 pt-2">
                  <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Reasoning</span>
                  <p className="font-sans text-[13px] leading-[1.5] text-white/60">
                    {decision?.rule_gate_reasoning ?? "Execute evaluation to populate safety traces."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        {hasTrace ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle>Execution Trace</CardTitle>
                <CardDescription>Structured audit trail returned with the decision.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportTrace} className="font-mono text-[10px] uppercase tracking-[1px]">
                Export JSON
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {decision?.trace?.map((step, index) => {
                const isOpen = openTraceSteps[index] ?? false;

                return (
                  <div key={`${step.title}-${index}`} className="border border-border">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenTraceSteps((s) => ({ ...s, [index]: !isOpen }))
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                        {String(index + 1).padStart(2, "0")} / {step.title}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px]", traceTone(step.status))}>
                          {step.status}
                        </span>
                        <span className="font-mono text-[10px] text-white/30">{isOpen ? "-" : "+"}</span>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="space-y-3 border-t border-border px-4 py-3">
                        <p className="font-sans text-[14px] leading-[1.5] text-white/70">{step.detail}</p>

                        {step.metrics && Object.keys(step.metrics).length ? (
                          <div className="space-y-2 pt-2">
                            {Object.entries(step.metrics).map(([key, value]) => (
                              <div key={key} className="flex justify-between font-mono text-[11px] uppercase tracking-[1px]">
                                <span className="text-white/30">{formatTraceMetricLabel(key)}</span>
                                <span className="text-white/80">{formatTraceMetricValue(key, value)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {hasPortfolioImpact ? (
          <Card>
            <CardHeader>
              <CardTitle>Risk Context</CardTitle>
              <CardDescription>Impact on portfolio allocation and risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(portfolioImpact ?? {}).map(([key, value]) => {
                const label = key.replace(/_/g, " ");
                const formattedValue = typeof value === "number"
                  ? (key.includes("weight") || key.includes("ratio") ? `${(value * 100).toFixed(1)}%` : formatCurrency(value))
                  : String(value);

                return (
                  <div key={key} className="flex items-center justify-between border border-border px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</p>
                    <p className="font-sans text-sm font-medium text-white/90">{formattedValue}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
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
        active ? (highlight ? "text-white font-bold" : "text-white/80") : "text-white/20",
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
  return <div className="text-white/10">→</div>;
}
