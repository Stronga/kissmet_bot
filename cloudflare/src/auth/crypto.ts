const encoder = new TextEncoder();
export const PBKDF2_ITERATIONS = 210_000;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashSecret(secret: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(secret, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = fromHex(parts[3]);
  const expected = fromHex(parts[4]);
  const actual = await pbkdf2(secret, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(buf));
}

export function generateOtp(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const n = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

export function generateStaffPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `Ksm-${toHex(bytes).slice(0, 16)}!`;
}

export const hashPassword = hashSecret;
export const verifyPassword = verifySecret;
export const hashOtp = hashSecret;
export const verifyOtp = verifySecret;
export const hashSessionToken = sha256Hex;
