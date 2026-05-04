# Training Dashboard — Installatiegids

## Wat je nodig hebt (eenmalig)
- Node.js: https://nodejs.org → klik op "LTS", download, installeer
- GitHub account: https://github.com/signup
- Railway account: https://railway.app → inloggen met GitHub

---

## Stap 1: Node.js installeren
Download de LTS-versie via nodejs.org en installeer als elk ander programma (Next, Next, Finish).
Controleer daarna in PowerShell (Windows) of Terminal (Mac):
```
node --version
```
Je ziet iets als `v20.x.x`. Dan werkt het.

---

## Stap 2: Claude Code installeren
Open PowerShell of Terminal en plak dit commando:
```
npm install -g @anthropic-ai/claude-code
```
Daarna inloggen:
```
claude
```
Volg de instructies in het scherm (inloggen met je Anthropic/Claude account).

---

## Stap 3: Projectmap klaarzetten
Maak een nieuwe map aan, bijv. op je bureaublad:
```
mkdir training-dashboard
cd training-dashboard
```
Kopieer alle bestanden uit het zip-bestand naar deze map.
De structuur moet er zo uitzien:
```
training-dashboard/
├── server.js
├── package.json
├── .env.example
├── railway.toml
├── public/
│   └── index.html
└── INSTALL.md
```

---

## Stap 4: .env bestand aanmaken
Kopieer .env.example naar .env:
```
cp .env.example .env
```
Open .env in Kladblok (Windows) of TextEdit (Mac) en vul in:
```
STRAVA_CLIENT_ID=235226
STRAVA_CLIENT_SECRET=b3df3100139b07d6072f896dd3821256f6535708
STRAVA_REFRESH_TOKEN=3a529149d296cd7409ed7902c5a7ff37e375ab2e
HEVY_API_KEY=           ← later invullen
ANTHROPIC_API_KEY=      ← later invullen
PORT=3000
```

---

## Stap 5: Dependencies installeren
In dezelfde map:
```
npm install
```
Je ziet een heleboel tekst voorbijkomen, dat is normaal.

---

## Stap 6: Lokaal testen
```
npm start
```
Je ziet: `⚡ Training Dashboard draait op http://localhost:3000`
Open http://localhost:3000 in je browser. Je ziet het dashboard.

---

## Stap 7: Deployen naar Railway (permanent online)

### 7a: Code naar GitHub
Op github.com: klik op "New repository", naam: training-dashboard, Private, klik Create.
Daarna in je terminal:
```
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/JOUW_GEBRUIKERSNAAM/training-dashboard.git
git push -u origin main
```

### 7b: Railway koppelen
1. Ga naar railway.app en log in
2. Klik "New Project" → "Deploy from GitHub repo"
3. Kies je training-dashboard repo
4. Railway detecteert automatisch Node.js

### 7c: Environment variables instellen in Railway
In Railway: ga naar je project → Variables tab → voeg toe:
```
STRAVA_CLIENT_ID        = 235226
STRAVA_CLIENT_SECRET    = b3df3100139b07d6072f896dd3821256f6535708
STRAVA_REFRESH_TOKEN    = 3a529149d296cd7409ed7902c5a7ff37e375ab2e
ANTHROPIC_API_KEY       = (jouw key van console.anthropic.com)
HEVY_API_KEY            = (later)
```

### 7d: Domain genereren
In Railway: Settings → Networking → Generate Domain.
Je krijgt een URL zoals `training-dashboard-production.up.railway.app`.
Die URL werkt overal: thuis, op werk, op je telefoon.

---

## Stap 8: Hevy koppelen (optioneel, doe dit wanneer je wilt)
1. Download de Hevy app en maak een account
2. Ga naar Profiel → Instellingen → API → kopieer je API key
3. Voeg toe aan Railway variables: `HEVY_API_KEY = jouw_key`
4. Railway herstart automatisch

---

## Dagelijks gebruik
- Open de URL (Railway) in je browser
- Overzicht toont automatisch je laatste Strava-activiteiten
- Voeding loggen: Voeding-tab → screenshot van Yazio uploaden
- Gewicht loggen: Overzicht-tab → gewicht invullen → Opslaan
- Analyse: AI-analyse-tab → Genereer analyse

---

## Problemen?
- Server start niet: controleer of alle waarden in .env ingevuld zijn
- Strava laadt niet: refresh token kan verlopen zijn na 6 maanden inactiviteit → nieuwe genereren via Hoppscotch
- Railway deployment mislukt: check de Logs tab in Railway voor de foutmelding
