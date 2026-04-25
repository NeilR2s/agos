import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatCurrency, formatPercent } from "@/lib/format";
import { APP_OVERLAY_EVENT, type AppOverlayState } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
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

        {!readOnly && !disabled ? (
          <span
            aria-hidden="true"
            className="cursor-block pointer-events-none absolute right-3 top-1/2 block h-4 w-2 -translate-y-1/2 bg-white/30"
          />
        ) : null}
      </div>

      {showHint && !readOnly && !disabled ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
          <span>Use</span>
          <Kbd>Tab</Kbd>
          <span>or</span>
          <Kbd>Enter</Kbd>
          <span>to accept</span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span>to move</span>
        </div>
      ) : null}

      {open && suggestions.length ? (
        <div className="absolute z-30 mt-2 w-full border border-border bg-[#20242b]">
          {suggestions.map((item, index) => {
            const isActive = index === highlightedIndex;

            return (
              <button
                key={item.ticker}
                type="button"
                className={cn(
                  "grid w-full grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-4 px-4 py-3 text-left transition-colors",
                  isActive ? "bg-white/5 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(item);
                }}
              >
                <span className="font-mono text-[12px] uppercase tracking-[1.4px] tabular-nums text-white">{item.ticker}</span>
                <span className="min-w-0 truncate font-sans text-[14px] leading-[1.35] text-white/70">{item.companyName}</span>
                <span className="flex flex-col items-end gap-0.5 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
                  <span>{formatCurrency(item.price)}</span>
                  <span>{formatPercent(item.changePct)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
