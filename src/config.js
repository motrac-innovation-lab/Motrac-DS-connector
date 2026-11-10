// De koppeling uit de omgevingsvariabelen. Alleen geheimen en echte
// omgevingsverschillen staan in de env (besluit Mark 2026-09-29); dezelfde namen
// als in mit-contractenbeheer en mit-rental, zodat Mark één set uitgeeft.
//
// Meldingen noemen alleen namen van variabelen, nooit de waarden.
import { Buffer } from 'node:buffer'

/** De demo-inlogdienst; productie is https://account.docusign.com. */
export const DEMO_OAUTH_BASE_URL = 'https://account-d.docusign.com'
export const PRODUCTIE_OAUTH_BASE_URL = 'https://account.docusign.com'

/** De variabelen die de koppeling nodig heeft om te versturen. */
export const VERPLICHTE_ENV = /** @type {const} */ ([
  'DOCUSIGN_ACCOUNT_ID',
  'DOCUSIGN_INTEGRATION_KEY',
  'DOCUSIGN_USER_ID',
  'DOCUSIGN_PRIVATE_KEY_BASE64',
])

/** Alle variabelen die de bouwsteen leest. */
export const ALLE_ENV = /** @type {const} */ ([
  'DOCUSIGN_OAUTH_BASE_URL',
  ...VERPLICHTE_ENV,
  'DOCUSIGN_WEBHOOK_HMAC_KEY',
])

/**
 * @typedef {object} DocusignConfig
 * @property {string} oauthBaseUrl inlogdienst zonder slash aan het eind
 * @property {string} accountId API Account ID
 * @property {string} integrationKey integratiesleutel van de DocuSign-app
 * @property {string} userId de koppelgebruiker: zoekt alleen op, verstuurt nooit
 * @property {string} privateKey PEM (PKCS#8, "BEGIN PRIVATE KEY")
 * @property {string} webhookHmacKey HMAC-sleutel van Connect; leeg = webhook uit
 */

/**
 * De PEM uit `DOCUSIGN_PRIVATE_KEY_BASE64`: base64 van de hele PEM op één regel
 * (een meerregelige PEM breekt het Environment-paneel). Staat er toch een PEM,
 * eventueel met letterlijke `\n`, dan mag dat ook. Leeg wordt ''.
 * @param {unknown} waarde
 * @returns {string}
 */
export function pemUitBase64(waarde) {
  const ruw = String(waarde ?? '').trim()
  if (!ruw) return ''
  if (ruw.startsWith('-----BEGIN')) return ruw.replace(/\\n/g, '\n')
  return Buffer.from(ruw, 'base64').toString('utf8')
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {DocusignConfig}
 */
export function docusignConfig(env = process.env) {
  const tekst = (/** @type {string} */ naam) => env[naam]?.trim() ?? ''
  return {
    oauthBaseUrl: (tekst('DOCUSIGN_OAUTH_BASE_URL') || DEMO_OAUTH_BASE_URL).replace(/\/+$/, ''),
    accountId: tekst('DOCUSIGN_ACCOUNT_ID'),
    integrationKey: tekst('DOCUSIGN_INTEGRATION_KEY'),
    userId: tekst('DOCUSIGN_USER_ID'),
    privateKey: pemUitBase64(env.DOCUSIGN_PRIVATE_KEY_BASE64),
    webhookHmacKey: tekst('DOCUSIGN_WEBHOOK_HMAC_KEY'),
  }
}

/**
 * Welke verplichte variabelen nog leeg zijn (alleen de namen).
 * `DOCUSIGN_OAUTH_BASE_URL` valt terug op demo en `DOCUSIGN_WEBHOOK_HMAC_KEY`
 * schakelt alleen de webhook; die tellen hier niet mee.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function ontbrekendeEnv(env = process.env) {
  return VERPLICHTE_ENV.filter((naam) => !env[naam]?.trim())
}

/** @param {Record<string, string | undefined>} [env] */
export const isIngesteld = (env = process.env) => ontbrekendeEnv(env).length === 0

/**
 * Demo of productie, afgeleid van de inlogdienst. Voor de stand in een
 * beheerscherm: "DocuSign (demo)" voorkomt dat iemand denkt dat het echt is.
 * @param {Pick<DocusignConfig, 'oauthBaseUrl'>} config
 * @returns {'demo' | 'productie' | 'anders'}
 */
export function omgevingVan(config) {
  const host = (() => {
    try {
      return new URL(config.oauthBaseUrl).host
    } catch {
      return ''
    }
  })()
  if (host === 'account-d.docusign.com') return 'demo'
  if (host === 'account.docusign.com') return 'productie'
  return 'anders'
}
