// De velden (tabs) op de ankers in het document. Eén plek, want in
// mit-contractenbeheer week de datum-tab ooit ongemerkt af van de
// handtekening-tab ernaast.
//
// Waarom clampen: een tab die buiten de pagina valt geeft geen scheve opmaak maar
// een harde HTTP 400 (`INVALID_USER_OFFSET`), pas op het moment dat iemand op
// "Versturen" drukt. Het document is meestal HTML of DOCX en DocuSign maakt er
// pas zelf een PDF van, dus er is geen pagina om af te meten: A4 staand is de
// standaard, een ander formaat geef je mee. Clampen begrenst de offset, niet de
// uitkomst (DocuSign rekent `anker + offset` pas bij het renderen uit); het is een
// vangnet tegen absurde waarden. De echte borging is dat je niets ver naar rechts
// hangt aan een anker dat zelf al rechts op de pagina staat.

/** @typedef {{ breedte: number, hoogte: number }} PaginaBox */

/** Pagina-afmetingen in punten (72 dpi): het raster van `anchorUnits: 'pixels'`. */
export const A4_STAAND = Object.freeze({ breedte: 595, hoogte: 842 })
export const A4_LIGGEND = Object.freeze({ breedte: 842, hoogte: 595 })

// Ruime bovengrens voor wat de tab zelf inneemt; liever te vroeg clampen dan een
// envelop die de deur niet uit komt.
const TAB_BREEDTE = 100
const TAB_HOOGTE = 22
const MARGE = 20

/**
 * Begrenst één offset tot wat binnen de pagina kan vallen. Niet eindig wordt 0.
 * @param {number} gevraagd
 * @param {'x' | 'y'} as
 * @param {PaginaBox} [pagina]
 * @returns {{ waarde: number, geclampt: boolean }}
 */
export function clampOffset(gevraagd, as, pagina = A4_STAAND) {
  if (!Number.isFinite(gevraagd)) return { waarde: 0, geclampt: true }

  const grootte = as === 'x' ? pagina.breedte : pagina.hoogte
  const tabRuimte = as === 'x' ? TAB_BREEDTE : TAB_HOOGTE
  const max = grootte - tabRuimte - MARGE
  const min = -(grootte - MARGE)

  const afgerond = Math.round(gevraagd)
  if (afgerond > max) return { waarde: max, geclampt: true }
  if (afgerond < min) return { waarde: min, geclampt: true }
  return { waarde: afgerond, geclampt: false }
}

/** De soorten velden; de sleutel in `tabs` is `${soort}Tabs`. */
export const TAB_SOORTEN = /** @type {const} */ (['signHere', 'initialHere', 'dateSigned', 'fullName', 'text'])

/** @typedef {typeof TAB_SOORTEN[number]} TabSoort */

/**
 * @typedef {object} DocusignAnkerTab
 * @property {string} documentId
 * @property {string} anchorString
 * @property {'pixels'} anchorUnits
 * @property {string} anchorXOffset
 * @property {string} anchorYOffset
 */

/**
 * Eén ankertab. `anchorUnits` staat altijd op 'pixels': zonder eenheid valt
 * DocuSign terug op inches (220 wordt dan twintig pagina's naar rechts). Alle
 * waarden als string. Geclampt = waarschuwing in de log: de 400 is voorkomen,
 * maar de opmaakfout blijft bestaan en moet zichtbaar zijn.
 * @param {{ soort: TabSoort, documentId: string, anker: string, xOffset?: number, yOffset?: number, pagina?: PaginaBox }} invoer
 * @returns {DocusignAnkerTab}
 */
export function bouwAnkerTab(invoer) {
  const pagina = invoer.pagina ?? A4_STAAND
  const xOffset = invoer.xOffset ?? 0
  const yOffset = invoer.yOffset ?? 0
  const x = clampOffset(xOffset, 'x', pagina)
  const y = clampOffset(yOffset, 'y', pagina)

  if (x.geclampt || y.geclampt) {
    console.warn(
      `[docusign] Tab '${invoer.soort}' op document ${invoer.documentId} (anker '${invoer.anker}') viel buiten de ` +
        `pagina (${pagina.breedte}x${pagina.hoogte}pt) en is teruggezet: ` +
        `x ${xOffset} → ${x.waarde}, y ${yOffset} → ${y.waarde}. ` +
        'De envelop gaat wel de deur uit, maar het veld staat waarschijnlijk verkeerd: controleer het anker in het document en de offsets.',
    )
  }

  return {
    documentId: invoer.documentId,
    anchorString: invoer.anker,
    anchorUnits: 'pixels',
    anchorXOffset: String(x.waarde),
    anchorYOffset: String(y.waarde),
  }
}
