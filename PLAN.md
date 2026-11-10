# Plan: Motrac-DS-connector als DocuSign-bouwsteen

Stand: 2026-11-10. Bronnen: `mit-contractenbeheer` (`backend/src/adapters/docusign/`,
`api/routes/docusignWebhook.ts`, errata § AH, ADR-0055) en `mit-rental`
(`backend/lib/docusign/`, `docs/DOCUSIGN.md`). Rental noemt dit pakket zelf al als
volgende stap ("Later: één gedeeld pakket `motrac-docusign`").

## 1. Doel

Een Motrac-app krijgt DocuSign (e-signing) door:

1. deze repo als **afhankelijkheid** op te nemen (geen kopie van de code), en
2. zijn eigen Claude Code de integratie te laten doen aan de hand van de instructies
   in deze repo. Die instructies laten Claude ook **stoppen bij de stappen die een
   mens moet zetten**: variabelen aanvragen bij Mark Kuijpers, Connect inrichten,
   verzenders klaarzetten en testen.

## 2. Wat de twee apps nu doen

Beide apps hebben dezelfde transportlaag; Rental is een JavaScript-kopie van
Contractenbeheer met een paar verbeteringen. Dezelfde DocuSign-app (integratiesleutel)
en hetzelfde account; elke app heeft een eigen Connect-configuratie.

| Onderdeel | Contractenbeheer (TS, Hono) | Rental (JS, Express) | In de bouwsteen |
|---|---|---|---|
| JWT Grant (RS256, Web Crypto), `/oauth/userinfo` → basisdomein | ja | ja | ja |
| Tokencache (hergebruik tot 60 s voor verlopen) | nee | ja | ja |
| Timeout per aanroep | alleen health (5 s) | 30 s | ja, instelbaar |
| `pemUitBase64` (base64 of PEM met `\n`) | nee | ja | ja |
| `ontbrekendeEnv()` / `isIngesteld()` | nee | ja | ja |
| Envelop **op naam van de ingelogde gebruiker** (koppelgebruiker zoekt op e-mail) | ja | ja | ja (kern) |
| Redenen `GEEN_EMAIL`, `GEEN_ACCOUNT`, `GEEN_TOESTEMMING` | ja | ja | ja |
| `GEEN_VERZENDRECHT` (profiel Viewer, `USER_LACKS_PERMISSIONS`) | nee | ja | ja |
| Meerdere documenten, elk met eigen anker | ja | nee (één) | ja |
| Documentsoorten | docx, html | html | docx, html, pdf |
| Tabs: signHere, dateSigned, fullName, text, met offset-clamp | ja | ja | ja |
| Ccs | 1 + optioneel 1 | optioneel 1 | lijst |
| Status `created` (concept) of `sent` | alleen `sent` | beide | beide |
| Envelop ophalen, getekend PDF ophalen (`documents/combined`) | nee | ja | ja |
| Webhook-HMAC | alleen `X-DocuSign-Signature-1` | alle `-N`-koppen | alle `-N` |
| Connect JSON SIM normaliseren | ja (zonder `sent`) | ja | ja, neutrale eventnamen |
| Idempotentie: `docusign_webhook_event` (claim, bij fout intrekken) | ja | ja | SQL + helper |
| Health: inlog + "kan ik op mijn naam versturen" | ja | ja | ja |
| Verzendrecht geven (Viewer → Sender, koppelgebruiker als DS Admin) | nee | ja | ja, losse module |
| Niet-live-slot (omleiden naar testontvanger) | ja (`KLANTMAIL_LIVE`) | nee (demo-modus) | ja, optioneel |
| Nep-DocuSign voor tests | nee | ja (in de test) | ja, export `testing` |
| Wat er met een status gebeurt (records, audit, bijlage) | app | app | **blijft in de app** |

Afwijkingen die de bouwsteen meteen rechttrekt: Contractenbeheer toetst maar één
signature-kop (gaat mis zodra er een tweede HMAC-sleutel op het account komt), heeft
geen tokencache en geen timeout op de envelop-aanroep. De meldingen noemen nu "CB'er"
of "verhuurmedewerker"; de bouwsteen geeft neutrale meldingen plus een `reden`-code,
zodat de app zijn eigen tekst kan tonen.

