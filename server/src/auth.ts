import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db/db';
import { unauthorized } from './errors';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** A dummy hash to equalize timing when the account does not exist. */
export const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(db: Db, userId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  await db.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [userId, sha256(token), expiresAt]);
  return { token, expiresAt };
}

export interface AuthUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function makeAuthenticate(db: Db) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
    const h = req.headers.authorization;
    const m = h?.match(/^Bearer\s+(\S+)$/i);
    if (!m) throw unauthorized();
    const r = await db.query<{ id: string; email: string }>(
      `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`,
      [sha256(m[1])],
    );
    if (!r.rows[0]) throw unauthorized('Sitzung abgelaufen. Bitte neu anmelden.');
    req.user = r.rows[0];
  };
}

export const revokeToken = (db: Db, token: string) => db.query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
