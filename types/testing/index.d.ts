/**
 * Een RSA-sleutelpaar zoals DocuSign het verwacht, en de privésleutel zoals hij
 * in `DOCUSIGN_PRIVATE_KEY_BASE64` staat.
 */
export function maakTestSleutel(): {
    privateKey: string;
    publicKey: string;
    privateKeyBase64: string;
};
/**
 * De claims van een JWT als de handtekening klopt, anders null.
 * @param {string} jwt
 * @param {string} publicKey PEM
 * @returns {Record<string, any> | null}
 */
export function controleerJwt(jwt: string, publicKey: string): Record<string, any> | null;
/**
 * @typedef {object} NepGebruiker
 * @property {string} email
 * @property {string} [id] DocuSign-gebruikers-ID (standaard een UUID)
 * @property {string} [profiel] permissionProfileName (standaard "DocuSign Sender")
 * @property {boolean} [toestemming] false = `consent_required` bij inloggen
 */
/**
 * @typedef {object} NepVerzoek
 * @property {string} methode
 * @property {string} pad
 * @property {string | undefined} auth
 * @property {string} body
 */
/**
 * Start een nep-DocuSign. Gebruik `nep.config` (of `nep.env`) in de app.
 * @param {object} [opties]
 * @param {string} [opties.accountId]
 * @param {string} [opties.integrationKey]
 * @param {string} [opties.koppelgebruikerId] de `DOCUSIGN_USER_ID`
 * @param {NepGebruiker[]} [opties.gebruikers] de mensen die op naam versturen
 * @param {ReturnType<typeof maakTestSleutel>} [opties.sleutel]
 * @param {string} [opties.hmacKey]
 */
export function startNepDocusign(opties?: {
    accountId?: string | undefined;
    integrationKey?: string | undefined;
    koppelgebruikerId?: string | undefined;
    gebruikers?: NepGebruiker[] | undefined;
    sleutel?: {
        privateKey: string;
        publicKey: string;
        privateKeyBase64: string;
    } | undefined;
    hmacKey?: string | undefined;
}): Promise<{
    url: string;
    sleutel: {
        privateKey: string;
        publicKey: string;
        privateKeyBase64: string;
    };
    hmacKey: string;
    /** Voor `maakDocusign(nep.config)`. */
    config: {
        oauthBaseUrl: string;
        accountId: string;
        integrationKey: string;
        userId: string;
        privateKey: string;
        webhookHmacKey: string;
    };
    /** Voor een app die `docusignConfig(process.env)` leest. */
    env: {
        DOCUSIGN_OAUTH_BASE_URL: string;
        DOCUSIGN_ACCOUNT_ID: string;
        DOCUSIGN_INTEGRATION_KEY: string;
        DOCUSIGN_USER_ID: string;
        DOCUSIGN_PRIVATE_KEY_BASE64: string;
        DOCUSIGN_WEBHOOK_HMAC_KEY: string;
    };
    verzoeken: NepVerzoek[];
    envelopen: {
        id: string;
        auth: string | undefined;
        body: any;
        status: string;
        voidedReason?: string;
    }[];
    voegGebruikerToe: (g: NepGebruiker) => void;
    /** @param {string} email @param {string} profiel */
    zetProfiel: (email: string, profiel: string) => void;
    /** @param {string} email */
    profielVan: (email: string) => string | undefined;
    /** @param {string} email @param {boolean} aan */
    zetToestemming: (email: string, aan: boolean) => void;
    /** De envelop-POST's weigeren met deze fout (null = weer normaal). */
    zetEnvelopFout: (fout: {
        status: number;
        errorCode: string;
    } | null) => void;
    zetProfielFout: (fout: {
        status: number;
        errorCode: string;
    } | null) => void;
    zetProfielLijst: (lijst: Array<{
        permissionProfileId: string;
        permissionProfileName: string;
    }>) => void;
    zetDocumentFout: (aan: boolean) => void;
    /** Het token waarmee een envelop is gemaakt hoort bij deze gebruiker. */
    tokenVan: (email: string) => string | undefined;
    koppelToken: string;
    /** Een Connect-levering voor de webhook van de app, met geldige handtekening. */
    levering: (invoer: Omit<Parameters<typeof connectLevering>[0], "hmacKey">) => {
        body: string;
        headers: Record<string, string>;
    };
    stop: () => Promise<any>;
}>;
/**
 * Een Connect-levering (JSON SIM) zoals DocuSign hem stuurt, met de
 * `X-DocuSign-Signature-N`-kop(pen). `extraSleutels` zet er koppen vóór met andere
 * sleutels, om te toetsen dat de app alle koppen controleert.
 * @param {object} invoer
 * @param {string} invoer.envelopeId
 * @param {string} invoer.event bv. 'envelope-completed'
 * @param {string} invoer.hmacKey
 * @param {Record<string, unknown>} [invoer.envelopeSummary]
 * @param {string} [invoer.generatedDateTime]
 * @param {string[]} [invoer.extraSleutels]
 * @returns {{ body: string, headers: Record<string, string> }}
 */
export function connectLevering({ envelopeId, event, hmacKey, envelopeSummary, generatedDateTime, extraSleutels }: {
    envelopeId: string;
    event: string;
    hmacKey: string;
    envelopeSummary?: Record<string, unknown> | undefined;
    generatedDateTime?: string | undefined;
    extraSleutels?: string[] | undefined;
}): {
    body: string;
    headers: Record<string, string>;
};
export type NepGebruiker = {
    email: string;
    /**
     * DocuSign-gebruikers-ID (standaard een UUID)
     */
    id?: string | undefined;
    /**
     * permissionProfileName (standaard "DocuSign Sender")
     */
    profiel?: string | undefined;
    /**
     * false = `consent_required` bij inloggen
     */
    toestemming?: boolean | undefined;
};
export type NepVerzoek = {
    methode: string;
    pad: string;
    auth: string | undefined;
    body: string;
};
