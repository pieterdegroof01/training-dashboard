# PeakForm voortgang

Statusoverzicht van alle handoff-clusters. Regel: elke commit die een item (deels) uitvoert werkt dit bestand bij in dezelfde commit. Statussen: [ ] open, [~] deels, [x] klaar, [!] wacht op beslissing of verificatie door Pieter. Datum achter elke statuswijziging.

## Handoff 12: Planner redesign (actief traject)
- [x] C0 Backupverificatie pg_dump + restore-diff (2026-07-10, log in CLAUDE.md)
- [ ] C1 Determinisme: nowMs-injectie deriveMode + event-branch buildPlan (= H11 cluster 16, H10 punt C)
- [x] C2a Supersede-bug: nieuwe atomische replaceActivePrescriptions (db.js) vervangt de losse insertPrescription-lus in server.js; uniq_presc_active + modality-dedupe voorkomen dubbele actieve voorschriften. Vervolgfix (2026-07-10): het supersede-venster begon foutief op de maandag van de planweek i.p.v. vandaag, waardoor verstreken voorschriften zonder opvolger stilzwijgend gesupersedeerd raakten en nooit werden gereconcilieerd; venstberekening geëxtraheerd naar pure computePlanWindow(prescriptionDates, nowMs) in planner.js (2026-07-10)
- [ ] C2b Datamodel
- [ ] C3 Backward planner
- [ ] C4 Tweetraps beschikbaarheid
- [ ] C5 Multimodale weeksolver
- [ ] C6 Prognose
- [ ] C7 Reviewcadans
- [ ] C8 Onboarding
- [ ] C9 Leerlaag (Laag 4, wacht op session_outcomes data)

## Handoff 11: Bugs, UX, features
- [x] Cluster 1 Read-path performance: analytics-memo met ?force=1 bypass live in server.js (geverifieerd 2026-07-10)
- [ ] Cluster 2 Hash-router en tab-state (voorwaarde voor cluster 11)
- [x] Cluster 3 Kleine frontend-fixes: alert() weg, coach-markdown via renderMarkdown, buildcomment weg (geverifieerd 2026-07-10)
- [ ] Cluster 4 Server hardening: AI-timeouts, login-throttle, multer 2.x (nu nog 1.4.5-lts)
- [ ] Cluster 5 XSS-escaping user-controlled strings, incl. AI-tekst in adm-ai-text (app.js ~5110)
- [ ] Cluster 6 Toegankelijkheid (keyboard, aria)
- [ ] Cluster 7a Activiteiten-KPI's volgen filter en venster + lege-week CTA
- [ ] Cluster 7b Plateau-kaarten klikbaar/dismissbaar + skeletons Vandaag/Week
- [ ] Cluster 8 PWA-basis (manifest + service worker, na 1 en 2)
- [ ] Cluster 9 Zoekfunctie activiteiten
- [ ] Cluster 10 Interval-overlay ritdetail
- [ ] Cluster 11 Activiteiten vergelijken (na cluster 2)
- [ ] Cluster 12 Seizoens- en jaarweergave Trends (na 9)
- [ ] Cluster 13 Data-export CSV/JSON
- [ ] Cluster 14 SSE-streaming Coach (/api/analyse/stream)
- [ ] Cluster 15 Consistentie-tile race + sync-timestamp fmtRelD
- [ ] Cluster 16 now-injectie deriveMode (= H12 C1, daar uitvoeren)
- [!] Verificatie: MODEL-tegel classificeert pyramidale week correct na z3=0,91-fix (browser, bij eerstvolgende smoketest)
- [x] Verificatie: Railway-backupverificatie (afgedekt door H12 C0, 2026-07-10)
- [ ] Verificatie: latency-nameting na cluster 1 vastleggen tegen nulmeting 8 juli (18,1s / 6,5s / 6,2s / 4,3s / 4,2s)

## Handoff Historische consistentie (FTP/gewicht/zones/CP)
- [x] Cluster 1 CP-toekomstlek: bovengrens <= now in computeCriticalPower + regressietest (geverifieerd 2026-07-10, engine.js ~1342)
- [!] Cluster 2 Kalibratiefactor: beslissing vervallen of repareren (computeCalibrationFactor ijkt nog tegen geschat vermogen + globale FTP)
- [ ] Cluster 3 Gewicht-historisering: weightAt promoveren naar gedeelde weightForDate() in engine.js
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
- [ ] Punt F Opruimen: /api/admin/migrate-to-postgres + loadData/saveData verwijderen (ONTGRENDELD door C0)
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
- [ ] Doelen
- [ ] Coach + chat (vereist H11 cluster 14 SSE)

## Openstaand-lijst 2026-06-23 (restpunten)
- [x] Info-tooltips stat-labels: PF_TIPS + initInfoTooltips live (geverifieerd 2026-07-10)
- [x] Power-profile radar gebouwd (Coggan-categorieën, alleen gemeten vermogen)
- [x] dailyETL-architectuuropruiming (gesommeerde serie weg, strengthDailyETL apart)
- [x] Kracht/cardio eenheidsfork beantwoord: Foster sRPE-kanaal, gescheiden van PMC (verwerkt in H12-ontwerp)
- [ ] Fase-waarden referentiekaart (ATL/CTL/TSB per trainingsfase) in UI

## Overig
- [ ] Running detail: threshold pace instellingenveld (activeert rTSS en IF, eerst)
- [ ] Running detail: engine-laag GAP/NGP/rTSS/decoupling/CS-D'
- [ ] Running detail: React frontend AdRunChart
- [ ] Staging-omgeving (eerste stap van het eerstvolgende write-path cluster, niet standalone)
- [ ] Sentry-integratie (lage prioriteit)
- [ ] Laag 2 multi-tenant auth (uitgesteld; triggert KvK-beslissing)

## Gearchiveerde handoffs
Handoff 1 t/m 8, Frontend Overhaul Handoff (origineel), Roadmap Lagen, Tooltip Aanbevelingen en de research-rapporten zijn afgerond of vervangen. Alle restpunten daaruit zijn doorgeschoven naar de secties hierboven via de Openstaand-lijst van 23 juni en Handoffs 10 t/m 12. Niet heropenen.
