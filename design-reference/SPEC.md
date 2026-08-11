# SPEC — PeakForm landingspagina

Zelfstandige implementatiespecificatie. Een ontwikkelaar die niet bij het ontwerp aanwezig was, moet de pagina hiermee kunnen bouwen zonder verder te vragen.

---

## 1. Over deze bestanden

`design-reference/PeakForm_Landingspagina_dc.html` is een **ontwerpreferentie in HTML**: een prototype dat laat zien hoe de pagina eruitziet en zich gedraagt. Het is geen productiecode. De opdracht is om dit ontwerp na te bouwen in de bestaande omgeving van het doelproject (React, Vue, Svelte, native — wat er al staat), met de patronen en libraries die daar gelden. Bestaat er nog geen omgeving, kies dan het meest passende framework en implementeer het ontwerp daarin.

Het referentiebestand bevat **twee artboards naast elkaar**: `Desktop — 1440` en `Mobiel — 390`. Het zijn twee weergaven van dezelfde pagina, geen twee pagina's.

## 2. Fidelity

**High-fidelity.** Kleuren, typografie, spacing en interacties zijn definitief. Bouw pixel-getrouw na. Waar dit document een waarde noemt, is die waarde exact bedoeld (inclusief letter-spacings met decimalen).

## 3. Doel van de pagina

Marketing-landingspagina voor **PeakForm**, een trainingsanalyse-tool voor hybride atleten (fietsen/hardlopen én krachttraining). Kernbelofte: krachttraining telt mee in de vormcurve. Eén conversiedoel: **"Begin vandaag"** → aanmelden. Alles op de pagina werkt daarnaartoe.

Taal: Nederlands, informeel je/jij. Toon: rustig, specifiek, onderbouwd — nooit hyperbolisch. Getallen met Nederlandse decimaalkomma. UPPERCASE is uitsluitend voor monospace-labels.

---

## 4. Designtokens

Neem `design-reference/tokens/colors.css` letterlijk over. Kernwaarden (light):

| Token | Waarde | Gebruik |
|---|---|---|
| `--bg` | `#efeadf` | paginabodem |
| `--surface` | `#fdfbf5` | kaarten, header-glas |
| `--surface2` | `#f4efe2` | secundaire secties, binnencellen |
| `--text` | `#06112e` | koppen, waarden, footerbodem |
| `--muted` | `#4a5375` | bodytekst, navlinks |
| `--subtle` | `#8a8371` | monolabels, bijschriften |
| `--border` | `#d8d1bf` | alle 1px-lijnen |
| `--border2` | `#d0c8b6` | secundaire knop-border |
| `--accent` | `#012296` | primair, links, actieve staat |
| `--accent2` | `#0838c2` | hover van accent |
| `--accent-soft` | `rgba(1,34,150,0.08)` | icoonvlakken |
| `--accent-border` | `rgba(1,34,150,0.26)` | randen op accent-soft |
| `--yellow` | `#8a6315` | "intern"-kanaal in diagram |
| `--red` | `#8a2615` | "nooit optellen"-kruis |

Extra kleuren die alleen in de footer/artboard-chrome voorkomen: footerbodem `#06112e`, footerlinks `#cfd4e6`, footerlabels en copyright `#5b6488`, footerbody `#8a93b5`, footerdeler `#16204a`, wordmark-accent in de footer `#7f97ff`. Achtergrond ván het artboard-canvas (`#e4dfd1`) hoort **niet** bij de pagina.

**Radii** (zoals gebruikt op deze pagina): knoppen/inputs 12px · binnencellen 14px · integratiekaarten 18/20px · metriekkaarten 20/22px · herokaart 24/26px · wetenschapskaart 28px · pills en avatars 999px.

**Shadows** (de enige vier op de pagina):
- herokaart desktop `0 24px 50px -18px rgba(6,17,46,0.22)` / mobiel `0 20px 44px -20px rgba(6,17,46,0.22)`
- wetenschapskaart desktop `0 20px 46px -26px rgba(6,17,46,0.22)` / mobiel `0 16px 36px -24px rgba(6,17,46,0.24)`
- metriekkaart desktop `0 10px 26px -20px rgba(6,17,46,0.28)`, mobiel geen
- verder overal: diepte = 1px `--border`.

