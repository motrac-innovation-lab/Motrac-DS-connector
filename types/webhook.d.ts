/**
 * Eén signature-kop toetsen (base64 HMAC-SHA256 over de ruwe body), timing-safe.
 * @param {Buffer | Uint8Array | string} ruweBody
 * @param {string | string[] | null | undefined} handtekening
 * @param {string} hmacKey
 */
export function verifieerHandtekening(ruweBody: Buffer | Uint8Array | string, handtekening: string | string[] | null | undefined, hmacKey: string): boolean;
/**
 * De waarden van alle `X-DocuSign-Signature-N`-koppen, uit een gewoon object
 * (Node/Express: `req.headers`) of een `Headers` (Fetch/Hono: `c.req.raw.headers`).
 * @param {Headers | Record<string, string | string[] | undefined>} headers
 * @returns {string[]}
 */
export function signatureKoppen(headers: Headers | Record<string, string | string[] | undefined>): string[];
/**
 * Klopt een van de signature-koppen?
 * @param {Buffer | Uint8Array | string} ruweBody
 * @param {Headers | Record<string, string | string[] | undefined>} headers
 * @param {string} hmacKey
 */
export function verifieerWebhook(ruweBody: Buffer | Uint8Array | string, headers: Headers | Record<string, string | string[] | undefined>, hmacKey: string): boolean;
/**
 * Connect JSON SIM (`{ event, generatedDateTime, data: { envelopeId, envelopeSummary } }`)
 * naar één event; `'GENEGEERD'` voor een geldig event dat ons niet aangaat, null
 * als de body geen Connect-levering is.
 * @param {unknown} body
 * @returns {WebhookEvent | 'GENEGEERD' | null}
 */
export function normaliseerConnect(body: unknown): WebhookEvent | "GENEGEERD" | null;
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
export function verwerkWebhook({ ruweBody, headers, hmacKey, claim, verwerk }: {
    ruweBody: Buffer | Uint8Array | string;
    headers: Headers | Record<string, string | string[] | undefined>;
    hmacKey: string;
    claim: Claim;
    verwerk: (event: WebhookEvent) => Promise<void | "onbekende_envelop">;
}): Promise<WebhookUitkomst>;
/** Connect-event → neutraal event. Alles daarbuiten is GENEGEERD. */
export const CONNECT_EVENTS: Readonly<{
    'envelope-sent': "sent";
    'envelope-delivered': "delivered";
    'envelope-completed': "completed";
    'envelope-declined': "declined";
    'envelope-voided': "voided";
}>;
export type Claim = {
    /**
     * true = nieuw, false = al verwerkt
     */
    neem: (envelopeId: string, eventId: string) => Promise<boolean>;
    geefVrij: (envelopeId: string, eventId: string) => Promise<void>;
};
export type WebhookUitkomst = {
    /**
     * de HTTP-status voor DocuSign (zonder body)
     */
    status: 204 | 400 | 401 | 500 | 503;
    uitkomst: "verwerkt" | "genegeerd" | "onbekende_envelop" | "dubbel" | "geen_sleutel" | "handtekening" | "geen_json" | "formaat" | "fout";
    event?: WebhookEvent | undefined;
    /**
     * bij status 500: de fout uit `verwerk`, voor het serverlog
     */
    fout?: unknown;
};
export type EnvelopEvent = "sent" | "delivered" | "completed" | "declined" | "voided";
export type WebhookEvent = {
    envelopeId: string;
    /**
     * `voided` is ook een verlopen envelop: DocuSign voidt hem zelf
     */
    event: EnvelopEvent;
    /**
     * idempotentiesleutel samen met envelopeId: de Connect-eventnaam
     * (elke overgang komt per envelop hooguit één keer betekenisvol voor)
     */
    eventId: string;
    /**
     * wanneer de status veranderde (ISO-8601)
     */
    tijdstip: string | null;
    verzondenOp: string | null;
    /**
     * alleen bij completed
     */
    getekendOp: string | null;
    /**
     * bij voided of declined, als DocuSign hem meestuurt
     */
    reden: string | null;
};
import { Buffer } from 'node:buffer';
