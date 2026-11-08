import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLEL, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLEL}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallel, saltText, keyText] = encoded.split('$');
  if (algorithm !== 'scrypt' || Number(cost) !== COST || Number(blockSize) !== BLOCK_SIZE || Number(parallel) !== PARALLEL) return false;
  try {
    const expected = Buffer.from(keyText, 'base64url');
    const actual = await derive(password, Buffer.from(saltText, 'base64url'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
