# PeakForm — Trainingstheorie

*De wetenschappelijke basis achter de berekeningen en wat ze betekenen voor je training*

---

## Het Fitness-Vermoeidheidsmodel

Alles in PeakForm is gebouwd op één centraal idee: training heeft twee gelijktijdige effecten op je lichaam. Het maakt je fitter, en het maakt je moe. Fitness bouwt langzaam op en verdwijnt langzaam. Vermoeidheid accumuleert snel en verdwijnt ook snel. Je prestatiepotentiaal op een gegeven dag is het verschil tussen die twee.

Dit idee is formeel beschreven door Eric Banister in 1975 in zijn "systems model of training for athletic performance". Banister gebruikte twee exponentiële vervalcurves met tegengestelde tekens: een positief fitheidseffect met een lange tijdconstante, en een negatief vermoeidheidseffect met een korte tijdconstante. Prestatie was gelijk aan fitness minus een gewogen vermoeidheid. Dit model is sindsdien meerdere keren empirisch gevalideerd, onder andere door Thierry Busso in de jaren negentig die het model verder verfijnde met variabele parameters.

De versie die in PeakForm wordt gebruikt is de vereenvoudiging van Andy Coggan, bekend als de Performance Management Chart. Coggan verwijderde de weegfactoren van het Banister-model en verving de integraalberekeningen door exponentieel gewogen voortschrijdende gemiddelden. Dit maakt het model minder exact maar veel praktischer te berekenen en te interpreteren. De drie resulterende metrics zijn ATL, CTL en TSB.

**ATL (Acute Training Load)** is het gewogen gemiddelde van je trainingsbelasting over de afgelopen 7 dagen. Het reageert snel op wat je recent hebt gedaan en representeert vermoeidheid. Een hoge ATL betekent dat je veel hebt getraind in de afgelopen week.

**CTL (Chronic Training Load)** is het gewogen gemiddelde over de afgelopen 42 dagen. Het verandert langzaam en representeert fitness. Een CTL van 70 betekent dat je gemiddeld 70 TSS per dag hebt getraind over de afgelopen zes weken. Hoe hoger je CTL, hoe meer trainingsbelasting je structureel aankan.

**TSB (Training Stress Balance)** is het verschil: CTL minus ATL. Een positieve TSB betekent dat je uitgeruster bent dan je fitheid rechtvaardigt, wat gunstig is op een racedag. Een negatieve TSB betekent dat vermoeidheid je fitheidsniveau overschrijdt, wat gebruikelijk is tijdens een zware trainingsperiode.

Een belangrijk voorbehoud: TSB overschrijdt in dit model nooit zijn startwaarde, wat een bekende wiskundige beperking is ten opzichte van het volledige Banister-model. De PMC is een proxy, geen perfecte voorspeller. Coggan erkent zelf dat de tijdconstanten van 7 en 42 dagen "nominale waarden gebaseerd op wetenschappelijke literatuur" zijn, niet individueel gevalideerde parameters. Gebruik ATL/CTL/TSB als trendvariabelen, niet als absolute drempelwaarden.

---

## Training Stress Score en FTP

TSS is de valuta van het systeem. Andrew Coggan en Hunter Allen definieerden Training Stress Score als de genormaliseerde macht gedeeld door FTP, in het kwadraat, vermenigvuldigd met de duur in uren en 100. Een uur rijden precies op je FTP geeft een TSS van 100. Een lichtere rit van twee uur geeft minder; een korte harde intervaltraining kan meer dan 100 geven.

FTP, het Functioneel Drempelvermogen, is het gemiddeld vermogen dat je theoretisch 60 minuten vol kunt houden. In de praktijk wordt het meestal bepaald als 95% van je gemiddeld vermogen over een 20-minutentest, of via andere protocollen. FTP is het ankerpunt van het systeem: alle zonegrenzen, alle TSS-berekeningen en alle trainingsintensiteiten zijn ervan afgeleid. Als je FTP verkeerd is, is alles wat ervan afhangt ook verkeerd.

PeakForm berekent FTP automatisch als de mediaan van de top-3 genormaliseerde vermogenswaarden uit je Strava-ritten van de afgelopen 60 dagen, vermenigvuldigd met 0.95. Dit is een pragmatische aanpak die goed werkt als je regelmatig intensieve ritten doet. Na periodes van ziekte of rust zal de berekende FTP te hoog uitvallen omdat de historische ritten zwaarder wegen dan je actuele conditie. Daarom heeft PeakForm een tijdsgewogen decay ingebouwd: ritten ouder dan 30 dagen wegen minder mee, ritten ouder dan 45 dagen nog minder.

---

## Trainingszones

De vijf zones in PeakForm zijn gebaseerd op Coggan's vermogenszones, vereenvoudigd van zijn originele zeven naar vijf voor praktisch gebruik.

Zone 1 (Actief herstel, 0-55% FTP) is zo licht dat het nauwelijks trainingseffect geeft. Gebruikt na zware trainingen of op hersteldays. Verhoogt doorbloeding zonder extra vermoeidheid te veroorzaken.

Zone 2 (Uithoudingsvermogen, 56-75% FTP) is het fundament van duursporten. Training in zone 2 verbetert de mitochondriale dichtheid, het vermogen van je spieren om vetten te oxideren, en de capillarisatie van spierweefsel. De aanpassingen gaan langzaam maar zijn duurzaam. Zone 2 is de reden waarom professionele wielrenners 70-80% van hun totale trainingstijd op lage intensiteit rijden.

Zone 3 (Tempo/Sweetspot, 76-90% FTP) is het gebied dat in de volksmond "sweetspot" wordt genoemd. Training hier geeft per tijdseenheid meer trainingseffect dan zone 2, maar kost ook meer hersteltijd. Sweetspot is bijzonder effectief voor tijdcrunched atleten: je kunt er significante fitnesswinst mee boeken in beperkte trainingstijd. Het nadeel is dat langdurig sweetspot-werk zonder voldoende recovery leidt tot chronische vermoeidheid die moeilijk te detecteren is.

