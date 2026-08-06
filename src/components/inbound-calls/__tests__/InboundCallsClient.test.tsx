/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { InboundCallsClient } from "../InboundCallsClient";
import { getMondayOfDate } from "@/lib/formatters";

// The component only needs these for chrome, not for the save behaviour.
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "admin" } } }),
}));
vi.mock("@/components/modals/CsvImportModal", () => ({ default: () => null }));
vi.mock("@/app/(dashboard)/inbound-calls/actions", () => ({
  bulkImportInboundCalls: vi.fn(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const thisWeek = () => getMondayOfDate(todayIso());
const nextWeek = () => {
  const [y, m, d] = thisWeek().split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const RECORD = () => ({
  id: 1,
  weekStart: thisWeek(),
  callDate: todayIso(),
  createdAt: new Date().toISOString(),
  number: "555-0100",
  transcript: "caller asked about status",
  caseLink: "",
  specialistAssigned: "",
  calledBackResolved: false,
});

const json = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/** Holds the PATCH open so the in-flight state can be asserted. */
let releasePatch: () => void;
let patchGate: Promise<void>;
/** Requests started. */
let patchStarted: string[];
/** Requests that actually completed — an aborted one never lands here, which is
 *  what makes the "don't cancel a neighbour" test able to fail. */
let patchCompleted: string[];

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  patchStarted = [];
  patchCompleted = [];
  patchGate = new Promise<void>((r) => {
    releasePatch = r;
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "PATCH") {
        const body = String(init.body);
        patchStarted.push(body);
        // Honour the abort signal the way a real fetch does, so a cancelled
        // save genuinely never completes.
        await new Promise<void>((resolve, reject) => {
          const signal = init.signal;
          if (signal?.aborted) return reject(abortError());
          const onAbort = () => reject(abortError());
          signal?.addEventListener("abort", onAbort);
          void patchGate.then(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          });
        });
        patchCompleted.push(body);
        return json({ ...RECORD(), ...JSON.parse(body) });
      }
      if (u.includes("/api/inbound-calls/poc")) {
        return json({ assignments: { 1: [], 2: [], 3: [], 4: [], 5: [] } });
      }
      if (u.includes("/api/inbound-calls?")) return json({ data: [RECORD()] });
      return json({});
    }),
  );
});

afterEach(() => {
  releasePatch();
  cleanup();
  vi.unstubAllGlobals();
});

describe("InboundCallsClient inline save feedback", () => {
  it("rings the field blue while its save is in flight, green once it lands", async () => {
    render(<InboundCallsClient teamMembers={["Hunter"]} />);

    const numberInput = await screen.findByDisplayValue("555-0100");

    fireEvent.change(numberInput, { target: { value: "555-0199" } });
    fireEvent.blur(numberInput);

    // in flight — the field the user touched is outlined
    await waitFor(() => expect(numberInput.className).toContain("ring-blue-400"));

    releasePatch();

    // landed — flashes green
    await waitFor(() => expect(numberInput.className).toContain("ring-emerald-400"));
    expect(patchCompleted).toEqual([JSON.stringify({ number: "555-0199" })]);
  });

  it("does not cancel a neighbouring field's save when focus moves across a row", async () => {
    render(<InboundCallsClient teamMembers={["Hunter"]} />);

    const numberInput = await screen.findByDisplayValue("555-0100");
    const reasonInput = await screen.findByDisplayValue("caller asked about status");

    fireEvent.change(numberInput, { target: { value: "555-0199" } });
    fireEvent.blur(numberInput);
    fireEvent.change(reasonInput, { target: { value: "new reason" } });
    fireEvent.blur(reasonInput);

    releasePatch();

    // both writes must COMPLETE — keying aborts by row id cancelled the first
    await waitFor(() => expect(patchCompleted).toHaveLength(2));
    expect(patchCompleted).toContain(JSON.stringify({ number: "555-0199" }));
    expect(patchCompleted).toContain(JSON.stringify({ transcript: "new reason" }));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("moves the row out of view as soon as its date lands in another week", async () => {
    const { container } = render(<InboundCallsClient teamMembers={["Hunter"]} />);
    await screen.findByDisplayValue("555-0100");

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const moved = nextWeek();

    fireEvent.change(dateInput, { target: { value: moved } });
    fireEvent.blur(dateInput);

    // optimistic: gone before the round trip resolves
    await waitFor(() => expect(screen.queryByDisplayValue("555-0100")).toBeNull());
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("moved to"));

    releasePatch();
  });

  it("refuses a part-typed date instead of sending one the server will reject", async () => {
    const { container } = render(<InboundCallsClient teamMembers={["Hunter"]} />);
    await screen.findByDisplayValue("555-0100");

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "" } });
    fireEvent.blur(dateInput);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(patchStarted).toHaveLength(0);
  });
});
