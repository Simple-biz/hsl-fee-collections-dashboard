// @vitest-environment jsdom
//
// Verifies the critical invariants of useFeeRecordsFilters:
//   1. hasActiveFilters correctly detects any active filter, including agingFilter.
//   2. clearFilters resets all filter state and calls onClearSort.
//   3. Page-reset fires when any filter changes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import { useFeeRecordsFilters } from "../useFeeRecordsFilters";

const makeSearchParams = (entries: Record<string, string> = {}) => {
  const p = new URLSearchParams(entries);
  return {
    get: (k: string) => p.get(k),
  } as unknown as import("next/navigation").ReadonlyURLSearchParams;
};

const baseProps = {
  searchParams: makeSearchParams(),
  sortKey: "createdAt" as const,
  sortDir: "desc" as const,
  pageSize: 100 as const,
  defaultSortKey: "createdAt" as const,
  dateRange: null,
  agingFilter: "all" as const,
  setPageIndex: vi.fn(),
  onClearSort: vi.fn(),
};

describe("useFeeRecordsFilters — hasActiveFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is false when all filters are at defaults", () => {
    const { result } = renderHook(() => useFeeRecordsFilters(baseProps));
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("is true when search is non-empty", () => {
    const { result } = renderHook(() =>
      useFeeRecordsFilters({
        ...baseProps,
        searchParams: makeSearchParams({ q: "smith" }),
      }),
    );
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("is true when agingFilter is not 'all'", () => {
    const { result } = renderHook(() =>
      useFeeRecordsFilters({
        ...baseProps,
        agingFilter: "unpaid_60",
      }),
    );
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("is true when dateRange is set", () => {
    const { result } = renderHook(() =>
      useFeeRecordsFilters({
        ...baseProps,
        dateRange: { from: "2026-01-01", to: "2026-06-30" },
      }),
    );
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("is true when statusFilter is changed after init", () => {
    const { result } = renderHook(() => useFeeRecordsFilters(baseProps));
    act(() => result.current.setStatusFilter("approved"));
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("is true when levelFilter is changed after init", () => {
    const { result } = renderHook(() => useFeeRecordsFilters(baseProps));
    act(() => result.current.setLevelFilter("Level 1"));
    expect(result.current.hasActiveFilters).toBe(true);
  });
});

describe("useFeeRecordsFilters — clearFilters", () => {
  it("resets all filter state to defaults", () => {
    const { result } = renderHook(() =>
      useFeeRecordsFilters({
        ...baseProps,
        searchParams: makeSearchParams({ q: "jones", status: "approved" }),
      }),
    );
    act(() => result.current.clearFilters());
    expect(result.current.search).toBe("");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.assignedFilter).toBe("all");
    expect(result.current.feesConfFilter).toBe("all");
    expect(result.current.claimFilter).toBe("all");
    expect(result.current.caseStatusFilter).toBe("all");
    expect(result.current.levelFilter).toBe("all");
    expect(result.current.approverFilter).toBe("all");
    expect(result.current.followUpMode).toBe("all");
    expect(result.current.followUpDay).toBe("");
    expect(result.current.followUpFrom).toBe("");
    expect(result.current.followUpTo).toBe("");
  });

  it("calls onClearSort when clearFilters is called", () => {
    const onClearSort = vi.fn();
    const { result } = renderHook(() =>
      useFeeRecordsFilters({ ...baseProps, onClearSort }),
    );
    act(() => result.current.clearFilters());
    expect(onClearSort).toHaveBeenCalledOnce();
  });
});

describe("useFeeRecordsFilters — page reset on filter change", () => {
  it("calls setPageIndex(0) when a filter setter is invoked", () => {
    const setPageIndex = vi.fn();
    const { result } = renderHook(() =>
      useFeeRecordsFilters({ ...baseProps, setPageIndex }),
    );
    act(() => result.current.setAssignedFilter("Alice"));
    expect(setPageIndex).toHaveBeenCalledWith(0);
  });
});
