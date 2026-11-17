const { useState, useEffect, useRef, useMemo } = React;

/* ---------- Helpers ---------- */
const LS_KEY = 'fightcamp_v1';
const z2 = n => String(n).padStart(2, '0');
const todayKey = (d = new Date()) => d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate());
const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return todayKey(d); };
const weekdayIdx = (d = new Date()) => { const w = d.getDay(); return w === 0 ? 7 : w; };
const fmt = s => Math.floor(s / 60) + ':' + z2(Math.max(0, s % 60));
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Audio ---------- */
let AC = null;
function ac() {
  try {
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  } catch (e) { return null; }
}
function bell(times = 1) {
  const c = ac(); if (!c) return;
  for (let k = 0; k < times; k++) {
    const t0 = c.currentTime + 0.02 + k * 0.45;
    [[620, 0.45], [1243, 0.22], [1867, 0.12], [2512, 0.07], [3140, 0.04]].forEach(([f, g]) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      o.connect(gn).connect(c.destination); o.start(t0); o.stop(t0 + 2.3);
    });
  }
}
function knock(n = 3) {
  const c = ac(); if (!c) return;
  for (let k = 0; k < n; k++) {
    const t0 = c.currentTime + 0.02 + k * 0.17;
    const len = Math.floor(c.sampleRate * 0.07);
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 3.5;
    const g = c.createGain(); g.gain.value = 2.2;
    src.connect(bp).connect(g).connect(c.destination); src.start(t0);
  }
}
function beep(n = 3, f = 1320) {
  const c = ac(); if (!c) return;
  for (let k = 0; k < n; k++) {
    const t0 = c.currentTime + 0.02 + k * 0.22;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 0.16);
  }
}

/* ---------- Speech ---------- */
const VOICE_PREF = { name: null, pitch: 0.95 };
function allDeVoices() {
  try {
    const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return vs.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('de'));
  } catch (e) { return []; }
}
function deVoice() {
  const vs = allDeVoices();
  if (VOICE_PREF.name) { const m = vs.find(v => v.name === VOICE_PREF.name); if (m) return m; }
  return vs.find(v => v.lang.toLowerCase().replace('_', '-') === 'de-de') || vs[0] || null;
}
function speak(text, rate = 1.15, interrupt = true) {
  try {
    const s = window.speechSynthesis; if (!s || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = deVoice(); u.lang = v ? v.lang : 'de-DE'; if (v) u.voice = v; u.rate = rate; u.pitch = VOICE_PREF.pitch;
    if (interrupt) s.cancel();
    s.speak(u);
  } catch (e) { }
}
try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { }; } catch (e) { }

/* ---------- Content ---------- */
const RANKS = [
  { name: 'Anfänger', xp: 0 },
  { name: 'Amateur', xp: 500 },
  { name: 'Sparringspartner', xp: 1500 },
  { name: 'Contender', xp: 3500 },
  { name: 'National Champion', xp: 7000 },
  { name: 'World Champion', xp: 12000 },
];

const NUT_ITEMS = [
  { id: 'pre', label: '🍌 Vor dem Training etwas Leichtes gegessen', sub: 'z. B. eine Banane, 1 Stunde vorher' },
  { id: 'post', label: '🥚 Nach dem Training Eiweiss gegessen', sub: 'z. B. Joghurt, Eier, Poulet, Quark' },
  { id: 'elec', label: '🧂 Viel geschwitzt? Mineralwasser getrunken', sub: 'oder eine Prise Salz ins Essen' },
  { id: 'clean', label: '🚫 Heute keine Süssigkeiten und kein Fast Food', sub: '' },
  { id: 'veg', label: '🥦 Gemüse und Obst gegessen', sub: 'am besten 5 Handvoll am Tag' },
];

const MEALS = [
  { t: 'Frühstück', items: ['Overnight Oats mit Haferflocken, Magerquark, Beeren und Honig', 'Rührei (3 Eier) mit Vollkornbrot, Avocado und Tomaten', 'Skyr-Bowl mit Banane, Nüssen und Haferflocken'] },
  { t: 'Pre-Fight-Meal (2–3 h vorher)', items: ['Reis mit Poulet und etwas Gemüse – wenig Fett, wenig Ballaststoffe', 'Pasta mit Tomatensauce und Truten-Hackfleisch', 'Snack 30–60 Min. vorher: Banane, Reiswaffeln mit Honig'] },
  { t: 'Recovery-Dinner', items: ['Lachs, Süsskartoffeln und Brokkoli', 'Rindfleisch-Bowl mit Reis, Bohnen, Peperoni und Mais', 'Linsen-Curry mit Basmatireis und Joghurt-Dip'] },
];

const WARMUP_STEPS = [
  { name: 'Handgelenke & Finger mobilisieren', sec: 90, cue: 'Handgelenke kreisen, Finger spreizen und zur Faust schliessen, Handflächen und Unterarme dehnen.' },
  { name: 'Rotatorenmanschette aktivieren', sec: 90, cue: 'Armkreisen klein bis gross, Aussenrotation mit Band oder ohne Gewicht, Schulterblätter zusammenziehen.' },
  { name: 'Isometrische Nacken-Stärkung', sec: 80, cue: 'Hand gegen Stirn, Hinterkopf, linke und rechte Seite drücken. Je 10 Sekunden halten, der Kopf bleibt still.' },
  { name: 'Puls hoch', sec: 70, cue: 'Seilspringen oder Hampelmann, locker auf den Ballen.' },
  { name: 'Schattenbox-Warm-up', sec: 150, cue: 'Jab, Cross und Beinarbeit mit 50 Prozent Tempo. Deckung bleibt oben.' },
];

const WRAP_STEPS = [
  'Daumenschlaufe einhängen, Bandage läuft über den Handrücken',
  '3× um das Handgelenk – fest, Finger bleiben gut durchblutet',
  '3–4× um die Knöchel – Hand dabei gespreizt halten',
  'Zwischen den Fingern durchführen (X-Muster) für seitlichen Halt',
  'Daumen 1× umwickeln und sichern',
  'Restliche Bandage ums Handgelenk, Klett schliessen',
  'Faust-Test: Faust fest machen – nichts drückt, nichts rutscht',
  'Handschuhe anziehen und Sitz prüfen',
];

const PREHAB = [
  { t: 'Finger-Liegestütze auf den Knien', d: '3 × 5–8 Wdh., langsam aufbauen' },
  { t: 'Unterarm-Curls (Beuger & Strecker)', d: '3 × 15 pro Seite mit leichter Hantel' },
  { t: 'Reiskübel-Drill', d: '2–3 Min.: Hände im Reis öffnen, schliessen, drehen' },
  { t: 'Handtrainer / Knetball', d: '3 × 20 pro Hand' },
  { t: 'Faust-Plank auf weicher Unterlage', d: '3 × 20 Sek., Handgelenk exakt gerade' },
];

const POOLS = {
  footwork: ['Jab, Schritt rein, Jab, raus!', 'Doppel-Jab, Pivot links!', 'Pendeln links, Jab zum Körper!', 'Jab, Cross, Schritt seitlich!', 'Jab hoch, Jab tief!', 'Winkel nehmen rechts, eins, zwei!', 'Distanz halten, nur Jab!', 'Pivot, Pivot, Jab!', 'Schritt zurück, Konter-Jab!', 'Eins, zwei, Meidbewegung links!'],
  power: ['Eins, zwei, voller Hüfteinsatz!', 'Linker Haken, rechter Haken!', 'Cross, linker Haken, Cross!', 'Leberhaken, Kopfhaken!', 'Rechter Aufwärtshaken, linker Haken!', 'Drei harte Geraden!', 'Eins, zwei, drei, zwei!'],
  speed: ['Doppel-Jab, Cross, schnell!', 'Eins, zwei, eins, zwei, Speed!', 'Jab zum Körper, Jab zum Kopf, Cross!', 'Fünf schnelle Geraden!', 'Eins, zwei, drei, raus!', 'Körper, Kopf, Körper!', 'Jab, Cross, Leberhaken, Kopfhaken!'],
  counter: ['Slip, Cross!', 'Abrollen, Haken, Cross!', 'Parieren, Jab, Cross!', 'Pendeln rechts, linker Haken!', 'Zurücklehnen, Konter-Cross!', 'Ducken, Leberhaken, Kopfhaken!', 'Slip links, Slip rechts, eins, zwei!'],
  pads: ['Pratzen: Jab, Cross, linker Haken!', 'Pratzen: Halter jabbt – Slip, Cross!', 'Pratzen: Halter schlägt Haken – abrollen, Haken, Cross!', 'Pratzen: Doppel-Jab, Cross!', 'Pratzen: Körper-Pratze – Leberhaken, Kopfhaken!', 'Pratzen: Eins, zwei, Halter schlägt zurück – ducken!', 'Pratzen: Parieren, Jab, Cross!'],
  regen: ['Locker bleiben, Jab!', 'Atmen, Schultern locker!', 'Leicht auf den Ballen!', 'Langsamer Jab, perfekte Technik!', 'Pivot, ganz ruhig!'],
};
POOLS.mixed = [...POOLS.footwork, ...POOLS.power, ...POOLS.speed, ...POOLS.counter];

const MODES = [
  { id: 'footwork', label: 'Ring-IQ & Beinarbeit' },
  { id: 'power', label: 'Power-Kombis' },
  { id: 'speed', label: 'Speed & Präzision' },
  { id: 'counter', label: 'Konter (Solo)' },
  { id: 'pads', label: 'Partner-Pratzen' },
  { id: 'mixed', label: 'Championship-Mix' },
  { id: 'regen', label: 'Locker / Regeneration' },
];

const PACING = ['Hände hoch!', 'Atmen beim Schlag!', 'Kinn runter!', 'Bleib in Bewegung!', 'Hände nach jedem Schlag zurück!'];
const KNUCKLE_TIPS = ['Handgelenke fest anspannen!', 'Fokus auf Speed und Treffergenauigkeit, keine wilden Schwinger!', 'Mit den ersten zwei Knöcheln treffen!', 'Achtzig Prozent Kraft, saubere Technik!', 'Handgelenk gerade, Unterarm in einer Linie!'];
const REST_TIPS = ['Pause. Tief durch die Nase einatmen.', 'Pause. Schultern locker, Puls runter.', 'Pause. Trinken und an die Deckung denken.', 'Pause. Nächste Runde: Hände nach jedem Schlag zurück.'];

const REWARDS = [
  { id: 'c_peek', type: 'combo', name: 'Peek-a-Boo-Konter', style: 'im Stil von Mike Tyson', call: 'Pendeln rechts, linker Leberhaken, linker Kopfhaken, rechte Gerade!', desc: 'Hohe Deckung, unter dem Jab durchpendeln und mit dem Haken-Doppel explodieren.' },
  { id: 'l_ali', type: 'lesson', name: 'Der Kampf beginnt im Kopf', style: 'Muhammad Ali', desc: 'Ali war dafür bekannt, fest an seinen Sieg zu glauben, lange bevor er in den Ring stieg. Übung: Visualisiere vor dem Training 2 Minuten lang, wie du eine Runde sauber, schnell und kontrolliert boxt.' },
  { id: 'c_pull', type: 'combo', name: 'Pull-Counter', style: 'im Stil von Floyd Mayweather', call: 'Zurücklehnen, rechte Gerade über den Jab!', desc: 'Gewicht aufs hintere Bein verlagern, den Jab ins Leere laufen lassen und sofort mit dem Cross kontern.' },
  { id: 'l_cus', type: 'lesson', name: 'Angst ist Energie', style: 'Cus D’Amato & Mike Tyson', desc: 'Tysons Trainer Cus D’Amato lehrte, dass Angst normal ist und als Energie genutzt werden kann. Übung: Wenn du nervös bist, benenne das Gefühl, atme 4 Sek. ein, 4 halten, 4 aus – und nimm die Spannung mit in die erste Runde.' },
  { id: 'c_ali', type: 'combo', name: 'Shuffle-Jab-Serie', style: 'im Stil von Muhammad Ali', call: 'Doppel-Jab, Schritt seitlich, Jab, Cross!', desc: 'Leichte Füsse, ständige Bewegung – der Jab steuert die Distanz.' },
  { id: 'l_floyd', type: 'lesson', name: 'Defensive ist Disziplin', style: 'Floyd Mayweather', desc: 'Mayweather galt als einer der besten Defensivboxer seiner Zeit und als extrem trainingsfleissig. Übung: Eine Runde pro Woche nur Defensive – Slip, Roll, Parry – ohne einen einzigen Angriff.' },
  { id: 'c_loma', type: 'combo', name: 'Pivot-Angriff', style: 'im Stil von Wassyl Lomatschenko', call: 'Jab, Pivot links, Cross, linker Haken!', desc: 'Nach dem Pivot stehst du im Winkel – der Gegner muss sich erst neu ausrichten.' },
  { id: 'l_pac', type: 'lesson', name: 'Arbeitsmoral schlägt Talent', style: 'Manny Pacquiao', desc: 'Pacquiao arbeitete sich aus grosser Armut bis an die Weltspitze. Übung: Wenn du müde bist, mach noch eine saubere Serie mehr als geplant – Qualität vor Quantität.' },
  { id: 'c_canelo', type: 'combo', name: 'Körper-Sturm', style: 'im Stil von Canelo Álvarez', call: 'Ducken, linker Leberhaken, rechter Körperhaken, linker Kopfhaken!', desc: 'Unter dem Schlag abtauchen, den Körper bearbeiten, dann nach oben wechseln.' },
  { id: 'l_wlad', type: 'lesson', name: 'Geduld und Plan', style: 'Wladimir Klitschko', desc: 'Klitschko war für seine strukturierte, geduldige Kampfführung bekannt. Übung: Notiere vor jeder Einheit ein einziges Technikziel und prüfe es danach.' },
  { id: 'c_pac', type: 'combo', name: 'Winkel-Blitz', style: 'im Stil von Manny Pacquiao', call: 'Jab, Cross, Schritt raus links, Cross, Haken!', desc: 'Volumen und Winkelwechsel: schlagen, Position wechseln, wieder schlagen.' },
  { id: 'l_frazier', type: 'lesson', name: 'Die Arbeit, die keiner sieht', style: 'Joe Frazier', desc: 'Frazier steht für den Gedanken, dass Kämpfe im Training entschieden werden – dann, wenn niemand zuschaut. Übung: Halte heute alle Pausenzeiten auf die Sekunde genau ein.' },
  { id: 'c_klitschko', type: 'combo', name: 'Jab-Mauer', style: 'im Stil der Klitschko-Brüder', call: 'Jab, Jab, rechte Gerade, Schritt zurück!', desc: 'Mit langem Jab die Distanz halten, die Rechte nur, wenn der Weg frei ist.' },
];

const DAYS = [
  {
    i: 1, name: 'Ring-IQ & Beinarbeit', focus: 'Winkel, Pivots, Pendeln, Distanzkontrolle',
    blocks: [
      { t: 'Warm-up', e: '8-Min.-Warm-up (Pflicht)', p: '8-Min.-Warm-up (Pflicht)' },
      { t: 'Schattenboxen – Winkel & Pivots', e: '3 × 2 Min.: Pivot links/rechts nach dem Jab, Pendeln', p: '4 × 3 Min.: Winkel, Pivots, Pendeln, Rhythmuswechsel' },
      { t: 'Sandsack – Distanzkontrolle', e: '4 × 2 Min. / 1 Min. Pause – Jab-Variationen, rein & raus', p: '6 × 3 Min. / 1 Min. Pause – Jab hoch/tief, Doppel-Jab, Konter-Jab' },
      { t: 'Beinarbeit-Finisher', e: '2 × 1 Min. Seilspringen', p: '3 × 3 Min. Seilspringen mit Tempowechsel' },
    ],
    preset: { e: { rounds: 4, work: 120, rest: 60, mode: 'footwork', knuckle: false }, p: { rounds: 6, work: 180, rest: 60, mode: 'footwork', knuckle: false } },
  },
  {
    i: 2, name: 'Athletik, Zugkraft & Explosivität', focus: 'Klimmzüge, Plyometrie, Core, Power-Kombis', pull: true,
    blocks: [
      { t: 'Klimmzug-Progression', e: '5 × 3–5 saubere Klimmzüge – oder Negative: 5 × 3, je 5 Sek. ablassen', p: '5 × max. saubere Pull-ups, 2 Min. Pause' },
      { t: 'Hang & Core an der Stange', e: '3 × 20 Sek. Hängen mit angezogenen Knien', p: '4 × 20 Sek. L-Sit-Hang' },
      { t: 'Explosive Zugkraft', e: 'Erst ab 8 sauberen Klimmzügen', p: '4 × 3 explosive Chest-to-Bar Pull-ups' },
      { t: 'Plyometrische Liegestütze', e: '3 × 8 explosive Knie-Liegestütze', p: '4 × 8 Klatsch-Liegestütze' },
      { t: 'Core', e: '3 × 30 Sek. Hollow Hold, 3 × 20 Russian Twists', p: '4 × 45 Sek. Hollow Hold, 4 × 30 Russian Twists, 3 × 12 hängende Knieheber' },
      { t: 'Power-Kombis am Sack (schwere Handschuhe)', e: '4 × 1 Min. / 1 Min. Pause', p: '6 × 2 Min. / 1 Min. Pause' },
    ],
    preset: { e: { rounds: 4, work: 60, rest: 60, mode: 'power', knuckle: false }, p: { rounds: 6, work: 120, rest: 60, mode: 'power', knuckle: false } },
  },
  {
    i: 3, name: 'High-Speed & Präzision', focus: 'Knöchelhandschuhe, Handspeed, Körper-Kopf, Tabata', knuckle: true,
    blocks: [
      { t: 'Knöchelhandschuh-Schutzprotokoll', e: 'Bandagieren + Faust-Test (Pflicht)', p: 'Bandagieren + Faust-Test (Pflicht)' },
      { t: 'Speed-Runden mit Knöchelhandschuhen (70–80 %)', e: '4 × 2 Min. / 1 Min. Pause', p: '6 × 3 Min. / 1 Min. Pause' },
      { t: 'Körper-Kopf-Kombinationen', e: 'In die Runden integriert (Voice Coach)', p: 'In die Runden integriert (Voice Coach)' },
      { t: 'Tabata-Sprint (schwere Handschuhe)', e: '4 × 20 Sek. Vollgas / 10 Sek. Pause', p: '8 × 20 Sek. Vollgas / 10 Sek. Pause' },
      { t: 'Handgelenk-Prehab', e: 'Unterarm-Curls 2 × 15, Reiskübel 2 Min.', p: 'Komplettes Prehab-Programm (Schutz-Guide)' },
    ],
    preset: { e: { rounds: 4, work: 120, rest: 60, mode: 'speed', knuckle: true }, p: { rounds: 6, work: 180, rest: 60, mode: 'speed', knuckle: true } },
    extra: { label: 'Tabata laden', e: { rounds: 4, work: 20, rest: 10, mode: 'speed', knuckle: false }, p: { rounds: 8, work: 20, rest: 10, mode: 'speed', knuckle: false } },
  },
  {
    i: 4, name: 'Taktik, Konter & Pratzen', focus: 'Defensive-to-Offense: Slip-Cross, Roll-Hook-Cross', pads: true,
    blocks: [
      { t: 'Schattenboxen Defensive', e: '2 × 2 Min.: Slip, Roll, Parry – langsam', p: '3 × 3 Min.: Slip, Roll, Parry, Pivot mit Konter' },
      { t: 'Solo am Sandsack oder Partner-Pratzen', e: '4 × 2 Min. / 1 Min. Pause', p: '6 × 3 Min. / 1 Min. Pause' },
      { t: 'Konter-Drills', e: 'Slip-Cross, Roll-Hook-Cross – je 3 × 10 langsam', p: 'Slip-Cross, Roll-Hook-Cross, Parry-Jab-Cross – je 4 × 12' },
    ],
    preset: { e: { rounds: 4, work: 120, rest: 60, mode: 'counter', knuckle: false }, p: { rounds: 6, work: 180, rest: 60, mode: 'counter', knuckle: false } },
  },
  {
    i: 5, name: 'Championship Rounds', focus: 'Runden unter Ermüdung, 30-Sekunden-Endspurt',
    blocks: [
      { t: 'Championship Rounds', e: '6 × 2 Min. / 1 Min. Pause (12 Runden erst auf Profi-Level)', p: '8–12 × 3 Min. / 1 Min. Pause' },
      { t: 'Endspurt', e: 'Letzte 30 Sek. jeder Runde: Vollgas', p: 'Letzte 30 Sek. jeder Runde: Vollgas' },
      { t: 'Cool-down', e: '5 Min. lockeres Schattenboxen + Dehnen', p: '5 Min. lockeres Schattenboxen + Dehnen' },
    ],
    preset: { e: { rounds: 6, work: 120, rest: 60, mode: 'mixed', knuckle: false }, p: { rounds: 12, work: 180, rest: 60, mode: 'mixed', knuckle: false } },
  },
  {
    i: 6, name: 'Aktive Regeneration', focus: 'Mobility, Handgelenk-Stärkung, lockeres Schattenboxen', regen: true,
    blocks: [
      { t: 'Mobility-Flow', e: '10 Min.: Hüfte, Brustwirbelsäule, Schultern', p: '15 Min.: Hüfte, Brustwirbelsäule, Schultern' },
      { t: 'Handgelenk-Stärkung', e: 'Prehab-Programm, leicht', p: 'Prehab-Programm, komplett' },
      { t: 'Lockeres Schattenboxen', e: '3 × 2 Min. mit 50 % Tempo', p: '3 × 3 Min. mit 50 % Tempo' },
      { t: 'Spaziergang oder lockeres Velo', e: '20–30 Min.', p: '30–45 Min.' },
    ],
    preset: { e: { rounds: 3, work: 120, rest: 60, mode: 'regen', knuckle: false }, p: { rounds: 3, work: 180, rest: 60, mode: 'regen', knuckle: false } },
  },
  {
    i: 7, name: 'Aktive Regeneration II', focus: 'Dehnen, Atmung, Technik in Zeitlupe', regen: true,
    blocks: [
      { t: 'Dehnen', e: '10 Min.: Hüftbeuger, Brust, Waden, Unterarme', p: '15 Min.: Hüftbeuger, Brust, Waden, Unterarme' },
      { t: 'Atemübung (Box Breathing)', e: '5 Min.: 4 Sek. ein – 4 halten – 4 aus – 4 halten', p: '5 Min.: 4 Sek. ein – 4 halten – 4 aus – 4 halten' },
      { t: 'Zeitlupen-Schattenboxen', e: '3 × 2 Min.: jede Technik in Zeitlupe, perfekt', p: '3 × 3 Min.: jede Technik in Zeitlupe, perfekt' },
      { t: 'Wochen-Review', e: 'Was lief gut? Ein Technikziel für nächste Woche', p: 'Was lief gut? Ein Technikziel für nächste Woche' },
    ],
    preset: { e: { rounds: 3, work: 120, rest: 60, mode: 'regen', knuckle: false }, p: { rounds: 3, work: 180, rest: 60, mode: 'regen', knuckle: false } },
  },
];

