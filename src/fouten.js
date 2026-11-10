// De fouten van de bouwsteen. Elke fout heeft zijn brokstukken los beschikbaar
// (status, errorCode, reden), zodat de app ze naar een HTTP-antwoord en een
// eigen tekst kan vertalen zonder een melding met een regex uit te pluizen.
//
// De `message` van DocusignFout en DocusignAuthFout blijft `… mislukt (400): …`,
// het formaat dat beide apps al loggen.

/** DOCUSIGN_PRIVATE_KEY_BASE64 is leeg: de koppeling staat uit (de app kan dan een demo tonen). */
export class DocusignNietIngesteld extends Error {
  constructor() {
    super('DocuSign is niet ingesteld: DOCUSIGN_PRIVATE_KEY_BASE64 is leeg.')
    this.name = 'DocusignNietIngesteld'
  }
}

/** Een fout van de DocuSign-API (REST). */
export class DocusignFout extends Error {
  /**
   * @param {number} status HTTP-status van het antwoord
   * @param {string} body de ruwe antwoordtekst (alleen voor het serverlog)
   * @param {string | null} errorCode `errorCode` uit het antwoord, of null
   * @param {string} boodschap
   */
  constructor(status, body, errorCode, boodschap) {
    super(boodschap)
    this.name = 'DocusignFout'
    this.status = status
    this.body = body
    this.errorCode = errorCode
  }
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
  constructor(status, oauthFout, boodschap) {
    super(boodschap)
    this.name = 'DocusignAuthFout'
    this.status = status
    this.oauthFout = oauthFout
  }
}

/**
 * De redenen waarom een envelop niet op naam van de verzender kan, in de
 * volgorde waarin ze getoetst worden. Alle vier los te maken door een mens;
 * er is dan niets verstuurd.
 */
export const VERZENDER_REDENEN = /** @type {const} */ (['GEEN_EMAIL', 'GEEN_ACCOUNT', 'GEEN_VERZENDRECHT', 'GEEN_TOESTEMMING'])

/** @typedef {typeof VERZENDER_REDENEN[number]} VerzenderReden */

/**
 * Neutrale Nederlandse tekst bij een reden. De app mag hem letterlijk tonen of
 * een eigen tekst maken op `reden` (bijvoorbeeld met de plek in de app waar het
 * e-mailadres staat).
 * @param {VerzenderReden | string} reden
 * @param {string | null} email
 * @param {string} [profiel]
 */
export function verzenderBoodschap(reden, email, profiel = '') {
  switch (reden) {
    case 'GEEN_EMAIL':
      return 'Van de verzender is geen e-mailadres bekend, dus de envelop kan niet op zijn of haar naam via DocuSign. Er is niets verstuurd.'
    case 'GEEN_ACCOUNT':
      return `Er is geen actieve DocuSign-gebruiker met het e-mailadres ${email}. Log eenmalig in op DocuSign via SSO met je @motrac.nl-account; daarna kan de app op jouw naam versturen. Er is niets verstuurd.`
    case 'GEEN_VERZENDRECHT':
      return `De DocuSign-gebruiker ${email} mag geen envelopen versturen${profiel ? ` (profiel "${profiel}")` : ''}. Vraag de DocuSign-beheerder om het profiel "DocuSign Sender". Er is niets verstuurd.`
    case 'GEEN_TOESTEMMING':
      return `DocuSign staat de app niet toe om namens ${email} te versturen. Log eenmalig in op DocuSign via SSO met je @motrac.nl-account, of vraag de DocuSign-beheerder de app toe te staan (Verbonden apps, 'signature impersonation'). Er is niets verstuurd.`
    default:
      return 'DocuSign kan niet op naam van deze verzender versturen. Er is niets verstuurd.'
  }
}

/** Versturen op naam kan niet; zie `reden`. Er is niets verstuurd. */
export class DocusignVerzenderFout extends Error {
  /**
   * @param {VerzenderReden} reden
   * @param {string | null} email
   * @param {string} [profiel] het permissieprofiel in DocuSign (bij GEEN_VERZENDRECHT)
   */
  constructor(reden, email, profiel = '') {
    super(verzenderBoodschap(reden, email, profiel))
    this.name = 'DocusignVerzenderFout'
    this.reden = reden
    this.email = email
    this.profiel = profiel
  }
}

/** De invoer voor een envelop klopt niet (voordat er iets naar DocuSign gaat). */
export class DocusignInvoerFout extends Error {
  /**
   * @param {string} veld welk deel van de invoer, bv. 'ondertekenaars[0].email'
   * @param {string} boodschap
   */
  constructor(veld, boodschap) {
    super(boodschap)
    this.name = 'DocusignInvoerFout'
    this.veld = veld
  }
}

/** Het testslot hield de envelop tegen: niet live en geen testontvanger. */
export class DocusignGeblokkeerd extends Error {
  /** @param {string} aan */
  constructor(aan) {
    super(
      `DocuSign-envelop naar '${aan}' is tegengehouden: de app staat niet live en er is geen testontvanger ingesteld. Er is niets verstuurd.`,
    )
    this.name = 'DocusignGeblokkeerd'
    this.aan = aan
  }
}

/** Een probleem met het account bij "verzendrecht geven"; de beheerder lost het op in DocuSign Admin. */
export class DocusignProfielFout extends Error {
  /**
   * @param {'GEEN_BEHEERRECHT' | 'GEEN_VERZENDPROFIEL' | 'MEERDERE_VERZENDPROFIELEN'} reden
   * @param {string} boodschap
   */
  constructor(reden, boodschap) {
    super(boodschap)
    this.name = 'DocusignProfielFout'
    this.reden = reden
  }
}

/**
 * De `errorCode` uit een DocuSign-antwoord. Bij een gateway-fout of rate-limit
 * komt er HTML of platte tekst terug; dat mag het afhandelen niet laten crashen.
 * @param {string} body
 * @returns {string | null}
 */
export function leesFoutcode(body) {
  try {
    const data = JSON.parse(body)
    return typeof data?.errorCode === 'string' ? data.errorCode : null
  } catch {
    return null
  }
}

/**
 * `{"error":"consent_required"}` wordt `consent_required`; anders null.
 * @param {string} body
 * @returns {string | null}
 */
export function leesOAuthFout(body) {
  try {
    const data = JSON.parse(body)
    return typeof data?.error === 'string' ? data.error : null
  } catch {
    return null
  }
}

/**
 * De fout bij een niet-ok antwoord. `.text()` kan zelf falen (afgebroken
 * verbinding); dat mag de oorspronkelijke fout niet overschrijven.
 * @param {Response} response
 * @param {string} wat bv. 'DocuSign-envelop aanmaken'
 */
export async function antwoordFout(response, wat) {
  const tekst = await response.text().catch(() => '')
  return new DocusignFout(response.status, tekst, leesFoutcode(tekst), `${wat} mislukt (${response.status}): ${tekst}`)
}
