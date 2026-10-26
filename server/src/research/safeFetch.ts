import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export class FetchBlockedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved, unique-local, mapped-private. */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::1' || x === '::' ) return true;
    if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true; // link-local
    if (x.startsWith('fc') || x.startsWith('fd')) return true; // unique local
    if (x.startsWith('ff')) return true; // multicast
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]);
    if (x.startsWith('64:ff9b:') || x.startsWith('2001:db8')) return true;
    return false;
  }
  return true; // not an IP at all => treat as unsafe
}

export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith('.' + a));
}

export interface SafeFetchOptions {
  allowedHosts: string[];
  userAgent: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
  /** Test seam: replaces the network call. Host/scheme/redirect policy is still enforced. */
  fetchImpl?: (url: string, init: { headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal }) => Promise<Response>;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  retrievedAt: Date; // system clock at the moment the response was fully read
}

/** Connect-time DNS guard: validates the *actual* IP used for the socket (defeats DNS rebinding). */
const guardedAgent = new Agent({
  connect: {
    lookup: (hostname, options, cb) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs: any) => {
        if (err) return (cb as any)(err);
        const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
        const ok = list.filter((a: any) => !isPrivateAddress(a.address));
        if (!ok.length) return (cb as any)(new FetchBlockedError('PRIVATE_ADDRESS', `Blocked private address for ${hostname}`));
        if ((options as any)?.all) return (cb as any)(null, ok);
        return (cb as any)(null, ok[0].address, ok[0].family);
      });
    },
  },
});

export function validateUrl(raw: string, allowedHosts: string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlockedError('BAD_URL', 'Invalid URL');
  }
  if (u.protocol !== 'https:') throw new FetchBlockedError('BAD_SCHEME', 'Only https is allowed');
  if (u.username || u.password) throw new FetchBlockedError('CREDENTIALS_IN_URL', 'Credentials in URL are not allowed');
  if (u.port && u.port !== '443') throw new FetchBlockedError('BAD_PORT', 'Only port 443 is allowed');
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) throw new FetchBlockedError('IP_LITERAL', 'IP-literal hosts are not allowed');
  if (!hostAllowed(u.hostname, allowedHosts)) throw new FetchBlockedError('HOST_NOT_ALLOWED', `Host ${u.hostname} is not on the provider allowlist`);
  return u;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  let url = validateUrl(rawUrl, opts.allowedHosts).toString();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const headers = { 'user-agent': opts.userAgent, accept: opts.accept ?? 'application/json, text/plain;q=0.8', 'accept-encoding': 'identity' };
      const init = { headers, redirect: 'manual' as const, signal: ctl.signal };
      const res: Response = opts.fetchImpl
        ? await opts.fetchImpl(url, init)
        : ((await undiciFetch(url, { ...init, dispatcher: guardedAgent } as any)) as unknown as Response);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new FetchBlockedError('BAD_REDIRECT', 'Redirect without Location');
        url = validateUrl(new URL(loc, url).toString(), opts.allowedHosts).toString(); // re-validate every hop
        continue;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!/^(application\/(json|xml|[\w.+-]*\+json)|text\/)/i.test(ct)) throw new FetchBlockedError('BAD_CONTENT_TYPE', `Unsupported content type: ${ct || 'none'}`);
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) {
            ctl.abort();
            throw new FetchBlockedError('TOO_LARGE', 'Response exceeds size limit');
          }
          chunks.push(value);
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      return { status: res.status, finalUrl: url, contentType: ct, body, retrievedAt: new Date() };
    }
    throw new FetchBlockedError('TOO_MANY_REDIRECTS', 'Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal robots.txt evaluation (longest-match, Allow wins ties) for providers that crawl HTML pages. */
export function robotsAllows(robotsTxt: string, userAgent: string, pathname: string): boolean {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === 'allow' || k === 'disallow') && cur) {
      cur.rules.push({ allow: k === 'allow', path: v });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of chosen)
    for (const r of g.rules) {
      if (r.path === '') continue; // empty Disallow = allow all
      const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
      if (new RegExp('^' + pat).test(pathname)) {
        if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
      }
    }
  return best ? best.allow : true;
}
