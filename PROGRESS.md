# PeakForm voortgang

Statusoverzicht van alle werk, geordend op code-pad. De handoff waar een item uit
voortkomt staat als tag in de regel en zegt niets over volgorde.

## Nu

Maximaal drie items. Dit is de enige plek waar prioriteit staat; alle andere
secties zijn statusinventaris.

1. [vast] V1 Verificatiesessie: nul code, ruimt zes losse verificatiepunten op in
   één browsersessie en zet het drempeltempo op productie aan, waar R9 nu zonder
   anker op de platte fallback draait.
2. C5h session_outcomes multimodaal (na: C5g, klaar). Ontgrendelt C5c en is een
   klok-item: elke week zonder is een week krachtuitkomsten die niet dedupliceren.
3. C7 Reviewcadans (na: C2b, klaar). Ontgrendelt C9, dat aanlooptijd nodig heeft
   omdat het op voldoende session_outcomes wacht.

Eerstvolgende in de afleiding, beide met één ontgrendeling en zonder klok: D1 en
R10, in die volgorde op cluster-ID.

## Legenda

Statussen: `[ ]` open, `[~]` deels, `[x]` klaar, `[!]` wacht op beslissing of
verificatie door Pieter. Datum achter elke statuswijziging.

`(na: X)` betekent dat X afgerond moet zijn voordat dit item start. `(na: -)`
betekent dat het item vrij is en dat dat een vastgesteld feit is, geen omissie.
Elk open item draagt een van beide. De omgekeerde richting wordt bewust niet
geannoteerd: gebruik `grep "na:.*C2b" PROGRESS.md` om te zien wat een item
vrijspeelt.

`[klok]` markeert een item dat een dataklok start: het werk levert pas waarde op
nadat er kalendertijd overheen is gegaan. Uitstellen kost meetdata die je niet
kunt inhalen. Pieter zet deze markering; hij is geen oordeel bij de afleiding maar
een eigenschap van het item.

`(omvat: X, Y)` betekent dat de items X en Y in dit item zijn opgegaan. ID's
worden nooit hernummerd of hergebruikt: de Besluitlog verwijst naar ze en die is
append-only. Een opgegaan ID blijft daarom vindbaar via `grep`.

Regels voor wie dit bestand bijwerkt:
- Elke commit die een item (deels) uitvoert werkt de bijbehorende regel bij in
  dezelfde commit: status en datum.
- Een statusregel blijft een regel. Bevindingen, vervolgfixes en afwegingen gaan
  naar de Besluitlog, niet achter de statusregel.
- Blijkt tijdens uitvoering dat een `(na: ...)` niet klopt of dat een nieuw item
  nodig is: schrijf een besluitlogregel, pas de annotatie aan, en STOP.
- Items samenvoegen mag alleen als ze hetzelfde code-pad raken én dezelfde
  verificatie- of meetkosten delen, of als het alternatief is dat dezelfde UI
  twee keer gebouwd wordt. Nabijheid op het scherm of in dezelfde handoff is geen
  grond. Samenvoegen gebeurt met `(omvat: ...)` en een besluitlogregel.
- De sectie "Nu" is een afgeleide weergave, geen oordeel, en loopt mee in dezelfde
  commit als elke statuswijziging. Afleiding, in deze volgorde: verwijder items die
  op `[x]` staan; vul aan tot maximaal drie met open items (`[ ]` of `[~]`)
  waarvan elke `(na: ...)` op `[x]` staat; sorteer aflopend op het aantal items dat
  ze vrijspelen (`grep -c "na:.*<id>" PROGRESS.md`), bij gelijkstand eerst de items
  met `[klok]`, daarna op cluster-ID. Eén regel motivering per item. Items op `[!]`
  tellen niet mee, evenmin als items in de secties Verificatie en Beslispunten. Een
  item met de markering `[vast]` blijft ongemoeid op zijn plek. Is de uitkomst niet
  eenduidig af te leiden: schrijf een besluitlogregel, laat "Nu" ongewijzigd, en
  STOP.
