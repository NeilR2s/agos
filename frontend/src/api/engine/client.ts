import createClient from "openapi-fetch";
import type { paths } from "./types";
import { useAuthStore } from "../../store/authStore";

const engineUrl = import.meta.env.VITE_ENGINE_URL || "http://localhost:5000";

export const engineClient = createClient<paths>({
  baseUrl: engineUrl,
});

engineClient.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().token;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  }
});
