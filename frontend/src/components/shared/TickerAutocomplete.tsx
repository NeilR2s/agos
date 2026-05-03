import { useEffect, useId, useMemo, useRef, useState } from "react";

import { APP_OVERLAY_EVENT, type AppOverlayState } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useTickerCatalog, type TickerCatalogItem } from "@/hooks/useTickerCatalog";

type TickerAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: TickerCatalogItem) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  readOnly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  showHint?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
};

export function TickerAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = "TEL",
  className,
  inputClassName,
  readOnly,
  disabled,
  autoFocus,
  showHint = true,
  id,
  name,
  ariaLabel = "Ticker",
}: TickerAutocompleteProps) {
  const { items } = useTickerCatalog();
  const generatedId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = id ?? `ticker-${generatedId}`;

  const normalized = value.trim().toUpperCase();

  const suggestions = useMemo(() => {
    const query = normalized;

    if (!query) {
      return items.slice(0, 6);
    }

    return items
      .filter((item) => {
        const company = item.companyName.toUpperCase();
        return item.ticker.includes(query) || company.includes(query);
      })
      .slice(0, 6);
  }, [items, normalized]);

  const activeItem = suggestions[Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))];

  const commit = (item: TickerCatalogItem) => {
    onChange(item.ticker);
    onSelect?.(item);
    setOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.blur();
  };

  useEffect(() => {
    const handleOverlayState = (event: Event) => {
      const detail = (event as CustomEvent<AppOverlayState>).detail;
      if (!detail?.commandPaletteOpen) {
        return;
      }

      setOpen(false);
      setHighlightedIndex(0);
      inputRef.current?.blur();
    };

    window.addEventListener(APP_OVERLAY_EVENT, handleOverlayState);
    return () => window.removeEventListener(APP_OVERLAY_EVENT, handleOverlayState);
  }, []);

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          name={name ?? inputId}
          aria-label={ariaLabel}
          value={value}
          autoFocus={autoFocus}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "pr-12 font-mono uppercase tracking-[1.4px] tabular-nums",
            readOnly ? "cursor-not-allowed text-white/70" : "",
            inputClassName
          )}
          onFocus={() => {
            if (!readOnly && !disabled) {
              setHighlightedIndex(0);
              setOpen(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            onChange(next);

            if (!readOnly && !disabled) {
              setHighlightedIndex(0);
              setOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (readOnly || disabled) {
              return;
            }

            if (event.key === "ArrowDown" && suggestions.length) {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1));
              return;
            }

            if (event.key === "ArrowUp" && suggestions.length) {
              event.preventDefault();
              setHighlightedIndex((index) => Math.max(index - 1, 0));
              return;
            }

            if (normalized && (event.key === "Enter" || event.key === "Tab") && activeItem && activeItem.ticker !== normalized) {
              event.preventDefault();
              commit(activeItem);
            }

            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>

      {showHint && !readOnly && !disabled ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 font-sans text-[11px] text-white/40">
          <span>Press Enter to select a ticker.</span>
        </div>
      ) : null}

      {open && suggestions.length ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-none border border-border/50 bg-background shadow-2xl">
          {suggestions.map((item, index) => {
            const isActive = index === highlightedIndex;

            return (
              <button
                key={item.ticker}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                  isActive ? "bg-white/[0.05] text-foreground" : "text-muted-foreground hover:bg-white/[0.02] hover:text-foreground"
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(item);
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm uppercase tracking-[1.4px] tabular-nums text-foreground shrink-0 w-[4.5rem]">{item.ticker}</span>
                    <span className="min-w-0 truncate font-sans text-[13px] text-white/50">{item.companyName}</span>
                </div>
                {/* <span className="flex flex-col items-end gap-0.5 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 shrink-0">
                  <span>{formatCurrency(item.price)}</span>
                  <span className={cn(item.changePct && item.changePct > 0 ? "text-chart-2/70" : item.changePct && item.changePct < 0 ? "text-destructive/70" : "")}>
                    {formatPercent(item.changePct)}
                  </span>
                </span> */}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