/* ---------- State ---------- */
const DEFAULT_STATE = {
  v: 1, updatedAt: 0,
  profile: { name: '', hand: 'r', weight: 75, height: 178, age: 30, sex: 'm', goal: 'halten', activity: 1.725 },
  settings: { voiceName: null, pitch: 0.95, voiceOn: true, rate: 1.05, intMin: 8, intMax: 12, level: 'einsteiger' },
  onboarded: false,
  goals: { train: true, water: true, food: true, sleep: true, waterL: null, sleepH: 7, custom: [] },
  equip: { bag: true, gloves: true, wraps: true, knuckle: true, bar: true, pads: false },
  path: { done: [], adjust: 0, last: null },
  history: {},
  unlocked: [],
  trophies: [],
};
const EMPTY_DAY = { custom: {}, warmup: false, wrap: false, workout: false, nut: {}, water: 0, sleep: null, claimed: false, wrapChecks: {}, pullups: 0, speed: 0, champ: false, sessions: 0, dayOverride: null };

function mergeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_STATE, ...s,
    profile: { ...DEFAULT_STATE.profile, ...(s.profile || {}) },
    settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) },
    equip: { ...DEFAULT_STATE.equip, ...(s.equip || {}) },
    goals: { ...DEFAULT_STATE.goals, ...(s.goals || {}), custom: (s.goals && Array.isArray(s.goals.custom)) ? s.goals.custom : [] },
    path: { ...DEFAULT_STATE.path, ...(s.path || {}), done: (s.path && Array.isArray(s.path.done)) ? s.path.done : [] },
    history: s.history || {},
    unlocked: Array.isArray(s.unlocked) ? s.unlocked : [],
    trophies: Array.isArray(s.trophies) ? s.trophies : [],
  };
}
const getDay = (state, key) => ({ ...EMPTY_DAY, ...(state.history[key] || {}) });
const campDayOf = (state, key) => { const r = getDay(state, key); return r.dayOverride || weekdayIdx(keyToDate(key)); };

/* ---------- Derived ---------- */
function nutrition(profile) {
  const w = +profile.weight || 75, h = +profile.height || 178, a = +profile.age || 30;
  const bmr = 10 * w + 6.25 * h - 5 * a + (profile.sex === 'f' ? -161 : 5);
  const tdee = bmr * (+profile.activity || 1.725);
  let kcal = tdee, p = 2.0, f = 0.9;
  const minor = a < 18;
  if (!minor && profile.goal === 'cut') { kcal = Math.max(tdee * 0.85, bmr * 1.2); p = 2.2; f = 0.8; }
  if (!minor && profile.goal === 'aufbau') { kcal = tdee * 1.1; p = 1.8; f = 1.0; }
  const prot = Math.round(p * w), fat = Math.round(f * w);
  const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  const liters = clamp(w * 0.035 + 1, 3, 4.5);
  return { minor, bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), prot, fat, carbs, liters: Math.round(liters * 4) / 4, glasses: Math.ceil(liters / 0.25) };
}
function dayXP(r, glasses, sleepH = 7) {
  let x = 0;
  if (r.warmup) x += 15; if (r.wrap) x += 10; if (r.workout) x += 50;
  x += NUT_ITEMS.filter(i => r.nut && r.nut[i.id]).length * 4;
  if (r.water >= glasses) x += 10;
  if (r.sleep != null) x += r.sleep >= sleepH ? 10 : 5;
  x += Object.values(r.custom || {}).filter(Boolean).length * 5;
  if (r.claimed) x += 25;
  return x;
}
function derive(state) {
  const n = nutrition(state.profile);
  const G = state.goals;
  if (G.waterL) { n.liters = G.waterL; n.glasses = Math.ceil(G.waterL / 0.25); }
  const keys = Object.keys(state.history);
  let base = 0, pullups = 0, speed = 0, champ = false, warmups = 0, hydro = 0, sessions = 0;
  keys.forEach(k => {
    const r = getDay(state, k);
    base += dayXP(r, n.glasses, G.sleepH || 7);
    pullups += r.pullups || 0; speed += r.speed || 0; sessions += r.sessions || 0;
    if (r.champ) champ = true; if (r.warmup) warmups++; if (r.water >= n.glasses) hydro++;
    if (r.workout && !r.sessions) sessions += 1;
  });
  const xp = base + state.trophies.length * 100;
  // streak
  const t = todayKey(); let streak = 0;
  let k = getDay(state, t).workout ? t : addDays(t, -1);
  while (getDay(state, k).workout) { streak++; k = addDays(k, -1); }
  let ri = 0; RANKS.forEach((r, i) => { if (xp >= r.xp) ri = i; });
  const rank = RANKS[ri], next = RANKS[ri + 1] || null;
  const prog = next ? (xp - rank.xp) / (next.xp - rank.xp) : 1;
  const basics = state.path.done.length;
  return { n, basics, xp, base, streak, pullups, speed, champ, warmups, hydro, sessions, rank, next, prog, ri };
}

const TROPHIES = [
  { id: 'basic', name: 'Grundausbildung bestanden', desc: 'Alle 12 Anfänger-Lektionen geschafft', test: d => d.basics >= 12 },
  { id: 'first', name: 'Erste Glocke', desc: 'Erstes Workout abgeschlossen', test: d => d.sessions >= 1 },
  { id: 'streak7', name: '7-Tage-Streak', desc: '7 Tage in Folge trainiert', test: d => d.streak >= 7 },
  { id: 'streak30', name: 'Eiserne Disziplin', desc: '30 Tage in Folge trainiert', test: d => d.streak >= 30 },
  { id: 'pull100', name: '100 Klimmzüge', desc: '100 Klimmzüge gesamt', test: d => d.pullups >= 100 },
  { id: 'pull500', name: 'Zugmaschine', desc: '500 Klimmzüge gesamt', test: d => d.pullups >= 500 },
  { id: 'champ12', name: '12 Championship Rounds überlebt', desc: '12 × 3 Min. in einer Session', test: d => d.champ },
  { id: 'speed10', name: 'Eiserne Handgelenke', desc: '10 Speed-Sessions mit Knöchelhandschuhen', test: d => d.speed >= 10 },
  { id: 'warm20', name: 'Nie kalt gestartet', desc: '20 Warm-ups absolviert', test: d => d.warmups >= 20 },
  { id: 'hydro14', name: 'Hydro-Profi', desc: '14 Tage Wasserziel erreicht', test: d => d.hydro >= 14 },
  { id: 'contender', name: 'Contender', desc: 'Rang Contender erreicht', test: d => d.base >= 3500 },
];

/* ---------- Persistence (localStorage + optional cloud sync) ---------- */
function usePersistent() {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return mergeState(JSON.parse(raw)); } catch (e) { }
    return mergeState(null);
  });
  const [sync, setSync] = useState('local');
  const stateRef = useRef(state); stateRef.current = state;
  const dbRef = useRef(null), writing = useRef(false), pending = useRef(false), timer = useRef(null);

  const flush = async () => {
    if (!dbRef.current) return;
    if (writing.current) { pending.current = true; return; }
    writing.current = true;
    try { await dbRef.current.set({ state: JSON.stringify(stateRef.current), updatedAt: stateRef.current.updatedAt }); setSync('cloud'); } catch (e) { setSync('local'); }
    writing.current = false;
    if (pending.current) { pending.current = false; flush(); }
  };

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { }
    if (dbRef.current && state.updatedAt) { clearTimeout(timer.current); timer.current = setTimeout(flush, 1500); }
  }, [state]);

  useEffect(() => {
    let alive = true, tries = 0;
    const connect = async () => {
      try {
        if (!window.claude || !window.claude.use) { if (tries++ < 10) setTimeout(connect, 1000); return; }
        const db = await window.claude.use('db'); const user = await window.claude.use('user');
        if (!db || !user || !alive) return;
        const id = await user.id(); if (!id) return;
        const ref = db.collection('data/users/' + id).doc('fightcamp');
        let remote = null;
        try {
          const snap = await ref.get();
          if (snap) remote = typeof snap.data === 'function' ? snap.data() : (snap.data !== undefined ? snap.data : snap);
        } catch (e) { }
        if (!alive) return;
        if (remote && remote.state) {
          try {
            const rs = mergeState(JSON.parse(remote.state));
            if ((rs.updatedAt || 0) > (stateRef.current.updatedAt || 0)) setState(rs);
          } catch (e) { }
        }
        dbRef.current = ref; setSync('cloud');
        if ((stateRef.current.updatedAt || 0) > ((remote && remote.updatedAt) || 0)) flush();
      } catch (e) { }
    };
    connect();
    return () => { alive = false; };
  }, []);

  const update = fn => setState(s => ({ ...fn(s), updatedAt: Date.now() }));
  return [state, update, sync];
}

