// De pure delen: configuratie, JWT, tabs, de envelop-body, de webhook, het
// testslot en de meldingen. Geen netwerk.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, mock, test } from 'node:test'
import {
  DocusignAuthFout,
  DocusignGeblokkeerd,
  DocusignInvoerFout,
  DocusignNietIngesteld,
  DocusignProfielFout,
  bouwAnkerTab,
  bouwEnvelopBody,
  bouwJwtAssertion,
  docusignConfig,
  geheugenClaim,
  maakClaim,
  magVersturen,
  metTestSlot,
  normaliseerConnect,
  omgevingVan,
  ontbrekendeEnv,
  pemUitBase64,
  testOntvangersUit,
  verifieerHandtekening,
  verifieerWebhook,
  verwerkWebhook,
  verzenderBoodschap,
  vindVerzendProfiel,
} from '../src/index.js'
import { connectLevering, controleerJwt, maakTestSleutel } from '../src/testing/index.js'

const sleutel = maakTestSleutel()

describe('configuratie', () => {
  test('docusignConfig leest de zes variabelen, standaard demo, en de sleutel uit base64', () => {
    const c = docusignConfig({
      DOCUSIGN_ACCOUNT_ID: ' acc ',
      DOCUSIGN_INTEGRATION_KEY: 'ik',
      DOCUSIGN_USER_ID: 'koppel',
      DOCUSIGN_PRIVATE_KEY_BASE64: sleutel.privateKeyBase64,
      DOCUSIGN_WEBHOOK_HMAC_KEY: 'h',
    })
    assert.equal(c.oauthBaseUrl, 'https://account-d.docusign.com')
    assert.equal(c.accountId, 'acc')
    assert.equal(c.privateKey, sleutel.privateKey)
    assert.equal(c.webhookHmacKey, 'h')
    assert.equal(docusignConfig({ DOCUSIGN_OAUTH_BASE_URL: 'https://account.docusign.com/' }).oauthBaseUrl, 'https://account.docusign.com')
  })

  test('pemUitBase64: base64, een PEM met \\n op één regel, of leeg', () => {
    assert.equal(pemUitBase64(sleutel.privateKeyBase64), sleutel.privateKey)
    assert.equal(pemUitBase64(sleutel.privateKey.replace(/\n/g, '\\n')), sleutel.privateKey)
    assert.equal(pemUitBase64(''), '')
    assert.equal(pemUitBase64(undefined), '')
  })

  test('ontbrekendeEnv noemt alleen namen; oauth-URL en HMAC tellen niet mee', () => {
    assert.deepEqual(ontbrekendeEnv({}), ['DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_PRIVATE_KEY_BASE64'])
    assert.deepEqual(ontbrekendeEnv({ DOCUSIGN_ACCOUNT_ID: 'a', DOCUSIGN_INTEGRATION_KEY: 'b', DOCUSIGN_USER_ID: 'c', DOCUSIGN_PRIVATE_KEY_BASE64: ' ' }), ['DOCUSIGN_PRIVATE_KEY_BASE64'])
  })

  test('omgevingVan', () => {
    assert.equal(omgevingVan({ oauthBaseUrl: 'https://account-d.docusign.com' }), 'demo')
    assert.equal(omgevingVan({ oauthBaseUrl: 'https://account.docusign.com' }), 'productie')
    assert.equal(omgevingVan({ oauthBaseUrl: 'http://127.0.0.1:1234' }), 'anders')
  })
})

