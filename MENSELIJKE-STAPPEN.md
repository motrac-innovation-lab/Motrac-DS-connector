# Menselijke stappen bij een DocuSign-koppeling

Wat een mens doet, en Claude niet. Claude Code vult de `<…>` in en geeft de tekst;
jij verstuurt of klikt. Contactpersoon voor DocuSign en de variabelen:
**Mark Kuijpers, mark.kuijpers@motrac.nl**.

**Geheimen.** Mark geeft de waarden uit via een **onetimesecret-link**. Zo'n link
werkt één keer: open hem pas als je het Environment-paneel klaar hebt staan, en
zet de waarden er direct in. Plak een geheim nooit in een chat (ook niet bij
Claude), een mail, een ticket of de repo. Is de link al geopend of verlopen, vraag
dan een nieuwe; is een geheim toch ergens anders terechtgekomen, meld het Mark,
dan vervangt hij het.

## Overzicht

| # | Wat | Wie | Wanneer |
|---|---|---|---|
| 1 | Leesrecht van CI op de bouwsteen | Mark | Vóór de eerste PR (anders is CI rood) |
| 2 | Variabelen aanvragen | jij → Mark | Zodra de code klaar is |
| 3 | Variabelen zetten | jij | Na de onetimesecret-link |
| 4 | Connect-configuratie (webhook) | Mark | Zodra de backend-URL vaststaat |
| 5 | Verzenders klaarzetten | elke verzender + beheerder | Vóór het testen |
| 6 | Testen op demo | jij, met Claude | Na 2–5 |
| 7 | Naar productie | Mark + jij | Na een geslaagde test |

## 1. Leesrecht van CI op de bouwsteen

Het secret `FLEET_REPO_READ_TOKEN` (fine-grained PAT, *Contents: read-only*) moet
`motrac-innovation-lab/Motrac-DS-connector` in zijn lijst hebben, en het secret moet
in de app-repo staan (Settings → Secrets and variables → Actions).

> **Aan:** mark.kuijpers@motrac.nl
> **Onderwerp:** Leesrecht CI op Motrac-DS-connector voor `<app-repo>`
>
> Hoi Mark,
>
> Ik koppel DocuSign in `<app-repo>` via de bouwsteen Motrac-DS-connector. Kun je
> controleren dat `FLEET_REPO_READ_TOKEN` leesrecht heeft op
> motrac-innovation-lab/Motrac-DS-connector, en dat het secret in `<app-repo>` staat?
> Anders faalt `npm ci` in CI.
>
> Dank!

## 2. Variabelen aanvragen

> **Aan:** mark.kuijpers@motrac.nl
> **Onderwerp:** DocuSign-variabelen (demo) voor `<appnaam>`
>
> Hoi Mark,
>
> Ik koppel DocuSign aan `<appnaam>` met de bouwsteen `@motrac/docusign`
> `<versie>`. Mag ik de variabelen voor de **demo-omgeving** via een
> onetimesecret-link?
>
> - App: `<appnaam>` (`<app-repo>`)
> - Backend: `<https://backend-url>`
> - Webhook-URL voor Connect: `<https://backend-url><webhook-pad>`
> - Wat er ondertekend wordt: `<bv. offertes, verlengcontracten>`
> - Verzenders (op hun naam gaat de envelop): `<namen + @motrac.nl-adressen>`
>
> Nodig: `DOCUSIGN_OAUTH_BASE_URL`, `DOCUSIGN_ACCOUNT_ID`,
> `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_PRIVATE_KEY_BASE64` en
> `DOCUSIGN_WEBHOOK_HMAC_KEY`.
>
> Dank!

Wat Mark erbij weet (niet voor jou om te regelen): de app gebruikt dezelfde
DocuSign-app (integratiesleutel) als Contractenbeheer en Rental, met
`signature impersonation` al op organisatieniveau toegestaan voor motrac.nl. De
HMAC-sleutel is per account, dus dezelfde als die van de andere apps. De
koppelgebruiker moet gebruikers mogen opzoeken, en voor "Verzendrecht geven" het
profiel DS Admin hebben.

## 3. Variabelen zetten

1. Open het **Environment-paneel van de backend** op `control.motrac.app`
   (niet de frontend: die bakt alles in de bundel).
2. Open de onetimesecret-link en zet de zes waarden erin, met precies deze namen.
   De sleutel staat op één regel (base64); niets aan veranderen.
3. Herstart de backend.
4. Laat Claude of jezelf de status-route bekijken: `ontbreekt` is leeg,
   `koppeling.status` is `ok`, `omgeving` is `demo`.

