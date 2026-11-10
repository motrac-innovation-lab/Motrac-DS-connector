# DocuSign integreren met `@motrac/docusign`

**Voor Claude Code.** Dit is je werkinstructie als een gebruiker vraagt om DocuSign
(e-signing) aan zijn Motrac-app toe te voegen. Volg de stappen in volgorde. Lees
eerst de `CLAUDE.md` van de app: die gaat vóór deze instructie waar het de app zelf
betreft (taal, i18n, audit, bevestigingsstappen, branches en PR's).

## Spelregels

1. **De code staat in de bouwsteen, niet in de app.** Kopieer niets uit
   `src/` van dit pakket naar de app. De app neemt `@motrac/docusign` op als
   afhankelijkheid en schrijft alleen zijn eigen glue: routes, records, document,
   statusvertaling, UI.
2. **Menselijke stappen doe je niet zelf.** Bij elke `🧑 MENSELIJKE STAP` hieronder:
   stop, leg uit wat er moet gebeuren en waarom, geef de tekst die de gebruiker kan
   versturen (uit `MENSELIJKE-STAPPEN.md`), en ga pas verder als de gebruiker
   bevestigt. Je kunt intussen wel verder bouwen aan wat er niet van afhangt.
3. **Geheimen komen nooit langs jou.** Vraag nooit om de waarde van een
   `DOCUSIGN_*`-variabele, laat hem niet in de chat plakken, en zet hem nooit in de
   repo, een `.env.example`, een test of een commit. Mark geeft ze uit via een
   onetimesecret-link; de gebruiker zet ze zelf in het Environment-paneel. Plakt
   iemand toch een geheim in de chat: zeg dat dat geheim nu als gelekt geldt en
   dat Mark hem moet vervangen.
4. **Versturen is onomkeerbaar.** DocuSign mailt de ondertekenaar zelf. Elke
   verzendknop krijgt een bevestigingsstap en een audit-regel, ook als de
   `CLAUDE.md` van de app dat niet apart noemt.
5. **Geen terugval op de koppelgebruiker.** De envelop gaat op naam van de mens
   die verstuurt. Kan dat niet, dan gaat er niets weg en krijgt de gebruiker de
   melding (`DocusignVerzenderFout`). Bouw geen omweg.

## Stap 1: verkennen (zelf)

Zoek uit en vat kort samen voor de gebruiker:

- **Backend**: Express of Hono (of iets anders), TypeScript of JavaScript.
- **Bundelen**: maakt de build één bundel (esbuild, zoals mit-contractenbeheer:
  `deploy-dist/server.js`), of gaat er een map naar de server waar de server zelf
  `npm install` draait (zoals mit-rental: `backend/dist/` + uitgeklede
  `package.json`)? Dat bepaalt stap 3.
- **Database**: welke client (pg, postgres.js, Kysely, een shim) en hoe migraties
  lopen (losse `.sql` bij opstarten?).
- **Login**: waar de backend het e-mailadres van de ingelogde gebruiker vandaan
  haalt. Dat adres is de sleutel naar de DocuSign-gebruiker.
- **CI**: `.github/workflows/tests.yml` en `deploy.yml`; staat er al een
  sibling-checkout met `FLEET_REPO_READ_TOKEN`?
- **Bestaande DocuSign-code**: staat er al iets (een kopie uit Contractenbeheer of
  Rental)? Dan is dit een overstap: houd het gedrag gelijk en vervang de kopie.

## Stap 2: vragen wat alleen de gebruiker weet (één keer, gebundeld)

Stel deze vragen in één bericht, met je voorstel erbij:

1. **Wat** wordt er ondertekend (welk record, welk document) en hoe maakt de app
   dat document nu (HTML, DOCX, PDF)?
2. **Wie tekent**: één ondertekenaar of meer, en waar komen naam en e-mail vandaan?
3. **Wie verstuurt**: de ingelogde gebruiker (standaard) of een persoon op het
   record (zoals de verhuurmedewerker bij Rental)?
4. **Cc**: wie krijgt een kopie (bv. een teammailbox)?
5. **Meteen versturen of eerst als concept** in DocuSign?
6. **Wat gebeurt er bij getekend, geweigerd, ingetrokken**: welke status op het
   record, moet het getekende PDF bewaard worden, volgt er een vervolgstap?
7. **Testslot**: heeft de app al een "niet live"-schakelaar voor klantmail? Dan
   gaat DocuSign mee achter dat slot (`metTestSlot`).

## Stap 3: de afhankelijkheid (zelf, plus 🧑)

Gebruik de nieuwste tag uit `CHANGELOG.md` (nu `v1.0.0`).

**Altijd `git+https`, nooit `github:`** (anders zet npm een SSH-URL in de lockfile):

```bash
npm install "git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#v1.0.0"
```

In een npm-workspaces-monorepo: in de map van de backend (`-w backend`). Controleer
daarna dat `package-lock.json` een `git+https://…#<sha>` bevat.

**CI.** Zet vóór elke `npm ci` die deze afhankelijkheid nodig heeft (tests én
deploy, ook in een `workflow_call`):

```yaml
      - name: Toegang tot de Motrac-bouwstenen
        run: git config --global url."https://x-access-token:${{ secrets.FLEET_REPO_READ_TOKEN }}@github.com/motrac-innovation-lab/".insteadOf "https://github.com/motrac-innovation-lab/"
```

Een aangeroepen workflow (`uses: ./.github/workflows/tests.yml`) krijgt secrets
alleen met `secrets: inherit`.

> 🧑 **MENSELIJKE STAP 1: leesrecht in CI.** `FLEET_REPO_READ_TOKEN` moet leesrecht
> hebben op `motrac-innovation-lab/Motrac-DS-connector`, en het secret moet in deze
> app-repo bestaan. Vraag de gebruiker het te controleren (repo → Settings →
> Secrets and variables → Actions). Ontbreekt het, dan regelt Mark het; zie de
> mailtekst in `MENSELIJKE-STAPPEN.md`. Zonder dit is elke CI-job rood op `npm ci`.

**Deploy.** Afhankelijk van stap 1:

- *Gebundeld met esbuild*: niets extra's; de bundel bevat de code. Controleer wel
  dat `@motrac/docusign` niet als `external` is gemarkeerd.
- *Map + `npm install` op de server*: draai na de eigen build
  `npx motrac-docusign-vendor dist` (of het pad van die map). Dat zet het pakket in
  `dist/vendor/motrac-docusign/` en de afhankelijkheid op `file:`, zodat de server
  GitHub niet nodig heeft. Zet het in het `build`-script, zodat lokaal en in CI
  hetzelfde gebeurt.

## Stap 4: bouwen (zelf)

Gebruik `voorbeelden/express/docusign.js` of `voorbeelden/hono/docusign.ts` als
vorm; ze zijn tegen de nep-DocuSign getest. Wat er moet komen:

1. **Migratie**: de tabel uit `sql/docusign_webhook_event.sql` als nieuwe migratie
   met het volgende nummer van de app (of `WEBHOOK_EVENT_SQL` als de app SQL uit
   code draait). Plus de velden op het record: `docusignEnvelopeId`, de
   ondertekenstatus, eventueel ondertekenaar en datums. Een index op de
   envelop-ID, want de webhook zoekt erop.
2. **Config**: `docusignConfig(process.env)`. Voeg de zes namen toe aan de
   env-validatie en de `.env.example` van de app, **zonder waarden** (alleen
   `DOCUSIGN_OAUTH_BASE_URL=https://account-d.docusign.com` mag als voorbeeld).
   Zonder sleutel moet de app gewoon opstarten; DocuSign staat dan uit
   (`isIngesteld()`), eventueel met een demo-modus zoals in mit-rental.
3. **Het document**: de app maakt het; de bouwsteen verstuurt het. Zet de
   **ankers** erin: onzichtbare tekst (bv. witte tekst, kleine letter) op de plek
   van handtekening, naam en datum, met een prefix van de app (`/cb-sig1/`,
   `/rt-handtekening/`). Bij meerdere documenten per envelop: **elk document een
   eigen anker** (de bouwsteen weigert anders). Hang niets ver naar rechts aan een
   anker dat al rechts op de pagina staat (`INVALID_USER_OFFSET`); zet de datum
   liever ónder de handtekening (y ≈ 38).
4. **Routes** (na de gebruikersauth): status (`controleerKoppeling` +
   `controleerVerzender(ingelogde e-mail)`), versturen (`verstuurEnvelop` met
   `verzenderEmail`), status ophalen (`haalEnvelopOp`), eventueel getekend
   document (`haalGetekendDocumentOp`) en intrekken (`trekEnvelopIn`, met reden en
   bevestiging). Beheer: per verzender de stand, en `geefVerzendrecht` alleen voor
   beheerders.
5. **Webhook** (vóór de gebruikersauth, eigen pad, ruwe body):
   `verwerkWebhook({ ruweBody, headers, hmacKey, claim: maakClaim(query), verwerk })`.
   `verwerk` vertaalt het neutrale event (`sent`, `delivered`, `completed`,
   `declined`, `voided`) naar de status van de app, schrijft het audit-event op
   naam van DocuSign, en geeft `'onbekende_envelop'` terug als de envelop niet van
   deze app is (Connect levert de envelopen van het hele account). Bij `completed`:
   het getekende PDF ophalen en bewaren mag mislukken zonder dat de status
   terugdraait.
6. **Fouten**: `httpFout(e)` geeft status, code, boodschap en details; log als
   `log: true`. Laat details van DocuSign nooit naar de browser gaan.
7. **Testslot**: heeft de app een niet-live-schakelaar, wikkel de adapter in
   `metTestSlot(ds, { live, testOntvangers })`.
8. **UI**: zie `voorbeelden/frontend/README.md` (ondertekenblok, beheerscherm,
   meldingen per `reden`, bevestigingsstap). Volg de i18n en de rondleiding van de
   app.
9. **Tests**: tegen de nep-DocuSign.
   ```js
   import { startNepDocusign } from '@motrac/docusign/testing'
   const nep = await startNepDocusign({ gebruikers: [{ email: 'jan@motrac.nl' }, { email: 'kees@motrac.nl', profiel: 'DocuSign Viewer' }] })
   // nep.env in de env van de app; nep.levering({ envelopeId, event: 'envelope-completed' }) voor de webhook
   ```
   Dek minstens: versturen op naam (token van de verzender, niet van de
   koppelgebruiker), elke `reden`, de webhook (geldig, dubbel, gelijktijdig, foute
   HMAC, onbekende envelop, mislukte verwerking) en dat zonder sleutel de app
   gewoon werkt.
10. **Documentatie** in de app: een `docs/DOCUSIGN.md` naar het model van
    mit-rental (variabelen, routes, foutcodes, webhook, Connect, testen), met de
    gebruikte versie van de bouwsteen.

Draai de eigen checks van de app (typecheck, tests, lint, build) en maak een branch
en PR zoals de `CLAUDE.md` van de app voorschrijft.

## Stap 5: de koppeling aanzetten (🧑)

> 🧑 **MENSELIJKE STAP 2: variabelen aanvragen bij Mark.** Geef de gebruiker de
> mailtekst uit `MENSELIJKE-STAPPEN.md` § 2, ingevuld met de appnaam, de
> backend-URL, de webhook-URL en de verzenders. Mark stuurt de waarden als
> **onetimesecret-link**. Begin met **demo** (`account-d`).

> 🧑 **MENSELIJKE STAP 3: variabelen zetten.** De gebruiker opent de link (die werkt
> één keer) en zet de waarden in het Environment-paneel van de backend op
> `control.motrac.app`, daarna een herstart. Jij controleert daarna alleen via de
> status-route dat `ontbreekt` leeg is en `koppeling.status` `ok`.

> 🧑 **MENSELIJKE STAP 4: Connect inrichten.** Mark (DocuSign-beheerder) maakt een
> Connect-configuratie voor deze app. Geef de ingevulde lijst uit § 4.

> 🧑 **MENSELIJKE STAP 5: verzenders klaarzetten.** Elke verzender logt eenmalig
> via SSO in op DocuSign en krijgt het profiel Sender. Laat de gebruiker de stand
> per verzender in het beheerscherm zien.

## Stap 6: testen (🧑, jij begeleidt)

> 🧑 **MENSELIJKE STAP 6: testdraaiboek op demo.** Loop `MENSELIJKE-STAPPEN.md` § 6
> met de gebruiker door, stap voor stap. Vraag na elke stap wat hij ziet. Gaat iets
> mis: kijk in het serverlog en het Connect-logboek (401 = HMAC-sleutel verschilt,
> 400 = formaat, neem de body mee).

Is de app de eerste die een echte Connect-levering ontvangt, vraag de gebruiker dan
om een **geanonimiseerde** body uit het Connect-logboek voor de fixtures van de
bouwsteen (issue in `motrac-innovation-lab/Motrac-DS-connector`).

## Stap 7: naar productie (🧑)

> 🧑 **MENSELIJKE STAP 7: productie.** Andere waarden van Mark (productie-account,
> `https://account.docusign.com`), een eigen Connect-configuratie in productie, en
> het testslot op live. Mailtekst in § 7. Daarna één echte envelop naar een
> collega als rooktest.

## Overstappen vanaf een kopie (Contractenbeheer, Rental)

- Vervang alleen de transportlaag (`auth`, `verzender`, `adapter`, `tabs`, `fout`,
  `health`, `webhookVerificatie`, `profielen`); de app-glue blijft.
- Houd de eigen statussen en de HTTP-foutcodes van de app gelijk; vertaal waar
  nodig vanuit `httpFout`.
- Tests van de app moeten zonder wijziging in betekenis groen blijven.
- Raakt de overstap de verzendroute van een bevroren of geaudit proces (zoals bij
  mit-contractenbeheer), benoem dat expliciet in de PR.

## Snel naslaan

| Wat | Waar |
|---|---|
| API | `types/index.d.ts` (met JSDoc) |
| Voorbeeld Express | `voorbeelden/express/docusign.js` |
| Voorbeeld Hono + port | `voorbeelden/hono/docusign.ts` |
| UI | `voorbeelden/frontend/README.md` |
| Migratie | `sql/docusign_webhook_event.sql` |
| Testhulp | `@motrac/docusign/testing` |
| Mailteksten en draaiboek | `MENSELIJKE-STAPPEN.md` |
