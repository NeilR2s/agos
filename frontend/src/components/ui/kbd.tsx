import * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center justify-center border border-border bg-secondary/70 px-1.5 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
