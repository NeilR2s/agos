import type { AgentExternalCapability, AgentModelProfileManifest, AgentRunConfig, AgentSkillManifest } from "@/features/agent/types";

export const AGOS_MODEL_PRESETS: AgentModelProfileManifest[] = [
  {
    id: "agos-swift",
    label: "AGOS Swift",
    subtitle: "DeepSeek Flash with low reasoning effort",
    provider: "deepseek",
    model: "DeepSeek-V4-Flash-0731",
    reasoningEffort: "low",
    description: "Low-effort DeepSeek profile for fast routing, light analysis, and quick operator turns.",
  },
  {
    id: "agos-core",
    label: "AGOS Core",
    subtitle: "DeepSeek Flash with high reasoning effort",
    provider: "deepseek",
    model: "DeepSeek-V4-Flash-0731",
    reasoningEffort: "high",
    description: "High-effort DeepSeek profile for default research, synthesis, and portfolio analysis.",
  },
  {
    id: "agos-deep",
    label: "AGOS Deep",
    subtitle: "DeepSeek Flash with max reasoning effort",
    provider: "deepseek",
    model: "DeepSeek-V4-Flash-0731",
    reasoningEffort: "max",
    description: "Max-effort DeepSeek profile for deep multi-agent synthesis and risk-heavy work.",
  },
];

export const AGOS_SKILL_OPTIONS: AgentSkillManifest[] = [
  { id: "research-rigor", label: "Research Rigor", prompt: "Prioritize source quality, timeline accuracy, and explicit evidence separation." },
  { id: "portfolio-context", label: "Portfolio Context", prompt: "Anchor recommendations to the operator's actual exposure when portfolio data is available." },
  { id: "trade-guardrails", label: "Trade Guardrails", prompt: "Treat trade decisions as gated outputs with explicit execution guardrails." },
  { id: "web-investigator", label: "Web Investigator", prompt: "Use external context selectively to fill factual gaps and verify freshness." },
  { id: "quant-scratchpad", label: "Quant Scratchpad", prompt: "Use computation only when it materially improves precision or auditability." },
];

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
  thinkingLevel: "high",
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