describe('de JWT', () => {
  test('RS256-getekend, met app, gebruiker, inlogdienst, bereik en een uur geldig', async () => {
    const jwt = await bouwJwtAssertion({ oauthBaseUrl: 'https://account-d.docusign.com', integrationKey: 'ik', userId: 'u', privateKey: sleutel.privateKey })
    const claims = controleerJwt(jwt, sleutel.publicKey)
    assert.ok(claims)
    assert.deepEqual(
      { iss: claims.iss, sub: claims.sub, aud: claims.aud, scope: claims.scope, duur: claims.exp - claims.iat },
      { iss: 'ik', sub: 'u', aud: 'account-d.docusign.com', scope: 'signature impersonation', duur: 3600 },
    )
  })

  test('zonder sleutel: DocusignNietIngesteld; een ongeldige sleutel: ongeldige_sleutel zonder de waarde', async () => {
    const basis = { oauthBaseUrl: 'https://x.nl', integrationKey: 'ik', userId: 'u' }
    await assert.rejects(() => bouwJwtAssertion({ ...basis, privateKey: '' }), DocusignNietIngesteld)
    await assert.rejects(
      () => bouwJwtAssertion({ ...basis, privateKey: 'geheim-maar-geen-pem' }),
      (e) => e instanceof DocusignAuthFout && e.oauthFout === 'ongeldige_sleutel' && !e.message.includes('geheim-maar-geen-pem'),
    )
  })
})

describe('tabs', () => {
  test('alles als string, eenheid pixels, offsets begrensd op A4', () => {
    const w = mock.method(console, 'warn', () => {})
    try {
      assert.deepEqual(bouwAnkerTab({ soort: 'signHere', documentId: '1', anker: '/x/' }), {
        documentId: '1', anchorString: '/x/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0',
      })
      assert.equal(w.mock.callCount(), 0)
      const te = bouwAnkerTab({ soort: 'text', documentId: '1', anker: '/x/', xOffset: 10_000, yOffset: -10_000 })
      assert.deepEqual([te.anchorXOffset, te.anchorYOffset], ['475', '-822'])
      assert.equal(w.mock.callCount(), 1, 'geclampt = waarschuwing')
    } finally {
      w.mock.restore()
    }
  })
})

