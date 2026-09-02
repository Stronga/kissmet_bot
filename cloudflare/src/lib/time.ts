export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, (m) => m.slice(0, 4) + "Z");
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

export function isPast(iso: string, now = nowIso()): boolean {
  return new Date(iso).getTime() <= new Date(now).getTime();
}