**Typografie**

| Familie | Rol |
|---|---|
| Inter | body, navlinks, knoplabels |
| Inter Tight, 700/800 | koppen, statwaarden, FAQ-vragen |
| Instrument Serif, italic 400 | één accentwoord ín een kop |
| JetBrains Mono, 700 | elk uppercase eyebrow/label/bijschrift |

---

## 5. Schermopbouw

Volgorde (identiek op beide artboards):

1. Header
2. Hero + productkaart
3. Probleem — "Twee apps, twee halve waarheden."
4. Hoe het werkt — `#hoe-het-werkt`
5. De wetenschap — `#de-wetenschap`
6. Metrieken — "Alles wat telt, op één scherm."
7. Integraties — `#integraties`
8. Maker
9. Vragen — `#vragen`
10. Slot-CTA
11. Footer

De ankers heten in het prototype `#d-werkt` / `#d-wetenschap` / `#d-integraties` / `#d-vragen` omdat er twee artboards in één bestand staan; gebruik in productie de schone namen hierboven.

### 5.1 Header

Sticky, `z-index` boven alles. Desktop: hoogte **76px**, padding `0 144px`. Mobiel: hoogte **64px**, padding `0 20px`, niet sticky nodig maar wel toegestaan.
Achtergrond `rgba(253,251,245,0.82)` (mobiel `0.86`) + `backdrop-filter: blur(18px)`, `border-bottom: 1px solid var(--border)`.

- Links: PeakForm-wordmark (summit-mark `assets/logo.svg` + "Peak" in Inter Tight 800 en "Form" in Instrument Serif italic). Desktop ±130×30px, mobiel ±120×28px.
- Midden (alleen desktop): nav, `display:flex; gap:34px`, links Inter 14px/500 `--muted`, hover `--text`. Labels: **Hoe het werkt · De wetenschap · Integraties · Vragen**.
- Rechts desktop: `gap:22px` — tekstlink **Inloggen** (Inter 14/500 muted) + knop **Begin vandaag**.
- Rechts mobiel: `gap:10px` — knop **Begin** (hoogte 44px, padding `0 16px`) + hamburger 44×44px, `border:1px solid var(--border2)`, radius 12px, drie streepjes 18×1,5px in `--text`, gap 5px.

**Primaire knop (overal gelijk):** `background: var(--accent)`, tekst `#fdfbf5`, Inter 700, radius 12px, `border:1px solid transparent`, transition `background 0.15s`, hover `--accent2`. Desktop header 14px/`12px 20px`; hero en CTA 15px/`16px 26px` (CTA-knop `16px 30px`).
**Secundaire knop:** transparant, `border:1px solid var(--border2)`, tekst `--text`, hover `border-color: var(--subtle)`.

### 5.2 Hero

Desktop padding `104px 144px 112px`. Grid `600px 1fr`, `gap:64px`, `align-items:center`.

Linkerkolom:
- Eyebrow: `VOOR HYBRIDE ATLETEN` — mono 11px/700, `letter-spacing:3px`, uppercase, `--accent`.
- H1, `margin-top:26px`, Inter Tight 800, **70px / line-height 0,98 / letter-spacing −3,2px**, `--text`:
  “Je krachttraining telt niet mee in je vormcurve. Bij PeakForm *wel*.”
  Het woord **wel** is Instrument Serif italic 400, `letter-spacing:-1px`, `--accent`.
- Paragraaf, `margin-top:30px`, Inter 18px/1.6, `--muted`, `max-width:520px`:
  “PeakForm leest je ritten uit Strava en je sets uit Hevy, en rekent beide door in één dagelijks beeld van wat je lichaam vandaag aankan.”
- Knoprij `margin-top:38px`, `gap:14px`: **Begin vandaag** (primair) + **Bekijk hoe het werkt** (secundair, ankert naar `#hoe-het-werkt`).
- Bijschrift `margin-top:20px`: `KOPPELEN DUURT TWEE MINUTEN.` — mono 11/700, ls 2px, uppercase, `--subtle`.

