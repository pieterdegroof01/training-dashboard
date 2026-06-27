// Mock data voor activiteit id:4 — Sweet spot 3×12
// Verrijkt met ref-velden, isPr-flags, en context voor de interface.

const N = 64;

const rideW = (i) => {
  const p = i / (N - 1);
  if (p < 0.12) return Math.round(128 + (p / 0.12) * 52);
  if (p > 0.86) return Math.round(168 - ((p - 0.86) / 0.14) * 58);
  const w = (p - 0.12) / 0.74, seg = w * 3, frac = seg - Math.floor(seg);
  const on = frac < 0.66, noise = Math.sin(i * 1.7) * 6;
  return Math.round((on ? 247 : 150) + noise);
};

const rideHR = (i) => {
  const p = i / (N - 1), base = 118 + p * 40;
  const w = (p - 0.12) / 0.74, seg = w * 3, frac = seg - Math.floor(seg);
  const on = p > 0.12 && p < 0.86 && frac < 0.66;
  return Math.round(base + (on ? 9 : -4) + Math.sin(i * 1.3) * 3);
};

const ser = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

// Sessie-classificatie op basis van IF + VI (niet op zone-bucket)
// IF 0.89 (0.85–0.95) + VI 1.03 (1.00–1.05) → Sweetspot
export function classifySession(ifVal, vi) {
  const v = parseFloat(ifVal);
  if (v < 0.75) return 'Herstel / Endurance';
  if (v < 0.85) return 'Tempo';
  if (v < 0.95) {
    if (parseFloat(vi) <= 1.10) return 'Sweetspot';
    return 'Sweetspot (variabel)';
  }
  if (v < 1.05) return 'Threshold';
  return 'VO2max / Anaeroob';
}