Wat **niet** in de bouwsteen komt: het document maken (transport-only, ADR-0047 van
Contractenbeheer), de ankers in het document (alleen de afspraak hoe je ze kiest), de
records/statussen van de app, audit-events, rechten en de UI-schermen.

## 3. De kernvraag: verwijzen of inbouwen?

**Verwijzen kan, en is de aanbeveling.** De app-repo bevat dan alleen één regel in
`package.json` en een pin in de lockfile; de code staat alleen hier. Eén voorwaarde:
de code moet bij de **build** in het deploy-artefact terechtkomen, want de servers op
de vloot kunnen niet bij een private GitHub-repo. "Verwijzen in de repo, inbakken bij
de build" dus.

### Aanbevolen: npm-git-afhankelijkheid op een versietag

```json
"dependencies": {
  "@motrac/docusign": "git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#v1.0.0"
}
```

- **Versie per app.** Elke app kiest zelf wanneer hij naar `v1.1.0` gaat; de
  lockfile legt de commit-SHA vast. Bij een handtekeningstraject wil je niet dat een
  push op `main` hier bij de volgende deploy van elke app meegaat.
- **Geen buildstap in het pakket.** Het pakket is gewone ESM-JavaScript met JSDoc en
  meegeleverde `.d.ts`-bestanden, zonder runtime-afhankelijkheden (alleen `fetch`,
  `crypto.subtle`, `node:crypto`). npm hoeft bij installeren niets te bouwen, en
  zowel een TypeScript-app (Contractenbeheer) als een JS-app (Rental) kan het direct
  importeren.
- **Lockfile.** npm schrijft een GitHub-afhankelijkheid weg als
  `git+ssh://git@github.com/…#<sha>`, ook bij een `git+https`-URL. Getest: `npm ci`
  haalt hem toch via https op, ook zonder SSH op de machine. Alleen https-toegang
  is nodig (de `insteadOf`-regel hieronder).
- **CI.** Het bestaande secret `FLEET_REPO_READ_TOKEN` krijgt ook leesrecht op deze
  repo (Mark), en vóór `npm ci` komt één stap:
  ```bash
  git config --global url."https://x-access-token:${FLEET_REPO_READ_TOKEN}@github.com/".insteadOf "https://github.com/"
  ```
- **Lokaal.** Werkt met de gewone git-inlog van de ontwikkelaar (Git Credential
  Manager op Windows).

### Hoe de code in het deploy-artefact komt

| Soort backend | Wat er gebeurt |
|---|---|
| Gebundeld met esbuild (Contractenbeheer: `deploy-dist/server.js`) | esbuild neemt het pakket vanzelf mee. Niets extra's. |
| Ongebundeld, server draait zelf `npm install` (Rental: `dist/` + uitgeklede `package.json`) | Het pakket levert een `bin`: `motrac-docusign-vendor dist`. Dat kopieert het pakket naar `dist/vendor/motrac-docusign/` en zet in `dist/package.json` `"@motrac/docusign": "file:./vendor/motrac-docusign"`. De `npm install` op de server vindt het dan lokaal, zonder GitHub. (`dashboard-deploy.mjs` slaat mappen met de naam `node_modules` over, daarom `vendor/`.) |

### Alternatieven die we niet kiezen

- **Sibling-checkout met `file:../Motrac-DS-connector`** (zoals `@motrac/template-ui`).
  Bekend patroon in de vloot, maar gepind op `main`: geen versies, en elke wijziging
  hier gaat bij de volgende deploy van elke app mee. Voor een UI-pakket acceptabel,
  voor ondertekenen niet.
- **GitHub Packages (npm-registry).** Echte semver-ranges, maar elke app en elke
  ontwikkelaar heeft een `.npmrc` met token nodig. Kan later, als er meer pakketten
  komen; de importnaam `@motrac/docusign` blijft dan gelijk.
- **Code kopiëren (vendoren).** Wat er nu gebeurt: twee kopieën die "met de hand
  gelijk gehouden" worden. Dat willen we juist kwijt.

## 4. Opbouw van de repo

