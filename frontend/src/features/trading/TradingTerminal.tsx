import { useSearchParams } from "react-router-dom";

import { TradeWorkbench } from "@/features/trading/TradeWorkbench";

export const TradingTerminal = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const ticker = (searchParams.get("ticker") ?? "TEL").toUpperCase();

    return (
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8 md:px-8 md:py-12">
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
    );
};