Zone 4 (Drempel, 91-105% FTP) is de zone waar je FTP mee verbetert. Drempelintervals van 10-30 minuten verhogen de lactaatdrempel en vergroten je vermogen om aanhoudend hoog vermogen te produceren. Dit is de meest relevante zone voor een 40km tijdrit, waarbij je feitelijk een uur lang zo dicht mogelijk bij zone 4 rijdt.

Zone 5 (VO2max, 106-120% FTP) traint je maximale zuurstofopname. Kortere intervallen van 3-8 minuten op deze intensiteit verhogen je aerobe capaciteitslimiet. Het effect hiervan lekt naar beneden door in de gehele vermogenscurve: een hogere VO2max geeft ook meer ruimte voor verbetering van FTP en sweetspot-vermogen.

---

## Trainingsintensiteitsverdeling

Hoeveel tijd besteed je aan elke zone? Dit is een van de meest besproken en minst besliste vragen in de trainingswetenschappen.

Stephen Seiler beschreef in 2010 wat hij de "polarized" benadering noemde, waarbij elite duursporters circa 75% van hun trainingstijd in zone 1-2 en circa 15-20% in zone 4-5 doorbrachten, met minimale tijd in zone 3. Dit patroon werd geobserveerd bij elite langlaufers, roeiers en wielrenners. Het mechanisme is intuïtief: zone 3 is te intensief voor echte regeneratieve waarde, maar niet intensief genoeg voor de sterke adaptatieprikkel van zone 4-5. De term "no man's land" wordt in dit verband gebruikt.

De werkelijkheid is genuanceerder. Een systematische review op PubMed uit 2023 concludeert dat er geen bewijs beschikbaar is dat een specifiek periodiseringsmodel superieur is bij getrainde wielrenners. Zowel polarized als pyramidal (oplopend van laag naar hoog volume per intensiteitszone, dus meeste tijd in zone 1, daarna zone 2, dan zone 3, en minste in zone 4-5) zijn effectief. Bovendien: het patroon dat er "polarized" uitziet wanneer je sessiefrequentie telt, ziet er pyramidaal uit wanneer je trainingstijd telt. Veel van het debat is methodologisch van aard.

PeakForm hanteert een pyramidale verdeling, en dat is de juiste keuze voor jouw situatie. Polarized trainen werkt het best bij atleten met 10-25 trainingsuren per week die genoeg volume hebben voor betekenisvol zone 2-werk en tegelijkertijd intensieve zone 5-sessies kunnen absorberen. Als time-crunched atleet met een fulltime baan en een parallelle krachtroutine is zone 2-volume beperkt en moet je de uren die je hebt efficient inzetten. De streefverdeling per fase in PeakForm is:

Basisperiode: 80% Z1-Z2, 15% Z3, 5% Z4-Z5. Hier bouw je het fundament.
Buildperiode: 75% Z1-Z2, 20% Z3, 5% Z4-Z5. Meer sweetspot en drempelwerk.
Piekperiode: 65% Z1-Z2, 20% Z3, 15% Z4-Z5. Race-specifieke intensiteit.
Taperweken: zie het taperhoofdstuk hieronder.
Herstelweek: 100% Z1-Z2. Geen prikkels, alleen herstel.

Deze percentages zijn uitgedrukt in tijd, niet in sessiefrequentie.

---

## Periodisering: fasen, mesocycli en de 3:1 structuur

Periodisering is het systematisch variëren van trainingsbelasting over tijd om op het juiste moment piek-fitness te bereiken. Het concept gaat terug op de Sovjet-sportwetenschap van de jaren zestig (Matveyev), is verfijnd door Tudor Bompa, en is voor wielrennen gepopulariseerd door Joe Friel in zijn Cyclist's Training Bible.

Het fundamentele principe is progressieve overbelasting gevolgd door aanpassing. Je stress het lichaam, het herstelt en adapteert, je stress het opnieuw op een hoger niveau. Zonder voldoende herstel stapelt vermoeidheid zich op zonder de bijbehorende adaptatie; zonder voldoende belasting is er geen aanpassingsprikkel.

De mesocyclus van 4 weken is het basisblok. Drie weken oplopende belasting gevolgd door één herstelweek is het meest gebruikte en best onderbouwde belastingsparadigma in de periodiseringsliteratuur. De herstelweek is niet optioneel, het is het moment waarop de trainingsadaptaties consolideren. PeakForm berekent automatisch welke week van de lopende mesocyclus het is door terug te tellen vanaf de eventdatum. De vierde week van elke cyclus is altijd een herstelweek, ongeacht de trainingsphase.

De trainingsphase bepaalt het karakter van de belastingsweken. PeakForm onderscheidt vier fasen:

In de **basisperiode** (meer dan 8 weken voor het event) ligt de nadruk op het opbouwen van CTL via aerobe volume. Zone 2 is de primaire trainingsvorm. Dit is de periode waarin je de motor groter maakt voordat je hem sneller laat draaien. Een CTL-stijging van 5 tot 8 punten per week is wetenschappelijk onderbouwd als duurzame opbouwsnelheid. Joe Friel en Alan Couzens zijn hierover eensluidend: meer dan 10 punten per week is korte tijd mogelijk maar leidt bij langdurige toepassing tot overtraining, blessures of burnout.

In de **buildperiode** (4 tot 8 weken voor het event) verschuift de focus naar trainingsvormen die direct bijdragen aan tijdritvermogen. Voor een 40km flat TT zijn dat sweetspot- en drempelintervals. Je verhoogt de intensiteit terwijl het volume gematigd blijft. Dit is ook de fase waarin de specificiteit toeneemt: je training begint meer te lijken op de fysiologische eis van het event.

