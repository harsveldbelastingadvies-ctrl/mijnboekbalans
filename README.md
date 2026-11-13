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

## Veilige werkruimteopslag en herstelkopieën

De server geeft bij inloggen een versienummer (`revision`) terug. Opslaan kan
uitsluitend met die versie. Een gelijktijdige of verouderde sessie krijgt HTTP 409
en kan nieuwere servergegevens niet vervangen. Oude appversies zonder versienummer
krijgen HTTP 428: download daarin eerst de invoer als backup en open vervolgens
de actuele app. Een productieomgeving zonder D1-binding weigert opslag; zij wijkt
niet uit naar een tijdelijk lokaal bestand.

De browser verstuurt één opslagverzoek tegelijk en bewaart nieuwe wijzigingen
afzonderlijk terwijl het vorige verzoek loopt. De status **Opgeslagen op server**
verschijnt pas na bevestiging van de laatste wijzigingen. Bij een verbindingsfout
kun je opnieuw opslaan; bij een versieconflict download je eerst je invoer en
vergelijk je die met de nieuwste serverversie. Er wordt niet automatisch over
een conflict heen geschreven. Het scherm waarschuwt bij sluiten met onbevestigde
wijzigingen. Browserwaarschuwingen bij sluiten zijn afhankelijk van de browser.

Niet bevestigde invoer blijft, zolang browseropslag beschikbaar is, in een eigen
lokale herstelkopie per sessie staan. Opnieuw inloggen bewaart een afwijkende oude
browserkopie vóór het laden van de servergegevens. Herstelkopieën van andere
tabbladen of eerdere bezoeken worden niet bij het inloggen verwijderd. Als de
browseropslag vol of uitgeschakeld is, verschijnt een melding met een backupoptie.
De invoer gaat dan nog wel naar de server; sluit pas na de bevestiging.

Bij elke serverwijziging worden de vorige administraties en hun versie in dezelfde
D1-transactie bewaard. De laatste **200 eerdere werkruimteversies** blijven
beschikbaar onder **Rapporten & downloads → Automatische herstelkopieën**.
Na ontgrendelen kun je daar de actieve administratie uit een eerdere versie
downloaden. Downloaden verandert de huidige administratie niet. Terugzetten via
de bestaande backupfunctie maakt een nieuwe administratie ter vergelijking.
De historie bevat geen pincodehash of werkruimteprofiel en omvat geen afzonderlijk
opgeslagen documentbestanden. Historie wordt vanaf deze wijziging opgebouwd;
eerder verdwenen gegevens worden hiermee niet alsnog teruggevonden.

Test opslagconflicten, onderbroken verbindingen, versiehistorie en bestaande
boekhoudfuncties met `pnpm test`.

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
naar rato verdeeld met een afrondingsrest op de laatste regel. Iedere nieuwe factuurregel kan een eigen btw-behandeling, land en buitenlands
btw-bedrag krijgen. Opgeslagen regels delen hetzelfde factuurnummer; de nummering
loopt één factuur verder. Bestaande opgeslagen regels worden afzonderlijk bewerkt.

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

## Eenvoudige fiscale kostenaftrek / restaurantbonnen

Bij handmatige uitgaven en geïmporteerde inkoopfacturen staat **Fiscale
kostenaftrek**. Kies de zakelijke restaurantmaaltijd voor IB (80% aftrek) of
VPB (73,5% aftrek), vul het bonbedrag inclusief btw en het zakelijke doel in.
De keuze stelt Representatiekosten en 9% op de bon voor; controleer het werkelijke
btw-percentage en kies waar nodig 21%, of splits een gemengde bon per tarief.
Dit is bedoeld voor zakelijke maaltijden van de ondernemer of met relaties die
ter plaatse in de horeca worden genuttigd. Privémaaltijden zijn geen zakelijke
kosten; personeelsvoorzieningen/loon en doorbelaste horecaprestaties moeten apart
worden beoordeeld.

