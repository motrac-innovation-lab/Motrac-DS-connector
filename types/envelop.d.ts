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
export function bouwEnvelopBody(invoer: EnvelopInvoer): {
    body: Record<string, unknown>;
    tabs: unknown[];
};
/** DocuSign-limieten. */
export const MAX_ONDERWERP: 100;
export const MAX_BERICHT: 10000;
export const MAX_DOCUMENT_BYTES: number;
export const DOCUMENT_SOORTEN: readonly ["html", "docx", "pdf"];
export type Veld = {
    /**
     * signHere, initialHere, dateSigned, fullName of text
     */
    soort: import("./tabs.js").TabSoort;
    /**
     * de (onzichtbare) tekst in het document waar het veld komt
     */
    anker: string;
    /**
     * welk document, vanaf 1 (standaard 1)
     */
    document?: number | undefined;
    /**
     * offset in punten vanaf het anker (standaard 0)
     */
    x?: number | undefined;
    y?: number | undefined;
    /**
     * alleen text: `tabLabel`, terug te lezen uit de envelop
     */
    label?: string | undefined;
    /**
     * alleen text (standaard false)
     */
    verplicht?: boolean | undefined;
    /**
     * alleen text, in punten
     */
    breedte?: number | undefined;
};
export type Document = {
    /**
     * zoals de ondertekenaar hem ziet; de extensie komt er zo nodig bij
     */
    naam: string;
    soort: "html" | "docx" | "pdf";
    /**
     * HTML als tekst, DOCX/PDF als bytes
     */
    inhoud: string | Uint8Array;
};
export type Ondertekenaar = {
    naam: string;
    email: string;
    /**
     * routingOrder (standaard 1: allemaal tegelijk)
     */
    volgorde?: number | undefined;
    /**
     * minstens één signHere
     */
    velden: Veld[];
};
export type EnvelopInvoer = {
    /**
     * onderwerp van de mail van DocuSign (wordt op 100 tekens afgekapt)
     */
    onderwerp: string;
    /**
     * tekst in die mail, platte tekst (afgekapt op 10.000)
     */
    bericht?: string | undefined;
    /**
     * true (standaard): meteen naar de ondertekenaar ('sent');
     * false: als concept in DocuSign ('created'), daar na te kijken en te versturen
     */
    versturen?: boolean | undefined;
    documenten: Document[];
    ondertekenaars: Ondertekenaar[];
    /**
     * krijgen een kopie; lege, dubbele en
     * adressen van een ondertekenaar vallen weg
     */
    ccs?: {
        naam: string;
        email: string;
    }[] | undefined;
    /**
     * voor het begrenzen van offsets (standaard A4 staand)
     */
    pagina?: import("./tabs.js").PaginaBox | undefined;
};