- Nieuwe clusters uit toekomstige handoffs worden bij hun eerste uitvoering
  toegevoegd in de sectie van het code-pad dat ze raken, mét `(na: ...)` en een
  herkomsttag.

## Rekenlaag: engine.js (puur, geen I/O)

- [x] HC-1 CP-toekomstlek: bovengrens <= now in computeCriticalPower + regressietest (H-consistentie) (2026-07-10, engine.js ~1342)
- [x] R0 Drempeltempo-veld settings.thresholdPace in sec/km + Instellingen-UI + validatie (H13) (2026-07-15)
- [x] R1 Loopzones Z1-Z6 op drempelsnelheid + eigen RUN_ZONE_IF-tabel (H13) (2026-07-15)
- [x] R2 Seiler-mapping loopzones zodat fiets en loop in één TID-analyse vallen (H13) (2026-07-15)
- [x] R5 ACWR-loopband 0.8-1.3 + single-run-spike-guard t.o.v. langste run 30 dagen (H13) (na: R1) (2026-07-16)
- [x] R9 computeETLForActivity looptak op computeRunningLoad: rTSS met average_speed als NGP-proxy (H13) (na: R0) (2026-07-16)
- [x] H10-w4 Dode w^4 NP-proxy som in classifySession verwijderd (H10) (2026-07-10)
- [ ] R10 Ankerhistorisering in één commit, want alle vier verschuiven de historische reeks en delen daarmee één staging-meting van CTL/ATL/TSB: thresholdPaceForDate analoog aan ftpForDate; weightAt (server.js ~1415) promoveren naar weightForDate in engine.js; ftpInfo en settings-FTP harmoniseren; scoreEnduranceSession ankeren op ftpForDate in plaats van op platte settings.ftp. Loop-fallbackhygiëne hoort in dezelfde commit omdat het dezelfde functie is: de platte duurfallback staat op 90/uur (IF 0,95) tegen 50/uur (IF 0,71) bij de fiets (omvat: R11, HC-3, HC-5-ftpInfo) (H13, H-consistentie) (na: R9)

## Planlaag: planner.js en het planschrijfpad

- [x] C2a Supersede-bug: atomische replaceActivePrescriptions + computePlanWindow (H12) (2026-07-10)
- [x] C1 Determinisme: nowMs-injectie deriveMode + event-branch buildPlan (H12; = H11-16, niet dubbel uitvoeren) (2026-07-13)
- [x] C3 Backward planner (H12) (na: C1, C2b) (2026-07-13)
- [x] C4 Tweetraps beschikbaarheid: brug, uur-slotgrid, Doelen-overhaul met weekcapaciteit (H12) (na: C2b) (2026-07-13)
- [x] R3 Loopblok-builders buildRunSession, puur, analoog aan buildSession (H13) (na: R1) (2026-07-15)
- [x] R4 Interferentieparameters: loopweging 1.5-2x fiets, 6u ondergrens, 24u voorkeur, EIMD 48u (H13) (na: R1) (2026-07-15)
- [x] R7 Periodiseringsprofielen per atleetsituatie: tijdsbudget, niveau, doeltype (H13) (na: R3, R5, R-doc-a) (2026-07-16)
- [x] C5a solveWeek puur in planner.js + constraint-tests (H12) (na: C3, C4, R0, R1, R3, R4, R7) (2026-07-16)
- [x] C5b runWeekplanGeneration op buildMacrocycle/solveWeek; buildAvailDays en maxZoneForDate weg (H12) (na: C5a) (2026-07-16)
- [x] U1 Sessie-TSS uit de frontend naar planner.recomputeSessionLoad (UI-audit) (2026-08-10)
- [ ] C5e AI-planblok multimodaal, leespad: buildPrescriptionBlock filtert op type==='cycling' en meldt een rustdag terwijl er een loop- of krachtsessie gepland staat (H12) (na: C5b)
- [ ] C5f adjustCurrentWeek, schrijfpad: AI-bijstelling op dag-granulariteit gaat over de urenplafonds van solveWeek heen; legacy-spiegel week_availability vervalt in dezelfde commit (H12) (na: C5b)
- [ ] C5d Mid-band-realisatie: mid komt alleen uit otherNonHit-dagen, waardoor het mid-doel onhaalbaar is zodra HIT en de lange duurrit de meeste minuten opeisen (H12) (na: C5b)