describe('de envelop-body', () => {
  const HTML = '<p>Contract</p><span>/sig1/</span><span>/datum1/</span>'
  const basis = () => ({
    onderwerp: 'Contract ter ondertekening',
    bericht: 'Graag tekenen.',
    documenten: [{ naam: 'Contract', soort: /** @type {const} */ ('html'), inhoud: HTML }],
    ondertekenaars: [{ naam: 'Klant', email: 'klant@x.nl', velden: [{ soort: /** @type {const} */ ('signHere'), anker: '/sig1/' }, { soort: /** @type {const} */ ('dateSigned'), anker: '/datum1/', y: 38 }] }],
  })
  const faalt = (/** @type {any} */ invoer, /** @type {RegExp} */ patroon) =>
    assert.throws(() => bouwEnvelopBody(invoer), (e) => e instanceof DocusignInvoerFout && patroon.test(e.message))

  test('één HTML-document, één ondertekenaar: de vorm die DocuSign verwacht', () => {
    const { body } = bouwEnvelopBody(basis())
    assert.equal(body.status, 'sent')
    assert.equal(body.emailSubject, 'Contract ter ondertekening')
    assert.equal(body.emailBlurb, 'Graag tekenen.')
    const docs = /** @type {any[]} */ (body.documents)
    assert.deepEqual(docs.map((d) => [d.name, d.fileExtension, d.documentId]), [['Contract.html', 'html', '1']])
    assert.equal(Buffer.from(docs[0].documentBase64, 'base64').toString('utf8'), HTML)
    const signer = /** @type {any} */ (body.recipients).signers[0]
    assert.deepEqual([signer.email, signer.name, signer.recipientId, signer.routingOrder], ['klant@x.nl', 'Klant', '1', '1'])
    assert.equal(signer.tabs.signHereTabs[0].anchorString, '/sig1/')
    assert.equal(signer.tabs.dateSignedTabs[0].anchorYOffset, '38')
  })

  test('concept, lang onderwerp afgekapt op 100, text-veld met label en breedte', () => {
    const invoer = basis()
    invoer.onderwerp = 'x'.repeat(150)
    const { body } = bouwEnvelopBody({
      ...invoer,
      versturen: false,
      ondertekenaars: [{ ...invoer.ondertekenaars[0], velden: [...invoer.ondertekenaars[0].velden, { soort: 'text', anker: '/sig1/', label: 'inkooporder', breedte: 240, y: 60 }] }],
    })
    assert.equal(body.status, 'created')
    assert.equal(String(body.emailSubject).length, 100)
    const tekst = /** @type {any} */ (body.recipients).signers[0].tabs.textTabs[0]
    assert.deepEqual([tekst.tabLabel, tekst.required, tekst.width], ['inkooporder', 'false', '240'])
  })

  test('meerdere documenten (docx en pdf als bytes), elk een eigen anker', () => {
    const { body } = bouwEnvelopBody({
      onderwerp: 'Twee trucks',
      documenten: [
        { naam: 'Truck A.docx', soort: 'docx', inhoud: new Uint8Array([1, 2, 3]) },
        { naam: 'Truck B', soort: 'pdf', inhoud: new Uint8Array([4, 5]) },
      ],
      ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'signHere', anker: '/sig1/', document: 1 }, { soort: 'signHere', anker: '/sig2/', document: 2 }] }],
    })
    const docs = /** @type {any[]} */ (body.documents)
    assert.deepEqual(docs.map((d) => d.name), ['Truck A.docx', 'Truck B.pdf'])
    assert.deepEqual(/** @type {any} */ (body.recipients).signers[0].tabs.signHereTabs.map((/** @type {any} */ t) => [t.anchorString, t.documentId]), [['/sig1/', '1'], ['/sig2/', '2']])
  })

  test("cc's: leeg, dubbel of gelijk aan een ondertekenaar valt weg; ids lopen door", () => {
    const { body } = bouwEnvelopBody({
      ...basis(),
      ccs: [{ naam: 'CB', email: 'cb@motrac.nl' }, { naam: 'Klant', email: 'KLANT@x.nl' }, { naam: 'nog eens', email: 'cb@motrac.nl' }, { naam: '', email: '' }, { naam: '', email: 'ander@x.nl' }],
    })
    assert.deepEqual(/** @type {any} */ (body.recipients).carbonCopies.map((/** @type {any} */ c) => [c.email, c.name, c.recipientId]), [['cb@motrac.nl', 'CB', '2'], ['ander@x.nl', 'ander@x.nl', '3']])
  })

  test('wat DocuSign anders pas bij versturen weigert, wordt vooraf geweigerd', () => {
    faalt({ ...basis(), onderwerp: ' ' }, /onderwerp/)
    faalt({ ...basis(), documenten: [] }, /geen document/)
    faalt({ ...basis(), documenten: [{ naam: 'a', soort: 'txt', inhoud: 'x' }] }, /html, docx of pdf/)
    faalt({ ...basis(), documenten: [{ naam: 'a', soort: 'html', inhoud: '' }] }, /leeg/)
    faalt({ ...basis(), ondertekenaars: [] }, /geen ondertekenaar/)
    faalt({ ...basis(), ondertekenaars: [{ naam: 'K', email: 'geen-adres', velden: [{ soort: 'signHere', anker: '/sig1/' }] }] }, /e-mailadres/)
    faalt({ ...basis(), ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'dateSigned', anker: '/datum1/' }] }] }, /handtekeningveld/)
    faalt({ ...basis(), ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'signHere', anker: '/bestaat-niet/' }] }] }, /staat niet in document 1/)
    faalt({ ...basis(), ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'signHere', anker: '/sig1/', document: 2 }] }] }, /document 2, dat niet bestaat/)
    faalt({ ...basis(), ccs: [{ naam: 'x', email: 'kapot' }] }, /cc-adres/)
  })

  test('een anker hoort bij één document (DocuSign zoekt het in alle documenten)', () => {
    const twee = [
      { naam: 'A', soort: /** @type {const} */ ('html'), inhoud: '<p>/sig/</p>' },
      { naam: 'B', soort: /** @type {const} */ ('html'), inhoud: '<p>/sig/</p>' },
    ]
    faalt({ onderwerp: 'x', documenten: twee, ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'signHere', anker: '/sig/', document: 1 }] }] }, /staat ook in document 2/)
    faalt(
      { onderwerp: 'x', documenten: [twee[0], { naam: 'B', soort: 'docx', inhoud: new Uint8Array([1]) }], ondertekenaars: [{ naam: 'K', email: 'k@x.nl', velden: [{ soort: 'signHere', anker: '/sig/', document: 1 }, { soort: 'signHere', anker: '/sig/', document: 2 }] }] },
      /staat op document 1 en 2/,
    )
  })
})

