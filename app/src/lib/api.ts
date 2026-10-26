import { Platform } from 'react-native';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

function qs(query?: Record<string, string | number | undefined | null>) {
  if (!query) return '';
  const p = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
}

async function toError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Fehler ${res.status}`, body?.error?.details);
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number | undefined | null>; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token && opts.auth !== false ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Keine Verbindung zum Server.');
  }
  if (res.status === 401 && token && opts.auth !== false) onUnauthorized?.();
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  /** Web only: the File object. */
  file?: File;
}

/** Upload with real progress (fetch cannot report upload progress, XHR can — on web and native). */
export function uploadDocument(file: PickedFile, fields: Record<string, string>, onProgress?: (fraction: number) => void): Promise<import('./types').Doc> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (Platform.OS === 'web' && file.file) form.append('file', file.file, file.name);
    else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/documents`);
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Keine Verbindung zum Server.'));
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else {
        if (xhr.status === 401) onUnauthorized?.();
        reject(new ApiError(xhr.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Fehler ${xhr.status}`, body?.error?.details));
      }
    };
    xhr.send(form);
  });
}

/** Authorized private file → object URL (web) / data URI (native). Never a public URL. */
export async function fetchPrivateFileUri(documentId: string, mime: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/documents/${documentId}/file`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw await toError(res);
  if (Platform.OS === 'web') return URL.createObjectURL(await res.blob());
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}