```
Motrac-DS-connector/
  package.json            name @motrac/docusign, type module, exports-map, bin, files
  src/                    ESM-JS met JSDoc, zonder dependencies
    index.js              maakDocusign(config) → { verstuurEnvelop, haalEnvelopOp,
                          haalGetekendDocumentOp, health, verzenderHealth }
    config.js             docusignConfig(env), ontbrekendeEnv(env), isIngesteld(env), pemUitBase64
    auth.js               JWT Grant, tokencache, basisdomein uit /oauth/userinfo
    verzender.js          op naam: opzoeken op e-mail, profielcheck, DocusignVerzenderFout
    envelop.js            envelop bouwen: documenten (docx/html/pdf), signers, ccs, tabs
    tabs.js               bouwAnkerTab, clampOffset, A4_STAAND/A4_LIGGEND
    fouten.js             DocusignFout, DocusignAuthFout, DocusignNietIngesteld, leesFoutcode
    webhook.js            verifieerHandtekeningen(body, headers, key), normaliseerConnect(body)
                          → { envelopeId, event: sent|delivered|completed|declined|voided,
                          eventId, tijdstip } | 'GENEGEERD' | null
    idempotentie.js       claimEvent(query, envelopeId, eventId), trekClaimIn(...)
    testslot.js           metTestSlot(adapter, { live, testOntvangers })  (uit Contractenbeheer)
    profielen.js          verzendrecht geven (Viewer → Sender)            (uit Rental)
    testing/nepDocusign.js  nep-DocuSign op localhost: echte JWT-check, per gebruiker
                          token/toestemming/profiel, envelop- en Connect-simulatie
  types/                  .d.ts (gegenereerd met tsc --emitDeclarationOnly, meegecommit)
  sql/
    001_docusign_webhook_event.sql   idempotent (IF NOT EXISTS), de app neemt hem op
  bin/
    vendor.mjs            motrac-docusign-vendor (zie § 3)
  voorbeelden/
    express/              webhook-route en envelop-route voor een Express-backend
    hono/                 idem voor Hono
    frontend/             ondertekenblok en beheerkaart als voorbeeld (React +
                          @motrac/template-ui); bewust geen pakketcode
  test/                   node --test, tegen testing/nepDocusign.js
  INTEGREREN.md           de instructie voor de Claude Code van de app (§ 5)
  MENSELIJKE-STAPPEN.md   wat een mens doet, met de mail aan Mark (§ 6)
  CLAUDE.md               voor wie aan deze repo zelf werkt (versies, compatibiliteit)
  CHANGELOG.md            per versie; breaking = major
  .claude-plugin/         optioneel: plugin-marketplace met de skill docusign-integreren
  .github/workflows/      tests op elke PR; release = tag vX.Y.Z
```

Afspraken voor de API:

- **Framework-agnostisch.** Geen Express of Hono in `src/`; de webhook-helper neemt
  de ruwe body en de headers en geeft `{ status, event }` terug. De twee
  voorbeelden laten zien hoe je dat in vijf regels aan een route hangt.
- **Database-agnostisch.** `claimEvent` krijgt een `query(sql, params)`-functie mee,
  zodat het met `pg`, `postgres` en Kysely werkt.
- **Neutrale namen.** De bouwsteen spreekt DocuSign-taal (`sent`, `completed`, …); de
  app vertaalt naar zijn eigen statussen (Contractenbeheer: `voided` → `VERLOPEN`,
  Rental: `voided` → `ingetrokken`).
- **Geen terugval op de koppelgebruiker** bij versturen. Kan het niet op naam, dan
  gaat er niets weg (`DocusignVerzenderFout` met `reden`). Ophalen mag wel terugvallen.
- **Geheimen nooit in meldingen**, alleen de namen van variabelen.
- **Dezelfde env-namen** als nu: `DOCUSIGN_OAUTH_BASE_URL`, `DOCUSIGN_ACCOUNT_ID`,
  `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_PRIVATE_KEY_BASE64`,
  `DOCUSIGN_WEBHOOK_HMAC_KEY`. (Contractenbeheer heeft daarnaast `DOCUSIGN_BASE_URL`,
  die al niet meer gebruikt wordt; de bouwsteen leest hem niet.)

## 5. Hoe de Claude Code van een app de bouwsteen gebruikt

De gebruiker zegt in zijn eigen repo iets als: *"Voeg DocuSign toe met
motrac-innovation-lab/Motrac-DS-connector."* Claude leest dan `INTEGREREN.md` uit
deze repo (of, met de plugin geïnstalleerd, de skill `docusign-integreren`). Dat
bestand is geschreven als werkinstructie voor Claude:

