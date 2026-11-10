/** @typedef {typeof VERZENDER_REDENEN[number]} VerzenderReden */
/**
 * Neutrale Nederlandse tekst bij een reden. De app mag hem letterlijk tonen of
 * een eigen tekst maken op `reden` (bijvoorbeeld met de plek in de app waar het
 * e-mailadres staat).
 * @param {VerzenderReden | string} reden
 * @param {string | null} email
 * @param {string} [profiel]
 */
export function verzenderBoodschap(reden: VerzenderReden | string, email: string | null, profiel?: string): string;
/**
 * De `errorCode` uit een DocuSign-antwoord. Bij een gateway-fout of rate-limit
 * komt er HTML of platte tekst terug; dat mag het afhandelen niet laten crashen.
 * @param {string} body
 * @returns {string | null}
 */
export function leesFoutcode(body: string): string | null;
/**
 * `{"error":"consent_required"}` wordt `consent_required`; anders null.
 * @param {string} body
 * @returns {string | null}
 */
export function leesOAuthFout(body: string): string | null;
/**
 * De fout bij een niet-ok antwoord. `.text()` kan zelf falen (afgebroken
 * verbinding); dat mag de oorspronkelijke fout niet overschrijven.
 * @param {Response} response
 * @param {string} wat bv. 'DocuSign-envelop aanmaken'
 */
export function antwoordFout(response: Response, wat: string): Promise<DocusignFout>;
/** DOCUSIGN_PRIVATE_KEY_BASE64 is leeg: de koppeling staat uit (de app kan dan een demo tonen). */
export class DocusignNietIngesteld extends Error {
    constructor();
}
/** Een fout van de DocuSign-API (REST). */
export class DocusignFout extends Error {
    /**
     * @param {number} status HTTP-status van het antwoord
     * @param {string} body de ruwe antwoordtekst (alleen voor het serverlog)
     * @param {string | null} errorCode `errorCode` uit het antwoord, of null
     * @param {string} boodschap
     */
    constructor(status: number, body: string, errorCode: string | null, boodschap: string);
    status: number;
    body: string;
    errorCode: string | null;
}
/**
 * Mislukte token-exchange (of een ongeldige sleutel, dan `status` 0 en
 * `oauthFout` 'ongeldige_sleutel'). `consent_required` betekent: de app mag niet
 * namens deze gebruiker handelen.
 */
export class DocusignAuthFout extends Error {
    /**
     * @param {number} status
     * @param {string | null} oauthFout
     * @param {string} boodschap
     */
    constructor(status: number, oauthFout: string | null, boodschap: string);
    status: number;
    oauthFout: string | null;
}
/**
 * De redenen waarom een envelop niet op naam van de verzender kan, in de
 * volgorde waarin ze getoetst worden. Alle vier los te maken door een mens;
 * er is dan niets verstuurd.
 */
export const VERZENDER_REDENEN: readonly ["GEEN_EMAIL", "GEEN_ACCOUNT", "GEEN_VERZENDRECHT", "GEEN_TOESTEMMING"];
/** Versturen op naam kan niet; zie `reden`. Er is niets verstuurd. */
export class DocusignVerzenderFout extends Error {
    /**
     * @param {VerzenderReden} reden
     * @param {string | null} email
     * @param {string} [profiel] het permissieprofiel in DocuSign (bij GEEN_VERZENDRECHT)
     */
    constructor(reden: VerzenderReden, email: string | null, profiel?: string);
    reden: "GEEN_EMAIL" | "GEEN_ACCOUNT" | "GEEN_VERZENDRECHT" | "GEEN_TOESTEMMING";
    email: string | null;
    profiel: string;
}
/** De invoer voor een envelop klopt niet (voordat er iets naar DocuSign gaat). */
export class DocusignInvoerFout extends Error {
    /**
     * @param {string} veld welk deel van de invoer, bv. 'ondertekenaars[0].email'
     * @param {string} boodschap
     */
    constructor(veld: string, boodschap: string);
    veld: string;
}
/** Het testslot hield de envelop tegen: niet live en geen testontvanger. */
export class DocusignGeblokkeerd extends Error {
    /** @param {string} aan */
    constructor(aan: string);
    aan: string;
}
/** Een probleem met het account bij "verzendrecht geven"; de beheerder lost het op in DocuSign Admin. */
export class DocusignProfielFout extends Error {
    /**
     * @param {'GEEN_BEHEERRECHT' | 'GEEN_VERZENDPROFIEL' | 'MEERDERE_VERZENDPROFIELEN'} reden
     * @param {string} boodschap
     */
    constructor(reden: "GEEN_BEHEERRECHT" | "GEEN_VERZENDPROFIEL" | "MEERDERE_VERZENDPROFIELEN", boodschap: string);
    reden: "GEEN_BEHEERRECHT" | "GEEN_VERZENDPROFIEL" | "MEERDERE_VERZENDPROFIELEN";
}
export type VerzenderReden = (typeof VERZENDER_REDENEN)[number];
