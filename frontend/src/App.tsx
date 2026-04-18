import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { Dashboard } from "./features/portfolio/Dashboard";
import { ResearchView } from "./features/research/ResearchView";
import { TradingTerminal } from "./features/trading/TradingTerminal";
import { LandingPage } from "./features/landing/LandingPage";
import { AgentPage } from "./features/agent/AgentPage";
import { LoginPage } from "./features/auth/LoginPage";
import { Toaster } from "sonner";
import { AuthGuard } from "./components/auth/AuthGuard";

const MapPage = lazy(() => import("./features/map/MapPage").then((module) => ({ default: module.MapPage })));

const mapLoadingState = (
    <div className="min-h-dvh border border-white/10 bg-white/[0.03] px-4 py-6 text-white lg:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Loading Map Surface</p>
        <p className="mt-3 font-sans text-[14px] text-white/70">Initializing geospatial workspace.</p>
    </div>
);

function App() {
    return (
        <Router>
            <Shell>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/research" element={<AuthGuard><ResearchView /></AuthGuard>} />
                    <Route path="/portfolio" element={<AuthGuard><Dashboard /></AuthGuard>} />
                    <Route path="/trading" element={<AuthGuard><TradingTerminal /></AuthGuard>} />
                    <Route path="/map" element={<AuthGuard><Suspense fallback={mapLoadingState}><MapPage /></Suspense></AuthGuard>} />
                    <Route path="/agent" element={<AuthGuard><AgentPage /></AuthGuard>} />
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
