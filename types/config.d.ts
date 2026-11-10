/**
 * @typedef {object} DocusignConfig
 * @property {string} oauthBaseUrl inlogdienst zonder slash aan het eind
 * @property {string} accountId API Account ID
 * @property {string} integrationKey integratiesleutel van de DocuSign-app
 * @property {string} userId de koppelgebruiker: zoekt alleen op, verstuurt nooit
 * @property {string} privateKey PEM (PKCS#8, "BEGIN PRIVATE KEY")
 * @property {string} webhookHmacKey HMAC-sleutel van Connect; leeg = webhook uit
 */
/**
 * De PEM uit `DOCUSIGN_PRIVATE_KEY_BASE64`: base64 van de hele PEM op één regel
 * (een meerregelige PEM breekt het Environment-paneel). Staat er toch een PEM,
 * eventueel met letterlijke `\n`, dan mag dat ook. Leeg wordt ''.
 * @param {unknown} waarde
 * @returns {string}
 */
export function pemUitBase64(waarde: unknown): string;
/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {DocusignConfig}
 */
export function docusignConfig(env?: Record<string, string | undefined>): DocusignConfig;
/**
 * Welke verplichte variabelen nog leeg zijn (alleen de namen).
 * `DOCUSIGN_OAUTH_BASE_URL` valt terug op demo en `DOCUSIGN_WEBHOOK_HMAC_KEY`
 * schakelt alleen de webhook; die tellen hier niet mee.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function ontbrekendeEnv(env?: Record<string, string | undefined>): string[];
/**
 * Demo of productie, afgeleid van de inlogdienst. Voor de stand in een
 * beheerscherm: "DocuSign (demo)" voorkomt dat iemand denkt dat het echt is.
 * @param {Pick<DocusignConfig, 'oauthBaseUrl'>} config
 * @returns {'demo' | 'productie' | 'anders'}
 */
export function omgevingVan(config: Pick<DocusignConfig, "oauthBaseUrl">): "demo" | "productie" | "anders";
/** De demo-inlogdienst; productie is https://account.docusign.com. */
export const DEMO_OAUTH_BASE_URL: "https://account-d.docusign.com";
export const PRODUCTIE_OAUTH_BASE_URL: "https://account.docusign.com";
/** De variabelen die de koppeling nodig heeft om te versturen. */
export const VERPLICHTE_ENV: readonly ["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_PRIVATE_KEY_BASE64"];
/** Alle variabelen die de bouwsteen leest. */
export const ALLE_ENV: readonly ["DOCUSIGN_OAUTH_BASE_URL", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_PRIVATE_KEY_BASE64", "DOCUSIGN_WEBHOOK_HMAC_KEY"];
export function isIngesteld(env?: Record<string, string | undefined>): boolean;
export type DocusignConfig = {
    /**
     * inlogdienst zonder slash aan het eind
     */
    oauthBaseUrl: string;
    /**
     * API Account ID
     */
    accountId: string;
    /**
     * integratiesleutel van de DocuSign-app
     */
    integrationKey: string;
    /**
     * de koppelgebruiker: zoekt alleen op, verstuurt nooit
     */
    userId: string;
    /**
     * PEM (PKCS#8, "BEGIN PRIVATE KEY")
     */
    privateKey: string;
    /**
     * HMAC-sleutel van Connect; leeg = webhook uit
     */
    webhookHmacKey: string;
};
