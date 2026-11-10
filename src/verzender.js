// De envelop op naam van de gebruiker die op "Versturen" drukt (mit-contractenbeheer
// errata § AH / ADR-0055; mit-rental docs/DOCUSIGN.md).
//
// De vaste gebruiker uit `DOCUSIGN_USER_ID` is alleen de koppelgebruiker: hij
// zoekt de DocuSign-gebruiker bij het e-mailadres van de verzender op, en de
// envelop zelf gaat met een token op naam van die verzender. De DocuSign-ID
// verschilt per omgeving (demo of productie) en wordt daarom nergens vastgelegd,
// alleen per proces onthouden; het e-mailadres is de enige sleutel.
//
// Toestemming (`signature impersonation`) staat in DocuSign Admin → Verbonden
// apps op organisatieniveau voor het domein motrac.nl; een verzender hoeft zelf
// niets te doen behalve eenmalig via SSO inloggen (dan bestaat de gebruiker).
import { haalToegangstokenOp } from './auth.js'
import { DocusignAuthFout, DocusignVerzenderFout, antwoordFout } from './fouten.js'

/**
 * Mag dit permissieprofiel envelopen versturen? "DocuSign Viewer" is het
 * standaardprofiel van een nieuwe SSO-gebruiker en mag het niet; dat vangen we
 * vooraf af. Elk ander profiel laat de envelop-aanroep zelf oordelen
 * (`USER_LACKS_PERMISSIONS` wordt dan dezelfde reden).
 * @param {unknown} profiel
 */
export const magVersturen = (profiel) => !/viewer/i.test(String(profiel ?? ''))

/**
 * De actieve DocuSign-gebruiker bij een e-mailadres (Users:list met
 * `email`-filter), met het token van de koppelgebruiker. Het filter kan bij
 * oudere accounts meer dan één gebruiker opleveren: de eerste actieve met precies
 * dat adres wint.
 * @param {string} basisUrl
 * @param {string} accountId
 * @param {string} koppelToken
 * @param {string} email
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ userId: string, profiel: string } | null>}
 */
export async function zoekDocusignGebruiker(basisUrl, accountId, koppelToken, email, fetchImpl = fetch) {
  const url = `${basisUrl}/v2.1/accounts/${accountId}/users?email=${encodeURIComponent(email)}&status=Active`
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${koppelToken}` } })
  if (!response.ok) throw await antwoordFout(response, 'DocuSign-gebruiker opzoeken')
  const data = await response.json()
  const gezocht = email.trim().toLowerCase()
  /** @type {Array<{ userId?: string, email?: string, userStatus?: string, permissionProfileName?: string }>} */
  const gebruikers = data.users ?? []
  const treffer = gebruikers.find(
    (u) => u.userId && u.email?.trim().toLowerCase() === gezocht && (u.userStatus ?? '').toLowerCase() === 'active',
  )
  return treffer?.userId ? { userId: treffer.userId, profiel: String(treffer.permissionProfileName ?? '') } : null
}

/**
 * @typedef {object} VerzenderTokens
 * @property {(email: string | null | undefined, koppel: { token: string, basisUrl: string }) => Promise<string>} tokenVoor
 *   Access token op naam van de DocuSign-gebruiker bij `email`. Gooit
 *   `DocusignVerzenderFout` bij een probleem dat een mens kan oplossen; elke
 *   andere fout gaat ongewijzigd door.
 */

/**
 * De ID per e-mailadres blijft voor de levensduur van het proces bewaard
 * (DocuSign raadt af om bij elke verzending opnieuw te zoeken). Mislukt de
 * tokenaanvraag, dan valt de bewaarde ID weg: een opnieuw aangemaakte gebruiker
 * krijgt een nieuwe ID.
 * @param {import('./config.js').DocusignConfig} config
 * @param {typeof fetch} [fetchImpl]
 * @returns {VerzenderTokens}
 */
export function maakVerzenderTokens(config, fetchImpl = fetch) {
  /** @type {Map<string, string>} */
  const idPerEmail = new Map()

  return {
    async tokenVoor(email, koppel) {
      const adres = email?.trim()
      if (!adres) throw new DocusignVerzenderFout('GEEN_EMAIL', null)
      const sleutel = adres.toLowerCase()

      let userId = idPerEmail.get(sleutel)
      if (!userId) {
        const gevonden = await zoekDocusignGebruiker(koppel.basisUrl, config.accountId, koppel.token, adres, fetchImpl)
        if (!gevonden) throw new DocusignVerzenderFout('GEEN_ACCOUNT', adres)
        // Niet onthouden: de beheerder kan het profiel omzetten.
        if (!magVersturen(gevonden.profiel)) throw new DocusignVerzenderFout('GEEN_VERZENDRECHT', adres, gevonden.profiel)
        userId = gevonden.userId
        idPerEmail.set(sleutel, userId)
      }

      try {
        return await haalToegangstokenOp({ ...config, userId }, fetchImpl)
      } catch (error) {
        idPerEmail.delete(sleutel)
        if (error instanceof DocusignAuthFout && error.oauthFout === 'consent_required') {
          throw new DocusignVerzenderFout('GEEN_TOESTEMMING', adres)
        }
        throw error
      }
    },
  }
}