Voorbeeld: een zakelijke restaurantbon van **EUR 61,25 inclusief 9% btw** wordt
vastgelegd als EUR 56,19 exclusief en EUR 5,06 btw. De aftrekbare voorbelasting is
EUR 0. De totale EUR 61,25 blijft een kostenpost; met de IB-percentagekeuze wordt
EUR 12,25 fiscaal bijgeteld en resteert EUR 49,00 aftrek. Met de VPB-keuze is de
bijtelling EUR 16,23 en de aftrek EUR 45,02 (op centen afgerond).

De btw-blokkade per boeking staat los van het algemene pro-rata-percentage van de
administratie. Btw-overzicht/PDF en btw-reservering nemen de geblokkeerde btw niet
in aftrek. Open posten, betaling, rekening-courant DGA en WKR-waardering behouden
het juiste bruto bonbedrag. De daadwerkelijke btw op de bon wordt op centen
vastgelegd; bij een splitsing wordt de fiscale correctie één keer over het totale
kostenbedrag berekend en met een afrondingsrest over de regels verdeeld.
Creditnota's keren bruto, btw en fiscale bijtelling om. Het fiscale resultaat
neemt de bijtelling op, zonder de oorspronkelijke kosten of betaling te verlagen.

De procentuele methode moet consistent worden toegepast voor de betreffende
beperkt aftrekbare kosten van het jaar. Dit is geen vrije keuze van een gunstiger
percentage per bon. De alternatieve jaardrempel (bij VPB mede afhankelijk van de
loonsom) wordt niet automatisch berekend; beoordeel die methode afzonderlijk en
verwerk een eventuele jaarcorrectie handmatig. De restaurantkeuze dekt niet
stilzwijgend alle uitzonderingen op de aftrekbeperking.

**Andere kosten: handmatig corrigeren** behoudt de mogelijkheid van een eigen
fiscale bijtelling en biedt daarnaast een onafhankelijke btw-blokkade. De
correctie mag niet groter zijn dan het kostenbedrag en moet hetzelfde teken
hebben als de bon. **Geen extra fiscale correctie** wist de extra bijtelling en
btw-blokkade. Bestaande boekingen worden niet automatisch gewijzigd; bestaande
handmatige correcties blijven bij het openen beschikbaar.

Bronnen: [Belastingdienst horeca-btw](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aftrekken/welke_btw_is_aftrekbaar/bijzondere_situaties/uitgaven_in_de_horeca),
[beperkt aftrekbare kosten 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/drempel-beperkt-aftrekbare-kosten-2026).

## Werkruimte, documenten en aangiftedossiers

Het startscherm toont doorzoekbare klantenkaarten. Nieuwe klanten worden in twee
stappen aangemaakt; alleen naam en boekjaar zijn vereist. Boekingen, factuurconcepten
en documenten worden steeds vanuit de actieve administratie geopend.

De documentenkast bewaart originele bestanden per administratie, boekjaar en map.
Ondersteunde bestanden: PDF, JPG/JPEG, PNG, WebP, DOCX, XLSX, CSV, TXT, XML en UBL;
maximaal 5 MB per bestand. Factuurimport probeert de originele bestanden meteen
te archiveren en koppelt succesvolle uploads aan de resulterende boekingen.
Een mislukte opslag wordt expliciet gemeld. Bestaande boekingen krijgen niet
achteraf automatisch een origineel document.

In productie gebruikt de documentenkast de bestaande D1-binding `DB`, met aparte
metadata- en bestandstabellen. De tabellen worden na geautoriseerde toegang
idempotent aangemaakt; `drizzle/0001_administration_documents.sql` bevat dezelfde
schemawijziging. Bestanden worden in stukken van 128 KiB bewaard, met SHA-256
integriteitscontrole. Iedere documentactie controleert de bestaande werkruimte-PIN
en het lidmaatschap van de administratie. Dit blijft één gedeelde kantoorwerkruimte,
geen afzonderlijk klantenportaal of autorisatie per medewerker. Ontbreekt de
productiedatabase, dan faalt de opslag zichtbaar. Alleen lokaal wordt `data/`
gebruikt. De gewone JSON-back-up bevat de administratie en documentverwijzingen,
**niet de documentbestanden**; download die afzonderlijk en neem de D1-database
mee in het operationele back-upbeleid.