In de **piekperiode** (2 tot 4 weken voor het event) bereik je de hoogste trainingsspecificiteit. VO2max-prikkels, race-pace intervallen, en race-simulaties zijn de kernonderdelen. Het volume begint af te nemen maar de intensiteit blijft hoog. CTL-opbouw is hier niet meer het doel; de focus verschuift naar kwaliteit per sessie.

De **taperperiode** beslaat de laatste twee weken en wordt in het volgende hoofdstuk apart behandeld.

---

## Tapering: de kunst van het aftapereren

Tapering is het systematisch reduceren van trainingsbelasting in de aanloop naar een event, zodat je op de startdag zowel fit als fris bent. Het is het moment waarop weken of maanden van opgebouwde vermoeidheid worden weggewerkt terwijl fitness nagenoeg intact blijft.

Een systematische review en meta-analyse (Bosquet et al., meerdere keren gerepliceerd) concludeert dat een taper van maximaal 21 dagen met 41-60% volumereductie, waarbij trainingsintensiteit en -frequentie worden gehandhaafd, een effectieve strategie is voor duursporters. Het cruciale inzicht is dat je volume reduceert, niet intensiteit. Als je je drempelintervals inkort maar de wattages gelijk houdt, behoud je de trainingsaanpassing terwijl je minder vermoeidheid genereert.

Een vaak gemaakte fout is de progressieve taper waarbij je langzaam minder gaat doen. Onderzoek wijst uit dat de betere resultaten worden bereikt door het volume aan het begin van de taper snel te halveren en dat niveau vervolgens aan te houden. Dit klinkt contra-intuïtief maar de fysiologische logica is helder: acute vermoeidheid verdwijnt snel, fitness verdwijnt langzaam. Door vroeg te reduceren geef je vermoeidheid maximaal de tijd om te zakken, terwijl fitness amper afneemt in 2 weken.

Voor een 40km tijdrit is een taper van 2 weken wetenschappelijk adequaat. In PeakForm werkt de taper als volgt:

**Week T-2 (twee weken voor het event)**: totale trainingstijd met 50% reduceren. Werkblokken behouden dezelfde wattages maar worden in duur gehalveerd. Een sessie van 2x20 minuten drempel wordt 2x10 minuten op exact dezelfde wattages. TSS-doelstelling voor de week: 50% van normaal.

**Week T-1 (raceweek)**: totale trainingstijd met 70% reduceren ten opzichte van normale week. Één of twee korte activatiesessies van maximaal 60 minuten totaal. Elke sessie bevat een lange warming-up in Z2, twee tot drie korte scherpe werkblokken van 3-5 minuten in Z4, en een cooling-down. Het doel is neuromusculaire activatie, niet fitness. TSS-doelstelling: 30% van normaal.

Op racedag wil je een TSB tussen +5 en +25. Dit is de zone waar je voldoende hersteld bent voor een piekprestatie zonder dat je fitness heeft afgenomen door te lang niets te doen.

---

## Concurrent training: fietsen en krachttraining combineren

Het interferentie-effect is het fenomeen waarbij gelijktijdige kracht- en duurtraining tot suboptimale aanpassingen leidt vergeleken met uitsluitend kracht- of uitsluitend duurtraining. Het werd voor het eerst experimenteel beschreven door Hickson in 1980 en is sindsdien uitgebreid onderzocht.

De mechanistische verklaring is dat duurtraining en krachtraining deels conflicterende celulaire signaleringsroutes activeren. AMPK, een energiesensor die actief is bij langdurige aerobe inspanning, remt mTOR, de centrale regulator van eiwitaanmaak en spierhypertrofie. Wanneer je te kort na een intensieve duurtraining met gewichten traint, is mTOR nog onderdrukt en is de signaleringsomgeving voor krachtaanpassing suboptimaal.

In de praktijk valt het mee, zeker voor jouw situatie. Een meta-analyse van Schumann et al. (2022) en een systematische review van Wilson et al. (2012) tonen dat het interferentie-effect beheersbaar is wanneer je de volgende principes toepast.

Interferentie is modaliteitsspecifiek, en dat is het scherpste onderscheid dat de literatuur biedt. Wilson et al. (2012) vonden dat krachttraining gecombineerd met hardlopen wel significante verliezen op hypertrofie en kracht gaf, en gecombineerd met fietsen niet. Een latere meta-analyse op vezelniveau (Sports Medicine, 2022) bevestigt dit richtingsgewijs: een significant negatief effect op type I-vezelhypertrofie bij hardlopen, niet bij fietsen. De verklaring is de excentrische component: hardlopen belast meer spiergroepen en veroorzaakt meer spierschade bij gelijke belasting. PeakForm hanteert daarom een interferentieweging waarin hardlopen ongeveer anderhalf tot twee keer zo zwaar weegt als fietsen bij gelijke belasting richting beenkracht en hypertrofie. Die factor is een expliciete schatting: de literatuur levert effectgroottes en een richting, geen exacte vermenigvuldiger, en nieuwere meta-analyses uit 2021 en 2022 laten zien dat het effect kleiner is dan lang werd aangenomen mits het goed gemanaged wordt.

Kortere aerobe sessies (30-40 minuten) geven minder interferentie dan langere (meer dan 50-60 minuten). Dit suggereert dat een herstelrit van 45 minuten na een krachtsessie nauwelijks interferentie geeft, terwijl een lange drempelsessie van 90 minuten dat wel doet.

