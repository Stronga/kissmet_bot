type Bucket = { count: number; resetAt: number };

const staffLoginBuckets = new Map<string, Bucket>();

export function allowStaffLogin(identifierHash: string, max = 8, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const current = staffLoginBuckets.get(identifierHash);
  if (!current || current.resetAt < now) {
    staffLoginBuckets.set(identifierHash, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

export function clearStaffLoginLimit(identifierHash: string) {
  staffLoginBuckets.delete(identifierHash);
}
