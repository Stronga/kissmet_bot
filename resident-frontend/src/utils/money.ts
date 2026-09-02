export function parseMoneyToMinorUnits(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Amount is required");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter an amount such as 2500.00");
  const [majorRaw, fracRaw = ""] = trimmed.split(".");
  const major = Number.parseInt(majorRaw, 10);
  const frac = Number.parseInt((fracRaw + "00").slice(0, 2), 10);
  return major * 100 + frac;
}

export function formatMinorUnits(amountMinor: number | null | undefined, currency = "GHS"): string {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(Number(amountMinor))) return "Unavailable";
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amountMinor < 0 ? "-" : ""}${currency} ${grouped}.${frac.toString().padStart(2, "0")}`;
}
