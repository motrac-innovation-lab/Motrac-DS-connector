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
export function maakClaim(query: (sql: string, params: unknown[]) => Promise<unknown[] | {
    rows: unknown[];
}>, { stijl, tabel }?: {
    stijl?: "$" | "?";
    tabel?: string;
}): import("./webhook.js").Claim;
/**
 * Een claim in het geheugen: voor tests en voor een app zonder database. Na een
 * herstart is hij leeg, dus in productie altijd `maakClaim()`.
 * @returns {import('./webhook.js').Claim & { aantal: () => number }}
 */
export function geheugenClaim(): import("./webhook.js").Claim & {
    aantal: () => number;
};
/** De migratie, ook als tekst voor een app die SQL uit code draait. Idempotent. */
export const WEBHOOK_EVENT_SQL: "CREATE TABLE IF NOT EXISTS docusign_webhook_event (\n  envelope_id TEXT NOT NULL,\n  event_id TEXT NOT NULL,\n  verwerkt_op TIMESTAMPTZ NOT NULL DEFAULT now(),\n  PRIMARY KEY (envelope_id, event_id)\n);\n";
