import type { Db } from '../db/db';
import { HttpError } from '../errors';
import { rightsService } from '../rights/rights';
import { logDecision } from '../research/researchService';

export const PRIVACY_VERSION = '2026-10-26';

/** Active (not withdrawn) consent of the given kind exists. */
export async function hasConsent(db: Db, userId: string, kind: 'ai_processing' | 'privacy_policy' | 'terms' | 'guardian'): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM consents WHERE user_id=$1 AND kind=$2 AND withdrawn_at IS NULL LIMIT 1`, [userId, kind]);
  return r.rows.length > 0;
}

/**
 * Architecture-level gate: user content may only reach an external AI provider when the rights engine
 * says so (which requires the disclosed AI-processing consent).
 */
export async function assertMaySendToAi(db: Db, userId: string, documentId?: string): Promise<void> {
  const consent = await hasConsent(db, userId, 'ai_processing');
  const d = rightsService.evaluate({
    operation: 'send_to_external_ai',
    source: { origin: 'user_upload', ownerUserId: userId, access: 'none', automatedAccessAllowed: true, rightsReservation: false, robotsAllowed: true, trustedProvider: false, aiProcessingConsent: consent },
    requesterUserId: userId,
  });
  await logDecision(db, d, { userId, documentId });
  if (d.outcome === 'DENY' || d.outcome === 'REVIEW_REQUIRED') {
    throw new HttpError(403, 'AI_CONSENT_REQUIRED', 'Für KI-Funktionen wird deine (bzw. die elterliche) Einwilligung in die KI-Verarbeitung benötigt. Du kannst sie in den Einstellungen erteilen.');
  }
}

export async function consumeAiQuota(db: Db, userId: string, limit: number): Promise<void> {
  const r = await db.query<{ calls: number }>(
    `INSERT INTO ai_usage (user_id, day, calls) VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET calls = ai_usage.calls + 1 RETURNING calls`,
    [userId],
  );
  if (r.rows[0].calls > limit) throw new HttpError(429, 'AI_QUOTA_EXCEEDED', 'Das tägliche KI-Limit ist erreicht. Morgen geht es weiter.');
}
