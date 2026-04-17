import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { engineClient } from "@/api/engine/client"

export function Navbar() {
    const healthQuery = useQuery({
        queryKey: ["engine-health-navbar"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/health", {})
            if (error) throw error
            return data as Record<string, unknown>
        },
        refetchInterval: 30000,
    })

    const versionQuery = useQuery({
        queryKey: ["engine-version-navbar"],
        queryFn: async () => {
            const { data, error } = await engineClient.GET("/api/v1/version", {})
            if (error) throw error
            return data as Record<string, unknown>
        },
        refetchInterval: 30000,
    })

    const status = typeof healthQuery.data?.status === "string"
        ? healthQuery.data.status.toUpperCase()
        : healthQuery.isError
            ? "OFFLINE"
            : "CHECKING"

    const version = typeof versionQuery.data?.version === "string"
        ? versionQuery.data.version
        : "---"

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full border-b border-white/10 p-[24px] flex justify-between items-center bg-[#1f2228] sticky top-0 z-50"
        >
            <div className="font-mono text-xl tracking-[1.4px]">AGOS</div>

            <div className="flex gap-[24px] items-center">
                <Link to="/research" className="font-sans text-[14px] text-white/70 hover:text-white/50 transition-colors">RESEARCH</Link>
                <Link to="/trading" className="font-sans text-[14px] text-white/70 hover:text-white/50 transition-colors">TRADING</Link>
                <Link to="/dashboard" className="font-sans text-[14px] text-white/70 hover:text-white/50 transition-colors">PORTFOLIO</Link>
            </div>

            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                <span>ENGINE:</span>
                <span className="text-white/70">{status}</span>
                <span>v{version}</span>
            </div>
        </motion.nav>
    )
}
