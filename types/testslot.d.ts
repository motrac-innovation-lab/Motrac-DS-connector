/**
 * @template {{ verstuurEnvelop: (invoer: any) => Promise<any> }} T
 * @param {T} docusign uit `maakDocusign()`
 * @param {{ live: boolean, testOntvangers: string[] }} slot
 * @returns {T}
 */
export function metTestSlot<T extends {
    verstuurEnvelop: (invoer: any) => Promise<any>;
}>(docusign: T, { live, testOntvangers }: {
    live: boolean;
    testOntvangers: string[];
}): T;
export function testOntvangersUit(waarde: string | undefined): string[];