De scheiding tussen beide sessies bepaalt hoeveel interferentie overblijft. Robineau et al. (2016) vergeleken scheidingen van nul, zes en 24 uur en vonden alleen bij uitvoering binnen dezelfde sessie een negatief effect op krachtwinst; zes uur was beter dan nul en 24 uur beter dan zes. De eerder in dit document gehanteerde vuistregel van drie uur is daarmee niet houdbaar: drie uur is geen gemeten drempel en de suggestie dat daarmee nagenoeg alle interferentie verdwijnt gaat verder dan het bewijs. PeakForm hanteert zes uur als ondergrens en 24 uur als voorkeur tussen een zware beensessie en duurtraining, met hardlopen strenger dan fietsen. Bij dezelfde dag geldt: kracht eerst, duurtraining daarna, als kracht of hypertrofie de prioriteit heeft. Robineau vond het effect bovendien duidelijker bij getrainde dan bij ongetrainde atleten, wat aansluit bij het werk van Coffey en Hawley: hoe beter getraind, hoe kleiner de marge en hoe belangrijker de scheiding.

PeakForm vertaalt dit naar concrete planningsregels. De dag van een beentraining en de dag erna zijn alleen geschikt voor Z2 herstelritten. Op de eerste dag na een beendag is ook sweetspot (Z3) nog niet optimaal; dat kan vanaf 48 uur na de beensessie. Push- en pulldagen kennen geen beperking voor fietsintensiteit.

Belangrijk: dit zijn regels voor het optimaliseren van krachtaanpassingen. Als je cycling de prioriteit geeft (wat het geval is in de aanloop naar het event), mag je de regel voor jezelf omdraaien: plan intense fietssessies op de meest gunstige dagen en pas je PPL-volgorde daaraan aan. PeakForm kan dit ook suggereren op basis van je beschikbaarheid.

---

## Hardlopen: het intensiteitsanker

Alles wat op de fiets aan FTP hangt, hangt bij hardlopen aan een anker dat je apart moet bepalen. Zonder dat anker is er geen zone, geen IF en geen rTSS, en valt de belastingsberekening terug op hartslag. Er zijn drie kandidaten en ze zijn niet gelijkwaardig.

Drempeltempo, ook wel threshold pace of rFTPa, is het tempo dat je ongeveer een uur kunt volhouden. Je bepaalt het met een solo tijdrit van 30 minuten op vlak parcours of baan, na een inloop van een kwartier met enkele versnellingen, waarbij het gemiddelde tempo over de volle 30 minuten je drempeltempo benadert. De variant uit het 80/20-raamwerk gebruikt 20 minuten en neemt daar 95 procent van, precies zoals de fiets-FTP-test. Prestaties over 30 tot 60 minuten correleren het sterkst met de lactaatdrempel uit het lab, en voor niet-elite lopers ligt het drempeltempo dicht bij het tempo van een halve marathon of vijftien kilometer. Wie geen test wil doen kan het afleiden uit een recente wedstrijd. Het is direct meetbaar, onafhankelijk van hitte en hydratatie, en werkt op elk niveau. Dit is het primaire anker van PeakForm.

Critical speed is fysiologisch beter gedefinieerd dan drempeltempo, want het markeert de grens tussen het zware en het extreem zware domein in plaats van een prestatieproxy. Je bepaalt het met drie tot vijf maximale tijdritten over verschillende afstanden en een lineaire regressie van afstand tegen tijd, of met een drie minuten all-out test waarbij de gemiddelde snelheid over de laatste 30 seconden de critical speed is. De prijs is dat je meerdere maximale inspanningen moet leveren, wat het ongeschikt maakt als standaard voor beginners. Het is een optionele geavanceerde laag, geen vervanging van het drempeltempo.

Lactaatdrempel-hartslag is de terugval. Je meet het in dezelfde 30 minuten tijdrit, waarbij het gemiddelde over de laatste 20 minuten je LTHR is. Het voordeel is dat LTHR over een seizoen nauwelijks verschuift terwijl het tempo op die hartslag wel verbetert, wat het bruikbaar maakt als validatie. Het nadeel is dat hartslag traag reageert bij korte intervallen en gevoelig is voor hitte, hydratatie, slaap en cafeïne, en dat hij binnen enkele slagen per minuut afwijkt van buiten. Voor sturing op lage intensiteit en voor decoupling is LTHR uitstekend; voor korte harde blokken is hij ongeschikt.

PeakForm slaat het drempeltempo op in seconden per kilometer. De drempelsnelheid volgt daaruit als duizend gedeeld door het drempeltempo, en die snelheid is voor hardlopen wat FTP voor de fiets is: als hij verkeerd staat, is alles wat eruit volgt verkeerd. Herhaal de test elke vier tot zes weken, en houd baan en weg gescheiden van trail, want ondergrond en hoogte verschuiven de waarde.

---

## Hardloopzones en de koppeling met de fietsanalyse

De zones voor hardlopen zijn uitgedrukt als percentage van de drempelsnelheid, in dezelfde vijf-zone-structuur als de fiets, plus een zesde zone voor herhalingswerk boven het aerobe domein. De grenzen zijn afgeleid van Daniels' banden in procenten van de snelheid bij VO2max, omgerekend met de drempel op ongeveer 88 procent van die snelheid als honderd-procent-anker, en gekruist met de gepubliceerde bandbreedtes van Friel en TrainingPeaks.

| Zone | Naam | Percentage drempelsnelheid | Daniels | Seiler-band |
|---|---|---|---|---|
| Z1 | Herstel | onder 72% | E traag | laag |
| Z2 | Duur | 72 tot 83% | E tot M | laag |
| Z3 | Tempo/marathon | 83 tot 95% | M tot lage T | matig |
| Z4 | Drempel | 95 tot 102% | T | matig tot hoog |
| Z5 | VO2max | 102 tot 114% | I | hoog |
| Z6 | Herhaling | boven 114% | R | hoog |

