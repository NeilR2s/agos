import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bars3Icon, CommandLineIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import { publishOverlayState } from "@/lib/overlay";
import { cn } from "@/lib/utils";

export const Shell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isPublicRoute = location.pathname === "/" || location.pathname === "/login";
  const isLoginRoute = location.pathname === "/login";

  useEffect(() => {
    if (!isLoginRoute) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPaletteOpen(false);
      setMobileNavOpen(false);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setMobileNavOpen(false);
        setPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isLoginRoute]);

  useEffect(() => {
    publishOverlayState({ commandPaletteOpen: paletteOpen });
  }, [paletteOpen]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {!isPublicRoute ? (
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
          <Link to="/" className="font-mono text-[14px] uppercase tracking-[1.4px] text-white">
            AGOS
          </Link>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setMobileNavOpen(false);
                setPaletteOpen(true);
              }}
              className="text-white/40 hover:text-white"
              aria-label="Open command palette"
            >
              <CommandLineIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setPaletteOpen(false);
                setMobileNavOpen(true);
              }}
              className="text-white/40 hover:text-white"
              aria-label="Open navigation"
            >
              <Bars3Icon className="size-4" />
            </Button>
          </div>
        </header>
      ) : null}

      {!isPublicRoute ? (
        <aside className="group/sidebar fixed inset-y-0 left-0 z-40 hidden w-[72px] overflow-hidden border-r border-border bg-background transition-[width] duration-200 hover:w-[240px] focus-within:w-[240px] lg:block">
          <Sidebar onOpenPalette={() => setPaletteOpen(true)} onNavigate={() => setMobileNavOpen(false)} />
        </aside>
      ) : null}

      <main className={cn("min-h-dvh", !isPublicRoute && "lg:pl-[72px]")}>
        {children}
      </main>

      {!isLoginRoute ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}

      {!isPublicRoute ? (
        <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DrawerContent side="left" className="max-w-[320px] p-0 lg:hidden">
            <Sidebar
              onOpenPalette={() => {
                setMobileNavOpen(false);
                setPaletteOpen(true);
              }}
              onNavigate={() => setMobileNavOpen(false)}
              showLabels
              className="w-full px-4 py-4"
            />
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
};
