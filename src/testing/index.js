// Testhulp voor apps die de bouwsteen gebruiken: een nep-DocuSign op localhost
// (inlogdienst én REST tegelijk, zet `DOCUSIGN_OAUTH_BASE_URL` op `nep.url`), een
// testsleutel en een ondertekende Connect-levering voor de webhook.
//
// Uit mit-rental (test/docusign.test.js), algemeen gemaakt. De nep controleert
// de handtekening van elke JWT echt, kent per gebruiker een eigen token, en laat
// per gebruiker toestemming en profiel zetten. Alleen voor tests: importeer dit
// nooit vanuit app-code (`@motrac/docusign/testing`).
import { Buffer } from 'node:buffer'
import { createHmac, createVerify, generateKeyPairSync, randomUUID } from 'node:crypto'
import http from 'node:http'

/**
 * Een RSA-sleutelpaar zoals DocuSign het verwacht, en de privésleutel zoals hij
 * in `DOCUSIGN_PRIVATE_KEY_BASE64` staat.
 */
export function maakTestSleutel() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKey, publicKey, privateKeyBase64: Buffer.from(privateKey).toString('base64') }
}

/**
 * De claims van een JWT als de handtekening klopt, anders null.
 * @param {string} jwt
 * @param {string} publicKey PEM
 * @returns {Record<string, any> | null}
 */
export function controleerJwt(jwt, publicKey) {
  const [kop, inhoud, handtekening] = String(jwt).split('.')
  if (!kop || !inhoud || !handtekening) return null
  const v = createVerify('RSA-SHA256')
  v.update(`${kop}.${inhoud}`)
  return v.verify(publicKey, Buffer.from(handtekening, 'base64url')) ? JSON.parse(Buffer.from(inhoud, 'base64url').toString('utf8')) : null
}

/**
 * @typedef {object} NepGebruiker
 * @property {string} email
 * @property {string} [id] DocuSign-gebruikers-ID (standaard een UUID)
 * @property {string} [profiel] permissionProfileName (standaard "DocuSign Sender")
 * @property {boolean} [toestemming] false = `consent_required` bij inloggen
 */

/**
 * @typedef {object} NepVerzoek
 * @property {string} methode
 * @property {string} pad
 * @property {string | undefined} auth
 * @property {string} body
 */

/**
 * Start een nep-DocuSign. Gebruik `nep.config` (of `nep.env`) in de app.
 * @param {object} [opties]
 * @param {string} [opties.accountId]
 * @param {string} [opties.integrationKey]
 * @param {string} [opties.koppelgebruikerId] de `DOCUSIGN_USER_ID`
 * @param {NepGebruiker[]} [opties.gebruikers] de mensen die op naam versturen
 * @param {ReturnType<typeof maakTestSleutel>} [opties.sleutel]
 * @param {string} [opties.hmacKey]
 */
