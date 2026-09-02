import { describe, expect, it } from "vitest";
import { formatMinorUnits, parseMoneyToMinorUnits, percentageToBasisPoints } from "./money";

describe("money", () => {
  it("parses major units to minor units without float", () => {
    expect(parseMoneyToMinorUnits("2500.00")).toBe(250000);
    expect(parseMoneyToMinorUnits("2500")).toBe(250000);
    expect(parseMoneyToMinorUnits("0.50")).toBe(50);
    expect(parseMoneyToMinorUnits("1.2")).toBe(120);
  });

  it("rejects invalid amounts", () => {
    expect(() => parseMoneyToMinorUnits("")).toThrow();
    expect(() => parseMoneyToMinorUnits("12.345")).toThrow();
    expect(() => parseMoneyToMinorUnits("-1")).toThrow();
  });

  it("formats minor units", () => {
    expect(formatMinorUnits(250000)).toBe("GHS 2,500.00");
    expect(formatMinorUnits(350000)).toBe("GHS 3,500.00");
  });

  it("converts percentage to basis points", () => {
    expect(percentageToBasisPoints("50")).toBe(5000);
    expect(percentageToBasisPoints("50.00")).toBe(5000);
    expect(percentageToBasisPoints("100")).toBe(10000);
  });
});
