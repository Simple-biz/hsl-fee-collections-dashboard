// @vitest-environment jsdom
//
// Verifies the critical invariants of useServerPaginatedFetch:
//   1. No fetch is fired when serverPaginated=false.
//   2. isClosed param is derived from the mode prop, not hard-coded.
//   3. fetchError is set when the server returns a non-ok response.
//   4. fetchLoadedOnce becomes true after a successful response.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useServerPaginatedFetch } from "../useServerPaginatedFetch";

const baseParams = {
  serverPaginated: true,
  mode: "active",
  pageIndex: 0,
  pageSize: 100 as const,
  search: "",
  statusFilter: "all",
  assignedFilter: "all",
  feesConfFilter: "all",
  claimFilter: "all",
  caseStatusFilter: "all",
  levelFilter: "all",
  approverFilter: "all",
  followUpMode: "all" as const,
  followUpDay: "",
  followUpFrom: "",
  followUpTo: "",
  agingFilter: "all" as const,
  dateRange: null,
  sortKey: "createdAt" as const,
  sortDir: "desc" as const,
};

describe("useServerPaginatedFetch", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 1 }], total: 1 }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call fetch when serverPaginated is false", async () => {
    renderHook(() =>
      useServerPaginatedFetch({ ...baseParams, serverPaginated: false }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sets fetchLoadedOnce to true after a successful fetch", async () => {
    const { result } = renderHook(() =>
      useServerPaginatedFetch(baseParams),
    );
    await waitFor(() => expect(result.current.fetchLoadedOnce).toBe(true));
    expect(result.current.fetchedCases).toHaveLength(1);
    expect(result.current.fetchTotal).toBe(1);
  });

  it("passes isClosed=true when mode is 'closed'", async () => {
    renderHook(() =>
      useServerPaginatedFetch({ ...baseParams, mode: "closed" }),
    );
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("isClosed=true"),
        expect.any(Object),
      ),
    );
  });

  it("passes isClosed=false when mode is 'active'", async () => {
    renderHook(() =>
      useServerPaginatedFetch({ ...baseParams, mode: "active" }),
    );
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("isClosed=false"),
        expect.any(Object),
      ),
    );
  });

  it("sets fetchError when the server responds with a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { result } = renderHook(() =>
      useServerPaginatedFetch(baseParams),
    );
    await waitFor(() => expect(result.current.fetchError).toBeTruthy());
    expect(result.current.fetchError).toContain("500");
    expect(result.current.fetchLoading).toBe(false);
  });

  it("re-fetches when setFetchRevision increments", async () => {
    const { result } = renderHook(() =>
      useServerPaginatedFetch(baseParams),
    );
    await waitFor(() => expect(result.current.fetchLoadedOnce).toBe(true));
    const callCountBefore = vi.mocked(fetch).mock.calls.length;
    act(() => result.current.setFetchRevision((n) => n + 1));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callCountBefore),
    );
  });
});
