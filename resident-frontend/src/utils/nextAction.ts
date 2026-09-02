export type JourneyState = {
  hasAccount: boolean;
  profileComplete: boolean;
  hasStudentCard: boolean;
  hasGhanaCard: boolean;
  applicationStatus: string | null;
  bookingStatus: string | null;
  paymentSummary: {
    outstandingMinor: number | null;
    confirmationRequirementMet: boolean;
    hasSubmittedUnverified: boolean;
  } | null;
  hasActiveAllocation: boolean;
  allocationLabel?: string | null;
};

export type NextAction = { key: string; title: string; body: string; to?: string };

export function deriveNextAction(state: JourneyState): NextAction {
  if (!state.hasAccount) return { key: "register", title: "Create your account", body: "Register to start your Kissmet hostel application.", to: "/register" };
  if (!state.profileComplete) return { key: "profile", title: "Complete your profile", body: "Add the remaining personal details we need.", to: "/profile" };
  if (!state.hasStudentCard || !state.hasGhanaCard) {
    return { key: "documents", title: "Upload required documents", body: "Upload your Student Card and Ghana Card before submitting an application.", to: "/documents" };
  }
  if (!state.applicationStatus) return { key: "start_application", title: "Start application", body: "You have not started an application for the current academic session.", to: "/application" };
  if (state.applicationStatus === "draft") return { key: "submit_application", title: "Complete and submit application", body: "Submit when your required documents are uploaded.", to: "/application" };
  if (state.applicationStatus === "submitted" || state.applicationStatus === "under_review") {
    return { key: "wait_review", title: "Wait for application review", body: "Your application is being reviewed. Approval does not assign a room.", to: "/application" };
  }
  if (state.applicationStatus === "rejected") return { key: "rejected", title: "Application not approved", body: "See the decision on your application page.", to: "/application" };
  if (state.applicationStatus === "approved" && !state.bookingStatus) {
    return { key: "booking_pending_admin", title: "Booking process pending", body: "Approval allows booking to continue. It does not mean a bed has been assigned yet.", to: "/booking" };
  }
  if (state.bookingStatus === "pending") {
    const summary = state.paymentSummary;
    if (summary?.hasSubmittedUnverified) {
      return { key: "await_verification", title: "Payment submitted — awaiting verification", body: "A submitted slip is not the same as a verified payment.", to: "/payments" };
    }
    if (summary && summary.outstandingMinor && summary.outstandingMinor > 0 && !summary.confirmationRequirementMet) {
      return { key: "pay", title: "Payment required", body: "Pay the captured hostel fee. Verification does not automatically confirm the booking.", to: "/payments" };
    }
    if (summary?.confirmationRequirementMet) {
      return { key: "await_confirmation", title: "Await booking confirmation", body: "Your verified payments meet the requirement. Staff still confirm the booking manually.", to: "/booking" };
    }
    return { key: "pay", title: "Payment required", body: "A booking is pending. Follow the payment instructions.", to: "/payments" };
  }
  if (state.bookingStatus === "confirmed" && !state.hasActiveAllocation) {
    return { key: "await_room", title: "Booking confirmed — room assignment pending", body: "Your booking is confirmed. A bed has not yet been assigned.", to: "/room" };
  }
  if (state.hasActiveAllocation) {
    return { key: "room", title: state.allocationLabel ? `You have been assigned ${state.allocationLabel}` : "View your room", body: "Your active allocation is the source of room assignment.", to: "/room" };
  }
  return { key: "home", title: "You're up to date", body: "Check announcements and messages for anything new.", to: "/home" };
}

export function journeySteps(state: JourneyState) {
  const steps = ["Account", "Documents", "Application", "Booking", "Payment", "Confirmation", "Room assignment"];
  const complete = [
    state.hasAccount,
    state.hasStudentCard && state.hasGhanaCard,
    ["submitted", "under_review", "approved"].includes(state.applicationStatus ?? ""),
    Boolean(state.bookingStatus),
    Boolean(state.paymentSummary && (state.paymentSummary.confirmationRequirementMet || state.paymentSummary.hasSubmittedUnverified || (state.paymentSummary.outstandingMinor ?? 1) === 0)),
    state.bookingStatus === "confirmed" || state.bookingStatus === "completed",
    state.hasActiveAllocation,
  ];
  return steps.map((label, i) => ({
    label,
    state: complete[i] ? "complete" : complete.slice(0, i).every(Boolean) ? "current" : "not_started",
  }));
}
