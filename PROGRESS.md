# PeakForm voortgang

Statusoverzicht van alle handoff-clusters.

## Nu

Maximaal drie items. Dit is de enige plek waar prioriteit staat; alle andere secties
zijn statusinventaris en zeggen niets over volgorde.

1. C5h session_outcomes multimodaal: strava_id is BIGINT, geen Hevy-workout-id (na: C5g, klaar). Ontgrendelt C5c.
2. C7 Reviewcadans (na: C2b, klaar). Ontgrendelt C9.
3. R10 Drempeltempo-historisering (na: R9, klaar). Ontgrendelt C6.

## Legenda

Statussen: `[ ]` open, `[~]` deels, `[x]` klaar, `[!]` wacht op beslissing of
verificatie door Pieter. Datum achter elke statuswijziging.

`(na: X)` betekent dat X afgerond moet zijn voordat dit item start. De omgekeerde
richting wordt bewust niet geannoteerd: gebruik `grep "na:.*C2b" PROGRESS.md` om te
zien wat een item vrijspeelt. Twee richtingen onderhouden loopt uit de pas.

Regels voor wie dit bestand bijwerkt:
- Elke commit die een item (deels) uitvoert werkt de bijbehorende regel bij in
  dezelfde commit: status en datum.
- Een statusregel blijft een regel. Bevindingen, vervolgfixes en afwegingen gaan
  naar de Besluitlog, niet achter de statusregel.
- Blijkt tijdens uitvoering dat een `(na: ...)` niet klopt of dat een nieuw item
  nodig is: schrijf een besluitlogregel, pas de annotatie aan, en STOP.
- De sectie "Nu" is een afgeleide weergave, geen oordeel, en loopt mee in dezelfde
  commit als elke statuswijziging. Afleiding, in deze volgorde: verwijder items die
  op `[x]` staan; vul aan tot maximaal drie met open items (`[ ]` of `[~]`) uit de
  secties gemarkeerd als "actief traject" waarvan elke `(na: ...)` op `[x]` staat;
  sorteer aflopend op het aantal items dat ze vrijspelen
  (`grep -c "na:.*<id>" PROGRESS.md`), bij gelijkstand op cluster-ID. Eén regel
  motivering per item; bevindingen gaan naar de Besluitlog. Items op `[!]` tellen
  niet mee. Een item met de markering `[vast]` blijft ongemoeid op zijn plek. Is de
  uitkomst niet eenduidig af te leiden: schrijf een besluitlogregel, laat "Nu"
  ongewijzigd, en STOP.
- Nieuwe clusters uit toekomstige handoffs worden bij hun eerste uitvoering
  toegevoegd, mét `(na: ...)`.

## Handoff 12: Planner redesign (actief traject)
- [x] C0 Backupverificatie pg_dump + restore-diff (2026-07-10, log in CLAUDE.md)
- [x] C1 Determinisme: nowMs-injectie deriveMode + event-branch buildPlan (= H11 cluster 16, H10 punt C) (2026-07-13)
- [x] C2a Supersede-bug: atomische replaceActivePrescriptions + computePlanWindow (2026-07-10, zie besluitlog)
- [x] C2b Datamodel (na: C0, C2a; staging als eerste stap) (2026-07-13)
- [x] C3 Backward planner (na: C1, C2b) (2026-07-13)
- [x] C4 Tweetraps beschikbaarheid (na: C2b) (2026-07-13) (volledig: brug, grid, Doelen-overhaul met weekcapaciteit 2026-07-13)
- [x] C5a solveWeek puur in planner.js + constraint-tests (na: C3, C4, R0, R1, R3, R4, R7) (2026-07-16)
- [x] C5b runWeekplanGeneration op buildMacrocycle/solveWeek; buildAvailDays en maxZoneForDate weg (na: C5a) (2026-07-16)
- [ ] C5c reconcilePrescriptions op modality: kracht tegen Hevy, loop tegen Strava Run/TrailRun (na: C5b, R9, C5g, C5h)
- [ ] C5d Mid-band-realisatie: mid komt alleen uit otherNonHit-dagen, waardoor het mid-doel onhaalbaar is zodra HIT en de lange duurrit de meeste minuten opeisen (na: C5b)
- [ ] C5e AI-planblok multimodaal: buildPrescriptionBlock filtert op type==='cycling' en meldt een rustdag terwijl er een loop- of krachtsessie gepland staat (na: C5b)
- [ ] C5f adjustCurrentWeek: AI-bijstelling op dag-granulariteit gaat over de urenplafonds van solveWeek heen; legacy-spiegel week_availability vervalt in dezelfde commit (na: C5b)
- [x] C5g matchPlannedToActual multimodaal: matcht alleen Ride/VirtualRide, dus loop- en krachtvoorschriften krijgen nooit een completionScore; unplanned-detectie labelt elke Run/Swim/Hike als type 'cycling' met zoneschatting op geschatte watts gedeeld door FTP (na: R9) (2026-07-17)
- [ ] C5h session_outcomes multimodaal: strava_id is BIGINT en kan geen Hevy-workout-id dragen, dus een krachtoutcome zonder voorschrift dedupliceert op geen enkele uniq-index (na: C5g)
- [ ] C6 Prognose (na: C5c, R10)
- [ ] C7 Reviewcadans (na: C2b)
- [ ] C8 Onboarding (na: C4, C5b; loopt samen met frontend-overhaul Doelen-tab; levert doelafstand hardlopen voor de R7-matrix)
- [ ] C9 Leerlaag Laag 4 (na: C7; wacht op voldoende session_outcomes)