Mobiel: padding `44px 20px 56px`; eyebrow 10px; H1 `margin-top:20px`, **38px / 1,02 / −1,8px** (accentwoord ls −0,5px); paragraaf 16px, `margin-top:22px`; knoppen onder elkaar, `gap:10px`, elk `width:100%; height:52px`; bijschrift 10px, `margin-top:16px`.

### 5.3 Productkaart (rechts in hero, onder de knoppen op mobiel)

`background: var(--surface)`, `border:1px solid var(--border)`, radius 26px (mobiel 24px), padding 20px (mobiel 18px), shadow zie § 4. Mobiel `margin-top:36px`.

1. **Kaartkop** — rij `space-between`, padding `2px 4px 16px` (mobiel `2px 4px 14px`): links `VANDAAG` mono 10/700 ls 2px `--accent`; rechts `DI 11 AUG` idem in `--subtle`.
2. **Readiness-blok** — `background: var(--surface2)`, border, radius 20px (mobiel 18px), padding 22px (18px), `gap:22px` (16px).
   - `ProgressRing`: waarde **78**, size **112** stroke **10** (mobiel size 88 stroke 9), label “78”, unit “Readiness”. SVG-donut, accentkleurige boog, rest in `--border`, `stroke-linecap: round`, animatie op `stroke-dashoffset` 0,3–0,4s.
   - Titel **Goed** — Inter Tight 800, 26px, ls −1px (mobiel 22px/−0,9px).
   - Onderschrift “Fris na twee rustige dagen. Ruimte voor intensiteit.” — Inter 13px/1.45 `--muted`, `max-width:190px` (mobiel 12,5px, vult de breedte).
3. **Statrij** — grid 3 kolommen, `gap:8px`, `margin-top:8px`. Cel: `--surface2`, border, radius 14px, padding 14px (mobiel 13px). Label mono 9/700 ls 2px uppercase `--subtle`; waarde Inter Tight 800 24px (mobiel 22px) ls −1px, `margin-top:6px` (5px).
   `ATL 62` · `CTL 58` · `TSB −4` (echt minteken U+2212).
4. **Sessiestrip** — `margin-top:8px`, `background: rgba(1,34,150,0.06)`, `border:1px solid rgba(1,34,150,0.26)`, radius 18px (mobiel 16px), padding 18px (`14px 16px`), `gap:14px` (12px).
   - Icoonvlak 40×40px (mobiel 36×36), radius 12px (11px), `background: var(--accent)`, icoon `ride` 21px (19px) in `#fdfbf5`.
   - Eyebrow `SESSIE VANDAAG` mono 9/700 ls 2px `--accent`; titel Inter Tight 700 17px ls −0,5px: **“Sweetspot 2×20 min · 75 TSS”**. Mobiel breekt dat in twee regels: titel “Sweetspot 2×20 min” (16px) + mono-regel `75 TSS · 1U 15M` (9px, ls 1,6px, `--muted`).

### 5.4 Probleem

`background: var(--surface2)`, `border-top` en `border-bottom` 1px `--border`. Desktop padding `96px 144px`, mobiel `56px 20px`.

- H2: **“Twee apps, twee halve waarheden.”** Inter Tight 800, desktop 46px/1,04/−2px met `max-width:820px`; mobiel 32px/1,06/−1,4px.
- Daaronder 3 kolommen (`gap:52px`, `margin-top:56px`); mobiel gestapeld, `gap:28px`, `margin-top:32px`.
- Per item: nummer `01`/`02`/`03` in mono 11/700 ls 3px `--accent` (mobiel 10px), daaronder paragraaf Inter 17px/1.6 `--muted` (mobiel 16px), gap 16px (10px).
  1. “Je duurplatform ziet je ritten en je runs, en negeert de deadlifts van gisteren.”
  2. “Je krachtapp telt je sets, en weet niets van de vier uur in zone 2 van zaterdag.”
  3. “Jij moet zelf raden of je vandaag hard kunt. Meestal raad je verkeerd.”

### 5.5 Hoe het werkt — `#hoe-het-werkt`

