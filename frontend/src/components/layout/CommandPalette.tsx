import { useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  CommandLineIcon,
  GlobeAltIcon,
  HomeIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useTickerCatalog } from "@/hooks/useTickerCatalog";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PaletteAction = {
  id: string;
  group: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 bg-[#20242b] p-0 shadow-none sm:max-w-[760px]">
        <CommandPaletteContent onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { items } = useTickerCatalog();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo<PaletteAction[]>(() => {
    const normalized = query.trim().toUpperCase();

    const navigation: PaletteAction[] = [
      {
        id: "nav-research",
        group: "Navigation",
        label: "Go to Research",
        description: "Open the market research terminal.",
        icon: MagnifyingGlassIcon,
        onSelect: () => navigate("/research"),
      },
      {
        id: "nav-portfolio",
        group: "Navigation",
        label: "Go to Portfolio",
        description: "Open the holdings control surface.",
        icon: BriefcaseIcon,
        onSelect: () => navigate("/portfolio"),
      },
      {
        id: "nav-trading",
        group: "Navigation",
        label: "Go to Trading Engine",
        description: "Open the decision engine workspace.",
        icon: CommandLineIcon,
        onSelect: () => navigate("/trading"),
      },
      {
        id: "nav-agent",
        group: "Navigation",
        label: "Go to Agent",
        description: "Open the AGOS copilot console.",
        icon: ChatBubbleLeftRightIcon,
        onSelect: () => navigate("/agent"),
      },
      {
        id: "nav-map",
        group: "Navigation",
        label: "Go to Map",
        description: "Open the geospatial operations workspace.",
        icon: GlobeAltIcon,
        onSelect: () => navigate("/map"),
      },
      {
        id: "nav-landing",
        group: "Navigation",
        label: "Go to Landing",
        description: "Return to the AGOS entry point.",
        icon: HomeIcon,
        onSelect: () => navigate("/"),
      },
    ].filter((item) => {
      if (!normalized) return true;
      const haystack = `${item.label} ${item.description}`.toUpperCase();
      return haystack.includes(normalized);
    });

    if (!normalized) {
      return navigation;
    }

    const tickerMatches = items
      .filter((item) => {
        const company = item.companyName.toUpperCase();
        return item.ticker.includes(normalized) || company.includes(normalized);
      })
      .slice(0, 5);

    const tickerActions: PaletteAction[] = tickerMatches.flatMap((item) => [
      {
        id: `research-${item.ticker}`,
        group: "Tickers",
        label: `Research: View ${item.ticker} Market Data`,
        description: item.companyName,
        icon: MagnifyingGlassIcon,
        onSelect: () => navigate(`/research?ticker=${item.ticker}`),
      },
      {
        id: `trade-${item.ticker}`,
        group: "Tickers",
        label: `Trade: Evaluate ${item.ticker}`,
        description: "Open the right-hand analysis drawer.",
        icon: CommandLineIcon,
        onSelect: () => navigate(`/research?ticker=${item.ticker}&drawer=trade`),
      },
      {
        id: `agent-${item.ticker}`,
        group: "Tickers",
        label: `Agent: Ask about ${item.ticker}`,
        description: "Open AGOS with the ticker preloaded.",
        icon: ChatBubbleLeftRightIcon,
        onSelect: () => navigate(`/agent?ticker=${item.ticker}&mode=research`),
      },
      {
        id: `portfolio-${item.ticker}`,
        group: "Tickers",
        label: `Portfolio: Add ${item.ticker} Holding`,
        description: "Open the add-holding form prefilled.",
        icon: BriefcaseIcon,
        onSelect: () => navigate(`/portfolio?add=${item.ticker}`),
      },
    ]);

    return [...navigation, ...tickerActions];
  }, [items, navigate, query]);

  const activeAction = actions[Math.min(activeIndex, Math.max(actions.length - 1, 0))];

  return (
    <>
      <div className="border-b border-white/10 px-4 py-4">
        <DialogHeader className="space-y-0 text-left">
          <DialogTitle className="sr-only">Command Palette</DialogTitle>
          <DialogDescription className="sr-only">Keyboard-first navigation and ticker search.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <label htmlFor="command-palette-query" className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">CMD</label>
          <Input
            id="command-palette-query"
            name="command-palette-query"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.toUpperCase());
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && actions.length) {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, actions.length - 1));
              }

              if (event.key === "ArrowUp" && actions.length) {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }

              if (event.key === "Enter" && activeAction) {
                event.preventDefault();
                activeAction.onSelect();
                onOpenChange(false);
              }

              if (event.key === "Escape") {
                onOpenChange(false);
              }
            }}
            placeholder="Type a ticker or command"
            autoComplete="off"
            spellCheck={false}
            className="border-0 bg-transparent p-0 font-mono text-[14px] uppercase tracking-[1.4px] text-white placeholder:text-white/20 focus-visible:ring-0"
          />
          <span className="cursor-block font-mono text-white/40">█</span>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {actions.length ? (
          actions.map((action, index) => {
            const isActive = index === activeIndex;
            const Icon = action.icon;
            const previousGroup = actions[index - 1]?.group;
            const showGroup = action.group !== previousGroup;

            return (
              <div key={action.id} className="space-y-1">
                {showGroup ? <p className="px-2 pt-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">{action.group}</p> : null}
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-2 py-3 text-left transition-colors",
                    isActive ? "bg-white/5 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    action.onSelect();
                    onOpenChange(false);
                  }}
                >
                  <Icon className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[14px] leading-[1.4]">{action.label}</p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">{action.description}</p>
                  </div>
                </button>
              </div>
            );
          })
        ) : (
          <div className="px-2 py-8 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">NO MATCHES</div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
        <span className="flex items-center gap-2">
          <Kbd>Enter</Kbd>
          <span>to run</span>
        </span>
        <span className="flex items-center gap-2">
          <Kbd>Tab</Kbd>
          <span>for tickers</span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </span>
      </div>
    </>
  );
}
