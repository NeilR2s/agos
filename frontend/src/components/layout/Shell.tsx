import { Suspense, lazy, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bars3Icon, CommandLineIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { publishOverlayState } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const CommandPalette = lazy(() => import("@/components/layout/CommandPalette").then((module) => ({ default: module.CommandPalette })));
const Sidebar = lazy(() => import("@/components/layout/Sidebar").then((module) => ({ default: module.Sidebar })));

const sidebarFallback = <div className="h-full border-r border-sidebar-border bg-sidebar" />;

export const Shell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isAgentRoute = location.pathname === "/agent" || location.pathname.startsWith("/agent/");
  const { user, token, isLoading, isDevBypass } = useAuthStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const stored = window.localStorage.getItem("agos.shell.sidebar-expanded.v1");
    if (stored === "1") return true;
    if (stored === "0") return false;
    return location.pathname === "/agent" || location.pathname.startsWith("/agent/");
  });
  const isPublicRoute = location.pathname === "/" || location.pathname === "/login";
  const isLoginRoute = location.pathname === "/login";
  const hasAuthenticatedSession = Boolean(user || token || isDevBypass);
  const showProtectedShell = !isPublicRoute && !isLoading && hasAuthenticatedSession;
  const canUseCommandPalette = !isLoginRoute && showProtectedShell;
  const desktopSidebarWidth = showProtectedShell ? (sidebarExpanded ? (isAgentRoute ? 320 : 164) : 72) : 0;

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
    if (!canUseCommandPalette) {
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
  }, [canUseCommandPalette]);

  useEffect(() => {
    if (canUseCommandPalette) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPaletteOpen(false);
      setMobileNavOpen(false);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [canUseCommandPalette]);

  useEffect(() => {
    publishOverlayState({ commandPaletteOpen: paletteOpen });
  }, [paletteOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("agos.shell.sidebar-expanded.v1", sidebarExpanded ? "1" : "0");
  }, [sidebarExpanded]);

  const protectedMainStyle = showProtectedShell
    ? ({ "--agos-shell-sidebar-width": `${desktopSidebarWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      {showProtectedShell ? (
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md lg:hidden">
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

      {showProtectedShell ? (
        <aside
          className="fixed inset-y-0 left-0 z-40 hidden overflow-hidden border-r border-sidebar-border bg-sidebar/95 transition-[width] duration-200 lg:block"
          style={{ width: desktopSidebarWidth }}
        >
          <Suspense fallback={sidebarFallback}>
            <Sidebar
              onOpenPalette={() => setPaletteOpen(true)}
              onNavigate={() => setMobileNavOpen(false)}
              onToggleExpanded={() => setSidebarExpanded((current) => !current)}
              showLabels={sidebarExpanded}
              isAgentMode={isAgentRoute}
            />
          </Suspense>
        </aside>
      ) : null}

      <main className={cn("relative min-h-dvh", showProtectedShell && "lg:pl-[var(--agos-shell-sidebar-width)]")} style={protectedMainStyle}>
        {children}
      </main>

      {canUseCommandPalette && paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      ) : null}

      {showProtectedShell ? (
        <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DrawerContent side="left" className="max-w-[320px] p-0 lg:hidden">
            <DrawerTitle className="sr-only">Navigation</DrawerTitle>
            <DrawerDescription className="sr-only">Primary AGOS workspace navigation.</DrawerDescription>
            <Suspense fallback={sidebarFallback}>
              <Sidebar
                onOpenPalette={() => {
                  setMobileNavOpen(false);
                  setPaletteOpen(true);
                }}
                onNavigate={() => setMobileNavOpen(false)}
                showLabels
                isAgentMode={isAgentRoute}
                className="w-full px-4 py-4"
              />
            </Suspense>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
};
