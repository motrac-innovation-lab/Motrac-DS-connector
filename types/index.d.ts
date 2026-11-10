/**
 * @typedef {object} KoppelingStand
 * @property {'ok' | 'niet_ingesteld' | 'fout'} status
 * @property {number} [latentieMs]
 * @property {string} [foutmelding] alleen voor het serverlog of een beheerder; bevat nooit een geheim
 * @property {string} gecontroleerdOp
 */
/**
 * @typedef {object} VerzenderStand
 * @property {'ok' | 'geen_email' | 'geen_account' | 'geen_verzendrecht' | 'geen_toestemming' | 'niet_ingesteld' | 'fout'} status
 * @property {string | null} email
 * @property {string} [boodschap] de tekst bij een reden, voor de gebruiker
 * @property {string} [profiel] het DocuSign-profiel bij geen_verzendrecht
 * @property {string} [foutmelding]
 * @property {string} gecontroleerdOp
 */
/**
 * @param {import('./config.js').DocusignConfig} config uit `docusignConfig()`
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [opties]
 */
export function maakDocusign(config: import("./config.js").DocusignConfig, { fetch: fetchImpl, timeoutMs }?: {
    fetch?: typeof fetch;
    timeoutMs?: number;
}): {
    /**
     * Maakt de envelop aan op naam van `verzenderEmail` (de ingelogde gebruiker,
     * of de verzender op het record). Er is geen terugval op de koppelgebruiker:
     * kan het niet op naam, dan gooit hij `DocusignVerzenderFout` en is er niets
     * verstuurd. De invoer wordt eerst getoetst (`DocusignInvoerFout`).
     * @param {import('./envelop.js').EnvelopInvoer & { verzenderEmail: string | null | undefined }} invoer
     * @returns {Promise<{ envelopeId: string, status: string, verzondenOp: string }>}
     */
    verstuurEnvelop({ verzenderEmail, ...invoer }: import("./envelop.js").EnvelopInvoer & {
        verzenderEmail: string | null | undefined;
    }): Promise<{
        envelopeId: string;
        status: string;
        verzondenOp: string;
    }>;
    /**
     * De envelop zoals DocuSign hem kent (`status`, `sentDateTime`,
     * `completedDateTime`, `voidedReason`, …). Met het token van de verzender als
     * dat lukt, anders met dat van de koppelgebruiker.
     * @param {string} envelopeId
     * @param {{ verzenderEmail?: string | null }} [opties]
     * @returns {Promise<Record<string, any>>}
     */
    haalEnvelopOp(envelopeId: string, { verzenderEmail }?: {
        verzenderEmail?: string | null;
    }): Promise<Record<string, any>>;
    /**
     * De getekende PDF: alle documenten samen, met het certificaat van voltooiing.
     * @param {string} envelopeId
     * @param {{ verzenderEmail?: string | null }} [opties]
     * @returns {Promise<Buffer>}
     */
    haalGetekendDocumentOp(envelopeId: string, { verzenderEmail }?: {
        verzenderEmail?: string | null;
    }): Promise<Buffer>;
    /**
     * Een verstuurde envelop intrekken (void). Onomkeerbaar: de ondertekenaar kan
     * niet meer tekenen en krijgt een mail van DocuSign met de reden. Alleen na een
     * bevestiging in de app. Op naam van de verzender, zonder terugval.
     * @param {string} envelopeId
     * @param {{ reden: string, verzenderEmail: string | null | undefined }} opties
     */
    trekEnvelopIn(envelopeId: string, { reden, verzenderEmail }: {
        reden: string;
        verzenderEmail: string | null | undefined;
    }): Promise<void>;
    /**
     * Werkt de inlog van de koppelgebruiker en hoort het account-ID erbij? Verstuurt
     * niets en gooit nooit. Let op: een token van minder dan een uur oud wordt
     * hergebruikt (`vergeetTokens()` dwingt een nieuwe inlog af).
     * @returns {Promise<KoppelingStand>}
     */
    controleerKoppeling(): Promise<KoppelingStand>;
    /**
     * "Kan de app op naam van deze persoon versturen?" Doorloopt de stappen van
     * een echte verzending tot en met het token op naam, en stopt vóór de envelop.
     * Gooit nooit.
     * @param {string | null | undefined} email
     * @returns {Promise<VerzenderStand>}
     */
    controleerVerzender(email: string | null | undefined): Promise<VerzenderStand>;
    /**
     * Geeft een gebruiker met een Viewer-profiel het Sender-profiel. Raakt alleen
     * een Viewer aan. Gooit `DocusignProfielFout` bij een probleem met het hele
     * account (koppelgebruiker geen DS Admin, geen of meer dan één Sender-profiel).
     * Alleen aanroepen op een klik van een beheerder van de app.
     * @param {string} email
     * @returns {Promise<{ uitkomst: 'gegeven' | 'al_verzender' | 'geen_account', profiel: string }>}
     */
    geefVerzendrecht(email: string): Promise<{
        uitkomst: "gegeven" | "al_verzender" | "geen_account";
        profiel: string;
    }>;
};
export * from "./config.js";
export * from "./fouten.js";
export { httpFout } from "./http.js";
export type KoppelingStand = {
    status: "ok" | "niet_ingesteld" | "fout";
    latentieMs?: number | undefined;
    /**
     * alleen voor het serverlog of een beheerder; bevat nooit een geheim
     */
    foutmelding?: string | undefined;
    gecontroleerdOp: string;
};
export type VerzenderStand = {
    status: "ok" | "geen_email" | "geen_account" | "geen_verzendrecht" | "geen_toestemming" | "niet_ingesteld" | "fout";
    email: string | null;
    /**
     * de tekst bij een reden, voor de gebruiker
     */
    boodschap?: string | undefined;
    /**
     * het DocuSign-profiel bij geen_verzendrecht
     */
    profiel?: string | undefined;
    foutmelding?: string | undefined;
    gecontroleerdOp: string;
};
export type DocusignConfig = import("./config.js").DocusignConfig;
export type EnvelopInvoer = import("./envelop.js").EnvelopInvoer;
export type Document = import("./envelop.js").Document;
export type Ondertekenaar = import("./envelop.js").Ondertekenaar;
export type Veld = import("./envelop.js").Veld;
export type PaginaBox = import("./tabs.js").PaginaBox;
export type TabSoort = import("./tabs.js").TabSoort;
export type VerzenderReden = import("./fouten.js").VerzenderReden;
export type WebhookEvent = import("./webhook.js").WebhookEvent;
export type EnvelopEvent = import("./webhook.js").EnvelopEvent;
export type WebhookUitkomst = import("./webhook.js").WebhookUitkomst;
export type Claim = import("./webhook.js").Claim;
export type HttpFout = import("./http.js").HttpFout;
export type Docusign = ReturnType<typeof maakDocusign>;
import { Buffer } from 'node:buffer';
export { bouwJwtAssertion, haalAccountBasisUrlOp, haalToegangstokenOp, vergeetTokens } from "./auth.js";
export { bouwEnvelopBody, DOCUMENT_SOORTEN, MAX_BERICHT, MAX_DOCUMENT_BYTES, MAX_ONDERWERP } from "./envelop.js";
export { A4_LIGGEND, A4_STAAND, TAB_SOORTEN, bouwAnkerTab, clampOffset } from "./tabs.js";
export { magVersturen, maakVerzenderTokens, zoekDocusignGebruiker } from "./verzender.js";
export { beheerrechtBoodschap, haalProfielenOp, vindVerzendProfiel, zetProfiel } from "./profielen.js";
export { CONNECT_EVENTS, normaliseerConnect, signatureKoppen, verifieerHandtekening, verifieerWebhook, verwerkWebhook } from "./webhook.js";
export { WEBHOOK_EVENT_SQL, geheugenClaim, maakClaim } from "./idempotentie.js";
export { metTestSlot, testOntvangersUit } from "./testslot.js";