De aangiftewerkruimte heeft een eigen scherm zonder de gewone navigatie en
administratieoverzichten. Voor omzetbelasting kan een vaste controleversie worden
bewaard en als PDF worden geëxporteerd. Latere boekingen wijzigen die versie niet.
De bestaande ondersteunde rubrieken en btw-datumfilters blijven de bron; overige
rubrieken en correcties vereisen afzonderlijke beoordeling. Er is **geen directe
verzending naar de Belastingdienst**. Pas na externe indiening registreert de
gebruiker een datum, kenmerk en eventueel een ontvangstbevestiging. De bestaande
loonheffingenmodule is eveneens vanuit deze werkruimte bereikbaar.

## Facturen inboeken met meerdere btw-behandelingen

Onder **Boekingen → Factuur inboeken** kies je Verkoopfactuur of Inkoopfactuur / bon.
Vul eerst relatie, factuurdatum, nummer en omschrijving in. Bij één tarief kun je
het bedrag inclusief of exclusief btw invullen. **Regel toevoegen** maakt een
splitsing met per regel een categorie, grondslag en tarief. Bij verkoop kies je
ook per regel de fiscale behandeling, inclusief vrijstelling, binnenlandse
verlegging en de bestaande internationale routes. Het totaal blijft zichtbaar;
de velden voor het totale bedrag worden bij een splitsing alleen-lezen.

Binnenlandse verlegging wordt apart vastgelegd als omzet in rubriek 1e, zonder
verschuldigde btw of ICP. Hiervoor zijn een Nederlandse zakelijke afnemer, diens
btw-id en bevestiging van de toepasselijkheid vereist. Dit vervangt de beoordeling
van de verleggingsregeling niet. De externe factuur moet ‘btw verlegd’, het btw-id
van de afnemer en de vergoeding per toepasselijk tarief vermelden.
Bron: [Belastingdienst — Hoe werkt btw verleggen?](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_berekenen_aan_uw_klanten/waarover_btw_berekenen/verleggingsregeling/hoe_werkt_btw_verleggen).

Dezelfde splitsing is beschikbaar bij geïmporteerde verkoopfacturen, ook als er
maar één tarief is herkend. Bestaande concepten met één gezamenlijk buitenlands
btw-bedrag behouden de verdeling naar grondslag. Zodra je een regel aanpast,
blijven de al verdeelde bedragen op de overige regels staan. Creditnota's gebruiken
negatieve bedragen; alle regels worden vóór het boeken gevalideerd. Originele
documentkoppelingen en de btw-/ICP-datum per dienst blijven behouden.

## Particuliere relaties en toevoegen tijdens inboeken

Bij **Klanten & leveranciers** kies je eerst **Onderneming** of **Particulier**.
Die keuze staat los van de rol klant/debiteur, leverancier/crediteur of beide.
Voor particulieren is alleen de volledige naam verplicht; KvK-velden en KvK-zoeken
worden verborgen. E-mail en adres zijn optioneel. Bestaande relaties zonder deze
nieuwe keuze behouden hun zakelijke weergave en kunnen handmatig naar particulier
worden omgezet. De relatielijst, keuzelijsten en het relaties-PDF tonen de keuze;
particulieren krijgen geen melding dat hun KvK-nummer ontbreekt.

Naast het relatieveld staat **+ Debiteur toevoegen** (of **+ Leverancier toevoegen**).
Dit opent een venster boven de huidige factuur, zowel bij **Boekingen** als bij
**Facturen inlezen**. Een al getypte naam wordt overgenomen. **Opslaan en selecteren**
bewaart de relatie in de actieve administratie en selecteert die direct in de
betreffende factuur. Alle andere invoer blijft behouden, inclusief bedragen,
btw-behandelingen, splitsingen, factuurnummer en originele documentkoppeling.
Annuleren of Escape sluit het venster zonder een relatie aan te maken.

