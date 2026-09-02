/** Parse a major-unit money string (e.g. "2500.00") to integer minor units without IEEE float. */
export function parseMoneyToMinorUnits(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Amount is required");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Amount must be a positive major-unit value such as 2500.00");
  }
  const [majorRaw, fracRaw = ""] = trimmed.split(".");
  const major = Number.parseInt(majorRaw, 10);
  const frac = Number.parseInt((fracRaw + "00").slice(0, 2), 10);
  return major * 100 + frac;
}

export function formatMinorUnits(amountMinor: number, currency = "GHS"): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currency} ${grouped}.${frac.toString().padStart(2, "0")}`;
}

export function percentageToBasisPoints(percentInput: string): number {
  const trimmed = percentInput.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Percentage must be a number such as 50 or 50.00");
  }
  const [majorRaw, fracRaw = ""] = trimmed.split(".");
  const major = Number.parseInt(majorRaw, 10);
  const frac = Number.parseInt((fracRaw + "00").slice(0, 2), 10);
  return major * 100 + frac;
}
