// @vitest-environment jsdom
//
// Verifies the critical invariants of useBulkActions:
//   1. Handlers guard against empty selection (no-op).
//   2. Optimistic rowOverrides are applied on success.
//   3. Error state is set on server failure; saving flag resets.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// vi.hoisted ensures these are initialized before vi.mock factories run
// (vi.mock calls are hoisted to the top of the file by Vitest's transformer).
const {
  mockBulkReassign,
  mockBulkMarkOverpaid,
  mockBulkAddToFeePetitions,
  mockSkippedClosedCasesMessage,
} = vi.hoisted(() => ({
  mockBulkReassign: vi.fn(),
  mockBulkMarkOverpaid: vi.fn(),
  mockBulkAddToFeePetitions: vi.fn(),
  mockSkippedClosedCasesMessage: vi.fn(() => "1 case skipped"),
}));

vi.mock("@/app/(dashboard)/master-fees/actions", () => ({
  bulkReassign: (...args: unknown[]) => mockBulkReassign(...args),
  bulkAddToFeePetitions: (...args: unknown[]) => mockBulkAddToFeePetitions(...args),
}));

vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkOverpaid: (...args: unknown[]) => mockBulkMarkOverpaid(...args),
}));

vi.mock("@/lib/formatters", () => ({
  skippedClosedCasesMessage: mockSkippedClosedCasesMessage,
}));

import { useBulkActions } from "../useBulkActions";

const makeProps = (overrides: Partial<Parameters<typeof useBulkActions>[0]> = {}) => {
  const setSelectedIds = vi.fn();
  const setRowOverrides = vi.fn();
  return {
    selectedIds: new Set<number>([1, 2]),
    setSelectedIds,
    setRowOverrides,
    mode: "active",
    ...overrides,
  };
};

describe("useBulkActions — handleBatchArchive", () => {
  it("does nothing when selectedIds is empty", () => {
    const props = makeProps({ selectedIds: new Set() });
    const { result } = renderHook(() => useBulkActions(props));
    act(() => result.current.handleBatchArchive());
    expect(result.current.archiveConfirmOpen).toBe(false);
  });

  it("opens archive dialog with snapshotted ids", () => {
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    act(() => result.current.handleBatchArchive());
    expect(result.current.archiveConfirmOpen).toBe(true);
    expect(result.current.archivePendingIds).toEqual([1, 2]);
  });

  it("sets source to fees_closed_sheet in closed mode", () => {
    const props = makeProps({ mode: "closed" });
    const { result } = renderHook(() => useBulkActions(props));
    act(() => result.current.handleBatchArchive());
    expect(result.current.archivePendingSource).toBe("fees_closed_sheet");
  });
});

describe("useBulkActions — handleBulkReassign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies optimistic rowOverrides on success", async () => {
    mockBulkReassign.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    await act(async () => {
      await result.current.handleBulkReassign("Alice");
    });
    expect(props.setRowOverrides).toHaveBeenCalled();
    expect(props.setSelectedIds).toHaveBeenCalledWith(new Set());
    expect(result.current.bulkReassignError).toBeNull();
  });

  it("sets error and clears saving flag on server failure", async () => {
    mockBulkReassign.mockResolvedValueOnce({ ok: false, error: "Server error" });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    await act(async () => {
      await result.current.handleBulkReassign("Bob");
    });
    expect(result.current.bulkReassignError).toBe("Server error");
    expect(result.current.bulkReassignSaving).toBe(false);
  });

  it("does nothing when selectedIds is empty", async () => {
    const props = makeProps({ selectedIds: new Set() });
    const { result } = renderHook(() => useBulkActions(props));
    await act(async () => {
      await result.current.handleBulkReassign("Alice");
    });
    expect(mockBulkReassign).not.toHaveBeenCalled();
  });
});

describe("useBulkActions — handleBatchMarkOverpaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies markedOverpaid override on success", async () => {
    mockBulkMarkOverpaid.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    await act(async () => {
      await result.current.handleBatchMarkOverpaid();
    });
    expect(props.setRowOverrides).toHaveBeenCalled();
    expect(result.current.bulkOverpaidError).toBeNull();
  });

  it("sets error on failure", async () => {
    mockBulkMarkOverpaid.mockResolvedValueOnce({ ok: false, error: "DB error" });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    await act(async () => {
      await result.current.handleBatchMarkOverpaid();
    });
    expect(result.current.bulkOverpaidError).toBe("DB error");
    expect(result.current.bulkOverpaidSaving).toBe(false);
  });
});

describe("useBulkActions — handleBatchAddToFeePetitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates inFeePetition for all updated ids on full success", async () => {
    mockBulkAddToFeePetitions.mockResolvedValueOnce({ ok: true, updated: [1, 2] });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    act(() => {
      result.current.setFeePetitionPending({ ids: [1, 2], selectedCount: 2 });
    });
    await act(async () => {
      await result.current.handleBatchAddToFeePetitions();
    });
    expect(props.setRowOverrides).toHaveBeenCalled();
    expect(result.current.feePetitionConfirmOpen).toBe(false);
  });

  it("keeps dialog open and shows skip message when some cases were closed", async () => {
    mockBulkAddToFeePetitions.mockResolvedValueOnce({ ok: true, updated: [1] });
    const props = makeProps();
    const { result } = renderHook(() => useBulkActions(props));
    act(() => {
      result.current.setFeePetitionPending({ ids: [1, 2], selectedCount: 2 });
    });
    await act(async () => {
      await result.current.handleBatchAddToFeePetitions();
    });
    expect(result.current.bulkFeePetitionError).toBe("1 case skipped");
  });
});