## Handoff 13: Hardlopen gestructureerd (actief traject, onderzoek 2026-07-15)
- [x] R0 Drempeltempo-veld settings.thresholdPace in sec/km + Instellingen-UI + validatie; activeert rTSS/IF in computeRunningLoad (2026-07-15)
- [x] R1 Loopzones Z1-Z6 op drempelsnelheid + eigen RUN_ZONE_IF-tabel in engine.js, puur (2026-07-15)
- [x] R2 Seiler-mapping loopzones zodat fiets en loop in één TID-analyse vallen (2026-07-15)
- [x] R3 Loopblok-builders buildRunSession in planner.js, puur, analoog aan buildSession (na: R1) (2026-07-15)
- [x] R4 Interferentieparameters: loopweging 1.5-2x fiets, 6u ondergrens, 24u voorkeur, EIMD 48u (na: R1) (2026-07-15)
- [x] R5 ACWR-loopband 0.8-1.3 + single-run-spike-guard t.o.v. langste run 30 dagen (na: R1) (2026-07-16)
- [ ] R6 Pa:HR decoupling-drempels 5/10% op running-detail (na: R0)
- [x] R7 Periodiseringsprofielen per atleetsituatie: tijdsbudget, niveau, doeltype (na: R3, R5, R-doc-a) (2026-07-16)
- [ ] R8 CS/D'-model hardlopen als optionele geavanceerde laag (na: R3)
- [x] R9 computeETLForActivity looptak op computeRunningLoad: rTSS met average_speed als NGP-proxy i.p.v. suffer_score/TRIMP (na: R0) (2026-07-16)
- [ ] R10 Drempeltempo-historisering: thresholdPaceForDate analoog aan ftpForDate; computeETLForActivity leest settings.thresholdPace nu plat over de hele historie (na: R9)
- [ ] R11 Loop-fallbackhygiëne: platte duurfallback staat op 90/uur (IF 0,95) tegen 50/uur (IF 0,71) bij de fiets, en suffer_score is uit de keten verdwenen (na: R9)
- [!] Verificatie: settings.thresholdPace op productie zetten via het R0-veld; zonder anker vuurt de rTSS-tak daar niet en is R9 op main netto verlies. Blokkeert de merge van R9 naar main.
- [x] R-doc-a Trainingstheorie geversioneerd onder docs/ (herziene versie, 343 regels, zes hardloopsecties + Robineau-correctie) + citeerregel in CLAUDE.md (2026-07-16)
- [x] R-doc-b Dubbele intensiteitssectie harmoniseren: sectie Trainingsintensiteitsverdeling spreekt de sectie Intensiteitsverdeling en periodisering per atleetsituatie tegen (na: R-doc-a; landt in de R7-commit) (2026-07-16)

## Handoff 11: Bugs, UX, features
- [x] Cluster 1 Read-path performance: analytics-memo met ?force=1 bypass (geverifieerd 2026-07-10)
- [ ] Cluster 2 Hash-router en tab-state
- [x] Cluster 3 Kleine frontend-fixes: alert() weg, coach-markdown via renderMarkdown, buildcomment weg (geverifieerd 2026-07-10)
- [ ] Cluster 4 Server hardening: AI-timeouts, login-throttle, multer 2.x (nu nog 1.4.5-lts)
- [ ] Cluster 5 XSS-escaping user-controlled strings, incl. AI-tekst in adm-ai-text (app.js ~5110)
- [ ] Cluster 6 Toegankelijkheid (keyboard, aria)
- [ ] Cluster 7a Activiteiten-KPI's volgen filter en venster + lege-week CTA
- [ ] Cluster 7b Plateau-kaarten klikbaar/dismissbaar + skeletons Vandaag/Week
- [ ] Cluster 8 PWA-basis, manifest + service worker (na: cluster 2)
- [ ] Cluster 9 Zoekfunctie activiteiten
- [ ] Cluster 10 Interval-overlay ritdetail
- [ ] Cluster 11 Activiteiten vergelijken (na: cluster 2)
- [ ] Cluster 12 Seizoens- en jaarweergave Trends (na: cluster 9)
- [ ] Cluster 13 Data-export CSV/JSON
- [ ] Cluster 14 SSE-streaming Coach, /api/analyse/stream
- [ ] Cluster 15 Consistentie-tile race + sync-timestamp fmtRelD
- [ ] Cluster 16 now-injectie deriveMode (= H12 C1, daar uitvoeren, niet dubbel)
- [!] Verificatie: MODEL-tegel classificeert pyramidale week correct na z3=0,91-fix (browser, bij eerstvolgende smoketest)
- [x] Verificatie: Railway-backupverificatie (afgedekt door H12 C0, 2026-07-10)
- [ ] Verificatie: latency-nameting na cluster 1 tegen nulmeting 8 juli (18,1s / 6,5s / 6,2s / 4,3s / 4,2s)

## Handoff Historische consistentie (FTP/gewicht/zones/CP)
- [x] Cluster 1 CP-toekomstlek: bovengrens <= now in computeCriticalPower + regressietest (geverifieerd 2026-07-10, engine.js ~1342)
- [!] Cluster 2 Kalibratiefactor: beslissing vervallen of repareren (computeCalibrationFactor ijkt nog tegen geschat vermogen + globale FTP)
- [ ] Cluster 3 Gewicht-historisering: weightAt promoveren naar gedeelde weightForDate() in engine.js (nuttig voor: C6)
- [!] Cluster 4 LTHR-historisering: beslissing rollend geschat vs handmatige tijdlijn (grootste PMC-impact, belasting loopt via hrTSS)
- [ ] Cluster 5 Opruimen: ftpInfo/settings-FTP harmoniseren, dode hrZones-config (app.js), calcMetrics (server.js) vs computeLoadMetrics (engine.js) consolideren

## Handoff Trends herontwerp route 2
- [x] Prompt 1 Shell + segment-navigatie: switchTrendSeg en pf-trend-nav live (geverifieerd 2026-07-10)
- [~] Prompt 2 Palet-herbrand plus chrome (status onduidelijk, visueel verifiëren in browser)
- [x] Prompt 3 Radar, Seiler-band, PR-grid: _renderSeilerBand, power-radar (server.js ~3165), allTimePrContainer live (geverifieerd 2026-07-10)
- [ ] Prompt 4 (optioneel) Lazy render per segment, skeletons, drill-hints (alleen bij trage Trends-tab)

