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

## Medewerkerloonstroken

Voeg een medewerker toe bij **Salarissen → Persoonsgegevens DGA / medewerker**.
Open **Loonstrook medewerker**, selecteer de persoon en vul de werkgevers- en
contractgegevens, verloonde uren en loonbestanddelen in. De loonstrook legt een
snapshot vast, zodat een latere wijziging van persoons- of werkgeversgegevens
geen bestaande medewerkerloonstrook verandert.

- **Concept bewaren** slaat uitsluitend een concept op, zonder kosten,
  aangiftebedragen of cumulatieven. Een concept-PDF bevat het label CONCEPT.
- **Definitief maken en boeken** valideert de verplichte gegevens, maakt een
  bruto-nettoberekening en vervangt de gekoppelde kostenboeking bij een correctie.
  Loonstrook en gebalanceerd loonjournaal zijn als PDF beschikbaar. Lange teksten
  lopen door op volgende regels en worden niet meer afgekapt.
- Automatische loonheffing gebruikt de officiële **witte maandtabel Nederland
  standaard 2026, vóór AOW**; het naastlagere tabelloon en de gepubliceerde
  berekening boven EUR 11.092,50 worden toegepast. Arbeidskorting zit al in de
  loonheffing. Voor bijzondere beloningen moet het juiste bijzondere tarief,
  inclusief eventuele verrekening van heffingskortingen, worden onderbouwd.
- Het werknemerspensioen verlaagt in de ondersteunde uniforme loonberekening het
  fiscale loon, SV-loon en Zvw-loon. Het werkgeverspensioen is een extra kostenpost.
  Neem exacte maandbedragen of een geverifieerde periodieke pensioengrondslag na
  franchise en deeltijd met afzonderlijke werknemers-/werkgeverspercentages over.
  De regeling wordt niet geraden. Documenteer ook wanneer geen regeling geldt.
- Automatische Zvw en werknemersverzekeringen gebruiken VCR voor volledige,
  aaneensluitende maandtijdvakken in 2026 vóór AOW. Zvw werkgever is 6,10%, AWf
  2,74%/7,74%, Aof 6,27%/7,63%, Wko 0,50%. Whk komt uit de werkgeversbeschikking.
  De maandgrens is EUR 6.617,41. Bij overstap midden in het kalenderjaar zijn de
  eerdere premietijdvakken, het cumulatieve SV-loon en het cumulatieve premie-/
  bijdrageloon vereist. Beginstanden blijven binnen het jaar gelijk. Eerdere
  handmatige premies kunnen niet zonder herbeoordeling automatisch worden vervolgd.
- Vakantiegeld kan worden gereserveerd of maandelijks uitbetaald. De standaardbasis
  is het basisloon plus regulier extra loon/overwerk. Controleer volgens de cao of
  overige beloningen moeten meetellen; stel zo nodig een onderbouwde afwijkende
  vakantiegeldgrondslag in. De fiscale indeling van bijzonder loon blijft behouden. Uitbetaling uit de reserve wordt niet opnieuw als loonkosten geboekt en kan
  alleen binnen de beschikbare reserve; vul bij overstap de beginreserve in.
- Pensioenbetalingen (werknemer én werkgever) en afdracht van overige netto
  inhoudingen zijn afzonderlijke balansbetalingen, zonder btw of dubbele kosten.
  De saldi omvatten alle opgeslagen perioden. De werkelijke nettoloonbetaling leg
  je op de loonstrook vast. De aangifte loonheffingen neemt werkgeverspremies en
  Zvw over zonder deze nogmaals als werkgeverskosten te boeken. Controleer de
  verschillen met de daadwerkelijk ingediende aangifte.

De automatische route is beperkt tot standaardwerknemers met uniforme fiscale,
SV- en Zvw-grondslagen en volledige maandtijdvakken in 2026. Gebruik gecontroleerde
exacte loonheffing en premiebedragen voor andere jaren, gedeeltelijke tijdvakken,
AOW, buitenland, vrijstellingen of AWf-uitzonderingen. Complexe afwijkende
loonbegrippen (zoals bepaalde PAWW-inhoudingen), loon in natura, meerdere
inkomstenverhoudingen en niet-maandelijkse loonperioden vereisen een volledige
berekening in passende salarissoftware. Deze uitbreiding dient geen loon- of
pensioenaangifte in en vervangt geen controle van cao/pensioenplicht of aangifte.
Correcties moeten chronologisch worden verwerkt: corrigeer of verwijder eerst de
latere stroken om daarna alle afhankelijke perioden opnieuw te berekenen.

