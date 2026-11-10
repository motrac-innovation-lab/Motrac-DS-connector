# Changelog

Semver. Een app neemt een versie op met
`git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#vX.Y.Z`.

## 1.0.0 (nog niet getagd)

Eerste versie, samengevoegd uit mit-contractenbeheer en mit-rental.

- `maakDocusign()`: envelop op naam van de verzender (`verstuurEnvelop`),
  `haalEnvelopOp`, `haalGetekendDocumentOp`, `trekEnvelopIn`,
  `controleerKoppeling`, `controleerVerzender`, `geefVerzendrecht`.
- Meerdere documenten (html, docx, pdf) per envelop, elk met eigen ankers;
  ondertekenaars met volgorde; cc's zonder dubbelen; concept of meteen versturen.
- Invoer vooraf getoetst (`DocusignInvoerFout`), onder andere: anker ontbreekt in
  het HTML-document, of hetzelfde anker op twee documenten.
- Redenen bij versturen op naam: `GEEN_EMAIL`, `GEEN_ACCOUNT`, `GEEN_VERZENDRECHT`
  (Viewer, `USER_LACKS_PERMISSIONS`), `GEEN_TOESTEMMING`.
- Tokencache en timeouts (30 s, health 5 s).
- Webhook: HMAC over alle `X-DocuSign-Signature-N`-koppen (Contractenbeheer keek
  alleen naar -1), Connect JSON SIM naar neutrale events, alleen ISO-tijdstippen,
  idempotente claim die bij een fout weer vrijkomt.
- `metTestSlot` (niet live: omleiden of weigeren), `httpFout`.
- `@motrac/docusign/testing`: nep-DocuSign, Connect-levering, testsleutel.
- `motrac-docusign-vendor` voor backends die op de server `npm install` draaien.
- Claude Code-plugin `motrac-docusign` met de skill `docusign-integreren`.
