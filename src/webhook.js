// De inkomende DocuSign Connect-webhook, zonder framework: de app geeft de ruwe
// body en de headers, en krijgt een HTTP-status en (als er iets te doen is) een
// event terug. Zie voorbeelden/express en voorbeelden/hono voor de route.
//
// Lessen uit beide apps die hier vastliggen:
// - De HMAC gaat over de body zoals ontvangen; lees dus de ruwe bytes, niet een
//   opnieuw geserialiseerde JSON.
// - DocuSign zet per accountsleutel een kop `X-DocuSign-Signature-N`; welke N de
//   onze is hangt af van de volgorde waarin de sleutels zijn aangemaakt. Toets ze
//   allemaal (mit-contractenbeheer keek alleen naar -1).
// - Alles wat ons niet aangaat (recipient-events, een onbekende envelop, een
//   dubbel event) krijgt 204, anders blijft DocuSign het eindeloos aanbieden.
// - Een Custom Connect-configuratie op accountniveau levert de events van álle
//   envelopen van het account, dus ook die van andere apps: onbekend = 204.
// - Idempotent op (envelop, event) met een atomische claim; faalt de verwerking,
//   dan gaat de claim weer weg en krijgt DocuSign een 500, zodat hij opnieuw levert.
// - Tijdstippen moeten echte ISO-8601 zijn: Postgres accepteert voor timestamptz
//   ook 'infinity', en dat breekt later elke lees (mit-contractenbeheer audit § P2-1).
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Connect-event → neutraal event. Alles daarbuiten is GENEGEERD. */
export const CONNECT_EVENTS = Object.freeze({
  'envelope-sent': 'sent',
  'envelope-delivered': 'delivered',
  'envelope-completed': 'completed',
  'envelope-declined': 'declined',
  'envelope-voided': 'voided',
})

/** @typedef {'sent' | 'delivered' | 'completed' | 'declined' | 'voided'} EnvelopEvent */

/**
 * @typedef {object} WebhookEvent
 * @property {string} envelopeId
 * @property {EnvelopEvent} event `voided` is ook een verlopen envelop: DocuSign voidt hem zelf
 * @property {string} eventId idempotentiesleutel samen met envelopeId: de Connect-eventnaam
 *   (elke overgang komt per envelop hooguit één keer betekenisvol voor)
 * @property {string | null} tijdstip wanneer de status veranderde (ISO-8601)
 * @property {string | null} verzondenOp
 * @property {string | null} getekendOp alleen bij completed
 * @property {string | null} reden bij voided of declined, als DocuSign hem meestuurt
 */

const ISO_TIJDSTIP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

/** @param {unknown} waarde */
const tijdstipOfNull = (waarde) =>
  typeof waarde === 'string' && ISO_TIJDSTIP.test(waarde) && !Number.isNaN(Date.parse(waarde)) ? waarde : null

/**
 * Eén signature-kop toetsen (base64 HMAC-SHA256 over de ruwe body), timing-safe.
 * @param {Buffer | Uint8Array | string} ruweBody
 * @param {string | string[] | null | undefined} handtekening
 * @param {string} hmacKey
 */
export function verifieerHandtekening(ruweBody, handtekening, hmacKey) {
  if (!handtekening || Array.isArray(handtekening) || !hmacKey) return false
  const verwacht = Buffer.from(createHmac('sha256', hmacKey).update(ruweBody).digest('base64'), 'utf8')
  const ontvangen = Buffer.from(handtekening, 'utf8')
  if (verwacht.length !== ontvangen.length) return false
  return timingSafeEqual(verwacht, ontvangen)
}

/**
 * De waarden van alle `X-DocuSign-Signature-N`-koppen, uit een gewoon object
 * (Node/Express: `req.headers`) of een `Headers` (Fetch/Hono: `c.req.raw.headers`).
 * @param {Headers | Record<string, string | string[] | undefined>} headers
 * @returns {string[]}
 */
export function signatureKoppen(headers) {
  /** @type {Array<[string, unknown]>} */
  const paren = typeof Headers !== 'undefined' && headers instanceof Headers ? [...headers.entries()] : Object.entries(headers ?? {})
  return paren
    .filter(([naam]) => /^x-docusign-signature-\d+$/i.test(naam))
    .flatMap(([, waarde]) => (Array.isArray(waarde) ? waarde : [waarde]))
    .filter((w) => typeof w === 'string' && w.length > 0)
}

/**
 * Klopt een van de signature-koppen?
 * @param {Buffer | Uint8Array | string} ruweBody
 * @param {Headers | Record<string, string | string[] | undefined>} headers
 * @param {string} hmacKey
 */
export function verifieerWebhook(ruweBody, headers, hmacKey) {
  return signatureKoppen(headers).some((h) => verifieerHandtekening(ruweBody, h, hmacKey))
}

