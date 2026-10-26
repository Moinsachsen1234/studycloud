import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Private object storage interface. Objects are addressed by random keys, never exposed via public URLs;
 * the API streams them only after an ownership check. Swap in an S3/Supabase-compatible adapter for production
 * (private bucket + server-side access) without touching callers.
 */
export interface ObjectStorage {
  put(userId: string, data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(userId: string): Promise<void>;
}

export class LocalFsStorage implements ObjectStorage {
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
  }
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('invalid storage key');
    return p;
  }
  async put(userId: string, data: Buffer) {
    const key = `${userId}/${crypto.randomBytes(24).toString('hex')}`;
    const p = this.resolve(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data, { mode: 0o600 });
    return key;
  }
  async get(key: string) {
    return fs.readFileSync(this.resolve(key));
  }
  async delete(key: string) {
    fs.rmSync(this.resolve(key), { force: true });
  }
  async deletePrefix(userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('invalid user id');
    fs.rmSync(path.resolve(this.root, userId), { recursive: true, force: true });
  }
}
