// Voorbeeld: DocuSign in een Express-backend (zoals mit-rental).
//
// Kopieer dit niet blind: de vier functies in `app` zijn het werk van de app zelf
// (records, document, audit). De rest is de vaste vorm.
//
//   import { maakDocusignRouter, maakDocusignWebhookRouter } from './docusign.js'
//   app.use('/api', maakDocusignWebhookRouter(deps))   // VÓÓR express.json() en de gebruikersauth
//   app.use(express.json())
//   app.use('/api', auth, maakDocusignRouter(deps))
import express from 'express'
import { docusignConfig, httpFout, isIngesteld, maakClaim, maakDocusign, omgevingVan, ontbrekendeEnv, verwerkWebhook } from '@motrac/docusign'

/**
 * @typedef {object} Deps
 * @property {(sql: string, params: unknown[]) => Promise<unknown[] | { rows: unknown[] }>} query  bv. (s, p) => pool.query(s, p)
 * @property {object} app het werk van de app:
 * @property {(id: string) => Promise<any | null>} app.laadRecord
 * @property {(record: any) => Promise<{ naam: string, html: string }>} app.maakDocument  het document met de ankers erin
 * @property {(record: any, wijziging: Record<string, unknown>, door: string) => Promise<void>} app.werkRecordBij  incl. audit-event
 * @property {(envelopeId: string) => Promise<any | null>} app.zoekOpEnvelop
 * @property {(req: express.Request) => { email: string | null, naam: string }} gebruiker  uit de login
 */

const ANKERS = { handtekening: '/app-handtekening/', naam: '/app-naam/', datum: '/app-datum/' }

/** Neutraal DocuSign-event → de status van de app. Pas aan aan het eigen domein. */
const STATUS_VAN_EVENT = { sent: 'verstuurd', delivered: 'bekeken', completed: 'getekend', declined: 'geweigerd', voided: 'ingetrokken' }

/** @param {express.Response} res @param {unknown} e */
function stuurFout(res, e) {
  const f = httpFout(e)
  if (!f) throw e
  if (f.log) console.error('[docusign]', e instanceof Error ? e.message : e)
  res.status(f.status).json({ error: { code: f.code, message: f.boodschap, ...f.details } })
}

/** @param {Deps} deps */
export function maakDocusignRouter({ app, gebruiker }) {
  const router = express.Router()
  const docusign = () => maakDocusign(docusignConfig())

  // Stand voor het beheerscherm en het ondertekenblok. Verstuurt niets.
  router.get('/docusign/status', async (req, res) => {
    const config = docusignConfig()
    const ds = maakDocusign(config)
    res.json({
      ingesteld: isIngesteld(),
      ontbreekt: ontbrekendeEnv(),
      omgeving: omgevingVan(config),
      koppeling: await ds.controleerKoppeling(),
      verzender: await ds.controleerVerzender(gebruiker(req).email),
    })
  })

  // Versturen. De bevestigingsstap zit in de UI; hier alleen nog de toets.
  router.post('/docusign/envelop/:id', async (req, res) => {
    try {
      const record = await app.laadRecord(req.params.id)
      if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Onbekend record.' } })
      if (record.docusignEnvelopeId && !['geweigerd', 'ingetrokken'].includes(record.ondertekenStatus)) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Dit record staat al in DocuSign.' } })
      }
      const { naam, html } = await app.maakDocument(record)
      const ik = gebruiker(req)
      const { ondertekenaar } = req.body
      const uit = await docusign().verstuurEnvelop({
        verzenderEmail: ik.email,
        onderwerp: `${naam} ter ondertekening`,
        bericht: 'U kunt het document digitaal ondertekenen.',
        documenten: [{ naam, soort: 'html', inhoud: html }],
        ondertekenaars: [{
          naam: ondertekenaar?.naam,
          email: ondertekenaar?.email,
          velden: [
            { soort: 'signHere', anker: ANKERS.handtekening },
            { soort: 'fullName', anker: ANKERS.naam },
            { soort: 'dateSigned', anker: ANKERS.datum },
          ],
        }],
        ccs: [{ naam: 'Motrac', email: 'team@motrac.nl' }],
      })
      await app.werkRecordBij(record, { docusignEnvelopeId: uit.envelopeId, ondertekenStatus: 'verstuurd' }, ik.naam)
      res.status(201).json(uit)
    } catch (e) {
      stuurFout(res, e)
    }
  })

  // "Status ophalen": voor als de webhook (nog) niet werkt.
  router.post('/docusign/envelop/:id/status', async (req, res) => {
    try {
      const record = await app.laadRecord(req.params.id)
      if (!record?.docusignEnvelopeId) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Geen envelop.' } })
      const envelop = await docusign().haalEnvelopOp(record.docusignEnvelopeId, { verzenderEmail: gebruiker(req).email })
      await app.werkRecordBij(record, { ondertekenStatus: STATUS_VAN_EVENT[envelop.status] ?? record.ondertekenStatus }, gebruiker(req).naam)
      res.json({ status: envelop.status })
    } catch (e) {
      stuurFout(res, e)
    }
  })

  return router
}

/** De webhook: vóór de gebruikersauth en vóór express.json(), want de HMAC gaat over de ruwe bytes. */
export function maakDocusignWebhookRouter({ query, app }) {
  const router = express.Router()
  const claim = maakClaim(query)

  router.post('/docusign/webhook', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const uitkomst = await verwerkWebhook({
      ruweBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      headers: req.headers,
      hmacKey: docusignConfig().webhookHmacKey,
      claim,
      verwerk: async (event) => {
        const record = await app.zoekOpEnvelop(event.envelopeId)
        if (!record) return 'onbekende_envelop'
        await app.werkRecordBij(record, { ondertekenStatus: STATUS_VAN_EVENT[event.event] }, 'DocuSign')
        // Bij completed: het getekende document ophalen en bewaren (mag mislukken;
        // "Status ophalen" probeert het later opnieuw).
      },
    })
    if (uitkomst.status === 500) console.error('[docusign] webhook:', uitkomst.fout)
    res.status(uitkomst.status).end()
  })

  return router
}
