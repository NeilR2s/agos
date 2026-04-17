import type { AgentExternalCapability, AgentModelPreset, AgentRunConfig } from "@/features/agent/types";

export const AGOS_MODEL_PRESETS: Array<{
  id: AgentModelPreset;
  label: string;
  subtitle: string;
  backendModel: string;
}> = [
  {
    id: "agos-swift",
    label: "AGOS Swift",
    subtitle: "Fast routing, grounded search, low-latency chat",
    backendModel: "gemini-3.1-flash-lite-preview",
  },
  {
    id: "agos-core",
    label: "AGOS Core",
    subtitle: "Balanced default for research and synthesis",
    backendModel: "gemini-3-flash-preview",
  },
  {
    id: "agos-deep",
    label: "AGOS Deep",
    subtitle: "Highest-depth synthesis and heavier reasoning",
    backendModel: "gemini-3.1-pro-preview",
  },
];

export const AGOS_SKILL_OPTIONS = [
  { id: "research-rigor", label: "Research Rigor" },
  { id: "portfolio-context", label: "Portfolio Context" },
  { id: "trade-guardrails", label: "Trade Guardrails" },
  { id: "web-investigator", label: "Web Investigator" },
  { id: "quant-scratchpad", label: "Quant Scratchpad" },
] as const;

export const AGOS_EXTERNAL_CAPABILITY_TEMPLATES: AgentExternalCapability[] = [
  {
    id: "remote-briefing-bus",
    label: "Remote Briefing MCP",
    kind: "remote_mcp",
    enabled: false,
    status: "planned",
    endpoint: null,
    description: "Reserved slot for a future remote MCP briefing server.",
  },
  {
    id: "custom-valuation-toolkit",
    label: "Custom Valuation Toolkit",
    kind: "custom_tool",
    enabled: false,
    status: "planned",
    endpoint: null,
    description: "Pluggable hook for operator-specific valuation or screening tools.",
  },
];

export const DEFAULT_AGENT_RUN_CONFIG: AgentRunConfig = {
  modelPreset: "agos-core",
  temperature: 0.7,
  topP: 0.95,
  maxOutputTokens: 2048,
  thinkingLevel: "medium",
  maxAgents: 3,
  tools: {
    portfolio: true,
    market: true,
    research: true,
    engine: true,
    webSearch: true,
    codeExecution: false,
    urlContext: true,
  },
  skills: ["research-rigor", "portfolio-context"],
  externalCapabilities: AGOS_EXTERNAL_CAPABILITY_TEMPLATES,
};

export const AGENT_CONFIG_STORAGE_KEY = "agos.agent.run-config.v1";
