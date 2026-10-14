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