De koppeling met het Seiler-drie-zone-model is wat hardlopen en fietsen in één trainingsintensiteitsverdeling laat vallen. Zonder die koppeling zou je twee onvergelijkbare zonestelsels naast elkaar hebben en zou de vraag of een week polarized of pyramidaal is niet te beantwoorden zijn zodra er gelopen wordt. De veldankers komen uit een studie onder 1411 duurlopers: de eerste drempel ligt op ongeveer 74 procent van de snelheid bij VO2peak met een spreiding van ruim vijf procent, de tweede op ongeveer 88 procent met een spreiding van vier procent. Vertaald naar drempelsnelheid vallen Z1 en Z2 in de lage Seiler-band, valt Z3 met de onderkant van Z4 in de matige band, en vallen de bovenkant van Z4, Z5 en Z6 in de hoge band. Dat is dezelfde logica als bij de fiets, waar Z1 en Z2 laag zijn, Z3 en sweetspot matig, en de bovenkant van Z4 met Z5 hoog. Loop-TSS en fiets-TSS blijven daarmee optelbaar binnen de intensiteitsverdeling, in tegenstelling tot krachtbelasting, die op het Foster-kanaal blijft en nooit bij Coggan-TSS wordt opgeteld.

---

## Hardloopbelasting: rTSS, NGP en decoupling

De belastingsformule is identiek aan die van de fiets. rTSS is de duur in uren maal de intensiteitsfactor in het kwadraat maal honderd, waarbij de intensiteitsfactor de genormaliseerde hellinggecorrigeerde snelheid gedeeld door de drempelsnelheid is. Een uur precies op drempeltempo geeft honderd, net als een uur op FTP.

De coëfficiënten zijn echter niet die van de fiets, en dat is de belangrijkste val in dit hoofdstuk. Bij de fiets is IF een fractie van drempelvermogen, bij hardlopen een fractie van drempelsnelheid. Vermogensratio's comprimeren veel sterker dan snelheidsratio's: fiets-Z1 zit op de helft van FTP, terwijl rustig hardlopen op 72 tot 84 procent van de drempelsnelheid zit. Wie de fietstabel kopieert onderschat loop-rTSS structureel. Dat is niet alleen rekenkundig fout maar ook fysiologisch, want rustig hardlopen kost metabool en mechanisch meer dan rustig fietsen en hoort dus terecht meer belasting per uur op te bouwen.

| Zone | IF voor planning | rTSS per uur |
|---|---|---|
| Z1 Herstel | 0.70 | 49 |
| Z2 Duur | 0.78 | 61 |
| Z3 Tempo | 0.90 | 81 |
| Z4 Drempel | 1.00 | 100 |
| Z5 VO2max | 1.10 | 121 |
| Z6 Herhaling | 1.20 | 144 |

Deze coëfficiënten zijn een afgeleide synthese, geen gepubliceerde tabel. Daniels publiceert banden in procenten van de snelheid bij VO2max, TrainingPeaks en Friel publiceren IF-bandbreedtes per sessietype, en de 80/20-pace-percentages zijn deels niet openbaar. De middens hierboven zijn conservatief gekozen zodat geplande belasting reproduceerbaar is, en ze zijn gevoelig voor het gekozen drempelanker: verschuif de drempel van 88 naar 86 procent van de snelheid bij VO2max en Z5 en Z6 schuiven enkele procenten mee. Behandel ze als kalibreerbare parameters, niet als natuurconstanten, en toets ze tegen echte data zodra er genoeg loopsessies zijn.

De hellingcorrectie rust op Minetti et al. (2002), die de energiekost van hardlopen maten op hellingen van min 45 tot plus 45 procent. Op vlak terrein kost hardlopen ongeveer 3,40 joule per kilogram per meter, onafhankelijk van de snelheid. Bergop loopt dat op tot bijna 19 joule bij 45 procent stijging. Bergaf daalt het naar een minimum van ongeveer 1,73 joule rond min 20 procent, om daarna weer te stijgen tot 3,92 joule bij min 45 procent, omdat het excentrisch remmen dan zelf energie kost. Dat niet-lineaire verband met een minimum rond min tien tot min twintig procent is de juiste basis voor grade adjustment, en het is precies de reden waarom een vlakke correctiefactor per hoogtemeter niet werkt. Op technisch of zeer steil terrein wordt de genormaliseerde snelheid onbetrouwbaar en is terugvallen op hartslagbelasting verstandiger.

Aerobic decoupling voor hardlopen is de tegenhanger van Pw:HR op de fiets en heet Pa:HR. Je vergelijkt de efficiëntiefactor, genormaliseerde snelheid gedeeld door hartslag, tussen de eerste en de tweede helft van een gelijkmatige aerobe duurloop. Onder vijf procent is de aerobe basis goed voor die duur en intensiteit, tussen vijf en tien procent is hij in ontwikkeling, en boven tien procent is er iets mis: te hard gestart, onvoldoende basis, of hitte en dehydratie. De maat is alleen zinvol bij inspanningen langer dan ongeveer twintig minuten op gelijkmatige intensiteit onder de eerste drempel. Consistent onder vijf procent is het signaal dat de basisfase klaar is en dat er ruimte is voor meer werk in de hoge band.

---

## Critical speed en D'

Critical speed en D' zijn voor hardlopen wat critical power en W' voor de fiets zijn. Critical speed is de asymptoot van het verband tussen snelheid en volhoudtijd, D' is de eindige afstandscapaciteit boven die snelheid, uitgedrukt in meters. Je fit ze met een lineaire regressie van afstand tegen tijd over drie tot vijf maximale inspanningen tussen ongeveer twee en vijftien minuten: de helling is critical speed, het snijpunt is D'. Voor getrainde lopers ligt D' typisch tussen 150 en 450 meter, waarbij snelheidstypes hoger zitten en marathonspecialisten lager maar met een hogere critical speed. Duurtraining verhoogt critical speed en verlaagt D'.

Twee waarschuwingen. De drie minuten all-out test is valide voor critical speed maar niet voor D': de meetfout op D' uit die test is groter dan tien procent, dus wie D' serieus wil gebruiken moet meerdere tijdritten doen. En de interpretatie van D' als zuivere anaerobe energievoorraad is empirisch weerlegd, want extra zuurstof verhoogt zowel critical speed als D'. Behandel D' als een capaciteitsparameter van het model, niet als een fysiologisch potje.

