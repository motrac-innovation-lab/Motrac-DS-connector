---
name: docusign-integreren
description: DocuSign (e-signing, digitaal laten ondertekenen, envelop versturen, DocuSign-webhook) toevoegen aan een Motrac-app met de bouwsteen @motrac/docusign uit motrac-innovation-lab/Motrac-DS-connector. Gebruik dit als een gebruiker DocuSign, ondertekenen of e-signing in zijn Motrac-app wil, of een bestaande kopie van de DocuSign-code (mit-contractenbeheer, mit-rental) wil vervangen door de bouwsteen.
---

# DocuSign integreren in een Motrac-app

De werkinstructie zelf staat in de bouwsteen, zodat hij met de code mee versioneert.
Deze skill zorgt alleen dat je hem vindt en de grenzen kent.

## Grenzen (altijd, ook vóór je de instructie gelezen hebt)

- **Geen geheimen.** Vraag nooit om de waarde van een `DOCUSIGN_*`-variabele en zet
  er nooit een in de repo of de chat. Mark Kuijpers (mark.kuijpers@motrac.nl) geeft
  ze uit via een onetimesecret-link; de gebruiker zet ze zelf in het
  Environment-paneel op control.motrac.app.
- **Menselijke stappen doe je niet zelf**: leesrecht in CI, variabelen aanvragen en
  zetten, Connect inrichten, verzenders klaarzetten, testen, productie. Leg ze uit,
  geef de tekst, wacht op de bevestiging.
- **Geen code kopiëren** uit de bouwsteen naar de app: de app neemt hem op als
  afhankelijkheid.
- **De `CLAUDE.md` van de app gaat voor** waar het de app zelf betreft.

## Werkwijze

1. Lees de `CLAUDE.md` van de app en verken de backend (framework, bundelen of niet,
   database, login, CI).
2. Neem de bouwsteen op, altijd met `git+https` en een tag (nieuwste tag: zie de
   tags van motrac-innovation-lab/Motrac-DS-connector; bij de eerste release `v1.0.0`):
   ```bash
   npm install "git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#v1.0.0"
   ```
   Lukt dat niet door rechten, dan mist de gebruiker leestoegang tot die repo: dat
   regelt Mark (zie hieronder).
3. Lees daarna **`node_modules/@motrac/docusign/INTEGREREN.md`** volledig en volg
   die. De mailteksten en het testdraaiboek staan in
   `node_modules/@motrac/docusign/MENSELIJKE-STAPPEN.md`, de voorbeelden in
   `node_modules/@motrac/docusign/voorbeelden/`.

Kan de installatie (nog) niet, lees dan dezelfde bestanden rechtstreeks uit de repo
op dezelfde tag, bijvoorbeeld met een tijdelijke clone buiten de app:

```bash
git clone --depth 1 --branch v1.0.0 https://github.com/motrac-innovation-lab/Motrac-DS-connector.git /tmp/motrac-ds-connector
```

Geeft ook dat een 403/404, vraag de gebruiker dan om Mark leesrecht te laten geven
op motrac-innovation-lab/Motrac-DS-connector, en ga pas verder als dat geregeld is.
