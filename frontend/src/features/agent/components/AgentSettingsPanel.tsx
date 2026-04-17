import { AGOS_MODEL_PRESETS, AGOS_SKILL_OPTIONS } from "@/features/agent/config";
import type { AgentMode, AgentRunConfig } from "@/features/agent/types";
import { cn } from "@/lib/utils";

type AgentSettingsPanelProps = {
  config: AgentRunConfig;
  mode: AgentMode;
  onChange: (next: AgentRunConfig) => void;
};

export function AgentSettingsPanel({ config, mode, onChange }: AgentSettingsPanelProps) {
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
      <section className="space-y-4 border border-white/10 bg-[#1b1f25] p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">AGOS Model</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-white/60">Choose the operator-facing model tier.</p>
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
                  "border border-white/10 px-4 py-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.03]",
                  isSelected && "border-white/20 bg-white/[0.05]"
                )}
              >
                <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-white">{preset.label}</p>
                <p className="mt-2 font-sans text-[13px] leading-[1.6] text-white/60">{preset.subtitle}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 border border-white/10 bg-[#1b1f25] p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Generation</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-white/60">Tune output style, depth, and the worker fan-out.</p>
        </div>

        <label className="space-y-2">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
            <span>Temperature</span>
            <span>{config.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={config.temperature}
            onChange={(event) => update("temperature", Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>

        <label className="space-y-2">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
            <span>Top P</span>
            <span>{config.topP.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={config.topP}
            onChange={(event) => update("topP", Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>

        <label className="space-y-2">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
            <span>Max Agents</span>
            <span>{config.maxAgents}</span>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={config.maxAgents}
            onChange={(event) => update("maxAgents", Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>

        <label className="space-y-2">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
            <span>Output Tokens</span>
            <span>{config.maxOutputTokens}</span>
          </div>
          <input
            type="range"
            min="512"
            max="4096"
            step="256"
            value={config.maxOutputTokens}
            onChange={(event) => update("maxOutputTokens", Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Thinking Level</p>
          <div className="grid grid-cols-2 gap-2">
            {(["minimal", "low", "medium", "high"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => update("thinkingLevel", level)}
                className={cn(
                  "border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60 transition-colors hover:border-white/20 hover:text-white",
                  config.thinkingLevel === level && "border-white/20 bg-white/[0.05] text-white"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 border border-white/10 bg-[#1b1f25] p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Tooling</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-white/60">Mix first-party AGOS tools with Gemini server tools.</p>
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
                "border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60 transition-colors hover:border-white/20 hover:text-white",
                config.tools[tool] && "border-white/20 bg-white/[0.05] text-white",
                tool === "engine" && mode !== "trading" && "cursor-not-allowed opacity-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode !== "trading" ? (
          <p className="font-sans text-[12px] leading-[1.6] text-white/40">Engine tooling is only available in trading mode.</p>
        ) : null}
      </section>

      <section className="space-y-4 border border-white/10 bg-[#1b1f25] p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Skills</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-white/60">Prompt-level AGOS specializations for worker behavior.</p>
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
                  "border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60 transition-colors hover:border-white/20 hover:text-white",
                  active && "border-white/20 bg-white/[0.05] text-white"
                )}
              >
                {skill.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 border border-white/10 bg-[#1b1f25] p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">External Capabilities</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.6] text-white/60">Scaffolded hooks for remote MCPs and custom tools.</p>
        </div>
        <div className="space-y-2">
          {config.externalCapabilities.map((capability) => (
            <button
              key={capability.id}
                type="button"
                onClick={() => toggleCapability(capability.id)}
                className={cn(
                  "w-full border border-white/10 px-4 py-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.03]",
                  capability.enabled && "border-white/20 bg-white/[0.05]"
                )}
              >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{capability.label}</p>
                <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/45">{capability.status}</span>
              </div>
              {capability.description ? <p className="mt-2 font-sans text-[13px] leading-[1.6] text-white/60">{capability.description}</p> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
