import createClient from "openapi-fetch";
import type { paths } from "./types";
import { useAuthStore } from "../../store/authStore";
import type {
  AgentEvent,
  AgentMessage,
  AgentRun,
  AgentRunRequest,
  AgentRunResult,
  AgentThread,
  AgentThreadCreateRequest,
} from "../../features/agent/types";
import type { MapBounds, MapFeatureCollection, MapPlaceSearchResult } from "../../features/map/types";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export const backendClient = createClient<paths>({
  baseUrl: backendUrl,
});

backendClient.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().token;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  }
});

export const getUserId = () => {
  const user = useAuthStore.getState().user;
  if (!user?.uid) {
    throw new Error("Authenticated user is unavailable");
  }
  return user.uid;
};

const buildAuthHeaders = (headers?: HeadersInit) => {
  const next = new Headers(headers);
  const token = useAuthStore.getState().token;
  if (token) {
    next.set("Authorization", `Bearer ${token}`);
  }
  return next;
};

async function backendJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildAuthHeaders(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      const text = await response.text();
      if (text) detail = text;
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const agentApi = {
  createThread(body: AgentThreadCreateRequest) {
    return backendJson<AgentThread>("/api/v1/agent/threads", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  listThreads() {
    return backendJson<AgentThread[]>("/api/v1/agent/threads");
  },

  async deleteThread(threadId: string) {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${backendUrl}/api/v1/agent/threads/${threadId}`, {
      method: "DELETE",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!response.ok) throw new Error("Failed to delete thread");
  },

  getThread(threadId: string) {
    return backendJson<AgentThread>(`/api/v1/agent/threads/${threadId}`);
  },

  listMessages(threadId: string) {
    return backendJson<AgentMessage[]>(`/api/v1/agent/threads/${threadId}/messages`);
  },

  listRuns(threadId: string) {
    return backendJson<AgentRun[]>(`/api/v1/agent/threads/${threadId}/runs`);
  },

  getRun(threadId: string, runId: string) {
    return backendJson<AgentRun>(`/api/v1/agent/threads/${threadId}/runs/${runId}`);
  },

  cancelRun(threadId: string, runId: string) {
    return backendJson<AgentRun>(`/api/v1/agent/threads/${threadId}/runs/${runId}/cancel`, {
      method: "POST",
    });
  },

  getRunEvents(threadId: string, runId: string, limit = 2000) {
    const params = new URLSearchParams({ limit: String(limit) });
    return backendJson<AgentEvent[]>(`/api/v1/agent/threads/${threadId}/runs/${runId}/events?${params.toString()}`);
  },

  createRun(threadId: string, body: AgentRunRequest) {
    return backendJson<AgentRunResult>(`/api/v1/agent/threads/${threadId}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async streamRun(threadId: string, body: AgentRunRequest, signal?: AbortSignal) {
    const headers = buildAuthHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${backendUrl}/api/v1/agent/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      let detail = `Stream failed with status ${response.status}`;
      try {
        const payload = await response.json();
        if (typeof payload?.detail === "string") {
          detail = payload.detail;
        }
      } catch {
        const text = await response.text();
        if (text) detail = text;
      }
      throw new Error(detail);
    }

    return response;
  },
};

export const mapApi = {
  getFeatures(bounds: MapBounds, search = "") {
    const params = new URLSearchParams({
      west: bounds.west.toString(),
      south: bounds.south.toString(),
      east: bounds.east.toString(),
      north: bounds.north.toString(),
      search,
    });

    return backendJson<MapFeatureCollection>(`/api/v1/map/features?${params.toString()}`);
  },

  queryPolygon(polygon: [number, number][], search = "") {
    return backendJson<MapFeatureCollection>("/api/v1/map/query", {
      method: "POST",
      body: JSON.stringify({ polygon, search }),
    });
  },

  async searchPlaces(query: string, limit = 5) {
    const params = new URLSearchParams({ query, limit: limit.toString() });
    const response = await backendJson<{ results: MapPlaceSearchResult[] }>(`/api/v1/map/search?${params.toString()}`);
    return response.results;
  },
};