Desktop padding `104px 144px`; H2 **“Koppelen, doorrekenen, weten.”** (46px/−2px).
Tijdlijn `margin-top:64px`: een horizontale 1px `--border`-lijn op `top:23px` die achter de nummercirkels doorloopt; daarboven 3 kolommen `gap:56px`.
Nummercirkel: 46×46px, radius 999px, `background: var(--bg)`, `border:1px solid var(--border)`, mono 11/700 ls 1px `--accent`.
H3 Inter Tight 700 24px ls −0,8px; paragraaf Inter 16px/1.6 `--muted`; kolom-gap 20px.

Mobiel: padding `56px 20px`, H2 32px; de lijn wordt **verticaal** — `padding-left:64px` op de wrapper, absolute lijn op `left:22px` van `top:12px` tot `bottom:12px`; circles 44×44px met `margin-left:-64px`; items `gap:32px`, binnen-gap 12px; H3 21px/−0,7px.

Inhoud:
1. **Koppel je bronnen** — “Strava voor fietsen en lopen, Hevy voor kracht. Eenmalig autoriseren, daarna komt alles automatisch binnen.”
2. **De engine rekent** — “Geen schattingen. Vermogen, tempo, sets en herhalingen gaan door een deterministisch model dat je belasting per kanaal bijhoudt.”
3. **Elke ochtend één advies** — “Je opent PeakForm en ziet wat vandaag telt. Niet veertien grafieken die je zelf moet interpreteren.”

### 5.6 De wetenschap — `#de-wetenschap`

Eén grote kaart: `--surface`, border, radius 28px, padding 72px, shadow zie § 4. Sectiepadding desktop `8px 144px 104px`. Binnenin grid `1fr 1fr`, `gap:72px`, `align-items:start`.

Links:
- Eyebrow `WAAROM HET WERKT` mono 11/700 ls 3px `--accent`.
- H2 `margin-top:24px`, Inter Tight 800 **52px / 1,02 / −2,4px**: “Twee belastingen die je niet mag optellen.”
- Paragraaf `margin-top:30px`, Inter 17px/1.68 `--muted`:
  “Trainingsstress uit vermogen is externe belasting. Trainingsstress uit krachttraining komt uit sessie-RPE en is interne belasting. Wie die twee optelt, krijgt een getal zonder eenheid. PeakForm houdt ze daarom gescheiden en laat ze alleen samenkomen waar het fysiologisch klopt: in je readiness van vandaag en in de regels die bepalen welke sessies elkaar in de weg zitten.”

Rechts: **diagram-SVG** (`viewBox="0 0 620 470"`, `max-width:520px`, `role="img"`, `aria-label="Twee belastingskanalen die samenkomen in readiness"`). Neem het pad-voor-pad over uit het referentiebestand. Opbouw:
- Twee kolomlabels bovenaan: `EXTERN` (mono 14, ls 3, `#012296`) op x=200 en `INTERN` (`#8a6315`) op x=420.
- Twee verticale lijnen die onderaan naar elkaar toe buigen, elk met twee punten (r=4,5) en labels: links “Vermogen” en “Coggan TSS”, rechts “Sets en RPE” en “Foster session-RPE” (Inter 18/500 `#06112e`).
- In het midden een plusteken (`#8a8371`, 2px) met een rode streep erdoorheen (`#8a2615`, 2,4px) en daaronder `NOOIT OPTELLEN` (mono 14, ls 2,4, `#8a2615`).
- Onderaan een cirkel r=58 (`fill #fdfbf5`, `stroke #06112e` 1,5px) met `READINESS` (mono 13,5) en **78** (Inter Tight 800, 32px, `#012296`).
- Onder het diagram een tekstlink: “Lees de volledige wetenschappelijke onderbouwing” — Inter 15/700 `--accent`, `border-bottom:1px solid var(--accent-border)`, `padding-bottom:2px`.

Mobiel: geen buitenkaart-grid maar één kaart met radius 24px, padding `28px 22px`, sectiepadding `0 20px 56px`; eyebrow 10px; H2 34px/1,03/−1,6px; paragraaf 16px/1.65; diagram in de smalle variant `viewBox="0 0 300 440"` (zelfde opbouw, labels 13px gecentreerd onder de punten met crème `#fdfbf5` rechthoekjes achter de tekst zodat de lijn niet doorloopt); link `margin-top:20px`.

