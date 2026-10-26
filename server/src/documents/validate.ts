import { unzipSync } from 'fflate';

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'heic' | 'txt' | 'docx';

export const KIND_MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const EXT_KIND: Record<string, FileKind> = { pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', heic: 'heic', heif: 'heic', txt: 'txt', docx: 'docx' };

export interface ValidationOk {
  ok: true;
  kind: FileKind;
  mime: string;
}
export interface ValidationFail {
  ok: false;
  code: string;
  message: string;
}

/** Sniff content by magic bytes; the declared extension/mime are never trusted on their own. */
export function validateUpload(filename: string, declaredMime: string | undefined, data: Buffer, maxBytes: number): ValidationOk | ValidationFail {
  if (!data.length) return { ok: false, code: 'EMPTY_FILE', message: 'Die Datei ist leer.' };
  if (data.length > maxBytes) return { ok: false, code: 'FILE_TOO_LARGE', message: `Die Datei ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const extKind = EXT_KIND[ext];
  if (!extKind) return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'Dieser Dateityp wird nicht unterstützt. Erlaubt: PDF, PNG, JPEG, HEIC, TXT, DOCX.' };

  const head = data.subarray(0, 16);
  let sniffed: FileKind | null = null;
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') sniffed = 'pdf';
  else if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) sniffed = 'png';
  else if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) sniffed = 'jpeg';
  else if (head.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(head.subarray(8, 12).toString('latin1'))) sniffed = 'heic';
  else if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    try {
      // Inflate ONLY the central marker file, bounded — protects against zip bombs.
      const entries = unzipSync(new Uint8Array(data), { filter: (f) => f.name === '[Content_Types].xml' && f.originalSize < 1_000_000 });
      sniffed = entries['[Content_Types].xml'] && /wordprocessingml/.test(Buffer.from(entries['[Content_Types].xml']).toString('utf8')) ? 'docx' : null;
    } catch {
      sniffed = null;
    }
  } else if (!data.includes(0) && isUtf8(data)) sniffed = 'txt';

  if (!sniffed) return { ok: false, code: 'CONTENT_MISMATCH', message: 'Der Inhalt der Datei passt nicht zu einem unterstützten Format.' };
  if (sniffed !== extKind) return { ok: false, code: 'CONTENT_MISMATCH', message: 'Dateiendung und Inhalt stimmen nicht überein.' };
  void declaredMime;
  return { ok: true, kind: sniffed, mime: KIND_MIME[sniffed] };
}

function isUtf8(b: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

/** Strip path components and control characters from a user-supplied filename. */
export function safeFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'datei';
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 150);
  return cleaned || 'datei';
}
