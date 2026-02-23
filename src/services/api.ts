const BASE = "/api";

const request = async <T>(path: string, opts?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
};

export const api = {
  cases: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/cases${qs}`);
    },
    get: (id: number) => request(`/cases/${id}`),
    update: (id: number, data: unknown) =>
      request(`/cases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  fees: {
    batch: (caseIds?: number[]) =>
      request("/fees/batch", {
        method: "POST",
        body: JSON.stringify({ case_ids: caseIds }),
      }),
  },
  chronicle: {
    pull: () => request("/chronicle/pull", { method: "POST" }),
  },
  sync: {
    push: (caseIds?: number[]) =>
      request("/sync/push", {
        method: "POST",
        body: JSON.stringify({ case_ids: caseIds }),
      }),
    history: () => request("/sync/history"),
  },
  team: {
    list: () => request("/team-members"),
  },
};
