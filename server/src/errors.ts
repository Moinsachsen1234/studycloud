export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (code: string, msg: string, details?: unknown) => new HttpError(400, code, msg, details);
export const unauthorized = (msg = 'Nicht angemeldet.') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (code: string, msg: string) => new HttpError(403, code, msg);
export const notFound = (what = 'Nicht gefunden.') => new HttpError(404, 'NOT_FOUND', what);
