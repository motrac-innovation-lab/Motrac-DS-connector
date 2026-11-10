# Motrac-DS-connector (`@motrac/docusign`)

DocuSign voor Motrac-apps: de envelop op naam van de gebruiker die verstuurt, de
webhook van DocuSign Connect, health-checks, een niet-live-slot en testhulp. Eén
bron voor wat mit-contractenbeheer en mit-rental nu elk als kopie hebben.

De app neemt dit pakket op als **afhankelijkheid op een versietag**; de code staat
alleen hier. Bij de build komt hij in het deploy-artefact, zodat de servers geen
toegang tot GitHub nodig hebben.

## Voor wie DocuSign aan een app toevoegt

Laat je Claude Code het doen. Twee manieren:

**Met de plugin** (aanbevolen): eenmalig, in Claude Code:

```
/plugin marketplace add motrac-innovation-lab/Motrac-DS-connector
/plugin install motrac-docusign@motrac-bouwstenen
```

Vraag daarna in je app gewoon "voeg DocuSign toe". De skill
`/motrac-docusign:docusign-integreren` neemt het over. De marketplace staat in een
private repo: je git-inlog moet erbij kunnen (bijvoorbeeld `gh auth login` en
`gh auth setup-git`).

**Zonder plugin**: zeg tegen Claude Code: *"Voeg DocuSign toe met
motrac-innovation-lab/Motrac-DS-connector; volg INTEGREREN.md uit die repo."*

Claude bouwt de integratie en stopt bij de stappen die jij moet zetten: leesrecht
voor CI, de variabelen bij Mark Kuijpers aanvragen (onetimesecret-link), Connect
inrichten, verzenders klaarzetten en testen. Zie
[`MENSELIJKE-STAPPEN.md`](MENSELIJKE-STAPPEN.md).

## Installeren

```bash
npm install "git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#v1.0.0"
```

De lockfile toont daarna een `git+ssh://…#<sha>`; dat is hoe npm GitHub-adressen
wegschrijft, npm haalt toch via https op. In CI vóór `npm ci`:

```yaml
- run: git config --global url."https://x-access-token:${{ secrets.FLEET_REPO_READ_TOKEN }}@github.com/motrac-innovation-lab/".insteadOf "https://github.com/motrac-innovation-lab/"
```

Backend die op de server zelf `npm install` draait: na de eigen build
`npx motrac-docusign-vendor dist`. Backend die met esbuild bundelt: niets extra's.

## Kort gebruik

```js
import { docusignConfig, maakDocusign, verwerkWebhook, maakClaim, httpFout } from '@motrac/docusign'

const ds = maakDocusign(docusignConfig(process.env))

// Versturen, op naam van de ingelogde gebruiker
const { envelopeId } = await ds.verstuurEnvelop({
  verzenderEmail: gebruiker.email,
  onderwerp: 'Offerte KTV-002325 ter ondertekening',
  documenten: [{ naam: 'Offerte KTV-002325', soort: 'html', inhoud: html }],
  ondertekenaars: [{ naam: 'Klant', email: 'klant@bedrijf.nl', velden: [
    { soort: 'signHere', anker: '/rt-handtekening/' },
    { soort: 'dateSigned', anker: '/rt-handtekening/', y: 38 },
  ] }],
  ccs: [{ naam: 'Motrac Rental', email: 'verhuur@motrac.nl' }],
})

// Webhook (ruwe body, vóór de gebruikersauth)
const uitkomst = await verwerkWebhook({
  ruweBody, headers, hmacKey: docusignConfig().webhookHmacKey,
  claim: maakClaim((sql, params) => pool.query(sql, params)),
  verwerk: async (event) => { /* event.event: sent | delivered | completed | declined | voided */ },
})
res.status(uitkomst.status).end()
```

Volledige voorbeelden: [`voorbeelden/express`](voorbeelden/express/docusign.js),
[`voorbeelden/hono`](voorbeelden/hono/docusign.ts). De API met uitleg staat in
`types/index.d.ts`.

| Onderdeel | Wat |
|---|---|
| `maakDocusign(config)` | `verstuurEnvelop`, `haalEnvelopOp`, `haalGetekendDocumentOp`, `trekEnvelopIn`, `controleerKoppeling`, `controleerVerzender`, `geefVerzendrecht` |
| `docusignConfig`, `ontbrekendeEnv`, `isIngesteld`, `omgevingVan` | De zes `DOCUSIGN_*`-variabelen |
| `verwerkWebhook`, `normaliseerConnect`, `verifieerWebhook` | Connect JSON SIM, HMAC over alle `X-DocuSign-Signature-N`, idempotent |
| `maakClaim`, `WEBHOOK_EVENT_SQL`, `sql/` | De tabel `docusign_webhook_event` |
| `metTestSlot` | Niet live: omleiden naar een testadres of weigeren |
| `httpFout` | Fout → HTTP-status, code en details |
| `@motrac/docusign/testing` | `startNepDocusign`, `connectLevering`, `maakTestSleutel` |

## Variabelen

| Variabele | Wat |
|---|---|
| `DOCUSIGN_OAUTH_BASE_URL` | `https://account-d.docusign.com` (demo, standaard) of `https://account.docusign.com` |
| `DOCUSIGN_ACCOUNT_ID` | API Account ID |
| `DOCUSIGN_INTEGRATION_KEY` | Integratiesleutel van de DocuSign-app |
| `DOCUSIGN_USER_ID` | Koppelgebruiker: zoekt verzenders op, verstuurt zelf nooit |
| `DOCUSIGN_PRIVATE_KEY_BASE64` | RSA-sleutel (PKCS#8-PEM) als base64 op één regel; leeg = DocuSign uit |
| `DOCUSIGN_WEBHOOK_HMAC_KEY` | HMAC-sleutel van Connect (per account); leeg = webhook 503 |

Uitgegeven door Mark Kuijpers via een onetimesecret-link; nooit in de repo.

## Ontwikkelen aan dit pakket

Zie [`CLAUDE.md`](CLAUDE.md). Kort: `npm test`, `npm run check:types`, een
release is een tag `vX.Y.Z` met een regel in [`CHANGELOG.md`](CHANGELOG.md).
