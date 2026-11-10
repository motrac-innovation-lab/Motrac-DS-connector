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
export function zoekDocusignGebruiker(basisUrl: string, accountId: string, koppelToken: string, email: string, fetchImpl?: typeof fetch): Promise<{
    userId: string;
    profiel: string;
} | null>;
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
export function maakVerzenderTokens(config: import("./config.js").DocusignConfig, fetchImpl?: typeof fetch): VerzenderTokens;
export function magVersturen(profiel: unknown): boolean;
export type VerzenderTokens = {
    /**
     *   Access token op naam van de DocuSign-gebruiker bij `email`. Gooit
     *   `DocusignVerzenderFout` bij een probleem dat een mens kan oplossen; elke
     *   andere fout gaat ongewijzigd door.
     */
    tokenVoor: (email: string | null | undefined, koppel: {
        token: string;
        basisUrl: string;
    }) => Promise<string>;
};
