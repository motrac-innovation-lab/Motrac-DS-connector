// Voorbeeld: DocuSign in een Hono-backend (zoals mit-contractenbeheer), achter
// een eigen port. Het domein ziet alleen `OndertekenPort`; de bouwsteen is de
// adapter (ports & adapters).
//
//   registerDocuSignWebhook(app, deps)   // eigen auth-pad: vóór de SSO-middleware
//   registerDocuSignRoutes(app, deps)    // na de SSO-middleware
import type { Hono } from 'hono'
import {
  docusignConfig,
  httpFout,
  maakClaim,
  maakDocusign,
  metTestSlot,
  testOntvangersUit,
  verwerkWebhook,
  type EnvelopInvoer,
  type WebhookEvent,
} from '@motrac/docusign'

/** De port van de app: het domein kent DocuSign niet. */
export interface OndertekenPort {
  verstuur(invoer: EnvelopInvoer & { verzenderEmail: string | null }): Promise<{ envelopeId: string; verzondenOp: string }>
}

/** De adapter, met het niet-live-slot ervoor (DocuSign mailt zelf, buiten de mailpoort van de app). */
export function maakOndertekenAdapter(env: Record<string, string | undefined>): OndertekenPort {
  const ds = metTestSlot(maakDocusign(docusignConfig(env)), {
    live: env.KLANTMAIL_LIVE === 'true',
    testOntvangers: testOntvangersUit(env.MAIL_TESTONTVANGERS),
  })
  return { verstuur: (invoer) => ds.verstuurEnvelop(invoer) }
}

interface Deps {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>
  /** Het werk van de app: status, audit-event, trucks loskoppelen, … Geeft 'onbekende_envelop' als hij niet van ons is. */
  verwerkEvent: (event: WebhookEvent) => Promise<void | 'onbekende_envelop'>
}

export function registerDocuSignWebhook(app: Hono, { query, verwerkEvent }: Deps): void {
  const claim = maakClaim(query)
  app.post('/webhooks/docusign', async (c) => {
    // Hono heeft geen rawBody-plugin: lees de bytes zelf, één keer.
    const ruweBody = new Uint8Array(await c.req.arrayBuffer())
    const uitkomst = await verwerkWebhook({
      ruweBody,
      headers: c.req.raw.headers,
      hmacKey: docusignConfig().webhookHmacKey,
      claim,
      verwerk: verwerkEvent,
    })
    if (uitkomst.status === 500) console.error('[docusign] webhook:', uitkomst.fout)
    return c.body(null, uitkomst.status)
  })
}

/** Een fout van de bouwsteen als JSON-antwoord; een andere fout gaat door naar de gewone foutafhandeling. */
export function docusignFoutAntwoord(e: unknown): Response | null {
  const f = httpFout(e)
  if (!f) return null
  if (f.log) console.error('[docusign]', e instanceof Error ? e.message : e)
  return Response.json({ error: { code: f.code, message: f.boodschap, ...f.details } }, { status: f.status })
}