### 5.7 Metrieken

Desktop padding `0 144px 104px`; H2 **“Alles wat telt, op één scherm.”** (46px/−2px). Grid 3×2, `gap:16px`, `margin-top:48px`.
Kaart: `--surface`, border, radius 22px, padding 26px, `gap:12px`, shadow `0 10px 26px -20px rgba(6,17,46,0.28)`.
Per kaart: monolabel 10/700 ls 3px uppercase `--subtle`; waarde Inter Tight 800 46px/1/−2px; paragraaf Inter 15px/1.55 `--muted`.

| Label | Waarde | Tekst |
|---|---|---|
| READINESS | 78 | Slaap, belasting en herstel in één score. |
| ATL CTL TSB | −4 | Je klassieke vormcurve, over alle sporten heen. |
| ACWR | 1.12 | Hoe hard je opbouwt ten opzichte van je basis. |
| MONOTONIE | 1.8 | Of je week genoeg variatie heeft. |
| SESSIE VAN VANDAAG | Sweetspot (40px/−1,8px) | Concreet voorgeschreven, niet ‘doe iets rustigs’. |
| VOEDING EN SLAAP | 2.640 + `kcal` (22px, `--muted`) | Wat je at en sliep, naast wat je verbrandde. |

Mobiel: padding `0 20px 56px`, H2 32px, kaarten gestapeld `gap:12px`, radius 20px, padding 22px, waarde 40px/−1,8px (Sweetspot 36px), geen shadow.

### 5.8 Integraties — `#integraties`

`--surface2` met border boven en onder. Desktop padding `80px 144px`; H2 **“Werkt met wat je al gebruikt.”** Inter Tight 800 38px/1,06/−1,6px. Grid 3 kolommen `gap:16px`, `margin-top:36px`.
Kaart: `--surface`, border, radius 20px, padding 22px, `gap:16px`, `align-items:flex-start`. Icoonvlak 40×40px, radius 12px, `background: var(--accent-soft)`, icoon 21px in `--accent`. Titel Inter Tight 700 19px ls −0,6px; tekst Inter 15px/1.5 `--muted`.

| Icoon | Titel | Tekst |
|---|---|---|
| `ride` (fiets) | Strava | Ritten en runs, automatisch via webhook. |
| `strength` (halter) | Hevy | Krachtsessies, sets en herhalingen. |
| potlood (Tabler `pencil`, stroke 1.8) | Handmatig | Gewicht, slaap, voeding, notities. |

Voetnoot `margin-top:24px`, Inter 15px/1.5 `--subtle`: “Garmin, Whoop en Polar zitten er nu niet in.”

Mobiel: padding `48px 20px`, H2 30px/−1,3px, kaarten gestapeld `gap:10px`, radius 18px, padding 18px, icoonvlak 38×38px, titel 18px, voetnoot 14px.

### 5.9 Maker

Desktop padding `104px 144px`; blok `max-width:760px`, gecentreerd, rij met `gap:32px`, `align-items:center`.
- Foto-placeholder: 104×104px, radius 999px, `--surface2` + border, gecentreerd label `FOTO` in mono 9/700 ls 2px `--subtle`. **Vervang door een echte portretfoto** (`object-fit: cover`).
- Paragraaf Inter 17px/1.66 `--muted`: “PeakForm is gebouwd door één hybride atleet die geen tool kon vinden die zijn krachttraining serieus nam. Elke berekening in het systeem is terug te voeren op gepubliceerd onderzoek, en waar de literatuur geen uitsluitsel geeft staat dat er expliciet bij.”

Mobiel: padding `56px 20px`, kolom gecentreerd `gap:20px`, `text-align:center`, cirkel 88px, tekst 16px/1.65.

### 5.10 Vragen — `#vragen`

Desktop padding `0 144px 112px`, blok `max-width:880px` gecentreerd. H2 **“Vragen.”** 46px/−2px, `margin-bottom:40px`.
Elk item heeft `border-top:1px solid var(--border)`; het laatste item ook `border-bottom`.
- Rij: `space-between`, padding `26px 0`, `gap:24px`, `cursor:pointer`.
- Vraag: Inter Tight 700 22px ls −0,8px `--text`.
- Chevron: 20×20px, stroke `#012296` 2px, `transition: transform 0.2s`, `rotate(180deg)` als het item open is.
- Antwoord: Inter 17px/1.62 `--muted`, `max-width:700px`, `margin-bottom:28px`.

