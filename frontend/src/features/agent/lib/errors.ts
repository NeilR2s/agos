const shorten = (value: string, limit = 220) => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 3).trimEnd()}...`;
};

export function humanizeAgentError(error: unknown) {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error && typeof error.message === "string"
          ? error.message
          : "";

  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (lower.includes("gemini_api_key")) {
    return "Configuration error: Gemini API access is not configured on the backend.";
  }

  if (
    lower.includes("include_server_side_tool_invocations") ||
    lower.includes("please enable tool_config") ||
    lower.includes("server-side tool")
  ) {
    return "Configuration error: server-side Gemini tools must be enabled for web search, code interpreter, or URL context.";
  }

  if (lower.includes("stream ended before agos emitted a terminal event")) {
    return "Streaming error: AGOS lost the model response before the run completed.";
  }

  if (lower.includes("request failed with status 401") || lower.includes("stream failed with status 401")) {
    return "Authentication error: AGOS could not authenticate with the backend.";
  }

  if (lower.includes("request failed with status 403") || lower.includes("stream failed with status 403")) {
    return "Authorization error: your session does not have access to this AGOS action.";
  }

  if (lower.includes("request failed with status 404") || lower.includes("stream failed with status 404")) {
    return "Request error: the requested AGOS resource could not be found.";
  }

  if (lower.includes("invalid_argument")) {
    return "Configuration error: AGOS sent an invalid request to the model.";
  }

  return shorten(normalized);
}