## Sync en uitkomsten: Strava, Hevy, matching, session_outcomes

- [x] C5g matchPlannedToActual multimodaal + scoreEnduranceSession/scoreStrengthSession naar planner.js + matchSourceForSession (H12) (na: R9) (2026-07-17)
- [ ] C5h session_outcomes multimodaal: strava_id is BIGINT en kan geen Hevy-workout-id dragen, dus een krachtoutcome zonder voorschrift dedupliceert op geen enkele uniq-index [klok] (H12) (na: C5g)
- [ ] C5c reconcilePrescriptions op modality: kracht tegen Hevy, loop tegen Strava Run/TrailRun (H12) (na: C5b, R9, C5g, C5h)

## Prognose en leerlaag

- [ ] C7 Reviewcadans [klok] (H12) (na: C2b)
- [ ] C6 Prognose; projecteert op de historische reeks en hoort daarom na de ankerhistorisering (H12) (na: C5c, R10)
- [ ] C9 Leerlaag Laag 4; regresseert athlete_model_params, wacht op voldoende session_outcomes (H12) (na: C7)

## Datamodel, persistentie en serveropruiming

- [x] C0 Backupverificatie pg_dump + restore-diff (H12) (2026-07-10, log in CLAUDE.md)
- [x] Staging-omgeving (eerste stap van C2b) (2026-07-13)
- [x] C2b Datamodel: vijf tabellen + CRUD-helpers, geverifieerd op staging voor main (H12) (na: C0, C2a) (2026-07-13)
- [ ] D1 Goals-tabel krijgt een consument of vervalt: insertGoal, getActiveGoals en setGoalStatus hebben nul aanroepers terwijl goalsToGoalSet in server.js op het legacy users.goals-JSONB draait; zolang dat zo is schrijft een wizard naar een tabel die de planner niet leest (na: -)
- [ ] H10-F Serveropruiming, puur verwijderwerk zonder gedragswijziging: /api/admin/migrate-to-postgres, loadData/saveData en de startup-backfill weg; calcMetrics (server.js ~288) consolideren met computeLoadMetrics (engine.js); dode hrZones-config in app.js weg (omvat: HC-5-opruimdeel) (H10, H-consistentie) (na: C0)

## Frontend hoofd-app: public/