1. **Verkennen.** Welk framework (Express/Hono), gebundeld of niet, welke database-
   laag, hoe migraties lopen, waar de gebruiker zijn e-mail vandaan komt (login), welk
   record ondertekend wordt, hoe het document gemaakt wordt.
2. **Vragen wat alleen de gebruiker weet**, in één keer: welk document, wie tekent,
   wie verstuurt (de ingelogde gebruiker of een veld op het record), cc, meteen
   versturen of eerst concept, wat er bij getekend moet gebeuren.
3. **Bouwen.** Afhankelijkheid op de laatste tag, CI-stap (insteadOf), zo nodig de
   vendor-stap in de build, migratie uit `sql/`, envelop-route, webhook-route vóór de
   gebruikersauth met de ruwe body, health-route, de statusvertaling naar het eigen
   domein, ankers in het document, UI naar het voorbeeld, tests tegen
   `@motrac/docusign/testing`. Volgens de `CLAUDE.md` van de app (taal, i18n, audit,
   bevestigingsstap bij versturen).
4. **Stoppen bij menselijke stappen.** `INTEGREREN.md` markeert ze met
   `🧑 MENSELIJKE STAP` en de regel: *voer dit niet zelf uit, leg het de gebruiker uit,
   schrijf de tekst die hij kan versturen, en ga pas verder als hij bevestigt.* Claude
   vraagt nooit om geheimen in de chat te plakken en zet ze nooit in de repo.
5. **Testen met de gebruiker**, volgens het draaiboek in § 6.
6. **Afronden.** Documentatie in de app (`docs/DOCUSIGN.md` naar het model van Rental),
   de gebruikte versie van de bouwsteen erin, en een PR.

## 6. De menselijke stappen (inhoud van `MENSELIJKE-STAPPEN.md`)

Claude zet voor elke stap de tekst klaar; de gebruiker voert uit.

| # | Wat | Wie | Wat Claude klaarzet |
|---|---|---|---|
| 1 | Leesrecht van `FLEET_REPO_READ_TOKEN` uitbreiden met deze repo (anders faalt `npm ci` in CI) | Mark | Mail aan Mark |
| 2 | **Variabelen aanvragen** bij Mark Kuijpers (mark.kuijpers@motrac.nl): de zes `DOCUSIGN_*`, eerst voor demo (`account-d`) | gebruiker → Mark | Mail met appnaam, backend-URL, webhook-URL, omgeving (demo/productie) en de lijst verzenders. Mark stuurt de waarden als **onetimesecret-link**; de gebruiker zet ze direct in het Environment-paneel van de backend op `control.motrac.app`. Nooit per mail, chat of repo |
| 3 | Variabelen zetten in het Environment-paneel van de backend | gebruiker of Mark | Lijst met namen; de sleutel als base64 op één regel (`openssl pkcs8 -topk8 -nocrypt -in sleutel.pem \| base64 -w0`) |
| 4 | **Connect-configuratie** per app: Custom, URL `https://<backend>/<pad>/webhook`, JSON SIM, events Sent/Delivered/Completed/Declined/Voided, HMAC aan (sleutel is per account, dus dezelfde als de andere apps), Require Acknowledgment aan | DocuSign-beheerder (Mark) | Precies deze lijst, ingevuld met de URL |
| 5 | **Verzenders klaarzetten**: elke verzender logt eenmalig in op DocuSign via SSO met het @motrac.nl-account, en krijgt profiel *Sender* (nieuwe SSO-gebruikers zijn *Viewer*; Sender-seats tellen voor de licentie) | verzender + DocuSign-beheerder | Instructie per verzender; de health-route toont per persoon de stand |
| 6 | **Testen op demo** (zie hieronder) | gebruiker | Draaiboek met afvinklijst |
| 7 | **Naar productie**: zelfde integratiesleutel (is die al door de Go-Live-review van DocuSign, dan hoeft dat niet opnieuw), wel productie-account-ID, `account.docusign.com`, een eigen Connect-configuratie in productie en het niet-live-slot uit | Mark + gebruiker | Mail aan Mark en de lijst met te wijzigen variabelen |

Toestemming voor de app (*signature impersonation*, DocuSign Admin → Verbonden apps)
staat al op organisatieniveau voor deze integratiesleutel; een nieuwe app hoeft daar
niets voor te doen, zolang hij dezelfde sleutel gebruikt.