Bronnen: [loonstrookvereisten RVO](https://ondernemersplein.overheid.nl/wetten-en-regels/loonstrook-aan-uw-werknemer-geven/),
[witte maandtabel 2026](https://download.belastingdienst.nl/belastingdienst/dl/rekenhulpen/loonheffing/2026/v01/pdf/wit_mnd_nl_std_20260101.pdf),
[Handboek Loonheffingen](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/handboek-loonheffingen),
[minimumuurloon 2026](https://www.rijksoverheid.nl/themas/werk/minimumloon/bedragen-minimumloon/bedragen-minimumloon-2026),
[premies 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontenten/belastingdienst/business/payroll_taxes/you_are_not_established_in_the_netherlands_are_you_required_to_withhold_payroll_taxes/when_you_are_going_to_withhold_payroll_taxes/calculating_payroll_taxes/rates/rates-2026/table-9-employed-persons-insurance-scheme-contributrions-2026).

## Inkoopfacturen uit eerdere kwartalen

Kies bovenaan het kwartaal waarvoor de eerstvolgende btw-aangifte wordt voorbereid.
Bij nieuwe uitgaven en geïmporteerde inkoopfacturen stelt **Btw-tijdvak** voor om
facturen uit eerdere kwartalen van hetzelfde boekjaar in dit kwartaal mee te nemen.
De voorgestelde btw-datum is de eerste dag van dat kwartaal. Controleer altijd of
dit de eerstvolgende aangifte is; BoekBalans kent de indieningsstatus niet.
Bij de selectie **Hele boekjaar** wordt niets automatisch doorgeschoven.

De oorspronkelijke factuurdatum blijft bepalend voor kosten en open posten.
**Zelf een btw-datum kiezen** ondersteunt ook een specifieke maand; kies
**Oorspronkelijke factuurdatum** voor verwerking/correctie in het oude tijdvak.
De gekozen btw-datum wordt per boekingsregel opgeslagen en blijft bij bewerken,
betalen, opslaan en JSON-backups behouden. Oude boekingen worden niet gemigreerd;
open die afzonderlijk om hun btw-datum aan te passen. Verkoopfacturen, salarissen
en balansmutaties worden niet doorgeschoven.

De btw-kaarten, maand- en kwartaaloverzichten en btw-PDF gebruiken de btw-datum.
De btw-PDF specificeert doorgeschoven facturen met beide datums. Kosten en winst
blijven op de factuurdatum. De toepassing dient geen btw-aangifte of suppletie in.

Voor vergeten voorbelasting is doorschuiven beperkt tot een totale correctie van
maximaal EUR 1.000. Bij het boeken worden de doorgeschoven regels van het
ontvangende kwartaal opgeteld (na aftrekpercentage, inclusief creditnota's).
Boven die grens wordt doorschuiven geweigerd; verwerk de oorspronkelijke periode
via een suppletie. Beoordeel ook andere correcties die BoekBalans niet bijhoudt.
Facturen uit een ander boekjaar volgen niet automatisch deze route.

Bron: [Belastingdienst — btw-aangifte corrigeren](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/aangifte_corrigeren/).

## Internationale verkoop-btw, ICP en buitenlandse btw

Bij handmatige **Inkomsten** en bij geïmporteerde verkoopfacturen staat nu
**Btw-behandeling verkoopfactuur**. Leg de behandeling, ISO-landcode en soort
afnemer per factuur vast. De keuze wordt opgeslagen met de boeking; bestaande
boekingen houden hun oude behandeling totdat je ze beoordeelt en wijzigt.
Gebruik EU-btw-landen, niet het geografische Europa: GB, NO en CH vallen buiten
de EU. XI wordt alleen ondersteund voor EU-goederenleveringen in Noord-Ierland.

Ondersteunde keuzes:

| Keuze | Nederlandse aangifte | ICP |
| --- | --- | --- |
| Nederlandse btw, ook bij buitenlandse klant | 1a, 1b of 1e bij 0% | Nee |
| EU-goederenlevering met 0% | 3b | Goederen per btw-id |
| Belaste EU-B2B-dienst, btw verlegd | 3b | Diensten per btw-id |
| Uitvoer goederen buiten EU | 3a | Nee |
| Dienst belast buiten EU | Buiten Nederlandse aangifte | Nee |
| EU-particulier: buitenlandse btw via OSS | Buiten Nederlandse aangifte, ook buiten 3c | Nee |
| Afstands-/installatielevering EU met lokale aangifte | 3c, alleen omzet | Nee |
| Dienst belast in buitenland met lokale aangifte | Buiten Nederlandse aangifte | Nee |
| Vrijgestelde omzet | Buiten Nederlandse aangifte | Nee |

De gebruiker bevestigt de plaats van prestatie en voorwaarden. Bij ICP zijn een
buitenlands btw-id, de bevestigde VIES-controle en (bij diensten) de leverdatum
vereist. De app controleert land/prefix/syntaxis, niet de daadwerkelijke geldigheid
bij VIES. Bewaar controlebewijs en vervoer-/uitvoerdocumenten; een dossierverwijzing
kan op de boeking worden vastgelegd. Op de externe verkoopfactuur moeten de juiste
wettelijke vermeldingen en btw-id's staan. BoekBalans maakt/importeert boekingen;
deze uitbreiding genereert geen externe verkoopfactuur.

Intracommunautaire diensten volgen de opgegeven leverdatum in btw-overzicht én
ICP; de omzet blijft boekhoudkundig op de factuurdatum. Daardoor kan een dienst
in een ander kwartaal of jaar voor de btw meetellen. Goederen volgen de
factuurdatum. Doorlopende prestaties, voorschotten, eerdere aangiftecorrecties en
bijzondere tijdvakregels moet de adviseur afzonderlijk beoordelen.

Btw-overzicht en btw-PDF bevatten verkooprubrieken, ICP met afzonderlijke kolommen
voor goederen/diensten en aansluiting met 3b, buitenlandse btw per land/route en
omzet buiten de Nederlandse aangifte. Alle bedragen worden in euro ingevoerd.
Buitenlandse btw wordt apart ingevoerd (creditnota: negatief), telt mee in bruto
factuurbedrag/open posten/bankbedrag en reservering, maar niet in Nederlandse
verschuldigde btw. Bij een gesplitste factuur wordt het buitenlandse btw-bedrag
naar rato verdeeld met een afrondingsrest op de laatste regel. Gebruik aparte
boekingen als binnen één factuur verschillende fiscale routes moeten gelden.

Bij particulieren moet je de plaats van levering/dienst, buitenlandse registratie,
OSS-keuze en de gezamenlijke drempel voor EU-afstandsverkopen en digitale diensten
beoordelen (EUR 10.000, huidig en vorig jaar, inclusief toepassingsvoorwaarden).
BoekBalans bepaalt geen buitenlandse tarieven en bewaakt deze drempel niet
automatisch. Het buitenlandse overzicht is geen volledige OSS-specificatie per
tarief en dient geen OSS-melding, lokale aangifte of ICP in. De gebruiker bepaalt
ook de vereiste ICP-frequentie. EU-KOR, margeregeling, ABC/voorraadtransacties,
bijzondere btw-gebieden en plaats-van-dienst-uitzonderingen vereisen afzonderlijke
beoordeling; kies de route pas na die beoordeling.

Internationale belaste omzet en 0%-omzet worden niet als vrijgesteld aangemerkt
voor het voorstel van de omzetverhouding. Oude 0%-verkopen zonder classificatie
blijven te beoordelen; ze worden niet stilzwijgend als vrijgesteld overgenomen.
De voorbelasting/pro-rata-instelling blijft een afzonderlijke fiscale beoordeling.
Internationale inkopen/verleggingsrubrieken 4a/4b vallen buiten deze uitbreiding
voor verkoopfacturen.

Bronnen: [EU-diensten](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/goederen_en_diensten_naar_andere_eu_landen/btw_berekenen_bij_diensten/),
[ICP](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/goederen_en_diensten_naar_andere_eu_landen/opgaaf_icp/),
[goederen buiten EU](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/zakendoen_buiten_de_eu/aangifte_doen_als_u_zakendoet_buiten_de_eu/aangifte_en_als_u_goederen_uitvoert_naar_niet_eu_landen),
[diensten buiten EU](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/zakendoen_buiten_de_eu/aangifte_doen_als_u_zakendoet_buiten_de_eu/aangifte_doen_als_u_diensten_levert_aan_afnemers_in_niet_eu_landen),
[EU-afstandsverkopen](https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/btw-goederen-eu-particulieren).
