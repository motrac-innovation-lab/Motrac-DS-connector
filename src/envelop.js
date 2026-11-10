// De envelop opbouwen, zonder netwerk: puur en los te testen.
//
// Transport-only (mit-contractenbeheer ADR-0047): de app levert de documenten al
// volledig samengevoegd aan, zodat wat er gecontroleerd is ook is wat er
// verstuurd wordt. De bouwsteen maakt geen document en beslist niets over de
// inhoud; hij toetst alleen wat DocuSign anders pas bij het versturen weigert.
import { Buffer } from 'node:buffer'
import { DocusignInvoerFout } from './fouten.js'
import { A4_STAAND, TAB_SOORTEN, bouwAnkerTab } from './tabs.js'

/** DocuSign-limieten. */
export const MAX_ONDERWERP = 100
export const MAX_BERICHT = 10_000
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

export const DOCUMENT_SOORTEN = /** @type {const} */ (['html', 'docx', 'pdf'])

const EMAIL_PATROON = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/**
 * @typedef {object} Veld
 * @property {import('./tabs.js').TabSoort} soort signHere, initialHere, dateSigned, fullName of text
 * @property {string} anker de (onzichtbare) tekst in het document waar het veld komt
 * @property {number} [document] welk document, vanaf 1 (standaard 1)
 * @property {number} [x] offset in punten vanaf het anker (standaard 0)
 * @property {number} [y]
 * @property {string} [label] alleen text: `tabLabel`, terug te lezen uit de envelop
 * @property {boolean} [verplicht] alleen text (standaard false)
 * @property {number} [breedte] alleen text, in punten
 */

/**
 * @typedef {object} Document
 * @property {string} naam zoals de ondertekenaar hem ziet; de extensie komt er zo nodig bij
 * @property {'html' | 'docx' | 'pdf'} soort
 * @property {string | Uint8Array} inhoud HTML als tekst, DOCX/PDF als bytes
 */

/**
 * @typedef {object} Ondertekenaar
 * @property {string} naam
 * @property {string} email
 * @property {number} [volgorde] routingOrder (standaard 1: allemaal tegelijk)
 * @property {Veld[]} velden minstens één signHere
 */

/**
 * @typedef {object} EnvelopInvoer
 * @property {string} onderwerp onderwerp van de mail van DocuSign (wordt op 100 tekens afgekapt)
 * @property {string} [bericht] tekst in die mail, platte tekst (afgekapt op 10.000)
 * @property {boolean} [versturen] true (standaard): meteen naar de ondertekenaar ('sent');
 *   false: als concept in DocuSign ('created'), daar na te kijken en te versturen
 * @property {Document[]} documenten
 * @property {Ondertekenaar[]} ondertekenaars
 * @property {Array<{ naam: string, email: string }>} [ccs] krijgen een kopie; lege, dubbele en
 *   adressen van een ondertekenaar vallen weg
 * @property {import('./tabs.js').PaginaBox} [pagina] voor het begrenzen van offsets (standaard A4 staand)
 */

const afkappen = (/** @type {string} */ tekst, /** @type {number} */ max) =>
  tekst.length <= max ? tekst : `${tekst.slice(0, max - 1)}…`

const bytesVan = (/** @type {string | Uint8Array} */ inhoud) =>
  typeof inhoud === 'string' ? Buffer.from(inhoud, 'utf8') : Buffer.from(inhoud)

/**
 * Toetst de invoer en geeft de body voor `POST /envelopes`. Gooit
 * `DocusignInvoerFout` (met `veld`) voordat er iets naar DocuSign gaat.
 *
 * Regels die uit de praktijk komen:
 * - Een anker hoort bij precies één document. DocuSign zoekt een ankertekst in
 *   álle documenten van de envelop, ook met een `documentId` op de tab; een
 *   gedeeld anker geeft het eerste document dan elk handtekeningveld
 *   (mit-contractenbeheer, feedback #3).
 * - Bij een HTML-document moet het anker er ook echt in staan; anders maakt
 *   DocuSign de envelop zonder veld en merkt pas de klant het.
 *
 * @param {EnvelopInvoer} invoer
 * @returns {{ body: Record<string, unknown>, tabs: unknown[] }} `tabs` per ondertekenaar, voor het log bij INVALID_USER_OFFSET
 */
