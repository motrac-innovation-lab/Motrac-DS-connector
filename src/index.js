// @motrac/docusign: DocuSign voor Motrac-apps.
//
// Wat de bouwsteen doet: inloggen (JWT Grant), de envelop op naam van de
// gebruiker die verstuurt, envelop en getekend document ophalen, intrekken,
// health-checks, de webhook (HMAC, Connect JSON SIM, idempotentie), het
// niet-live-slot en verzendrecht geven.
// Wat de app doet: het document maken, de ankers erin zetten, de statussen op
// zijn eigen records, audit, rechten, de schermen. Zie INTEGREREN.md.
import { Buffer } from 'node:buffer'
import { haalAccountBasisUrlOp, haalToegangstokenOp } from './auth.js'
import { bouwEnvelopBody } from './envelop.js'
import { DocusignNietIngesteld, DocusignVerzenderFout, antwoordFout } from './fouten.js'
import { haalProfielenOp, vindVerzendProfiel, zetProfiel } from './profielen.js'
import { magVersturen, maakVerzenderTokens, zoekDocusignGebruiker } from './verzender.js'

export * from './config.js'
export * from './fouten.js'
export { bouwJwtAssertion, haalAccountBasisUrlOp, haalToegangstokenOp, vergeetTokens } from './auth.js'
export { bouwEnvelopBody, DOCUMENT_SOORTEN, MAX_BERICHT, MAX_DOCUMENT_BYTES, MAX_ONDERWERP } from './envelop.js'
export { A4_LIGGEND, A4_STAAND, TAB_SOORTEN, bouwAnkerTab, clampOffset } from './tabs.js'
export { magVersturen, maakVerzenderTokens, zoekDocusignGebruiker } from './verzender.js'
export { beheerrechtBoodschap, haalProfielenOp, vindVerzendProfiel, zetProfiel } from './profielen.js'
export { CONNECT_EVENTS, normaliseerConnect, signatureKoppen, verifieerHandtekening, verifieerWebhook, verwerkWebhook } from './webhook.js'
export { WEBHOOK_EVENT_SQL, geheugenClaim, maakClaim } from './idempotentie.js'
export { metTestSlot, testOntvangersUit } from './testslot.js'
export { httpFout } from './http.js'

// De types, ook vanuit het hoofdpakket te importeren (`import type { WebhookEvent } from '@motrac/docusign'`).
/** @typedef {import('./config.js').DocusignConfig} DocusignConfig */
/** @typedef {import('./envelop.js').EnvelopInvoer} EnvelopInvoer */
/** @typedef {import('./envelop.js').Document} Document */
/** @typedef {import('./envelop.js').Ondertekenaar} Ondertekenaar */
/** @typedef {import('./envelop.js').Veld} Veld */
/** @typedef {import('./tabs.js').PaginaBox} PaginaBox */
/** @typedef {import('./tabs.js').TabSoort} TabSoort */
/** @typedef {import('./fouten.js').VerzenderReden} VerzenderReden */
/** @typedef {import('./webhook.js').WebhookEvent} WebhookEvent */
/** @typedef {import('./webhook.js').EnvelopEvent} EnvelopEvent */
/** @typedef {import('./webhook.js').WebhookUitkomst} WebhookUitkomst */
/** @typedef {import('./webhook.js').Claim} Claim */
/** @typedef {import('./http.js').HttpFout} HttpFout */

const TIMEOUT_MS = 30_000
const HEALTH_TIMEOUT_MS = 5_000

/** De stand van "kan ik op naam van deze persoon versturen", per reden. */
const STAND_VAN_REDEN = /** @type {const} */ ({
  GEEN_EMAIL: 'geen_email',
  GEEN_ACCOUNT: 'geen_account',
  GEEN_VERZENDRECHT: 'geen_verzendrecht',
  GEEN_TOESTEMMING: 'geen_toestemming',
})

/**
 * @typedef {object} KoppelingStand
 * @property {'ok' | 'niet_ingesteld' | 'fout'} status
 * @property {number} [latentieMs]
 * @property {string} [foutmelding] alleen voor het serverlog of een beheerder; bevat nooit een geheim
 * @property {string} gecontroleerdOp
 */

/**
 * @typedef {object} VerzenderStand
 * @property {'ok' | 'geen_email' | 'geen_account' | 'geen_verzendrecht' | 'geen_toestemming' | 'niet_ingesteld' | 'fout'} status
 * @property {string | null} email
 * @property {string} [boodschap] de tekst bij een reden, voor de gebruiker
 * @property {string} [profiel] het DocuSign-profiel bij geen_verzendrecht
 * @property {string} [foutmelding]
 * @property {string} gecontroleerdOp
 */

/**
 * @param {import('./config.js').DocusignConfig} config uit `docusignConfig()`
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [opties]
 */
