import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { Dashboard } from "./features/portfolio/Dashboard";
import { ResearchView } from "./features/research/ResearchView";
import { TradingTerminal } from "./features/trading/TradingTerminal";
import { LandingPage } from "./features/landing/LandingPage";
import { AgentPage } from "./features/agent/AgentPage";
import { Toaster } from "sonner";
import { AuthGuard } from "./components/auth/AuthGuard";

function App() {
    return (
        <Router>
            <Shell>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/research" element={<AuthGuard><ResearchView /></AuthGuard>} />
                    <Route path="/portfolio" element={<AuthGuard><Dashboard /></AuthGuard>} />
                    <Route path="/trading" element={<AuthGuard><TradingTerminal /></AuthGuard>} />
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
