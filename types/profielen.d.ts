/**
 * Alle machtigingsprofielen van het account.
 * @param {string} basisUrl
 * @param {string} accountId
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Array<{ id: string, naam: string }>>}
 */
export function haalProfielenOp(basisUrl: string, accountId: string, token: string, fetchImpl?: typeof fetch): Promise<Array<{
    id: string;
    naam: string;
}>>;
/**
 * Het ene profiel met "sender" in de naam. Geen of meer dan één is geen keuze
 * die de app zelf mag maken.
 * @param {Array<{ id: string, naam: string }>} profielen
 */
export function vindVerzendProfiel(profielen: Array<{
    id: string;
    naam: string;
}>): {
    id: string;
    naam: string;
};
/**
 * Het machtigingsprofiel van één gebruiker zetten (Users:update).
 * @param {string} basisUrl
 * @param {string} accountId
 * @param {string} token
 * @param {string} userId
 * @param {string} profielId
 * @param {typeof fetch} [fetchImpl]
 */
export function zetProfiel(basisUrl: string, accountId: string, token: string, userId: string, profielId: string, fetchImpl?: typeof fetch): Promise<void>;
export function beheerrechtBoodschap(): string;