## Handoff Trends grafieken
- [x] Clusters 1 t/m 5 grotendeels live: chartFtpTrend, chartE1rm, compliance, chartSleep, zone-model/Seiler (geverifieerd 2026-07-10)
- [!] Sportverdeling naar tijd per discipline in Trends: aanwezigheid visueel verifiëren

## Handoff 10: Week-tab + sweetspot
- [x] TSB-projectie backend (projectWeekEndTSB live)
- [x] Week-tab herbouw
- [x] Sweetspot-zoning z3-plafond 0,91 systeembreed
- [ ] Punt A Strength-overlay op fietsbelasting-grafiek
- [x] Punt B Activiteiten-tab herbouwd en gepusht (renderActivitiesTab live, geverifieerd 2026-07-10)
- [ ] Punt F Opruimen: /api/admin/migrate-to-postgres + loadData/saveData verwijderen (ontgrendeld door C0)
- [x] Punt F Dode w^4 NP-proxy som verwijderd (geverifieerd afwezig 2026-07-10)

## Handoff 9: Delete-knoppen
- [x] Cluster 1 code (gewicht + nutritie deletes, openConfirm, drie-weg-keuze) live
- [x] Cluster 2 code (weekplan-sessie delete) live
- [!] Browser-rooktest beide clusters op productie, daarna definitief afvinken (testdata 6 juni als eerste case)

## Frontend-overhaul Laag 1 (tabs)
- [x] Shell, Vandaag, Week (MCP-geverifieerd)
- [x] Activiteiten (herbouwd na verloren lokale versie)
- [ ] Voeding
- [~] Trends (loopt via route 2-traject hierboven)
- [ ] Doelen (loopt samen met: C4, C8)
- [ ] Coach + chat (na: H11 cluster 14 SSE)

## Openstaand-lijst 2026-06-23 (restpunten)
- [x] Info-tooltips stat-labels: PF_TIPS + initInfoTooltips live (geverifieerd 2026-07-10)
- [x] Power-profile radar gebouwd (Coggan-categorieën, alleen gemeten vermogen)
- [x] dailyETL-architectuuropruiming (gesommeerde serie weg, strengthDailyETL apart)
- [x] Kracht/cardio eenheidsfork beantwoord: Foster sRPE-kanaal, gescheiden van PMC (verwerkt in H12-ontwerp)
- [ ] Fase-waarden referentiekaart (ATL/CTL/TSB per trainingsfase) in UI

## Overig
- [x] Staging-omgeving (eerste stap van C2b) (2026-07-13)
- [ ] Sentry-integratie (lage prioriteit, geen afhankelijkheden)
- [ ] Laag 2 multi-tenant auth (uitgesteld; triggert KvK-beslissing)

## Besluitlog

Append-only. Nieuwste bovenaan. Eén regel per bevinding die de scope, de volgorde of
een aanname raakt. Format: `YYYY-MM-DD | item | bevinding | gevolg`.

