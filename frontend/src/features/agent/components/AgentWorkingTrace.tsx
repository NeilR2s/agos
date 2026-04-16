import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Globe, Search, Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSSEEvent } from "@/features/agent/types";

type AgentWorkingTraceProps = {
  events: AgentSSEEvent[];
  isStreaming: boolean;
};

export function AgentWorkingTrace({ events, isStreaming }: AgentWorkingTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Parse events into actions
  const actions = events.filter(e => 
    e.type === "tool.started" || e.type === "reasoning.step" || e.type === "tool.completed"
  );

  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedStr = isStreaming ? `${elapsedSec}S` : "";

  const getActionLabel = (action: AgentSSEEvent) => {
    const data = action.data as Record<string, unknown>;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.name === "string") return data.name;
    if (typeof data.title === "string") return data.title;
    return "Processing...";
  };

  const getActionSummary = (action: AgentSSEEvent) => {
    const data = action.data as Record<string, unknown>;
    return typeof data.summary === "string" ? data.summary : null;
  };

  if (!isStreaming && actions.length === 0) return null;

  return (
    <div className="my-4 rounded-xl border border-white/10 bg-[#15171b] overflow-hidden">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-sans font-medium text-white/90 text-sm">
            {isStreaming ? "Agents Working" : "Run Completed"}
          </span>
          <span className="font-mono text-[10px] text-white/40 tracking-wider">
            · AGOS · {elapsedStr}
          </span>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
      </button>

      {isStreaming && !isExpanded && (
        <div className="px-4 pb-4 overflow-hidden h-6 flex items-center">
          <span className="font-mono text-xs text-orange-500/80 cursor-block">:::::::::::::::::::::::</span>
          <span className="font-mono text-xs text-white/20">..................................</span>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
          {actions.map((action, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <div className="mt-1">
                {action.type === "reasoning.step" ? (
                  <Brain className="w-4 h-4 text-white/40" />
                ) : action.type === "tool.started" ? (
                  <Globe className="w-4 h-4 text-white/40" />
                ) : (
                  <Search className="w-4 h-4 text-white/40" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className={cn(
                  "font-sans text-sm",
                  action.type === "tool.started" ? "font-medium text-white/90" : "text-white/60"
                )}>
                  {getActionLabel(action)}
                </span>
                {getActionSummary(action) && (
                  <span className="font-sans text-sm text-white/40">
                    {getActionSummary(action)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
              <span className="font-sans text-sm text-white/40">Thinking...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