describe('de webhook: handtekening en body', () => {
  const body = '{"event":"envelope-completed","data":{"envelopeId":"e1"}}'
  const teken = (/** @type {string} */ b, k = 'sleutel') => createHmac('sha256', k).update(b).digest('base64')

  test('één handtekening: klopt of niet; leeg, lijst of zonder sleutel nooit', () => {
    assert.equal(verifieerHandtekening(body, teken(body), 'sleutel'), true)
    assert.equal(verifieerHandtekening(Buffer.from(body), teken(body), 'sleutel'), true)
    assert.equal(verifieerHandtekening(`${body} `, teken(body), 'sleutel'), false)
    assert.equal(verifieerHandtekening(body, teken(body, 'ander'), 'sleutel'), false)
    assert.equal(verifieerHandtekening(body, 'kort', 'sleutel'), false)
    assert.equal(verifieerHandtekening(body, undefined, 'sleutel'), false)
    assert.equal(verifieerHandtekening(body, [teken(body)], 'sleutel'), false)
    assert.equal(verifieerHandtekening(body, teken(body, ''), ''), false)
  })

  test('alle X-DocuSign-Signature-N-koppen, als object of als Headers', () => {
    const koppen = { 'x-docusign-signature-1': teken(body, 'andere-app'), 'x-docusign-signature-2': teken(body) }
    assert.equal(verifieerWebhook(body, koppen, 'sleutel'), true, 'de tweede kop is de onze')
    assert.equal(verifieerWebhook(body, new Headers(koppen), 'sleutel'), true)
    assert.equal(verifieerWebhook(body, { 'x-docusign-signature-1': teken(body, 'andere-app') }, 'sleutel'), false)
    assert.equal(verifieerWebhook(body, { 'x-andere-kop': teken(body) }, 'sleutel'), false)
  })

  test('Connect JSON SIM wordt een neutraal event, met tijdstippen en reden', () => {
    assert.deepEqual(
      normaliseerConnect({
        event: 'envelope-completed',
        generatedDateTime: '2026-11-10T10:00:05.123Z',
        data: { envelopeId: 'e1', envelopeSummary: { sentDateTime: '2026-11-09T09:00:00Z', completedDateTime: '2026-11-10T10:00:00+01:00', statusChangedDateTime: '2026-11-10T10:00:00Z' } },
      }),
      { envelopeId: 'e1', event: 'completed', eventId: 'envelope-completed', tijdstip: '2026-11-10T10:00:00+01:00', verzondenOp: '2026-11-09T09:00:00Z', getekendOp: '2026-11-10T10:00:00+01:00', reden: null },
    )
    const ingetrokken = normaliseerConnect({ event: 'envelope-voided', data: { envelopeId: 'e1', envelopeSummary: { voidedReason: 'Envelope has expired.' } } })
    assert.deepEqual(ingetrokken && ingetrokken !== 'GENEGEERD' && [ingetrokken.event, ingetrokken.reden, ingetrokken.tijdstip], ['voided', 'Envelope has expired.', null])
    for (const [connect, neutraal] of [['envelope-sent', 'sent'], ['envelope-delivered', 'delivered'], ['envelope-declined', 'declined']]) {
      assert.equal(/** @type {any} */ (normaliseerConnect({ event: connect, data: { envelopeId: 'e' } })).event, neutraal)
    }
  })

  test("'infinity' en andere niet-ISO-tijdstippen worden null, niet doorgegeven", () => {
    const e = /** @type {any} */ (normaliseerConnect({ event: 'envelope-completed', generatedDateTime: 'infinity', data: { envelopeId: 'e1', envelopeSummary: { completedDateTime: 'now' } } }))
    assert.deepEqual([e.tijdstip, e.getekendOp], [null, null])
  })

  test('een event dat ons niet aangaat is GENEGEERD, rommel is null', () => {
    assert.equal(normaliseerConnect({ event: 'recipient-sent', data: { envelopeId: 'e1' } }), 'GENEGEERD')
    assert.equal(normaliseerConnect({ event: 'envelope-resent', data: { envelopeId: 'e1' } }), 'GENEGEERD')
    for (const rommel of [null, undefined, 'x', 42, [], {}, { event: 'envelope-sent' }, { event: 'envelope-sent', data: {} }, { event: 'envelope-sent', data: { envelopeId: '' } }, { envelopeId: 'e1' }]) {
      assert.equal(normaliseerConnect(rommel), null, JSON.stringify(rommel))
    }
  })
})