export const activity = {
  id: 4,
  kind: 'ride',
  name: 'Sweet spot 3×12',
  when: 'Zaterdag 9 mei · 08:20',
  where: 'Vlaamse Ardennen · 8,4°C',
  source: 'Strava',
  sessionType: 'Sweetspot', // IF=0.89, VI=1.03 → niet op zone-bucket

  ftp: 268,
  maxHr: 171,

  metrics: [
    { l: 'AFSTAND',  v: '52.0', u: 'km' },
    { l: 'TIJD',     v: '2u 04', u: '' },
    { l: 'TSS',      v: '118', u: '', accent: true },
    { l: 'NP',       v: '238', u: 'W' },
    { l: 'GEM. W',   v: '226', u: 'W' },
    { l: 'GEM. HR',  v: '154', u: 'bpm' },
    { l: 'STIJGING', v: '612', u: 'm' },
    { l: 'SNELHEID', v: '25.1', u: 'km/u' },
  ],

  // Verrijkt: elke cel heeft nu een ref en/of conventie-indicator
  derived: [
    {
      v: '0.89',
      l: 'IF',
      sub: 'Sweetspot · 0.85–0.95',
      ref: { label: 'vs gepland', value: '0.90' },
      convention: true,
      conventionNote: 'IF-zones zijn coaching-conventies (Coggan/TrainingPeaks), niet peer-reviewed gevalideerd. NP, IF en TSS zijn eigendomsalgoritmes van TrainingPeaks.',
    },
    {
      v: '1.03',
      l: 'VI',
      sub: 'Stabiel tempo',
      ref: { label: '1.00–1.05 band' },
      convention: true,
      conventionNote: 'VI-banden zijn coaching-conventies (TrainingPeaks), niet peer-reviewed gevalideerd.',
    },
    {
      v: '1.55',
      l: 'EF',
      sub: 'NP / gem. HR',
      ref: { label: '30d gem.', value: '1.51', direction: 'up', delta: '+0.04' },
    },
    {
      v: '3.4%',
      l: 'KOPPELING',
      sub: '✓ Goed (<5%)',
      good: true,
      convention: true,
      conventionNote: 'De 5%-grens voor aerobe decoupling is een coaching-conventie (TrainingPeaks), niet peer-reviewed gevalideerd. Minder valide bij VI > 1.10 of duur < 20 min.',
    },
  ],

  route: 'M28,150 C44,96 78,74 104,96 C128,116 120,158 150,166 C182,174 198,118 226,108 C256,97 268,150 296,142 C326,133 332,78 360,70',

  elevation: ser(48, (i) => 60 + Math.sin(i / 48 * Math.PI * 3) * 22 + Math.sin(i * 0.5) * 6),

  series: {
    primary:   { label: 'Vermogen', unit: 'W',   colorKey: 'accent', values: ser(N, rideW), fill: true },
    secondary: { label: 'Hartslag', unit: 'bpm', colorKey: 'red',    values: ser(N, rideHR) },
    xLabels: ['0', '30m', '1u', '1u30', '2u'],
  },

  // Zones: cssVar voor thema-correcte kleuren, staticColor voor SVG-fallback
  zones: [
    { z: 'Z1', name: 'Herstel',   min: 14, cssVar: '--z1', c: '#4a5375' },
    { z: 'Z2', name: 'Endurance', min: 32, cssVar: '--z2', c: '#175a3b' },
    { z: 'Z3', name: 'Tempo',     min: 14, cssVar: '--z3', c: '#8a6315' },
    { z: 'Z4', name: 'Threshold', min: 52, cssVar: '--z4', c: '#0838c2' },
    { z: 'Z5', name: 'VO2max',    min: 12, cssVar: '--z5', c: '#8a2615' },
  ],

  planned: {
    title: 'Sweet spot 3×12 @ 90% FTP',
    tss: 120,
    zoneMin: [12, 28, 12, 56, 0],
    blocks: [
      { t: 'Warm-up',           d: 12, z: 0 },
      { t: '12 min @ 90–94% FTP', d: 36, z: 3, rep: 3, rest: '6 min Z1' },
      { t: 'Endurance',         d: 20, z: 1 },
      { t: 'Cooldown',          d: 8,  z: 0 },
    ],
  },

  cadence: { avg: 88, max: 104 },

  // MMP: isPr=false want sweetspot is geen all-out poging
  mmp: [
    { t: '5s',  ride: 824, best: 1180, isPr: false },
    { t: '30s', ride: 540, best: 712,  isPr: false },
    { t: '1m',  ride: 432, best: 598,  isPr: false },
    { t: '5m',  ride: 318, best: 352,  isPr: false },
    { t: '20m', ride: 264, best: 282,  isPr: false },
    { t: '60m', ride: 238, best: 254,  isPr: false },
  ],

  decoupling: { ef1: 1.58, ef2: 1.53, pct: 3.4, status: 'goed' },

  dist: {
    power: [{ l: '<120', c: 6 }, { l: '120–160', c: 11 }, { l: '160–200', c: 9 }, { l: '200–240', c: 7 }, { l: '240–260', c: 38 }, { l: '>260', c: 5 }],
    hr:    [{ l: '<120', c: 4 }, { l: '120–135', c: 9 }, { l: '135–150', c: 14 }, { l: '150–160', c: 32 }, { l: '>160', c: 12 }],
    cad:   [{ l: '<70', c: 5 }, { l: '70–85', c: 12 }, { l: '85–95', c: 36 }, { l: '95–105', c: 14 }, { l: '>105', c: 3 }],
    speed: [{ l: '<18', c: 7 }, { l: '18–24', c: 16 }, { l: '24–30', c: 28 }, { l: '30–38', c: 13 }, { l: '>38', c: 4 }],
  },

  scatter: ser(N, (i) => ({ x: rideW(i), y: rideHR(i) })),

  quadrant: ser(N, (i) => ({
    x: 78 + Math.round((rideW(i) > 200 ? 13 : 2) + Math.sin(i * 1.9) * 6),
    y: rideW(i),
  })),

  drift: ser(40, (i) => 1.61 - (i / 40) * 0.09 + Math.sin(i * 0.8) * 0.025),

  // W'bal: sub-threshold sweetspot → W'bal blijft vrijwel vol (correct gedrag)
  wbal: {
    cp: 258,         // Critical Power (FTP als proxy, met notitie)
    wPrime: 21000,   // 21 kJ typisch gemiddelde
    series: ser(N, (i) => {
      // Sweetspot blokken liggen onder CP → nauwelijks W' verbruik, herstel snel
      const p = i / (N - 1);
      const w = rideW(i);
      const cp = 258;
      const wPrime = 21000;
      // Skiba differentiaalmodel (vereenvoudigd voor mock): W' verbruik alleen boven CP
      const excess = Math.max(0, w - cp);
      const drain = excess * (1 / 30); // ~30s tijdconstante
      const recover = Math.max(0, cp - w) * (1 / 180);
      // Cumulatief schatten — bij sweetspot blijft dit hoog
      const balance = wPrime - (p * excess * 60 * 2); // grove benadering
      return Math.max(15000, Math.min(wPrime, balance + Math.sin(i * 0.4) * 800));
    }),
  },

  ai: 'Sterke uitvoering — je hield de drie blokken strak op 244–250 W (doel 241–252 W) met een variabiliteitsindex van 1.03, dus weinig verspilde pieken. De aerobe koppeling van 3,4 % laat zien dat je cardiovasculair stabiel bleef tot het einde; geen drift door uitputting. Je tweede en derde blok lagen 4 bpm hoger bij gelijk vermogen — normaal bij sweet spot door accumulerende warmte en vermoeidheid. Je W\'bal bleef vrijwel vol gedurende de hele rit: de blokken lagen correct sub-threshold, precies het signaal dat de sessie goed gedoseerd was. Voor de volgende stap: verleng naar 3×15 of til naar 95% FTP. Eet binnen 30 min ~40 g eiwit, dit was je zwaarste sessie van de week (118 TSS).',

  // Context & interferentie (fiets = lage interferentie-modaliteit)
  context: {
    hoursSinceStrength: 40,    // Vrijdag gym (beendag) → 40u voor deze rit
    lastStrengthWasLegs: true, // Relevante interferentie: benen
    tsbRide: 4,                // Fiets-specifieke TSB (apart van kracht/loop)
    sessionOrder: null,        // Geen tweede sessie vandaag
  },
};