- [x] Shell, Vandaag, Week herbouwd (MCP-geverifieerd)
- [x] Activiteiten herbouwd, renderActivitiesTab live (H10 punt B) (2026-07-10)
- [x] H10 TSB-projectie backend, Week-tab-herbouw, sweetspot z3-plafond 0,91 systeembreed
- [x] H11-1 Read-path performance: analytics-memo met ?force=1 bypass (2026-07-10)
- [x] H11-3 Kleine frontend-fixes: alert() weg, coach-markdown via renderMarkdown, buildcomment weg (2026-07-10)
- [x] T2-1 Trends shell + segment-navigatie: switchTrendSeg en pf-trend-nav live (2026-07-10)
- [x] T2-3 Trends radar, Seiler-band, PR-grid live (2026-07-10)
- [x] Trends-grafieken clusters 1 t/m 5: chartFtpTrend, chartE1rm, compliance, chartSleep, zone-model (2026-07-10)
- [x] Info-tooltips stat-labels: PF_TIPS + initInfoTooltips live (2026-07-10)
- [x] Power-profile radar (Coggan-categorieën, alleen gemeten vermogen)
- [x] dailyETL-architectuuropruiming: gesommeerde serie weg, strengthDailyETL apart
- [ ] H11-2 Hash-router en tab-state (na: -)
- [ ] H11-8 PWA-basis, manifest + service worker (na: H11-2)
- [ ] H11-7a Activiteiten: KPI's volgen filter en venster, lege-week-CTA, zoekfunctie; alle drie herschrijven hetzelfde filterstatemodel van de tab (omvat: H11-9) (na: -)
- [ ] H11-11 Activiteiten vergelijken (na: H11-2)
- [~] T2-2 Trends afmaken in één traject, want de tab is nog niet volledig herbouwd en losse commits zouden hem twee keer aanraken: palet-herbrand en chrome, lazy render per segment, skeletons en drill-hints, seizoens- en jaarweergave (omvat: T2-4, H11-12) (na: V1, H11-7a)
- [ ] F-Voeding Voeding-tab overhaul (Laag 1) (na: -)
- [ ] C8 Onboardingwizard samen met de Doelen-tab-overhaul; levert doelafstand hardlopen voor de R7-matrix (omvat: frontend-overhaul Doelen) (H12, Laag 1) (na: C4, C5b, D1)
- [ ] F-Coach Coach-tab-overhaul met SSE-streaming via /api/analyse/stream; staat na H11-5 zodat de herbouw het escaping-lek op AI-tekst niet opnieuw introduceert (omvat: H11-14) (Laag 1) (na: H11-5)
- [ ] H10-A Strength-overlay op de weekbelastingsgrafiek, plus het label Fietsbelasting corrigeren: die balk somt elke sessie met TSS, inclusief loopsessies met rTSS (na: -)
- [ ] H11-7b Plateau-kaarten klikbaar en dismissbaar + skeletons Vandaag/Week (na: -)
- [ ] H11-15 Consistentie-tile race + sync-timestamp fmtRelD (na: -)
- [ ] O-fase Fase-waarden referentiekaart ATL/CTL/TSB per trainingsfase in de UI (Openstaand 23 juni) (na: -)

## Activity-detail subapp: activity-detail/src

- [ ] R6 Pa:HR decoupling-drempels 5/10% op running-detail (H13) (na: R0)
- [ ] R8 CS/D'-model hardlopen als optionele geavanceerde laag (H13) (na: R3)
- [ ] H11-10 Interval-overlay ritdetail (na: -)
- [ ] U7 Toetsenbordpad en aria-label op AdMmpChart, AdDualChart en AdRunChart; het AdDualChart-interactiecontract (hoverT, selection, onHover, onSelect) blijft verbatim (UI-audit) (na: -)

## Frontend-breed: tokens, toegankelijkheid, documentshell

- [x] U2 Tokensplitsing --subtle/--text-subtle, --z1 dark, --red op login (style.css, theme.css, login.html) (2026-08-10)
- [ ] U3 Grafiekseries uit tokens in plaats van vaste hex in _chartTheme en _baseChartOpts; geldt voor alle Chart.js-grafieken, niet alleen Trends (na: U2)
- [ ] U4 Formulierbesturing in index.html: labelkoppeling for/id op 72 velden, verwijderknoppen op 24px met aria-label en bevestiging op removeSlot en removePattern (omvat: U6) (na: -)
- [ ] U5 Globale :focus-visible en prefers-reduced-motion in style.css, theme.css en login.html (na: -)
- [ ] U8 Documentshell over index, login, 404 en de detailpagina: koppenstructuur, main-landmark, skiplink, aria-current, dynamische title en themascript, statusgebaseerde foutmeldingen met role=alert en een echt form-element op login (omvat: U9, U10) (na: -)

## Platform: security, observability, auth

