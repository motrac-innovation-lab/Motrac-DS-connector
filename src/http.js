// De fouten van de bouwsteen als HTTP-antwoord. Beide apps hadden deze vertaling
// elk zelf (mit-rental `docusignApiFout`, mit-contractenbeheer `apiFout.ts`); de
// codes hier zijn die van mit-rental.
//
// Details van DocuSign (body, OAuth-fout) gaan nooit naar de browser: `log` is
// true als de app de oorspronkelijke fout in het serverlog moet zetten.
import {
  DocusignAuthFout,
  DocusignFout,
  DocusignGeblokkeerd,
  DocusignInvoerFout,
  DocusignNietIngesteld,
  DocusignProfielFout,
  DocusignVerzenderFout,
} from './fouten.js'

/**
 * @typedef {object} HttpFout
 * @property {400 | 409 | 502} status
 * @property {'DOCUSIGN_INVOER' | 'DOCUSIGN_UIT' | 'DOCUSIGN_VERZENDER' | 'DOCUSIGN_BEHEER' | 'DOCUSIGN_GEBLOKKEERD' | 'DOCUSIGN_FOUT'} code
 * @property {string} boodschap voor de gebruiker
 * @property {Record<string, string>} details extra velden voor de frontend (reden, email, profiel, veld)
 * @property {boolean} log zet de oorspronkelijke fout in het serverlog
 */

/**
 * @param {unknown} fout
 * @returns {HttpFout | null} null = geen fout van de bouwsteen; laat de app hem afhandelen
 */
export function httpFout(fout) {
  if (fout instanceof DocusignInvoerFout) {
    return { status: 400, code: 'DOCUSIGN_INVOER', boodschap: fout.message, details: { veld: fout.veld }, log: false }
  }
  if (fout instanceof DocusignNietIngesteld) {
    return { status: 409, code: 'DOCUSIGN_UIT', boodschap: 'DocuSign is niet ingesteld op de backend (omgevingsvariabelen DOCUSIGN_*).', details: {}, log: false }
  }
  if (fout instanceof DocusignVerzenderFout) {
    /** @type {Record<string, string>} */
    const details = { reden: fout.reden }
    if (fout.email) details.email = fout.email
    if (fout.profiel) details.profiel = fout.profiel
    return { status: 409, code: 'DOCUSIGN_VERZENDER', boodschap: fout.message, details, log: false }
  }
  if (fout instanceof DocusignProfielFout) {
    return { status: 409, code: 'DOCUSIGN_BEHEER', boodschap: fout.message, details: { reden: fout.reden }, log: false }
  }
  if (fout instanceof DocusignGeblokkeerd) {
    return { status: 409, code: 'DOCUSIGN_GEBLOKKEERD', boodschap: fout.message, details: {}, log: false }
  }
  if (fout instanceof DocusignAuthFout) {
    return {
      status: 502,
      code: 'DOCUSIGN_FOUT',
      boodschap: `DocuSign weigert de koppeling (${fout.oauthFout || fout.status}). De beheerder vindt de details in het serverlog.`,
      details: {},
      log: true,
    }
  }
  if (fout instanceof DocusignFout) {
    return {
      status: 502,
      code: 'DOCUSIGN_FOUT',
      boodschap: `DocuSign gaf een fout (${fout.errorCode || fout.status}). De beheerder vindt de details in het serverlog.`,
      details: fout.errorCode ? { errorCode: fout.errorCode } : {},
      log: true,
    }
  }
  return null
}
