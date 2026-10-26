import { unzipSync } from 'fflate';
import type { FileKind } from './validate';
import { AiNotConfiguredError, type LlmProvider } from '../ai/llm';

export interface ExtractedSegment {
  page: number | null;
  heading: string | null;
  text: string;
}
export interface Extraction {
  segments: ExtractedSegment[];
  pageCount: number | null;
}

export class ExtractionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MAX_SEG = 1200;

/** Group paragraphs into ≤1200-char segments, preserving a running heading. */
export function segmentParagraphs(paras: { text: string; heading?: boolean }[], page: number | null): ExtractedSegment[] {
  const out: ExtractedSegment[] = [];
  let heading: string | null = null;
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push({ page, heading, text: buf.trim() });
    buf = '';
  };
  for (const p of paras) {
    const t = p.text.replace(/\s+\n/g, '\n').trim();
    if (!t) continue;
    if (p.heading) {
      flush();
      heading = t.slice(0, 160);
      continue;
    }
    if (buf && buf.length + t.length + 2 > MAX_SEG) flush();
    if (t.length > MAX_SEG) {
      flush();
      for (let i = 0; i < t.length; i += MAX_SEG) out.push({ page, heading, text: t.slice(i, i + MAX_SEG) });
    } else buf += (buf ? '\n\n' : '') + t;
  }
  flush();
  return out;
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 80 && !/[.!?;,]$/.test(t) && !/\n/.test(t) && (/^#{1,6}\s/.test(t) || /^[A-ZÄÖÜ0-9][^a-z]{3,}$/.test(t) || /^\d+(\.\d+)*\s+\S/.test(t));
}

export function extractTxt(data: Buffer): Extraction {
  const text = new TextDecoder('utf-8').decode(data).replace(/\r\n/g, '\n');
  const paras = text.split(/\n{2,}/).map((p) => ({ text: p.replace(/^#{1,6}\s+/, ''), heading: looksLikeHeading(p) }));
  return { segments: segmentParagraphs(paras, null), pageCount: null };
}

export function extractDocx(data: Buffer): Extraction {
  let xml: string;
  try {
    const files = unzipSync(new Uint8Array(data), { filter: (f) => f.name === 'word/document.xml' && f.originalSize < 30_000_000 });
    const f = files['word/document.xml'];
    if (!f) throw new Error('missing');
    xml = Buffer.from(f).toString('utf8');
  } catch {
    throw new ExtractionError('DOCX_UNREADABLE', 'Das Word-Dokument konnte nicht gelesen werden.');
  }
  const paras: { text: string; heading?: boolean }[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const isHeading = /<w:pStyle w:val="(Heading\d|Titel|Title|berschrift\d?)"/i.test(p);
    const text = [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map((t) => (t[1] === undefined ? ' ' : t[1]))
      .join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    paras.push({ text, heading: isHeading });
  }
  const segments = segmentParagraphs(paras, null);
  if (!segments.length) throw new ExtractionError('NO_TEXT', 'Im Dokument wurde kein Text gefunden.');
  return { segments, pageCount: null };
}

export async function extractPdf(data: Buffer): Promise<Extraction> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  let pages: string[] = [];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const r = await extractText(pdf, { mergePages: false });
    pages = r.text as string[];
  } catch {
    throw new ExtractionError('PDF_UNREADABLE', 'Das PDF konnte nicht gelesen werden (beschädigt oder passwortgeschützt).');
  }
  const total = pages.reduce((n, p) => n + p.trim().length, 0);
  if (total < 20) throw new ExtractionError('SCANNED_PDF', 'Dieses PDF enthält keinen auswählbaren Text (vermutlich ein Scan). Lade die Seiten als Foto (JPEG/PNG) hoch, damit die Texterkennung sie lesen kann.');
  const segments: ExtractedSegment[] = [];
  pages.forEach((text, i) => {
    const paras = text.split(/\n{2,}|\n(?=[A-ZÄÖÜ0-9])/).map((t) => ({ text: t.replace(/\s*\n\s*/g, ' '), heading: looksLikeHeading(t) }));
    segments.push(...segmentParagraphs(paras, i + 1));
  });
  return { segments, pageCount: pages.length };
}

export async function extractImage(data: Buffer, kind: FileKind, llm: LlmProvider | null): Promise<Extraction> {
  if (kind === 'heic') throw new ExtractionError('HEIC_UNSUPPORTED', 'HEIC-Bilder können serverseitig noch nicht gelesen werden. Die App wandelt Fotos beim Hochladen in JPEG um; bitte wähle sonst ein JPEG/PNG.');
  if (!llm?.ocr) throw new ExtractionError('OCR_NOT_CONFIGURED', 'Für Fotos ist eine Texterkennung nötig, die in dieser Installation nicht eingerichtet ist (OCR_MODEL).');
  let text: string;
  try {
    text = await llm.ocr(data, kind === 'png' ? 'image/png' : 'image/jpeg');
  } catch (e) {
    if (e instanceof AiNotConfiguredError) throw new ExtractionError('OCR_NOT_CONFIGURED', 'Texterkennung ist nicht eingerichtet.');
    throw new ExtractionError('OCR_FAILED', 'Die Texterkennung ist fehlgeschlagen. Bitte versuche es später erneut.');
  }
  if (!text.trim() || text.trim() === '[NO_TEXT]') throw new ExtractionError('NO_TEXT', 'Auf dem Bild wurde kein lesbarer Text erkannt.');
  const paras = text.split(/\n{2,}/).map((t) => ({ text: t, heading: looksLikeHeading(t) }));
  return { segments: segmentParagraphs(paras, 1), pageCount: 1 };
}

export async function extract(kind: FileKind, data: Buffer, llm: LlmProvider | null): Promise<Extraction> {
  switch (kind) {
    case 'txt':
      return extractTxt(data);
    case 'docx':
      return extractDocx(data);
    case 'pdf':
      return extractPdf(data);
    default:
      return extractImage(data, kind, llm);
  }
}