export async function startNepDocusign(opties = {}) {
  const sleutel = opties.sleutel ?? maakTestSleutel()
  const accountId = opties.accountId ?? '11111111-2222-3333-4444-555555555555'
  const integrationKey = opties.integrationKey ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const koppelId = opties.koppelgebruikerId ?? '99999999-8888-7777-6666-555555555555'
  const hmacKey = opties.hmacKey ?? 'test-hmac-sleutel'

  /** @type {Map<string, { id: string, email: string, profiel: string, toestemming: boolean, token: string }>} op e-mail (kleine letters) */
  const gebruikers = new Map()
  /** @param {NepGebruiker} g */
  const voegToe = (g) => {
    const id = g.id ?? randomUUID()
    gebruikers.set(g.email.toLowerCase(), { id, email: g.email, profiel: g.profiel ?? 'DocuSign Sender', toestemming: g.toestemming ?? true, token: `tok-${id}` })
  }
  for (const g of opties.gebruikers ?? []) voegToe(g)
  const koppelToken = `tok-${koppelId}`
  const viaId = (/** @type {string} */ id) => [...gebruikers.values()].find((g) => g.id === id)
  const geldig = (/** @type {string} */ token) => token === koppelToken || [...gebruikers.values()].some((g) => g.token === token)

  /** @type {NepVerzoek[]} */
  const verzoeken = []
  /** @type {Array<{ id: string, auth: string | undefined, body: any, status: string, voidedReason?: string }>} */
  const envelopen = []
  /** @type {{ status: number, errorCode: string } | null} */
  let envelopFout = null
  /** @type {{ status: number, errorCode: string } | null} */
  let profielFout = null
  let profielLijst = [
    { permissionProfileId: 'pp-viewer', permissionProfileName: 'DS Viewer' },
    { permissionProfileId: 'pp-sender', permissionProfileName: 'DS Sender' },
    { permissionProfileId: 'pp-admin', permissionProfileName: 'DS Admin' },
  ]
  let documentFout = false
  const PDF = Buffer.from('%PDF-1.4 nep getekend')

  const server = http.createServer((req, res) => {
    /** @type {Buffer[]} */
    const delen = []
    req.on('data', (c) => delen.push(c))
    req.on('end', () => {
      const body = Buffer.concat(delen).toString('utf8')
      verzoeken.push({ methode: req.method ?? '', pad: req.url ?? '', auth: req.headers.authorization, body })
      const stuur = (/** @type {number} */ status, /** @type {unknown} */ json) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(json))
      }
      const url = new URL(req.url ?? '/', 'http://nep')
      const basis = `http://${req.headers.host}`

      if (url.pathname === '/oauth/token') {
        const claims = controleerJwt(new URLSearchParams(body).get('assertion') ?? '', sleutel.publicKey)
        if (!claims || claims.iss !== integrationKey || claims.scope !== 'signature impersonation') {
          return stuur(400, { error: 'invalid_grant', error_description: 'ongeldige JWT' })
        }
        if (claims.sub === koppelId) return stuur(200, { access_token: koppelToken, expires_in: 3600 })
        const g = viaId(claims.sub)
        if (!g) return stuur(400, { error: 'invalid_grant', error_description: 'onbekende gebruiker' })
        if (!g.toestemming) return stuur(400, { error: 'consent_required' })
        return stuur(200, { access_token: g.token, expires_in: 3600 })
      }
      const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
      if (!geldig(token)) return stuur(401, { errorCode: 'AUTHORIZATION_INVALID_TOKEN' })
      if (url.pathname === '/oauth/userinfo') {
        return stuur(200, { email: 'koppel@motrac.nl', accounts: [{ account_id: accountId, account_name: 'Motrac test', base_uri: basis, is_default: true }] })
      }
      const api = `/restapi/v2.1/accounts/${accountId}`
      if (req.method === 'GET' && url.pathname === `${api}/users`) {
        const g = gebruikers.get((url.searchParams.get('email') ?? '').toLowerCase())
        return stuur(200, { users: g ? [{ userId: g.id, email: g.email, userStatus: 'Active', permissionProfileName: g.profiel }] : [] })
      }
      if (req.method === 'GET' && url.pathname === `${api}/permission_profiles`) {
        if (profielFout) return stuur(profielFout.status, { errorCode: profielFout.errorCode })
        return stuur(200, { permissionProfiles: profielLijst })
      }
      const gebruikerPut = new RegExp(`^${api}/users/([^/]+)$`).exec(url.pathname)
      if (req.method === 'PUT' && gebruikerPut) {
        if (profielFout) return stuur(profielFout.status, { errorCode: profielFout.errorCode })
        const g = viaId(decodeURIComponent(gebruikerPut[1]))
        const p = profielLijst.find((x) => x.permissionProfileId === JSON.parse(body).permissionProfileId)
        if (!g || !p) return stuur(400, { errorCode: 'INVALID_REQUEST_PARAMETER' })
        g.profiel = p.permissionProfileName
        return stuur(200, { userId: g.id })
      }
      if (req.method === 'POST' && url.pathname === `${api}/envelopes`) {
        if (envelopFout) return stuur(envelopFout.status, { errorCode: envelopFout.errorCode, message: 'geweigerd door de nep' })
        const json = JSON.parse(body)
        const id = `env-${envelopen.length + 1}`
        envelopen.push({ id, auth: req.headers.authorization, body: json, status: json.status })
        return stuur(201, { envelopeId: id, status: json.status })
      }
      const doc = new RegExp(`^${api}/envelopes/([^/]+)/documents/combined$`).exec(url.pathname)
      if (req.method === 'GET' && doc) {
        if (documentFout) return stuur(500, { errorCode: 'INTERNAL_ERROR' })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/pdf')
        return res.end(PDF)
      }
      const env = new RegExp(`^${api}/envelopes/([^/]+)$`).exec(url.pathname)
      if (env) {
        const e = envelopen.find((x) => x.id === decodeURIComponent(env[1]))
        if (!e) return stuur(404, { errorCode: 'ENVELOPE_DOES_NOT_EXIST' })
        if (req.method === 'PUT') {
          const wijziging = JSON.parse(body)
          if (wijziging.status === 'voided') Object.assign(e, { status: 'voided', voidedReason: wijziging.voidedReason })
          return stuur(200, { envelopeId: e.id })
        }
        return stuur(200, { envelopeId: e.id, status: e.status, ...(e.voidedReason && { voidedReason: e.voidedReason }) })
      }
      stuur(404, { message: 'onbekend in de nep' })
    })
  })
  await new Promise((klaar) => server.listen(0, '127.0.0.1', () => klaar(undefined)))
  const adres = /** @type {import('node:net').AddressInfo} */ (server.address())
  const nepUrl = `http://127.0.0.1:${adres.port}`

  return {
    url: nepUrl,
    sleutel,
    hmacKey,
    /** Voor `maakDocusign(nep.config)`. */
    config: {
      oauthBaseUrl: nepUrl,
      accountId,
      integrationKey,
      userId: koppelId,
      privateKey: sleutel.privateKey,
      webhookHmacKey: hmacKey,
    },
    /** Voor een app die `docusignConfig(process.env)` leest. */
    env: {
      DOCUSIGN_OAUTH_BASE_URL: nepUrl,
      DOCUSIGN_ACCOUNT_ID: accountId,
      DOCUSIGN_INTEGRATION_KEY: integrationKey,
      DOCUSIGN_USER_ID: koppelId,
      DOCUSIGN_PRIVATE_KEY_BASE64: sleutel.privateKeyBase64,
      DOCUSIGN_WEBHOOK_HMAC_KEY: hmacKey,
    },
    verzoeken,
    envelopen,
    voegGebruikerToe: voegToe,
    /** @param {string} email @param {string} profiel */
    zetProfiel: (email, profiel) => {
      const g = gebruikers.get(email.toLowerCase())
      if (g) g.profiel = profiel
    },
    /** @param {string} email */
    profielVan: (email) => gebruikers.get(email.toLowerCase())?.profiel,
    /** @param {string} email @param {boolean} aan */
    zetToestemming: (email, aan) => {
      const g = gebruikers.get(email.toLowerCase())
      if (g) g.toestemming = aan
    },
    /** De envelop-POST's weigeren met deze fout (null = weer normaal). */
    zetEnvelopFout: (/** @type {{ status: number, errorCode: string } | null} */ fout) => {
      envelopFout = fout
    },
    zetProfielFout: (/** @type {{ status: number, errorCode: string } | null} */ fout) => {
      profielFout = fout
    },
    zetProfielLijst: (/** @type {Array<{ permissionProfileId: string, permissionProfileName: string }>} */ lijst) => {
      profielLijst = lijst
    },
    zetDocumentFout: (/** @type {boolean} */ aan) => {
      documentFout = aan
    },
    /** Het token waarmee een envelop is gemaakt hoort bij deze gebruiker. */
    tokenVan: (/** @type {string} */ email) => gebruikers.get(email.toLowerCase())?.token,
    koppelToken,
    /** Een Connect-levering voor de webhook van de app, met geldige handtekening. */
    levering: (/** @type {Omit<Parameters<typeof connectLevering>[0], 'hmacKey'>} */ invoer) => connectLevering({ ...invoer, hmacKey }),
    stop: () => new Promise((klaar) => server.close(() => klaar(undefined))),
  }
}

