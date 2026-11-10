// Verzendrecht geven (uit mit-rental, lib/docusign/profielen.js): een nieuwe
// SSO-gebruiker krijgt het profiel "DS Viewer" en mag dan geen envelop versturen.
// Een beheerder van de app kan hem met één klik het Sender-profiel geven.
//
// Dat doet de koppelgebruiker (DOCUSIGN_USER_ID), die daarvoor zelf gebruikers
// moet mogen beheren (profiel "DS Admin"); anders `GEEN_BEHEERRECHT`. Dit is de
// enige wijziging die de bouwsteen buiten een envelop in DocuSign doet, en alleen
// als de app hem expliciet aanroept. Let op de licentie: Sender-seats tellen mee.
import { DocusignProfielFout, antwoordFout } from './fouten.js'
import { magVersturen } from './verzender.js'

/** DocuSign geeft deze codes als de koppelgebruiker geen gebruikers mag beheren. */
const BEHEERRECHT_CODES = ['USER_LACKS_PERMISSIONS', 'USER_NOT_ACCOUNT_ADMIN', 'ACCOUNT_LACKS_PERMISSIONS', 'USER_AUTHENTICATION_FAILED']

export const beheerrechtBoodschap = () =>
  'De koppelgebruiker van de app (DOCUSIGN_USER_ID) mag in DocuSign geen gebruikers beheren. Geef hem in DocuSign Admin het profiel "DS Admin", of geef het verzendrecht daar zelf.'

/**
 * Alle machtigingsprofielen van het account.
 * @param {string} basisUrl
 * @param {string} accountId
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Array<{ id: string, naam: string }>>}
 */
export async function haalProfielenOp(basisUrl, accountId, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${basisUrl}/v2.1/accounts/${accountId}/permission_profiles`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const fout = await antwoordFout(response, 'Machtigingsprofielen ophalen')
    if (fout.errorCode && BEHEERRECHT_CODES.includes(fout.errorCode)) throw new DocusignProfielFout('GEEN_BEHEERRECHT', beheerrechtBoodschap())
    throw fout
  }
  const data = await response.json()
  /** @type {Array<{ permissionProfileId?: unknown, permissionProfileName?: unknown }>} */
  const lijst = data.permissionProfiles ?? []
  return lijst
    .map((p) => ({ id: String(p.permissionProfileId ?? ''), naam: String(p.permissionProfileName ?? '') }))
    .filter((p) => p.id)
}

/**
 * Het ene profiel met "sender" in de naam. Geen of meer dan één is geen keuze
 * die de app zelf mag maken.
 * @param {Array<{ id: string, naam: string }>} profielen
 */
export function vindVerzendProfiel(profielen) {
  const kandidaten = profielen.filter((p) => /sender/i.test(p.naam) && magVersturen(p.naam))
  if (kandidaten.length === 1) return kandidaten[0]
  if (kandidaten.length === 0) {
    throw new DocusignProfielFout(
      'GEEN_VERZENDPROFIEL',
      `Het account heeft geen machtigingsprofiel met "Sender" in de naam (wel: ${profielen.map((p) => p.naam).join(', ') || 'geen'}). Geef het verzendrecht in DocuSign Admin.`,
    )
  }
  throw new DocusignProfielFout(
    'MEERDERE_VERZENDPROFIELEN',
    `Het account heeft meer dan één profiel met "Sender" in de naam (${kandidaten.map((p) => p.naam).join(', ')}); de app kiest er niet zelf een. Geef het verzendrecht in DocuSign Admin.`,
  )
}

/**
 * Het machtigingsprofiel van één gebruiker zetten (Users:update).
 * @param {string} basisUrl
 * @param {string} accountId
 * @param {string} token
 * @param {string} userId
 * @param {string} profielId
 * @param {typeof fetch} [fetchImpl]
 */
export async function zetProfiel(basisUrl, accountId, token, userId, profielId, fetchImpl = fetch) {
  const response = await fetchImpl(`${basisUrl}/v2.1/accounts/${accountId}/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ permissionProfileId: profielId }),
  })
  if (!response.ok) {
    const fout = await antwoordFout(response, 'Machtigingsprofiel zetten')
    if (fout.errorCode && BEHEERRECHT_CODES.includes(fout.errorCode)) throw new DocusignProfielFout('GEEN_BEHEERRECHT', beheerrechtBoodschap())
    throw fout
  }
}