/* ---------- UI atoms ---------- */
const Card = ({ children, className = '' }) => <div className={'rounded-2xl border border-white/10 bg-anth p-4 sm:p-5 ' + className}>{children}</div>;
const H2 = ({ children, sub }) => (
  <div className="mb-3">
    <h2 className="font-display text-lg uppercase tracking-wider text-gold">{children}</h2>
    {sub && <p className="text-sm text-stone-400">{sub}</p>}
  </div>
);
const Btn = ({ children, onClick, kind = 'gold', className = '', disabled }) => {
  const k = {
    gold: 'bg-gold text-ink hover:bg-[#e2c15a]',
    red: 'bg-blood text-white hover:bg-[#cc1a24]',
    ghost: 'border border-white/15 text-stone-200 hover:border-gold/60 hover:text-gold',
  }[kind];
  return <button disabled={disabled} onClick={onClick} className={'rounded-xl px-4 py-2.5 font-display uppercase tracking-wider text-sm transition disabled:opacity-40 ' + k + ' ' + className}>{children}</button>;
};
const Check = ({ checked, onChange, label, sub, xp }) => (
  <button onClick={onChange} className={'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ' + (checked ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-coal hover:border-white/25')}>
    <span className={'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ' + (checked ? 'border-gold bg-gold text-ink' : 'border-white/30')}>{checked ? '✓' : ''}</span>
    <span className="flex-1">
      <span className={'block text-sm ' + (checked ? 'text-stone-100' : 'text-stone-300')}>{label}</span>
      {sub && <span className="block text-xs text-stone-500">{sub}</span>}
    </span>
    {xp != null && <span className={'text-xs font-display ' + (checked ? 'text-gold' : 'text-stone-500')}>+{xp} XP</span>}
  </button>
);
const Toggle = ({ on, onChange, label }) => (
  <button onClick={() => onChange(!on)} className="flex items-center gap-3 text-sm text-stone-300">
    <span className={'relative h-6 w-11 rounded-full transition ' + (on ? 'bg-gold' : 'bg-white/15')}>
      <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-all ' + (on ? 'left-[22px]' : 'left-0.5')}></span>
    </span>
    {label}
  </button>
);
const Bar = ({ v, color = 'bg-gold' }) => (
  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"><div className={'h-full rounded-full transition-all ' + color} style={{ width: clamp(v * 100, 0, 100) + '%' }}></div></div>
);
const Stepper = ({ label, value, onChange, step = 1, min = 0, max = 999, fmtv, disabled }) => (
  <div className="rounded-xl border border-white/10 bg-coal p-2.5">
    <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
    <div className="mt-1 flex items-center justify-between gap-2">
      <button disabled={disabled} onClick={() => onChange(clamp(value - step, min, max))} className="h-8 w-8 rounded-lg bg-white/10 text-lg disabled:opacity-30">−</button>
      <span className="font-display text-lg text-stone-100">{fmtv ? fmtv(value) : value}</span>
      <button disabled={disabled} onClick={() => onChange(clamp(value + step, min, max))} className="h-8 w-8 rounded-lg bg-white/10 text-lg disabled:opacity-30">+</button>
    </div>
  </div>
);

function PullLogger({ today, updateToday, total }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-coal p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-stone-200">Klimmzüge heute: <span className="font-display text-gold">{today.pullups}</span></div>
          <div className="text-xs text-stone-500">Gesamt: {total}</div>
        </div>
        <div className="flex gap-1.5">
          {[1, 5, 10].map(n => <button key={n} onClick={() => updateToday(r => ({ ...r, pullups: (r.pullups || 0) + n }))} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm hover:bg-gold hover:text-ink">+{n}</button>)}
          <button onClick={() => updateToday(r => ({ ...r, pullups: Math.max(0, (r.pullups || 0) - 1) }))} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-sm text-stone-400">−1</button>
        </div>
      </div>
    </div>
  );
}

function RewardCard({ r }) {
  return (
    <div className="mt-3 rounded-xl border border-gold/50 bg-gradient-to-br from-gold/15 to-transparent p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-gold">{r.type === 'combo' ? 'Geheime Profi-Kombination · jetzt im Voice Coach' : 'Mentale Lektion'}</div>
      <div className="font-display text-xl uppercase text-stone-100">{r.name}</div>
      <div className="text-xs text-stone-400">{r.style}</div>
      {r.call && <div className="mt-2 rounded-lg bg-ink/60 px-3 py-2 font-display text-sm tracking-wide text-gold">«{r.call}»</div>}
      <p className="mt-2 text-sm text-stone-300">{r.desc}</p>
    </div>
  );
}

/* ---------- Timer & Voice Coach ---------- */
function TimerPanel({ app }) {
  const { state, update, preset, setPreset, today, updateToday, toast, go } = app;
  const st = state.settings;
  const cfg = preset;
  const T = useRef({ phase: 'idle', round: 1, end: 0, left: 0, paused: false, pausedLeft: 0, nextCall: 0, w30: false, w10: false, r10: false, p: {} });
  const [, force] = useState(0); const rerender = () => force(x => x + 1);
  const [lastCall, setLastCall] = useState('');
  const iv = useRef(null);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const stRef = useRef(st); stRef.current = st;
  const unlRef = useRef(state.unlocked); unlRef.current = state.unlocked;
  const doneRef = useRef(null);
  doneRef.current = () => {
    const c = cfgRef.current;
    updateToday(r => ({ ...r, workout: true, sessions: (r.sessions || 0) + 1, speed: (r.speed || 0) + (c.knuckle ? 1 : 0), champ: r.champ || (c.rounds >= 12 && c.work >= 180) }));
    toast('Workout abgeschlossen – stark, Champion!');
  };

  const say = (txt, interrupt = true) => { if (stRef.current.voiceOn) speak(txt, stRef.current.rate, interrupt); };
  const pickCall = () => {
    const c = cfgRef.current;
    if (c.knuckle && Math.random() < 0.3) return pick(KNUCKLE_TIPS);
    if (Math.random() < 0.14) return pick(PACING);
    let pool = [...(POOLS[c.mode] || POOLS.mixed)];
    if (c.mode !== 'regen') {
      const secret = REWARDS.filter(r => r.type === 'combo' && unlRef.current.includes(r.id)).map(r => r.call);
      pool = pool.concat(secret, secret);
    }
    return pick(pool);
  };
  const startPhase = sec => { const t = T.current; t.end = Date.now() + sec * 1000; t.left = sec; t.w30 = t.w10 = t.r10 = false; t.nextCall = Date.now() + 3500; };
  const stopLoop = () => { clearInterval(iv.current); iv.current = null; };
  const advance = () => {
    const t = T.current, c = cfgRef.current;
    if (t.phase === 'prep') { t.phase = 'work'; t.round = 1; startPhase(c.work); bell(1); say(c.rounds === 1 ? 'Los geht\'s!' : 'Runde eins. Los geht\'s!'); }
    else if (t.phase === 'work') {
      if (t.round >= c.rounds) { t.phase = 'done'; stopLoop(); bell(3); say('Training beendet. Starke Leistung, Champion!'); setLastCall(''); doneRef.current && doneRef.current(); }
      else if (c.rest > 0) { t.phase = 'rest'; startPhase(c.rest); bell(1); setLastCall(''); say(c.rest >= 30 ? pick(REST_TIPS) : 'Pause!'); }
      else { t.round++; startPhase(c.work); bell(1); }
    } else if (t.phase === 'rest') {
      t.round++; t.phase = 'work'; startPhase(c.work); bell(1);
      say(t.round === c.rounds ? 'Letzte Runde! Alles geben!' : 'Runde ' + t.round + '. Los!');
    }
    rerender();
  };
  const tick = () => {
    const t = T.current; if (t.paused || t.phase === 'idle' || t.phase === 'done') return;
    const now = Date.now(), ms = t.end - now, left = Math.max(0, Math.ceil(ms / 1000));
    if (left !== t.left) { t.left = left; rerender(); }
    const c = cfgRef.current, s = stRef.current;
    if (t.phase === 'prep' && left <= 3 && left > 0 && !t.p[left]) { t.p[left] = true; beep(1, 880); }
    if (t.phase === 'work') {
      if (!t.w30 && left <= 30 && left > 0 && c.work >= 60) { t.w30 = true; knock(3); const m = t.round === c.rounds ? 'Noch 30 Sekunden! Letzte Runde, Vollgas!' : 'Noch 30 Sekunden, Vollgas!'; setLastCall(m); say(m); t.nextCall = now + 7000; }
      if (!t.w10 && left <= 10 && left > 0 && c.work >= 30) { t.w10 = true; knock(2); beep(2, 1500); }
      if (now >= t.nextCall && left > 4 && c.work >= 30) { const call = pickCall(); setLastCall(call); say(call); t.nextCall = now + rand(+s.intMin || 8, Math.max(+s.intMin || 8, +s.intMax || 12)) * 1000; }
    }
    if (t.phase === 'rest' && !t.r10 && left <= 10 && left > 0 && c.rest > 15) { t.r10 = true; beep(2, 990); say('Zehn Sekunden. Hände hoch, bereit machen!'); }
    if (ms <= 0) advance();
  };
  const start = () => {
    ac(); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
    const t = T.current; t.phase = 'prep'; t.round = 1; t.paused = false; t.p = {}; startPhase(10);
    say('Bereit machen. Zehn Sekunden.');
    stopLoop(); iv.current = setInterval(tick, 200); rerender();
  };
  const pause = () => { const t = T.current; if (t.paused) { t.end = Date.now() + t.pausedLeft; t.paused = false; } else { t.pausedLeft = t.end - Date.now(); t.paused = true; try { window.speechSynthesis.cancel(); } catch (e) { } } rerender(); };
  const stop = () => { stopLoop(); const t = T.current; t.phase = 'idle'; t.paused = false; setLastCall(''); try { window.speechSynthesis.cancel(); } catch (e) { } rerender(); };
  useEffect(() => () => stopLoop(), []);

  const t = T.current;
  const running = t.phase !== 'idle' && t.phase !== 'done';
  const total = t.phase === 'work' ? cfg.work : t.phase === 'rest' ? cfg.rest : 10;
  const phaseLabel = { idle: 'Bereit', prep: 'Bereit machen', work: 'Arbeit', rest: 'Pause', done: 'Fertig' }[t.phase];
  const phaseColor = t.phase === 'work' ? 'text-blood' : t.phase === 'rest' ? 'text-gold' : 'text-stone-300';
  const setCfg = patch => setPreset({ ...cfg, ...patch, label: patch.label !== undefined ? patch.label : 'Eigene Einstellung' });
  const setSt = patch => update(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  const totalTime = cfg.rounds * cfg.work + (cfg.rounds - 1) * cfg.rest;

  return (
    <div className="space-y-4">
      {cfg.knuckle && (
        <div className={'rounded-2xl border p-4 ' + (today.wrap ? 'border-gold/40 bg-gold/5' : 'border-blood/60 bg-blood/10')}>
          <div className="font-display text-sm uppercase tracking-wider text-gold">Knöchelhandschuh-Schutzprotokoll aktiv</div>
          <p className="mt-1 text-sm text-stone-300">Nur Technik-, Speed- und Präzisionsrunden mit 70–80 % Kraft. Für 100-%-Power-Runden auf die schweren Boxhandschuhe wechseln. Treffen mit den ersten zwei Knöcheln, Handgelenk gerade.</p>
          {!today.wrap && <div className="mt-2"><Btn kind="red" onClick={() => go('guide')}>Zuerst bandagieren (Checkliste)</Btn></div>}
          {today.wrap && <p className="mt-1 text-xs text-gold">✓ Bandagieren heute erledigt</p>}
        </div>
      )}

      <Card className="text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-stone-500">{cfg.label || 'Profi-Timer'}</div>
        <div className={'mt-1 font-display text-xl uppercase tracking-widest ' + phaseColor}>{phaseLabel}{t.paused ? ' · pausiert' : ''}</div>
        <div className={'font-display tabular-nums leading-none ' + (t.phase === 'work' ? 'text-stone-50' : 'text-stone-200')} style={{ fontSize: 'clamp(72px, 22vw, 140px)' }}>
          {running ? fmt(t.left) : t.phase === 'done' ? '✓' : fmt(cfg.work)}
        </div>
        <div className="mt-1 text-sm text-stone-400">Runde {running || t.phase === 'done' ? t.round : 1} / {cfg.rounds}</div>
        {running && <div className="mx-auto mt-3 max-w-md"><Bar v={1 - t.left / total} color={t.phase === 'work' ? 'bg-blood' : 'bg-gold'} /></div>}
        <div className="mt-4 min-h-[3.5rem] px-2">
          {lastCall && <div className="font-display text-xl uppercase leading-tight tracking-wide text-gold sm:text-2xl">{lastCall}</div>}
        </div>
        <div className="mt-2 flex justify-center gap-2">
          {!running && <Btn kind="red" className="px-8 py-3 text-base" onClick={start}>{t.phase === 'done' ? 'Nochmal' : 'Start'}</Btn>}
          {running && <Btn kind="gold" onClick={pause}>{t.paused ? 'Weiter' : 'Pause'}</Btn>}
          {running && <Btn kind="ghost" onClick={advance}>Überspringen</Btn>}
          {running && <Btn kind="ghost" onClick={stop}>Stopp</Btn>}
        </div>
        {!running && <div className="mt-3 text-xs text-stone-500">Gesamtdauer: {fmt(totalTime)} Min. · Start-Countdown 10 Sek.</div>}
      </Card>

      <Card>
        <H2 sub="Runden, Zeiten und Trainingsmodus">Timer-Einstellungen</H2>
        <div className="grid grid-cols-3 gap-2">
          <Stepper disabled={running} label="Runden" value={cfg.rounds} min={1} max={15} onChange={v => setCfg({ rounds: v })} />
          <Stepper disabled={running} label="Arbeit" value={cfg.work} min={20} max={300} step={cfg.work < 60 ? 10 : 30} fmtv={fmt} onChange={v => setCfg({ work: v })} />
          <Stepper disabled={running} label="Pause" value={cfg.rest} min={0} max={120} step={cfg.rest < 30 ? 5 : 15} fmtv={fmt} onChange={v => setCfg({ rest: v })} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-wider text-stone-500">Modus</span>
            <select disabled={running} value={cfg.mode} onChange={e => setCfg({ mode: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-coal px-3 py-2 text-stone-200">
              {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="flex items-end pb-1"><Toggle on={cfg.knuckle} onChange={v => setCfg({ knuckle: v })} label="Knöchelhandschuh-Modus" /></div>
        </div>
      </Card>

      <Card>
        <H2 sub="Deutsche Sprachausgabe deines Browsers">Voice Coach</H2>
        <div className="space-y-4">
          <Toggle on={st.voiceOn} onChange={v => setSt({ voiceOn: v })} label={'Voice Coach ' + (st.voiceOn ? 'AN' : 'AUS')} />
          <label className="block">
            <div className="flex justify-between text-xs uppercase tracking-wider text-stone-500"><span>Sprechtempo</span><span className="text-gold">{(+st.rate).toFixed(2)}×</span></div>
            <input type="range" min="0.8" max="1.6" step="0.05" value={st.rate} onChange={e => setSt({ rate: +e.target.value })} className="mt-2 w-full accent-[#d4af37]" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Ansage ab (Sek.)" value={st.intMin} min={4} max={30} onChange={v => setSt({ intMin: v, intMax: Math.max(v, st.intMax) })} />
            <Stepper label="Ansage bis (Sek.)" value={st.intMax} min={4} max={40} onChange={v => setSt({ intMax: v, intMin: Math.min(v, st.intMin) })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={() => { ac(); speak('Eins, zwei, Meidbewegung links, Leberhaken!', st.rate); }}>Stimme testen</Btn>
            <Btn kind="ghost" onClick={() => bell(1)}>Gong</Btn>
            <Btn kind="ghost" onClick={() => knock(3)}>30-Sek.-Klopfen</Btn>
            <Btn kind="ghost" onClick={() => { knock(2); beep(2, 1500); }}>10-Sek.-Warnung</Btn>
          </div>
          <p className="text-xs text-stone-500">Tipp: Handy-Lautlos-Schalter aus und Bildschirm eingeschaltet lassen. Falls keine deutsche Stimme zu hören ist, siehst du jede Ansage gross im Timer.</p>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Warm-up ---------- */
function WarmupTimer({ app }) {
  const { state, updateToday, today, toast } = app;
  const total = WARMUP_STEPS.reduce((a, s) => a + s.sec, 0);
  const [run, setRun] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef({ start: 0, base: 0, step: -1 });
  const iv = useRef(null);
  const rate = state.settings.rate, voice = state.settings.voiceOn;
  const stepAt = e => { let acc = 0; for (let i = 0; i < WARMUP_STEPS.length; i++) { acc += WARMUP_STEPS[i].sec; if (e < acc) return { i, left: acc - e }; } return { i: WARMUP_STEPS.length, left: 0 }; };
  const tickW = () => {
    const e = Math.floor((ref.current.base + Date.now() - ref.current.start) / 1000);
    setElapsed(e);
    const s = stepAt(e);
    if (s.i !== ref.current.step) {
      ref.current.step = s.i;
      if (s.i < WARMUP_STEPS.length) { bell(1); if (voice) speak(WARMUP_STEPS[s.i].name + '. ' + WARMUP_STEPS[s.i].cue, rate); }
      else { clearInterval(iv.current); setRun(false); bell(2); if (voice) speak('Warm-up erledigt. Jetzt bist du bereit.', rate); updateToday(r => ({ ...r, warmup: true })); toast('Warm-up erledigt +15 XP'); }
    }
  };
  const start = () => { ac(); ref.current.start = Date.now(); setRun(true); clearInterval(iv.current); iv.current = setInterval(tickW, 250); tickW(); };
  const pause = () => { ref.current.base += Date.now() - ref.current.start; clearInterval(iv.current); setRun(false); try { window.speechSynthesis.cancel(); } catch (e) { } };
  const reset = () => { clearInterval(iv.current); setRun(false); setElapsed(0); ref.current = { start: 0, base: 0, step: -1 }; };
  useEffect(() => () => clearInterval(iv.current), []);
  const cur = stepAt(elapsed);
  const finished = elapsed >= total;

  return (
    <Card className="border-gold/30">
      <H2 sub="Pflicht vor jeder Sandsack-Einheit · 8 Minuten">Geführtes Profi-Warm-up</H2>
      <div className="flex items-end justify-between">
        <div className="font-display text-5xl tabular-nums text-stone-100">{fmt(Math.max(0, total - elapsed))}</div>
        <div className="text-right text-xs text-stone-500">{today.warmup ? <span className="text-gold">✓ Heute erledigt</span> : 'Noch offen'}</div>
      </div>
      <div className="mt-2"><Bar v={elapsed / total} /></div>
      <div className="mt-4 space-y-2">
        {WARMUP_STEPS.map((s, i) => {
          const active = run || elapsed > 0 ? cur.i === i : false, done = elapsed > 0 && cur.i > i;
          return (
            <div key={i} className={'rounded-xl border p-3 transition ' + (active ? 'border-gold/60 bg-gold/10' : done ? 'border-white/5 bg-coal opacity-60' : 'border-white/10 bg-coal')}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-sm uppercase tracking-wide text-stone-100">{done ? '✓ ' : ''}{s.name}</div>
                <div className="text-xs tabular-nums text-stone-400">{active ? fmt(cur.left) : fmt(s.sec)}</div>
              </div>
              <p className="mt-1 text-xs text-stone-400">{s.cue}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!run && !finished && <Btn kind="red" onClick={start}>{elapsed > 0 ? 'Weiter' : 'Warm-up starten'}</Btn>}
        {run && <Btn onClick={pause}>Pause</Btn>}
        {(elapsed > 0) && <Btn kind="ghost" onClick={reset}>Zurücksetzen</Btn>}
        {!today.warmup && <Btn kind="ghost" onClick={() => updateToday(r => ({ ...r, warmup: true }))}>Schon erledigt</Btn>}
      </div>
    </Card>
  );
}

/* ---------- Week plan ---------- */
function PlanPanel({ app, focusWarmup }) {
  const { state, update, loadPreset, tKey, today, updateToday, d } = app;
  const lvl = state.settings.level === 'profi' ? 'p' : 'e';
  const [sel, setSel] = useState(campDayOf(state, tKey));
  const [padsMode, setPadsMode] = useState(false);
  const day = DAYS[sel - 1];
  const wuRef = useRef(null);
  useEffect(() => { if (focusWarmup && wuRef.current) wuRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [focusWarmup]);
  const presetFor = () => { const p = { ...day.preset[lvl] }; if (day.pads && padsMode) p.mode = 'pads'; return p; };

  return (
    <div className="space-y-4">
      <Card>
        <H2 sub="5 Fight-Camp-Tage + 2 Tage aktive Regeneration">Wochenplan</H2>
        <div className="mb-3 flex gap-2">
          {[['einsteiger', 'Einsteiger'], ['profi', 'Profi']].map(([id, l]) => (
            <button key={id} onClick={() => update(s => ({ ...s, settings: { ...s.settings, level: id } }))} className={'flex-1 rounded-xl border px-3 py-2 font-display text-sm uppercase tracking-wider ' + (state.settings.level === id ? 'border-gold bg-gold text-ink' : 'border-white/10 text-stone-400')}>{l}</button>
          ))}
        </div>
        <p className="mb-3 text-xs text-stone-500">{lvl === 'e' ? 'Einsteiger: weniger Runden, kürzere Zeiten – Technik vor Härte. Wechsle auf Profi, wenn sich die Einheiten kontrolliert anfühlen.' : 'Profi: volle Fight-Camp-Umfänge. Bei Schmerzen in Hand oder Handgelenk sofort zurück auf Einsteiger.'}</p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(x => {
            const isToday = campDayOf(state, tKey) === x.i;
            return (
              <button key={x.i} onClick={() => setSel(x.i)} className={'rounded-xl border py-2 text-center transition ' + (sel === x.i ? 'border-gold bg-gold/15' : 'border-white/10 bg-coal')}>
                <div className={'font-display text-lg ' + (x.regen ? 'text-stone-400' : sel === x.i ? 'text-gold' : 'text-stone-200')}>{x.i}</div>
                <div className="text-[10px] uppercase text-stone-500">{isToday ? 'heute' : x.regen ? 'regen' : 'camp'}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className={day.regen ? '' : 'border-blood/30'}>
        <div className="text-xs uppercase tracking-[0.2em] text-blood">Tag {day.i}{day.regen ? ' · Regeneration' : ' · Fight Camp'}</div>
        <div className="font-display text-2xl uppercase text-stone-100">{day.name}</div>
        <div className="mb-3 text-sm text-stone-400">{day.focus}</div>
        {day.knuckle && <div className="mb-3 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs text-gold">Knöchelhandschuh-Tag: Das Schutzprotokoll wird beim Laden automatisch aktiviert.</div>}
        {day.pads && (
          <div className="mb-3 flex gap-2">
            {[[false, 'Solo am Sandsack'], [true, 'Partner-Pratzen-Drill']].map(([v, l]) => (
              <button key={l} onClick={() => setPadsMode(v)} className={'flex-1 rounded-xl border px-3 py-2 text-sm ' + (padsMode === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{l}</button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {day.blocks.map((b, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-coal p-3">
              <div className="font-display text-sm uppercase tracking-wide text-stone-100">{b.t}</div>
              <div className="text-sm text-stone-400">{b[lvl]}</div>
            </div>
          ))}
        </div>
        {day.pull && <PullLogger today={today} updateToday={updateToday} total={d.pullups} />}
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn kind="red" onClick={() => loadPreset(presetFor(), 'Tag ' + day.i + ': ' + day.name + (day.pads && padsMode ? ' (Pratzen)' : ''))}>Haupt-Runden in Timer laden</Btn>
          {day.extra && <Btn kind="ghost" onClick={() => loadPreset(day.extra[lvl], 'Tag ' + day.i + ': Tabata')}>{day.extra.label}</Btn>}
        </div>
      </Card>

      <div ref={wuRef}><WarmupTimer app={app} /></div>
    </div>
  );
}

/* ---------- Nutrition & Recovery ---------- */
function FoodPanel({ app }) {
  const { state, update, today, updateToday, d } = app;
  const p = state.profile, n = d.n;
  const setP = patch => update(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const glasses = n.glasses;
  return (
    <div className="space-y-4">
      <NutritionPlan app={app} />
      <Card>
        <H2 sub={'Heute · ' + NUT_ITEMS.filter(i => today.nut[i.id]).length + ' von ' + NUT_ITEMS.length + ' geschafft'}>Gesund essen</H2>
        <div className="space-y-2">
          {NUT_ITEMS.map(i => <Check key={i.id} checked={!!today.nut[i.id]} label={i.label} sub={i.sub} xp={4} onChange={() => updateToday(r => ({ ...r, nut: { ...r.nut, [i.id]: !r.nut[i.id] } }))} />)}
        </div>
      </Card>

      <Card>
        <H2 sub={'Ziel: ' + n.liters + ' l (' + glasses + ' Gläser à 2,5 dl)'}>Wasser trinken</H2>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: glasses }).map((_, i) => (
            <button key={i} onClick={() => updateToday(r => ({ ...r, water: r.water > i ? i : i + 1 }))} className={'h-9 w-7 rounded-b-lg rounded-t-sm border transition ' + (today.water > i ? 'border-sky-400/60 bg-sky-500/70' : 'border-white/15 bg-coal')} aria-label={'Glas ' + (i + 1)}></button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Btn kind="ghost" onClick={() => updateToday(r => ({ ...r, water: Math.max(0, r.water - 1) }))}>− Glas</Btn>
          <Btn onClick={() => updateToday(r => ({ ...r, water: r.water + 1 }))}>+ Glas</Btn>
          <span className="text-sm text-stone-400">{(today.water * 0.25).toFixed(2)} l {today.water >= glasses && <span className="text-gold">· Ziel erreicht ✓</span>}</span>
        </div>
      </Card>

      <Card>
        <H2 sub="Wie viele Stunden hast du letzte Nacht geschlafen?">Schlaf-Check-in</H2>
        <div className="flex flex-wrap gap-1.5">
          {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map(h => (
            <button key={h} onClick={() => updateToday(r => ({ ...r, sleep: r.sleep === h ? null : h }))} className={'rounded-lg border px-3 py-2 text-sm ' + (today.sleep === h ? 'border-gold bg-gold text-ink' : 'border-white/10 bg-coal text-stone-300')}>{h} h</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">{'Ab ' + (state.goals.sleepH || 7) + ' Stunden = volle XP. Schlaf ist dein stärkstes Regenerations-Werkzeug.'}</p>
      </Card>


      <Card>
        <H2>Recovery-Regeln</H2>
        <ul className="space-y-2 text-sm text-stone-300">
          {['Nach harten Tagen: 10 Min. lockeres Auslaufen oder Schattenboxen statt sofort hinsetzen.', 'Handgelenke & Knöchel nach dem Training checken: Schwellung oder stechender Schmerz = Pause und abklären lassen.', 'Muskelkater ist normal, Gelenkschmerz nicht.', 'Mindestens 1 Tag pro Woche komplett ohne Sandsack.', 'Stress und Schlaf zählen zur Belastung – an schlechten Tagen auf Einsteiger-Umfang reduzieren.'].map(x => <li key={x} className="flex gap-2"><span className="text-gold">◆</span><span>{x}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}

/* ---------- Trophies & Ranks ---------- */
function TrophyPanel({ app }) {
  const { state, d, update } = app;
  const [confirm, setConfirm] = useState(false);
  const unlocked = REWARDS.filter(r => state.unlocked.includes(r.id));
  return (
    <div className="space-y-4">
      <Card>
        <H2 sub={d.xp + ' XP gesamt'}>Box-Ränge</H2>
        <div className="space-y-2">
          {RANKS.map((r, i) => {
            const reached = d.xp >= r.xp, cur = i === d.ri;
            return (
              <div key={r.name} className={'flex items-center justify-between rounded-xl border px-3 py-2.5 ' + (cur ? 'border-gold bg-gold/10' : reached ? 'border-white/10 bg-coal' : 'border-white/5 bg-coal opacity-50')}>
                <div className="flex items-center gap-3">
                  <span className={'flex h-7 w-7 items-center justify-center rounded-full font-display text-sm ' + (reached ? 'bg-gold text-ink' : 'bg-white/10 text-stone-500')}>{i + 1}</span>
                  <span className={'font-display uppercase tracking-wide ' + (cur ? 'text-gold' : 'text-stone-200')}>{r.name}</span>
                </div>
                <span className="text-xs text-stone-500">{r.xp} XP</span>
              </div>
            );
          })}
        </div>
        {d.next && <div className="mt-3"><Bar v={d.prog} /><p className="mt-1 text-xs text-stone-500">Noch {d.next.xp - d.xp} XP bis {d.next.name}</p></div>}
      </Card>

      <Card>
        <H2 sub={state.trophies.length + ' von ' + TROPHIES.length + ' · je +100 XP'}>Trophäen-Schrank</H2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TROPHIES.map(t => {
            const has = state.trophies.includes(t.id);
            return (
              <div key={t.id} className={'rounded-xl border p-3 ' + (has ? 'border-gold/60 bg-gradient-to-br from-gold/20 to-transparent' : 'border-white/10 bg-coal opacity-60')}>
                <div className="text-2xl">{has ? '🏆' : '🔒'}</div>
                <div className={'font-display text-sm uppercase leading-tight ' + (has ? 'text-gold' : 'text-stone-300')}>{t.name}</div>
                <div className="mt-1 text-xs text-stone-500">{t.desc}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <H2 sub={unlocked.length + ' von ' + REWARDS.length + ' freigeschaltet'}>Deine Belohnungen</H2>
        {unlocked.length === 0 ? <p className="text-sm text-stone-400">Erledige alle Tagesziele, um die erste Belohnung freizuschalten.</p> : (
          <div className="space-y-2">{unlocked.map(r => <RewardCard key={r.id} r={r} />)}</div>
        )}
      </Card>

      <Card>
        <H2>So sammelst du XP</H2>
        <ul className="space-y-1.5 text-sm text-stone-300">
          {[['Warm-up', 15], ['Bandagieren & Schutz-Check', 10], ['Haupt-Workout', 50], ['Ernährungs-Checkliste (je Punkt 4)', 20], ['Wasserziel', 10], ['Schlaf-Check-in (≥ 7 h)', 10], ['Tägliche Belohnung abholen', 25], ['Jedes eigene Tagesziel', 5], ['Jede Trophäe', 100]].map(([l, x]) => (
            <li key={l} className="flex justify-between border-b border-white/5 pb-1.5"><span>{l}</span><span className="font-display text-gold">+{x}</span></li>
          ))}
        </ul>
      </Card>

      <Card>
        <H2 sub={app.sync === 'cloud' ? 'Gespeichert in diesem Browser und in deinem Claude-Konto' : 'Gespeichert in diesem Browser'}>Daten</H2>
        {!confirm ? <Btn kind="ghost" onClick={() => setConfirm(true)}>Alle Daten zurücksetzen</Btn> : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-300">Wirklich alles löschen?</span>
            <Btn kind="red" onClick={() => { update(() => mergeState(null)); setConfirm(false); }}>Ja, zurücksetzen</Btn>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>Abbrechen</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Technique & Protection guide ---------- */
function KnuckleSVG() {
  return (
    <svg viewBox="0 0 320 170" className="w-full max-w-md" role="img" aria-label="Richtige Faust: Treffen mit Zeige- und Mittelfingerknöchel, Handgelenk gerade">
      <rect x="10" y="62" width="120" height="46" rx="10" fill="#26262a" stroke="#555" />
      <text x="70" y="90" textAnchor="middle" fill="#9a968c" fontSize="12" fontFamily="Inter">Unterarm</text>
      <rect x="128" y="50" width="22" height="70" rx="6" fill="#2f2f34" stroke="#555" />
      <text x="139" y="140" textAnchor="middle" fill="#9a968c" fontSize="11" fontFamily="Inter">Handgelenk</text>
      <rect x="148" y="34" width="110" height="102" rx="22" fill="#3a3a40" stroke="#666" />
      <circle cx="255" cy="50" r="11" fill="#d4af37" />
      <circle cx="259" cy="74" r="11" fill="#d4af37" />
      <circle cx="259" cy="98" r="10" fill="#4a4a50" stroke="#666" />
      <circle cx="254" cy="120" r="9" fill="#4a4a50" stroke="#666" />
      <line x1="10" y1="62" x2="300" y2="62" stroke="#b3121b" strokeWidth="2" strokeDasharray="6 4" />
      <text x="290" y="56" textAnchor="end" fill="#d4af37" fontSize="11" fontFamily="Inter">Treffpunkt</text>
      <text x="200" y="162" textAnchor="middle" fill="#b3121b" fontSize="11" fontFamily="Inter">Unterarm – Handgelenk – Knöchel: eine Linie</text>
    </svg>
  );
}

function GuidePanel({ app }) {
  const { today, updateToday, toast } = app;
  const checks = today.wrapChecks || {};
  const allWrap = WRAP_STEPS.every((_, i) => checks[i]);
  const toggleWrap = i => updateToday(r => {
    const wc = { ...(r.wrapChecks || {}), [i]: !(r.wrapChecks || {})[i] };
    const all = WRAP_STEPS.every((_, j) => wc[j]);
    if (all && !r.wrap) setTimeout(() => toast('Bandagieren erledigt +10 XP'), 0);
    return { ...r, wrapChecks: wc, wrap: all ? true : r.wrap && all };
  });
  return (
    <div className="space-y-4">
      <Card className="border-blood/40">
        <H2 sub="Pflicht vor jedem Training mit Knöchelhandschuhen">Knöchelhandschuh-Schutzprotokoll</H2>
        <div className="font-display text-sm uppercase tracking-wide text-stone-200">1 · Pflicht-Bandagieren</div>
        <div className="mt-2 space-y-2">
          {WRAP_STEPS.map((s, i) => <Check key={i} checked={!!checks[i]} label={s} onChange={() => toggleWrap(i)} />)}
        </div>
        {allWrap && <p className="mt-2 text-sm text-gold">✓ Hände geschützt – bereit für die Speed-Runden.</p>}

        <div className="mt-5 font-display text-sm uppercase tracking-wide text-stone-200">2 · Knöchel-Ausrichtung</div>
        <div className="mt-2 flex justify-center rounded-xl bg-coal p-3"><KnuckleSVG /></div>
        <p className="mt-2 text-sm text-stone-300">Triff immer mit den ersten zwei grossen Knöcheln (Zeige- und Mittelfinger). Das Handgelenk bleibt in gerader Linie zum Unterarm – kein Abknicken nach unten oder zur Seite.</p>

        <div className="mt-5 font-display text-sm uppercase tracking-wide text-stone-200">3 · Intensitäts-Regel</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm"><div className="font-display uppercase text-gold">Knöchelhandschuhe</div><div className="text-stone-300">Technik, Speed, Präzision · 70–80 % Kraft</div></div>
          <div className="rounded-xl border border-blood/50 bg-blood/10 p-3 text-sm"><div className="font-display uppercase text-blood">Schwere Boxhandschuhe</div><div className="text-stone-300">Power-Runden · 100 % Kraft, Tabata, Championship Rounds</div></div>
        </div>

        <div className="mt-5 font-display text-sm uppercase tracking-wide text-stone-200">4 · Handgelenk-Prehab</div>
        <div className="mt-2 space-y-2">
          {PREHAB.map(p => <div key={p.t} className="rounded-xl border border-white/10 bg-coal p-3"><div className="text-sm text-stone-100">{p.t}</div><div className="text-xs text-stone-500">{p.d}</div></div>)}
        </div>
        <p className="mt-3 text-xs text-stone-500">Stechender Schmerz, Schwellung oder Taubheit in Hand oder Handgelenk: sofort aufhören und ärztlich abklären lassen.</p>
      </Card>

      <Card>
        <H2 sub="So rufen Trainer die Schläge an (Rechtsausleger: gespiegelt)">Box-Zahlensystem</H2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[['1', 'Jab', 'Linke Gerade'], ['2', 'Cross', 'Rechte Gerade'], ['3', 'Linker Haken', 'Kopf oder Körper'], ['4', 'Rechter Haken', 'Kopf oder Körper'], ['5', 'Linker Aufwärtshaken', 'Uppercut'], ['6', 'Rechter Aufwärtshaken', 'Uppercut']].map(([n, t, s]) => (
            <div key={n} className="flex items-center gap-3 rounded-xl border border-white/10 bg-coal p-3">
              <span className="font-display text-3xl text-gold">{n}</span>
              <div><div className="text-sm text-stone-100">{t}</div><div className="text-xs text-stone-500">{s}</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <H2>Defensiv-Techniken</H2>
        <div className="space-y-2">
          {[['Slip (Pendeln)', 'Kopf mit kleiner Hüft- und Kniebewegung seitlich aus der Schlaglinie – gegen Geraden.'], ['Roll (Abrollen)', 'In die Knie gehen und unter einem Haken in U-Form durchrollen.'], ['Parry (Parieren)', 'Gerade mit der offenen Hand kurz zur Seite ablenken – kleine Bewegung, Hand sofort zurück.'], ['Pivot (Drehen)', 'Auf dem vorderen Ballen drehen, um einen neuen Winkel zu nehmen und aus der Ecke zu kommen.'], ['Block', 'Schlag mit Handschuh oder Unterarm abfangen – Ellbogen eng, Kinn unten.']].map(([t, s]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-coal p-3"><div className="font-display text-sm uppercase tracking-wide text-gold">{t}</div><div className="text-sm text-stone-300">{s}</div></div>
          ))}
        </div>
      </Card>

      <Card>
        <H2>Handschuh-Wahl</H2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          {[['Schwere Boxhandschuhe (12–16 oz)', 'Power-Runden, Championship Rounds, Tabata, Pratzen'], ['Knöchelhandschuhe', 'Speed-, Technik- und Präzisionsrunden mit 70–80 % Kraft'], ['Immer', 'Bandagen darunter – ohne Ausnahme']].map(([a, b], i) => (
            <div key={a} className={'grid grid-cols-5 gap-2 p-3 text-sm ' + (i % 2 ? 'bg-coal' : 'bg-anth2')}><div className="col-span-2 text-stone-100">{a}</div><div className="col-span-3 text-stone-400">{b}</div></div>
          ))}
        </div>
      </Card>

      <Card>
        <H2>Profi-Regeln</H2>
        <ul className="space-y-2 text-sm text-stone-300">
          {['Deckung: Hände nach jedem Schlag sofort zurück ans Kinn.', 'Atmung: Bei jedem Schlag kurz und scharf ausatmen – nie die Luft anhalten.', 'Gewichtsverlagerung: Kraft kommt aus Boden, Hüfte und Rumpf – nicht aus dem Arm.', 'Kinn runter, Augen über die Fäuste.', 'Füsse nie kreuzen, Abstand der Füsse immer halten.', 'Technik vor Kraft – sauber schlagen, dann schneller, dann härter.'].map(x => <li key={x} className="flex gap-2"><span className="text-blood">◆</span><span>{x}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}


/* =====================================================================
   ERNÄHRUNGSPLAN (an Gewicht & Ziel angepasst)
   ===================================================================== */
// Werte pro 100 g (gegart, wie gegessen): Eiweiss, Kohlenhydrate, Fett
const FOODS = {
  oats: { n: 'Haferflocken', p: 13.5, c: 58.7, f: 7 },
  quark: { n: 'Magerquark', p: 12, c: 4, f: 0.3 },
  skyr: { n: 'Skyr nature', p: 11, c: 4, f: 0.2 },
  yog: { n: 'Joghurt nature', p: 3.4, c: 4.7, f: 3.5 },
  milk: { n: 'Milch', p: 3.4, c: 4.8, f: 1.5, ml: true },
  egg: { n: 'Eier', p: 13, c: 0.7, f: 10, unit: 60, uName: 'Stk' },
  bread: { n: 'Vollkornbrot', p: 7.5, c: 41, f: 1.5, unit: 45, uName: 'Scheiben' },
  banana: { n: 'Banane', p: 1.1, c: 20, f: 0.3, unit: 120, uName: 'Stk' },
  berries: { n: 'Beeren (auch tiefgekühlt)', p: 1, c: 7, f: 0.3 },
  rice: { n: 'Reis (gekocht)', p: 2.7, c: 28, f: 0.3 },
  pasta: { n: 'Vollkornpasta (gekocht)', p: 5.8, c: 30, f: 0.9 },
  potato: { n: 'Kartoffeln (gekocht)', p: 2, c: 17, f: 0.1 },
  sweet: { n: 'Süsskartoffeln (gegart)', p: 1.6, c: 20, f: 0.1 },
  chicken: { n: 'Pouletbrust (gebraten)', p: 31, c: 0, f: 3.6 },
  salmon: { n: 'Lachs (gegart)', p: 25, c: 0, f: 12 },
  beef: { n: 'Rindshackfleisch mager (gebraten)', p: 26, c: 0, f: 8 },
  tuna: { n: 'Thunfisch (Dose, in Wasser)', p: 26, c: 0, f: 1 },
  lentils: { n: 'Linsen (gekocht)', p: 9, c: 20, f: 0.4 },
  nuts: { n: 'Nüsse', p: 20, c: 15, f: 50 },
  oil: { n: 'Olivenöl', p: 0, c: 0, f: 100, unit: 10, uName: 'EL' },
  avo: { n: 'Avocado', p: 2, c: 2, f: 15 },
  veg: { n: 'Gemüse (z. B. Brokkoli, Peperoni)', p: 2.5, c: 4, f: 0.3 },
  tomato: { n: 'Tomaten / Gurke', p: 1, c: 3, f: 0.2 },
  honey: { n: 'Honig', p: 0.3, c: 80, f: 0 },
  ricecake: { n: 'Reiswaffeln', p: 8, c: 78, f: 3, unit: 8, uName: 'Stk' },
};
const MAXG = { ricecake: 48, banana: 240, oil: 30, nuts: 40, avo: 120, egg: 300, quark: 400, skyr: 400, milk: 500, chicken: 300, salmon: 250, beef: 250, tuna: 200, lentils: 400 };

// Rollen: p = Eiweissquelle, c = Kohlenhydratquelle, f = Fettquelle, Zahl = feste Menge in g
const MEALS_PLAN = [
  {
    id: 'breakfast', title: 'Frühstück', time: 'morgens', share: { p: 0.25, c: 0.27, f: 0.3 },
    variants: [
      { name: 'Power-Porridge', items: [['oats', 'c'], ['quark', 'p'], ['berries', 100], ['nuts', 'f']] },
      { name: 'Eier-Brot', items: [['bread', 'c'], ['egg', 'p'], ['avo', 'f'], ['tomato', 100]] },
      { name: 'Skyr-Bowl', items: [['oats', 'c'], ['skyr', 'p'], ['banana', 120], ['nuts', 'f']] },
    ],
  },
  {
    id: 'lunch', title: 'Mittagessen', time: 'mittags', share: { p: 0.32, c: 0.3, f: 0.32 },
    variants: [
      { name: 'Poulet mit Reis', items: [['rice', 'c'], ['chicken', 'p'], ['veg', 200], ['oil', 'f']] },
      { name: 'Pasta Bolognese', items: [['pasta', 'c'], ['beef', 'p'], ['veg', 150], ['oil', 'f']] },
      { name: 'Thunfisch-Kartoffeln', items: [['potato', 'c'], ['tuna', 'p'], ['veg', 200], ['oil', 'f']] },
    ],
  },
  {
    id: 'snack', title: 'Snack vor dem Training', restTitle: 'Snack am Nachmittag', time: '1–2 Std. vor dem Training', share: { p: 0.08, c: 0.18, f: 0.05 },
    variants: [
      { name: 'Banane & Skyr', items: [['banana', 'c'], ['skyr', 'p']] },
      { name: 'Reiswaffeln mit Honig & Milch', items: [['ricecake', 'c'], ['honey', 15], ['milk', 'p']] },
      { name: 'Haferflocken mit Milch', items: [['oats', 'c'], ['milk', 'p']] },
    ],
  },
  {
    id: 'dinner', title: 'Abendessen (Recovery)', time: 'nach dem Training', share: { p: 0.35, c: 0.25, f: 0.33 },
    variants: [
      { name: 'Lachs & Süsskartoffeln', items: [['sweet', 'c'], ['salmon', 'p'], ['veg', 200], ['oil', 'f']] },
      { name: 'Poulet-Reis-Bowl', items: [['rice', 'c'], ['chicken', 'p'], ['veg', 200], ['oil', 'f']] },
      { name: 'Linsen-Poulet-Curry mit Reis', items: [['rice', 'c'], ['chicken', 'p'], ['lentils', 120], ['yog', 100], ['veg', 150], ['oil', 'f']] },
    ],
  },
];

function solveMeal(variant, T) {
  const g = {};
  variant.items.forEach(([k, r]) => { g[k] = typeof r === 'number' ? r : 0; });
  const role = r => (variant.items.find(x => x[1] === r) || [])[0];
  const kp = role('p'), kc = role('c'), kf = role('f');
  const sum = m => Object.keys(g).reduce((a, k) => a + FOODS[k][m] * g[k] / 100, 0);
  for (let it = 0; it < 6; it++) {
    if (kp) { const other = sum('p') - FOODS[kp].p * g[kp] / 100; g[kp] = Math.max(0, (T.p - other) / FOODS[kp].p * 100); }
    if (kc) { const other = sum('c') - FOODS[kc].c * g[kc] / 100; g[kc] = Math.max(0, (T.c - other) / FOODS[kc].c * 100); }
    if (kf) { const other = sum('f') - FOODS[kf].f * g[kf] / 100; g[kf] = Math.max(0, (T.f - other) / FOODS[kf].f * 100); }
  }
  Object.keys(g).forEach(k => {
    const F = FOODS[k];
    if (MAXG[k]) g[k] = Math.min(g[k], MAXG[k]);
    if (F.unit) { const step = k === 'oil' ? 0.5 : (k === 'banana' ? 0.5 : 1); const u = Math.max(step, Math.round(g[k] / F.unit / step) * step); g[k] = u * F.unit; }
    else g[k] = Math.max(10, Math.round(g[k] / 10) * 10);
  });
  const tot = { p: sum('p'), c: sum('c'), f: sum('f') };
  tot.kcal = tot.p * 4 + tot.c * 4 + tot.f * 9;
  return { g, tot };
}
const fmtAmount = (k, grams) => {
  const F = FOODS[k];
  if (F.unit) { const u = grams / F.unit; const s = (Math.round(u * 2) / 2).toString().replace('.', ','); return k === 'oil' ? s + ' EL' : s + ' ' + F.uName + ' (' + Math.round(grams) + ' g)'; }
  return Math.round(grams) + (F.ml ? ' ml' : ' g');
};

function NutritionPlan({ app }) {
  const { state, update, d, today } = app;
  const pr = state.profile, n = d.n;
  const setP = patch => update(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const [day, setDay] = useState('train');
  const seed = weekdayIdx();
  const [vars, setVars] = useState(() => MEALS_PLAN.map((_, i) => (seed + i) % 3));
  const [more, setMore] = useState(false);
  const rest = day === 'rest';
  const T = { p: n.prot, f: n.fat, c: rest ? Math.round(n.carbs * 0.75) : n.carbs };
  const kcal = Math.round(T.p * 4 + T.c * 4 + T.f * 9);
  const meals = MEALS_PLAN.map((m, i) => {
    const v = m.variants[vars[i]];
    const share = rest && m.id === 'snack' ? { p: 0.1, c: 0.12, f: 0.08 } : m.share;
    const MT = { p: T.p * share.p, c: T.c * share.c, f: T.f * share.f };
    return { m, v, ...solveMeal(v, MT) };
  });
  const tot = meals.reduce((a, x) => ({ p: a.p + x.tot.p, c: a.c + x.tot.c, f: a.f + x.tot.f, kcal: a.kcal + x.tot.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
  const GOALS = [['halten', '⚖️', 'Gewicht halten'], ['cut', '🔥', 'Abnehmen'], ['aufbau', '💪', 'Muskeln aufbauen']];

  return (
    <div className="space-y-4">
      <Card className="border-gold/30">
        <H2 sub="Passt sich an dein Gewicht und dein Ziel an">Dein Essensplan</H2>
        <div className="grid grid-cols-2 gap-2">
          <Stepper label="Dein Gewicht (kg)" value={pr.weight} min={25} max={160} onChange={v => setP({ weight: v })} />
          <Stepper label="Dein Alter" value={pr.age} min={8} max={80} onChange={v => setP({ age: v })} />
        </div>
        <div className="mt-3 text-xs uppercase tracking-wider text-stone-500">Dein Ziel</div>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {GOALS.map(([id, e, l]) => {
            const locked = n.minor && id !== 'halten';
            const on = (n.minor ? 'halten' : pr.goal) === id;
            return (
              <button key={id} disabled={locked} onClick={() => setP({ goal: id })} className={'rounded-2xl border-2 px-1 py-3 text-center transition disabled:opacity-30 ' + (on ? 'border-gold bg-gold/15' : 'border-white/10 bg-coal')}>
                <div className="text-2xl">{e}</div><div className="mt-1 text-xs leading-tight text-stone-200">{l}</div>
              </button>
            );
          })}
        </div>
        {n.minor && <p className="mt-2 rounded-xl bg-white/5 p-3 text-xs text-stone-300">Unter 18 gibt’s keine Diät: Dein Körper wächst noch und braucht genug Energie. Iss, bis du satt bist. Die Mengen sind nur grobe Richtwerte – bei Fragen hilft deine Familie oder deine Ärztin.</p>}
        {!n.minor && pr.goal === 'cut' && <p className="mt-2 rounded-xl bg-white/5 p-3 text-xs text-stone-300">Langsam abnehmen: ca. 0,5–1 % deines Gewichts pro Woche. Nicht hungern und nicht entwässern – sonst fehlt dir die Power im Training.</p>}
        <button onClick={() => setMore(!more)} className="mt-3 text-xs text-stone-400">{more ? '▾' : '▸'} Genauer machen (Grösse, Geschlecht, Aktivität)</button>
        {more && (
          <div className="mt-2 space-y-2">
            <Stepper label="Grösse (cm)" value={pr.height} min={120} max={215} onChange={v => setP({ height: v })} />
            <div className="grid grid-cols-2 gap-2">
              {[['m', 'Männlich'], ['f', 'Weiblich']].map(([v, l]) => <button key={v} onClick={() => setP({ sex: v })} className={'rounded-xl border py-2.5 text-sm ' + (pr.sex === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{l}</button>)}
            </div>
            <select value={pr.activity} onChange={e => setP({ activity: +e.target.value })} className="w-full rounded-xl border border-white/10 bg-coal px-3 py-2.5 text-sm text-stone-200">
              <option value={1.55}>3–4 Trainings pro Woche</option>
              <option value={1.725}>5 Trainings pro Woche</option>
              <option value={1.9}>Sehr viel (2× täglich / körperlicher Job)</option>
            </select>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[['train', '🥊 Trainingstag'], ['rest', '😌 Ruhetag']].map(([v, l]) => <button key={v} onClick={() => setDay(v)} className={'rounded-xl border py-2.5 font-display text-sm uppercase tracking-wider ' + (day === v ? 'border-gold bg-gold text-ink' : 'border-white/10 text-stone-400')}>{l}</button>)}
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[['Energie', kcal, 'kcal', 'text-gold'], ['Eiweiss', T.p, 'g', 'text-stone-100'], ['Kohlenh.', T.c, 'g', 'text-stone-100'], ['Fett', T.f, 'g', 'text-stone-100']].map(([l, v, u, c]) => (
            <div key={l} className="rounded-xl bg-coal px-1 py-2.5">
              <div className={'font-display text-xl leading-none ' + c}>{v}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-stone-500">{u} {l}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">{rest ? 'Ruhetag: etwas weniger Kohlenhydrate, gleich viel Eiweiss.' : 'Trainingstag: mehr Kohlenhydrate als Treibstoff.'} Dazu {n.liters} l Wasser.</p>
      </Card>

      {meals.map(({ m, v, g, tot: t }, i) => (
        <Card key={m.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-blood">{rest && m.restTitle ? m.restTitle : m.title} · {rest && m.id === 'snack' ? 'nachmittags' : rest && m.id === 'dinner' ? 'abends' : m.time}</div>
              <div className="font-display text-xl uppercase leading-tight text-stone-100">{v.name}</div>
            </div>
            <button onClick={() => setVars(a => a.map((x, j) => j === i ? (x + 1) % m.variants.length : x))} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-stone-300 active:scale-95">🔄 Andere Idee</button>
          </div>
          <ul className="mt-3 space-y-1.5">
            {v.items.map(([k]) => (
              <li key={k} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1.5 text-sm">
                <span className="text-stone-300">{FOODS[k].n}</span>
                <span className="shrink-0 font-display text-stone-50">{fmtAmount(k, g[k])}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-stone-500">≈ {Math.round(t.kcal)} kcal · {Math.round(t.p)} g Eiweiss</div>
        </Card>
      ))}
      <p className="px-1 text-xs text-stone-500">Ganzer Tag laut Plan: ≈ {Math.round(tot.kcal)} kcal · {Math.round(tot.p)} g Eiweiss · {Math.round(tot.c)} g Kohlenhydrate · {Math.round(tot.f)} g Fett. Mengen gelten für gekochtes Essen. Alles sind Richtwerte – Hunger, Leistung und Schlaf sind wichtiger als das Gramm.</p>
    </div>
  );
}

/* =====================================================================
   TAGESZIELE (anpassbar)
   ===================================================================== */
const GOAL_PRESETS = [['🧘', 'Dehnen (10 Min.)'], ['💪', '20 Liegestütze'], ['🚶', 'Spaziergang'], ['📵', 'Kein Handy vor dem Schlafen'], ['🍎', 'Obst gegessen'], ['🧠', 'Technik-Video geschaut'], ['🪢', 'Seilspringen'], ['📖', 'Lesen']];
const EMOJIS = ['⭐', '💪', '🧘', '🚶', '🍎', '📵', '🧠', '🪢', '📖', '🛁', '🦷', '🎯'];

function GoalsEditor({ app, onClose }) {
  const { state, update, d } = app;
  const G = state.goals;
  const setG = patch => update(s => ({ ...s, goals: { ...s.goals, ...patch } }));
  const [txt, setTxt] = useState('');
  const [emo, setEmo] = useState('⭐');
  const enabledCount = ['train', 'water', 'food', 'sleep'].filter(k => G[k]).length + G.custom.length;
  const add = (e, l) => { if (!l.trim() || G.custom.length >= 6) return; setG({ custom: [...G.custom, { id: 'c' + Date.now(), emoji: e, label: l.trim() }] }); setTxt(''); };
  const BUILT = [['train', '🥊', 'Training', 'Lektion, Erholung oder Fight Camp'], ['water', '💧', 'Trinken', 'Wasserziel erreichen'], ['food', '🥦', 'Gesund essen', 'Die 5 Punkte der Checkliste'], ['sleep', '😴', 'Schlafen', 'Schlaf eintragen']];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-anth p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden"></div>
        <h3 className="font-display text-3xl uppercase text-stone-50">Ziele anpassen</h3>
        <p className="text-sm text-stone-400">Tippe an, was du jeden Tag schaffen willst. Die Tagesbelohnung gibt’s, wenn alle eingeschalteten Ziele erledigt sind.</p>

        <div className="mt-4 space-y-2">
          {BUILT.map(([k, e, l, s]) => (
            <button key={k} onClick={() => { if (G[k] && enabledCount <= 1) return; setG({ [k]: !G[k] }); }} className={'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ' + (G[k] ? 'border-gold/60 bg-gold/10' : 'border-white/10 bg-coal opacity-60')}>
              <span className="text-3xl">{e}</span>
              <span className="flex-1"><span className="block text-stone-100">{l}</span><span className="block text-xs text-stone-500">{s}</span></span>
              <span className={'relative h-6 w-11 rounded-full transition ' + (G[k] ? 'bg-gold' : 'bg-white/15')}><span className={'absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-all ' + (G[k] ? 'left-[22px]' : 'left-0.5')}></span></span>
            </button>
          ))}
        </div>

        {(G.water || G.sleep) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {G.water && (
              <div className="rounded-xl border border-white/10 bg-coal p-2.5">
                <div className="text-[11px] uppercase tracking-wider text-stone-500">Wasser pro Tag</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <button onClick={() => setG({ waterL: Math.max(1, (G.waterL || d.n.liters) - 0.25) })} className="h-8 w-8 rounded-lg bg-white/10 text-lg">−</button>
                  <span className="font-display text-lg text-stone-100">{(G.waterL || d.n.liters).toString().replace('.', ',')} l</span>
                  <button onClick={() => setG({ waterL: Math.min(6, (G.waterL || d.n.liters) + 0.25) })} className="h-8 w-8 rounded-lg bg-white/10 text-lg">+</button>
                </div>
                <button onClick={() => setG({ waterL: null })} className={'mt-1 w-full text-[11px] ' + (G.waterL ? 'text-gold' : 'text-stone-600')}>{G.waterL ? '↺ automatisch nach Gewicht' : 'automatisch nach Gewicht'}</button>
              </div>
            )}
            {G.sleep && <Stepper label="Schlaf-Ziel (Std.)" value={G.sleepH || 7} min={6} max={11} step={0.5} fmtv={v => String(v).replace('.', ',') + ' h'} onChange={v => setG({ sleepH: v })} />}
          </div>
        )}

        <div className="mt-5 font-display text-lg uppercase tracking-wider text-stone-200">Eigene Ziele</div>
        {G.custom.length > 0 && (
          <div className="mt-2 space-y-2">
            {G.custom.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3">
                <span className="text-2xl">{c.emoji}</span><span className="flex-1 text-stone-100">{c.label}</span>
                <button onClick={() => setG({ custom: G.custom.filter(x => x.id !== c.id) })} className="rounded-lg px-2 py-1 text-sm text-stone-400" aria-label="Löschen">🗑</button>
              </div>
            ))}
          </div>
        )}
        {G.custom.length < 6 ? (
          <>
            <div className="mt-3 text-xs text-stone-500">Schnell hinzufügen:</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GOAL_PRESETS.filter(([, l]) => !G.custom.some(c => c.label === l)).map(([e, l]) => (
                <button key={l} onClick={() => add(e, l)} className="rounded-full border border-white/15 bg-coal px-3 py-1.5 text-xs text-stone-200 active:scale-95">{e} {l}</button>
              ))}
            </div>
            <div className="mt-3 text-xs text-stone-500">Oder ein eigenes Ziel:</div>
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
              {EMOJIS.map(e => <button key={e} onClick={() => setEmo(e)} className={'h-9 w-9 shrink-0 rounded-lg text-xl ' + (emo === e ? 'bg-gold/30 ring-2 ring-gold' : 'bg-coal')}>{e}</button>)}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={txt} onChange={e => setTxt(e.target.value)} maxLength={30} placeholder="z. B. Hausaufgaben erledigt" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-coal px-3 py-2.5 text-stone-100 outline-none focus:border-gold" />
              <Btn onClick={() => add(emo, txt)} disabled={!txt.trim()}>+</Btn>
            </div>
          </>
        ) : <p className="mt-2 text-xs text-stone-500">Maximal 6 eigene Ziele.</p>}
        <p className="mt-3 text-xs text-stone-500">Jedes eigene Ziel gibt +5 XP.</p>
        <div className="mt-4"><BigBtn kind="gold" onClick={onClose}>Fertig</BigBtn></div>
      </div>
    </div>
  );
}

/* =====================================================================
   COACH: Illustrationen, Techniken, Lektionen, Player, Onboarding, Home
   ===================================================================== */

const GOLD = '#d4af37', RED = '#b3121b', SKIN = '#3a3a40', LINE = '#6b6b72';
const Arrow = ({ id }) => (
  <defs><marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L8 5L1 9z" fill={GOLD} /></marker></defs>
);

function Feet({ variant = 'stance', lefty }) {
  const m = x => lefty ? 200 - x : x, r = a => lefty ? -a : a;
  const foot = (x, y, rot, ghost) => (
    <g transform={`translate(${m(x)} ${y}) rotate(${r(rot)})`} opacity={ghost ? 0.35 : 1}>
      <ellipse cx="0" cy="6" rx="15" ry="27" fill={ghost ? 'none' : SKIN} stroke={ghost ? GOLD : LINE} strokeDasharray={ghost ? '4 3' : ''} strokeWidth="2" />
      {[-9, -3, 3, 9].map((tx, i) => <circle key={i} cx={tx} cy={-25 + Math.abs(tx) * 0.4} r="3.4" fill={ghost ? 'none' : SKIN} stroke={LINE} />)}
    </g>
  );
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={'fa' + variant} />
      <line x1={m(100)} y1="30" x2={m(100)} y2="6" stroke={RED} strokeWidth="3" markerEnd={'url(#fa' + variant + ')'} />
      {variant === 'pivot' && foot(140, 120, 80, true)}
      {foot(78, 72, 12)}
      {foot(126, 146, 42)}
      {variant === 'stance' && <line x1={m(78)} y1="110" x2={m(126)} y2="110" stroke={GOLD} strokeWidth="2" strokeDasharray="5 4" />}
      {variant === 'step' && <>
        <line x1={m(48)} y1="90" x2={m(48)} y2="44" stroke={GOLD} strokeWidth="4" markerEnd={'url(#fa' + variant + ')'} />
        <line x1={m(160)} y1="168" x2={m(160)} y2="128" stroke={GOLD} strokeWidth="3" strokeOpacity="0.6" markerEnd={'url(#fa' + variant + ')'} />
      </>}
      {variant === 'pivot' && <path d={`M${m(108)} 166 Q${m(150)} 160 ${m(160)} 128`} fill="none" stroke={GOLD} strokeWidth="3" markerEnd={'url(#fa' + variant + ')'} />}
    </svg>
  );
}

function TopView({ punch, lefty }) {
  const id = 'tv' + punch;
  const paths = {
    jab: 'M74 88 L90 44',
    cross: 'M120 98 L106 44',
    lhook: 'M64 96 C28 70 46 34 90 32',
    rhook: 'M128 104 C174 82 152 34 110 32',
  };
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={id} />
      <g transform={lefty ? 'translate(200 0) scale(-1 1)' : ''}>
        <circle cx="100" cy="22" r="17" fill="#2a2a2e" stroke={GOLD} strokeDasharray="4 3" />
        <ellipse cx="100" cy="142" rx="52" ry="18" transform="rotate(-16 100 142)" fill={SKIN} stroke={LINE} strokeWidth="2" />
        <circle cx="104" cy="130" r="18" fill="#4a4a50" stroke={LINE} strokeWidth="2" />
        <line x1="62" y1="150" x2="74" y2="104" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
        <line x1="146" y1="128" x2="122" y2="112" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
        <circle cx="74" cy="98" r="11" fill={RED} />
        <circle cx="120" cy="108" r="11" fill={RED} />
        {paths[punch] && <path d={paths[punch]} fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" markerEnd={'url(#' + id + ')'} />}
        {punch === 'cross' && <path d="M60 176 Q100 192 142 168" fill="none" stroke={GOLD} strokeWidth="3" strokeOpacity="0.7" markerEnd={'url(#' + id + ')'} />}
      </g>
    </svg>
  );
}

function FrontView({ pose = 'guard', lefty }) {
  const id = 'fv' + pose;
  let hx = 100, hy = 46, lf = [80, 56], rf = [120, 56], dy = 0;
  if (pose === 'slip') { hx = 78; lf = [60, 60]; rf = [100, 58]; }
  if (pose === 'roll') { hy = 70; dy = 18; lf = [80, 74]; rf = [120, 74]; }
  if (pose === 'block') { rf = [124, 36]; }
  if (pose === 'body') { hy = 58; dy = 12; lf = [78, 112]; }
  if (pose === 'upper') { lf = [80, 104]; }
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={id} />
      <g transform={lefty ? 'translate(200 0) scale(-1 1)' : ''}>
        {(pose === 'slip' || pose === 'roll') && <circle cx="100" cy="46" r="19" fill="none" stroke={GOLD} strokeDasharray="4 3" opacity="0.5" />}
        <rect x={68} y={76 + dy} width="64" height={92 - dy} rx="16" fill={SKIN} stroke={LINE} strokeWidth="2" />
        <circle cx={hx} cy={hy} r="19" fill="#4a4a50" stroke={LINE} strokeWidth="2" />
        <polyline points={`72,${86 + dy} 74,${108 + dy / 2} ${lf[0]},${lf[1]}`} fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={`128,${86 + dy} 126,${108 + dy / 2} ${rf[0]},${rf[1]}`} fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lf[0]} cy={lf[1]} r="12" fill={RED} />
        <circle cx={rf[0]} cy={rf[1]} r="12" fill={RED} />
        {pose === 'slip' && <path d="M98 16 L70 16" stroke={GOLD} strokeWidth="4" markerEnd={'url(#' + id + ')'} />}
        {pose === 'roll' && <path d="M140 30 Q100 120 60 30" fill="none" stroke={GOLD} strokeWidth="4" markerEnd={'url(#' + id + ')'} />}
        {pose === 'upper' && <path d="M80 92 Q74 54 92 24" fill="none" stroke={GOLD} strokeWidth="5" markerEnd={'url(#' + id + ')'} />}
        {pose === 'body' && <path d="M60 108 L30 108" stroke={GOLD} strokeWidth="5" markerEnd={'url(#' + id + ')'} />}
        {pose === 'guard' && <path d="M40 190 L160 190" stroke={GOLD} strokeWidth="0" />}
      </g>
    </svg>
  );
}

function Illu({ img, lefty, className = 'h-44 w-44' }) {
  if (!img) return null;
  let el = null;
  if (img.startsWith('feet:')) el = <Feet variant={img.slice(5)} lefty={lefty} />;
  else if (img.startsWith('top:')) el = <TopView punch={img.slice(4)} lefty={lefty} />;
  else if (img.startsWith('front:')) el = <FrontView pose={img.slice(6)} lefty={lefty} />;
  else if (img === 'fist') el = <KnuckleSVG />;
  else el = <div className="flex h-full w-full items-center justify-center text-7xl">{img}</div>;
  return <div className={'mx-auto ' + className}>{el}</div>;
}

/* ---------- Techniken ---------- */
const sideWord = (lefty, front) => (front ? (lefty ? 'rechte' : 'linke') : (lefty ? 'linke' : 'rechte'));
const TECH = {
  stance: { name: 'Die Boxstellung', img: 'feet:stance', lesson: 1, points: l => ['Stell die Füsse etwa so weit auseinander wie deine Schultern.', `Dein ${sideWord(l, true)} Fuss steht vorne, der ${sideWord(l, false)} hinten.`, 'Knie leicht beugen – als ob du gleich losspringen willst.'], mistake: 'Füsse nicht hintereinander auf eine Linie stellen – sonst kippst du um.', caption: 'Von oben gesehen · Pfeil = Richtung Sack' },
  guard: { name: 'Die Deckung', img: 'front:guard', lesson: 1, points: () => ['Fäuste hoch an die Wangen.', 'Ellbogen nah am Bauch – sie schützen deine Rippen.', 'Kinn runter und über die Fäuste schauen.'], mistake: 'Wenn du müde wirst, fallen die Hände runter. Immer wieder hochnehmen!', caption: 'Von vorne gesehen' },
  step: { name: 'Schritte vor & zurück', img: 'feet:step', lesson: 1, points: () => ['Vorwärts: Zuerst geht der vordere Fuss, der hintere zieht nach.', 'Rückwärts: Zuerst geht der hintere Fuss.', 'Kleine Schritte – die Füsse kommen nie zusammen.'], mistake: 'Nicht über die Füsse stolpern: nie die Beine kreuzen.', caption: '1 = zuerst, 2 = danach' },
  jab: { name: 'Der Jab – die «Eins»', img: 'top:jab', lesson: 2, points: () => ['Die vordere Faust schnell gerade nach vorne.', 'Am Ende die Faust drehen: Handrücken nach oben.', 'Genauso schnell wieder zurück an die Wange!'], mistake: 'Die hintere Hand bleibt immer am Kinn.', say: 'Trainer sagen zum Jab auch einfach: Eins.', caption: 'Von oben gesehen · der Kreis oben ist der Sack' },
  cross: { name: 'Die Gerade – die «Zwei»', img: 'top:cross', lesson: 3, points: () => ['Den hinteren Fuss drehen, als ob du eine Wanze zerdrückst.', 'Hüfte und Schulter drehen mit nach vorne.', 'Faust gerade nach vorne und sofort zurück.'], mistake: 'Nicht nur mit dem Arm schlagen – die Kraft kommt aus Fuss und Hüfte.', say: 'Jab und Gerade zusammen heissen: Eins, zwei.', caption: 'Der kleine Pfeil unten: Hüfte dreht mit' },
  pivot: { name: 'Seitschritt & Pivot', img: 'feet:pivot', lesson: 4, points: () => ['Seitwärts: Der Fuss auf der Seite, wohin du willst, geht zuerst.', 'Pivot: Auf dem vorderen Fussballen drehen wie ein Zirkel.', 'Der hintere Fuss schwingt mit – jetzt stehst du in einem neuen Winkel.'], mistake: 'Beim Drehen nicht die Deckung vergessen.', caption: 'Der hintere Fuss dreht um den vorderen' },
  lhook: { name: 'Der vordere Haken – die «Drei»', img: 'top:lhook', lesson: 5, points: () => ['Ellbogen hoch, der Arm ist gebogen wie ein Haken.', 'Die Kraft kommt aus der Drehung von Hüfte und vorderem Fuss.', 'Kurz und kompakt – nicht weit ausholen.'], mistake: 'Kein Riesen-Schwinger: der Haken ist ein kurzer, schneller Schlag.', caption: 'Bogen von der Seite zum Ziel' },
  block: { name: 'Blocken', img: 'front:block', lesson: 6, points: () => ['Die Faust fest an die Schläfe drücken.', 'Der Ellbogen schützt die Rippen.', 'Zähne zusammen, Kinn runter.'], mistake: 'Nicht die Augen zumachen – immer hinschauen.', caption: 'Hintere Faust schützt die Schläfe' },
  slip: { name: 'Pendeln (Slip)', img: 'front:slip', lesson: 6, points: () => ['Den Kopf nur eine Kopfbreite zur Seite bewegen.', 'Die Bewegung kommt aus Knie und Hüfte.', 'Die Augen schauen weiter nach vorne.'], mistake: 'Nicht zu weit pendeln – sonst bist du aus dem Gleichgewicht.', caption: 'Kopf weicht dem Schlag zur Seite aus' },
  rhook: { name: 'Der hintere Haken – die «Vier»', img: 'top:rhook', lesson: 7, points: () => ['Hinteren Fuss und Hüfte kräftig eindrehen.', 'Ellbogen hoch, Arm bleibt gebogen.', 'Danach sofort zurück in die Deckung.'], mistake: 'Vordere Hand bleibt oben an der Wange.', caption: 'Bogen von hinten zum Ziel' },
  body: { name: 'Schläge zum Körper', img: 'front:body', lesson: 7, points: () => ['In die Knie gehen – nicht nur den Arm senken.', 'Ziel am Sack: Bauch- und Rippenhöhe.', 'Danach wieder hoch und Hände an die Wangen.'], mistake: 'Nicht nach vorne bücken – der Rücken bleibt gerade.', caption: 'Mit den Knien tief gehen' },
  upper: { name: 'Aufwärtshaken – «Fünf» & «Sechs»', img: 'front:upper', lesson: 9, points: () => ['Leicht in die Knie, die Faust kurz nach unten.', 'Aus den Beinen nach oben drücken.', 'Die Handfläche zeigt dabei zu dir.'], mistake: 'Nicht weit nach unten ausholen – nur ein kleines Stück.', caption: 'Von unten nach oben' },
  roll: { name: 'Abrollen (Roll)', img: 'front:roll', lesson: 10, points: () => ['In die Knie gehen und den Oberkörper wie ein U unter dem Schlag durchführen.', 'Die Hände bleiben dabei oben.', 'Danach direkt zurückschlagen.'], mistake: 'Nicht nach vorne bücken – mit den Knien runter.', caption: 'Wie ein U unter dem Haken durch' },
  knuckle: { name: 'Knöchelhandschuhe richtig nutzen', img: 'fist', lesson: 11, points: () => ['Nur mit Bandagen darunter.', 'Mit den zwei grossen Knöcheln treffen, Handgelenk gerade.', 'Nur 70–80 % Kraft – für Tempo und Treffer, nicht für Power.'], mistake: 'Wenn Hand oder Handgelenk wehtun: sofort aufhören.', caption: 'Unterarm, Handgelenk und Knöchel in einer Linie' },
};
const TECH_ORDER = ['stance', 'guard', 'step', 'jab', 'cross', 'pivot', 'lhook', 'block', 'slip', 'rhook', 'body', 'upper', 'roll', 'knuckle'];

/* Kombinationen – nur aus gelernten Techniken */
const COMBO_LIB = [
  { t: 'Schritt vor!', r: ['step'] }, { t: 'Schritt zurück!', r: ['step'] }, { t: 'Zwei Schritte vor!', r: ['step'] }, { t: 'Zwei Schritte zurück!', r: ['step'] }, { t: 'Hände hoch!', r: ['guard'] },
  { t: 'Jab!', r: ['jab'] }, { t: 'Doppel-Jab!', r: ['jab'] }, { t: 'Jab, Schritt zurück!', r: ['jab', 'step'] }, { t: 'Schritt vor, Jab!', r: ['jab', 'step'] }, { t: 'Drei Jabs!', r: ['jab'] },
  { t: 'Eins, zwei!', r: ['jab', 'cross'] }, { t: 'Jab, Jab, Gerade!', r: ['jab', 'cross'] }, { t: 'Eins, zwei, eins!', r: ['jab', 'cross'] }, { t: 'Gerade!', r: ['cross'] },
  { t: 'Jab, Pivot!', r: ['jab', 'pivot'] }, { t: 'Eins, zwei, Seitschritt!', r: ['jab', 'cross', 'pivot'] }, { t: 'Pivot, Jab!', r: ['jab', 'pivot'] },
  { t: 'Eins, zwei, drei!', r: ['jab', 'cross', 'lhook'] }, { t: 'Jab, vorderer Haken!', r: ['jab', 'lhook'] }, { t: 'Vorderer Haken!', r: ['lhook'] }, { t: 'Eins, zwei, drei, zwei!', r: ['jab', 'cross', 'lhook'] },
  { t: 'Block, eins, zwei!', r: ['block', 'jab', 'cross'] }, { t: 'Pendeln, Gerade!', r: ['slip', 'cross'] }, { t: 'Pendeln, Jab!', r: ['slip', 'jab'] }, { t: 'Eins, zwei, pendeln!', r: ['slip', 'jab', 'cross'] },
  { t: 'Vorderer Haken, hinterer Haken!', r: ['lhook', 'rhook'] }, { t: 'Eins, zwei, drei, vier!', r: ['jab', 'cross', 'lhook', 'rhook'] }, { t: 'Haken zum Körper, Haken zum Kopf!', r: ['lhook', 'body'] }, { t: 'Eins, zwei, Körperhaken!', r: ['jab', 'cross', 'lhook', 'body'] },
  { t: 'Aufwärtshaken, vorderer Haken!', r: ['upper', 'lhook'] }, { t: 'Eins, zwei, Aufwärtshaken!', r: ['jab', 'cross', 'upper'] }, { t: 'Fünf, sechs!', r: ['upper'] },
  { t: 'Abrollen, Haken, Gerade!', r: ['roll', 'lhook', 'cross'] }, { t: 'Eins, zwei, abrollen!', r: ['roll', 'jab', 'cross'] }, { t: 'Abrollen, eins, zwei!', r: ['roll', 'jab', 'cross'] },
];
const BEGINNER_PACING = ['Hände hoch!', 'Ausatmen beim Schlag!', 'Kinn runter!', 'Locker bleiben!', 'Bleib auf den Ballen!'];
function callsFor(known, knuckle, unlockedCalls) {
  const lib = COMBO_LIB.filter(c => c.r.every(x => known.includes(x)));
  const strikes = lib.filter(c => !c.r.every(x => x === 'step' || x === 'guard'));
  const base = strikes.length >= 3 ? strikes : lib;
  return () => {
    if (knuckle && Math.random() < 0.28) return pick(KNUCKLE_TIPS);
    if (known.includes('guard') && Math.random() < 0.15) return pick(BEGINNER_PACING);
    if (unlockedCalls.length && Math.random() < 0.15) return pick(unlockedCalls);
    return pick(base.length ? base : [{ t: 'Hände hoch!' }]).t;
  };
}

/* ---------- Lektionen ---------- */
const WARM = [
  { type: 'timed', title: 'Hampelmann', sec: 60, icon: '🤸', cue: 'Locker springen, Arme über den Kopf. Wir wärmen auf!' },
  { type: 'timed', title: 'Arme kreisen', sec: 40, icon: '🔄', cue: 'Grosse Kreise mit beiden Armen. Erst nach vorne, dann nach hinten.' },
  { type: 'timed', title: 'Handgelenke & Finger', sec: 40, icon: '✋', cue: 'Handgelenke kreisen. Finger weit aufmachen und Faust schliessen.' },
  { type: 'timed', title: 'Nacken stark machen', sec: 40, icon: '🙆', cue: 'Hand gegen die Stirn drücken, der Kopf bleibt still. Dann Hinterkopf und Seiten. Je 10 Sekunden.' },
  { type: 'timed', title: 'Kniebeugen', sec: 40, icon: '🦵', cue: 'Langsam runter, als ob du dich auf einen Stuhl setzt. Fersen bleiben am Boden.' },
];
const COOL = [
  { type: 'timed', title: 'Ausschütteln & atmen', sec: 40, icon: '🌬️', cue: 'Arme und Beine locker ausschütteln. Tief einatmen, langsam ausatmen.' },
  { type: 'timed', title: 'Brust & Schultern dehnen', sec: 45, icon: '🧘', cue: 'Hände hinter dem Rücken verschränken und Brust rausdrücken. Ruhig atmen.' },
  { type: 'timed', title: 'Beine dehnen', sec: 45, icon: '🦵', cue: 'Ein Bein nach vorne, Ferse auf den Boden, Oberkörper leicht nach vorne. Nach der Hälfte Seite wechseln.' },
];
const learn = id => ({ type: 'learn', tech: id });
const shadow = (sec, title = 'Schattenboxen', cue = 'Boxe in die Luft. Mach genau, was ich ansage. Langsam und sauber!') => ({ type: 'timed', title, sec, icon: '🥊', cue, calls: true, rest: 20 });
const WRAP = { type: 'check', title: 'Hände bandagieren' };
const bag = (rounds, work, rest, note, extra = {}) => ({ type: 'rounds', title: 'Am Sandsack', rounds, work, rest, note, ...extra });
const reps = (title, sets, n, cue, extra = {}) => ({ type: 'reps', title, sets, n, cue, icon: '💪', ...extra });

const LESSONS = [
  { id: 'L1', week: 1, title: 'Stellung & Deckung', goal: 'Du lernst, wie ein Boxer steht.', learns: ['stance', 'guard', 'step'], steps: [...WARM, learn('stance'), { type: 'timed', title: 'Stellung üben', sec: 45, icon: '🧍', cue: 'Geh in deine Boxstellung. Wippe leicht auf den Fussballen.', rest: 15 }, learn('guard'), { type: 'timed', title: 'Stellung + Deckung halten', sec: 60, icon: '🛡️', cue: 'Stellung und Fäuste an die Wangen. Leicht wippen und ruhig atmen.', rest: 20 }, learn('step'), shadow(60, 'Schritte üben', 'Mach die Schritte, die ich ansage. Füsse nie zusammen!'), shadow(60, 'Schritte üben', 'Noch eine Runde. Hände bleiben oben!'), ...COOL] },
  { id: 'L2', week: 1, title: 'Der Jab', goal: 'Dein erster Schlag – die Eins.', learns: ['jab'], steps: [...WARM, learn('jab'), shadow(60, 'Jab in die Luft'), shadow(60, 'Jab in die Luft'), WRAP, bag(3, 90, 60, 'Nur Jabs. Locker, halbe Kraft – Technik zählt!'), ...COOL] },
  { id: 'L3', week: 1, title: 'Die Gerade', goal: 'Jab und Gerade: die berühmte «Eins-zwei».', learns: ['cross'], steps: [...WARM, learn('cross'), shadow(60), shadow(60), WRAP, bag(3, 90, 60, 'Jab und Gerade. Hüfte mitdrehen!'), reps('Liegestütze', 2, '5–10', 'Auch auf den Knien erlaubt. Rücken gerade wie ein Brett.'), ...COOL] },
  { id: 'L4', week: 2, title: 'Bewegen wie ein Boxer', goal: 'Seitschritte und Drehen.', learns: ['pivot'], steps: [...WARM, learn('pivot'), shadow(90), WRAP, bag(4, 90, 60, 'Schlagen und bewegen. Nie still stehen!'), ...COOL] },
  { id: 'L5', week: 2, title: 'Der vordere Haken', goal: 'Die «Drei» – dein erster Haken.', learns: ['lhook'], steps: [...WARM, learn('lhook'), shadow(60), shadow(60), WRAP, bag(4, 90, 60, 'Eins, zwei, drei. Haken kurz halten!'), reps('Unterarmstütz (Plank)', 2, '30 Sek.', 'Auf den Unterarmen, Körper gerade wie ein Brett.', { hold: 30 }), ...COOL] },
  { id: 'L6', week: 2, title: 'Verteidigung', goal: 'Blocken und Pendeln.', learns: ['block', 'slip'], steps: [...WARM, learn('block'), learn('slip'), shadow(60, 'Verteidigung üben', 'Blocken und pendeln, dann zurückschlagen.'), WRAP, bag(4, 120, 60, 'Nach jeder Kombination: pendeln oder blocken.'), ...COOL] },
  { id: 'L7', week: 3, title: 'Hinterer Haken & Körper', goal: 'Die «Vier» und Schläge zum Bauch.', learns: ['rhook', 'body'], steps: [...WARM, learn('rhook'), learn('body'), shadow(90), WRAP, bag(4, 120, 60, 'Kopf und Körper abwechseln.'), ...COOL] },
  { id: 'L8', week: 3, title: 'Kraft-Tag', goal: 'Starke Arme, starker Rücken, starker Bauch.', learns: [], steps: [...WARM, reps('An der Stange hängen', 3, '20 Sek.', 'Einfach hängen, Schultern leicht nach unten ziehen.', { hold: 20, need: 'bar', alt: reps('Superman', 3, '20 Sek.', 'Auf dem Bauch liegen, Arme und Beine leicht anheben.', { hold: 20 }) }), reps('Langsame Klimmzüge (negativ)', 3, '3', 'Mit einem Sprung nach oben, dann ganz langsam runterlassen – zähl bis 5.', { pull: 3, need: 'bar', alt: reps('Liegestütze', 3, '5–10', 'Auch auf den Knien erlaubt.') }), reps('Liegestütze', 3, '5–10', 'Auch auf den Knien erlaubt. Rücken gerade.'), reps('Unterarmstütz (Plank)', 2, '30 Sek.', 'Körper gerade wie ein Brett.', { hold: 30 }), WRAP, bag(3, 60, 60, 'Kräftig schlagen – aber sauber!'), ...COOL] },
  { id: 'L9', week: 3, title: 'Aufwärtshaken', goal: 'Die «Fünf» und «Sechs».', learns: ['upper'], steps: [...WARM, learn('upper'), shadow(60), shadow(60), WRAP, bag(4, 120, 60, 'Aufwärtshaken nur aus kurzer Distanz.'), ...COOL] },
  { id: 'L10', week: 4, title: 'Abrollen & Kontern', goal: 'Unter dem Schlag durch – und zurück!', learns: ['roll'], steps: [...WARM, learn('roll'), shadow(60, 'Abrollen üben', 'Abrollen, dann sofort zurückschlagen.'), WRAP, bag(5, 120, 60, 'Nach dem Abrollen immer kontern.'), ...COOL] },
  { id: 'L11', week: 4, title: 'Speed-Training', goal: 'Schnelle Hände mit Knöchelhandschuhen.', learns: ['knuckle'], knuckle: true, steps: [...WARM, { ...learn('knuckle'), need: 'knuckle' }, WRAP, bag(4, 120, 60, 'Schnell und genau – nur 70–80 % Kraft!', { knuckle: true }), { type: 'timed', title: 'Hände kräftigen', sec: 60, icon: '✊', cue: 'Faust ganz fest machen und ganz weit öffnen. Immer im Wechsel.' }, ...COOL] },
  { id: 'L12', week: 4, title: 'Dein erster Kampf', goal: 'Die Prüfung: 5 Runden mit allem, was du kannst.', learns: [], final: true, steps: [...WARM, shadow(60, 'Schattenboxen', 'Alles, was du gelernt hast. Bereit machen für den Kampf!'), WRAP, bag(5, 120, 60, 'Der grosse Tag! Gib alles – aber mit Technik.'), ...COOL] },
];
const WEEKS = { 1: 'Die Basics', 2: 'Bewegen & verteidigen', 3: 'Mehr Power', 4: 'Bereit für den Kampf' };
const REGEN = { id: 'regen', title: 'Erholungstag', goal: 'Locker bewegen, damit du morgen wieder Power hast.', kind: 'regen', steps: [
  { type: 'timed', title: 'Gehen auf der Stelle', sec: 60, icon: '🚶', cue: 'Locker auf der Stelle gehen und die Arme schwingen.' },
  { type: 'timed', title: 'Hüfte kreisen', sec: 45, icon: '🔄', cue: 'Hände an die Hüften und grosse Kreise. Nach der Hälfte andere Richtung.' },
  { type: 'timed', title: 'Arme kreisen', sec: 45, icon: '🔄', cue: 'Langsame, grosse Kreise.' },
  { type: 'timed', title: 'Katze und Kuh', sec: 60, icon: '🐈', cue: 'Im Vierfüsslerstand: Rücken rund machen wie eine Katze, dann ins Hohlkreuz. Langsam.' },
  { type: 'timed', title: 'Handgelenke dehnen', sec: 45, icon: '✋', cue: 'Arm nach vorne, mit der anderen Hand die Finger sanft zu dir ziehen. Seite wechseln.' },
  { type: 'timed', title: 'Lockeres Schattenboxen', sec: 90, icon: '🥊', cue: 'Ganz locker, halbes Tempo. Spür die Technik.', calls: true },
  { type: 'timed', title: 'Beine dehnen', sec: 60, icon: '🦵', cue: 'Ein Bein nach vorne, Ferse auf den Boden. Nach der Hälfte wechseln.' },
  { type: 'timed', title: 'Ruhig atmen', sec: 60, icon: '🌬️', cue: 'Vier Sekunden einatmen, vier halten, vier ausatmen. Ganz ruhig.' },
] };

const knownUpTo = idx => { const s = []; LESSONS.slice(0, idx + 1).forEach(l => s.push(...l.learns)); return s; };
const lessonIndex = id => LESSONS.findIndex(l => l.id === id);
function resolveSteps(steps, equip) {
  return steps.map(s => (s.need && !equip[s.need]) ? (s.alt || null) : s).filter(Boolean);
}
function estMinutes(steps, adjust = 0) {
  let s = 0;
  steps.forEach(x => {
    if (x.type === 'timed') s += x.sec + 8 + (x.rest || 0);
    if (x.type === 'learn') s += 60;
    if (x.type === 'check') s += 150;
    if (x.type === 'reps') s += x.sets * ((x.hold || 40) + 45);
    if (x.type === 'rounds') { const r = Math.max(2, x.rounds + adjust); s += 10 + r * x.work + (r - 1) * x.rest; }
  });
  return Math.round(s / 60);
}
const stepLabel = s => s.type === 'learn' ? 'Lernen: ' + TECH[s.tech].name : s.type === 'rounds' ? 'Sandsack-Runden' : s.title;

/* ---------- Ticker ---------- */
function useTicker() {
  const [, f] = useState(0);
  const r = useRef({ end: 0, left: 0, total: 0, paused: false, pl: 0, on: false, onEnd: null, onTick: null });
  useEffect(() => {
    const iv = setInterval(() => {
      const t = r.current; if (!t.on || t.paused) return;
      const ms = t.end - Date.now(), left = Math.max(0, Math.ceil(ms / 1000));
      if (left !== t.left) { t.left = left; t.onTick && t.onTick(left); f(x => x + 1); }
      if (ms <= 0) { t.on = false; const cb = t.onEnd; t.onEnd = null; cb && cb(); f(x => x + 1); }
    }, 150);
    return () => clearInterval(iv);
  }, []);
  const start = (sec, onEnd, onTick) => { const t = r.current; t.end = Date.now() + sec * 1000; t.left = sec; t.total = sec; t.on = true; t.paused = false; t.onEnd = onEnd; t.onTick = onTick; f(x => x + 1); };
  const toggle = () => { const t = r.current; if (!t.on) return; if (t.paused) { t.end = Date.now() + t.pl; t.paused = false; } else { t.pl = t.end - Date.now(); t.paused = true; try { window.speechSynthesis.cancel(); } catch (e) { } } f(x => x + 1); };
  const stop = () => { r.current.on = false; r.current.onEnd = null; f(x => x + 1); };
  return { t: r.current, start, toggle, stop };
}

function Ring({ left, total, color = GOLD, children }) {
  const R = 88, C = 2 * Math.PI * R, p = total ? left / total : 0;
  return (
    <div className="relative mx-auto h-56 w-56">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        <circle cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} style={{ transition: 'stroke-dashoffset .2s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
const BigBtn = ({ children, onClick, kind = 'red', disabled }) => (
  <button disabled={disabled} onClick={onClick} className={'w-full rounded-2xl py-4 font-display text-lg uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-40 ' + (kind === 'red' ? 'bg-blood text-white' : kind === 'gold' ? 'bg-gold text-ink' : 'border border-white/15 text-stone-200')}>{children}</button>
);

/* ---------- Player-Schritte ---------- */
function LearnStep({ step, next, say, lefty }) {
  const T = TECH[step.tech];
  const pts = T.points(lefty);
  const readAll = () => say(T.name + '. ' + pts.join(' ') + ' Achtung: ' + T.mistake + (T.say ? ' ' + T.say : ''));
  useEffect(() => { const id = setTimeout(readAll, 300); return () => clearTimeout(id); }, []);
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">Neue Technik</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase leading-tight text-stone-50">{T.name}</h2>
      <div className="mt-3 rounded-3xl bg-coal p-3"><Illu img={T.img} lefty={lefty} className="h-52 w-52" /><div className="mt-1 text-center text-xs text-stone-500">{T.caption}</div></div>
      <div className="mt-4 space-y-2.5">
        {pts.map((p, i) => (
          <div key={i} className="flex gap-3 rounded-2xl bg-anth p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold font-display text-lg text-ink">{i + 1}</span>
            <span className="pt-1 text-base leading-snug text-stone-100">{p}</span>
          </div>
        ))}
        <div className="flex gap-3 rounded-2xl border border-blood/50 bg-blood/10 p-3">
          <span className="text-xl">⚠️</span><span className="text-sm leading-snug text-stone-200"><b className="text-blood">Achtung:</b> {T.mistake}</span>
        </div>
        {T.say && <div className="rounded-2xl bg-gold/10 p-3 text-sm text-gold">💡 {T.say}</div>}
      </div>
      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 bg-ink/95 px-4 pb-2 pt-4">
        <button onClick={readAll} className="w-full py-2 text-sm text-stone-400">🔊 Nochmal vorlesen</button>
        <BigBtn onClick={next}>Verstanden – weiter</BigBtn>
      </div>
    </div>
  );
}

function TimedStep({ step, next, say, known, lefty, unlockedCalls }) {
  const tk = useTicker();
  const [stage, setStage] = useState('ready');
  const nextCall = useRef(0);
  const [call, setCall] = useState('');
  const gen = useMemo(() => callsFor(known, false, unlockedCalls), [known]);
  useEffect(() => {
    say(step.title + '. ' + step.cue);
    tk.start(5, () => { setStage('run'); bell(1); nextCall.current = Date.now() + 4000; tk.start(step.sec, () => { bell(1); next(); }, onTick); }, l => { if (l <= 3 && l > 0) beep(1, 880); });
    return () => tk.stop();
  }, []);
  const onTick = left => {
    if (left === 10 && step.sec >= 30) beep(2, 1200);
    if (step.calls && Date.now() >= nextCall.current && left > 4) { const c = gen(); setCall(c); say(c); nextCall.current = Date.now() + rand(6000, 9000); }
  };
  const t = tk.t;
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">{stage === 'ready' ? 'Gleich geht’s los' : 'Los!'}</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase leading-tight text-stone-50">{step.title}</h2>
      <div className="mt-4">
        <Ring left={t.left} total={t.total} color={stage === 'ready' ? '#777' : GOLD}>
          {step.icon && <div className="text-4xl">{step.icon}</div>}
          <div className="font-display text-6xl tabular-nums text-stone-50">{stage === 'ready' ? t.left : fmt(t.left)}</div>
          {t.paused && <div className="text-xs uppercase tracking-widest text-gold">Pausiert</div>}
        </Ring>
      </div>
      <div className="mt-4 min-h-[3rem] text-center">
        {call ? <div className="font-display text-2xl uppercase leading-tight text-gold">{call}</div> : <p className="text-base leading-snug text-stone-300">{step.cue}</p>}
      </div>
      {call && <p className="mt-2 text-center text-sm text-stone-500">{step.cue}</p>}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <BigBtn kind="ghost" onClick={tk.toggle}>{t.paused ? '▶ Weiter' : '❚❚ Pause'}</BigBtn>
        <BigBtn kind="ghost" onClick={() => { tk.stop(); next(); }}>Weiter ⏭</BigBtn>
      </div>
    </div>
  );
}

function RestScreen({ sec, upcoming, onDone, lefty }) {
  const tk = useTicker();
  useEffect(() => { tk.start(sec, onDone, l => { if (l <= 3 && l > 0) beep(1, 880); }); return () => tk.stop(); }, []);
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-stone-400">Kurze Pause</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase text-gold">Durchatmen</h2>
      <div className="mt-4"><Ring left={tk.t.left} total={tk.t.total} color="#777"><div className="font-display text-6xl tabular-nums">{tk.t.left}</div></Ring></div>
      {upcoming && (
        <div className="mt-5 rounded-2xl bg-anth p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-stone-500">Als Nächstes</div>
          <div className="font-display text-xl uppercase text-stone-100">{stepLabel(upcoming)}</div>
        </div>
      )}
      <div className="mt-auto pt-5"><BigBtn kind="gold" onClick={() => { tk.stop(); onDone(); }}>Pause überspringen</BigBtn></div>
    </div>
  );
}

function RoundsStep({ step, next, say, known, adjust, unlockedCalls, onKnuckle }) {
  const rounds = Math.max(2, step.rounds + adjust);
  const tk = useTicker();
  const [phase, setPhase] = useState('ready');
  const [round, setRound] = useState(1);
  const [call, setCall] = useState('');
  const nextCall = useRef(0), flags = useRef({});
  const gen = useMemo(() => callsFor(known, !!step.knuckle, unlockedCalls), [known]);
  const roundRef = useRef(1);
  const startWork = n => {
    roundRef.current = n; setRound(n); setPhase('work'); setCall(''); flags.current = {}; bell(1);
    say(n === rounds ? 'Letzte Runde! Gib alles!' : 'Runde ' + n + '. Los!');
    nextCall.current = Date.now() + 3500;
    tk.start(step.work, () => {
      if (n >= rounds) { bell(3); say('Geschafft! Super gemacht!'); if (step.knuckle) onKnuckle(); next(); }
      else { bell(1); setPhase('rest'); setCall(''); say('Pause. Tief atmen. Gleich kommt Runde ' + (n + 1) + '.'); tk.start(step.rest, () => startWork(n + 1), restTick); }
    }, workTick);
  };
  const workTick = left => {
    if (!flags.current.k30 && left <= 30 && left > 0 && step.work >= 60) { flags.current.k30 = true; knock(3); setCall('Noch 30 Sekunden!'); say('Noch 30 Sekunden! Gas geben!'); nextCall.current = Date.now() + 6000; return; }
    if (!flags.current.k10 && left <= 10 && left > 0) { flags.current.k10 = true; knock(2); }
    if (Date.now() >= nextCall.current && left > 4) { const c = gen(); setCall(c); say(c); nextCall.current = Date.now() + rand(7000, 10000); }
  };
  const restTick = left => { if (left === 10) { beep(2, 990); say('Zehn Sekunden. Hände hoch, bereit machen!'); } };
  useEffect(() => {
    say('Jetzt an den Sandsack. ' + step.note + ' ' + rounds + ' Runden. Stell dich bereit.');
    tk.start(12, () => startWork(1), l => { if (l <= 3 && l > 0) beep(1, 880); });
    return () => tk.stop();
  }, []);
  const t = tk.t;
  const color = phase === 'work' ? RED : phase === 'rest' ? GOLD : '#777';
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">{phase === 'ready' ? 'Geh an den Sack' : phase === 'rest' ? 'Pause' : 'Runde ' + round + ' von ' + rounds}</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase leading-tight text-stone-50">{phase === 'rest' ? 'Durchatmen' : step.title}</h2>
      <div className="mt-2 flex justify-center gap-1.5">{Array.from({ length: rounds }).map((_, i) => <span key={i} className={'h-2 w-6 rounded-full ' + (i + 1 < round || (i + 1 === round && phase === 'rest') ? 'bg-gold' : i + 1 === round && phase === 'work' ? 'bg-blood' : 'bg-white/15')}></span>)}</div>
      <div className="mt-4">
        <Ring left={t.left} total={t.total} color={color}>
          <div className="font-display text-6xl tabular-nums text-stone-50">{phase === 'ready' ? t.left : fmt(t.left)}</div>
          {t.paused && <div className="text-xs uppercase tracking-widest text-gold">Pausiert</div>}
        </Ring>
      </div>
      <div className="mt-4 min-h-[4rem] text-center">
        {phase === 'work' && call && <div className="font-display text-3xl uppercase leading-tight text-gold">{call}</div>}
        {phase !== 'work' && <p className="text-base text-stone-300">{phase === 'ready' ? step.note : 'Trink einen Schluck. Schultern locker.'}</p>}
      </div>
      {step.knuckle && <div className="mt-2 rounded-xl bg-gold/10 p-2 text-center text-xs text-gold">Knöchelhandschuhe: nur 70–80 % Kraft</div>}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <BigBtn kind="ghost" onClick={tk.toggle}>{t.paused ? '▶ Weiter' : '❚❚ Pause'}</BigBtn>
        <BigBtn kind="ghost" onClick={() => { tk.stop(); if (phase === 'ready') startWork(1); else if (roundRef.current < rounds) startWork(roundRef.current + 1); else next(); }}>Weiter ⏭</BigBtn>
      </div>
    </div>
  );
}

function RepsStep({ step, next, say, onPull }) {
  const [set, setSet] = useState(1);
  const [resting, setResting] = useState(false);
  const [holding, setHolding] = useState(false);
  const tk = useTicker();
  useEffect(() => { say(step.title + '. ' + step.sets + ' Sätze. ' + step.cue); return () => tk.stop(); }, []);
  const finishSet = () => {
    if (step.pull) onPull(step.pull);
    setHolding(false);
    if (set >= step.sets) { bell(1); next(); return; }
    setResting(true); say('Super! Kurze Pause.');
    tk.start(45, () => { setResting(false); setSet(s => s + 1); bell(1); say('Satz ' + (set + 1) + '. Los!'); }, l => { if (l <= 3 && l > 0) beep(1, 880); });
  };
  const startHold = () => { setHolding(true); bell(1); tk.start(step.hold, finishSet, l => { if (l <= 3 && l > 0) beep(1, 880); }); };
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">Kraft</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase leading-tight text-stone-50">{step.title}</h2>
      <div className="mt-3 flex justify-center gap-2">{Array.from({ length: step.sets }).map((_, i) => <span key={i} className={'h-3 w-10 rounded-full ' + (i + 1 < set || (i + 1 === set && resting) ? 'bg-gold' : i + 1 === set ? 'bg-blood' : 'bg-white/15')}></span>)}</div>
      <div className="mt-5">
        {resting || holding ? (
          <Ring left={tk.t.left} total={tk.t.total} color={resting ? '#777' : GOLD}>
            <div className="text-xs uppercase tracking-widest text-stone-400">{resting ? 'Pause' : 'Halten!'}</div>
            <div className="font-display text-6xl tabular-nums">{tk.t.left}</div>
          </Ring>
        ) : (
          <div className="mx-auto flex h-56 w-56 flex-col items-center justify-center rounded-full border-[12px] border-white/10">
            <div className="text-4xl">{step.icon}</div>
            <div className="font-display text-5xl text-stone-50">{step.n}</div>
            <div className="text-xs uppercase tracking-widest text-stone-400">Satz {set} von {step.sets}</div>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-base text-stone-300">{resting ? 'Gleich kommt Satz ' + (set + 1) + '.' : step.cue}</p>
      <div className="mt-auto space-y-2 pt-5">
        {resting ? <BigBtn kind="ghost" onClick={() => { tk.stop(); setResting(false); setSet(s => s + 1); }}>Pause überspringen</BigBtn>
          : holding ? <BigBtn kind="ghost" onClick={() => { tk.stop(); finishSet(); }}>Fertig</BigBtn>
            : step.hold ? <BigBtn onClick={startHold}>Start – {step.hold} Sek. halten</BigBtn>
              : <BigBtn onClick={finishSet}>Satz geschafft ✓</BigBtn>}
      </div>
    </div>
  );
}

function CheckStep({ next, say, onWrap }) {
  const [c, setC] = useState({});
  const all = WRAP_STEPS.every((_, i) => c[i]);
  useEffect(() => { say('Bevor du an den Sack gehst: Hände bandagieren. Hake jeden Schritt ab.'); }, []);
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">Schutz für deine Hände</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase text-stone-50">Hände bandagieren</h2>
      <p className="mt-1 text-center text-sm text-stone-400">Hake jeden Schritt ab. Ohne Bandagen nicht an den Sack!</p>
      <div className="mt-4 space-y-2">
        {WRAP_STEPS.map((s, i) => <Check key={i} checked={!!c[i]} label={(i + 1) + '. ' + s} onChange={() => setC(x => ({ ...x, [i]: !x[i] }))} />)}
      </div>
      <div className="mt-auto pt-5">
        <BigBtn disabled={!all} onClick={() => { onWrap(); next(); }}>{all ? 'Hände geschützt – weiter' : 'Noch ' + WRAP_STEPS.filter((_, i) => !c[i]).length + ' Schritte'}</BigBtn>
      </div>
    </div>
  );
}

function DoneScreen({ session, minutes, onFeedback, isFinal, xp }) {
  useEffect(() => { bell(2); }, []);
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div className="mt-6 text-7xl">{isFinal ? '🏆' : '🥊'}</div>
      <h2 className="mt-3 font-display text-4xl uppercase leading-tight text-gold">{isFinal ? 'Grundausbildung geschafft!' : 'Geschafft!'}</h2>
      <p className="mt-2 text-lg text-stone-200">{session.title} ist erledigt.</p>
      <div className="mt-6 grid w-full grid-cols-2 gap-2">
        <div className="rounded-2xl bg-anth p-4"><div className="font-display text-3xl text-stone-50">{minutes}</div><div className="text-xs uppercase tracking-wider text-stone-500">Minuten</div></div>
        <div className="rounded-2xl bg-anth p-4"><div className="font-display text-3xl text-gold">+{xp}</div><div className="text-xs uppercase tracking-wider text-stone-500">XP</div></div>
      </div>
      <div className="mt-8 w-full">
        <div className="font-display text-xl uppercase text-stone-100">Wie war’s für dich?</div>
        <p className="text-sm text-stone-400">Danach passe ich die nächsten Runden an.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[[1, '😴', 'Zu leicht'], [0, '💪', 'Genau richtig'], [-1, '🥵', 'Zu schwer']].map(([v, e, l]) => (
            <button key={l} onClick={() => onFeedback(v)} className="rounded-2xl border border-white/10 bg-anth py-4 transition active:scale-95 hover:border-gold">
              <div className="text-3xl">{e}</div><div className="mt-1 text-xs text-stone-300">{l}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Player({ session, app, onClose }) {
  const { state, update, completeSession } = app;
  const lefty = state.profile.hand === 'l';
  const steps = session.steps;
  const [i, setI] = useState(0);
  const [rest, setRest] = useState(null);
  const [done, setDone] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  const startedAt = useRef(Date.now());
  const extra = useRef({ wrap: false, pull: 0, knuckle: false });
  const st = state.settings;
  const say = txt => { if (st.voiceOn) speak(txt, st.rate); };
  const unlockedCalls = state.path.done.length >= 12 ? REWARDS.filter(r => r.type === 'combo' && state.unlocked.includes(r.id)).map(r => r.call) : [];
  useEffect(() => {
    ac(); let lock = null;
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => { }); } catch (e) { }
    return () => { try { lock && lock.release(); window.speechSynthesis.cancel(); } catch (e) { } };
  }, []);
  const finish = () => { setDone(true); completeSession(session, extra.current); try { window.speechSynthesis.cancel(); } catch (e) { } say(session.lesson && session.lesson.final ? 'Unglaublich! Du hast die Grundausbildung geschafft!' : 'Training geschafft! Stark gemacht!'); };
  const next = () => {
    const cur = steps[i];
    const go = () => { setRest(null); if (i + 1 >= steps.length) finish(); else setI(i + 1); };
    if (cur && cur.rest && i + 1 < steps.length) setRest({ sec: cur.rest, go });
    else go();
  };
  const step = steps[i];
  const progress = done ? 1 : (i + (rest ? 1 : 0)) / steps.length;
  const known = session.known;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-6 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => done ? onClose() : setAskQuit(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl" aria-label="Schliessen">✕</button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all" style={{ width: progress * 100 + '%' }}></div></div>
          <div className="w-12 text-right text-xs tabular-nums text-stone-500">{Math.min(i + 1, steps.length)}/{steps.length}</div>
        </div>
        <div className="mt-4 flex flex-1 flex-col">
          {done ? <DoneScreen xp={65 + (extra.current.wrap ? 10 : 0)} session={session} isFinal={session.lesson && session.lesson.final} minutes={Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))} onFeedback={v => { update(s => ({ ...s, path: { ...s.path, adjust: clamp((s.path.adjust || 0) + v, -1, 2) } })); onClose(); }} />
            : rest ? <RestScreen key={'r' + i} sec={rest.sec} upcoming={steps[i + 1]} onDone={rest.go} />
              : step.type === 'learn' ? <LearnStep key={i} step={step} next={next} say={say} lefty={lefty} />
                : step.type === 'timed' ? <TimedStep key={i} step={step} next={next} say={say} known={known} lefty={lefty} unlockedCalls={unlockedCalls} />
                  : step.type === 'rounds' ? <RoundsStep key={i} step={step} next={next} say={say} known={known} adjust={state.path.adjust || 0} unlockedCalls={unlockedCalls} onKnuckle={() => { extra.current.knuckle = true; }} />
                    : step.type === 'reps' ? <RepsStep key={i} step={step} next={next} say={say} onPull={n => { extra.current.pull += n; }} />
                      : step.type === 'check' ? <CheckStep key={i} next={next} say={say} onWrap={() => { extra.current.wrap = true; }} />
                        : null}
        </div>
      </div>
      {askQuit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-anth p-5 text-center">
            <div className="text-4xl">🤔</div>
            <div className="mt-2 font-display text-2xl uppercase text-stone-50">Wirklich aufhören?</div>
            <p className="mt-1 text-sm text-stone-400">Dein Fortschritt in dieser Lektion geht verloren.</p>
            <div className="mt-4 space-y-2">
              <BigBtn kind="gold" onClick={() => setAskQuit(false)}>Weitermachen</BigBtn>
              <BigBtn kind="ghost" onClick={() => { try { window.speechSynthesis.cancel(); } catch (e) { } onClose(); }}>Aufhören</BigBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Lektions-Vorschau ---------- */
function LessonSheet({ lesson, app, onStart, onClose }) {
  const { state } = app;
  const steps = resolveSteps(lesson.steps, state.equip);
  const min = estMinutes(steps, state.path.adjust || 0);
  const needsBag = steps.some(s => s.type === 'rounds');
  const groups = [];
  steps.forEach(s => {
    const label = WARM.includes(s) ? 'Aufwärmen' : COOL.includes(s) ? 'Abkühlen & dehnen' : stepLabel(s);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.n++; else groups.push({ label, n: 1, s });
  });
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-anth p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden"></div>
        {lesson.id !== 'regen' && <div className="text-xs uppercase tracking-[0.2em] text-blood">Woche {lesson.week} · Lektion {lessonIndex(lesson.id) + 1}</div>}
        <h3 className="font-display text-3xl uppercase leading-tight text-stone-50">{lesson.title}</h3>
        <p className="mt-1 text-stone-300">{lesson.goal}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-stone-200">⏱ ca. {min} Min.</span>
          {needsBag && <span className="rounded-full bg-white/10 px-3 py-1.5 text-stone-200">🥊 Sandsack + Handschuhe</span>}
          {needsBag && <span className="rounded-full bg-white/10 px-3 py-1.5 text-stone-200">🩹 Bandagen</span>}
          {lesson.knuckle && state.equip.knuckle && <span className="rounded-full bg-gold/15 px-3 py-1.5 text-gold">Knöchelhandschuhe</span>}
        </div>
        {lesson.learns && lesson.learns.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {lesson.learns.map(id => (
              <div key={id} className="w-28 shrink-0 rounded-2xl bg-coal p-2 text-center">
                <Illu img={TECH[id].img} lefty={state.profile.hand === 'l'} className="h-20 w-20" />
                <div className="mt-1 text-[11px] leading-tight text-stone-300">{TECH[id].name}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-xs uppercase tracking-widest text-stone-500">Ablauf</div>
        <ol className="mt-2 space-y-1.5">
          {groups.map((g, k) => (
            <li key={k} className="flex items-center gap-3 rounded-xl bg-coal px-3 py-2.5 text-sm text-stone-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">{k + 1}</span>
              <span className="flex-1">{g.label}{g.n > 1 && !['Aufwärmen', 'Abkühlen & dehnen'].includes(g.label) ? ' (' + g.n + '×)' : ''}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-stone-500">Ton anmachen – ich sage dir alles an. Du musst nichts lesen, wenn du nicht willst.</p>
        <div className="mt-4 space-y-2">
          <BigBtn onClick={() => onStart(steps)}>▶ Training starten</BigBtn>
          <BigBtn kind="ghost" onClick={onClose}>Später</BigBtn>
        </div>
      </div>
    </div>
  );
}

/* ---------- Onboarding ---------- */
function Onboarding({ app }) {
  const { state, update } = app;
  const [p, setP] = useState(0);
  const [name, setName] = useState(state.profile.name || '');
  const [hand, setHand] = useState(state.profile.hand || 'r');
  const [eq, setEq] = useState(state.equip);
  const finish = () => update(s => ({ ...s, onboarded: true, profile: { ...s.profile, name: name.trim(), hand }, equip: eq }));
  const EQ = [['bag', '🥊', 'Boxsack'], ['gloves', '🧤', 'Boxhandschuhe'], ['wraps', '🩹', 'Bandagen'], ['knuckle', '✊', 'Knöchelhandschuhe'], ['bar', '🏋️', 'Klimmzugstange'], ['pads', '🎯', 'Pratzen + Partner']];
  const pages = [
    <div key="0" className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="text-7xl">🥊</div>
      <h1 className="mt-4 font-display text-4xl uppercase leading-tight text-stone-50">Willkommen im <span className="text-gold">Fight Camp</span></h1>
      <p className="mt-3 text-lg text-stone-300">Ich bin dein Box-Coach. Ich zeige dir alles Schritt für Schritt – auch wenn du noch nie geboxt hast.</p>
    </div>,
    <div key="1" className="flex flex-1 flex-col justify-center">
      <h2 className="font-display text-3xl uppercase text-stone-50">Wie heisst du?</h2>
      <p className="mt-1 text-stone-400">Damit ich dich anfeuern kann.</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" className="mt-5 w-full rounded-2xl border border-white/15 bg-coal px-4 py-4 text-xl text-stone-100 outline-none focus:border-gold" />
    </div>,
    <div key="2" className="flex flex-1 flex-col justify-center">
      <h2 className="font-display text-3xl uppercase text-stone-50">Mit welcher Hand schreibst du?</h2>
      <p className="mt-1 text-stone-400">Damit zeige ich dir die richtige Stellung.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[['l', '✍️', 'Links'], ['r', '✍️', 'Rechts']].map(([v, e, l]) => (
          <button key={v} onClick={() => setHand(v)} className={'rounded-3xl border-2 py-8 transition ' + (hand === v ? 'border-gold bg-gold/15' : 'border-white/10 bg-anth')}>
            <div className={'text-5xl ' + (v === 'l' ? '-scale-x-100' : '')}>{e}</div><div className="mt-2 font-display text-xl uppercase">{l}</div>
          </button>
        ))}
      </div>
    </div>,
    <div key="3" className="flex flex-1 flex-col justify-center">
      <h2 className="font-display text-3xl uppercase text-stone-50">Was hast du zu Hause?</h2>
      <p className="mt-1 text-stone-400">Tippe alles an, was du hast.</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {EQ.map(([k, e, l]) => (
          <button key={k} onClick={() => setEq(x => ({ ...x, [k]: !x[k] }))} className={'rounded-2xl border-2 p-4 text-left transition ' + (eq[k] ? 'border-gold bg-gold/15' : 'border-white/10 bg-anth')}>
            <div className="text-3xl">{e}</div><div className="mt-1 text-sm text-stone-100">{l}</div><div className="text-xs text-gold">{eq[k] ? '✓ habe ich' : ''}</div>
          </button>
        ))}
      </div>
      {!eq.wraps && <p className="mt-3 rounded-xl bg-blood/15 p-3 text-sm text-stone-200">⚠️ Bandagen sind sehr wichtig. Bitte kauf welche, bevor du an den Sandsack gehst.</p>}
    </div>,
    <div key="4" className="flex flex-1 flex-col justify-center">
      <h2 className="font-display text-3xl uppercase text-stone-50">So funktioniert’s</h2>
      <div className="mt-5 space-y-3">
        {[['📅', '3× pro Woche', 'Eine Lektion dauert etwa 20–30 Minuten.'], ['😴', 'Pausen sind wichtig', 'Zwischen den Lektionen einen Tag Erholung.'], ['🔊', 'Ton an!', 'Ich sage dir alles an. Du musst nur zuhören.'], ['🏆', 'Sammle XP', 'Steig vom Anfänger bis zum Weltmeister auf.']].map(([e, t, s]) => (
          <div key={t} className="flex items-center gap-4 rounded-2xl bg-anth p-4">
            <span className="text-3xl">{e}</span>
            <div><div className="font-display text-lg uppercase text-stone-100">{t}</div><div className="text-sm text-stone-400">{s}</div></div>
          </div>
        ))}
      </div>
      <button onClick={() => { ac(); speak('Hallo' + (name.trim() ? ' ' + name.trim() : '') + '! Ich bin dein Box-Coach. Los geht’s!', state.settings.rate); }} className="mt-4 w-full rounded-2xl border border-gold/40 py-3 text-gold">🔊 Ton testen</button>
    </div>,
  ];
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 pb-6 pt-6">
        <div className="flex justify-center gap-1.5">{pages.map((_, k) => <span key={k} className={'h-1.5 rounded-full transition-all ' + (k === p ? 'w-8 bg-gold' : 'w-3 bg-white/20')}></span>)}</div>
        {pages[p]}
        <div className="space-y-2 pt-6">
          <BigBtn onClick={() => p < pages.length - 1 ? setP(p + 1) : finish()}>{p === 0 ? 'Los geht’s' : p < pages.length - 1 ? 'Weiter' : 'Training beginnen'}</BigBtn>
          {p > 0 && <button onClick={() => setP(p - 1)} className="w-full py-2 text-sm text-stone-500">Zurück</button>}
          {p === 0 && <button onClick={() => { update(s => ({ ...s, onboarded: true })); setTimeout(() => app.go('more', 'settings'), 50); }} className="w-full py-2 text-sm text-stone-500">Ich habe schon ein Backup</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Home ---------- */
function Home({ app }) {
  const { state, d, today, tKey, updateToday, go, openLesson, startRegen, claimReward, loadPreset } = app;
  const done = state.path.done;
  const nextL = LESSONS.find(l => !done.includes(l.id));
  const yesterday = state.path.last === addDays(tKey, -1);
  const restDay = yesterday && !today.workout;
  const name = state.profile.name;
  const lvl = 'e';
  const G = state.goals;
  const [editGoals, setEditGoals] = useState(false);
  const allGoals = [
    { id: 'train', icon: '🥊', label: 'Training', done: today.workout, act: () => nextL ? openLesson(nextL) : go('more', 'camp') },
    { id: 'water', icon: '💧', label: 'Trinken', done: today.water >= d.n.glasses, sub: (today.water * 0.25).toFixed(1) + ' / ' + d.n.liters + ' l', act: () => updateToday(r => ({ ...r, water: r.water + 1 })) },
    { id: 'food', icon: '🥦', label: 'Gesund essen', done: NUT_ITEMS.every(i => today.nut[i.id]), sub: NUT_ITEMS.filter(i => today.nut[i.id]).length + ' / 5', act: () => go('more', 'food') },
    { id: 'sleep', icon: '😴', label: 'Schlafen', done: today.sleep != null, sub: today.sleep != null ? today.sleep + ' h' : 'eintragen', act: () => go('more', 'food') },
  ];
  const goals = [
    ...allGoals.filter(g => G[g.id]),
    ...G.custom.map(c => ({ id: c.id, icon: c.emoji, label: c.label, done: !!(today.custom || {})[c.id], act: () => updateToday(r => ({ ...r, custom: { ...(r.custom || {}), [c.id]: !(r.custom || {})[c.id] } })) })),
  ];
  const allDone = goals.every(g => g.done);
  const lastReward = today.claimed && today.rewardId ? REWARDS.find(r => r.id === today.rewardId) : null;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-stone-400">{greet}{name ? ',' : ''}</div>
          <div className="font-display text-3xl uppercase leading-tight text-stone-50">{name || 'Champion'} 👋</div>
        </div>
        <div className="text-center">
          <div className="font-display text-3xl leading-none text-stone-50">{d.streak}<span className="text-2xl">🔥</span></div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Tage am Stück</div>
        </div>
      </div>

      {/* Hero */}
      {today.workout ? (
        <div className="rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/20 to-anth p-5">
          <div className="text-4xl">✅</div>
          <div className="mt-2 font-display text-2xl uppercase text-gold">Training für heute erledigt!</div>
          <p className="mt-1 text-stone-300">Stark! Morgen ist ein Erholungstag – dein Körper wird jetzt stärker.</p>
          {!allDone && <p className="mt-2 text-sm text-stone-400">Hake unten noch deine anderen Ziele ab.</p>}
        </div>
      ) : restDay ? (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#1f2a33] to-anth p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Heute empfohlen</div>
          <div className="mt-1 font-display text-3xl uppercase text-stone-50">Erholungstag 😌</div>
          <p className="mt-1 text-stone-300">Gestern hast du hart trainiert. Heute nur locker bewegen – 10 Minuten.</p>
          <div className="mt-4 space-y-2">
            <BigBtn kind="gold" onClick={startRegen}>▶ Erholung starten</BigBtn>
            {nextL && <button onClick={() => openLesson(nextL)} className="w-full py-2 text-sm text-stone-400">Ich fühle mich fit – Lektion {lessonIndex(nextL.id) + 1} machen</button>}
          </div>
        </div>
      ) : nextL ? (
        <button onClick={() => openLesson(nextL)} className="relative block w-full overflow-hidden rounded-3xl border border-blood/40 bg-gradient-to-br from-blood/40 via-anth to-anth p-5 text-left">
          <div className="pointer-events-none absolute -right-6 -top-6 text-[120px] opacity-10">🥊</div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Dein Training heute · Lektion {lessonIndex(nextL.id) + 1} von {LESSONS.length}</div>
          <div className="mt-1 font-display text-3xl uppercase leading-tight text-stone-50">{nextL.title}</div>
          <p className="mt-1 text-stone-300">{nextL.goal}</p>
          <div className="mt-3 text-sm text-stone-400">⏱ ca. {estMinutes(resolveSteps(nextL.steps, state.equip), state.path.adjust || 0)} Minuten</div>
          <div className="mt-4 rounded-2xl bg-blood py-4 text-center font-display text-lg uppercase tracking-wider text-white">▶ Los geht’s</div>
        </button>
      ) : (
        <div className="rounded-3xl border border-gold/50 bg-gradient-to-br from-gold/25 to-anth p-5">
          <div className="text-4xl">🏆</div>
          <div className="mt-1 font-display text-2xl uppercase text-gold">Grundausbildung geschafft!</div>
          <p className="mt-1 text-stone-300">Jetzt bist du bereit für das Fight Camp. Starte mit der Einsteiger-Stufe.</p>
          <div className="mt-4 space-y-2">
            <BigBtn onClick={() => { const cd = campDayOf(state, tKey); loadPreset(DAYS[cd - 1].preset[state.settings.level === 'profi' ? 'p' : lvl], 'Tag ' + cd + ': ' + DAYS[cd - 1].name); }}>▶ Fight-Camp-Training heute</BigBtn>
            <BigBtn kind="ghost" onClick={() => go('more', 'camp')}>Wochenplan ansehen</BigBtn>
          </div>
        </div>
      )}

      {/* Tagesziele */}
      <div>
        <div className="mb-2 flex items-end justify-between"><div className="font-display text-lg uppercase tracking-wider text-stone-200">Deine Ziele heute <span className="text-sm text-stone-500">{goals.filter(g => g.done).length}/{goals.length}</span></div><button onClick={() => setEditGoals(true)} className="rounded-full border border-white/15 px-3 py-1 text-xs text-stone-300">✏️ Anpassen</button></div>
        <div className="grid grid-cols-4 gap-2">
          {goals.map(g => (
            <button key={g.id} onClick={g.act} className={'rounded-2xl border p-2.5 text-center transition active:scale-95 ' + (g.done ? 'border-gold/60 bg-gold/15' : 'border-white/10 bg-anth')}>
              <div className="relative mx-auto text-3xl">{g.icon}{g.done && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] text-ink">✓</span>}</div>
              <div className="mt-1 text-[11px] leading-tight text-stone-200">{g.label}</div>
              {g.sub && <div className="text-[10px] text-stone-500">{g.sub}</div>}
            </button>
          ))}
        </div>
        {G.water && <p className="mt-1.5 text-center text-[11px] text-stone-500">Tipp: Auf 💧 tippen = 1 Glas Wasser getrunken</p>}
        {editGoals && <GoalsEditor app={app} onClose={() => setEditGoals(false)} />}
      </div>

      {/* Belohnung */}
      <div className={'rounded-3xl border p-4 ' + (allDone && !today.claimed ? 'border-gold bg-gold/10' : 'border-white/10 bg-anth')}>
        <div className="flex items-center gap-3">
          <div className={'text-4xl ' + (allDone && !today.claimed ? 'animate-bounce' : '')}>{today.claimed ? '🎁' : allDone ? '🎁' : '🔒'}</div>
          <div className="flex-1">
            <div className="font-display text-lg uppercase text-stone-100">Tagesbelohnung</div>
            <div className="text-sm text-stone-400">{today.claimed ? 'Abgeholt! Morgen gibt’s die nächste.' : allDone ? 'Alle Ziele geschafft – öffne sie!' : 'Schaffe alle ' + goals.length + ' Ziele, dann öffnet sie sich.'}</div>
          </div>
        </div>
        {allDone && !today.claimed && <div className="mt-3"><BigBtn kind="gold" onClick={claimReward}>Belohnung öffnen</BigBtn></div>}
        {lastReward && <RewardCard r={lastReward} />}
      </div>

      {/* Lernpfad */}
      <PathView app={app} />
    </div>
  );
}

function PathView({ app }) {
  const { state, openLesson, toast } = app;
  const done = state.path.done;
  const nextId = (LESSONS.find(l => !done.includes(l.id)) || {}).id;
  return (
    <div>
      <div className="mb-1 font-display text-lg uppercase tracking-wider text-stone-200">Dein Weg zum Boxer</div>
      <div className="mb-3 text-xs text-stone-500">{done.length} von {LESSONS.length} Lektionen geschafft</div>
      {[1, 2, 3, 4].map(w => (
        <div key={w} className="mb-4">
          <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] uppercase tracking-wider text-stone-300">Woche {w}</span><span className="text-sm text-stone-400">{WEEKS[w]}</span></div>
          <div className="space-y-2">
            {LESSONS.filter(l => l.week === w).map(l => {
              const isDone = done.includes(l.id), isNext = l.id === nextId, locked = !isDone && !isNext;
              return (
                <button key={l.id} onClick={() => locked ? toast('🔒 Schaff zuerst die Lektion davor') : openLesson(l)} className={'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ' + (isNext ? 'border-blood bg-blood/15' : isDone ? 'border-gold/30 bg-anth' : 'border-white/5 bg-anth opacity-50')}>
                  <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-xl ' + (isDone ? 'bg-gold text-ink' : isNext ? 'bg-blood text-white ring-4 ring-blood/30' : 'bg-white/10 text-stone-500')}>{isDone ? '✓' : locked ? '🔒' : lessonIndex(l.id) + 1}</span>
                  <span className="flex-1">
                    <span className="block font-display text-base uppercase leading-tight text-stone-100">{l.title}</span>
                    <span className="block text-xs text-stone-400">{l.goal}</span>
                  </span>
                  {isNext && <span className="text-xs font-display uppercase text-blood">Jetzt</span>}
                  {isDone && <span className="text-xs text-stone-500">nochmal</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Lernen ---------- */
function LearnTab({ app }) {
  const { state } = app;
  const lefty = state.profile.hand === 'l';
  const known = state.path.done.length ? knownUpTo(Math.max(...state.path.done.map(lessonIndex))) : [];
  const [open, setOpen] = useState(null);
  const T = open ? TECH[open] : null;
  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-2xl uppercase text-stone-50">Techniken</div>
        <p className="text-sm text-stone-400">Tippe eine Technik an, um sie nochmal anzuschauen.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {TECH_ORDER.map(id => {
          const t = TECH[id], ok = known.includes(id);
          return (
            <button key={id} onClick={() => ok ? setOpen(id) : app.toast('🔒 Kommt in Lektion ' + t.lesson)} className={'rounded-2xl border p-3 text-left transition ' + (ok ? 'border-white/10 bg-anth active:scale-95' : 'border-white/5 bg-anth opacity-50')}>
              <div className="h-24"><Illu img={t.img} lefty={lefty} className="h-24 w-24" /></div>
              <div className="mt-1 font-display text-sm uppercase leading-tight text-stone-100">{t.name}</div>
              <div className="text-[11px] text-stone-500">{ok ? 'Gelernt ✓' : '🔒 Lektion ' + t.lesson}</div>
            </button>
          );
        })}
      </div>
      <GuidePanel app={app} />
      {T && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setOpen(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-anth p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-3xl uppercase text-stone-50">{T.name}</h3>
            <div className="mt-3 rounded-3xl bg-coal p-3"><Illu img={T.img} lefty={lefty} className="h-48 w-48" /><div className="text-center text-xs text-stone-500">{T.caption}</div></div>
            <div className="mt-3 space-y-2">
              {T.points(lefty).map((p, i) => <div key={i} className="flex gap-3 rounded-2xl bg-coal p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-display text-ink">{i + 1}</span><span className="text-stone-100">{p}</span></div>)}
              <div className="rounded-2xl border border-blood/50 bg-blood/10 p-3 text-sm text-stone-200">⚠️ {T.mistake}</div>
            </div>
            <div className="mt-4 space-y-2">
              <BigBtn kind="gold" onClick={() => speak(T.name + '. ' + T.points(lefty).join(' ') + ' Achtung: ' + T.mistake, state.settings.rate)}>🔊 Vorlesen</BigBtn>
              <BigBtn kind="ghost" onClick={() => setOpen(null)}>Schliessen</BigBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Mehr ---------- */
function MoreTab({ app, sub, setSub, focusWarmup }) {
  const items = [
    ['timer', '⏱', 'Freier Box-Timer', 'Runden-Timer mit Voice Coach'],
    ['camp', '📅', 'Fight-Camp-Plan', 'Für Fortgeschrittene – nach den 12 Lektionen'],
    ['food', '🥦', 'Essen, Trinken & Schlaf', 'Checkliste, Wasser, Rechner'],
    ['settings', '⚙️', 'Einstellungen', 'Name, Hand, Stimme, Ausrüstung'],
  ];
  const titles = { timer: 'Freier Box-Timer', camp: 'Fight-Camp-Plan', food: 'Essen, Trinken & Schlaf', settings: 'Einstellungen' };
  return (
    <div>
      {sub ? (
        <button onClick={() => setSub(null)} className="mb-3 flex items-center gap-2 text-sm text-stone-400">← Zurück</button>
      ) : (
        <div className="space-y-2.5">
          <div className="font-display text-2xl uppercase text-stone-50">Mehr</div>
          {items.map(([id, e, t, s]) => (
            <button key={id} onClick={() => setSub(id)} className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-anth p-4 text-left active:scale-[0.99]">
              <span className="text-3xl">{e}</span>
              <span className="flex-1"><span className="block font-display text-lg uppercase text-stone-100">{t}</span><span className="block text-xs text-stone-400">{s}</span></span>
              <span className="text-stone-500">›</span>
            </button>
          ))}
        </div>
      )}
      {sub && <div className="mb-3 font-display text-2xl uppercase text-stone-50">{titles[sub]}</div>}
      <div className={sub === 'timer' ? '' : 'hidden'}><TimerPanel app={app} /></div>
      <div className={sub === 'camp' ? '' : 'hidden'}><PlanPanel app={app} focusWarmup={focusWarmup} /></div>
      <div className={sub === 'food' ? '' : 'hidden'}><FoodPanel app={app} /></div>
      <div className={sub === 'settings' ? '' : 'hidden'}><SettingsPanel app={app} /></div>
    </div>
  );
}


function VoicePicker({ st, setSt }) {
  const [voices, setVoices] = useState(allDeVoices());
  useEffect(() => {
    const load = () => setVoices(allDeVoices());
    load(); const iv = setInterval(load, 1000); const to = setTimeout(() => clearInterval(iv), 6000);
    try { window.speechSynthesis && window.speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { }
    return () => { clearInterval(iv); clearTimeout(to); try { window.speechSynthesis.removeEventListener('voiceschanged', load); } catch (e) { } };
  }, []);
  const current = (deVoice() || {}).name;
  const label = v => {
    const reg = { 'de-de': 'Deutschland', 'de-ch': 'Schweiz', 'de-at': 'Österreich' }[v.lang.toLowerCase().replace('_', '-')] || v.lang;
    const q = /premium/i.test(v.name) ? ' · Premium' : /enhanced|erweitert/i.test(v.name) ? ' · Erweitert' : '';
    return { name: v.name.replace(/\s*\((Premium|Enhanced|Erweitert)\)/i, ''), sub: reg + q };
  };
  const pickAndTest = v => { setSt({ voiceName: v.name }); VOICE_PREF.name = v.name; ac(); speak('Hallo! Ich bin dein Box-Coach. Eins, zwei, Hände hoch!', st.rate); };
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone-500">Stimme wählen ({voices.length})</div>
      {voices.length === 0 ? <p className="mt-2 text-sm text-stone-400">Keine deutsche Stimme gefunden. Tippe auf «Testen» und versuch es danach nochmal.</p> : (
        <div className="mt-2 space-y-1.5">
          {voices.map(v => { const l = label(v), on = current === v.name; return (
            <button key={v.name + v.lang} onClick={() => pickAndTest(v)} className={'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ' + (on ? 'border-gold bg-gold/15' : 'border-white/10 bg-coal')}>
              <span className="text-lg">{on ? '🔊' : '🗣️'}</span>
              <span className="flex-1"><span className={'block text-sm ' + (on ? 'text-gold' : 'text-stone-100')}>{l.name}</span><span className="block text-[11px] text-stone-500">{l.sub}</span></span>
              <span className="text-xs text-stone-500">{on ? 'aktiv' : 'anhören'}</span>
            </button>
          ); })}
        </div>
      )}
      <div className="mt-2"><Btn kind="ghost" onClick={() => { ac(); speak('Eins, zwei! Hände hoch!', st.rate); }}>🔊 Testen</Btn></div>
      <p className="mt-2 text-xs text-stone-500">Mehr und bessere Stimmen (z. B. «Premium»): iPhone-Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch. Dort eine Stimme laden, dann die App neu öffnen.</p>
    </div>
  );
}

function SettingsPanel({ app }) {
  const { state, update } = app;
  const st = state.settings, eq = state.equip, pr = state.profile;
  const setSt = patch => update(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setPr = patch => update(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const [confirm, setConfirm] = useState(false);
  const EQ = [['bag', '🥊 Boxsack'], ['gloves', '🧤 Boxhandschuhe'], ['wraps', '🩹 Bandagen'], ['knuckle', '✊ Knöchelhandschuhe'], ['bar', '🏋️ Klimmzugstange'], ['pads', '🎯 Pratzen + Partner']];
  return (
    <div className="space-y-4">
      <Card>
        <H2>Über dich</H2>
        <input value={pr.name} onChange={e => setPr({ name: e.target.value })} placeholder="Dein Name" className="w-full rounded-xl border border-white/10 bg-coal px-3 py-3 text-stone-100 outline-none focus:border-gold" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[['r', 'Rechtshänder'], ['l', 'Linkshänder']].map(([v, l]) => <button key={v} onClick={() => setPr({ hand: v })} className={'rounded-xl border py-3 text-sm ' + (pr.hand === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{l}</button>)}
        </div>
      </Card>
      <Card>
        <H2>Stimme</H2>
        <div className="space-y-4">
          <Toggle on={st.voiceOn} onChange={v => setSt({ voiceOn: v })} label={'Coach-Stimme ' + (st.voiceOn ? 'an' : 'aus')} />
          <label className="block">
            <div className="flex justify-between text-xs uppercase tracking-wider text-stone-500"><span>Sprechtempo</span><span className="text-gold">{(+st.rate).toFixed(2)}×</span></div>
            <input type="range" min="0.8" max="1.5" step="0.05" value={st.rate} onChange={e => setSt({ rate: +e.target.value })} className="mt-2 w-full accent-[#d4af37]" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs uppercase tracking-wider text-stone-500"><span>Tonhöhe</span><span className="text-gold">{st.pitch < 0.9 ? 'tief' : st.pitch > 1.1 ? 'hoch' : 'normal'}</span></div>
            <input type="range" min="0.6" max="1.4" step="0.05" value={st.pitch} onChange={e => setSt({ pitch: +e.target.value })} className="mt-2 w-full accent-[#d4af37]" />
          </label>
          <VoicePicker st={st} setSt={setSt} />
        </div>
      </Card>
      <Card>
        <H2 sub="Lektionen passen sich daran an">Ausrüstung</H2>
        <div className="grid grid-cols-2 gap-2">
          {EQ.map(([k, l]) => <button key={k} onClick={() => update(s => ({ ...s, equip: { ...s.equip, [k]: !s.equip[k] } }))} className={'rounded-xl border px-3 py-3 text-left text-sm ' + (eq[k] ? 'border-gold bg-gold/15 text-stone-100' : 'border-white/10 text-stone-500')}>{l}</button>)}
        </div>
      </Card>
      <Card>
        <H2 sub={'Aktuell: ' + ({ '-1': 'leichter', '0': 'normal', '1': '+1 Runde', '2': '+2 Runden' })[String(state.path.adjust || 0)]}>Schwierigkeit der Sack-Runden</H2>
        <div className="grid grid-cols-4 gap-2">
          {[[-1, 'Leichter'], [0, 'Normal'], [1, '+1 Runde'], [2, '+2 Runden']].map(([v, l]) => <button key={v} onClick={() => update(s => ({ ...s, path: { ...s.path, adjust: v } }))} className={'rounded-xl border py-2.5 text-xs ' + ((state.path.adjust || 0) === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{l}</button>)}
        </div>
      </Card>
      <BackupCard app={app} />
      <Card>
        <H2 sub={app.sync === 'cloud' ? 'Gespeichert im Browser und in deinem Claude-Konto' : 'Gespeichert auf diesem Gerät'}>Daten</H2>
        <div className="flex flex-wrap gap-2">
          <Btn kind="ghost" onClick={() => update(s => ({ ...s, onboarded: false }))}>Einführung nochmal zeigen</Btn>
          {!confirm ? <Btn kind="ghost" onClick={() => setConfirm(true)}>Alles zurücksetzen</Btn> : (
            <>
              <Btn kind="red" onClick={() => { update(() => mergeState(null)); setConfirm(false); }}>Ja, alles löschen</Btn>
              <Btn kind="ghost" onClick={() => setConfirm(false)}>Abbrechen</Btn>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}


function BackupCard({ app }) {
  const { state, update, toast } = app;
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const code = useMemo(() => JSON.stringify(state), [state]);
  const copy = async () => {
    setMode('show');
    try { await navigator.clipboard.writeText(code); toast('Backup kopiert ✓'); } catch (e) { toast('Bitte den Text unten markieren und kopieren'); }
  };
  const restore = () => {
    try {
      const data = JSON.parse(text.trim());
      if (!data || typeof data !== 'object' || !data.history) throw new Error('x');
      update(() => ({ ...mergeState(data), onboarded: true }));
      setText(''); setMode(null); setErr(''); toast('Backup eingespielt ✓');
    } catch (e) { setErr('Das ist kein gültiges Backup. Bitte den ganzen Text einfügen.'); }
  };
  return (
    <Card>
      <H2 sub="Fortschritt auf ein anderes Gerät oder in die installierte App mitnehmen">Backup</H2>
      <div className="flex flex-wrap gap-2">
        <Btn kind="gold" onClick={copy}>Backup kopieren</Btn>
        <Btn kind="ghost" onClick={() => { setMode(mode === 'restore' ? null : 'restore'); setErr(''); }}>Backup einspielen</Btn>
      </div>
      {mode === 'show' && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-stone-500">Dein Backup-Code (wurde in die Zwischenablage kopiert):</p>
          <textarea readOnly value={code} onFocus={e => e.target.select()} className="h-24 w-full rounded-xl border border-white/10 bg-coal p-2 font-mono text-[10px] text-stone-400" />
        </div>
      )}
      {mode === 'restore' && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-stone-500">Füge hier den kopierten Backup-Code ein. Achtung: Der aktuelle Stand wird ersetzt.</p>
          <textarea value={text} onChange={e => { setText(e.target.value); setErr(''); }} placeholder="Backup-Code einfügen" className="h-24 w-full rounded-xl border border-white/10 bg-coal p-2 font-mono text-xs text-stone-200 outline-none focus:border-gold" />
          {err && <p className="mt-1 text-sm text-blood">{err}</p>}
          <div className="mt-2"><Btn kind="red" onClick={restore} disabled={!text.trim()}>Einspielen</Btn></div>
        </div>
      )}
    </Card>
  );
}

/* ---------- App ---------- */
const NAV = [['home', '🏠', 'Heute'], ['learn', '📖', 'Lernen'], ['progress', '🏆', 'Erfolge'], ['more', '☰', 'Mehr']];

function App() {
  const [state, update, sync] = usePersistent();
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState(null);
  const [focusWarmup, setFocusWarmup] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [tKey, setTKey] = useState(todayKey());
  const [sheet, setSheet] = useState(null);
  const [session, setSession] = useState(null);
  const [preset, setPreset] = useState(() => {
    const cd = weekdayIdx();
    return { ...DAYS[cd - 1].preset.e, label: 'Tag ' + cd + ': ' + DAYS[cd - 1].name };
  });
  useEffect(() => { const i = setInterval(() => setTKey(todayKey()), 60000); return () => clearInterval(i); }, []);

  VOICE_PREF.name = state.settings.voiceName || null; VOICE_PREF.pitch = state.settings.pitch || 0.95;
  const d = useMemo(() => derive(state), [state]);
  const today = getDay(state, tKey);
  const toast = msg => { const id = Math.random(); setToasts(t => [...t, { id, msg }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000); };
  const updateToday = fn => update(s => ({ ...s, history: { ...s.history, [tKey]: fn(getDay(s, tKey)) } }));
  const go = (t, sb) => {
    const map = { today: 'home', timer: 'more', plan: 'more', food: 'more', guide: 'learn', trophy: 'progress' };
    const subMap = { timer: 'timer', plan: 'camp', food: 'food' };
    const real = map[t] || t; setTab(real);
    if (real === 'more') setSub(sb && sb !== 'warmup' ? sb : (subMap[t] || null));
    if (sb === 'warmup') { setSub('camp'); setFocusWarmup(x => x + 1); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const loadPreset = (p, label) => { setPreset({ ...p, label }); go('more', 'timer'); };
  const claimReward = () => {
    const next = REWARDS.find(r => !state.unlocked.includes(r.id));
    update(s => ({ ...s, unlocked: next ? [...s.unlocked, next.id] : s.unlocked, history: { ...s.history, [tKey]: { ...getDay(s, tKey), claimed: true, rewardId: next ? next.id : null } } }));
    toast(next ? '🎁 Belohnung freigeschaltet! +25 XP' : '🎁 +25 XP');
    return next || null;
  };
  const openLesson = l => setSheet(l);
  const startLesson = (l, steps) => {
    setSheet(null);
    const idx = lessonIndex(l.id);
    setSession({ key: Date.now(), id: l.id, kind: 'lesson', title: l.title, lesson: l, steps, known: knownUpTo(idx) });
  };
  const startRegen = () => {
    const maxIdx = state.path.done.length ? Math.max(...state.path.done.map(lessonIndex)) : 0;
    setSession({ key: Date.now(), id: 'regen', kind: 'regen', title: REGEN.title, steps: REGEN.steps, known: knownUpTo(maxIdx) });
  };
  const completeSession = (s, extra) => {
    update(st => {
      const day = getDay(st, tKey);
      const nd = { ...day, workout: true, warmup: true, wrap: day.wrap || !!extra.wrap, sessions: (day.sessions || 0) + 1, speed: (day.speed || 0) + (extra.knuckle ? 1 : 0), pullups: (day.pullups || 0) + (extra.pull || 0) };
      const path = { ...st.path };
      if (s.kind === 'lesson') { path.done = path.done.includes(s.id) ? path.done : [...path.done, s.id]; path.last = tKey; }
      return { ...st, path, history: { ...st.history, [tKey]: nd } };
    });
  };

  useEffect(() => {
    const earned = TROPHIES.filter(t => t.test(d) && !state.trophies.includes(t.id));
    if (earned.length) {
      update(s => ({ ...s, trophies: [...s.trophies, ...earned.map(t => t.id).filter(id => !s.trophies.includes(id))] }));
      earned.forEach(t => toast('🏆 Neue Trophäe: ' + t.name));
    }
  }, [d.sessions, d.streak, d.pullups, d.champ, d.speed, d.warmups, d.hydro, d.base, d.basics]);

  const app = { state, update, d, today, tKey, updateToday, go, loadPreset, preset, setPreset, toast, claimReward, sync, openLesson, startRegen, completeSession };

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="font-display text-xl uppercase leading-none tracking-[0.12em] text-stone-100">Fight<span className="text-blood">·</span><span className="text-gold">Camp</span></div>
        <button onClick={() => go('progress')} className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5">
          <span className="text-xs text-gold">{d.rank.name}</span>
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-gold" style={{ width: d.prog * 100 + '%' }}></span></span>
        </button>
      </header>

      <div className={tab === 'home' ? '' : 'hidden'}><Home app={app} /></div>
      <div className={tab === 'learn' ? '' : 'hidden'}><LearnTab app={app} /></div>
      <div className={tab === 'progress' ? '' : 'hidden'}><TrophyPanel app={app} /></div>
      <div className={tab === 'more' ? '' : 'hidden'}><MoreTab app={app} sub={sub} setSub={setSub} focusWarmup={focusWarmup} /></div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map(([id, e, l]) => (
            <button key={id} onClick={() => { setTab(id); if (id === 'more') setSub(null); window.scrollTo({ top: 0 }); }} className={'flex flex-col items-center gap-0.5 py-2.5 transition ' + (tab === id ? 'text-gold' : 'text-stone-500')}>
              <span className={'text-2xl transition ' + (tab === id ? 'scale-110' : 'opacity-70 grayscale')}>{e}</span>
              <span className="text-[11px] font-medium">{l}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map(t => <div key={t.id} className="rounded-2xl border border-gold/50 bg-ink/95 px-4 py-3 text-sm text-gold shadow-lg">{t.msg}</div>)}
      </div>

      {sheet && <LessonSheet lesson={sheet} app={app} onClose={() => setSheet(null)} onStart={steps => startLesson(sheet, steps)} />}
      {session && <Player key={session.key} session={session} app={app} onClose={() => setSession(null)} />}
      {!state.onboarded && <Onboarding app={app} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
