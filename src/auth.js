// Inloggen bij DocuSign met de JWT Grant (RFC 7523), server-naar-server.
// Samengevoegd uit mit-contractenbeheer (adapters/docusign/auth.ts) en
// mit-rental (lib/docusign/auth.js, met de tokencache).
//
// Een JWT, RS256-getekend met de privésleutel van de integratie, wordt
// ingewisseld voor een access token; `/oauth/userinfo` geeft het API-basisdomein
// bij het account-ID. Web Crypto tekent; geen SDK en geen `jsonwebtoken`.
//
// Token en basisdomein staan in het geheugen en worden hergebruikt zolang ze nog
// meer dan 60 s geldig zijn. Een fout wordt nooit bewaard.
import { Buffer } from 'node:buffer'
import { DocusignAuthFout, DocusignNietIngesteld, leesOAuthFout } from './fouten.js'

/** @typedef {{ oauthBaseUrl: string, integrationKey: string, userId: string, privateKey: string }} AuthConfig */

const base64url = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString('base64url')

/**
 * PEM (PKCS#8) naar DER-bytes voor `importKey`. Een PKCS#1-sleutel ("BEGIN RSA
 * PRIVATE KEY") eerst omzetten: `openssl pkcs8 -topk8 -nocrypt`.
 * @param {string} pem
 */
function pemNaarDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  return Buffer.from(b64, 'base64')
}

const ONGELDIGE_SLEUTEL =
  'DOCUSIGN_PRIVATE_KEY_BASE64 is geen geldige PKCS#8 RSA-sleutel (openssl pkcs8 -topk8 -nocrypt).'

/**
 * De JWT-assertion (RS256), een uur geldig, met scope `signature impersonation`
 * (nodig om namens een andere gebruiker te handelen).
 * @param {AuthConfig} config
 * @returns {Promise<string>}
 */
export async function bouwJwtAssertion(config) {
  if (!config.privateKey) throw new DocusignNietIngesteld()

  const nu = Math.floor(Date.now() / 1000)
  const kop = { alg: 'RS256', typ: 'JWT' }
  const inhoud = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: new URL(config.oauthBaseUrl).host,
    scope: 'signature impersonation',
    iat: nu,
    exp: nu + 3600,
  }
  const encoder = new TextEncoder()
  const tekenTekst = `${base64url(encoder.encode(JSON.stringify(kop)))}.${base64url(encoder.encode(JSON.stringify(inhoud)))}`

  let sleutel
  try {
    sleutel = await crypto.subtle.importKey(
      'pkcs8',
      pemNaarDer(config.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  } catch {
    throw new DocusignAuthFout(0, 'ongeldige_sleutel', ONGELDIGE_SLEUTEL)
  }
  const handtekening = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', sleutel, encoder.encode(tekenTekst))
  return `${tekenTekst}.${base64url(new Uint8Array(handtekening))}`
}

const MARGE_MS = 60_000
/** @type {Map<string, { token: string, verloopt: number }>} */
const tokenCache = new Map()
/** @type {Map<string, { basisUrl: string, verloopt: number }>} */
const basisUrlCache = new Map()

/** Beide caches leeg: na het wijzigen van de sleutel, en in tests. */
export function vergeetTokens() {
  tokenCache.clear()
  basisUrlCache.clear()
}

/**
 * Wisselt de JWT-assertion in voor een access token, of hergebruikt een bewaard
 * token dat nog meer dan 60 s geldig is.
 * @param {AuthConfig} config
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function haalToegangstokenOp(config, fetchImpl = fetch) {
  const sleutel = `${config.oauthBaseUrl}|${config.integrationKey}|${config.userId}`
  const bewaard = tokenCache.get(sleutel)
  if (bewaard && bewaard.verloopt > Date.now() + MARGE_MS) return bewaard.token

  const assertion = await bouwJwtAssertion(config)
  const response = await fetchImpl(`${config.oauthBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!response.ok) {
    const tekst = await response.text().catch(() => '')
    throw new DocusignAuthFout(response.status, leesOAuthFout(tekst), `DocuSign-authenticatie mislukt (${response.status}): ${tekst}`)
  }
  const data = await response.json()
  const duur = (Number(data.expires_in) || 3600) * 1000
  tokenCache.set(sleutel, { token: data.access_token, verloopt: Date.now() + duur })
  return data.access_token
}

/**
 * Het API-basisdomein bij het account-ID, uit `/oauth/userinfo`. DocuSign kent
 * geen vast domein per omgeving (behalve demo), dus dit is leidend en niet een
 * losse variabele. Hoort het account-ID niet bij de gebruiker, dan noemt de fout
 * de accounts die wel bestaan in plaats van een kale 401 bij de envelop.
 * @param {{ oauthBaseUrl: string, accountId: string, userId: string }} config
 * @param {string} accessToken
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} `${base_uri}/restapi`
 */
export async function haalAccountBasisUrlOp(config, accessToken, fetchImpl = fetch) {
  const sleutel = `${config.oauthBaseUrl}|${config.accountId}`
  const bewaard = basisUrlCache.get(sleutel)
  if (bewaard && bewaard.verloopt > Date.now() + MARGE_MS) return bewaard.basisUrl

  const response = await fetchImpl(`${config.oauthBaseUrl}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const tekst = await response.text().catch(() => '')
    throw new Error(`DocuSign-gebruikersinfo ophalen mislukt (${response.status}): ${tekst}`)
  }
  const data = await response.json()
  /** @type {Array<{ account_id: string, account_name: string, base_uri: string }>} */
  const accounts = data.accounts ?? []
  const account = accounts.find((a) => String(a.account_id).toLowerCase() === config.accountId.toLowerCase())
  if (!account) {
    const beschikbaar = accounts.map((a) => `${a.account_name} (${a.account_id})`).join(', ') || '(geen accounts gevonden)'
    throw new Error(
      `DOCUSIGN_ACCOUNT_ID '${config.accountId}' hoort niet bij DocuSign-gebruiker '${data.email ?? config.userId}'. ` +
        `Beschikbare accounts voor deze gebruiker: ${beschikbaar}.`,
    )
  }
  const basisUrl = `${account.base_uri}/restapi`
  basisUrlCache.set(sleutel, { basisUrl, verloopt: Date.now() + 3600 * 1000 })
  return basisUrl
}
