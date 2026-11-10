# CLAUDE.md — Motrac-DS-connector (`@motrac/docusign`)

Voor wie aan **deze repo** werkt. Integreer je DocuSign in een app, lees dan
[`INTEGREREN.md`](INTEGREREN.md).

## Wat dit is

Een bouwsteen die Motrac-apps als git-afhankelijkheid op een versietag opnemen. Hij
is samengevoegd uit de DocuSign-koppelingen van **mit-contractenbeheer**
(`backend/src/adapters/docusign/`, TypeScript) en **mit-rental**
(`backend/lib/docusign/`, JavaScript). Het plan en de afwegingen staan in
[`PLAN.md`](PLAN.md).

## Vaste afspraken

- **Gewone ESM-JavaScript met JSDoc, zonder runtime-afhankelijkheden.** Alleen
  `fetch`, `crypto.subtle` en `node:*`. Geen buildstap bij installeren: npm bouwt
  een git-afhankelijkheid alleen als er een `prepare`-script is, en dat is er
  bewust niet. Node ≥ 20.
- **`types/` is gegenereerd en wordt meegecommit** (`npm run types`). CI faalt als
  de types niet bij de bron passen (`npm run check:types`).
- **Framework- en database-agnostisch** in `src/`. Express en Hono staan alleen in
  `voorbeelden/`.
- **Transport-only.** De bouwsteen maakt geen document en kent geen records,
  statussen of audit van een app. Neutrale DocuSign-taal naar buiten (`sent`,
  `completed`, …); de app vertaalt.
- **Op naam, zonder terugval.** Versturen en intrekken gaan altijd met het token van
  de verzender. Alleen lezen mag terugvallen op de koppelgebruiker.
- **Geen geheimen in meldingen**, alleen namen van variabelen. DocuSign-details
  (body, OAuth-fout) zijn voor het serverlog (`httpFout(...).log`).
- **Nederlands** in commentaar, meldingen en namen, zoals in de apps.
- **De env-namen veranderen niet** zonder major-versie: ze staan in de
  Environment-panelen van elke app.

## Versies

- Semver. Een tag `vX.Y.Z` op `main` is een release; zet hem in `CHANGELOG.md` en in
  `package.json` (`version`) én in `plugin/.claude-plugin/plugin.json`.
- **Breaking** (major): een export weg of anders, een ander gedrag bij versturen,
  andere env-namen, een andere tabelvorm. Een app kiest zelf wanneer hij overstapt.
- Een nieuwe export, een extra controle die alleen ongeldige invoer weigert, of een
  betere melding is minor/patch.
- Verplaats nooit een bestaande tag.
- Werk bij een nieuwe minor of major de tag bij in `INTEGREREN.md`, `README.md`
  en de skill.

## Testen

```bash
npm test               # node --test, ook tegen de nep-DocuSign (src/testing)
npm run check:types    # types/ gelijk aan de bron
claude plugin validate . && claude plugin validate ./plugin   # als Claude Code er is
```

Een wijziging aan het gedrag krijgt een test in `test/`. Een les uit een app (zoals
`INVALID_USER_OFFSET` of de dubbele webhook) krijgt een commentaar met de herkomst.

## Wat er nog open staat

- De vertaling van Connect JSON SIM is getest tegen de documentatie, nog niet tegen
  een echte levering. De eerste app die er een ontvangt, levert een
  geanonimiseerde body voor `test/fixtures/`.
- mit-rental en mit-contractenbeheer gebruiken nog hun eigen kopie (PLAN.md, fase 4
  en 5).

## Git

Werk via een branch en een pull request naar `main`. `tests.yml` moet groen zijn.
