// De bouwsteen tegen de nep-DocuSign (src/testing): inloggen, op naam versturen,
// de redenen, ophalen, intrekken, health en verzendrecht geven.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { DocusignFout, DocusignInvoerFout, DocusignNietIngesteld, DocusignProfielFout, DocusignVerzenderFout, maakDocusign, vergeetTokens } from '../src/index.js'
import { startNepDocusign } from '../src/testing/index.js'

/** @type {Awaited<ReturnType<typeof startNepDocusign>>} */
let nep
before(async () => {
  nep = await startNepDocusign({
    gebruikers: [
      { email: 'jan@motrac.nl' },
      { email: 'kees@motrac.nl', profiel: 'DocuSign Viewer' },
      { email: 'piet@motrac.nl', toestemming: false },
    ],
  })
})
after(() => nep.stop())
beforeEach(() => {
  vergeetTokens()
  nep.zetEnvelopFout(null)
  nep.zetProfielFout(null)
})

const HTML = '<html><body><p>Offerte</p><span style="color:white">/sig1/</span> <span>/naam1/</span></body></html>'
const envelop = (/** @type {string | null} */ verzenderEmail, extra = {}) => ({
  verzenderEmail,
  onderwerp: 'Offerte KTV-1 ter ondertekening',
  bericht: 'Graag tekenen.',
  documenten: [{ naam: 'Offerte KTV-1', soort: /** @type {const} */ ('html'), inhoud: HTML }],
  ondertekenaars: [{ naam: 'Klant', email: 'klant@x.nl', velden: [{ soort: /** @type {const} */ ('signHere'), anker: '/sig1/' }, { soort: /** @type {const} */ ('fullName'), anker: '/naam1/' }] }],
  ccs: [{ naam: 'Motrac', email: 'verhuur@motrac.nl' }],
  ...extra,
})
const reden = (/** @type {string} */ r) => (/** @type {unknown} */ e) => e instanceof DocusignVerzenderFout && e.reden === r

describe('versturen op naam', () => {
  test('de envelop gaat met het token van de verzender, niet van de koppelgebruiker', async () => {
    const ds = maakDocusign(nep.config)
    const voor = nep.envelopen.length
    const uit = await ds.verstuurEnvelop(envelop('Jan@Motrac.nl'))
    assert.equal(uit.status, 'sent')
    const e = nep.envelopen.at(-1)
    assert.equal(nep.envelopen.length, voor + 1)
    assert.equal(e?.id, uit.envelopeId)
    assert.equal(e?.auth, `Bearer ${nep.tokenVan('jan@motrac.nl')}`)
    assert.notEqual(e?.auth, `Bearer ${nep.koppelToken}`)
    assert.deepEqual(e?.body.recipients.carbonCopies.map((/** @type {any} */ c) => c.email), ['verhuur@motrac.nl'])
  })

  test('als concept (versturen: false) krijgt DocuSign status created', async () => {
    const uit = await maakDocusign(nep.config).verstuurEnvelop(envelop('jan@motrac.nl', { versturen: false }))
    assert.equal(uit.status, 'created')
  })

  test('de redenen: geen e-mail, geen account, Viewer, geen toestemming; er gaat niets naar DocuSign', async () => {
    const ds = maakDocusign(nep.config)
    const voor = nep.envelopen.length
    await assert.rejects(() => ds.verstuurEnvelop(envelop(null)), reden('GEEN_EMAIL'))
    await assert.rejects(() => ds.verstuurEnvelop(envelop('  ')), reden('GEEN_EMAIL'))
    await assert.rejects(() => ds.verstuurEnvelop(envelop('onbekend@motrac.nl')), reden('GEEN_ACCOUNT'))
    await assert.rejects(() => ds.verstuurEnvelop(envelop('kees@motrac.nl')), (e) => reden('GEEN_VERZENDRECHT')(e) && /** @type {any} */ (e).profiel === 'DocuSign Viewer')
    await assert.rejects(() => ds.verstuurEnvelop(envelop('piet@motrac.nl')), reden('GEEN_TOESTEMMING'))
    assert.equal(nep.envelopen.length, voor)
  })

  test('DocuSign weigert met USER_LACKS_PERMISSIONS: GEEN_VERZENDRECHT; een andere fout blijft een DocusignFout', async () => {
    const ds = maakDocusign(nep.config)
    nep.zetEnvelopFout({ status: 400, errorCode: 'USER_LACKS_PERMISSIONS' })
    await assert.rejects(() => ds.verstuurEnvelop(envelop('jan@motrac.nl')), reden('GEEN_VERZENDRECHT'))
    nep.zetEnvelopFout({ status: 400, errorCode: 'ENVELOPE_IS_INCOMPLETE' })
    await assert.rejects(() => ds.verstuurEnvelop(envelop('jan@motrac.nl')), (e) => e instanceof DocusignFout && e.errorCode === 'ENVELOPE_IS_INCOMPLETE' && e.status === 400)
  })

  test('een fout in de invoer kost geen aanroep naar DocuSign', async () => {
    const voor = nep.verzoeken.length
    await assert.rejects(() => maakDocusign(nep.config).verstuurEnvelop(envelop('jan@motrac.nl', { onderwerp: '' })), DocusignInvoerFout)
    assert.equal(nep.verzoeken.length, voor)
  })

  test('zonder sleutel: DocusignNietIngesteld', async () => {
    await assert.rejects(() => maakDocusign({ ...nep.config, privateKey: '' }).verstuurEnvelop(envelop('jan@motrac.nl')), DocusignNietIngesteld)
  })

  test('een fout account-ID noemt de accounts die wel bestaan', async () => {
    await assert.rejects(() => maakDocusign({ ...nep.config, accountId: 'verkeerd' }).verstuurEnvelop(envelop('jan@motrac.nl')), /Beschikbare accounts.*Motrac test/)
  })

  test('tokens worden hergebruikt: een tweede envelop logt niet opnieuw in', async () => {
    const ds = maakDocusign(nep.config)
    await ds.verstuurEnvelop(envelop('jan@motrac.nl'))
    const inlogs = () => nep.verzoeken.filter((v) => v.pad === '/oauth/token').length
    const voor = inlogs()
    await ds.verstuurEnvelop(envelop('jan@motrac.nl'))
    assert.equal(inlogs(), voor)
  })
})

