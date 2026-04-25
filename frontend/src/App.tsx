import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { LandingPage } from "./features/landing/LandingPage";
import { LoginPage } from "./features/auth/LoginPage";
import { Toaster } from "sonner";
import { AuthGuard } from "./components/auth/AuthGuard";

const ResearchView = lazy(() => import("./features/research/ResearchView").then((module) => ({ default: module.ResearchView })));
const Dashboard = lazy(() => import("./features/portfolio/Dashboard").then((module) => ({ default: module.Dashboard })));
const TradingTerminal = lazy(() => import("./features/trading/TradingTerminal").then((module) => ({ default: module.TradingTerminal })));
const AgentPage = lazy(() => import("./features/agent/AgentPage").then((module) => ({ default: module.AgentPage })));
const MapPage = lazy(() => import("./features/map/MapPage").then((module) => ({ default: module.MapPage })));

const protectedLoadingState = (
    <div className="min-h-dvh border border-white/10 bg-white/[0.03] px-4 py-6 text-white lg:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">Loading Workspace</p>
        <p className="mt-3 font-sans text-[14px] text-white/70">Initializing AGOS surface.</p>
    </div>
);

const withProtectedSuspense = (children: ReactNode) => (
    <AuthGuard>
        <Suspense fallback={protectedLoadingState}>{children}</Suspense>
    </AuthGuard>
);

function App() {
    return (
        <Router>
            <Shell>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/research" element={withProtectedSuspense(<ResearchView />)} />
                    <Route path="/portfolio" element={withProtectedSuspense(<Dashboard />)} />
                    <Route path="/trading" element={withProtectedSuspense(<TradingTerminal />)} />
                    <Route path="/map" element={withProtectedSuspense(<MapPage />)} />
                    <Route path="/agent" element={withProtectedSuspense(<AgentPage />)} />
                </Routes>
            </Shell>
            <Toaster theme="dark" position="bottom-right" toastOptions={{
                style: {
                    background: '#1f2228',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    borderRadius: '0px',
                    fontFamily: 'Geist Mono Variable, monospace'
                }
            }} />
        </Router>
    );
}

export default App;