/**
 * Connect JSON SIM (`{ event, generatedDateTime, data: { envelopeId, envelopeSummary } }`)
 * naar één event; `'GENEGEERD'` voor een geldig event dat ons niet aangaat, null
 * als de body geen Connect-levering is.
 * @param {unknown} body
 * @returns {WebhookEvent | 'GENEGEERD' | null}
 */
export function normaliseerConnect(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = /** @type {Record<string, any>} */ (body)
  if (typeof b.event !== 'string' || !b.data || typeof b.data !== 'object' || typeof b.data.envelopeId !== 'string' || !b.data.envelopeId) {
    return null
  }
  const event = /** @type {EnvelopEvent | undefined} */ (CONNECT_EVENTS[/** @type {keyof typeof CONNECT_EVENTS} */ (b.event)])
  if (!event) return 'GENEGEERD'

  const s = b.data.envelopeSummary && typeof b.data.envelopeSummary === 'object' ? b.data.envelopeSummary : {}
  const reden = event === 'voided' ? s.voidedReason : event === 'declined' ? s.declinedReason : null
  return {
    envelopeId: b.data.envelopeId,
    event,
    eventId: b.event,
    tijdstip:
      tijdstipOfNull(event === 'completed' ? s.completedDateTime : null) ??
      tijdstipOfNull(s.statusChangedDateTime) ??
      tijdstipOfNull(b.generatedDateTime),
    verzondenOp: tijdstipOfNull(s.sentDateTime),
    getekendOp: event === 'completed' ? tijdstipOfNull(s.completedDateTime) ?? tijdstipOfNull(b.generatedDateTime) : null,
    reden: typeof reden === 'string' && reden.trim() ? reden.trim() : null,
  }
}

/**
 * @typedef {object} Claim
 * @property {(envelopeId: string, eventId: string) => Promise<boolean>} neem true = nieuw, false = al verwerkt
 * @property {(envelopeId: string, eventId: string) => Promise<void>} geefVrij
 */

/**
 * @typedef {object} WebhookUitkomst
 * @property {204 | 400 | 401 | 500 | 503} status de HTTP-status voor DocuSign (zonder body)
 * @property {'verwerkt' | 'genegeerd' | 'onbekende_envelop' | 'dubbel' | 'geen_sleutel' | 'handtekening' | 'geen_json' | 'formaat' | 'fout'} uitkomst
 * @property {WebhookEvent} [event]
 * @property {unknown} [fout] bij status 500: de fout uit `verwerk`, voor het serverlog
 */

/**
 * De hele webhook in één functie. `verwerk(event)` doet het werk van de app
 * (status op het record, audit, getekend document ophalen) en geeft
 * `'onbekende_envelop'` terug als de envelop niet van deze app is.
 *
 * @param {object} opties
 * @param {Buffer | Uint8Array | string} opties.ruweBody
 * @param {Headers | Record<string, string | string[] | undefined>} opties.headers
 * @param {string} opties.hmacKey `DOCUSIGN_WEBHOOK_HMAC_KEY`; leeg = 503
 * @param {Claim} opties.claim zie `maakClaim()` in idempotentie.js
 * @param {(event: WebhookEvent) => Promise<void | 'onbekende_envelop'>} opties.verwerk
 * @returns {Promise<WebhookUitkomst>}
 */
export async function verwerkWebhook({ ruweBody, headers, hmacKey, claim, verwerk }) {
  if (!hmacKey) return { status: 503, uitkomst: 'geen_sleutel' }
  const bytes = typeof ruweBody === 'string' ? Buffer.from(ruweBody, 'utf8') : Buffer.from(ruweBody ?? [])
  if (!bytes.length || !verifieerWebhook(bytes, headers, hmacKey)) return { status: 401, uitkomst: 'handtekening' }

  let geparst
  try {
    geparst = JSON.parse(bytes.toString('utf8'))
  } catch {
    return { status: 400, uitkomst: 'geen_json' }
  }
  const event = normaliseerConnect(geparst)
  if (event === null) return { status: 400, uitkomst: 'formaat' }
  if (event === 'GENEGEERD') return { status: 204, uitkomst: 'genegeerd' }

  if (!(await claim.neem(event.envelopeId, event.eventId))) return { status: 204, uitkomst: 'dubbel', event }
  try {
    const resultaat = await verwerk(event)
    if (resultaat === 'onbekende_envelop') {
      // Niet van deze app: de claim hoeft niet te blijven staan.
      await claim.geefVrij(event.envelopeId, event.eventId)
      return { status: 204, uitkomst: 'onbekende_envelop', event }
    }
    return { status: 204, uitkomst: 'verwerkt', event }
  } catch (fout) {
    await claim.geefVrij(event.envelopeId, event.eventId)
    return { status: 500, uitkomst: 'fout', event, fout }
  }
}
