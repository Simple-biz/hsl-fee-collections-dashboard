/**
 * TEMPORARY — do not keep.
 *
 * Proves the CI gate actually fails a PR rather than just reporting green.
 * Reverted immediately after the red run is captured. See #371.
 */
import { describe, it, expect } from "vitest";

describe("CI red-run proof", () => {
  it("fails on purpose to prove the gate blocks", () => {
    expect(1).toBe(2);
  });
});