Mobiel: padding `0 20px 56px`, H2 32px met `margin-bottom:24px`, rij-padding `20px 0` en `min-height:44px`, vraag 18px/−0,6px, chevron 18px, antwoord 15px/1.6 met `margin-bottom:22px`.

| Vraag | Antwoord |
|---|---|
| Voor wie is PeakForm bedoeld? | Voor atleten die in dezelfde week fietsen of lopen én zwaar tillen, en die willen weten hoe die twee elkaar beïnvloeden. |
| Heb ik een vermogensmeter nodig? | Nee. Met vermogen wordt het model preciezer, maar hardlopen rekent op tempo en kracht op sets, herhalingen en RPE. |
| Wat gebeurt er met mijn gegevens? | Ze staan op servers in Europa, worden nooit doorverkocht, en je kunt alles exporteren wanneer je wilt. |
| Wat kost het? | Gratis zolang PeakForm in opbouw is. Als er later een betaald plan komt, hoor je dat ruim van tevoren en houd je je volledige historie. |

### 5.11 Slot-CTA

Volle breedte `background: var(--accent)`, desktop padding `120px 144px`, gecentreerd.
- H2 Inter Tight 800 **68px / 1 / −3px** in `#fdfbf5`, `max-width:900px`: “Ken je *vorm*. Elke dag.” — **vorm** in Instrument Serif italic (ls −1px), zelfde crème kleur.
- Knop `margin-top:40px`: `background:#fdfbf5`, tekst `--accent`, Inter 15/700, padding `16px 30px`, radius 12px, hover `opacity:.9`.
- Handle `margin-top:26px`: `@PEAKFORM.ME` mono 11/700 ls 3px `rgba(253,251,245,0.7)`.

Mobiel: padding `64px 20px`, H2 40px/1/−1,8px, knop `width:100%; height:52px`, `margin-top:28px`; handle 10px, `margin-top:20px`.

### 5.12 Footer

`background:#06112e`, desktop padding `72px 144px 40px`.
- Grid `1.4fr 1fr 1fr 1fr`, `gap:48px`.
- Kolom 1: wordmark in donkere variant (`--text:#fdfbf5`, `--accent:#7f97ff`) + blurb Inter 14px/1.6 `#8a93b5`, `max-width:260px`: “Eén dagelijks beeld van duur- en krachtbelasting, voor atleten die beide doen.”
- Kolomkoppen: mono 10/700 ls 3px uppercase `#5b6488`. Links: Inter 14px `#cfd4e6`, hover `#fdfbf5`. Kolom-gap 14px.
  - **Product**: Hoe het werkt · De wetenschap · Integraties · Inloggen
  - **Bronnen**: Trainingstheorie · Veelgestelde vragen · Wat er verandert
  - **Juridisch**: Privacybeleid · Voorwaarden · Gegevensverwerking
- Onderbalk: `margin-top:56px`, `padding-top:24px`, `border-top:1px solid #16204a`, `space-between`. Links (13px `#8a93b5`, gap 24px): Privacybeleid · Voorwaarden · Contact. Rechts: `© 2026 PEAKFORM` mono 10/700 ls 2px `#5b6488`.

Mobiel: padding `48px 20px 28px`; wordmark bovenaan, daaronder de drie linkkolommen als grid `1fr 1fr` met `gap:32px 20px` (de derde kolom valt naar de tweede rij); onderbalk `flex-wrap`, `gap:16px`, copyright `© 2026` rechts uitgelijnd via `margin-left:auto`.

---

## 6. Interactie en gedrag