Voor wedstrijdvoorspelling, intervalvoorschriften en balansbewaking tijdens de sessie is het model uitstekend, maar het is een laag voor gevorderden. Voor beginners is het te belastend en levert het te weinig op om de testkosten te rechtvaardigen.

---

## Excentrische belasting en spierschade

De excentrische component is waarom hardlopen anders is dan fietsen, en bergaf lopen is daarvan de zuiverste vorm. De spier verlengt onder belasting tijdens het remmen, wat ultrastructurele schade geeft, spierpijn, verhoogd creatinekinase en krachtverlies. In één studie daalde het isometrische piekkoppel van de kniestrekkers met ruim 36 procent direct na dertig minuten afdalen op vijftien procent helling, met volledig herstel na 48 uur bij getrainde proefpersonen. Bij ongetrainden of na langer en intensiever afdalen kan het verlies van functie en loopeconomie tot ongeveer vijf dagen aanhouden.

Er is een gunstig mechanisme dat repeated bout effect heet: één eerdere afdaalsessie beschermt tegen de volgende, met minder spierpijn, minder creatinekinase en minder krachtverlies. Geleidelijke gewenning aan excentrisch werk is dus zelf de bescherming, en dat pleit tegen het volledig vermijden van afdalingen.

Wat níet werkt is wat vaak wordt geadviseerd. Een studie die staplengte en cadans met acht procent aanpaste bij constante snelheid vond geen significant effect op spierpijn, creatinekinase of krachtverlies bij afdalen. Cadansoptimalisatie is dus geen geloofwaardige mitigatie; het volume, de steilheid en de snelheid van de afdaling zijn de dominante factoren.

PeakForm schaalt daarom de excentrische belasting met het negatieve hoogteverschil, de steilheid van de afdaling en het totale loopvolume, en koppelt een hoge score aan een langere hersteltijd en aan een zwaardere interferentiepenalty richting beentraining. Een sessie met veel afdaling of een ongewend hoog loopvolume vraagt minimaal 48 uur voordat een zware beensessie zinvol is.

---

## Hardloopvolume en blessurepreventie

De tien-procent-regel voor wekelijkse volumetoename is een vuistregel met een zwakke bewijsbasis. De richting klopt, geleidelijk is veiliger dan sprongsgewijs, maar het getal is te conservatief voor iemand die weinig loopt en te ruim voor iemand die veel loopt of terugkomt van een blessure.

De acute-chronische belastingsratio van Gabbett is beter onderbouwd maar zelf ook omstreden. De veilige band ligt tussen 0,8 en 1,3, en boven 1,5 is het blessurerisico twee tot vier keer verhoogd. De belangrijkste inzicht erachter is de trainingsparadox: een hoge chronische belasting die geleidelijk is opgebouwd beschermt juist tegen blessures. De kritiek richt zich op omgekeerde causaliteit en methodologie.

Een grote prospectieve studie uit 2025 onder 5205 lopers uit 87 landen en ruim 588.000 sessies zet daar een scherpe kanttekening bij. De ratio over een week tot drie weken voorspelde in die data geen verhoogd risico, terwijl de sprong van één enkele sessie ten opzichte van de langste loop in de laatste dertig dagen dat wel deed. Een sprong van tien tot dertig procent gaf 64 procent meer risico, dertig tot honderd procent gaf 52 procent meer, en meer dan verdubbelen gaf een risicoverhouding van 2,28. De praktische conclusie is dat de individuele sessie belangrijker is dan het weektotaal, en dat PeakForm beide moet bewaken: de ratio als richtlijn, en de sprong van de enkele lange loop als harde grens. Volume en intensiteit gaan bovendien nooit tegelijk omhoog.

Voor beginners en lage weekvolumes geldt strengere geleidelijkheid, voor gevorderden met een hoge chronische belasting zijn grotere absolute sprongen verdedigbaar, maar juist na een onderbreking is voorzichtig terugkeren belangrijker dan het absolute niveau.

---

## Intensiteitsverdeling en periodisering per atleetsituatie

Er is geen verdeling die voor iedereen optimaal is, en dat is geen zwakte van de theorie maar de kern ervan. Wat PeakForm moet garanderen is dat er voor elke atleetsituatie een passende, onderbouwde aanpak beschikbaar is, en dat de verdeling meebeweegt met tijdsbudget, niveau, doeltype en de vraag welke discipline prioriteit heeft.

De harde bewijzen liggen als volgt. Stöggl en Sperlich lieten in 2014 in een gerandomiseerde studie onder 48 goedgetrainde atleten over negen weken zien dat een gepolariseerde verdeling de grootste winst gaf, met bijna twaalf procent hogere VO2peak en ruim zeventien procent langere tijd tot uitputting, terwijl drempeltraining en puur hoog volume geen verdere winst opleverden bij deze groep. Kenneally en collega's vonden in hun reviews dat goedgetrainde en elite midden- en langeafstandslopers overwegend pyramidaal trainen, met veel werk in de lage band, minder in de matige en weinig in de hoge, en dat de verdeling richting het wedstrijdseizoen polariseert. Bij marathonlopers is pyramidaal dominant, en de prevalentie stijgt met het niveau. Muñoz en Seiler vonden bij recreatieve lopers over tien weken vijf procent verbetering op tien kilometer bij een gepolariseerde verdeling tegen 3,5 procent bij drempeltraining, en in de subgroep die de verdeling ook echt uitvoerde liep dat verschil op naar zeven tegen 1,6 procent.

