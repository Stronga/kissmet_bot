import { describe, expect, it } from "vitest";
import { deriveNextAction } from "./nextAction";
import { formatMinorUnits, parseMoneyToMinorUnits } from "./money";

const base = {
  hasAccount: true,
  profileComplete: true,
  hasStudentCard: true,
  hasGhanaCard: true,
  applicationStatus: null as string | null,
  bookingStatus: null as string | null,
  paymentSummary: null,
  hasActiveAllocation: false,
};

describe("next-action derivation", () => {
  it("asks new users to register", () => {
    expect(deriveNextAction({ ...base, hasAccount: false }).key).toBe("register");
  });
  it("asks for documents before application", () => {
    expect(deriveNextAction({ ...base, hasStudentCard: false }).key).toBe("documents");
  });
  it("does not treat approval as a room", () => {
    const action = deriveNextAction({ ...base, applicationStatus: "approved" });
    expect(action.key).toBe("booking_pending_admin");
    expect(action.body).toContain("does not mean a bed");
  });
  it("does not treat submitted payment as paid", () => {
    const action = deriveNextAction({
      ...base,
      applicationStatus: "approved",
      bookingStatus: "pending",
      paymentSummary: { outstandingMinor: 250000, confirmationRequirementMet: false, hasSubmittedUnverified: true },
    });
    expect(action.title).toContain("awaiting verification");
  });
  it("does not treat confirmation as allocation", () => {
    const action = deriveNextAction({ ...base, applicationStatus: "approved", bookingStatus: "confirmed" });
    expect(action.key).toBe("await_room");
  });
  it("shows the room only from active allocation", () => {
    const action = deriveNextAction({ ...base, applicationStatus: "approved", bookingStatus: "confirmed", hasActiveAllocation: true, allocationLabel: "Room 101, Bed A" });
    expect(action.title).toContain("Room 101");
  });
});

describe("resident money", () => {
  it("formats captured totals from minor units", () => {
    expect(parseMoneyToMinorUnits("2500.00")).toBe(250000);
    expect(formatMinorUnits(250000)).toBe("GHS 2,500.00");
  });
});
