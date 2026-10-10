import type { Observation, ObservationCreate } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body || `Request failed (${response.status})`;
    try {
      const payload: unknown = JSON.parse(body);
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string"
      ) {
        message = payload.detail;
      }
    } catch {
      // Keep the response text when the server does not return JSON.
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const observationsApi = {
  list: () => request<Observation[]>("/observations"),
  get: (id: string) => request<Observation>(`/observations/${id}`),
  create: (payload: ObservationCreate) =>
    request<Observation>("/observations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