describe('verwerkWebhook', () => {
  const HMAC = 'sleutel'
  const lever = (/** @type {string} */ event, envelopeId = 'e1', extra = {}) => connectLevering({ envelopeId, event, hmacKey: HMAC, ...extra })
  const run = (/** @type {{ body: string, headers: Record<string, string> }} */ l, /** @type {any} */ opties = {}) =>
    verwerkWebhook({ ruweBody: l.body, headers: l.headers, hmacKey: HMAC, claim: opties.claim ?? geheugenClaim(), verwerk: opties.verwerk ?? (async () => {}) })

  test('verwerkt een geldige levering één keer; een tweede levering is dubbel', async () => {
    const claim = geheugenClaim()
    /** @type {any[]} */
    const gezien = []
    const verwerk = async (/** @type {any} */ e) => { gezien.push(e.event) }
    const l = lever('envelope-completed')
    assert.deepEqual((await run(l, { claim, verwerk })).uitkomst, 'verwerkt')
    assert.deepEqual((await run(l, { claim, verwerk })).uitkomst, 'dubbel')
    assert.deepEqual(gezien, ['completed'])
  })

  test('gelijktijdige leveringen: één effect', async () => {
    const claim = geheugenClaim()
    let aantal = 0
    const verwerk = async () => { aantal += 1; await new Promise((r) => setTimeout(r, 10)) }
    const l = lever('envelope-completed')
    const uitkomsten = await Promise.all([run(l, { claim, verwerk }), run(l, { claim, verwerk }), run(l, { claim, verwerk })])
    assert.equal(aantal, 1)
    assert.deepEqual(uitkomsten.map((u) => u.status), [204, 204, 204])
  })

  test('mislukt de verwerking: 500 en de claim is weer vrij, zodat DocuSign opnieuw levert', async () => {
    const claim = geheugenClaim()
    const l = lever('envelope-completed')
    const mis = await run(l, { claim, verwerk: async () => { throw new Error('database weg') } })
    assert.equal(mis.status, 500)
    assert.match(String(/** @type {Error} */ (mis.fout).message), /database weg/)
    assert.equal(claim.aantal(), 0)
    assert.equal((await run(l, { claim })).uitkomst, 'verwerkt')
  })

  test('een envelop van een andere app: 204 en de claim blijft niet staan', async () => {
    const claim = geheugenClaim()
    const u = await run(lever('envelope-completed'), { claim, verwerk: async () => 'onbekende_envelop' })
    assert.deepEqual([u.status, u.uitkomst, claim.aantal()], [204, 'onbekende_envelop', 0])
  })

  test('geen sleutel 503, foute handtekening 401, geen JSON of ander formaat 400, ander event 204', async () => {
    const l = lever('envelope-completed')
    assert.equal((await verwerkWebhook({ ruweBody: l.body, headers: l.headers, hmacKey: '', claim: geheugenClaim(), verwerk: async () => {} })).status, 503)
    assert.equal((await run({ body: l.body, headers: { 'x-docusign-signature-1': 'fout' } })).status, 401)
    assert.equal((await run({ body: '', headers: l.headers })).status, 401)
    const teken = (/** @type {string} */ b) => ({ 'x-docusign-signature-1': createHmac('sha256', HMAC).update(b).digest('base64') })
    assert.equal((await run({ body: 'geen json', headers: teken('geen json') })).uitkomst, 'geen_json')
    assert.equal((await run({ body: '{"a":1}', headers: teken('{"a":1}') })).uitkomst, 'formaat')
    assert.deepEqual((await run(lever('recipient-completed'))).uitkomst, 'genegeerd')
  })

  test('de handtekening onder een tweede accountsleutel (kop -2) wordt ook geaccepteerd', async () => {
    const u = await run(lever('envelope-declined', 'e1', { extraSleutels: ['andere-app'] }))
    assert.deepEqual([u.status, u.uitkomst], [204, 'verwerkt'])
  })
})

