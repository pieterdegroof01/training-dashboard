# PeakForm voortgang

Statusoverzicht van alle handoff-clusters.

## Nu

Maximaal drie items. Dit is de enige plek waar prioriteit staat; alle andere secties
zijn statusinventaris en zeggen niets over volgorde.

1. R0 Drempeltempo-veld (Handoff 13). Geen afhankelijkheden; ontgrendelt de meeste
   vervolgitems (4).
2. C7 Reviewcadans (na: C2b, klaar). Ontgrendelt C9.
3. C8 Onboarding (na: C4, klaar; loopt samen met frontend-overhaul Doelen-tab).

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
- [ ] C5 Multimodale weeksolver (na: C3, C4, R0, R1, R3, R4)
- [ ] C6 Prognose (na: C5)
- [ ] C7 Reviewcadans (na: C2b)
- [ ] C8 Onboarding (na: C4; loopt samen met frontend-overhaul Doelen-tab)
- [ ] C9 Leerlaag Laag 4 (na: C7; wacht op voldoende session_outcomes)

## Handoff 13: Hardlopen gestructureerd (actief traject, onderzoek 2026-07-15)
- [ ] R0 Drempeltempo-veld settings.thresholdPace in sec/km + Doelen-UI + validatie; activeert rTSS/IF in computeRunningLoad (engine.js ~1867)
- [ ] R1 Loopzones Z1-Z6 op drempelsnelheid + eigen RUN_ZONE_IF-tabel in engine.js, puur (na: R0)
- [ ] R2 Seiler-mapping loopzones zodat fiets en loop in één TID-analyse vallen (na: R1)
- [ ] R3 Loopblok-builders buildRunSession in planner.js, puur, analoog aan buildSession (na: R1)
- [ ] R4 Interferentieparameters: loopweging 1.5-2x fiets, 6u ondergrens, 24u voorkeur, EIMD 48u (na: R1)
- [ ] R5 ACWR-loopband 0.8-1.3 + single-run-spike-guard t.o.v. langste run 30 dagen (na: R1)
- [ ] R6 Pa:HR decoupling-drempels 5/10% op running-detail (na: R0)
- [ ] R7 Periodiseringsprofielen per atleetsituatie: tijdsbudget, niveau, doeltype (na: R3)
- [ ] R8 CS/D'-model hardlopen als optionele geavanceerde laag (na: R3)
- [!] R-doc Trainingstheorie versioneren in repo onder docs/ + framing per atleetsituatie i.p.v. time-crunched (beslissing Pieter)

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
- [ ] Running detail: threshold pace instellingenveld (activeert rTSS en IF)
- [ ] Running detail: engine-laag GAP/NGP/rTSS/decoupling/CS-D' (na: threshold pace-veld)
- [ ] Running detail: React frontend AdRunChart (na: engine-laag)
- [ ] Staging-omgeving (eerste stap van C2b, niet standalone)
- [ ] Sentry-integratie (lage prioriteit, geen afhankelijkheden)
- [ ] Laag 2 multi-tenant auth (uitgesteld; triggert KvK-beslissing)

## Besluitlog

Append-only. Nieuwste bovenaan. Eén regel per bevinding die de scope, de volgorde of
een aanname raakt. Format: `YYYY-MM-DD | item | bevinding | gevolg`.

- 2026-07-15 | PROGRESS.md | Nu-sectie liep uit de pas en noemde C1, staging en C2b terwijl die alle drie op [x] stonden; oorzaak was dat alleen Pieter hem mocht herschrijven, waardoor niemand het deed | regel omgedraaid: Nu is een afgeleide weergave die elke commit meeloopt, mechanisch afgeleid uit de (na: ...)-annotaties, met STOP bij ambiguïteit en een [vast]-markering als override voor Pieter
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
