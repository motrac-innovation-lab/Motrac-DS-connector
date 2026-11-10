// De idempotente claim voor de webhook: één INSERT … ON CONFLICT DO NOTHING in
// `docusign_webhook_event`. Twee gelijktijdige leveringen van hetzelfde event
// (DocuSign retryt agressief) kunnen zo nooit allebei doorgaan; een
// lees-dan-schrijf-check kon dat wel (mit-contractenbeheer audit § P2-2).
//
// De tabel staat in sql/docusign_webhook_event.sql; de app neemt hem op in zijn
// eigen migraties (beide bestaande apps hebben hem al, met precies deze vorm).

/** De migratie, ook als tekst voor een app die SQL uit code draait. Idempotent. */
export const WEBHOOK_EVENT_SQL = `CREATE TABLE IF NOT EXISTS docusign_webhook_event (
  envelope_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  verwerkt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (envelope_id, event_id)
);
`

/**
 * Een claim op de tabel, met de query-functie van de app. `query(sql, params)`
 * geeft de rijen terug (een array); placeholders zijn `$1, $2` (pg, Kysely's
 * `sql.raw`, postgres.js `unsafe`) of `?` (stijl `'?'`, zoals de D1-shim van
 * mit-rental).
 *
 * @example
 *   // pg
 *   const claim = maakClaim(async (sql, params) => (await pool.query(sql, params)).rows)
 * @param {(sql: string, params: unknown[]) => Promise<unknown[] | { rows: unknown[] }>} query
 * @param {{ stijl?: '$' | '?', tabel?: string }} [opties]
 * @returns {import('./webhook.js').Claim}
 */
export function maakClaim(query, { stijl = '$', tabel = 'docusign_webhook_event' } = {}) {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(tabel)) throw new Error(`Ongeldige tabelnaam '${tabel}'.`)
  const p = (/** @type {number} */ n) => (stijl === '?' ? '?' : `$${n}`)
  const rijen = (/** @type {unknown} */ r) => (Array.isArray(r) ? r : /** @type {{ rows?: unknown[] }} */ (r)?.rows ?? [])

  return {
    async neem(envelopeId, eventId) {
      const r = await query(
        `INSERT INTO ${tabel} (envelope_id, event_id) VALUES (${p(1)}, ${p(2)}) ON CONFLICT DO NOTHING RETURNING envelope_id`,
        [envelopeId, eventId],
      )
      return rijen(r).length > 0
    },
    async geefVrij(envelopeId, eventId) {
      await query(`DELETE FROM ${tabel} WHERE envelope_id = ${p(1)} AND event_id = ${p(2)}`, [envelopeId, eventId])
    },
  }
}

/**
 * Een claim in het geheugen: voor tests en voor een app zonder database. Na een
 * herstart is hij leeg, dus in productie altijd `maakClaim()`.
 * @returns {import('./webhook.js').Claim & { aantal: () => number }}
 */
export function geheugenClaim() {
  const gezien = new Set()
  const sleutel = (/** @type {string} */ a, /** @type {string} */ b) => `${a}\u0000${b}`
  return {
    async neem(envelopeId, eventId) {
      const k = sleutel(envelopeId, eventId)
      if (gezien.has(k)) return false
      gezien.add(k)
      return true
    },
    async geefVrij(envelopeId, eventId) {
      gezien.delete(sleutel(envelopeId, eventId))
    },
    aantal: () => gezien.size,
  }
}