export function bouwEnvelopBody(invoer) {
  const onderwerp = String(invoer?.onderwerp ?? '').trim()
  if (!onderwerp) throw new DocusignInvoerFout('onderwerp', 'Het onderwerp van de envelop is leeg.')

  const documenten = invoer.documenten ?? []
  if (!documenten.length) throw new DocusignInvoerFout('documenten', 'De envelop heeft geen document.')
  const html = documenten.map((d) => (d.soort === 'html' && typeof d.inhoud === 'string' ? d.inhoud : null))

  const documents = documenten.map((doc, i) => {
    const veld = `documenten[${i}]`
    if (!DOCUMENT_SOORTEN.includes(doc.soort)) {
      throw new DocusignInvoerFout(veld, `Document ${i + 1}: soort moet html, docx of pdf zijn.`)
    }
    const bytes = bytesVan(doc.inhoud ?? '')
    if (!bytes.length) throw new DocusignInvoerFout(veld, `Document ${i + 1} is leeg.`)
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new DocusignInvoerFout(veld, `Document ${i + 1} is groter dan 25 MB.`)
    const naam = String(doc.naam ?? '').trim() || `Document ${i + 1}`
    return {
      documentBase64: bytes.toString('base64'),
      name: naam.toLowerCase().endsWith(`.${doc.soort}`) ? naam : `${naam}.${doc.soort}`,
      fileExtension: doc.soort,
      documentId: String(i + 1),
    }
  })

  const ondertekenaars = invoer.ondertekenaars ?? []
  if (!ondertekenaars.length) throw new DocusignInvoerFout('ondertekenaars', 'De envelop heeft geen ondertekenaar.')

  /** @type {Map<string, number>} anker → document */
  const ankerDocument = new Map()
  const pagina = invoer.pagina ?? A4_STAAND

  const signers = ondertekenaars.map((o, i) => {
    const pad = `ondertekenaars[${i}]`
    const naam = String(o.naam ?? '').trim()
    const email = String(o.email ?? '').trim()
    if (!naam) throw new DocusignInvoerFout(`${pad}.naam`, `De naam van ondertekenaar ${i + 1} ontbreekt.`)
    if (!EMAIL_PATROON.test(email)) throw new DocusignInvoerFout(`${pad}.email`, `Het e-mailadres van ondertekenaar ${i + 1} klopt niet.`)
    const velden = o.velden ?? []
    if (!velden.some((v) => v.soort === 'signHere')) {
      throw new DocusignInvoerFout(`${pad}.velden`, `Ondertekenaar ${i + 1} heeft geen handtekeningveld (signHere).`)
    }

    /** @type {Record<string, unknown[]>} */
    const tabs = {}
    velden.forEach((v, j) => {
      const veldPad = `${pad}.velden[${j}]`
      if (!TAB_SOORTEN.includes(v.soort)) throw new DocusignInvoerFout(veldPad, `Onbekende veldsoort '${v.soort}'.`)
      const anker = String(v.anker ?? '')
      if (!anker.trim()) throw new DocusignInvoerFout(veldPad, 'Een veld zonder anker.')
      const document = v.document ?? 1
      if (!Number.isInteger(document) || document < 1 || document > documenten.length) {
        throw new DocusignInvoerFout(veldPad, `Veld op anker '${anker}' verwijst naar document ${document}, dat niet bestaat.`)
      }
      const eerder = ankerDocument.get(anker)
      if (eerder !== undefined && eerder !== document) {
        throw new DocusignInvoerFout(
          veldPad,
          `Anker '${anker}' staat op document ${eerder} en ${document}. DocuSign zoekt een anker in alle documenten; geef elk document een eigen anker.`,
        )
      }
      ankerDocument.set(anker, document)
      const eigen = html[document - 1]
      if (eigen !== null && !eigen.includes(anker)) {
        throw new DocusignInvoerFout(veldPad, `Anker '${anker}' staat niet in document ${document}.`)
      }
      const ander = html.findIndex((tekst, k) => k !== document - 1 && tekst !== null && tekst.includes(anker))
      if (ander !== -1) {
        throw new DocusignInvoerFout(
          veldPad,
          `Anker '${anker}' (document ${document}) staat ook in document ${ander + 1}. DocuSign zou het veld daar ook neerzetten; geef elk document een eigen anker.`,
        )
      }

      const tab = /** @type {Record<string, unknown>} */ (
        bouwAnkerTab({ soort: v.soort, documentId: String(document), anker, xOffset: v.x ?? 0, yOffset: v.y ?? 0, pagina })
      )
      if (v.soort === 'text') {
        tab.tabLabel = v.label ?? `tekst${j + 1}`
        tab.required = v.verplicht ? 'true' : 'false'
        if (v.breedte) tab.width = String(Math.round(v.breedte))
      }
      ;(tabs[`${v.soort}Tabs`] ??= []).push(tab)
    })

    return { email, name: naam, recipientId: String(i + 1), routingOrder: String(o.volgorde ?? 1), tabs }
  })

  const gezien = new Set(signers.map((s) => s.email.toLowerCase()))
  const carbonCopies = []
  for (const cc of invoer.ccs ?? []) {
    const email = String(cc?.email ?? '').trim()
    if (!email || gezien.has(email.toLowerCase())) continue
    if (!EMAIL_PATROON.test(email)) throw new DocusignInvoerFout('ccs', `Het cc-adres '${email}' klopt niet.`)
    gezien.add(email.toLowerCase())
    carbonCopies.push({
      email,
      name: String(cc.naam ?? '').trim() || email,
      recipientId: String(signers.length + carbonCopies.length + 1),
      routingOrder: '1',
    })
  }

  const versturen = invoer.versturen ?? true
  return {
    body: {
      emailSubject: afkappen(onderwerp, MAX_ONDERWERP),
      ...(invoer.bericht?.trim() && { emailBlurb: afkappen(invoer.bericht.trim(), MAX_BERICHT) }),
      status: versturen ? 'sent' : 'created',
      documents,
      recipients: { signers, carbonCopies },
    },
    tabs: signers.map((s) => s.tabs),
  }
}