Bij een bestaande naam kun je die relatie direct gebruiken. Is die nu alleen
leverancier (of alleen klant), dan kun je dezelfde relatie ook voor de andere
rol gebruiken: de bestaande relatie krijgt beide rollen, zonder dubbele invoer.
Het onderscheid particulier/onderneming verandert de fiscale btw-keuze op de
factuur niet automatisch.

## Verkoopfacturen uit Excel / DigiBoox

Ga naar **Facturen inlezen → Verkoopfacturen uit Excel importeren → Kies Excel / CSV**.
De import ondersteunt `.xlsx`, `.xls` en CSV tot 5 MB, maximaal 10.000 factuurregels
en 200 kolommen. SheetJS CE 0.20.3 wordt op aanvraag geladen vanaf de meegebouwde
applicatiebestanden; de export wordt lokaal gelezen, zonder AI en zonder uitvoering
van formules, macro's of externe koppelingen. Bewaar de originele export zelf;
deze route maakt geen documentdossier-bijlage of nieuwe administratie aan.

Kies het werkblad en de rij met kolomnamen. Gebruikelijke Nederlandse en Engelse
kolomnamen worden voorgesteld; iedere koppeling kan worden aangepast. Koppel minimaal
factuurnummer, factuurdatum, klant en een bedragkolom. Bij ontbrekende btw-percentages
kan een eenduidig tarief uit grondslag en btw worden afgeleid; anders is een expliciete
keuze nodig. Nederlandse getalnotatie, echte Excel-datums (ook de 1904-epoch),
voorloopnullen en negatieve creditbedragen blijven behouden. De bron-btw wordt apart
opgeslagen als `invoiceVatAmount` en gebruikt in de bestaande rapporten en betaalbedragen;
een latere correctie van grondslag, tarief of btw-behandeling vervangt dit bronbedrag.

Standaard is iedere rij één factuur; herhaalde factuurnummers zijn dan geblokkeerd.
Kies **Meerdere factuurregels per factuur** alleen bij afzonderlijke regelbedragen,
bijvoorbeeld voor 9% en 21% binnen één factuur. Gelijk genummerde regels moeten dezelfde
klant, factuurdatum en betaalgegevens hebben. Een export met herhaalde factuurtotalen
is hiervoor niet geschikt. Bestaande nummers (ook in de gewone importwerkvoorraad),
identieke regels, ongeldige datums, verkeerde boekjaren en niet-aansluitende bedragen
worden geblokkeerd. De import behandelt Nederlandse 21%, 9% en expliciet beoordeelde
Nederlandse 0%-omzet; overige fiscale behandelingen gaan via de gewone factuurinvoer.

Ontbreekt de betaalstatus, dan is de zichtbare standaard **Open**. Een factuur die
als betaald is aangemerkt vereist een echte betaaldatum; deelbetalingen en concepten
worden niet automatisch verwerkt. Het voorbeeld toont aantallen, fouten en totalen;
alleen foutloze aangevinkte facturen worden na expliciete controle toegevoegd aan de
actieve administratie. Bestaande boekingen, contacten en andere administraties blijven
behouden. De gewone werkruimteopslag met versievergelijking en automatische herstelkopie
blijft verantwoordelijk voor het opslaan op de server.

## PDF-bankafschriften aan verkoopfacturen koppelen

Onder **Facturen inlezen → Verkoopfacturen uit Excel importeren** staat
**Betalingen bepalen met bankafschriften (PDF)**. Dit werkt met de geselecteerde
nieuwe Excel-facturen én met bestaande open verkoopfacturen in de actieve
administratie. De betaalvelden uit Excel worden in deze modus uitgeschakeld:
alleen gecontroleerde bankkoppelingen bepalen betaaldatum en betaalstatus.
Niet-gekoppelde nieuwe facturen blijven open. Reeds betaalde bestaande facturen
worden niet opnieuw afgeboekt.

