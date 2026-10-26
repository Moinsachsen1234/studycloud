import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Embedded PostgreSQL (WASM) for local dev and tests. Real Postgres semantics, no server needed. */
export async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  const wrap = (q: { query: (s: string, p?: unknown[]) => Promise<any> }): Db => ({
    async query(sql, params) {
      const r = await q.query(sql, params as any[]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    async tx(fn) {
      // Nested use inside a transaction: run inline.
      return fn(this);
    },
    async close() {},
  });
  const root: Db = {
    ...wrap(pg),
    async tx(fn) {
      return pg.transaction(async (t) => fn(wrap(t as any)));
    },
    async close() {
      await pg.close();
    },
  };
  await pg.exec(SCHEMA_SQL);
  return root;
}

export async function openPostgres(url: string): Promise<Db> {
  const pgmod = await import('pg');
  const Pool = (pgmod as any).default?.Pool ?? (pgmod as any).Pool;
  const pool = new Pool({ connectionString: url, max: 10 });
  const wrapClient = (c: any): Db => ({
    async query(sql, params) {
      const r = await c.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async tx(fn) {
      return fn(this);
    },
    async close() {},
  });
  const root: Db = {
    ...wrapClient(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(wrapClient(c));
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  await pool.query(SCHEMA_SQL);
  return root;
}