- [ ] H11-4 Server hardening: AI-timeouts, login-throttle, multer 2.x (nu 1.4.5-lts) (na: -)
- [ ] H11-5 XSS-escaping van user-controlled strings in één pass, inclusief AI-tekst in adm-ai-text (app.js ~5110) (na: -)
- [ ] H11-13 Data-export CSV/JSON (na: -)
- [ ] Sentry-integratie (lage prioriteit) (na: -)
- [ ] Laag 2 multi-tenant auth (uitgesteld; triggert KvK-beslissing) (na: -)

## Verificatie: nul code, buiten de Nu-afleiding

- [ ] V1 Eén sessie op productie en staging: settings.thresholdPace zetten via het R0-veld, want R9 staat op main en draait daar zonder anker door naar hrTSS, TRIMP of de platte 90/uur; MODEL-tegel classificeert een pyramidale week correct na de z3=0,91-fix; rooktest van de delete-knoppen uit H9 cluster 1 en 2 met de testdata van 6 juni; sportverdeling naar tijd per discipline aanwezig in Trends; palet-herbrand T2-2 visueel vaststellen; latency-nameting tegen de nulmeting van 8 juli (18,1 / 6,5 / 6,2 / 4,3 / 4,2 s) (na: -)
- [x] Railway-backupverificatie (afgedekt door C0) (2026-07-10)

## Beslispunten: wachten op Pieter, buiten de Nu-afleiding

- [!] HC-2 Kalibratiefactor vervallen of repareren; computeCalibrationFactor ijkt nog tegen geschat vermogen en een globale FTP. Bij repareren hoort hij in R10, want het is hetzelfde ankerprobleem.
- [!] HC-4 LTHR-historisering rollend geschat of als handmatige tijdlijn; grootste PMC-impact van de vier ankers, belasting loopt via hrTSS. Zodra de keuze er is hoort hij in R10, anders kost hij een tweede staging-meting.
- [!] H11-12-annotatie: seizoens- en jaarweergave Trends stond geannoteerd als (na: H11-9, zoekfunctie Activiteiten). Die afhankelijkheid is niet onderbouwd. Bevestigen of laten vervallen; H11-12 is inmiddels opgegaan in T2-2.

## Canon en documentatie

- [x] R-doc-a Trainingstheorie geversioneerd onder docs/ (343 regels, zes hardloopsecties, Robineau-correctie) + citeerregel in CLAUDE.md (2026-07-16)
- [x] R-doc-b Dubbele intensiteitssectie geharmoniseerd (na: R-doc-a; geland in de R7-commit) (2026-07-16)

## Gearchiveerde handoffs

Handoff 1 t/m 8, Frontend Overhaul Handoff (origineel), Roadmap Lagen, Tooltip
Aanbevelingen en de research-rapporten zijn afgerond of vervangen. Alle restpunten
daaruit zijn doorgeschoven naar de secties hierboven. Niet heropenen.

Vervallen items: H11-6 (Toegankelijkheid keyboard/aria) is geschrapt en niet
afgevinkt, omdat U4, U5, U7 en U8 exact hetzelfde werk uitgespeld beschrijven;
afvinken zou suggereren dat er twee trajecten waren.

## Besluitlog

Append-only. Nieuwste bovenaan. Eén regel per bevinding die de scope, de volgorde of
een aanname raakt. Format: `YYYY-MM-DD | item | bevinding | gevolg`.