/**
 * Een Connect-levering (JSON SIM) zoals DocuSign hem stuurt, met de
 * `X-DocuSign-Signature-N`-kop(pen). `extraSleutels` zet er koppen vóór met andere
 * sleutels, om te toetsen dat de app alle koppen controleert.
 * @param {object} invoer
 * @param {string} invoer.envelopeId
 * @param {string} invoer.event bv. 'envelope-completed'
 * @param {string} invoer.hmacKey
 * @param {Record<string, unknown>} [invoer.envelopeSummary]
 * @param {string} [invoer.generatedDateTime]
 * @param {string[]} [invoer.extraSleutels]
 * @returns {{ body: string, headers: Record<string, string> }}
 */
export function connectLevering({ envelopeId, event, hmacKey, envelopeSummary = {}, generatedDateTime, extraSleutels = [] }) {
  const body = JSON.stringify({
    event,
    apiVersion: 'v2.1',
    uri: `/restapi/v2.1/accounts/x/envelopes/${envelopeId}`,
    retryCount: 0,
    configurationId: 1,
    generatedDateTime: generatedDateTime ?? new Date().toISOString(),
    data: { accountId: 'x', envelopeId, envelopeSummary },
  })
  const teken = (/** @type {string} */ k) => createHmac('sha256', k).update(body).digest('base64')
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json' }
  ;[...extraSleutels, hmacKey].forEach((k, i) => {
    headers[`x-docusign-signature-${i + 1}`] = teken(k)
  })
  return { body, headers }
}
