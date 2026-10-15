# BoekBalans

BoekBalans is een eerste webapp voor het bijhouden van ondernemersadministraties.
De app draait lokaal met een JSON-bestand als opslag en is voorbereid voor online
hosting met Cloudflare Workers/Sites en D1-databaseopslag. Browseropslag blijft
alleen als extra vangnet aanwezig.

## Wat zit erin

- Meerdere administraties aanmaken en wisselen.
- Inkomsten en uitgaven boeken, bewerken en verwijderen met btw-percentage en betaalstatus.
- Dashboard met omzet, kosten, resultaat, open posten en btw-saldo.
- Winst- en verliesrekening met opbrengsten, kosten, afschrijvingen en resultaat.
- Downloadbare PDF-overzichten voor financieel overzicht, winst- en verliesrekening, boekingen en relaties.
- Direct downloadbaar PDF-rapport met frisse rapport-layout voor de gekozen periode.
- Periodefilter voor hele boekjaar of kwartaal 1 t/m 4.
- Kwartaaloverzicht voor omzet, kosten, resultaat en btw-saldo.
- Controlepaneel voor open posten, ontbrekende administratiegegevens,
  afschrijvingskandidaten en boekingen die extra aandacht vragen.
- Afschrijvingen alleen bij categorie Investeringen.
- Werkruimte met pincode om de lokale serveropslag te ontgrendelen.
- JSON-backup van de actieve administratie en backup terugzetten.
- Relaties beheren als klant of leverancier, inclusief adres, KvK en selectie bij boekingen.
- Facturen uploaden als conceptboekingen, met optionele OpenAI-herkenning via een veilige serverkoppeling.
- Administratiegegevens vastleggen, zoals KvK, btw-nummer, IBAN en boekjaar.

## Automatische verkoopfactuurnummering

Bij een nieuwe inkomstenboeking staat **Automatisch doornummeren** standaard aan.
BoekBalans stelt het volgende nummer voor op basis van de bestaande verkoopreeks.
Onder **Instellingen → Volgend verkoopfactuurnummer** kun je het startnummer of
het begin van een nieuwe jaarreeks instellen, bijvoorbeeld `2027-0001`.
De teller loopt per administratie door en wordt bij het opslaan verhoogd.
Verwijderen of corrigeren draait de teller niet terug. Uitgaven en ingelezen
facturen behouden hun eigen nummer. Zet het vinkje uit om een extern nummer
handmatig in te voeren. Een dubbel verkoopfactuurnummer wordt geweigerd bij
het toevoegen of wijzigen van een boeking; ongewijzigde bestaande nummers
blijven behouden. De bestaande werkruimteopslag is bedoeld voor één gebruiker;
de teller reserveert geen nummers tussen gelijktijdige browsersessies.

Controleer de nummering met `pnpm test`.

## Lokaal openen

De app draait nu op:

```text
http://localhost:3002
```

Voor een echte online versie zijn de volgende logische stappen gebruikersaccounts
met sterke authenticatie, rechten per administratie en domeinkoppeling.

## Online voorbereiding

- OpenNext/Cloudflare buildconfiguratie is aanwezig.
- De werkruimte-API gebruikt online D1-opslag via de `DB`-binding.
- De lokale JSON-opslag blijft werken als fallback bij lokaal gebruik.

## Publiceren

De app is voorbereid voor Cloudflare Workers/Sites:

```text
pnpm build:worker
```

Daarna kan de build als Sites-versie worden opgeslagen en gedeployed. De huidige
Codex/Sites-publicatie kon nog niet worden afgerond, omdat het gekoppelde
project-owner account als gedeactiveerd wordt gemeld. Zodra dat account weer
actief is, kan de eerste productieversie worden aangemaakt.

## Loonheffingen, WKR en rekening-courant

- **Loonheffingen:** leg de definitieve maandelijkse aangifte vast. Het voorstel
  gebruikt de opgeslagen salarisregels. Leg loonbelasting/premie volksverzekeringen,
  DGA-bijdrage Zvw, werkgevers-Zvw, werknemersverzekeringen, eindheffingen en
  correcties afzonderlijk vast. `Verwerk salarissen en werkgeverslasten` boekt de
  gekoppelde salariskosten en alleen de nog niet daarin opgenomen werkgeverslasten.
  Herhaald verwerken vervangt gekoppelde boekingen. Betalingen, deelbetalingen en
  negatieve teruggaven boeken op de balans, zonder extra kosten of btw. Correcties
  van eerdere tijdvakken zijn een aangiftesaldo; de onderliggende oude salaris- of
  kostenboeking moet afzonderlijk worden gecorrigeerd. Het aangifteoverzicht is
  downloadbaar als PDF. Deze functie dient geen loonaangifte in; zij ondersteunt
  maandtijdvakken passend bij de bestaande maandelijkse salarisadministratie.
- **WKR:** stel per kalenderjaar de daadwerkelijke fiscale loonsom en tarieven in.
  In 2025/2026 zijn de standaardtarieven 2% tot EUR 400.000 en 1,18% daarboven.
  Wijs gewone kostenboekingen toe aan vrije ruimte, gerichte vrijstelling of
  nihilwaardering. De standaardwaarde is inclusief btw; een afwijkende fiscale
  waardering kan worden ingevoerd. Niet-aangewezen kosten tellen niet mee. De
  eindheffing is 80% over de overschrijding en wordt niet automatisch als tweede
  kostenpost geboekt. Neem de werkelijk aangegeven eindheffing over bij de
  loonaangifte. Het overzicht geldt per administratie, zonder concernregeling.
- **Rekening-courant DGA:** kies bij zakelijke kosten de betaalwijze
  `Rekening-courant DGA` en vul de naam van de DGA in. De factuur blijft een
  zakelijke kosten-/investeringsboeking met de gebruikelijke btw-beoordeling;
  rekening-courant wordt gecrediteerd voor het totaal inclusief btw op de
  betaaldatum. Registreer privé-uitgaven via de BV, onderlinge betalingen en een
  bestaand beginsaldo op het tabblad Rekening-courant DGA. Dit zijn uitsluitend
  balansmutaties. Positief saldo = schuld DGA aan BV, negatief = schuld BV aan DGA.
  De maand-PDF bevat het beginsaldo uit alle eerdere mutaties, de maandmutaties
  en het eindsaldo, afzonderlijk per DGA. Rente wordt niet automatisch berekend.
- **Btw-PDF:** selecteer onder Downloads een afzonderlijke maand van het actieve
  boekjaar of de bestaande jaar-/kwartaalperiode. Balansmutaties, salarisregels
  en loonheffingen worden niet als btw-omzet of btw-inkoopgrondslag meegenomen.

Salariskosten worden aan de salarismaand toegerekend. In het kasoverzicht telt
het netto uitbetaalde loon mee, plus de afzonderlijke betalingen loonheffingen.
Privé voorgeschoten zakelijke kosten leiden niet tot een bankuitgave van de BV.
Controleer voor het afsluiten de aansluiting met de ingediende aangifte, de
bankbetalingen en eventuele eerder handmatig geboekte kosten, zodat oude
handmatige boekingen niet dubbel blijven staan.

Bronnen: [Belastingdienst WKR](https://www.belastingdienst.nl/wps/wcm/connect/nl/personeel-en-loon/content/werkkostenregeling),
[loonaangifte](https://www.belastingdienst.nl/wps/wcm/connect/nl/personeel-en-loon/content/loonaangifte-aangifte-loonheffingen),
[rekening-courant](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/bijzondere_situaties/geld_lenen_van_uw_bv/voorwaarden_bij_de_rekening_courant).