describe('maakClaim', () => {
  test('$-placeholders en een rows-antwoord (pg); ?-placeholders en een array (D1-shim)', async () => {
    /** @type {Array<[string, unknown[]]>} */
    const sql = []
    const bezet = new Set()
    const query = async (/** @type {string} */ s, /** @type {unknown[]} */ p) => {
      sql.push([s, p])
      const k = p.join('|')
      if (s.startsWith('INSERT')) {
        if (bezet.has(k)) return { rows: [] }
        bezet.add(k)
        return { rows: [{ envelope_id: p[0] }] }
      }
      bezet.delete(k)
      return { rows: [] }
    }
    const claim = maakClaim(query)
    assert.equal(await claim.neem('e1', 'envelope-completed'), true)
    assert.equal(await claim.neem('e1', 'envelope-completed'), false)
    await claim.geefVrij('e1', 'envelope-completed')
    assert.equal(await claim.neem('e1', 'envelope-completed'), true)
    assert.match(sql[0][0], /INSERT INTO docusign_webhook_event \(envelope_id, event_id\) VALUES \(\$1, \$2\) ON CONFLICT DO NOTHING RETURNING envelope_id/)

    const vraag = maakClaim(async (/** @type {string} */ s) => { sql.push([s, []]); return [] }, { stijl: '?' })
    assert.equal(await vraag.neem('e2', 'x'), false)
    assert.match(sql.at(-1)?.[0] ?? '', /VALUES \(\?, \?\)/)
    assert.throws(() => maakClaim(query, { tabel: 'x; DROP TABLE y' }), /tabelnaam/)
  })
})

describe('het testslot', () => {
  const nep = () => {
    /** @type {any[]} */
    const verstuurd = []
    return { verstuurd, verstuurEnvelop: async (/** @type {any} */ i) => { verstuurd.push(i); return { envelopeId: 'e' } }, haalEnvelopOp: async () => ({}) }
  }
  const invoer = { verzenderEmail: 'cb@motrac.nl', ondertekenaars: [{ naam: 'Klant', email: 'klant@x.nl', velden: [] }], ccs: [{ naam: 'CB', email: 'cb@motrac.nl' }, { naam: 'Test', email: 'test@motrac.nl' }] }

  test('live: ongewijzigd (hetzelfde object)', () => {
    const d = nep()
    assert.equal(metTestSlot(d, { live: true, testOntvangers: [] }), d)
  })

  test('niet live: omleiden naar het eerste testadres, bedoelde ontvanger in de naam, cc buiten de lijst valt weg', async () => {
    const d = nep()
    const w = mock.method(console, 'warn', () => {})
    try {
      await metTestSlot(d, { live: false, testOntvangers: ['test@motrac.nl'] }).verstuurEnvelop(invoer)
      assert.equal(w.mock.callCount(), 1, 'het omleiden staat in de log')
    } finally {
      w.mock.restore()
    }
    assert.deepEqual(d.verstuurd[0].ondertekenaars.map((/** @type {any} */ o) => [o.naam, o.email]), [['[TEST → klant@x.nl] Klant', 'test@motrac.nl']])
    assert.deepEqual(d.verstuurd[0].ccs.map((/** @type {any} */ c) => c.email), ['test@motrac.nl'])
  })

  test('niet live, adres op de lijst: ongewijzigd; geen lijst: geweigerd en niets verstuurd', async () => {
    const d = nep()
    await metTestSlot(d, { live: false, testOntvangers: ['KLANT@x.nl'] }).verstuurEnvelop(invoer)
    assert.equal(d.verstuurd[0].ondertekenaars[0].naam, 'Klant')
    const leeg = nep()
    await assert.rejects(() => metTestSlot(leeg, { live: false, testOntvangers: [] }).verstuurEnvelop(invoer), DocusignGeblokkeerd)
    assert.equal(leeg.verstuurd.length, 0)
  })

  test('testOntvangersUit leest een kommalijst', () => {
    assert.deepEqual(testOntvangersUit(' a@x.nl, b@x.nl;c@x.nl '), ['a@x.nl', 'b@x.nl', 'c@x.nl'])
    assert.deepEqual(testOntvangersUit(undefined), [])
  })
})