Daaruit volgen de profielen die PeakForm hanteert. Wie weinig tijd heeft, ongeveer vier tot zes uur per week, kan zich strikt polariseren niet veroorloven omdat de lage band dan te weinig absolute uren oplevert; een pyramidale of licht drempelgerichte verdeling is dan efficiënter. Wie twaalf uur of meer traint, bouwt pyramidaal in de basisfase en polariseert in de buildfase, met ongeveer tachtig procent in de lage band. Voor een beginner is de verdeling ondergeschikt aan consistentie en geleidelijke volumeopbouw, en is interferentie verwaarloosbaar of zelfs versterkend. Voor vijf en tien kilometer verschuift het accent naar Z4 en Z5, voor de halve en hele marathon naar de matige band met marathon- en drempelwerk. Wie hardloopt als tweede sport naast de fiets houdt het loopvolume laag met een hoog aandeel in de lage band en enkele gerichte kwaliteitssessies, precies om de excentrische belasting en de interferentie met kracht te beperken.

De onderhoudsdosis verdient aparte aandacht, want die maakt combineren mogelijk. Spiering en collega's lieten in 2021 zien dat duurprestatie tot ongeveer vijftien weken te behouden is met twee sessies per week of een volumereductie van een derde tot twee derde, en kracht tot ongeveer 32 weken met één sessie per week, mits in beide gevallen de intensiteit of de relatieve belasting behouden blijft. Intensiteit is de variabele die je nooit weggooit; volume en frequentie zijn onderhandelbaar. Dat is de sleutel voor iedere atleet die drie disciplines in een beperkte week moet passen, en het is de reden waarom een onderhoudsblok geen verkapte rustperiode is.

---

## Readiness Score

De readiness score in PeakForm is een samengestelde waarde van 0 tot 100 die probeert te beantwoorden: hoe klaar ben je om vandaag te trainen? Ze combineert zes componenten, elk met een eigen gewicht.

TSB (Training Stress Balance) vormt de kern. Een TSB van 0 is neutraal, positieve waarden zijn gunstig, sterk negatieve waarden duiden op accumulerende vermoeidheid. De component wordt genormaliseerd op een range van typische waarden voor de atleet.

ACWR (Acute:Chronic Workload Ratio) is de verhouding van ATL tot CTL. Een ACWR van 1.0 betekent dat je recent evenveel traint als je chronisch gewend bent. Waarden boven 1.3-1.5 zijn in de blessure-literatuur geassocieerd met verhoogd risico (Gabbett 2016), al zijn er statistische bezwaren tegen dit model aangedragen door Impellizzeri (2020). PeakForm gebruikt het als trendindicator, niet als absolute drempel.

Monotony en loadSlope meten de variabiliteit van je trainingsbelasting over de afgelopen week respectievelijk de richting van je CTL-curve. Hoge monotony (weinig variatie in dagelijkse belasting) is geassocieerd met verhoogd overtrainingrisico (Foster 1998). Een stijgende CTL-curve zonder dalende periodes is een vroeg signaal van accumulerende vermoeidheid.

De nutrition-component beoordeelt de volledigheid van je voedingsinvoer de afgelopen 7 dagen. Incomplete data geeft een neutrale score, geen lage; het systeem kan niet concluderen dat je slecht eet als er geen data is.

SleepScore beoordeelt de slaap van de afgelopen nacht op basis van uren en subjectieve kwaliteit. Slaap is de sterkste enkelvoudige predictor van dagelijkse prestatie-bereidheid en verantwoordelijk voor 20% van de totale readiness.

StrengthFatigue is de meest experimentele component. Hij beoordeelt de belasting van je krachtsessies de afgelopen 48-72 uur op spiergroepniveau. De onderliggende ETL-formule (Estimated Training Load voor kracht) is een eigen construct zonder directe literatuurbasis, bedoeld als relatieve indicator. Interpreteer deze component als "zijn er spiergroepen die nog niet hersteld zijn", niet als absolute vermoeidheidswaarde.

---

## e1RM en krachtprogressie

De 1RM (one-repetition maximum) is het maximale gewicht dat je eenmalig kunt heffen. Het direct testen van 1RM bij elke oefening is tijdrovend en vermoeiend, dus PeakForm schat het via een predictieformule op basis van submaximale sets.

Voor sets van 10 herhalingen of minder gebruikt PeakForm de Epley-formule (1985): 1RM = gewicht × (1 + herhalingen/30). Voor sets van meer dan 10 herhalingen wordt het gemiddelde genomen van Epley en de Brzycki-formule (1993): 1RM = gewicht / (1.0278 - 0.0278 × herhalingen). Epley overschat bij hoge rep ranges; Brzycki compenseert dit gedeeltelijk. Het gemiddelde van beide is een robuustere schatting.

e1RM-trends over tijd zijn de meest directe indicator van krachtprogressie in het systeem. Een stijgende trend over 4-8 weken voor een oefening toont aan dat de training werkt. Stagnatie of daling signaleert dat aanpassing nodig is in volume, intensiteit, of herstel.

---

## W'bal en Critical Power

W'bal (uitgesproken als "W prime balance") is een real-time meting van je anaerobe capaciteitsstatus tijdens een fietsrit. Het model is ontwikkeld door Philip Skiba (2015) en is gebaseerd op het Critical Power model.

Critical Power (CP) is het hoogste vermogen dat je theoretisch onbeperkt lang kunt produceren zonder te falen. In de praktijk is het vergelijkbaar met maar iets lager dan FTP. W' (W prime) is je anaerobe werkcapaciteit: een beperkte hoeveelheid energie die beschikbaar is voor inspanning boven CP, gemeten in kilojoules.

Wanneer je boven CP rijdt, wordt W' aangesproken. Wanneer je onder CP rijdt, vult W' zich exponentieel aan met een tijdconstante die afhankelijk is van hoe ver je onder CP zit. Als W'bal nul bereikt, kun je geen vermogen meer produceren boven CP.

Voor een 40km tijdrit is W'bal relevant bij kortere klimmetjes, windstoten of startversnellingen. De wetenschap achter het model is solide voor inspanningen die CP/W' zuiver testen; bij echte ritten met variabel terrein en pace zijn er praktische beperkingen. Gebruik W'bal als indicator van anaerobe inspanning per rit, niet als absolute grens.