Lokaal ontwikkelen kan zonder echte waarden: de tests draaien tegen de
nep-DocuSign, en zonder sleutel start de app gewoon (DocuSign uit).

## 4. Connect-configuratie (Mark)

In DocuSign Admin → Settings → Integrations → **Connect** → *Add Configuration →
Custom*. Eén configuratie per app.

> **Aan:** mark.kuijpers@motrac.nl
> **Onderwerp:** Connect-configuratie (demo) voor `<appnaam>`
>
> Hoi Mark,
>
> Kun je in DocuSign (demo) een Connect-configuratie voor `<appnaam>` maken?
>
> - Naam: `<Appnaam> (webhook)`
> - URL to Publish: `<https://backend-url><webhook-pad>`
> - Data Format: **JSON** (JSON SIM, niet het oude XML)
> - Include Data: alleen Envelope Status (geen documenten)
> - Trigger Events (envelope): Sent, Delivered, Completed, Declined, Voided
> - Include HMAC Signature: aan (de bestaande accountsleutel)
> - Require Acknowledgment: aan
>
> Dank!

Goed om te weten: een Custom-configuratie levert de events van álle envelopen van
het account. De app beantwoordt envelopen van andere apps met 204 en doet er
niets mee. "Voided" dekt ook verlopen envelopen (DocuSign voidt ze zelf).

## 5. Verzenders klaarzetten

Per persoon die verstuurt:

1. Eenmalig **inloggen op DocuSign via SSO** met het @motrac.nl-account (dan
   bestaat de DocuSign-gebruiker).
2. Het profiel moet **Sender** zijn; een nieuwe SSO-gebruiker is *Viewer*. Dat
   zet de DocuSign-beheerder, of een beheerder van de app met "Verzendrecht geven".
   Sender-seats tellen mee voor de licentie.
3. In het beheerscherm van de app staat per verzender `ok`.

| Stand | Wat te doen |
|---|---|
| `geen_email` | Het e-mailadres ontbreekt in de app (login of verzenderslijst). |
| `geen_account` | Stap 1: eenmalig via SSO inloggen op DocuSign. |
| `geen_verzendrecht` | Stap 2: profiel Sender. |
| `geen_toestemming` | Stap 1, of Mark staat de app toe (Verbonden apps). |

## 6. Testdraaiboek (demo)

Vink af en noteer de envelop-ID's. Claude kijkt mee in de status-route en het
serverlog.

- [ ] **Health**: koppeling `ok`, jouw verzenderstand `ok`, omgeving `demo`.
- [ ] **Versturen naar jezelf** (of via het testslot naar een testadres): de mail
      komt als "*jouw naam* via DocuSign"; velden staan op de goede plek; het
      document is leesbaar (HTML wordt door DocuSign omgezet: controleer opmaak en
      afbeeldingen).
- [ ] **Tekenen**: het Connect-logboek toont de levering met 200/204; in de app
      staat de status op getekend; het getekende PDF is opgehaald (als de app dat
      doet).
- [ ] **Weigeren** (nieuwe envelop): status geweigerd.
- [ ] **Intrekken** in DocuSign (of in de app): status ingetrokken.
- [ ] **Dubbel**: dezelfde levering opnieuw sturen vanuit het Connect-logboek
      verandert niets.
- [ ] **Zonder recht**: een collega zonder DocuSign-account of met Viewer krijgt de
      juiste melding, en er is niets verstuurd.
- [ ] **Status ophalen** werkt ook zonder webhook.

Ziet het Connect-logboek **401**: de HMAC-sleutel in de app verschilt van die van
het account. **400**: het formaat wijkt af; neem de body uit het logboek mee
(geanonimiseerd) en meld het in de repo van de bouwsteen.

## 7. Naar productie

> **Aan:** mark.kuijpers@motrac.nl
> **Onderwerp:** DocuSign-variabelen (productie) voor `<appnaam>`
>
> Hoi Mark,
>
> De demotest van `<appnaam>` is geslaagd (`<datum>`, envelopen `<id's>`). Mag ik de
> productiewaarden via een onetimesecret-link, en kun je de Connect-configuratie
> ook in productie maken (zelfde instellingen, URL `<https://backend-url><webhook-pad>`)?
>
> Dank!

Daarna: waarden vervangen in het Environment-paneel (nu
`https://account.docusign.com`), herstarten, het testslot op live zetten als de
app er een heeft, en één envelop naar een collega als rooktest. De
integratiesleutel is dezelfde als die van de andere apps; is die al door de
Go-Live-review van DocuSign, dan hoeft dat niet opnieuw.
