import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// util.promisify only sees the last scrypt overload (without options), so the options-aware wrapper is typed explicitly.
function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
const KEY_LENGTH = 32;
const N = 16384;
const R = 8;
const P = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function verifyPasswordOrDummy(password: string, encoded: string | undefined): Promise<boolean> {
  return verifyPassword(password, encoded ?? DUMMY_HASH);
}