Kies maximaal twaalf PDF's tegelijk, ieder tot 5 MB en maximaal 500 transacties.
De bron-PDF wordt na PIN- en administratiecontrole bewaard bij **Documenten → Bank**.
AI-herkenning is opt-in per uploadselectie: de interface vermeldt de overdracht
aan OpenAI en zonder het vinkje wordt geen AI-verzoek gedaan. De bestaande
`OPENAI_API_KEY` wordt gebruikt, met optioneel `OPENAI_BANK_MODEL` (anders
`OPENAI_INVOICE_MODEL`, standaard `gpt-4.1`). De Responses API gebruikt een strikt
schema, `store: false`, begrensde requestgrootte en een timeout. Een ontbrekende
sleutel, fout of afgebroken/onvolledige API-response levert geen gedeeltelijke
automatisch verwerkte bankimport op: de PDF blijft bewaard en handmatige aanvulling
blijft mogelijk. Datums en bedragen worden niet verzonnen.

Controleer de herkende eigen rekening, EUR-valuta, bronpagina's en alle bij- én
afschrijvingen. Regelbedragen en omschrijvingen kunnen worden gecorrigeerd en
ontbrekende transacties worden toegevoegd. Begin- en eindsaldo worden, als beide
bekend zijn, op de cent aangesloten. Ontbrekende saldi zijn zichtbaar en vereisen
handmatige broncontrole. Ieder nieuw afschrift moet volledig worden bevestigd;
wijzigingen maken die bevestiging ongeldig. De leesresultaten en koppelvoorstellen
blijven tijdelijk tot **Facturen en bankkoppelingen verwerken**; de originele PDF
is dan al afzonderlijk opgeslagen.

Koppelvoorstellen gebruiken een exact factuurkenmerk met aansluitend bedrag, of
een wederzijds eenduidige klantnaam én bedrag. Alleen een gelijk bedrag is geen
voorstel. Dubbele/ambigue referenties en voorschotten blijven voor handmatige
beoordeling. Het overzicht ondersteunt één betaling voor meerdere facturen en
meerdere betalingen die samen één factuur voldoen. Factuurbedrag en bankbedrag
moeten volledig sluiten; onvolledige deelbetalingen blijven ongekoppeld beschikbaar
voor een later afschrift. Niet-gekoppelde bankmutaties worden geen extra omzet-
of kostenboekingen. Er wordt geen valuta omgerekend.

Identieke PDF's worden op hash herkend. Unieke banktransactie-ID's mogen niet dubbel
voorkomen. Mogelijk overlappende mutaties uit verschillende afschriften worden
geblokkeerd totdat de gebruiker ze met de bron heeft gecontroleerd en, alleen als
het afzonderlijke betalingen zijn, bewust vrijgeeft. Koppelingen naar al gebruikte
bankbetalingen zijn geblokkeerd. De validaties worden bij het verwerken opnieuw
uitgevoerd tegen de actuele administratie; alles wordt in één werkruimtemutatie
toegevoegd, met de bestaande revisiecontrole en herstelkopieën.

`bankStatements` bewaart de bevestigde mutaties, documentverwijzingen en
factuurkoppelingen. `bankPaymentIds` en `bankPayments` op de boekingsregels bewaren
de concrete betaalmomenten en bedragen, met een centvaste verdeling over btw-regels.
Het maandoverzicht gebruikt die echte ontvangstmomenten, ook over jaargrenzen.
Factuurdatum, omzet, btw en btw-periode blijven behouden. Financiële gegevens van
gekoppelde regels kunnen pas na ontkoppelen worden gewijzigd of verwijderd.
**Ontkoppel betaling en bijbehorende facturen** opent de volledige samenhangende
groep opnieuw; bron-PDF's, mutaties en andere boekingen blijven behouden.