describe('ophalen en intrekken', () => {
  test('envelop en getekend document ophalen, ook zonder verzender (koppelgebruiker)', async () => {
    const ds = maakDocusign(nep.config)
    const { envelopeId } = await ds.verstuurEnvelop(envelop('jan@motrac.nl'))
    assert.equal((await ds.haalEnvelopOp(envelopeId, { verzenderEmail: 'jan@motrac.nl' })).status, 'sent')
    assert.equal((await ds.haalEnvelopOp(envelopeId)).status, 'sent', 'zonder verzender')
    assert.equal((await ds.haalEnvelopOp(envelopeId, { verzenderEmail: 'onbekend@motrac.nl' })).status, 'sent', 'terugval bij lezen')
    assert.match((await ds.haalGetekendDocumentOp(envelopeId)).toString('utf8'), /^%PDF/)
    await assert.rejects(() => ds.haalEnvelopOp('bestaat-niet'), (e) => e instanceof DocusignFout && e.errorCode === 'ENVELOPE_DOES_NOT_EXIST')
  })

  test('intrekken: op naam, met reden; zonder reden of zonder verzender niet', async () => {
    const ds = maakDocusign(nep.config)
    const { envelopeId } = await ds.verstuurEnvelop(envelop('jan@motrac.nl'))
    await assert.rejects(() => ds.trekEnvelopIn(envelopeId, { reden: ' ', verzenderEmail: 'jan@motrac.nl' }), /reden/)
    await assert.rejects(() => ds.trekEnvelopIn(envelopeId, { reden: 'Fout in de prijs', verzenderEmail: null }), reden('GEEN_EMAIL'))
    await ds.trekEnvelopIn(envelopeId, { reden: 'Fout in de prijs', verzenderEmail: 'jan@motrac.nl' })
    const e = await ds.haalEnvelopOp(envelopeId)
    assert.deepEqual([e.status, e.voidedReason], ['voided', 'Fout in de prijs'])
  })
})

describe('health', () => {
  test('controleerKoppeling: ok, niet ingesteld, of fout zonder geheim in de melding', async () => {
    assert.equal((await maakDocusign(nep.config).controleerKoppeling()).status, 'ok')
    assert.equal((await maakDocusign({ ...nep.config, privateKey: '' }).controleerKoppeling()).status, 'niet_ingesteld')
    const fout = await maakDocusign({ ...nep.config, integrationKey: 'andere-app' }).controleerKoppeling()
    assert.equal(fout.status, 'fout')
    assert.match(fout.foutmelding ?? '', /invalid_grant/)
    assert.doesNotMatch(fout.foutmelding ?? '', /PRIVATE KEY/)
  })

  test('controleerVerzender geeft per persoon de stand, met boodschap en profiel', async () => {
    const ds = maakDocusign(nep.config)
    assert.equal((await ds.controleerVerzender('jan@motrac.nl')).status, 'ok')
    assert.equal((await ds.controleerVerzender(null)).status, 'geen_email')
    assert.equal((await ds.controleerVerzender('onbekend@motrac.nl')).status, 'geen_account')
    const kees = await ds.controleerVerzender('kees@motrac.nl')
    assert.deepEqual([kees.status, kees.profiel], ['geen_verzendrecht', 'DocuSign Viewer'])
    assert.match(kees.boodschap ?? '', /Er is niets verstuurd/)
    assert.equal((await ds.controleerVerzender('piet@motrac.nl')).status, 'geen_toestemming')
    assert.equal((await maakDocusign({ ...nep.config, privateKey: '' }).controleerVerzender('jan@motrac.nl')).status, 'niet_ingesteld')
  })
})

describe('verzendrecht geven', () => {
  test('een Viewer krijgt het Sender-profiel; een Sender en een onbekende blijven ongemoeid', async () => {
    const ds = maakDocusign(nep.config)
    nep.voegGebruikerToe({ email: 'nieuw@motrac.nl', profiel: 'DS Viewer' })
    assert.deepEqual(await ds.geefVerzendrecht('nieuw@motrac.nl'), { uitkomst: 'gegeven', profiel: 'DS Sender' })
    assert.equal(nep.profielVan('nieuw@motrac.nl'), 'DS Sender')
    assert.equal((await ds.controleerVerzender('nieuw@motrac.nl')).status, 'ok')
    assert.deepEqual(await ds.geefVerzendrecht('jan@motrac.nl'), { uitkomst: 'al_verzender', profiel: 'DocuSign Sender' })
    assert.deepEqual(await ds.geefVerzendrecht('niemand@motrac.nl'), { uitkomst: 'geen_account', profiel: '' })
  })

  test('koppelgebruiker zonder beheerrecht: GEEN_BEHEERRECHT', async () => {
    nep.voegGebruikerToe({ email: 'nog-een@motrac.nl', profiel: 'DS Viewer' })
    nep.zetProfielFout({ status: 403, errorCode: 'USER_LACKS_PERMISSIONS' })
    await assert.rejects(() => maakDocusign(nep.config).geefVerzendrecht('nog-een@motrac.nl'), (e) => e instanceof DocusignProfielFout && e.reden === 'GEEN_BEHEERRECHT')
  })
})
