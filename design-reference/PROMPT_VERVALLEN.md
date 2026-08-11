> **VERVALLEN VOOR DIT PROJECT. NIET UITVOEREN.**
>
> Dit bestand hoort bij de generieke ontwerp-handoff en kent de stack van PeakForm niet.
> Twee punten hierin zijn expliciet overruled:
>
> 1. De fallback "gebruik Next.js (App Router)" geldt **niet**. PeakForm is Express met
>    vanilla HTML/CSS/JS; de landingspagina wordt `views/landing.html` +
>    `public/css/landing.css` + `public/js/landing.js`, geserveerd via hetzelfde
>    readFileSync-plus-cachebusting-patroon als `INDEX_HTML` in `server.js`.
>    Er komt geen framework, geen buildstap en geen npm-dependency bij.
> 2. De signup-route `/aanmelden` is geen aanname maar een openstaand item: multi-tenant
>    auth (Laag 2 in PROGRESS.md) is uitgesteld. Alle CTA's wijzen naar `/aanmelden`,
>    dat voorlopig één statische pagina is zonder formulier of database.
>
> De uitvoerbare prompts staan niet hier. Zie `SPEC.md` voor de specificatie en
> PROGRESS.md items L1 en L2 voor de status.

---

# Claude Code prompt — PeakForm landingspagina

> Plak alles hieronder (vanaf de regel `---`) in Claude Code, met deze map als working directory.

---

Bouw de PeakForm-landingspagina exact volgens het bijgeleverde ontwerp.

## Context

- `design-reference/PeakForm_Landingspagina_dc.html` is de **visuele referentie**: één bestand met twee artboards naast elkaar — desktop 1440px en mobiel 390px. Het is een prototype, geen productiecode. Neem het niet over; herbouw het in de stack van dit project.
- `SPEC.md` in deze map is de volledige, zelfstandige specificatie: exacte maten, kleuren, typografie, copy, states en gedrag. **Dat is de bron van waarheid.** De HTML gebruik je om te kijken, de SPEC om te bouwen.
- `design-reference/tokens/*.css` bevat de designtokens van het PeakForm-designsysteem. Neem `colors.css` letterlijk over als CSS custom properties (inclusief het dark theme-blok, ook al gebruikt de landing dat nog niet).
- De pagina is **volledig Nederlands**. Neem de copy letterlijk over uit SPEC.md — geen herformuleringen, geen extra secties, geen placeholder-lorem.

## Werkwijze

1. Inspecteer eerst het project: framework, bestaande componentstructuur, styling-aanpak (CSS modules / Tailwind / styled-components), routing, fonts. Sluit daarbij aan. Is er nog niets, gebruik dan Next.js (App Router) + plain CSS met custom properties.
2. Lees `SPEC.md` volledig door voordat je begint. Open `design-reference/PeakForm_Landingspagina_dc.html` in de browser om beide artboards te zien.
3. Zet eerst de fundamenten: tokens, fonts, resets, en een `Container`/section-ritme. Bouw daarna secties in volgorde van de pagina, elk als eigen component.
4. Vergelijk na elke sectie met het artboard op 1440px én 390px.

## Harde eisen

- **Pixel-getrouw op 1440 en 390.** Alle waarden in SPEC.md zijn exact: neem font-sizes, letter-spacings (tot op 0,2px), line-heights, paddings, gaps, radii en shadows één op één over. Rond niet af naar een spacing-schaal.
- **Typografie**: Inter (body/UI), Inter Tight (koppen + grote getallen, weight 800), Instrument Serif italic (het accentwoord ín een kop), JetBrains Mono (élk uppercase labeltje/eyebrow). Google Fonts, `display: swap`, preconnect.
- **Kleur**: gebruik uitsluitend de tokens. Eén accent (`--accent #012296`, hover `--accent2 #0838c2`). Geen nieuwe kleuren, geen gradients, geen fotografie of illustraties (behalve de twee SVG-diagrammen en de logo-mark).
- **Diepte is een 1px border**, geen shadow — behalve waar SPEC.md expliciet een shadow noemt.
- **Motion**: alleen `0.15s` op `color / background / border-color` voor hover, en `0.2s transform` op de FAQ-chevron. Geen scroll-animaties, geen entrance-choreografie, tenzij je ze achter `prefers-reduced-motion` zet.
- **Responsive**: de twee artboards zijn de eindpunten, niet twee losse pagina's. Bouw één fluid layout met een breakpoint op **900px** (desktop-waarden erboven, mobiele waarden eronder). Horizontale padding schaalt van 144px (≥1360px) naar 20px (<600px) — zie SPEC.md § Responsive.
- **Toegankelijkheid**: semantische landmarks (`header`/`nav`/`main`/`section`/`footer`), één `h1`, logische h2/h3-volgorde, FAQ als `<button aria-expanded>` + region, zichtbare focus-ring in `--accent`, touch targets ≥44px op mobiel, `alt`/`aria-label` op de SVG-diagrammen, en de decoratieve iconen `aria-hidden`.
- **Geen inhoudelijke vrijheid**: voeg geen prijzen, testimonials, logo-balken, cookiebanners of extra CTA's toe die niet in de SPEC staan.

## Interactie die echt moet werken

- Sticky header met blur-achtergrond; ankerlinks scrollen soepel naar `#hoe-het-werkt`, `#de-wetenschap`, `#integraties`, `#vragen`.
- FAQ-accordeon: één item tegelijk open, eerste item open bij laden, opnieuw klikken sluit het item, chevron roteert 180°.
- Mobiel menu achter de hamburger (in het artboard alleen gesloten getekend): full-width overlay met dezelfde vier nav-links + Inloggen, sluit op link-klik en op Escape.
- Alle "Begin vandaag"-knoppen wijzen naar dezelfde signup-route (`/aanmelden`, of wat dit project al gebruikt).
- De foto-cirkel bij "gebouwd door één hybride atleet" is een placeholder — laat een `<img>`-slot achter met een duidelijke TODO.

## Oplevering

- Werkende pagina + korte `IMPLEMENTATIE.md`: welke componenten je maakte, waar de tokens staan, en elk punt waar je van de SPEC afweek en waarom.
- Geen console-errors, geen layout shift bij het laden van de fonts, Lighthouse-toegankelijkheid ≥95.
