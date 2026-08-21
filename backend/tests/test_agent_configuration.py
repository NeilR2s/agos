from app.models.agent import AgentRunConfig
from app.services.agent.configuration import build_agent_config_manifest, config_to_public_dict, list_model_profiles, resolve_model_profile


def test_all_model_profiles_resolve_to_deepseek_with_distinct_reasoning_effort():
    profiles = list_model_profiles()

    assert [profile.id for profile in profiles] == ["agos-swift", "agos-core", "agos-deep"]
    assert {profile.model for profile in profiles} == {"DeepSeek-V4-Flash-0731"}
    assert {profile.provider for profile in profiles} == {"deepseek"}
    assert [profile.reasoningEffort for profile in profiles] == ["low", "high", "max"]


def test_config_public_dict_exposes_resolved_profile_metadata():
    payload = config_to_public_dict(AgentRunConfig(modelPreset="agos-deep"))

    assert payload["model"] == "DeepSeek-V4-Flash-0731"
    assert payload["modelProvider"] == "deepseek"
    assert payload["modelLabel"] == "AGOS Deep"
    assert payload["reasoningEffort"] == "max"
    assert payload["thinkingLevel"] == "max"


def test_agent_config_manifest_exposes_profiles_skills_and_defaults():
    manifest = build_agent_config_manifest()

    assert manifest.defaultConfig.modelPreset == "agos-core"
    assert manifest.defaultConfig.thinkingLevel == "high"
    assert len(manifest.modelProfiles) == 3
    assert any(skill.id == "research-rigor" for skill in manifest.skillOptions)


def test_legacy_thinking_levels_are_normalized():
    assert AgentRunConfig(thinkingLevel="minimal").thinkingLevel == "low"
    assert AgentRunConfig(thinkingLevel="medium").thinkingLevel == "high"
    assert resolve_model_profile(AgentRunConfig(modelPreset="agos-swift")).reasoning_effort == "low"
