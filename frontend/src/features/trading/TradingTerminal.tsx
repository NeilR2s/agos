import { useSearchParams } from "react-router-dom";

import { TradeWorkbench } from "@/features/trading/TradeWorkbench";

export const TradingTerminal = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const ticker = (searchParams.get("ticker") ?? "TEL").toUpperCase();

    return (
        <div className="min-h-dvh bg-[#030303] text-foreground">
            <div className="mx-auto w-full max-w-[1440px] px-6 py-10 md:px-10 md:py-16">
                <TradeWorkbench
                    ticker={ticker}
                    onTickerChange={(nextTicker) => {
                        const next = new URLSearchParams(searchParams);
                        next.set("ticker", nextTicker.toUpperCase());
                        setSearchParams(next, { replace: true });
                    }}
                    showHeader
                />
            </div>
        </div>
    );
};