| Gedrag | Specificatie |
|---|---|
| Sticky header | Blijft bovenaan plakken, `backdrop-filter: blur(18px)`; content scrollt eronderdoor. |
| Ankerlinks | Nav en “Bekijk hoe het werkt” scrollen soepel (`scroll-behavior: smooth`, `scroll-margin-top` gelijk aan de headerhoogte). Respecteer `prefers-reduced-motion`. |
| FAQ-accordeon | Single-open. Bij laden staat item 1 open. Klik op een gesloten item opent het en sluit het vorige; klik op het open item sluit het (dan staat alles dicht). Chevron 180° in 0,2s. Markup: `<button aria-expanded>` + `<div role="region" aria-labelledby>`. |
| Mobiel menu | Hamburger opent een overlay met de vier navlinks + Inloggen + Begin vandaag. Sluit bij klik op een link, op Escape en bij klik buiten. Focus-trap zolang open, `aria-expanded` op de knop. In het artboard alleen in gesloten toestand getekend — houd hem visueel consistent met de rest (crème vlak, 1px borders, mono-labels). |
| Hover | Alleen `color/background/border-color`, 0,15s. Navlinks muted → text; primaire knop accent → accent2; secundaire knop border2 → subtle; footerlinks `#cfd4e6` → `#fdfbf5`. |
| Focus | Zichtbare ring: `outline: 2px solid var(--accent); outline-offset: 2px`. |
| CTA's | Alle “Begin vandaag”/“Begin”-knoppen → dezelfde signup-route. |
| ProgressRing | Boog animeert `stroke-dashoffset` naar 78% in 0,3–0,4s bij eerste weergave; verder statisch. |

Er zijn geen loading-, error- of formulierstaten op deze pagina: het is een statische marketingpagina met één uitgaande route.

## 7. State

Minimaal. Alleen client-state:

- `openFaq: number | null` — index van het open FAQ-item, initieel `0`.
- `mobileMenuOpen: boolean` — initieel `false`.

Geen datafetching. De getallen op de pagina (78, 62, 58, −4, 1.12, 1.8, 2.640) zijn **vaste demowaarden** in de copy, geen live data.

## 8. Responsive

Twee artboards, één implementatie:

- **≥1360px**: horizontale padding 144px, contentbreedte fluid (het artboard is 1440px breed). Overweeg een `max-width` van ±1440px met auto-marges.
- **900–1359px**: dezelfde desktoplayout, horizontale padding schaalt naar 64–96px; hero-grid mag naar `1fr 1fr`.
- **<900px**: alle mobiele waarden uit dit document. Grids worden kolommen, hero-kaart onder de tekst, tijdlijn verticaal, footer 2-koloms, knoppen volle breedte.
- **<600px**: horizontale padding 20px.

Typografie mag je tussen 900 en 1360px vloeiend interpoleren (`clamp()`), zolang de eindpunten exact de waarden uit dit document zijn.

## 9. Assets

| Asset | Herkomst | Opmerking |
|---|---|---|
| `assets/logo.svg` | PeakForm summit-mark uit het designsysteem | meegeleverd |
| Iconen `ride`, `strength` | Tabler Icons (MIT), stroke-width 1.8, 24×24 grid | meegeleverd via het designsysteem; anders direct uit Tabler |
| Potlood-icoon (Handmatig) | Tabler `pencil` | inline SVG in de referentie |
| Twee diagram-SVG's | handgetekend in de referentie | letterlijk overnemen |
| Portretfoto maker | **ontbreekt** | placeholder in het ontwerp; vraag de echte foto op |
| Fonts | Google Fonts: Inter, Inter Tight, Instrument Serif, JetBrains Mono | remote laden, `display: swap` |

## 10. Bestanden in dit pakket

- `PROMPT.md` — de prompt om in Claude Code te plakken.
- `SPEC.md` — dit document.
- `design-reference/PeakForm_Landingspagina_dc.html` — het ontwerp (open in de browser; twee artboards).
- `design-reference/tokens/*.css` — de designtokens van het PeakForm-designsysteem.
- `design-reference/assets/logo.svg` — de summit-mark.

## 11. Definition of done

- Desktop op 1440px en mobiel op 390px zijn visueel niet te onderscheiden van de artboards.
- Alle copy is letterlijk overgenomen, Nederlands, met correcte typografische tekens (`×`, `·`, `−`, ‘ ’).
- FAQ, ankernavigatie en het mobiele menu werken met toetsenbord.
- Geen console-errors, geen layout shift bij het laden van de fonts, Lighthouse-toegankelijkheid ≥95.