- 2026-07-17 | C5g | scoringslogica stond in server.js, dat niets exporteert, dus geen enkele test raakte hem terwijl C5c dezelfde scoring nodig heeft in de reconcile-lus | verplaatst naar planner.js als scoreEnduranceSession/scoreStrengthSession, fietsuitkomst byte-identiek geborgd met een regressietest, zelfde patroon als C5a
- 2026-07-17 | C5g | kracht krijgt geen actualTSS: de weekgrafiek in public/js/app.js telt op regel 1031 elke sessie met actualTSS op in de fietsbalk en stapelt daar strengthDailyETL bovenop, dus een Foster-sRPE-waarde in weekPlan zou dubbel tellen en het Coggan-kanaal vervuilen | alleen completionScore, actualDuration en matchedWorkoutId; matchedWorkoutId is bewust een apart veld naast matchedActivityId zodat de Hevy-string nooit in het BIGINT-pad van C5h komt
- 2026-07-17 | C5g | scoreEnduranceSession ankert op de platte settings.ftp terwijl actualTSS in dezelfde lus via ftpForDate per datum ankert; dezelfde rit kan dus tegen twee FTP's gemeten worden | niet gerepareerd in deze commit, want dat verschuift historische fietsscores; geregistreerd als bevinding, hoort thuis bij de sectie Historische consistentie
- 2026-07-17 | C5g | de weekbelastingsgrafiek heet Fietsbelasting maar somt elke sessie met TSS, inclusief loopsessies met rTSS; dat was al zo voor deze commit omdat ongeplande loopjes als type cycling werden weggeschreven | labelprobleem, geen incommensurabiliteit; niet aangeraakt, hoort bij de frontend-overhaul
- 2026-07-16 | R9 | correctie op de R9-besluitlogregel over de verschuivingsrichting: die noemt suffer_score×1.2 als referentie, maar dat gold voor 34 van de 72 runs; de andere 38 hadden geen suffer score en geen hartslag en vielen door naar de platte duurfallback durH×75×1.2, oftewel 90 per uur ongeacht tempo | de werkelijke referentie was voor de meerderheid van de loophistorie een platte 90/uur; de regel blijft staan (append-only) maar is hiermee gecorrigeerd
- 2026-07-16 | R9 | de platte loopfallback van 90 per uur impliceert IF 0,95 (90 = IF²×100), dus elke loop zonder hartslagdata werd geboekt alsof hij op 95% van drempeltempo liep; de fietsfallback staat op 50 per uur, oftewel IF 0,71, dus lopen lag tachtig procent hoger zonder onderbouwing | geregistreerd als R11 (na: R9); met een gezet drempeltempo raakt Pieters data die tak nooit meer, dus lage prioriteit, maar 90/uur mag niet als stille aanname blijven staan
- 2026-07-16 | R9 | staging-meting op identieke data (1436 activiteiten, zelfde datumbereik in beide omgevingen, dus de code is de enige variabele): CTL 26,1→24,1, ATL 27,0→21,1, TSB -0,9→+3,0 op 2026-07-13; de duurloop van 8 juli (61 min op 8:41/km, IF 0,52) ging van 92 naar 27, factor 3,4 | richting en orde van grootte bevestigd; het venster was 14 dagen en meet dus vooral de ATL-kant, want CTL heeft een tijdconstante van 42 dagen, de CTL-impact op de loopblokken van najaar 2024 is niet gemeten
- 2026-07-16 | R9 | productie heeft geen thresholdPace en geen lthr, dus daar zou R9 de 34 runs mét suffer score van suffer_score×1.2 naar TRIMP verschuiven en verder niets winnen: een gedragswijziging zonder opbrengst | merge naar main geblokkeerd tot het R0-veld op productie gevuld is, als [!] geregistreerd; alle 72 runs hebben average_speed, dus zodra het anker staat vuurt de rTSS-tak universeel en raakt de fallbackketen deze data nooit meer
- 2026-07-16 | R10 | thresholdPace wordt plat over de hele historie gelezen terwijl computeETLForActivity zijn FTP wél per datum via ftpAsOf/ftpForDate krijgt; bewijs: de marathon van 2024-10-13 (12174s op 279,9 s/km) komt tegen het huidige tempo van 270 uit op IF 0,96 en rTSS 315, en een marathon op 96% van drempelsnelheid bestaat niet (88-92% is de band voor een goed getrainde loper), dus het drempeltempo van 2024 lag rond 4:10 en niet 4:30 | thresholdPaceForDate als R10 (na: R9); geplaatst in Handoff 13 en niet in de sectie Historische consistentie waar het naast cluster 3 (gewicht) en cluster 4 (LTHR) hoort, want die sectie is geen actief traject en telt niet mee in de Nu-afleiding; C6 naar (na: C5c, R10) want prognose projecteert op de historische reeks
- 2026-07-16 | R9 | computeETLForActivity riep computeRunningLoad nooit aan: de looptak ging rechtstreeks naar suffer_score×1.2 of TRIMP, dus de hele belastingspijplijn kende het drempeltempo niet en R0 heeft in de praktijk niets geactiveerd; runningDailyETL was een suffer-score-reeks, computeRunAcwr (R5) rekende daar een ratio over en solveWeek blokkeert sinds C5b loopvolume op basis daarvan | looptak op computeRunningLoad met average_speed als NGP-proxy; de R0-besluitlogregel "engine.js ongewijzigd want computeRunningLoad las thresholdPace al" was waar maar onvolledig: niemand controleerde of die functie ook werd aangeroepen
- 2026-07-16 | R9 | de asymmetrie was intern aantoonbaar: runZoneFromActivity gebruikt average_speed wél als anker voor de loopzone, terwijl de belastingtak dezelfde waarde op dezelfde activity negeerde | proxy-keuze volgt de zonetak; gradiëntcorrectie via echte NGP blijft voorbehouden aan het activity-detail-pad, want engine.js is een pure rekenlaag zonder I/O en mag geen streams ophalen
- 2026-07-16 | R9 | historische PMC verschuift voor elke week met hardlopen, net als R2 dat deed voor de TID: rTSS zit structureel hoger dan suffer_score×1.2 zodra er rond of boven drempeltempo gelopen is, en lager bij rustige lange duurlopen met hoge HR-drift | geen migratie nodig want de reeks wordt bij elke computeFullState opnieuw gerekend; wel eerst op staging meten wat CTL/ATL/TSB doen voordat main hem krijgt
- 2026-07-16 | C5c | geblokkeerd op drie vondsten in het sync-pad: matchPlannedToActual matcht alleen Ride/VirtualRide en zet dus nooit een completionScore op loop- of krachtsessies, waardoor reconcile niets te matchen heeft; de unplanned-detectie filtert op ENDURANCE_TYPES maar labelt elke Run/Swim/Hike als type 'cycling' met een zoneschatting op Strava's geschatte hardloopwatts gedeeld door FTP (de R2-bug, nu in week_plan); en session_outcomes.strava_id is BIGINT terwijl een Hevy-workout-id een string is | C5c geannoteerd naar (na: C5b, R9, C5g, C5h); C5c nu bouwen zou deltas.tss schrijven die rTSS-doel tegen TRIMP-werkelijkheid afzetten en C9 laten regresseren op stille rommel, hetzelfde incommensurabiliteitspatroon dat bij Coggan-TSS vs Foster-sRPE wél is afgevangen
- 2026-07-16 | C5b | de legacy-spiegel kan niet vervallen zoals de C4a-besluitlog aannam: adjustCurrentWeek leest week_availability plus de dag-gebaseerde cyclingRestrictions uit engine.js en draait op elke sync en webhook een AI-bijstelling van het weekplan, dus die AI gaat na C5b over de urenplafonds van solveWeek heen | spiegel blijft staan; de verwijdering plus het botsingsprobleem samen als C5f (na: C5b); de C4a-annotatie "spiegel vervalt in C5" is daarmee achterhaald
- 2026-07-16 | C5b | plan_mesocycles niet gevuld: macrocycle_id heeft geen stabiele semantiek (bij een doorlopend doel schuift het 12-weeksvenster elke week op) en getMesocycleForWeek filtert niet op macrocycle_id, dus twee overlappende macrocycli maken die query niet-deterministisch | macrocyclus blijft in het geheugen, deterministisch herrekend per generate; persistentie krijgt pas een consument bij C7 en wordt daar beslist; de C5a-besluitlogregel die de ADD COLUMN dominant_type bij C5b legde is daarmee vervallen
- 2026-07-16 | C5b | solveWeek genereert per (datum, modaliteit) niets zodra er al een sessie staat, dus zijn eigen vorige output als existingSessions voeren maakt opnieuw genereren een no-op en kan een gebruiker zijn plan nooit herzien | vervangbaarheid ligt bij de aanroeper: server.js houdt planner-sessies zonder uitkomst binnen het venster buiten existingSessions; solveWeek blijft ongewijzigd en de C5a-idempotentietest blijft geldig
- 2026-07-16 | C5b | longestRunDistance, computeRunAcwr, classifyRunSpike en runningDailyETL hadden sinds R5 nul aanroepers: buildDailyETLSeries berekende runningDailyETL wel maar computeFullState destructureerde hem niet | computeFullState geeft runningDailyETL nu door (additief, geen herberekening); C5b is de eerste consument van de hele R5-laag
- 2026-07-16 | C5b | de statusregel beloofde een slot-adapter, maar mergeAvailabilityView in availability.js levert al exact de solver-input van solveWeek ([{ slot_date, minutes, modalities, time_of_day }]) | geen adapter gebouwd, alleen aangesloten; statusregel C5b gecorrigeerd
- 2026-07-16 | C5a | de zelftestguard in de prompt stond op "drie CONSISTENT-verdicts" terwijl staging er vóór C5a al maar twee gaf; het getal was geschat en niet geteld, en blok 0 mat npm test wel maar node planner.js niet | derde keer dezelfde fout (zie 2026-07-15 en 2026-07-10); de regel "testguards ankeren op 0 fail en niet op een absoluut aantal" geldt vanaf nu ook voor zelftest-verdicts: elke guard op een niet-npm-test-uitvoer wordt in blok 0 als nulmeting gedraaid en de vergelijking is nulmeting-vs-na, nooit een verwachte waarde uit het hoofd
- 2026-07-16 | C5a | buildPlan-zelftest TEST 2 geeft realized mid 0.11 tegen doel 0.20 en dat is geen testartefact: mid wordt uitsluitend toegewezen aan otherNonHit-dagen, want HIT-dagen krijgen hitType en de langste niet-HIT-dag krijgt hard endurance; bij weinig dagen is het mid-doel daarmee structureel onhaalbaar en FIX 3 verbergt dat door weeklyTSSTarget achteraf naar de gebouwde sessies te rekenen, zodat alleen de mid-check nog aanslaat | solveWeek erft de bug omdat C5a de dagtoewijzing bewust letterlijk kopieert (verplaatsing zonder gedragswijziging, zodat C5b een pure omschakeling blijft); geregistreerd als C5d (na: C5b), want repareren in buildPlan is weggegooid werk zodra C5b hem uit het schrijfpad haalt
- 2026-07-16 | C5a | Blok 9-zelftest (node planner.js) toont TEST 2 INCONSISTENT (gerealiseerde mid 0,11 tegen doel 0,20); bevestigd pre-existing via git stash tegen ongewijzigde staging, dus geen regressie door C5a | commit gaat door zonder herstel: buildPlan blijft dit commit onaangeraakt (expliciete C5a-scope-grens), een fix hoort bij een apart aangewezen item
- 2026-07-16 | C5 | C5 was één cluster over drie code paths: een pure solver, een schrijfpad dat voorschriften muteert, en de reconcile-lus; dat is precies de bundeling waar de split-per-code-path-regel tegen beschermt | gesplitst in C5a (puur, nul consumenten), C5b (adapter + omschakeling schrijfpad) en C5c (reconcile op modality); C6 naar (na: C5c), C8 naar (na: C4, C5b)
- 2026-07-16 | C5a | buildMacrocycle, goalsToGoalSet en resolveGoalPriority uit C3 hebben nul consumenten: server.js importeert alleen buildPlan en computePlanWindow, dus productie draait nog volledig op de oude fiets-only solver en de hele C3/C4/R3/R4/R5/R7-laag is nog niet aangesloten | C5b is de commit die dat aansluit; buildPlan blijft tot dat moment ongewijzigd en wordt in C5a niet aangeraakt
- 2026-07-16 | C5a | het zoneplafond ging van dagen naar uren: maxZoneForDate gaf de beendag en dag+1 zone 2 en dag+2 zone 3, terwijl canon sectie "Concurrent training: fietsen en krachttraining combineren" sweetspot vrijgeeft vanaf 48 uur na de beensessie; de dag+2-Z3-cap was strenger dan de canon en de dagrekening kan een slot van 37 uur na legs als vrij aanmerken | legsZoneCeiling rekent in uren, tweetraps: onder 48 uur maxZone 2, daarboven 5; dit is de reden dat C4 uur-slots introduceerde
- 2026-07-16 | C5a | plan_mesocycles heeft dominant_modality maar geen dominant_type, terwijl solveWeek het doeltype nodig heeft voor GOAL_PROFILES[...].distShift | buildMacrocycle zet dominant_type nu in de rij; de ADD COLUMN IF NOT EXISTS dominant_type hoort bij C5b, want daar wordt de rij pas weggeschreven
- 2026-07-16 | C5a | selectStrengthSplits kiest legs vóór push en pull, tegen de leesrichting van de zachte voorkeur push→pull→legs in | die voorkeur is temporeel, geen selectievolgorde: Rønnestad en Mujika bouwen hun protocol op zwaar beenwerk, dus bij strength_sessions 1 of 2 is legs de sessie die blijft; laat je legs vallen dan valt de fietswinst weg en houd je een bovenlichaamsplit over die alleen fatigue kost
- 2026-07-16 | R7 | de uren-as stond op availDays (weekgrid) i.p.v. op een structurele capaciteit, waardoor het periodiseringsmodel per week omklapte zodra er minder slots stonden; en distributionPolarizedMinHours stond op 8 terwijl canon sectie 217 twaalf uur noemt plus een fase-eis (pyramidaal in base, polarized in build) die de code niet kon uitdrukken | as verlegd naar settings.weekCapacity.hours met availDays-som als fallback; knoppen hernoemd naar timeBudgetModerateMinHours/timeBudgetHighMinHours (6/12) met clampProfileParams als canon-bodem conform het R4-precedent; buildMacrocycle bepaalt distribution_model nu per week i.p.v. één constante over de hele macrocyclus, de kolom bestond al
- 2026-07-16 | R7 | canon sectie 217 spreekt zichzelf tegen: de regel dat 4-6u zich niet kan veroorloven te polariseren staat drie alinea's na Muñoz & Seiler, waar precies die groep (recreatieve lopers, laag volume) juist meer won met polarized dan met drempel (7% vs 1,6% in de compliante subgroep) | uren-as disciplinespecifiek gemaakt: cycling low → sweetspot, running low → polarized; dat is de reden dat één universele urendrempel niet houdbaar was en R7 per discipline kiest; opgelost in de R-doc-b-tekst
- 2026-07-16 | R7 | de loopafstand-as uit canon sectie 217 (Z4/Z5-accent bij 5-10km, matige band bij halve/hele marathon) is niet geïmplementeerd: er is geen veld dat de afstand draagt en geen consument die hem leest, dus hij zou een derde dode knop worden naast de opgeruimde interferenceFactor | as verplaatst naar C8, dat het doelveld levert; annotatie C8 uitgebreid
- 2026-07-16 | C8 | annotatie miste C5: de blokkerende velden van de wizard zijn doeltype en gewicht per doel, en gewicht per doel bestaat alleen in de goals-tabel, die nul consumenten heeft (insertGoal/getActiveGoals/setGoalStatus ongebruikt, buildPlan draait via goalsToGoalSet op het legacy users.goals-JSONB en POST /api/goals merget daarin); C8 nu bouwen betekent of schrijven naar een tabel die de planner niet leest, of een tweede doelformulier naast de C4b-2-Doelen-tab dat bij C5 opnieuw moet, hetzelfde patroon als C5/R7 | annotatie C8 naar (na: C4, C5); het optionele veld trainingservaring per modaliteit valt daarmee transitief achter R7, conform de C8-als-override-regel uit de R7-besluitlogregel; C8 uit Nu, R6 vult de derde plek (nul ontgrendelingen, gelijkstand met R8 op cluster-ID beslist, R-doc-b telt niet mee want gebonden aan de R7-commit)
- 2026-07-16 | R-doc-a | de commit beschrijft zichzelf onjuist: er landde geen kopie maar een herziene canon (343 tegen 217 regels, zes nieuwe hardloopsecties, twee herschreven alinea's waaronder de intrekking van de drie-uursregel ten gunste van Robineau 6u/24u), en de oude sectie Trainingsintensiteitsverdeling spreekt de nieuwe sectie per atleetsituatie tegen binnen hetzelfde bestand | statusregel R-doc-a gecorrigeerd, R-doc-b geherformuleerd van "matrix schrijven" naar "dubbele sectie harmoniseren" want de matrix bestaat al; de canon ondersteunt de R5-drempels 10/30/100 nu expliciet, die afwijking uit de R5-besluitlog is daarmee vervallen
- 2026-07-16 | werkregel | de projectkennis-kopie die een sessie op schijf krijgt kan verouderd zijn (217 regels tegen de 344 die in de UI staan), waardoor een diff tegen die kopie een verschil laat zien dat er niet is | inhoudelijke claims over een projectdocument altijd tegen de actuele bron toetsen, niet tegen de meegeleverde kopie; verificatie van de canon tegen engine.js/athleteParams.js bevestigde acht alinea's uit vier secties en alle constanten (RUN_ZONE_BOUNDS, RUN_ZONE_IF, rTSS-kolom, RUN_ACWR_BAND, RUN_SPIKE_BAND, interferentieparameters) byte-identiek
- 2026-07-16 | R-doc | versioneren en herschrijven zijn twee dingen: de canon buiten de repo maakt R7 onschrijfbaar (geen guard mogelijk, agent kan het bestand niet lezen), maar de herschrijving hoort in dezelfde commit als de code die eruit volgt | gesplitst in R-doc-a (versioneren, nu) en R-doc-b (herschrijven, in de R7-commit); R7-annotatie uitgebreid naar (na: R3, R5, R-doc-a)
- 2026-07-16 | R7 | annotatie miste R5: niveau wordt deterministisch afgeleid uit chronische loopbelasting en historielengte i.p.v. uit een gebruikersveld, en die reeks (runningDailyETL) bestaat pas sinds R5; een expliciete override in Instellingen kan later als C8-laag eroverheen, nooit andersom | R5 opgenomen in de (na: ...) van R7, beide staan op [x] dus R7 blijft vrij
- 2026-07-16 | C5 | annotatie miste R7: de weeksolver kiest zijn zoneverdeling via GOAL_PROFILES/DIST_BASE en R7 vervangt precies die selectie door een keuze op atleetsituatie (tijdsbudget, niveau, doeltype), dus C5 vóór R7 bouwen betekent solveWeek twee keer schrijven, hetzelfde patroon als C4/C8 op de Doelen-tab | annotatie C5 uitgebreid naar (na: C3, C4, R0, R1, R3, R4, R7); C5 valt daarmee uit Nu tot R7 klaar is; R5 blijft bewust géén (na:) van C5, want de guard is een volgorde-voorkeur (goedkoper om te consumeren dan achteraf in te weven) en geen afhankelijkheid
- 2026-07-16 | R5 | drempels op 10/30/100% terwijl de implementeerbaar-regel in het onderzoeksdoc 30/100 noemde | de 10-30%-band had in de studie de hoogste hazard rate ratio (+64%), de hoogste gemeten risicoband; een guard die daar niet aanslaat mist de zwaarste band; gevolg: classifyRunSpike is de primaire guard en computeRunAcwr de secundaire, C5 consumeert classifyRunSpike bij het plaatsen van de lange duurloop
- 2026-07-16 | R5 | single-run-spike-guard rekent op afstand, niet op rTSS | Frandsen 2025 mat afstandsverhoudingen t.o.v. de langste run, geen rTSS; longestRunDistance en classifyRunSpike zijn daarom op activity.distance gebouwd
- 2026-07-15 | R4 | interferenceFactor had drie definities (athleteParams.js prior 1.0, planner.js-zelftest 0.8, test/helpers.js-mirror 1.0) en nul consumenten, met twee onderling tegenstrijdige waarden 1.0/0.8 die niemand opmerkte | dode knop verwijderd, vervangen door vier benoemde knoppen; weging (runInterferenceWeight) blijft atleet-variabel in athleteParams.js/POPULATION_PRIORS voor de leerlaag (C9), maar de 6-uursbodem (minHoursRunToLegs, Wilson 2012) is universeel en wordt door clampInterferenceParams in planner.js afgedwongen ongeacht wat de leerlaag aanlevert; buildPlan roept deze helpers nog niet aan, dat is C5
- 2026-07-15 | Overig | drie "Running detail"-regels beschreven hetzelfde werk als H13 R0/R2/R8 plus de al live AdRunChart, en stonden op [ ] terwijl R0 en R2 op [x] staan: twee waarheden over één traject | regels verwijderd in plaats van afgevinkt (afvinken zou suggereren dat er twee trajecten waren); CS/D' blijft uitsluitend bestaan als R8 (na: R3, nu vrij); staging-regel afgevinkt want C2b [x] bevestigt dat de eerste stap uitgevoerd is
- 2026-07-15 | R3 | planner.js kreeg zijn eerste require: RUN_ZONE_IF/RUN_ZONE_BOUNDS uit engine.js, expliciet eenrichtingsverkeer (engine.js mag planner.js nooit importeren); loop-warmup/cooldown staan in Z1 i.p.v. fiets-warmup Z2, want loop-Z1 is al IF 0.70 tegen fiets-Z1 0.50 en een Z2-warmup zou fixedTSS te hoog zetten en nTarget/repcount vervormen | buildRunSession/buildSession nu ook geëxporteerd voor het testen van de rTSS-regressie (test e); buildPlan roept buildRunSession nog niet aan, dat is C5
- 2026-07-15 | R2 | activityZoneClassification keek niet naar type en had average_watts als eerste tak, waardoor Strava's geschatte hardloopvermogen door FTP werd gedeeld en rustige duurlopen als Z4/Z5 in de weekverdeling landden | looptak boven de vermogenstak, lopers slaan die tak altijd over (ook zonder drempeltempo, dan HR); historische TID van weken met hardlopen verschuift, dat is de correctie
- 2026-07-15 | R2 | canon splitst loop-Z4 (95-102% drempelsnelheid) over Seiler-band 2 en 3, maar de classificatie is sessieniveau met één label per activiteit en de fiets splitst Z4 ook niet | zoneToCategory blijft ongewijzigd: Z4-Z6 hoog; splitsen voor loop en niet voor fiets zou de sporten onvergelijkbaar maken, herzien pas als time-in-zone op streams de sessielabel-aanpak vervangt
- 2026-07-15 | R2 | testfixture: weeklyZoneBreakdown roept intern ftpForDate aan en die geeft rollingFtp voorrang boven settings.ftp, dus een measured rit ankert zijn eigen FTP (150W wordt IF 1.05 in plaats van 0.54); zonder gedeelde geschiedenis is elke fietsfixture zelfrefererend | fietsfixtures in zone-tests krijgen powerSource 'estimated' zodat rollingFtp ze overslaat en settings.ftp geldt
- 2026-07-15 | R1 | twee tabellen met verschillende rol: RUN_ZONE_BOUNDS descriptief (classificatie van werkelijk tempo, grenzen 0.72/0.83/0.95/1.02/1.14 van drempelsnelheid) en RUN_ZONE_IF prescriptief (planning-midpoints 0.70-1.20); de IF-tabel is een afgeleide synthese uit Daniels %vVO2max met drempelanker 88%, geen gepubliceerde tabel | beide geexporteerd uit engine.js maar nog nergens aangeroepen: Seiler-mapping is R2, planner-kant is R3; RUN_ZONE_IF mag nooit de load van een werkelijke loop schatten want computeRunningLoad rekent IF uit NGP
- 2026-07-15 | R0 | annotatie zei Doelen-UI, maar de twee zusterankers FTP en LTHR staan in Instellingen en Doelen gaat sinds C4b-2 over doel, event en weekcapaciteit, niet over fysiologische ankers | veld geplaatst in Instellingen als eigen kaart met eigen saveSettingsHardlopen zodat saveSettings ongemoeid blijft; annotatie R0 gecorrigeerd naar Instellingen-UI; engine.js ongewijzigd want computeRunningLoad las thresholdPace al
- 2026-07-15 | PROGRESS.md | Nu-sectie liep uit de pas en noemde C1, staging en C2b terwijl die alle drie op [x] stonden; oorzaak was dat alleen Pieter hem mocht herschrijven, waardoor niemand het deed | regel omgedraaid: Nu is een afgeleide weergave die elke commit meeloopt, mechanisch afgeleid uit de (na: ...)-annotaties, met STOP bij ambiguïteit en een [vast]-markering als override voor Pieter
- 2026-07-15 | PROGRESS.md | testguard in de H13-prompt stond op 165/165 maar de suite geeft 171 groen; het getal was uit een grep op test(-regels afgeleid in plaats van uit een run, node telt suites en subtests mee (tweede keer deze fout, zie 2026-07-10) | testguards ankeren voortaan op '0 fail' en niet op een absoluut aantal; het aantal mag groeien
- 2026-07-15 | R-doc | PeakForm_Trainingstheorie.md staat niet in de repo maar alleen in projectkennis, terwijl de Besluitlog ernaar verwijst op regelnummer (C3, regel 95); een invoeging boven dat regelnummer breekt het citaat stil | beslispunt: doc versioneren onder docs/ zodat de canon meeversioneert met de code
- 2026-07-15 | H13 | clusters R0-R8 vooraf geregistreerd in plaats van bij eerste uitvoering, afwijkend van de legenda-regel, omdat de volgorde van C5 ervan afhangt | annotatie C5 uitgebreid naar (na: C3, C4, R0, R1, R3, R4)
- 2026-07-15 | H13 | theoriedoc sprak zichzelf tegen: de 3-uur-scheiding kracht-duur is niet gedekt door Robineau 2016, waar het effect pas bij 6u verdwijnt en 24u beter is dan 6u | interferentieconstraint in R4 en C5 op 6u ondergrens en 24u voorkeur, niet 3u
- 2026-07-15 | H13 | loop-IF is een fractie van drempelsnelheid, fiets-IF van drempelvermogen; snelheidsratio's comprimeren minder (fiets-Z1 0.50 tegen loop-Z1 0.70) | RUN_ZONE_IF wordt een eigen tabel in R1/R3; ZONE_IF kopiëren onderschat loop-rTSS structureel
- 2026-07-13 | C4b-2 | Doelen-tab: dubbele doel/event-flow geconsolideerd tot één saveGoals, weekcapaciteit (uren/krachtsessies/voorkeursdagen) toegevoegd in settings.weekCapacity als atleet-capaciteitslaag (niet per doel, want één capaciteit bij meerdere doelen); Vaste patronen en PPL bewust ongemoeid want ze voeden buildAvailDays/restricties tot C5 | buildMacrocycle leest weekCapacity.hours in C5
- 2026-07-13 | C4b-1 | weekgrid herbouwd naar uur-slots per dag (time_of_day = concreet uur), meerdere sessies per dag, uniek uur per dag afgedwongen in de UI zodat de uniq-index niet botst; oude fiets-vrij-toggle verwijderd | round-trip op staging groen, slot_date komt als string na de C4a-fix
- 2026-07-13 | C4a-fix | GET /api/availability-slots crashte op pg DATE-typing (slot_date kwam als Date-object, localeCompare bestond niet) en dedup faalde tegen legacy-strings; suite miste het omdat geen test de DB-round-trip raakt | slot_date::text-cast plus pure mergeAvailabilityView met lokale-componenten-normalisatie (geen toISOString i.v.m. TZ-shift), from/to-guard toegevoegd
- 2026-07-13 | C4a | dubbelschrijf-brug: nieuwe slots naar availability_slots plus spiegel naar week_availability-JSONB, zodat buildAvailDays en de weekplanner ongebroken blijven tot C5 de slot-adapter bouwt | spiegel vervalt in C5, geen ontkoppeling van de planner tijdens de C4-C5-tussenperiode
- 2026-07-13 | C4a | per-dag-replace i.p.v. per-slot-upsert omdat de uniq-index op time_of_day NULL geen ON CONFLICT triggert en zou stapelen | replaceAvailabilitySlotsForDate transactioneel toegevoegd
- 2026-07-13 | C3 | handoff schreef progressieve taper voor; step-taper geïmplementeerd conform Trainingstheorie regel 95 (Bosquet): volume in één stap ~50% omlaag binnen 41-60% band, daarna vasthouden, intensiteit ongemoeid | DoD-test blijft geldig, geen progressieve reeks
- 2026-07-13 | C2b | modality-kolom en uniq_presc_active bleken al door C2a toegevoegd; C2b reduceerde tot vijf nieuwe tabellen plus CRUD-helpers, ALTER uit de spec overgeslagen. Eerste migratie die via de nieuwe staging-environment wordt geverifieerd voordat main hem krijgt.
- 2026-07-13 | C1 | scope kleiner dan handoff-annotatie: het event-branch van buildPlan gebruikte al dateToUTCms tegen weekStart en las de klok niet; alleen deriveMode las nog de systeemklok via new Date(). nowMs geïnjecteerd. Grensdag-semantiek verschoven van 12:00 lokale tijd naar 00:00 UTC, nu gelijk aan de eventdag-drempel in buildPlan; verwaarloosbaar op weekgranulariteit, bewust gekozen voor één datumdefinitie in de planner.
- 2026-07-10 | PROGRESS.md | verificatiegetallen in de herstructureringsprompt waren geschat (51/11) in plaats van geteld; guard sloeg terecht aan en blokkeerde de commit | tellers ankeren voortaan op statusregels (`^- \[.\].*(na: `), niet op vrije tekst; werkelijke waarden 69 statusregels en 14 afhankelijkheden
- 2026-07-10 | C2a | supersede-venster begon op de maandag van de planweek in plaats van vandaag, waardoor verstreken voorschriften zonder opvolger stil gesupersedeerd raakten en nooit gereconcilieerd werden | vensterberekening geëxtraheerd naar pure computePlanWindow(prescriptionDates, nowMs) in planner.js
- 2026-07-10 | C2a | insertPrescription-lus in server.js kon dubbele actieve voorschriften opleveren; uniq_presc_active werd alleen via console.warn opgevangen | vervangen door atomische replaceActivePrescriptions in db.js, plus modality-dedupe
- 2026-07-10 | C0 | Railway-backup inhoudelijk compleet bevonden via restore-diff | H10 punt F (verwijderen migrate-to-postgres + loadData/saveData) ontgrendeld

## Gearchiveerde handoffs

Handoff 1 t/m 8, Frontend Overhaul Handoff (origineel), Roadmap Lagen, Tooltip
Aanbevelingen en de research-rapporten zijn afgerond of vervangen. Alle restpunten
daaruit zijn doorgeschoven naar de secties hierboven via de Openstaand-lijst van
23 juni en Handoffs 10 t/m 12. Niet heropenen.
