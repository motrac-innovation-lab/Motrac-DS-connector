# Frontend: wat er in de UI moet zitten

De bouwsteen levert geen schermen. De UI hangt aan `@motrac/template-ui`, aan de
i18n en aan het domein van de app, en een gedeelde component zou dat allemaal
moeten kennen. De werkende referentie staat in **mit-rental**:

| Bestand in mit-rental | Wat |
|---|---|
| `frontend/src/components/OndertekenBlok.tsx` | Het blok op het record: stand, ondertekenaar, versturen, status ophalen, getekend document. |
| `frontend/src/lib/ondertekenen.ts` | De pure regels: wanneer versturen kan (`versturenBlokkade()`), de melding bij een verzenderprobleem (`verzenderFoutUit()`), de toon per status. |
| `frontend/src/modules/instellingen/DocusignKaart.tsx` | Het beheerscherm: wat er aan de env ontbreekt, of de inlog werkt, per verzender de stand, "Verzendrecht geven". |

## Het ondertekenblok

- Toont de stand uit `GET /api/docusign/status`: niet ingesteld (dan eventueel een
  demo), demo of productie (`omgeving`), en of versturen op jouw naam kan
  (`verzender.status`). Eén minuut bewaren: elke stand is een paar aanroepen naar
  DocuSign.
- **Versturen** pas als: het document compleet is, naam en e-mail van de
  ondertekenaar kloppen, er niets onopgeslagen is en de verzender `ok` is.
- **Bevestigingsstap** vóór versturen (onomkeerbaar: DocuSign mailt de klant).
  Laat in die stap zien naar wie het gaat en op wiens naam.
- Bij `409 DOCUSIGN_VERZENDER` de `message` tonen, plus een aanwijzing per `reden`:
  - `GEEN_EMAIL`: waar in de app het e-mailadres staat;
  - `GEEN_ACCOUNT` en `GEEN_TOESTEMMING`: eenmalig inloggen op DocuSign via SSO
    met het @motrac.nl-account;
  - `GEEN_VERZENDRECHT`: de DocuSign-beheerder (of een beheerder van de app met
    "Verzendrecht geven") zet het profiel op Sender.
- Na versturen: de status (verstuurd, bekeken, getekend, geweigerd, ingetrokken),
  een knop **Status ophalen**, en bij getekend het getekende document.
- **Intrekken** alleen met een reden en een bevestiging; DocuSign mailt de reden
  naar de ondertekenaar.

## Het beheerscherm

- `ontbreekt`: de namen van de lege variabelen (nooit waarden).
- De koppeling (`controleerKoppeling`) met de foutmelding voor de beheerder.
- Per verzender de stand (`controleerVerzender`), met "Verzendrecht geven" bij
  `geen_verzendrecht` (`geefVerzendrecht`, alleen beheerders; de koppelgebruiker
  moet daarvoor in DocuSign het profiel DS Admin hebben).

## Rondleiding en i18n

Volg de `CLAUDE.md` van de app: teksten met `t()` in beide talen, en als de app een
rondleiding heeft, een stap voor het ondertekenblok.
