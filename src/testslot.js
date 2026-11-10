// Het niet-live-slot (uit mit-contractenbeheer, adapters/docusign/docusignSlot.ts).
//
// Nodig om één reden: DocuSign mailt zelf. Een envelop die de app aanmaakt laat
// DocuSign vanuit zijn eigen systeem bezorgen; die mail komt nooit langs de
// mailpoort van de app, en een slot daar houdt hem dus niet tegen.
//
// Zolang de app niet live is:
// - een ondertekenaar op de testlijst → ongewijzigd;
// - een ander adres → omgeleid naar het eerste testadres, met de bedoelde
//   ontvanger in de naam (`[TEST → klant@x.nl] Klant`), zodat het in DocuSign
//   zichtbaar is;
// - geen testlijst → geweigerd (`DocusignGeblokkeerd`), er gaat niets weg.
// Cc's die niet op de testlijst staan vallen weg in plaats van omgeleid te worden,
// anders krijgt de testontvanger dezelfde envelop meerdere keren.
import { DocusignGeblokkeerd } from './fouten.js'

const normaal = (/** @type {string} */ a) => a.trim().toLowerCase()

/**
 * @template {{ verstuurEnvelop: (invoer: any) => Promise<any> }} T
 * @param {T} docusign uit `maakDocusign()`
 * @param {{ live: boolean, testOntvangers: string[] }} slot
 * @returns {T}
 */
export function metTestSlot(docusign, { live, testOntvangers }) {
  if (live) return docusign
  const lijst = (testOntvangers ?? []).map((a) => a.trim()).filter(Boolean)
  const toegestaan = new Set(lijst.map(normaal))

  return {
    ...docusign,
    async verstuurEnvelop(/** @type {any} */ invoer) {
      const ondertekenaars = (invoer.ondertekenaars ?? []).map((/** @type {{ naam: string, email: string }} */ o) => {
        if (toegestaan.has(normaal(o.email ?? ''))) return o
        if (!lijst[0]) throw new DocusignGeblokkeerd(o.email)
        console.warn(`[docusign] Niet live: envelop voor '${o.email}' omgeleid naar '${lijst[0]}'.`)
        return { ...o, email: lijst[0], naam: `[TEST → ${o.email}] ${o.naam}` }
      })
      const ccs = (invoer.ccs ?? []).filter((/** @type {{ email: string }} */ c) => toegestaan.has(normaal(c.email ?? '')))
      return docusign.verstuurEnvelop({ ...invoer, ondertekenaars, ccs })
    },
  }
}

/**
 * De testlijst uit een kommagescheiden variabele (bv. `MAIL_TESTONTVANGERS`).
 * @param {string | undefined} waarde
 */
export const testOntvangersUit = (waarde) =>
  String(waarde ?? '')
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean)
