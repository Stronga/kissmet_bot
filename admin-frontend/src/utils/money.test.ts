import { describe, expect, it } from "vitest";
import { formatMinorUnits, parseMoneyToMinorUnits, percentageToBasisPoints } from "./money";

describe("admin money utils", () => {
  it("parses 2500.00 to 250000 without float", () => {
    expect(parseMoneyToMinorUnits("2500.00")).toBe(250000);
  });
  it("formats 350000 as GHS 3,500.00", () => {
    expect(formatMinorUnits(350000)).toBe("GHS 3,500.00");
  });
  it("does not fabricate missing amounts", () => {
    expect(formatMinorUnits(null)).toBe("Unavailable");
  });
  it("converts 50% to 5000 basis points", () => {
    expect(percentageToBasisPoints("50")).toBe(5000);
  });
});
