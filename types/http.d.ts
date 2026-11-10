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
export function httpFout(fout: unknown): HttpFout | null;
export type HttpFout = {
    status: 400 | 409 | 502;
    code: "DOCUSIGN_INVOER" | "DOCUSIGN_UIT" | "DOCUSIGN_VERZENDER" | "DOCUSIGN_BEHEER" | "DOCUSIGN_GEBLOKKEERD" | "DOCUSIGN_FOUT";
    /**
     * voor de gebruiker
     */
    boodschap: string;
    /**
     * extra velden voor de frontend (reden, email, profiel, veld)
     */
    details: Record<string, string>;
    /**
     * zet de oorspronkelijke fout in het serverlog
     */
    log: boolean;
};
