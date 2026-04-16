import * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center justify-center border border-border bg-white/[0.03] px-1.5 font-mono text-[10px] uppercase tracking-[1.4px] text-white",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