export function maakDocusign(config, { fetch: fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  /** @param {number} ms */
  const metTimeout = (ms) => /** @type {typeof fetch} */ ((input, init) => fetchImpl(input, { ...init, signal: AbortSignal.timeout(ms) }))
  const f = metTimeout(timeoutMs)
  const verzenderTokens = maakVerzenderTokens(config, f)

  /**
   * Koppeltoken en basisdomein, en het token voor de aanroep: op naam van
   * `verzenderEmail` als die er is. `terugval`: bij een verzenderprobleem met
   * het koppeltoken verder (alleen voor lezen, nooit voor versturen).
   * @param {string | null | undefined} verzenderEmail
   * @param {{ terugval: boolean, fetchImpl?: typeof fetch }} opties
   */
  async function verbind(verzenderEmail, { terugval, fetchImpl: ff = f }) {
    if (!config.privateKey) throw new DocusignNietIngesteld()
    const koppelToken = await haalToegangstokenOp(config, ff)
    const basisUrl = await haalAccountBasisUrlOp(config, koppelToken, ff)
    if (!verzenderEmail && terugval) return { basisUrl, koppelToken, token: koppelToken }
    try {
      const tokens = ff === f ? verzenderTokens : maakVerzenderTokens(config, ff)
      const token = await tokens.tokenVoor(verzenderEmail, { token: koppelToken, basisUrl })
      return { basisUrl, koppelToken, token }
    } catch (error) {
      if (terugval && error instanceof DocusignVerzenderFout) return { basisUrl, koppelToken, token: koppelToken }
      throw error
    }
  }

  const envelopUrl = (/** @type {string} */ basisUrl, /** @type {string} */ envelopeId) =>
    `${basisUrl}/v2.1/accounts/${config.accountId}/envelopes/${encodeURIComponent(envelopeId)}`

  return {
    /**
     * Maakt de envelop aan op naam van `verzenderEmail` (de ingelogde gebruiker,
     * of de verzender op het record). Er is geen terugval op de koppelgebruiker:
     * kan het niet op naam, dan gooit hij `DocusignVerzenderFout` en is er niets
     * verstuurd. De invoer wordt eerst getoetst (`DocusignInvoerFout`).
     * @param {import('./envelop.js').EnvelopInvoer & { verzenderEmail: string | null | undefined }} invoer
     * @returns {Promise<{ envelopeId: string, status: string, verzondenOp: string }>}
     */
    async verstuurEnvelop({ verzenderEmail, ...invoer }) {
      // Eerst de invoer: een fout daarin kost geen aanroep naar DocuSign.
      const { body, tabs } = bouwEnvelopBody(invoer)
      const { basisUrl, token } = await verbind(verzenderEmail, { terugval: false })

      const response = await f(`${basisUrl}/v2.1/accounts/${config.accountId}/envelopes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const fout = await antwoordFout(response, 'DocuSign-envelop aanmaken')
        // Bij een offsetfout toont alleen de tab-payload de oorzaak. Bewust alleen
        // de tabs: geen token, geen sleutel, geen gegevens van de ondertekenaar.
        if (fout.errorCode === 'INVALID_USER_OFFSET') {
          console.error(`[docusign] INVALID_USER_OFFSET: tab-payload per ondertekenaar: ${JSON.stringify(tabs)}`)
        }
        if (fout.errorCode === 'USER_LACKS_PERMISSIONS' || fout.errorCode === 'USER_NOT_ENVELOPE_SENDER') {
          throw new DocusignVerzenderFout('GEEN_VERZENDRECHT', verzenderEmail?.trim() || null)
        }
        throw fout
      }
      const data = await response.json()
      return {
        envelopeId: String(data.envelopeId),
        status: String(data.status ?? body.status),
        verzondenOp: new Date().toISOString(),
      }
    },

    /**
     * De envelop zoals DocuSign hem kent (`status`, `sentDateTime`,
     * `completedDateTime`, `voidedReason`, …). Met het token van de verzender als
     * dat lukt, anders met dat van de koppelgebruiker.
     * @param {string} envelopeId
     * @param {{ verzenderEmail?: string | null }} [opties]
     * @returns {Promise<Record<string, any>>}
     */
    async haalEnvelopOp(envelopeId, { verzenderEmail } = {}) {
      const { basisUrl, token } = await verbind(verzenderEmail, { terugval: true })
      const response = await f(envelopUrl(basisUrl, envelopeId), { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw await antwoordFout(response, 'DocuSign-envelop ophalen')
      return response.json()
    },

    /**
     * De getekende PDF: alle documenten samen, met het certificaat van voltooiing.
     * @param {string} envelopeId
     * @param {{ verzenderEmail?: string | null }} [opties]
     * @returns {Promise<Buffer>}
     */
    async haalGetekendDocumentOp(envelopeId, { verzenderEmail } = {}) {
      const { basisUrl, token } = await verbind(verzenderEmail, { terugval: true })
      const response = await f(`${envelopUrl(basisUrl, envelopeId)}/documents/combined`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      })
      if (!response.ok) throw await antwoordFout(response, 'DocuSign-document ophalen')
      return Buffer.from(await response.arrayBuffer())
    },

    /**
     * Een verstuurde envelop intrekken (void). Onomkeerbaar: de ondertekenaar kan
     * niet meer tekenen en krijgt een mail van DocuSign met de reden. Alleen na een
     * bevestiging in de app. Op naam van de verzender, zonder terugval.
     * @param {string} envelopeId
     * @param {{ reden: string, verzenderEmail: string | null | undefined }} opties
     */
    async trekEnvelopIn(envelopeId, { reden, verzenderEmail }) {
      const tekst = String(reden ?? '').trim()
      if (!tekst) throw new Error('Een reden om in te trekken is verplicht (DocuSign stuurt hem naar de ondertekenaar).')
      const { basisUrl, token } = await verbind(verzenderEmail, { terugval: false })
      const response = await f(envelopUrl(basisUrl, envelopeId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'voided', voidedReason: tekst.slice(0, 200) }),
      })
      if (!response.ok) throw await antwoordFout(response, 'DocuSign-envelop intrekken')
    },

    /**
     * Werkt de inlog van de koppelgebruiker en hoort het account-ID erbij? Verstuurt
     * niets en gooit nooit. Let op: een token van minder dan een uur oud wordt
     * hergebruikt (`vergeetTokens()` dwingt een nieuwe inlog af).
     * @returns {Promise<KoppelingStand>}
     */
    async controleerKoppeling() {
      const start = Date.now()
      const gecontroleerdOp = new Date().toISOString()
      if (!config.privateKey) return { status: 'niet_ingesteld', gecontroleerdOp }
      try {
        const h = metTimeout(HEALTH_TIMEOUT_MS)
        const token = await haalToegangstokenOp(config, h)
        await haalAccountBasisUrlOp(config, token, h)
        return { status: 'ok', latentieMs: Date.now() - start, gecontroleerdOp }
      } catch (error) {
        return {
          status: 'fout',
          latentieMs: Date.now() - start,
          foutmelding: error instanceof Error ? error.message : 'Onbekende fout',
          gecontroleerdOp,
        }
      }
    },

    /**
     * "Kan de app op naam van deze persoon versturen?" Doorloopt de stappen van
     * een echte verzending tot en met het token op naam, en stopt vóór de envelop.
     * Gooit nooit.
     * @param {string | null | undefined} email
     * @returns {Promise<VerzenderStand>}
     */
    async controleerVerzender(email) {
      const gecontroleerdOp = new Date().toISOString()
      const adres = email?.trim() || null
      if (!config.privateKey) return { status: 'niet_ingesteld', email: adres, gecontroleerdOp }
      try {
        await verbind(adres, { terugval: false, fetchImpl: metTimeout(HEALTH_TIMEOUT_MS) })
        return { status: 'ok', email: adres, gecontroleerdOp }
      } catch (error) {
        if (error instanceof DocusignVerzenderFout) {
          return {
            status: STAND_VAN_REDEN[error.reden],
            email: adres,
            boodschap: error.message,
            ...(error.profiel && { profiel: error.profiel }),
            gecontroleerdOp,
          }
        }
        return { status: 'fout', email: adres, foutmelding: error instanceof Error ? error.message : 'Onbekende fout', gecontroleerdOp }
      }
    },

    /**
     * Geeft een gebruiker met een Viewer-profiel het Sender-profiel. Raakt alleen
     * een Viewer aan. Gooit `DocusignProfielFout` bij een probleem met het hele
     * account (koppelgebruiker geen DS Admin, geen of meer dan één Sender-profiel).
     * Alleen aanroepen op een klik van een beheerder van de app.
     * @param {string} email
     * @returns {Promise<{ uitkomst: 'gegeven' | 'al_verzender' | 'geen_account', profiel: string }>}
     */
    async geefVerzendrecht(email) {
      if (!config.privateKey) throw new DocusignNietIngesteld()
      const koppelToken = await haalToegangstokenOp(config, f)
      const basisUrl = await haalAccountBasisUrlOp(config, koppelToken, f)
      const gebruiker = await zoekDocusignGebruiker(basisUrl, config.accountId, koppelToken, email, f)
      if (!gebruiker) return { uitkomst: 'geen_account', profiel: '' }
      if (magVersturen(gebruiker.profiel)) return { uitkomst: 'al_verzender', profiel: gebruiker.profiel }
      const sender = vindVerzendProfiel(await haalProfielenOp(basisUrl, config.accountId, koppelToken, f))
      await zetProfiel(basisUrl, config.accountId, koppelToken, gebruiker.userId, sender.id, f)
      return { uitkomst: 'gegeven', profiel: sender.naam }
    },
  }
}

/** @typedef {ReturnType<typeof maakDocusign>} Docusign */
