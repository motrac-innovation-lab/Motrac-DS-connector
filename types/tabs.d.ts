/**
 * Begrenst één offset tot wat binnen de pagina kan vallen. Niet eindig wordt 0.
 * @param {number} gevraagd
 * @param {'x' | 'y'} as
 * @param {PaginaBox} [pagina]
 * @returns {{ waarde: number, geclampt: boolean }}
 */
export function clampOffset(gevraagd: number, as: "x" | "y", pagina?: PaginaBox): {
    waarde: number;
    geclampt: boolean;
};
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
export function bouwAnkerTab(invoer: {
    soort: TabSoort;
    documentId: string;
    anker: string;
    xOffset?: number;
    yOffset?: number;
    pagina?: PaginaBox;
}): DocusignAnkerTab;
/** @typedef {{ breedte: number, hoogte: number }} PaginaBox */
/** Pagina-afmetingen in punten (72 dpi): het raster van `anchorUnits: 'pixels'`. */
export const A4_STAAND: Readonly<{
    breedte: 595;
    hoogte: 842;
}>;
export const A4_LIGGEND: Readonly<{
    breedte: 842;
    hoogte: 595;
}>;
/** De soorten velden; de sleutel in `tabs` is `${soort}Tabs`. */
export const TAB_SOORTEN: readonly ["signHere", "initialHere", "dateSigned", "fullName", "text"];
export type TabSoort = (typeof TAB_SOORTEN)[number];
export type DocusignAnkerTab = {
    documentId: string;
    anchorString: string;
    anchorUnits: "pixels";
    anchorXOffset: string;
    anchorYOffset: string;
};
export type PaginaBox = {
    breedte: number;
    hoogte: number;
};
