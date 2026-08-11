# design-reference — PeakForm landingspagina

Ontwerpbundel voor de publieke landingspagina (`/welkom`). Dit is **referentiemateriaal**,
geen productiecode en geen build-input. Niets in deze map wordt door de server gelezen.

## Bron van waarheid

`SPEC.md` is de specificatie: exacte maten, kleuren, typografie, copy, states en
responsive gedrag. Waar SPEC.md een waarde noemt is die exact bedoeld, inclusief
letter-spacings met decimalen. Bouw hiertegen, niet tegen de HTML.

`PeakForm_Landingspagina_dc.html` is het ontwerpprototype: twee artboards naast elkaar
(desktop 1440, mobiel 390) in één bestand. Kijken, niet overnemen. De ankers heten daar
`#d-werkt` / `#d-wetenschap` / `#d-integraties` / `#d-vragen` omdat er twee artboards in
één document staan; in productie zijn dat `#hoe-het-werkt`, `#de-wetenschap`,
`#integraties` en `#vragen`.

`desktop-1440.png` en `mobiel-390.png` zijn volledige paginascreenshots en de
controlebeelden voor pixelgetrouwheid.

## Stackbeslissing (afwijkend van de generieke handoff)

`PROMPT_VERVALLEN.md` is de originele, generieke handoff-prompt. **Niet uitvoeren.**
Hij noemt Next.js als fallback en dat geldt hier niet. De landingspagina wordt gebouwd
als `views/landing.html`, `public/css/landing.css` en `public/js/landing.js`, geserveerd
door `server.js` via hetzelfde readFileSync-plus-cachebusting-patroon als `INDEX_HTML`.
Geen framework, geen extra buildstap, geen nieuwe dependency.

De landing draait op `/welkom`, niet op `/`. `/` blijft het dashboard en redirect met
**302** (nooit 301) naar `/welkom` als er geen geldige sessie is. Reden: één URL die
afhankelijk van een cookie twee verschillende dingen serveert, is de constructie waarbij
één Cloudflare-cacheregel het volledige dashboard aan willekeurige bezoekers uitlevert.

## Tokens

`tokens/*.css` komt uit het PeakForm-designsysteem. `colors.css` wordt letterlijk
overgenomen in `public/css/landing.css`, inclusief het `[data-theme="dark"]`-blok ook al
gebruikt de landing dat nog niet. De landing importeert `public/css/style.css`
bewust niet: dat is de dashboard-CSS met eigen resets en tabspecifieke regels.

## Bekende gaten

- Portretfoto bij de maker-sectie ontbreekt; in het ontwerp staat een `FOTO`-placeholder.
- Het mobiele menu is alleen in gesloten toestand getekend. De open staat is beschreven
  in SPEC.md § 6, niet ontworpen.
- `/aanmelden` is voorlopig één statische pagina met een mailto. Een echt opvangpunt
  (wachtlijst) staat als L2 in PROGRESS.md en hangt achter Laag 2 multi-tenant auth.

## Status

PROGRESS.md, sectie "Frontend hoofd-app: public/": L1 (landingspagina) en L2 (wachtlijst).