**Testdraaiboek (demo):**

1. Health: inlog OK, en "kan ik op mijn naam versturen" OK voor de gebruiker zelf.
2. Envelop naar het eigen adres (of met het testslot naar een testontvanger): komt
   aan als "*Naam* via DocuSign", velden staan op de goede plek, document leesbaar.
3. Tekenen → webhook komt binnen (Connect-logboek: 200/204), status in de app
   `completed`, getekend PDF opgehaald.
4. Weigeren → `declined`. Intrekken in DocuSign → `voided`.
5. Dezelfde levering opnieuw sturen vanuit het Connect-logboek → geen tweede effect.
6. Een verzender zonder DocuSign-account en een Viewer → de juiste melding, niets
   verstuurd.

Dit draaiboek dekt ook het punt dat beide apps nog open hebben: de vertaling van JSON
SIM is nog nooit tegen een echte Connect-levering bewezen. De eerste app die het
doorloopt, legt een echte (geanonimiseerde) body vast als testfixture in deze repo.

## 7. Fasering

| Fase | Wat | Klaar als |
|---|---|---|
| 0 | Dit plan akkoord; naam `@motrac/docusign`; repo-toegang regelen (stap 1 hierboven) | Mark akkoord |
| 1 | **Kern v1.0.0**: `src/` samengevoegd uit beide apps (beste van beide, tabel § 2), `.d.ts`, nep-DocuSign, tests, `sql/`, vendor-bin, CI, tag | Tests groen; de DocuSign-tests uit beide apps zijn overgezet naar de nep-DocuSign van het pakket |
| 2 | **Instructies**: `INTEGREREN.md`, `MENSELIJKE-STAPPEN.md` met de mailteksten, de voorbeelden Express/Hono/frontend; optioneel de plugin met skill | Een proefintegratie in een lege app uit de vloot-template doorloopt alle stappen |
| 3 | **Eerste nieuwe app** integreert via de bouwsteen; testdraaiboek op demo; echte Connect-body als fixture | Getekende test-envelop, webhook verwerkt |
| 4 | **Rental overzetten** (`backend/lib/docusign/` → pakket + vendor-stap; `records.js` en `routes.js` blijven) | Rental-tests groen, demo-test herhaald |
| 5 | **Contractenbeheer overzetten** (adapter achter de bestaande `DocuSignPort`, webhook-route gebruikt `webhook.js`); in een eigen PR, met expliciete vermelding dat het de verzendroute raakt | CB-tests groen, demo-test herhaald |

Fase 4 en 5 zijn niet nodig voor nieuwe apps, maar zonder die stap blijven er drie
kopieën. Rental eerst: die staat het dichtst bij de bouwsteen.

## 8. Besluiten (Mark, 2026-11-10)

1. **Git-afhankelijkheid op een versietag** (§ 3), niet het sibling-patroon van
   template-ui.
2. **`FLEET_REPO_READ_TOKEN`** krijgt leesrecht op deze repo; geen apart token.
3. **Variabelen** gaan van Mark naar de bouwer via een **onetimesecret-link**; de
   bouwer zet ze zelf in het Environment-paneel. Claude ziet ze nooit.
4. **Eén Connect-configuratie per app**, voor nu.
5. **Claude Code-plugin** naast `INTEGREREN.md`: marketplace `motrac-bouwstenen`,
   plugin `motrac-docusign`, skill `docusign-integreren`.
6. Repo-naam `Motrac-DS-connector`, pakketnaam `@motrac/docusign` (niet expliciet
   besproken; zo gebouwd).

## 9. Stand

- **Fase 1 (kern) en fase 2 (instructies, voorbeelden, plugin): gebouwd** op branch
  `claude/ecstatic-archimedes-3qj9uv`, nog niet getagd. 48 tests groen, types
  gegenereerd, het Express- en het Hono-voorbeeld draaien tegen de nep-DocuSign,
  `claude plugin validate` slaagt.
- **Na de merge naar `main`**: tag `v1.0.0` zetten (zonder tag werkt de
  installatieregel in de instructies niet).
- **Nog niet tegen echte DocuSign getest**: dat gebeurt in fase 3, met de eerste app
  op demo (`MENSELIJKE-STAPPEN.md` § 6).