---

## Wat dit betekent voor je dagelijkse training

De theorie hierboven vertaalt zich naar een handvol praktische vuistregels die PeakForm in zijn aanbevelingen volgt.

CTL is je trainingsgewicht. Zoals je niet van 100 kilo naar 200 kilo bankdrukken gaat in een week, ga je niet van CTL 30 naar CTL 60 in een maand. Een stijging van 5-8 punten per week is de grens waarbinnen je structureel kunt opbouwen. Daarboven loop je risico op blessures, ziekte of burnout die je weken terugzetten.

Elke vierde week is een herstelweek. Niet omdat het gezellig is, maar omdat dat het moment is waarop je lichaam de trainingsadaptaties consolideert. Herstelweken weggooien om "door te trainen" levert minder adaptatie op, niet meer.

Intensiteit is een eindig goed. Elke harde sessie kost herstelcapaciteit. Sweetspot en drempelwerk zijn duurder dan zone 2, VO2max-intervallen zijn het duurst. Als je ook serieus aan kracht werkt, is er minder herstelcapaciteit beschikbaar voor hoge fietsintensiteit. Dit is geen reden om minder hard te trainen, maar wel een reden om de planning serieus te nemen.

Slaap is geen bonus. Het is de primaire herstelmodule. Een nacht van 6 uur in plaats van 8 uur verlaagt je readiness significant en compomitteert de trainingsrespons van de sessie die erop volgt. Geen supplement, strategie of extra trainingsvolume compenseert structureel slaaptekort.

De feedbacklus is het slimste onderdeel van het systeem. PeakForm weet niet hoe je je voelt, maar weet wel wat je hebt gedaan versus wat gepland stond, en past de rest van de week daarop aan. Dit maakt het plan adaptief: het reageert op realiteit in plaats van blind een schema te volgen dat vier weken geleden werd gegenereerd.

---

## Bronnen en literatuur

Banister, E.W. (1975). A systems model of training for athletic performance. *Australian Journal of Sports Medicine.*

Coggan, A., Allen, H. (2010). *Training and Racing with a Power Meter.* VeloPress.

Busso, T. (2003). Variable dose-response relationship between exercise training and performance. *Medicine & Science in Sports & Exercise.*

Seiler, S. (2010). What is best practice for training intensity and duration distribution in endurance athletes? *International Journal of Sports Physiology and Performance.*

Gabbett, T.J. (2016). The training-injury prevention paradox. *British Journal of Sports Medicine.*

Impellizzeri, F.M. et al. (2020). Internal and external training load: 15 years on. *International Journal of Sports Physiology and Performance.*

Bosquet, L. et al. (2007). Effects of tapering on performance: a meta-analysis. *Medicine & Science in Sports & Exercise.*

Skiba, P.F. et al. (2015). Modeling the expenditure and reconstitution of work capacity above critical power. *Medicine & Science in Sports & Exercise.*

Hickson, R.C. (1980). Interference of strength development by simultaneously training for strength and endurance. *European Journal of Applied Physiology.*

Wilson, J.M. et al. (2012). Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises. *Journal of Strength and Conditioning Research.*

Schumann, M. et al. (2022). Compatibility of concurrent aerobic and strength training for skeletal muscle size and function. *European Journal of Sport Science.*

Epley, B. (1985). Poundage chart. In: *Boyd Epley Workout.* Body Enterprises.

Brzycki, M. (1993). Strength testing: predicting a one-rep max from reps-to-fatigue. *Journal of Physical Education, Recreation & Dance.*

Foster, C. et al. (1998). A new approach to monitoring exercise training. *Journal of Strength and Conditioning Research.*

Friel, J. (2012). *The Cyclist's Training Bible.* VeloPress.

Daniels, J. (2013). *Daniels' Running Formula*, 3e editie. Human Kinetics.

Minetti, A.E. et al. (2002). Energy cost of walking and running at extreme uphill and downhill slopes. *Journal of Applied Physiology.*

McGregor, S. / TrainingPeaks. Normalized Graded Pace, running Training Stress Score en Intensity Factor.

Jones, A.M., Vanhatalo, A., Poole, D.C. Critical power en critical speed: het zware en extreem zware domein.

Vanhatalo, A., Doust, J.H., Burnley, M. (2007). Determination of critical power using a 3-min all-out cycling test. *Medicine & Science in Sports & Exercise.*

Robineau, J. et al. (2016). Specific training effects of concurrent aerobic and strength exercises depend on recovery duration. *Journal of Strength and Conditioning Research.*

Coffey, V.G. & Hawley, J.A. Concurrent exercise training: moleculaire interferentie en trainingsstatus.

Frandsen, J. et al. (2025). Single-session running distance spikes and injury risk (Garmin RunSafe). *British Journal of Sports Medicine.*

Stoggl, T. & Sperlich, B. (2014). Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training. *Frontiers in Physiology.*

Kenneally, M., Casado, A., Santos-Concejero, J. (2018, 2022). Training intensity distribution en periodisering bij midden- en langeafstandslopers. *International Journal of Sports Physiology and Performance.*

Munoz, I., Seiler, S. et al. (2014). Does polarized training improve performance in recreational runners? *International Journal of Sports Physiology and Performance.*

Spiering, B.A., Mujika, I. et al. (2021). Maintaining physical performance: the minimal dose of exercise needed to preserve endurance and strength over time. *Journal of Strength and Conditioning Research.*

Fitzgerald, M. & Warden, D. (2014). *80/20 Running.* NAL / 80/20 Endurance.

Pubmed systematische review periodisering bij wielrenners: Lorenz, D.S. & Morrison, S. (2015); Varamenti, E.I. et al. (2023). *Journal of Strength and Conditioning Research.*
