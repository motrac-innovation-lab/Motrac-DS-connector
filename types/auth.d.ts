/**
 * De JWT-assertion (RS256), een uur geldig, met scope `signature impersonation`
 * (nodig om namens een andere gebruiker te handelen).
 * @param {AuthConfig} config
 * @returns {Promise<string>}
 */
export function bouwJwtAssertion(config: AuthConfig): Promise<string>;
/** Beide caches leeg: na het wijzigen van de sleutel, en in tests. */
export function vergeetTokens(): void;
/**
 * Wisselt de JWT-assertion in voor een access token, of hergebruikt een bewaard
 * token dat nog meer dan 60 s geldig is.
 * @param {AuthConfig} config
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export function haalToegangstokenOp(config: AuthConfig, fetchImpl?: typeof fetch): Promise<string>;
/**
 * Het API-basisdomein bij het account-ID, uit `/oauth/userinfo`. DocuSign kent
 * geen vast domein per omgeving (behalve demo), dus dit is leidend en niet een
 * losse variabele. Hoort het account-ID niet bij de gebruiker, dan noemt de fout
 * de accounts die wel bestaan in plaats van een kale 401 bij de envelop.
 * @param {{ oauthBaseUrl: string, accountId: string, userId: string }} config
 * @param {string} accessToken
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} `${base_uri}/restapi`
 */
export function haalAccountBasisUrlOp(config: {
    oauthBaseUrl: string;
    accountId: string;
    userId: string;
}, accessToken: string, fetchImpl?: typeof fetch): Promise<string>;
export type AuthConfig = {
    oauthBaseUrl: string;
    integrationKey: string;
    userId: string;
    privateKey: string;
};