- 2026-08-10 | PROGRESS.md | het bestand was geordend op herkomst (welke handoff), en herkomst is geschiedenis: identiek werk stond daardoor verspreid over secties die elkaar niet kenden, met toegankelijkheid in H11-6 én U4-U8, ankerhistorisering in R10, HC-3, HC-4 en HC-5, en browserverificatie als losse regel in vijf secties | herindeling op code-pad met herkomst als tag; ID's blijven ongewijzigd en samengevoegde items dragen (omvat: ...) zodat elke besluitlogverwijzing vindbaar blijft; samenvoegcriterium vastgelegd als gedeeld code-pad plus gedeelde meetkosten, of het vermijden van dezelfde UI twee keer bouwen
- 2026-08-10 | PROGRESS.md | van de vijftig open items hadden er tweeëndertig geen (na: ...) omdat alleen H12 en H13 als actief traject golden, dus de Nu-afleiding zag maar achttien items en zou stilvallen zodra die twee trajecten leeglopen | het begrip actief traject vervangen door de eis dat elk open item (na: X) of (na: -) draagt; Verificatie en Beslispunten staan expliciet buiten de afleiding
- 2026-08-10 | PROGRESS.md | de unlock-telling gaf vier items met precies één ontgrendeling, waardoor de cluster-ID-tiebreak de facto de prioriteit bepaalde terwijl die tiebreak niets meet | [klok]-markering toegevoegd als tweede sorteersleutel voor items die een dataklok starten en waarbij uitstel kalendertijd kost in plaats van werk; de markering is een door Pieter gezette eigenschap, geen oordeel bij de afleiding
- 2026-08-10 | R9 | de regel dat de merge naar main geblokkeerd was tot thresholdPace op productie staat beschreef een blokkade die niet meer bestond: main en staging zijn byte-identiek op PROGRESS.md, engine.js, planner.js, server.js, app.js en style.css, dus R9 draait op productie en computeRunningLoad valt daar zonder anker door naar hrTSS, TRIMP of de platte durH×75×1,2 oftewel 90 per uur | de blokkaderegel vervalt en het zetten van thresholdPace is verplaatst naar V1 als productieactie; zolang het anker ontbreekt wordt elke loop op productie geboekt alsof hij op 95% van drempelsnelheid ging en loopt de ATL-kant structureel te hoog
- 2026-08-10 | H11-16 | stond op [ ] terwijl C1 op [x] staat, deriveMode in planner.js zijn nowMs als parameter krijgt en planner.js nul new Date()-aanroepen bevat; de regel had bij de C1-commit mee moeten lopen | H11-16 vervalt als eigen regel en staat nu als kruisverwijzing in de C1-regel
- 2026-08-10 | C8 | de statusregel zei (na: C4, C5b) en beide staan op [x], terwijl de besluitlog van 16 juli (na: C4, C5) zei; belangrijker is dat geen van beide het werkelijke probleem raakt, want insertGoal, getActiveGoals en setGoalStatus hebben nog steeds nul aanroepers en goalsToGoalSet leest users.goals-JSONB | nieuw item D1 (goals-tabel krijgt een consument of vervalt) en C8 geannoteerd naar (na: C4, C5b, D1); de tegenspraak tussen statusregel en besluitlog is daarmee opgelost in het voordeel van het feit
- 2026-08-10 | H11-5 | overwogen om de XSS-escaping op te knippen over de tabs die hem raken, zodat elk stuk in de betreffende tab-herbouw zou landen | verworpen: escaping van user-controlled strings hoort één pass te zijn, anders ontstaat hetzelfde patroon als bij de drie kopieën van het tokenstelsel waarvan er twee vergeten werden; H11-5 blijft één item en F-Coach kreeg (na: H11-5) zodat de herbouw het lek niet opnieuw introduceert
- 2026-08-10 | PROGRESS.md | de nieuwe Legenda eist (na: X) of (na: -) op elk open item, maar V1 werd in dezelfde wijziging zonder annotatie opgeschreven; guard 3 sloeg daarop aan | V1 op (na: -), want de sessie wacht nergens op; de guard is bewust niet versoepeld voor de secties Verificatie en Beslispunten, omdat buiten de Nu-afleiding vallen iets anders is dan vrijgesteld zijn van de annotatieplicht en juist dat gat de aanleiding was om (na: -) in te voeren
- 2026-08-10 | U2 | --subtle stond op #bdb6a3/#2a3358 en droeg drie onverenigbare rollen: tekstkleur op acht selectors in style.css (SC 1.4.3, 4,5:1), randkleur van invoervelden en icoonknoppen (SC 1.4.11, 3:1) en kleur van de 90-dagen-bestcurve, de hoogtereeks en de referentielijnen in de activity-detail-subapp (ook 3:1); als tekst haalde hij 1,69:1 in light en 1,28:1 in dark | gesplitst in --subtle (#8a8371/#6470a4, overal boven 3:1) en --text-subtle (#6b6455/#8890b5, overal boven 4,5:1); de referentiecurve blijft daarmee volgbaar maar secundair aan --accent op 12,15:1 respectievelijk 5,12:1
- 2026-08-10 | U2 | de nieuwe --subtle-waarden zijn identiek aan wat de audit als apart --border-strong voorstelde voor invoervelden en icoonknoppen | dat extra token vervalt; de bevindingen F5, F11, A1 en A2 uit het auditrapport zijn hiermee samen één wijziging in drie bestanden
- 2026-08-10 | U2 | het donkere blok in activity-detail/src/theme.css hermapte --z2 t/m --z5 wel maar --z1 niet, waardoor Z1 op 2,39:1 tegen --surface stond tegenover 5,12 tot 11,45 voor de vier zones erboven | --z1 dark op #7d86ab (5,03:1); dit is geen contrastdetail maar een afleesfout, want Z1 is bij polarized en pyramidal de band met het meeste volume en de zonebalk suggereerde in dark een verdeling die zwaarder in Z2-Z5 ligt dan de data zegt
- 2026-08-10 | U2 | public/login.html bleek de derde kopie van het tokenstelsel, als inline style met tien van de drieëntwintig tokens, dus een tokenfix in style.css raakte het inlogscherm niet en de invoerrand bleef daar op 1,33:1 | login.html meegenomen in deze commit; --red toegevoegd zodat de letterlijke #8a2615 en de losse dark-override konden vervallen, en de ongebruikte --border2 verwijderd
- 2026-08-10 | U1 | public/js/app.js had een eigen ZONE_TSS_PER_H met 30/50/70/90/110 per uur naast de canonieke ZONE_IF in planner.js, die IF²×100 rekent en dus 25/42,25/68,89/96,04/125,44 geeft; de kopie negeerde bovendien herhalingen, herstelBlok en _tssZone, waardoor een 4×8min Z4-sessie met 3min herstel op 12 TSS uitkwam in plaats van 56, en saveAiSession schreef die waarde terug in weekPlan | herrekening naar planner.recomputeSessionLoad op het schrijfpad van POST /api/data; de client stuurt geen tss meer mee en de modal toont tijdens bewerken bewust geen TSS
- 2026-08-10 | U1 | recomputeSessionLoad slaat kracht en 'other' over in plaats van er een TSS op te rekenen | krachtbelasting is Foster-sRPE en dus een ander kanaal dan Coggan-TSS; één tss-veld voor beide zou het PMC vervuilen, zelfde redenering als de C5g-regel over actualTSS
- 2026-08-10 | U1 | de UI-auditsectie is niet als actief traject gemarkeerd | acht nieuwe onafhankelijke items zouden anders C5h, C7 en R10 uit de mechanisch afgeleide Nu-sectie verdringen zonder besluit van Pieter

- 2026-07-17 | C5g | de matchlus leunde op de default van sessionModality, die alles wat geen fiets, loop of other is 'strength' geeft; de frontend schrijft de knop Overig weg als type 'custom', dus die kreeg missed=true of werd tegen een Hevy-krachttraining gescoord | matchbron losgetrokken van modaliteit in matchSourceForSession: sessionModality bedient solveWeek en houdt zijn default, de matchlus vraagt om een bron en krijgt null als die er niet is
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
