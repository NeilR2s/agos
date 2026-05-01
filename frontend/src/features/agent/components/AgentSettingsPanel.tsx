import { useState } from "react";
import { AGOS_MODEL_PRESETS, AGOS_SKILL_OPTIONS } from "@/features/agent/config";
import type { AgentMode, AgentRunConfig } from "@/features/agent/types";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

type AgentSettingsPanelProps = {
  config: AgentRunConfig;
  mode: AgentMode;
  onChange: (next: AgentRunConfig) => void;
};

export function AgentSettingsPanel({ config, mode, onChange }: AgentSettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = <K extends keyof AgentRunConfig>(key: K, value: AgentRunConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateTool = (tool: keyof AgentRunConfig["tools"], value: boolean) => {
    onChange({ ...config, tools: { ...config.tools, [tool]: value } });
  };

  const toggleSkill = (skillId: string) => {
    onChange({
      ...config,
      skills: config.skills.includes(skillId)
        ? config.skills.filter((item) => item !== skillId)
        : [...config.skills, skillId],
    });
  };

  const toggleCapability = (capabilityId: string) => {
    onChange({
      ...config,
      externalCapabilities: config.externalCapabilities.map((capability) =>
        capability.id === capabilityId ? { ...capability, enabled: !capability.enabled } : capability
      ),
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">AGOS Preset</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-muted-foreground">Choose the operator-facing behavior tier.</p>
        </div>
        <div className="grid gap-3">
          {AGOS_MODEL_PRESETS.map((preset) => {
            const isSelected = config.modelPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => update("modelPreset", preset.id)}
                className={cn(
                  "rounded-2xl border border-border px-4 py-4 text-left transition-colors hover:border-ring/60 hover:bg-accent/70",
                  isSelected && "border-ring/60 bg-accent"
                )}
              >
                <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">{preset.label}</p>
                <p className="mt-2 font-sans text-[13px] leading-[1.6] text-muted-foreground">{preset.subtitle}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Data Tools</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-muted-foreground">Toggle connections to live context.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["portfolio", "Portfolio"],
              ["market", "Market"],
              ["research", "Research"],
              ["engine", "Engine"],
              ["webSearch", "Web Search"],
              ["codeExecution", "Code Interpreter"],
              ["urlContext", "URL Context"],
            ] as Array<[keyof AgentRunConfig["tools"], string]>
          ).map(([tool, label]) => (
            <button
              key={tool}
              type="button"
              onClick={() => updateTool(tool, !config.tools[tool])}
              disabled={tool === "engine" && mode !== "trading"}
              className={cn(
                "rounded-full border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
                config.tools[tool] && "border-ring/60 bg-accent text-foreground",
                tool === "engine" && mode !== "trading" && "cursor-not-allowed opacity-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode !== "trading" ? (
          <p className="font-sans text-[12px] leading-[1.6] text-muted-foreground">Engine tooling is only available in trading mode.</p>
        ) : null}
      </section>

      <button
        type="button"
        aria-expanded={showAdvanced}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-secondary/40 px-5 py-4 hover:bg-accent/70"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Advanced Controls</span>
        {showAdvanced ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>

      {showAdvanced && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-2">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Generation Parameters</p>
            </div>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                <span>Temperature</span>
                <span>{config.temperature.toFixed(2)}</span>
              </div>
              <input
                id="agent-temperature"
                name="temperature"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={config.temperature}
                onChange={(event) => update("temperature", Number(event.target.value))}
                className="w-full [accent-color:var(--primary)]"
              />
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                <span>Top P</span>
                <span>{config.topP.toFixed(2)}</span>
              </div>
              <input
                id="agent-top-p"
                name="topP"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={config.topP}
                onChange={(event) => update("topP", Number(event.target.value))}
                className="w-full [accent-color:var(--primary)]"
              />
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                <span>Max Concurrent Workers</span>
                <span>{config.maxAgents}</span>
              </div>
              <input
                id="agent-max-agents"
                name="maxAgents"
                type="range"
                min="1"
                max="4"
                step="1"
                value={config.maxAgents}
                onChange={(event) => update("maxAgents", Number(event.target.value))}
                className="w-full [accent-color:var(--primary)]"
              />
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                <span>Output Tokens</span>
                <span>{config.maxOutputTokens}</span>
              </div>
              <input
                id="agent-output-tokens"
                name="maxOutputTokens"
                type="range"
                min="512"
                max="7500"
                step="256"
                value={config.maxOutputTokens}
                onChange={(event) => update("maxOutputTokens", Number(event.target.value))}
                className="w-full [accent-color:var(--primary)]"
              />
            </label>

            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Thinking Level</p>
              <div className="grid grid-cols-2 gap-2">
                {(["minimal", "low", "medium", "high"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => update("thinkingLevel", level)}
                    className={cn(
                      "rounded-full border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
                      config.thinkingLevel === level && "border-ring/60 bg-accent text-foreground"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Skills</p>
              <p className="mt-1 font-sans text-[13px] leading-[1.6] text-muted-foreground">Prompt-level specializations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AGOS_SKILL_OPTIONS.map((skill) => {
                const active = config.skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    className={cn(
                      "rounded-full border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
                      active && "border-ring/60 bg-accent text-foreground"
                    )}
                  >
                    {skill.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">External Capabilities</p>
            </div>
            <div className="space-y-2">
              {config.externalCapabilities.map((capability) => (
                <button
                  key={capability.id}
                  type="button"
                  onClick={() => toggleCapability(capability.id)}
                  className={cn(
                    "w-full rounded-2xl border border-border px-4 py-4 text-left transition-colors hover:border-ring/60 hover:bg-accent/70",
                    capability.enabled && "border-ring/60 bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-foreground">{capability.label}</p>
                    <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{capability.status}</span>
                  </div>
                  {capability.description ? <p className="mt-2 font-sans text-[13px] leading-[1.6] text-muted-foreground">{capability.description}</p> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