describe('meldingen en profielen', () => {
  test('elke reden zegt dat er niets verstuurd is; Viewer mag niet versturen', () => {
    for (const r of ['GEEN_EMAIL', 'GEEN_ACCOUNT', 'GEEN_VERZENDRECHT', 'GEEN_TOESTEMMING', 'anders']) {
      assert.match(verzenderBoodschap(r, 'a@motrac.nl'), /Er is niets verstuurd/)
    }
    assert.match(verzenderBoodschap('GEEN_VERZENDRECHT', 'a@motrac.nl', 'DocuSign Viewer'), /"DocuSign Viewer".*DocuSign Sender/)
    assert.deepEqual([magVersturen('DocuSign Viewer'), magVersturen('DS Sender'), magVersturen(''), magVersturen(undefined)], [false, true, true, true])
  })

  test('precies één Sender-profiel; geen of twee is een fout voor de beheerder', () => {
    const p = (/** @type {string} */ naam) => ({ id: naam, naam })
    assert.equal(vindVerzendProfiel([p('DS Viewer'), p('DS Sender'), p('DS Admin')]).naam, 'DS Sender')
    assert.throws(() => vindVerzendProfiel([p('DS Viewer'), p('DS Admin')]), (e) => e instanceof DocusignProfielFout && e.reden === 'GEEN_VERZENDPROFIEL')
    assert.throws(() => vindVerzendProfiel([p('DS Sender'), p('Extern Sender')]), (e) => e instanceof DocusignProfielFout && e.reden === 'MEERDERE_VERZENDPROFIELEN')
  })
})

describe('httpFout', () => {
  test('elke fout van de bouwsteen krijgt status, code en details; een andere fout null', async () => {
    const { httpFout, DocusignVerzenderFout, DocusignFout, DocusignAuthFout } = await import('../src/index.js')
    assert.deepEqual(httpFout(new DocusignInvoerFout('onderwerp', 'leeg')), { status: 400, code: 'DOCUSIGN_INVOER', boodschap: 'leeg', details: { veld: 'onderwerp' }, log: false })
    assert.equal(httpFout(new DocusignNietIngesteld())?.code, 'DOCUSIGN_UIT')
    const v = httpFout(new DocusignVerzenderFout('GEEN_VERZENDRECHT', 'a@motrac.nl', 'DS Viewer'))
    assert.deepEqual([v?.status, v?.code, v?.details], [409, 'DOCUSIGN_VERZENDER', { reden: 'GEEN_VERZENDRECHT', email: 'a@motrac.nl', profiel: 'DS Viewer' }])
    assert.equal(httpFout(new DocusignProfielFout('GEEN_BEHEERRECHT', 'x'))?.code, 'DOCUSIGN_BEHEER')
    assert.equal(httpFout(new DocusignGeblokkeerd('k@x.nl'))?.code, 'DOCUSIGN_GEBLOKKEERD')
    const ds = httpFout(new DocusignFout(400, '{"errorCode":"X","message":"geheime details"}', 'X', 'mislukt (400): geheime details'))
    assert.deepEqual([ds?.status, ds?.log], [502, true])
    assert.doesNotMatch(ds?.boodschap ?? '', /geheime details/)
    assert.doesNotMatch(httpFout(new DocusignAuthFout(400, 'invalid_grant', 'mislukt: body'))?.boodschap ?? '', /body/)
    assert.equal(httpFout(new Error('iets anders')), null)
  })
})
