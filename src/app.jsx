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
  if (!VOICE_PREF.name) return null;
  const vs = allDeVoices();
  return vs.find(v => v.name === VOICE_PREF.name) || null;
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
  settings: { intensity: 'mittel', voiceName: null, pitch: 0.95, voiceOn: true, rate: 1.05, intMin: 8, intMax: 12, level: 'einsteiger' },
  onboarded: false,
  plan: { days: [1, 3, 5] },
  log: [], weights: [], favs: [], combos: [], myWorkouts: [], challenges: {}, videoLog: [], shop: {},
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
    plan: { ...DEFAULT_STATE.plan, ...(s.plan || {}), days: (s.plan && Array.isArray(s.plan.days) && s.plan.days.length) ? s.plan.days : [1, 3, 5] },
    goals: { ...DEFAULT_STATE.goals, ...(s.goals || {}), custom: (s.goals && Array.isArray(s.goals.custom)) ? s.goals.custom : [] },
    path: { ...DEFAULT_STATE.path, ...(s.path || {}), done: (s.path && Array.isArray(s.path.done)) ? s.path.done : [] },
    history: s.history || {},
    unlocked: Array.isArray(s.unlocked) ? s.unlocked : [],
    trophies: Array.isArray(s.trophies) ? s.trophies : [],
    log: Array.isArray(s.log) ? s.log : [], weights: Array.isArray(s.weights) ? s.weights : [], favs: Array.isArray(s.favs) ? s.favs : [],
    combos: Array.isArray(s.combos) ? s.combos : [], myWorkouts: Array.isArray(s.myWorkouts) ? s.myWorkouts : [], videoLog: Array.isArray(s.videoLog) ? s.videoLog : [],
    challenges: (s.challenges && typeof s.challenges === 'object') ? s.challenges : {}, shop: (s.shop && typeof s.shop === 'object') ? s.shop : {},
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
  const chXP = Object.values(state.challenges).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0) * 50;
  const xp = base + state.trophies.length * 100 + chXP;
  const totals = state.log.reduce((a, l) => ({ sessions: a.sessions + 1, minutes: a.minutes + (l.min || 0), rounds: a.rounds + (l.rounds || 0), punches: a.punches + (l.punches || 0) }), { sessions: 0, minutes: 0, rounds: 0, punches: 0 });
  const best = state.log.reduce((a, l) => ({ min: Math.max(a.min, l.min || 0), rounds: Math.max(a.rounds, l.rounds || 0), punches: Math.max(a.punches, l.punches || 0) }), { min: 0, rounds: 0, punches: 0 });
  const trainedDays = keys.filter(k => getDay(state, k).workout).sort();
  let longest = 0, run = 0, prev = null;
  trainedDays.forEach(k => { run = prev && addDays(prev, 1) === k ? run + 1 : 1; longest = Math.max(longest, run); prev = k; });
  const challengesDone = Object.values(state.challenges).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  // streak
  const t = todayKey(); let streak = 0;
  let k = getDay(state, t).workout ? t : addDays(t, -1);
  while (getDay(state, k).workout) { streak++; k = addDays(k, -1); }
  let ri = 0; RANKS.forEach((r, i) => { if (xp >= r.xp) ri = i; });
  const rank = RANKS[ri], next = RANKS[ri + 1] || null;
  const prog = next ? (xp - rank.xp) / (next.xp - rank.xp) : 1;
  const basics = state.path.done.length;
  return { totals, best, longest, challengesDone, videos: state.videoLog.length, n, basics, xp, base, streak, pullups, speed, champ, warmups, hydro, sessions, rank, next, prog, ri };
}

const TROPHIES = [
  { id: 'basic', name: 'Grundausbildung bestanden', desc: 'Alle 12 Anfänger-Lektionen geschafft', test: d => d.basics >= 12 },
  { id: 'advanced', name: 'Fortgeschritten', desc: 'Alle 24 Lektionen geschafft', test: d => d.basics >= 24 },
  { id: 'punch10k', name: '10 000 Schläge', desc: 'Geschätzt 10 000 Schläge gesamt', test: d => d.totals.punches >= 10000 },
  { id: 'video5', name: 'Kritischer Blick', desc: '5 Technik-Checks per Video', test: d => d.videos >= 5 },
  { id: 'chall3', name: 'Challenge-Jäger', desc: '3 Wochen-Challenges geschafft', test: d => d.challengesDone >= 3 },
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
    if (app.addLog) app.addLog({ title: cfgRef.current.label || 'Freier Timer', kind: 'timer', min: Math.max(1, Math.round((c.rounds * c.work + (c.rounds - 1) * c.rest) / 60)), rounds: c.rounds, punches: Math.round(c.rounds * c.work / 60 * 20) });
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
function FoodPanel({ app, section = 'food' }) {
  const { state, update, today, updateToday, d } = app;
  const p = state.profile, n = d.n;
  const setP = patch => update(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const glasses = n.glasses;
  return (
    <div className="space-y-4">
      {section === 'food' && <NutritionPlan app={app} />}
      {section === 'food' && <Card>
        <H2 sub={'Heute · ' + NUT_ITEMS.filter(i => today.nut[i.id]).length + ' von ' + NUT_ITEMS.length + ' geschafft'}>Gesund essen</H2>
        <div className="space-y-2">
          {NUT_ITEMS.map(i => <Check key={i.id} checked={!!today.nut[i.id]} label={i.label} sub={i.sub} xp={4} onChange={() => updateToday(r => ({ ...r, nut: { ...r.nut, [i.id]: !r.nut[i.id] } }))} />)}
        </div>
      </Card>}

      {section === 'drink' && <>
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
      </>}
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
  const id = 'fa' + variant + (lefty ? 'l' : 'r');
  const foot = (x, y, rot, ghost) => (
    <g transform={`translate(${m(x)} ${y}) rotate(${r(rot)})`} opacity={ghost ? 0.35 : 1}>
      <ellipse cx="0" cy="6" rx="15" ry="27" fill={ghost ? 'none' : SKIN} stroke={ghost ? GOLD : LINE} strokeDasharray={ghost ? '4 3' : ''} strokeWidth="2" />
      {[-9, -3, 3, 9].map((tx, i) => <circle key={i} cx={tx} cy={-25 + Math.abs(tx) * 0.4} r="3.4" fill={ghost ? 'none' : SKIN} stroke={LINE} />)}
    </g>
  );
  const front = foot(78, 72, 12), rear = foot(126, 146, 42);
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={id} />
      <line x1={m(100)} y1="30" x2={m(100)} y2="6" stroke={RED} strokeWidth="3" markerEnd={'url(#' + id + ')'} />
      {variant === 'pivot' && foot(140, 120, 80, true)}
      {variant === 'step' ? (
        <>
          <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -22;0 -22;0 -22;0 0" keyTimes="0;0.25;0.5;0.75;1" dur="2.4s" repeatCount="indefinite" />{front}</g>
          <g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -22;0 -22;0 0" keyTimes="0;0.25;0.5;0.75;1" dur="2.4s" repeatCount="indefinite" />{rear}</g>
        </>
      ) : variant === 'pivot' ? (
        <>
          {front}
          <g><animateTransform attributeName="transform" type="rotate" values={`0 ${m(78)} 72;${r(-38)} ${m(78)} 72;${r(-38)} ${m(78)} 72;0 ${m(78)} 72`} keyTimes="0;0.4;0.7;1" dur="2.6s" repeatCount="indefinite" />{rear}</g>
        </>
      ) : <>{front}{rear}</>}
      {variant === 'stance' && <line x1={m(78)} y1="110" x2={m(126)} y2="110" stroke={GOLD} strokeWidth="2" strokeDasharray="5 4" />}
      {variant === 'step' && <>
        <line x1={m(48)} y1="90" x2={m(48)} y2="44" stroke={GOLD} strokeWidth="4" markerEnd={'url(#' + id + ')'} />
        <line x1={m(160)} y1="168" x2={m(160)} y2="128" stroke={GOLD} strokeWidth="3" strokeOpacity="0.6" markerEnd={'url(#' + id + ')'} />
      </>}
      {variant === 'pivot' && <path d={`M${m(108)} 166 Q${m(150)} 160 ${m(160)} 128`} fill="none" stroke={GOLD} strokeWidth="3" markerEnd={'url(#' + id + ')'} />}
    </svg>
  );
}

const PUNCH_PATHS = {
  jab: 'M74 98 L90 44',
  cross: 'M120 108 L106 44',
  lhook: 'M74 98 C30 74 46 34 90 32',
  rhook: 'M120 108 C174 82 152 34 110 32',
  feint: 'M74 98 L80 76',
  checkhook: 'M74 98 C30 74 46 34 90 32',
};
function TopView({ punch, lefty }) {
  const id = 'tv' + punch + (lefty ? 'l' : 'r');
  const rearPunch = punch === 'cross' || punch === 'rhook' || punch === 'pull';
  const path = punch === 'pull' ? PUNCH_PATHS.cross : PUNCH_PATHS[punch];
  const moving = !!path;
  const fist = (cx, cy, animPath) => animPath ? (
    <circle r="11" fill={RED}><animateMotion path={animPath} dur={punch === 'feint' ? '1.2s' : '1.8s'} repeatCount="indefinite" keyPoints="0;0;1;0;0" keyTimes="0;0.2;0.45;0.7;1" calcMode="linear" /></circle>
  ) : <circle cx={cx} cy={cy} r="11" fill={RED} />;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={id} />
      <g transform={lefty ? 'translate(200 0) scale(-1 1)' : ''}>
        <circle cx="100" cy="22" r="17" fill="#2a2a2e" stroke={GOLD} strokeDasharray="4 3" />
        {path && <path d={punch === 'feint' ? 'M74 88 L82 66' : path} fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeOpacity="0.45" strokeDasharray={punch === 'feint' ? '5 4' : ''} markerEnd={'url(#' + id + ')'} />}
        <g>
          {punch === 'pull' && <animateTransform attributeName="transform" type="translate" values="0 0;0 18;0 18;0 0;0 0" keyTimes="0;0.2;0.45;0.6;1" dur="1.8s" repeatCount="indefinite" />}
          {punch === 'checkhook' && <animateTransform attributeName="transform" type="rotate" values="0 100 140;0 100 140;-30 100 140;-30 100 140;0 100 140" keyTimes="0;0.3;0.55;0.8;1" dur="1.8s" repeatCount="indefinite" />}
          <ellipse cx="100" cy="142" rx="52" ry="18" transform="rotate(-16 100 142)" fill={SKIN} stroke={LINE} strokeWidth="2" />
          <circle cx="104" cy="130" r="18" fill="#4a4a50" stroke={LINE} strokeWidth="2" />
          <line x1="62" y1="150" x2="74" y2="104" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
          <line x1="146" y1="128" x2="122" y2="112" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
          {fist(74, 98, moving && !rearPunch ? path : null)}
          {fist(120, 108, moving && rearPunch ? path : null)}
        </g>
        {punch === 'cross' && <path d="M60 176 Q100 192 142 168" fill="none" stroke={GOLD} strokeWidth="3" strokeOpacity="0.7" markerEnd={'url(#' + id + ')'} />}
      </g>
    </svg>
  );
}

function FrontView({ pose = 'guard', lefty }) {
  const id = 'fv' + pose + (lefty ? 'l' : 'r');
  const anim = (values, dur = '2s', keyTimes) => <animateTransform attributeName="transform" type="translate" values={values} keyTimes={keyTimes} dur={dur} repeatCount="indefinite" />;
  const headAnim = { slip: anim('0 0;-24 4;-24 4;0 0;0 0', '2s', '0;0.25;0.5;0.75;1'), roll: anim('0 0;20 18;0 30;-20 18;0 0', '2.2s', '0;0.25;0.5;0.75;1'), body: anim('0 0;0 14;0 14;0 0', '2s', '0;0.3;0.7;1'), pull: anim('0 0;0 -6;0 -6;0 0', '2s', '0;0.3;0.6;1') }[pose];
  const lfAnim = { upper: 'M80 100 Q74 60 92 30', body: 'M80 60 Q66 90 40 108', parry: 'M80 58 L104 50 L80 58' }[pose];
  const rfAnim = { block: 'M120 56 L124 36 L124 36 L120 56' }[pose];
  const fist = (pos, p) => p ? <circle r="12" fill={RED}><animateMotion path={p} dur="2s" repeatCount="indefinite" keyPoints="0;1;1;0" keyTimes="0;0.35;0.6;1" calcMode="linear" /></circle> : <circle cx={pos[0]} cy={pos[1]} r="12" fill={RED} />;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <Arrow id={id} />
      <g transform={lefty ? 'translate(200 0) scale(-1 1)' : ''}>
        {(pose === 'slip' || pose === 'roll') && <circle cx="100" cy="46" r="19" fill="none" stroke={GOLD} strokeDasharray="4 3" opacity="0.4" />}
        <rect x={68} y={76} width="64" height={92} rx="16" fill={SKIN} stroke={LINE} strokeWidth="2" />
        <g>{headAnim}<circle cx="100" cy="46" r="19" fill="#4a4a50" stroke={LINE} strokeWidth="2" /></g>
        <polyline points="72,86 74,108 80,58" fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="128,86 126,108 120,58" fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        {fist([80, 58], lfAnim)}
        {fist([120, 58], rfAnim)}
        {pose === 'slip' && <path d="M98 14 L70 14" stroke={GOLD} strokeWidth="4" markerEnd={'url(#' + id + ')'} />}
        {pose === 'roll' && <path d="M140 30 Q100 120 60 30" fill="none" stroke={GOLD} strokeWidth="3" strokeOpacity="0.6" markerEnd={'url(#' + id + ')'} />}
        {pose === 'upper' && <path d="M80 100 Q74 60 92 30" fill="none" stroke={GOLD} strokeWidth="4" strokeOpacity="0.5" markerEnd={'url(#' + id + ')'} />}
        {pose === 'body' && <path d="M66 112 L32 112" stroke={GOLD} strokeWidth="4" strokeOpacity="0.6" markerEnd={'url(#' + id + ')'} />}
        {pose === 'parry' && <path d="M150 40 L112 50" stroke={GOLD} strokeWidth="4" strokeOpacity="0.6" markerEnd={'url(#' + id + ')'} />}
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
const COACH = { intensity: 'mittel', extra: [] };
const comboLen = t => (t.match(/(jab|gerade|haken|eins|zwei|drei|vier|fünf|sechs|pendeln|abrollen|block|parieren|finte|zurücklehnen|pivot|winkel)/gi) || []).length;
const estPunches = t => typeof t === 'string' ? (t.match(/(jab|gerade|haken|eins|zwei|drei|vier|fünf|sechs)/gi) || []).length : (t && t.punches) || 0;
const callGap = () => COACH.intensity === 'leicht' ? rand(9000, 13000) : COACH.intensity === 'hart' ? rand(4000, 6500) : rand(6500, 9500);
function callsFor(known, knuckle) {
  const lib = COMBO_LIB.filter(c => c.r.every(x => known.includes(x)));
  const strikes = lib.filter(c => !c.r.every(x => x === 'step' || x === 'guard'));
  let base = strikes.length >= 3 ? strikes : lib;
  const I = COACH.intensity;
  if (I === 'leicht') { const s = base.filter(c => comboLen(c.t) <= 2); if (s.length >= 3) base = s; }
  if (I === 'hart') { const s = base.filter(c => comboLen(c.t) >= 3); if (s.length >= 4) base = s; }
  return () => {
    if (knuckle && Math.random() < 0.28) return pick(KNUCKLE_TIPS);
    if (known.includes('guard') && Math.random() < (I === 'hart' ? 0.08 : 0.15)) return pick(BEGINNER_PACING);
    if (COACH.extra.length && known.includes('jab') && Math.random() < 0.2) return pick(COACH.extra);
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
    if (x.type === 'rounds') { const r = Math.max(2, x.rounds + adjust); s += 10 + r * scaleWork(x.work, adjust) + (r - 1) * scaleRest(x.rest, adjust); }
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

function TimedStep({ step, next, say, known, lefty, onStat }) {
  const tk = useTicker();
  const [stage, setStage] = useState('ready');
  const nextCall = useRef(0);
  const [call, setCall] = useState('');
  const gen = useMemo(() => callsFor(known, false), [known]);
  useEffect(() => {
    say(step.title + '. ' + step.cue);
    tk.start(5, () => { setStage('run'); bell(1); nextCall.current = Date.now() + 4000; tk.start(step.sec, () => { bell(1); if (step.calls && onStat) onStat({ punches: Math.round(step.sec / 60 * 12) }); next(); }, onTick); }, l => { if (l <= 3 && l > 0) beep(1, 880); });
    return () => tk.stop();
  }, []);
  const onTick = left => {
    if (left === 10 && step.sec >= 30) beep(2, 1200);
    if (step.calls && Date.now() >= nextCall.current && left > 4) { const c = gen(); setCall(c); say(c); if (onStat) onStat({ punches: estPunches(c) }); nextCall.current = Date.now() + callGap(); }
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

function RoundsStep({ step, next, say, known, adjust, onKnuckle, onStat }) {
  const rounds = Math.max(2, step.rounds + adjust);
  const W = scaleWork(step.work, adjust), R = scaleRest(step.rest, adjust);
  const tk = useTicker();
  const [phase, setPhase] = useState('ready');
  const [round, setRound] = useState(1);
  const [call, setCall] = useState('');
  const nextCall = useRef(0), flags = useRef({});
  const gen = useMemo(() => step.mode === 'opponent' ? oppGen(known) : step.mode === 'pads2' ? padsGen(known) : callsFor(known, !!step.knuckle), [known]);
  const gap = () => step.mode === 'opponent' ? oppGap() : callGap();
  const roundRef = useRef(1);
  const startWork = n => {
    roundRef.current = n; setRound(n); setPhase('work'); setCall(''); flags.current = {}; bell(1);
    say(W <= 30 ? (n === rounds ? 'Letzte! Vollgas!' : 'Los!') : n === rounds ? 'Letzte Runde! Gib alles!' : 'Runde ' + n + '. Los!');
    nextCall.current = Date.now() + 3500;
    tk.start(W, () => {
      if (onStat) onStat({ rounds: 1, punches: Math.round(W / 60 * (step.noBag ? 12 : 20)) });
      if (n >= rounds) { bell(3); say('Geschafft! Super gemacht!'); if (step.knuckle) onKnuckle(); next(); }
      else if (R > 0) { bell(1); setPhase('rest'); setCall(''); say(R >= 20 ? 'Pause. Tief atmen. Gleich kommt Runde ' + (n + 1) + '.' : 'Pause!'); tk.start(R, () => startWork(n + 1), restTick); }
      else startWork(n + 1);
    }, workTick);
  };
  const workTick = left => {
    if (!flags.current.k30 && left <= 30 && left > 0 && W >= 60) { flags.current.k30 = true; knock(3); setCall('Noch 30 Sekunden!'); say('Noch 30 Sekunden! Gas geben!'); nextCall.current = Date.now() + 6000; return; }
    if (!flags.current.k10 && left <= 10 && left > 0) { flags.current.k10 = true; knock(2); }
    if (Date.now() >= nextCall.current && left > 4) { const c = gen(); setCall(c); say(typeof c === 'string' ? c : c.say); if (onStat) onStat({ punches: estPunches(c) }); nextCall.current = Date.now() + gap(); }
  };
  const restTick = left => { if (left === 10 && R > 15) { beep(2, 990); say('Zehn Sekunden. Hände hoch, bereit machen!'); } };
  useEffect(() => {
    say((step.noBag ? '' : 'Jetzt an den Sandsack. ') + step.note + ' ' + rounds + ' Runden. Stell dich bereit.');
    tk.start(12, () => startWork(1), l => { if (l <= 3 && l > 0) beep(1, 880); });
    return () => tk.stop();
  }, []);
  const t = tk.t;
  const color = phase === 'work' ? RED : phase === 'rest' ? GOLD : '#777';
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-xs uppercase tracking-[0.25em] text-gold">{phase === 'ready' ? (step.noBag ? 'Mach dich bereit' : 'Geh an den Sack') : phase === 'rest' ? 'Pause' : 'Runde ' + round + ' von ' + rounds}</div>
      <h2 className="mt-1 text-center font-display text-3xl uppercase leading-tight text-stone-50">{phase === 'rest' ? 'Durchatmen' : step.title}</h2>
      <div className="mt-2 flex justify-center gap-1.5">{Array.from({ length: rounds }).map((_, i) => <span key={i} className={'h-2 w-6 rounded-full ' + (i + 1 < round || (i + 1 === round && phase === 'rest') ? 'bg-gold' : i + 1 === round && phase === 'work' ? 'bg-blood' : 'bg-white/15')}></span>)}</div>
      <div className="mt-4">
        <Ring left={t.left} total={t.total} color={color}>
          <div className="font-display text-6xl tabular-nums text-stone-50">{phase === 'ready' ? t.left : fmt(t.left)}</div>
          {t.paused && <div className="text-xs uppercase tracking-widest text-gold">Pausiert</div>}
        </Ring>
      </div>
      <div className="mt-4 min-h-[4rem] text-center">
        {phase === 'work' && call && <div className="font-display text-3xl uppercase leading-tight text-gold">{typeof call === 'string' ? call : call.show}</div>}
        {phase === 'work' && call && typeof call !== 'string' && call.sub && <div className="mx-auto mt-2 max-w-xs rounded-xl bg-white/5 px-3 py-2 text-sm text-stone-200">{call.sub}</div>}
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

function DoneScreen({ session, minutes, onFeedback, isFinal, xp, punches, record }) {
  useEffect(() => { bell(2); }, []);
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div className="mt-6 text-7xl">{isFinal ? '🏆' : '🥊'}</div>
      <h2 className="mt-3 font-display text-4xl uppercase leading-tight text-gold">{isFinal ? session.lesson.finalText || 'Geschafft!' : 'Geschafft!'}</h2>
      <p className="mt-2 text-lg text-stone-200">{session.title} ist erledigt.</p>
      {record && <div className="mt-3 rounded-full bg-gold px-4 py-1.5 font-display text-sm uppercase text-ink">🏅 Neuer Rekord: meiste Schläge!</div>}
      <div className="mt-6 grid w-full grid-cols-3 gap-2">
        <div className="rounded-2xl bg-anth p-4"><div className="font-display text-3xl text-stone-50">{minutes}</div><div className="text-xs uppercase tracking-wider text-stone-500">Minuten</div></div>
        <div className="rounded-2xl bg-anth p-4"><div className="font-display text-3xl text-gold">+{xp}</div><div className="text-xs uppercase tracking-wider text-stone-500">XP</div></div>
        <div className="rounded-2xl bg-anth p-4"><div className="font-display text-3xl text-stone-50">{punches || 0}</div><div className="text-xs uppercase tracking-wider text-stone-500">Schläge*</div></div>
      </div>
      <div className="mt-8 w-full">
        <p className="mb-4 text-[11px] text-stone-500">* geschätzt aus Ansagen und Rundenzeit</p>
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
  const extra = useRef({ wrap: false, pull: 0, knuckle: false, rounds: 0, punches: 0, min: 0 });
  const bestBefore = useRef(app.d.best.punches);
  const onStat = s => { extra.current.rounds += s.rounds || 0; extra.current.punches += s.punches || 0; };
  const st = state.settings;
  const say = txt => { if (st.voiceOn) speak(txt, st.rate); };
  useEffect(() => {
    ac(); let lock = null;
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => { }); } catch (e) { }
    return () => { try { lock && lock.release(); window.speechSynthesis.cancel(); } catch (e) { } };
  }, []);
  const finish = () => { setDone(true); extra.current.min = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)); completeSession(session, extra.current); try { window.speechSynthesis.cancel(); } catch (e) { } say(session.lesson && session.lesson.final ? 'Unglaublich! Du hast die Grundausbildung geschafft!' : 'Training geschafft! Stark gemacht!'); };
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
          {done ? <DoneScreen xp={65 + (extra.current.wrap ? 10 : 0)} punches={extra.current.punches} record={extra.current.punches > bestBefore.current && bestBefore.current > 0} session={session} isFinal={session.lesson && session.lesson.final} minutes={Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))} onFeedback={v => { const r = applyFeedback(state, v); update(s => applyFeedback(s, v).st); app.toast(feedbackMsg(v, r.adj, r.inten, r.changedInt)); onClose(); }} />
            : rest ? <RestScreen key={'r' + i} sec={rest.sec} upcoming={steps[i + 1]} onDone={rest.go} />
              : step.type === 'learn' ? <LearnStep key={i} step={step} next={next} say={say} lefty={lefty} />
                : step.type === 'timed' ? <TimedStep key={i} step={step} next={next} say={say} known={known} lefty={lefty} onStat={onStat} />
                  : step.type === 'rounds' ? <RoundsStep key={i} step={step} next={next} say={say} known={known} adjust={state.path.adjust || 0} onStat={onStat} onKnuckle={() => { extra.current.knuckle = true; }} />
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
  const needsBag = steps.some(s => s.type === 'rounds' && !s.noBag);
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
        {lesson.week ? <div className="text-xs uppercase tracking-[0.2em] text-blood">Woche {lesson.week} · Lektion {lessonIndex(lesson.id) + 1}</div> : lesson.kind === 'workout' ? <div className="text-xs uppercase tracking-[0.2em] text-blood">{lesson.icon} Workout</div> : null}
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
    { id: 'sleep', icon: '😴', label: 'Schlafen', done: today.sleep != null, sub: today.sleep != null ? today.sleep + ' h' : 'eintragen', act: () => go('drink') },
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
    <div className="-mt-4 space-y-5">
      <StartScene app={app} />

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
          <div className="mt-1 font-display text-2xl uppercase text-gold">Alle 24 Lektionen geschafft!</div>
          <p className="mt-1 text-stone-300">Du bist bereit für das Fight Camp. Trainiere nach Plan oder wähle ein Workout aus der Bibliothek.</p>
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

      <HomeExtras app={app} />


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
      {Object.keys(WEEKS).map(Number).map(w => (
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
function LearnTab({ app, part = 'tech' }) {
  const { state } = app;
  const lefty = state.profile.hand === 'l';
  const known = state.path.done.length ? knownUpTo(Math.max(...state.path.done.map(lessonIndex))) : [];
  const [open, setOpen] = useState(null);
  const T = open ? TECH[open] : null;
  return (
    <div className="space-y-5">
      {part === 'tech' && <p className="text-sm text-stone-400">Tippe eine gelernte Technik an, um sie nochmal anzuschauen.</p>}
      {part === 'video' && (known.length ? <VideoCheck app={app} known={known} /> : <p className="rounded-2xl bg-anth p-4 text-sm text-stone-400">Der Video-Check wird nach deiner ersten Lektion freigeschaltet.</p>)}
      {part === 'tech' && <div className="grid grid-cols-2 gap-2.5">
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
      </div>}
      {part === 'schutz' && <GuidePanel app={app} />}
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
    ['food', '🥦', 'Essen, Trinken & Schlaf', 'Essensplan, Wasser, Schlaf'],
    ['shop', '🛒', 'Einkaufsliste', 'Für deinen Essensplan der Woche'],
    ['combos', '🧩', 'Kombi-Baukasten', 'Eigene Kombinationen für den Coach'],
    ['settings', '⚙️', 'Einstellungen', 'Name, Hand, Stimme, Ausrüstung'],
  ];
  const titles = { timer: 'Freier Box-Timer', camp: 'Fight-Camp-Plan', food: 'Essen, Trinken & Schlaf', settings: 'Einstellungen', shop: 'Einkaufsliste', combos: 'Kombi-Baukasten' };
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
      {sub === 'shop' && <ShoppingList app={app} />}
      {sub === 'combos' && <ComboBuilder app={app} />}
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
  const current = st.voiceName;
  const label = v => {
    const reg = { 'de-de': 'Deutschland', 'de-ch': 'Schweiz', 'de-at': 'Österreich' }[v.lang.toLowerCase().replace('_', '-')] || v.lang;
    const q = /premium/i.test(v.name) ? ' · Premium' : /enhanced|erweitert/i.test(v.name) ? ' · Erweitert' : '';
    return { name: v.name.replace(/\s*\((Premium|Enhanced|Erweitert)\)/i, ''), sub: reg + q };
  };
  const pickAndTest = v => { setSt({ voiceName: v.name }); VOICE_PREF.name = v.name; ac(); speak('Hallo! Ich bin dein Box-Coach. Eins, zwei, Hände hoch!', st.rate); };
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone-500">Stimme wählen ({voices.length})</div>
      <div className="mt-2 space-y-1.5">
        <button onClick={() => { setSt({ voiceName: null }); VOICE_PREF.name = null; ac(); speak('Hallo! Ich bin dein Box-Coach. Eins, zwei, Hände hoch!', st.rate); }} className={'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ' + (!st.voiceName ? 'border-gold bg-gold/15' : 'border-white/10 bg-coal')}>
          <span className="text-lg">{!st.voiceName ? '🔊' : '📱'}</span>
          <span className="flex-1"><span className={'block text-sm ' + (!st.voiceName ? 'text-gold' : 'text-stone-100')}>iPhone-Standard</span><span className="block text-[11px] text-stone-500">Das iPhone wählt die Stimme selbst</span></span>
          <span className="text-xs text-stone-500">{!st.voiceName ? 'aktiv' : 'anhören'}</span>
        </button>
      </div>
      {voices.length === 0 ? <p className="mt-2 text-sm text-stone-400">Keine weiteren deutschen Stimmen gefunden.</p> : (
        <div className="mt-1.5 space-y-1.5">
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
      <p className="mt-2 text-xs text-stone-500">Tipp: Wähle «iPhone-Standard» und stell in den iPhone-Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch deine Lieblingsstimme ein (Häkchen setzen). Apple gibt heruntergeladene Stimmen nicht an Web-Apps weiter – ob iOS sie trotzdem nimmt, hängt von der iOS-Version ab.</p>
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
        <H2 sub="Wie schnell und wie lang die Ansagen sind">Coach-Intensität</H2>
        <IntensityPicker app={app} />
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
        <H2 sub="Ändert sich auch automatisch mit «Zu leicht» / «Zu schwer» nach dem Training">Schwierigkeit der Runden</H2>
        <div className="grid grid-cols-3 gap-2">
          {[[-2, '−2'], [-1, '−1'], [0, 'Normal'], [1, '+1'], [2, '+2'], [3, '+3']].map(([v, l]) => <button key={v} onClick={() => update(s => ({ ...s, path: { ...s.path, adjust: v } }))} className={'rounded-xl border py-2.5 text-xs ' + ((state.path.adjust || 0) === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{l}</button>)}
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
const NAV = [['home', '🏠', 'Start'], ['plan', '📅', 'Plan'], ['training', '🥊', 'Training'], ['technik', '📖', 'Technik'], ['body', '🥦', 'Körper'], ['progress', '🏆', 'Fortschritt']];
const ROUTES = { plan: ['plan'], home: ['home'], today: ['home'], training: ['training'], lessons: ['training', 'lessons'], workouts: ['training', 'workouts'], timer: ['training', 'timer'], camp: ['training', 'camp'], technik: ['technik'], learn: ['technik', 'tech'], tech: ['technik', 'tech'], video: ['technik', 'video'], combos: ['technik', 'combos'], guide: ['technik', 'schutz'], schutz: ['technik', 'schutz'], body: ['body'], food: ['body', 'food'], shop: ['body', 'shop'], drink: ['body', 'drink'], weight: ['body', 'weight'], progress: ['progress'], trophy: ['progress', 'trophies'], challenges: ['progress', 'challenges'], settings: ['settings'] };

function App() {
  const [state, update, sync] = usePersistent();
  const [tab, setTab] = useState('home');
  const [subs, setSubs] = useState({ training: 'lessons', technik: 'tech', body: 'food', progress: 'overview' });
  const [prevTab, setPrevTab] = useState('home');
  const setSub = (t, v) => setSubs(s => ({ ...s, [t]: v }));
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

  COACH.intensity = state.settings.intensity || 'mittel';
  COACH.extra = [...(state.path.done.length >= 12 ? REWARDS.filter(r => r.type === 'combo' && state.unlocked.includes(r.id)).map(r => r.call) : []), ...state.combos.filter(c => c.on).map(c => c.text)];
  VOICE_PREF.name = state.settings.voiceName || null; VOICE_PREF.pitch = state.settings.pitch || 0.95;
  const d = useMemo(() => derive(state), [state]);
  const today = getDay(state, tKey);
  const toast = msg => { const id = Math.random(); setToasts(t => [...t, { id, msg }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000); };
  const updateToday = fn => update(s => ({ ...s, history: { ...s.history, [tKey]: fn(getDay(s, tKey)) } }));
  const go = (t, sb) => {
    let key = t === 'more' ? (sb || 'settings') : (sb && sb !== 'warmup' && ROUTES[sb] ? sb : t);
    if (sb === 'warmup') key = 'camp';
    const [tb, sbb] = ROUTES[key] || ['home'];
    if (tb === 'settings') setPrevTab(tab);
    setTab(tb); if (sbb) setSub(tb, sbb);
    if (sb === 'warmup') setFocusWarmup(x => x + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const loadPreset = (p, label) => { setPreset({ ...p, label }); go('timer'); };
  const claimReward = () => {
    const next = REWARDS.find(r => !state.unlocked.includes(r.id));
    update(s => ({ ...s, unlocked: next ? [...s.unlocked, next.id] : s.unlocked, history: { ...s.history, [tKey]: { ...getDay(s, tKey), claimed: true, rewardId: next ? next.id : null } } }));
    toast(next ? '🎁 Belohnung freigeschaltet! +25 XP' : '🎁 +25 XP');
    return next || null;
  };
  const openLesson = l => setSheet(l);
  const startLesson = (l, steps) => {
    setSheet(null);
    if (l.kind === 'regen') { startRegen(); return; }
    if (l.kind === 'workout') {
      const maxIdx = state.path.done.length ? Math.max(...state.path.done.map(lessonIndex)) : 0;
      setSession({ key: Date.now(), id: l.id, kind: 'workout', cat: l.cat, title: l.title, steps, known: l.known || knownUpTo(maxIdx), opp: steps.some(s => s.mode === 'opponent') });
      return;
    }
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
      const entry = { d: tKey, t: Date.now(), title: s.title, kind: s.kind, id: s.id, cat: s.cat, min: extra.min || 0, rounds: extra.rounds || 0, punches: extra.punches || 0, opp: !!(s.opp || (s.steps || []).some(x => x.mode === 'opponent')) };
      return { ...st, path, log: [...st.log, entry].slice(-500), history: { ...st.history, [tKey]: nd } };
    });
  };

  useEffect(() => {
    const earned = TROPHIES.filter(t => t.test(d) && !state.trophies.includes(t.id));
    if (earned.length) {
      update(s => ({ ...s, trophies: [...s.trophies, ...earned.map(t => t.id).filter(id => !s.trophies.includes(id))] }));
      earned.forEach(t => toast('🏆 Neue Trophäe: ' + t.name));
    }
  }, [d.sessions, d.streak, d.pullups, d.champ, d.speed, d.warmups, d.hydro, d.base, d.basics, d.totals.punches, d.videos, d.challengesDone]);

  const addLog = e => update(st => ({ ...st, log: [...st.log, { d: tKey, t: Date.now(), ...e }].slice(-500) }));
  const app = { addLog, state, update, d, today, tKey, updateToday, go, loadPreset, preset, setPreset, toast, claimReward, sync, openLesson, startRegen, completeSession };

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-28 pt-4">
      <header className={'mb-4 flex items-center justify-between ' + (tab === 'home' ? 'hidden' : '')}>
        <div className="font-display text-xl uppercase leading-none tracking-[0.12em] text-stone-100">Fight<span className="text-blood">·</span><span className="text-gold">Camp</span></div>
        <div className="flex items-center gap-2">
          <button onClick={() => go('trophy')} className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5">
            <span className="text-xs text-gold">{d.rank.name}</span>
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-gold" style={{ width: d.prog * 100 + '%' }}></span></span>
          </button>
          <button onClick={() => go('settings')} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-anth text-lg" aria-label="Einstellungen">⚙️</button>
        </div>
      </header>

      {tab === 'home' && <StartScreen app={app} />}
      {tab === 'plan' && <PlanTab app={app} />}
      <div className={tab === 'training' ? '' : 'hidden'}><TrainingTab app={app} sub={subs.training} setSub={v => setSub('training', v)} focusWarmup={focusWarmup} /></div>
      {tab === 'technik' && <TechnikTab app={app} sub={subs.technik} setSub={v => setSub('technik', v)} />}
      {tab === 'body' && <BodyTab app={app} sub={subs.body} setSub={v => setSub('body', v)} />}
      {tab === 'progress' && <ProgressHub app={app} sub={subs.progress} setSub={v => setSub('progress', v)} />}
      {tab === 'settings' && <SettingsPage app={app} onBack={() => { setTab(prevTab === 'settings' ? 'home' : prevTab); window.scrollTo({ top: 0 }); }} />}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map(([id, e, l]) => (
            <button key={id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }} className={'flex flex-col items-center gap-0.5 py-2.5 transition ' + (tab === id ? 'text-gold' : 'text-stone-500')}>
              <span className={'text-2xl transition ' + (tab === id ? 'scale-110' : 'opacity-70 grayscale')}>{e}</span>
              <span className="text-[10px] font-medium">{l}</span>
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



/* =====================================================================
   ERWEITERUNG: Fortgeschrittenen-Weg, Gegner-Modus, Pratzen zu zweit,
   Workout-Bibliothek, Statistik, Challenges, Gewicht, Video-Check,
   Einkaufsliste, Kombi-Baukasten, Intensität
   ===================================================================== */

Object.assign(TECH, {
  parry: { name: 'Parieren', img: 'front:parry', lesson: 13, points: () => ['Mit der offenen Hand den Schlag kurz zur Seite schieben.', 'Nur eine kleine Bewegung – die Hand kommt sofort zurück.', 'Danach direkt mit Jab oder Gerade antworten.'], mistake: 'Nicht nach dem Schlag greifen oder weit ausholen.', caption: 'Hand lenkt den Jab zur Seite ab' },
  feint: { name: 'Finten (Täuschen)', img: 'top:feint', lesson: 14, points: () => ['Einen Jab nur halb andeuten – mit Schulter und Blick.', 'Der Gegner reagiert, und du triffst in die Lücke.', 'Finte und echter Schlag müssen gleich aussehen.'], mistake: 'Nicht zu langsam täuschen – sonst durchschaut es jeder.', caption: 'Kurz andeuten, dann richtig schlagen' },
  pullcounter: { name: 'Pull-Counter', img: 'top:pull', lesson: 16, points: () => ['Gewicht aufs hintere Bein verlagern und den Oberkörper leicht zurücknehmen.', 'Der Jab des Gegners geht ins Leere.', 'Sofort nach vorne kommen und mit der Geraden kontern.'], mistake: 'Nicht zu weit zurücklehnen – die Füsse bleiben stehen.', caption: 'Zurück, dann mit der Geraden nach vorne' },
  checkhook: { name: 'Check-Haken', img: 'top:checkhook', lesson: 17, points: () => ['Der Gegner stürmt nach vorne.', 'Vorderer Haken – und gleichzeitig auf dem vorderen Fuss wegdrehen.', 'Er läuft ins Leere, du stehst seitlich von ihm.'], mistake: 'Nicht stehen bleiben – Drehung und Haken passieren zusammen.', caption: 'Haken und Drehung in einem' },
  angle: { name: 'Winkel nehmen', img: 'feet:pivot', lesson: 20, points: () => ['Nach einer Kombination nicht gerade zurückgehen.', 'Mit einem Seitschritt oder Pivot zur Seite gehen.', 'Aus dem neuen Winkel gleich wieder angreifen.'], mistake: 'Nie in einer geraden Linie zurück – dort trifft der Gegner.', caption: 'Seitlich raus statt gerade zurück' },
});
TECH_ORDER.push('parry', 'feint', 'pullcounter', 'checkhook', 'angle');

COMBO_LIB.push(
  { t: 'Parieren, Jab, Gerade!', r: ['parry', 'jab', 'cross'] }, { t: 'Parieren, Gerade!', r: ['parry', 'cross'] },
  { t: 'Finte, Gerade!', r: ['feint', 'cross'] }, { t: 'Finte Jab, Körperhaken!', r: ['feint', 'body', 'lhook'] }, { t: 'Finte, eins, zwei!', r: ['feint', 'jab', 'cross'] },
  { t: 'Zurücklehnen, Gerade!', r: ['pullcounter'] }, { t: 'Zurücklehnen, Gerade, Haken!', r: ['pullcounter', 'lhook'] },
  { t: 'Check-Haken, raus!', r: ['checkhook'] }, { t: 'Eins, zwei, Check-Haken!', r: ['checkhook', 'jab', 'cross'] },
  { t: 'Eins, zwei, Winkel, eins, zwei!', r: ['angle', 'jab', 'cross'] }, { t: 'Eins, zwei, drei, Winkel!', r: ['angle', 'lhook'] },
  { t: 'Eins, zwei, drei, zwei, Körperhaken!', r: ['lhook', 'body'] }, { t: 'Jab, Gerade, Aufwärtshaken, Haken, Gerade!', r: ['upper', 'lhook'] },
  { t: 'Körper, Körper, Kopf!', r: ['body', 'lhook', 'rhook'] }, { t: 'Doppelter Haken, Gerade!', r: ['lhook', 'cross'] },
);

LESSONS.push(
  { id: 'L13', week: 5, title: 'Parieren', goal: 'Schläge mit der Hand ablenken.', learns: ['parry'], steps: [...WARM, learn('parry'), shadow(60, 'Parieren üben', 'Parieren und sofort zurückschlagen.'), WRAP, bag(4, 120, 60, 'Nach jeder Kombination: parieren und kontern.'), ...COOL] },
  { id: 'L14', week: 5, title: 'Finten', goal: 'Täuschen wie ein Profi.', learns: ['feint'], steps: [...WARM, learn('feint'), shadow(60), shadow(60), WRAP, bag(4, 120, 60, 'Täusche an – dann triff!'), ...COOL] },
  { id: 'L15', week: 5, title: 'Kondition', goal: 'Mehr Luft für lange Runden.', learns: [], steps: [...WARM, WRAP, bag(6, 60, 30, 'Hohes Tempo, viele Schläge!'), reps('Burpees', 3, '8', 'Runter, Brust zum Boden, hochspringen.'), reps('Unterarmstütz (Plank)', 2, '40 Sek.', 'Körper gerade wie ein Brett.', { hold: 40 }), ...COOL] },
  { id: 'L16', week: 6, title: 'Pull-Counter', goal: 'Ausweichen nach hinten und kontern.', learns: ['pullcounter'], steps: [...WARM, learn('pullcounter'), shadow(60), WRAP, bag(4, 120, 60, 'Zurücklehnen und mit der Geraden kontern.'), ...COOL] },
  { id: 'L17', week: 6, title: 'Check-Haken', goal: 'Den stürmenden Gegner auskontern.', learns: ['checkhook'], steps: [...WARM, learn('checkhook'), shadow(60), WRAP, bag(4, 120, 60, 'Haken und Drehung zusammen.'), ...COOL] },
  { id: 'L18', week: 6, title: 'Gegner-Modus', goal: 'Reagiere auf die Angriffe des Gegners.', learns: [], steps: [...WARM, bag(4, 90, 60, 'Ich sage an, was der Gegner schlägt. Du verteidigst und konterst.', { mode: 'opponent', title: 'Gegner-Modus', noBag: true }), WRAP, bag(3, 120, 60, 'Jetzt am Sack: Kombinationen mit Verteidigung.'), ...COOL] },
  { id: 'L19', week: 7, title: 'Lange Kombinationen', goal: '4 bis 5 Schläge am Stück.', learns: [], steps: [...WARM, shadow(90), WRAP, bag(5, 120, 60, 'Lange Kombinationen – Deckung trotzdem oben!'), ...COOL] },
  { id: 'L20', week: 7, title: 'Winkel & Ringmitte', goal: 'Nach dem Angriff seitlich raus.', learns: ['angle'], steps: [...WARM, learn('angle'), shadow(60), WRAP, bag(5, 120, 60, 'Nach jeder Kombination: Winkel nehmen.'), ...COOL] },
  { id: 'L21', week: 7, title: 'Kraft-Tag 2', goal: 'Mehr Power für deine Schläge.', learns: [], steps: [...WARM, reps('Klimmzüge', 4, '3–6', 'Saubere Wiederholungen, ganz runter und hoch.', { pull: 4, need: 'bar', alt: reps('Liegestütze eng', 4, '8–12', 'Hände eng, Ellbogen am Körper.') }), reps('Liegestütze', 3, '10–15', 'Rücken gerade, Brust bis kurz über den Boden.'), reps('Hocksprünge', 3, '10', 'Tief in die Hocke, explosiv hochspringen.'), reps('Unterarmstütz (Plank)', 3, '40 Sek.', 'Körper gerade wie ein Brett.', { hold: 40 }), WRAP, bag(4, 60, 45, 'Power-Kombinationen!'), ...COOL] },
  { id: 'L22', week: 8, title: 'Speed-Ausdauer', goal: 'Schnell bleiben, auch wenn du müde bist.', learns: [], steps: [...WARM, WRAP, bag(8, 20, 10, '20 Sekunden Vollgas, 10 Sekunden Pause.', { title: 'Tabata' }), bag(4, 120, 60, 'Saubere Technik trotz Müdigkeit.'), ...COOL] },
  { id: 'L23', week: 8, title: 'Sparring-Simulation', goal: 'Verteidigen und kontern am Sack.', learns: [], steps: [...WARM, WRAP, bag(6, 120, 60, 'Gegner-Modus am Sack: verteidigen, dann kontern!', { mode: 'opponent', title: 'Sparring-Simulation' }), ...COOL] },
  { id: 'L24', week: 8, title: 'Der Titelkampf', goal: '6 Runden à 3 Minuten – dein Titelkampf.', learns: [], final: true, finalText: 'Titelkampf gewonnen!', steps: [...WARM, shadow(60, 'Schattenboxen', 'Mach dich bereit für den Titelkampf!'), WRAP, bag(6, 180, 60, 'Der Titelkampf! Zeig alles, was du gelernt hast.'), ...COOL] },
);
Object.assign(WEEKS, { 5: 'Feinere Technik', 6: 'Konter-Boxer', 7: 'Druck machen', 8: 'Wettkampf-bereit' });
LESSONS.find(l => l.id === 'L12').finalText = 'Grundausbildung geschafft!';

/* ---------- Gegner-Modus & Pratzen zu zweit ---------- */
const OPP = [
  { say: 'Achtung, Jab!', show: 'Jab kommt', hint: 'Pendeln → Gerade kontern', r: ['slip', 'cross'] },
  { say: 'Achtung, Jab!', show: 'Jab kommt', hint: 'Blocken → eins, zwei', r: ['block', 'jab', 'cross'] },
  { say: 'Achtung, Gerade!', show: 'Gerade kommt', hint: 'Pendeln → Haken kontern', r: ['slip', 'lhook'] },
  { say: 'Achtung, Haken!', show: 'Haken kommt', hint: 'Abrollen → Haken, Gerade', r: ['roll', 'lhook', 'cross'] },
  { say: 'Achtung, Haken!', show: 'Haken kommt', hint: 'Blocken → eins, zwei', r: ['block'] },
  { say: 'Achtung, Körperhaken!', show: 'Körperhaken kommt', hint: 'Ellbogen runter → Aufwärtshaken', r: ['block', 'upper'] },
  { say: 'Achtung, Jab!', show: 'Jab kommt', hint: 'Parieren → Jab, Gerade', r: ['parry'] },
  { say: 'Achtung, Gerade!', show: 'Gerade kommt', hint: 'Zurücklehnen → Gerade', r: ['pullcounter'] },
  { say: 'Er stürmt nach vorne!', show: 'Gegner stürmt', hint: 'Check-Haken und zur Seite', r: ['checkhook'] },
  { say: 'Lücke! Angreifen!', show: 'Lücke!', hint: 'Eins, zwei, drei!', r: ['jab', 'cross', 'lhook'] },
  { say: 'Er wird müde! Druck!', show: 'Druck machen', hint: 'Eins, zwei, Winkel!', r: ['angle'] },
];
function oppGen(known) {
  const pool = OPP.filter(o => o.r.every(x => known.includes(x)));
  const P = pool.length ? pool : [{ say: 'Achtung, Jab!', show: 'Jab kommt', hint: 'Hände hoch, blocken' }];
  return () => { const o = pick(P); return { say: COACH.intensity === 'leicht' ? o.say + ' ' + o.hint.replace('→', ', dann') + '!' : o.say, show: o.show, sub: o.hint, punches: 2 }; };
}
const oppGap = () => COACH.intensity === 'leicht' ? rand(6000, 9000) : COACH.intensity === 'hart' ? rand(2500, 4000) : rand(3500, 6000);

const PADS2 = [
  { r: ['jab'], boxer: 'Jab', holder: 'Vordere Pratze nach vorne', say: 'Jab!' },
  { r: ['jab'], boxer: 'Doppel-Jab', holder: 'Vordere Pratze nach vorne, zweimal', say: 'Doppel-Jab!' },
  { r: ['jab', 'cross'], boxer: 'Eins, zwei', holder: 'Vordere, dann hintere Pratze nach vorne', say: 'Eins, zwei!' },
  { r: ['jab', 'cross', 'lhook'], boxer: 'Eins, zwei, drei', holder: 'Beim Haken die Pratze seitlich drehen', say: 'Eins, zwei, drei!' },
  { r: ['lhook', 'rhook'], boxer: 'Haken, Haken', holder: 'Beide Pratzen seitlich drehen', say: 'Haken, Haken!' },
  { r: ['upper'], boxer: 'Aufwärtshaken', holder: 'Pratze nach unten drehen, auf Kinnhöhe', say: 'Aufwärtshaken!' },
  { r: ['body', 'lhook'], boxer: 'Haken zum Körper', holder: 'Pratze an die Rippen halten', say: 'Haken zum Körper!' },
  { r: ['slip', 'cross'], boxer: 'Pendeln, Gerade', holder: 'Langsamen Jab schlagen, dann Pratze hoch', say: 'Halter jabbt – pendeln, Gerade!' },
  { r: ['roll', 'lhook', 'cross'], boxer: 'Abrollen, Haken, Gerade', holder: 'Langsamen Haken über den Kopf, dann Pratzen hoch', say: 'Halter schlägt Haken – abrollen, Haken, Gerade!' },
  { r: ['block', 'jab', 'cross'], boxer: 'Blocken, eins, zwei', holder: 'Leicht auf die Deckung tippen, dann Pratzen vorne', say: 'Blocken, eins, zwei!' },
];
function padsGen(known) {
  const P = PADS2.filter(o => o.r.every(x => known.includes(x)));
  const L = P.length ? P : PADS2.slice(0, 1);
  return () => { const o = pick(L); return { say: o.say, show: o.boxer, sub: 'Halter: ' + o.holder, punches: estPunches(o.boxer) || 1 }; };
}

/* ---------- Workout-Bibliothek ---------- */
const NOBAG = { noBag: true };
const LIB = [
  { id: 'w_quick', cat: 'kondition', icon: '⚡', title: '15-Minuten-Express', goal: 'Kurz und knackig, wenn wenig Zeit ist.', steps: [WARM[0], WARM[2], WRAP, bag(4, 120, 45, 'Kurze Pausen – bleib dran!'), COOL[0]] },
  { id: 'w_shadow', cat: 'technik', icon: '🥊', title: 'Schattenboxen', goal: '10 Minuten Technik ohne Sack.', steps: [WARM[0], WARM[1], shadow(120), shadow(120), shadow(120), COOL[0]] },
  { id: 'w_jab', cat: 'technik', icon: '1️⃣', title: 'Jab-Meister', goal: 'Nur der Jab: schnell, gerade, zurück.', known: ['stance', 'guard', 'step', 'jab'], steps: [...WARM, WRAP, bag(4, 120, 60, 'Jab hoch, Jab tief, Doppel-Jab.'), ...COOL] },
  { id: 'w_classic', cat: 'kondition', icon: '🔔', title: 'Klassische Runden', goal: '6 Runden à 2 Minuten am Sack.', steps: [...WARM, WRAP, bag(6, 120, 60, 'Klassische Boxrunden.'), ...COOL] },
  { id: 'w_tabata', cat: 'kondition', icon: '🔥', title: 'Tabata-Burnout', goal: '2 Tabata-Blöcke – maximale Kondition.', steps: [...WARM, WRAP, bag(8, 20, 10, '20 Sekunden Vollgas! Schwere Handschuhe.', { title: 'Tabata 1' }), { type: 'timed', title: 'Durchatmen', sec: 60, icon: '🌬️', cue: 'Locker gehen, tief atmen.' }, bag(8, 20, 10, 'Noch einmal alles!', { title: 'Tabata 2' }), ...COOL] },
  { id: 'w_power', cat: 'power', icon: '💥', title: 'Power-Runden', goal: 'Kräftige Kombinationen mit voller Hüfte.', minL: 5, steps: [...WARM, WRAP, bag(5, 90, 60, 'Kräftig schlagen – Hüfte drehen!'), ...COOL] },
  { id: 'w_opp', cat: 'defensive', icon: '🛡️', title: 'Gegner-Modus', goal: 'Reagiere auf Angriffe – ohne Sack.', minL: 6, steps: [...WARM, bag(5, 120, 60, 'Ich sage die Angriffe an. Verteidige und konter!', { mode: 'opponent', title: 'Gegner-Modus', ...NOBAG }), ...COOL] },
  { id: 'w_spar', cat: 'defensive', icon: '🥋', title: 'Sparring am Sack', goal: 'Gegner-Modus mit Kontern am Sack.', minL: 6, steps: [...WARM, WRAP, bag(6, 120, 60, 'Verteidigen, dann am Sack kontern!', { mode: 'opponent', title: 'Sparring am Sack' }), ...COOL] },
  { id: 'w_counter', cat: 'defensive', icon: '↩️', title: 'Konter-Spezial', goal: 'Verteidigung und sofortige Antwort.', minL: 6, steps: [...WARM, WRAP, bag(4, 120, 60, 'Jede Kombination mit Verteidigung.'), ...COOL] },
  { id: 'w_pads', cat: 'zuzweit', icon: '🎯', title: 'Pratzen zu zweit', goal: 'Mit Partner: Ansagen für Boxer und Halter.', steps: [...WARM, bag(5, 120, 60, 'Boxer schlägt, Halter hält die Pratzen.', { mode: 'pads2', title: 'Pratzen-Drill', ...NOBAG }), ...COOL] },
  { id: 'w_core', cat: 'kraft', icon: '💪', title: 'Kraft & Bauch', goal: 'Ohne Geräte: Arme, Rumpf, Beine.', steps: [...WARM, reps('Liegestütze', 3, '8–15', 'Auch auf den Knien erlaubt.'), reps('Unterarmstütz (Plank)', 3, '30 Sek.', 'Körper gerade.', { hold: 30 }), reps('Burpees', 3, '8', 'Runter, hoch, springen.'), reps('Superman', 3, '20 Sek.', 'Auf dem Bauch, Arme und Beine anheben.', { hold: 20 }), reps('Russian Twists', 3, '20', 'Oberkörper zurücklehnen, links-rechts drehen.'), ...COOL] },
  { id: 'w_pull', cat: 'kraft', icon: '🏋️', title: 'Klimmzug-Leiter', goal: 'Mehr Zugkraft für starke Haken.', need: 'bar', steps: [...WARM, reps('Klimmzug-Leiter', 5, '1 → 5', 'Satz 1: ein Klimmzug, Satz 2: zwei … bis fünf. Negative erlaubt.', { pull: 3 }), reps('An der Stange hängen', 2, '30 Sek.', 'Locker hängen, Schultern leicht runterziehen.', { hold: 30 }), ...COOL] },
  { id: 'w_speed', cat: 'technik', icon: '✊', title: 'Speed mit Knöchelhandschuhen', goal: 'Tempo und Präzision mit 70–80 % Kraft.', need: 'knuckle', steps: [...WARM, WRAP, bag(4, 120, 60, 'Schnell und genau – nicht hart!', { knuckle: true }), ...COOL] },
  { id: 'w_champ', cat: 'kondition', icon: '🏆', title: 'Championship 12', goal: '12 Runden à 3 Minuten. Nur für Fortgeschrittene!', minL: 12, steps: [...WARM, WRAP, bag(12, 180, 60, 'Championship Rounds. Teile dir die Kraft ein.'), ...COOL] },
  { id: 'w_mobility', cat: 'erholung', icon: '😌', title: 'Erholung & Mobility', goal: '10 Minuten lockere Bewegung.', steps: REGEN.steps },
  { id: 'w_stretch', cat: 'erholung', icon: '🧘', title: 'Dehnen nach dem Training', goal: '6 Minuten für Schultern, Hüfte und Unterarme.', steps: [...COOL, { type: 'timed', title: 'Hüfte dehnen', sec: 60, icon: '🧘', cue: 'Ausfallschritt, hinteres Knie am Boden, Hüfte nach vorne schieben. Nach der Hälfte wechseln.' }, { type: 'timed', title: 'Unterarme dehnen', sec: 45, icon: '✋', cue: 'Arm nach vorne, Finger sanft zu dir ziehen. Nach der Hälfte wechseln.' }] },
];
const CATS = [['all', 'Alle'], ['fav', '❤️ Favoriten'], ['mine', '⭐ Meine'], ['technik', 'Technik'], ['kondition', 'Kondition'], ['power', 'Power'], ['defensive', 'Verteidigung'], ['kraft', 'Kraft'], ['erholung', 'Erholung'], ['zuzweit', 'Zu zweit']];
const FOCI = [['technik', '🥊 Technik'], ['power', '💥 Power'], ['opponent', '🛡️ Gegner-Modus'], ['pads2', '🎯 Pratzen zu zweit'], ['speed', '✊ Speed'], ['shadow', '👤 Schattenboxen']];
function buildMyWorkout(w) {
  const noBag = w.focus === 'opponent' || w.focus === 'pads2' || w.focus === 'shadow';
  const opts = { title: w.name, ...(w.focus === 'opponent' ? { mode: 'opponent' } : {}), ...(w.focus === 'pads2' ? { mode: 'pads2' } : {}), ...(w.focus === 'speed' ? { knuckle: true } : {}), ...(noBag ? NOBAG : {}) };
  const note = { technik: 'Saubere Technik!', power: 'Kräftig schlagen – Hüfte drehen!', opponent: 'Verteidige und konter!', pads2: 'Boxer schlägt, Halter hält.', speed: 'Schnell und genau – 70–80 % Kraft.', shadow: 'Schattenboxen – in die Luft.' }[w.focus];
  return [...(w.warm ? WARM : []), ...(!noBag ? [WRAP] : []), bag(w.rounds, w.work, w.rest, note, opts), ...(w.cool ? COOL : [])];
}

function IntensityPicker({ app, compact }) {
  const { state, update } = app;
  const cur = state.settings.intensity || 'mittel';
  const OPTS = [['leicht', '🙂', 'Leicht', 'Kurze Kombis, mehr Zeit'], ['mittel', '😤', 'Mittel', 'Normales Tempo'], ['hart', '🔥', 'Hart', 'Lange Kombis, schnelle Ansagen']];
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTS.map(([v, e, l, s]) => (
        <button key={v} onClick={() => update(st => ({ ...st, settings: { ...st.settings, intensity: v } }))} className={'rounded-xl border px-2 py-2 text-center transition ' + (cur === v ? 'border-gold bg-gold/15' : 'border-white/10 bg-coal')}>
          <div className={compact ? 'text-base' : 'text-xl'}>{e}</div>
          <div className={'text-xs ' + (cur === v ? 'text-gold' : 'text-stone-200')}>{l}</div>
          {!compact && <div className="mt-0.5 text-[10px] leading-tight text-stone-500">{s}</div>}
        </button>
      ))}
    </div>
  );
}

function WorkoutsTab({ app }) {
  const { state, update, openLesson, toast } = app;
  const [cat, setCat] = useState('all');
  const [builder, setBuilder] = useState(null);
  const done = state.path.done.length;
  const favs = state.favs;
  const mine = state.myWorkouts.map(w => ({ id: w.id, cat: 'mine', icon: '⭐', title: w.name, goal: w.rounds + ' × ' + fmt(w.work) + ' · ' + (FOCI.find(f => f[0] === w.focus) || [, ''])[1], steps: buildMyWorkout(w), mine: w }));
  const all = [...mine, ...LIB];
  const list = all.filter(w => cat === 'all' ? !w.mine : cat === 'fav' ? favs.includes(w.id) : cat === 'mine' ? !!w.mine : w.cat === cat);
  const toggleFav = id => update(s => ({ ...s, favs: s.favs.includes(id) ? s.favs.filter(x => x !== id) : [...s.favs, id] }));
  const open = w => openLesson({ ...w, kind: 'workout', learns: [] });
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-400">Fertige Trainings zum Loslegen – zusätzlich zu deinen Lektionen.</p>
      <Card>
        <div className="mb-2 text-xs uppercase tracking-wider text-stone-500">Coach-Intensität</div>
        <IntensityPicker app={app} compact />
      </Card>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {CATS.map(([v, l]) => <button key={v} onClick={() => setCat(v)} className={'shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition ' + (cat === v ? 'border-gold bg-gold text-ink' : 'border-white/10 bg-anth text-stone-300')}>{l}</button>)}
      </div>
      {cat === 'mine' && <BigBtn kind="gold" onClick={() => setBuilder({ id: null, name: '', focus: 'technik', rounds: 4, work: 120, rest: 60, warm: true, cool: true })}>+ Eigenes Workout erstellen</BigBtn>}
      {list.length === 0 && <p className="py-6 text-center text-sm text-stone-500">{cat === 'fav' ? 'Tippe bei einem Workout auf ♡, um es hier zu speichern.' : cat === 'mine' ? 'Noch keine eigenen Workouts.' : 'Nichts gefunden.'}</p>}
      <div className="space-y-2.5">
        {list.map(w => {
          const steps = resolveSteps(w.steps, state.equip);
          const early = w.minL && done < w.minL;
          const missing = w.need && !state.equip[w.need];
          return (
            <div key={w.id} className="flex items-stretch gap-2">
              <button onClick={() => open(w)} className={'flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-anth p-3 text-left active:scale-[0.99] ' + (early || missing ? 'opacity-60' : '')}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-coal text-2xl">{w.icon}</span>
                <span className="flex-1">
                  <span className="block font-display text-base uppercase leading-tight text-stone-100">{w.title}</span>
                  <span className="block text-xs text-stone-400">{w.goal}</span>
                  <span className="mt-0.5 block text-[11px] text-stone-500">⏱ ca. {estMinutes(steps, 0)} Min.{early ? ' · empfohlen ab Lektion ' + w.minL : ''}{missing ? ' · braucht ' + ({ bar: 'Klimmzugstange', knuckle: 'Knöchelhandschuhe' })[w.need] : ''}</span>
                </span>
              </button>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => toggleFav(w.id)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-anth text-lg" aria-label="Favorit">{favs.includes(w.id) ? '❤️' : '♡'}</button>
                {w.mine && <button onClick={() => setBuilder(w.mine)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-anth text-sm" aria-label="Bearbeiten">✏️</button>}
              </div>
            </div>
          );
        })}
      </div>
      {cat !== 'mine' && <button onClick={() => setCat('mine')} className="w-full rounded-2xl border border-dashed border-white/20 py-4 text-sm text-stone-300">⭐ Eigenes Workout erstellen</button>}
      {builder && <WorkoutBuilder app={app} init={builder} onClose={() => setBuilder(null)} />}
    </div>
  );
}

function WorkoutBuilder({ app, init, onClose }) {
  const { update, toast } = app;
  const [w, setW] = useState(init);
  const set = patch => setW(x => ({ ...x, ...patch }));
  const save = () => {
    const name = w.name.trim() || 'Mein Workout';
    update(s => ({ ...s, myWorkouts: w.id ? s.myWorkouts.map(x => x.id === w.id ? { ...w, name } : x) : [...s.myWorkouts, { ...w, name, id: 'm' + Date.now() }] }));
    toast('Workout gespeichert'); onClose();
  };
  const del = () => { update(s => ({ ...s, myWorkouts: s.myWorkouts.filter(x => x.id !== w.id), favs: s.favs.filter(x => x !== w.id) })); onClose(); };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-anth p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-2xl uppercase text-stone-50">{w.id ? 'Workout bearbeiten' : 'Eigenes Workout'}</h3>
        <input value={w.name} onChange={e => set({ name: e.target.value })} maxLength={30} placeholder="Name, z. B. Abend-Runden" className="mt-3 w-full rounded-xl border border-white/10 bg-coal px-3 py-3 text-stone-100 outline-none focus:border-gold" />
        <div className="mt-3 text-xs uppercase tracking-wider text-stone-500">Schwerpunkt</div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {FOCI.map(([v, l]) => <button key={v} onClick={() => set({ focus: v })} className={'rounded-xl border px-3 py-2.5 text-left text-sm ' + (w.focus === v ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-300')}>{l}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stepper label="Runden" value={w.rounds} min={1} max={15} onChange={v => set({ rounds: v })} />
          <Stepper label="Arbeit" value={w.work} min={20} max={300} step={w.work < 60 ? 10 : 30} fmtv={fmt} onChange={v => set({ work: v })} />
          <Stepper label="Pause" value={w.rest} min={0} max={120} step={w.rest < 30 ? 5 : 15} fmtv={fmt} onChange={v => set({ rest: v })} />
        </div>
        <div className="mt-3 space-y-2">
          <Toggle on={w.warm} onChange={v => set({ warm: v })} label="Mit Aufwärmen (5 Min.)" />
          <Toggle on={w.cool} onChange={v => set({ cool: v })} label="Mit Dehnen am Schluss" />
        </div>
        <div className="mt-4 space-y-2">
          <BigBtn kind="gold" onClick={save}>Speichern</BigBtn>
          {w.id && <BigBtn kind="ghost" onClick={del}>Löschen</BigBtn>}
          <button onClick={onClose} className="w-full py-2 text-sm text-stone-500">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Kombi-Baukasten ---------- */
const CTOK = [['1', 'Jab', 'Jab'], ['2', 'Gerade', 'Gerade'], ['3', 'Haken', 'Haken'], ['4', 'Hint. Haken', 'hinterer Haken'], ['5', 'Aufw.-Haken', 'Aufwärtshaken'], ['6', 'Hint. Aufw.', 'hinterer Aufwärtshaken'], ['K', 'Körper', 'zum Körper'], ['S', 'Pendeln', 'Pendeln'], ['R', 'Abrollen', 'Abrollen'], ['B', 'Blocken', 'Blocken'], ['Z', 'Zurück', 'Schritt zurück'], ['P', 'Pivot', 'Pivot']];
function ComboBuilder({ app }) {
  const { state, update, toast } = app;
  const [toks, setToks] = useState([]);
  const [nums, setNums] = useState(false);
  const words = ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];
  const text = toks.map(t => { const d = CTOK.find(c => c[0] === t); const n = '123456'.indexOf(t); return nums && n >= 0 ? words[n] : d[2]; }).join(', ').replace(/^./, c => c.toUpperCase()) + (toks.length ? '!' : '');
  const save = () => { if (!toks.length) return; update(s => ({ ...s, combos: [...s.combos, { id: 'k' + Date.now(), text, on: true }] })); setToks([]); toast('Kombination gespeichert'); };
  return (
    <div className="space-y-4">
      <Card>
        <H2 sub="Tippe die Schläge in der richtigen Reihenfolge">Neue Kombination</H2>
        <div className="grid grid-cols-4 gap-1.5">
          {CTOK.map(([k, l]) => <button key={k} disabled={toks.length >= 8} onClick={() => setToks(t => [...t, k])} className="rounded-xl border border-white/10 bg-coal py-2.5 text-center active:scale-95 disabled:opacity-40"><div className="font-display text-lg text-gold">{'123456'.includes(k) ? k : '•'}</div><div className="text-[10px] leading-tight text-stone-300">{l}</div></button>)}
        </div>
        <div className="mt-3 min-h-[3rem] rounded-xl bg-ink/60 p-3 font-display text-lg uppercase text-gold">{toks.length ? text : <span className="text-sm normal-case text-stone-500">Noch leer</span>}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn kind="ghost" onClick={() => setToks(t => t.slice(0, -1))} disabled={!toks.length}>⌫ Zurück</Btn>
          <Btn kind="ghost" onClick={() => { ac(); speak(text, state.settings.rate); }} disabled={!toks.length}>🔊 Anhören</Btn>
          <Btn onClick={save} disabled={!toks.length}>Speichern</Btn>
        </div>
        <div className="mt-3"><Toggle on={nums} onChange={setNums} label="Zahlen ansagen (eins, zwei …)" /></div>
      </Card>
      <Card>
        <H2 sub="Aktive Kombinationen ruft der Coach in deinen Runden mit auf">Meine Kombinationen</H2>
        {state.combos.length === 0 ? <p className="text-sm text-stone-400">Noch keine eigenen Kombinationen.</p> : (
          <div className="space-y-2">
            {state.combos.map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-coal p-2.5">
                <span className={'flex-1 font-display text-sm uppercase ' + (c.on ? 'text-stone-100' : 'text-stone-500')}>{c.text}</span>
                <button onClick={() => { ac(); speak(c.text, state.settings.rate); }} className="px-1 text-lg" aria-label="Anhören">🔊</button>
                <Toggle on={c.on} onChange={v => update(s => ({ ...s, combos: s.combos.map(x => x.id === c.id ? { ...x, on: v } : x) }))} label="" />
                <button onClick={() => update(s => ({ ...s, combos: s.combos.filter(x => x.id !== c.id) }))} className="px-1 text-stone-500" aria-label="Löschen">🗑</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Woche & Challenges ---------- */
const weekStart = k => addDays(k, -(weekdayIdx(keyToDate(k)) - 1));
function weekData(state, start, glasses) {
  const end = addDays(start, 6);
  const L = state.log.filter(l => l.d >= start && l.d <= end);
  const w = { days: new Set(L.map(l => l.d)).size, rounds: 0, punches: 0, min: 0, opp: 0, regen: 0, lessons: 0, water: 0, pull: 0, videos: state.videoLog.filter(d => d >= start && d <= end).length, allGoals: 0 };
  L.forEach(l => { w.rounds += l.rounds || 0; w.punches += l.punches || 0; w.min += l.min || 0; if (l.opp) w.opp++; if (l.kind === 'regen' || l.cat === 'erholung') w.regen++; if (l.kind === 'lesson') w.lessons++; });
  for (let i = 0; i < 7; i++) { const r = getDay(state, addDays(start, i)); if (r.water >= glasses) w.water++; w.pull += r.pullups || 0; }
  return w;
}
const CHALLENGES = [
  { id: 'days3', icon: '📅', t: '3 Trainingstage', v: w => w.days, goal: 3 },
  { id: 'rounds10', icon: '🔔', t: '10 Sack-Runden', v: w => w.rounds, goal: 10 },
  { id: 'punch1500', icon: '🥊', t: '1500 Schläge (geschätzt)', v: w => w.punches, goal: 1500 },
  { id: 'min90', icon: '⏱', t: '90 Minuten Training', v: w => w.min, goal: 90 },
  { id: 'opp1', icon: '🛡️', t: '1× Gegner-Modus', v: w => w.opp, goal: 1, minL: 6 },
  { id: 'regen1', icon: '😌', t: '1 Erholungs-Session', v: w => w.regen, goal: 1 },
  { id: 'water5', icon: '💧', t: 'Wasserziel an 5 Tagen', v: w => w.water, goal: 5 },
  { id: 'pull30', icon: '🏋️', t: '30 Klimmzüge', v: w => w.pull, goal: 30, need: 'bar' },
  { id: 'video1', icon: '🎥', t: '1 Technik-Check per Video', v: w => w.videos, goal: 1 },
  { id: 'lesson2', icon: '📖', t: '2 Lektionen schaffen', v: w => w.lessons, goal: 2, path: true },
];
function weekChallenges(state, wk) {
  let h = 0; for (const ch of wk) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ok = CHALLENGES.filter(c => (!c.need || state.equip[c.need]) && (!c.minL || state.path.done.length >= c.minL) && (!c.path || state.path.done.length < LESSONS.length));
  const res = []; const pool = [...ok];
  while (res.length < 3 && pool.length) { h = (h * 1103515245 + 12345) >>> 0; res.push(pool.splice(h % pool.length, 1)[0]); }
  return res;
}
function ChallengesCard({ app, mini }) {
  const { state, update, tKey, d, toast, go } = app;
  const wk = weekStart(tKey);
  const w = weekData(state, wk, d.n.glasses);
  const list = weekChallenges(state, wk);
  const claimed = state.challenges[wk] || [];
  const claim = c => { update(s => ({ ...s, challenges: { ...s.challenges, [wk]: [...(s.challenges[wk] || []), c.id] } })); toast('🏅 Challenge geschafft! +50 XP'); };
  const daysLeft = 7 - weekdayIdx(keyToDate(tKey));
  return (
    <div className={'rounded-3xl border border-white/10 bg-anth p-4 ' + (mini ? 'cursor-pointer' : '')} onClick={mini ? () => go('progress') : undefined}>
      <div className="flex items-end justify-between">
        <div className="font-display text-lg uppercase tracking-wider text-stone-100">Wochen-Challenges</div>
        <div className="text-xs text-stone-500">{daysLeft === 0 ? 'letzter Tag' : 'noch ' + daysLeft + (daysLeft === 1 ? ' Tag' : ' Tage')}</div>
      </div>
      <div className="mt-3 space-y-2.5">
        {list.map(c => {
          const v = Math.min(c.v(w), c.goal), isDone = v >= c.goal, isClaimed = claimed.includes(c.id);
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2 text-sm">
                <span>{c.icon}</span><span className={'flex-1 ' + (isClaimed ? 'text-stone-500 line-through' : 'text-stone-200')}>{c.t}</span>
                {isDone && !isClaimed && !mini ? <button onClick={() => claim(c)} className="rounded-full bg-gold px-3 py-1 text-xs font-medium text-ink">+50 XP holen</button>
                  : <span className="text-xs tabular-nums text-stone-500">{isClaimed ? '✓' : Math.round(v) + '/' + c.goal}</span>}
              </div>
              <div className="mt-1"><Bar v={v / c.goal} color={isDone ? 'bg-gold' : 'bg-blood'} /></div>
            </div>
          );
        })}
      </div>
      {mini && list.some(c => c.v(w) >= c.goal && !claimed.includes(c.id)) && <div className="mt-3 text-center text-xs text-gold">🏅 Eine Challenge ist geschafft – tippen zum Abholen</div>}
    </div>
  );
}

/* ---------- Gewicht ---------- */
function WeightCard({ app }) {
  const { state, update, tKey, toast } = app;
  const W = [...state.weights].sort((a, b) => a.d < b.d ? -1 : 1);
  const last = W[W.length - 1];
  const [kg, setKg] = useState(last ? last.kg : state.profile.weight);
  const save = () => {
    const v = Math.round(kg * 10) / 10;
    update(s => ({ ...s, weights: [...s.weights.filter(x => x.d !== tKey), { d: tKey, kg: v }], profile: { ...s.profile, weight: Math.round(v) } }));
    toast('Gewicht eingetragen – Essensplan angepasst');
  };
  const pts = W.slice(-12);
  const min = Math.min(...pts.map(p => p.kg)) - 1, max = Math.max(...pts.map(p => p.kg)) + 1;
  const X = i => 24 + i * (292 / Math.max(1, pts.length - 1)), Y = v => 110 - (v - min) / (max - min || 1) * 90;
  const diff = pts.length >= 2 ? Math.round((pts[pts.length - 1].kg - pts[0].kg) * 10) / 10 : null;
  return (
    <Card>
      <H2 sub="Einmal pro Woche wiegen reicht – am besten morgens">Gewicht</H2>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center justify-between rounded-xl border border-white/10 bg-coal p-2">
          <button onClick={() => setKg(v => Math.round((v - 0.1) * 10) / 10)} className="h-9 w-9 rounded-lg bg-white/10 text-lg">−</button>
          <input type="number" inputMode="decimal" step="0.1" value={kg} onChange={e => setKg(parseFloat(e.target.value.replace(',', '.')) || 0)} className="w-20 bg-transparent text-center font-display text-2xl text-stone-50 outline-none" />
          <button onClick={() => setKg(v => Math.round((v + 0.1) * 10) / 10)} className="h-9 w-9 rounded-lg bg-white/10 text-lg">+</button>
        </div>
        <Btn onClick={save} disabled={!(kg > 20 && kg < 250)}>Eintragen</Btn>
      </div>
      {pts.length >= 2 ? (
        <div className="mt-3">
          <svg viewBox="0 0 340 130" className="w-full">
            <line x1="24" y1="110" x2="316" y2="110" stroke="rgba(255,255,255,0.1)" />
            <polyline points={pts.map((p, i) => X(i) + ',' + Y(p.kg)).join(' ')} fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.kg)} r="3.5" fill={GOLD} />)}
            <text x="24" y="126" fill="#78716c" fontSize="10">{pts[0].d.slice(8, 10) + '.' + pts[0].d.slice(5, 7) + '.'}</text>
            <text x="316" y="126" fill="#78716c" fontSize="10" textAnchor="end">{last.d.slice(8, 10) + '.' + last.d.slice(5, 7) + '.'}</text>
            <text x={X(pts.length - 1)} y={Y(last.kg) - 8} fill="#e7e3da" fontSize="11" textAnchor="end">{String(last.kg).replace('.', ',')} kg</text>
          </svg>
          <p className="text-xs text-stone-500">Seit {pts[0].d.slice(8, 10)}.{pts[0].d.slice(5, 7)}.: {diff > 0 ? '+' : ''}{String(diff).replace('.', ',')} kg</p>
        </div>
      ) : <p className="mt-2 text-xs text-stone-500">{last ? 'Ab dem zweiten Eintrag siehst du hier deine Kurve.' : 'Noch kein Eintrag.'}</p>}
    </Card>
  );
}

/* ---------- Fortschritt (Kalender, Statistik, Rekorde) ---------- */
function ProgressTab({ app, part = 'overview' }) {
  const { state, d, tKey } = app;
  const [mOff, setMOff] = useState(0);
  const base = keyToDate(tKey); const first = new Date(base.getFullYear(), base.getMonth() + mOff, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const monthName = first.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
  const logByDay = {}; state.log.forEach(l => { logByDay[l.d] = (logByDay[l.d] || 0) + (l.min || 0); });
  const weeks = []; let ws = weekStart(tKey);
  for (let i = 7; i >= 0; i--) { const s = addDays(ws, -7 * i); const e = addDays(s, 6); weeks.push({ s, min: state.log.filter(l => l.d >= s && l.d <= e).reduce((a, l) => a + (l.min || 0), 0) }); }
  const maxW = Math.max(30, ...weeks.map(w => w.min));
  const T = d.totals, B = d.best;
  const recent = [...state.log].sort((a, b) => b.t - a.t).slice(0, 6);
  return (
    <div className="space-y-4">
      {part === 'challenges' && <><ChallengesCard app={app} /><p className="px-1 text-xs text-stone-500">Jeden Montag gibt es 3 neue Challenges. Jede geschaffte Challenge bringt +50 XP.</p></>}
      {part === 'trophies' && <TrophyPanel app={app} />}
      {part === 'overview' && <>

      <div className="grid grid-cols-2 gap-2">
        {[['🥊', T.sessions, 'Trainings'], ['⏱', T.minutes, 'Minuten'], ['🔔', T.rounds, 'Runden'], ['💥', T.punches.toLocaleString('de-CH'), 'Schläge (geschätzt)']].map(([e, v, l]) => (
          <div key={l} className="rounded-2xl border border-white/10 bg-anth p-3">
            <div className="text-xl">{e}</div><div className="font-display text-2xl text-stone-50">{v}</div><div className="text-[11px] uppercase tracking-wider text-stone-500">{l}</div>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMOff(m => m - 1)} className="h-8 w-8 rounded-lg bg-white/10">‹</button>
          <div className="font-display text-lg uppercase text-stone-100">{monthName}</div>
          <button onClick={() => setMOff(m => Math.min(0, m + 1))} disabled={mOff === 0} className="h-8 w-8 rounded-lg bg-white/10 disabled:opacity-30">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-stone-500">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(x => <div key={x}>{x}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <div key={'e' + i}></div>)}
          {Array.from({ length: daysIn }).map((_, i) => {
            const k = todayKey(new Date(first.getFullYear(), first.getMonth(), i + 1));
            const trained = getDay(state, k).workout, isToday = k === tKey, future = k > tKey;
            return <div key={k} className={'flex aspect-square items-center justify-center rounded-lg text-xs ' + (trained ? 'bg-gold font-medium text-ink' : future ? 'text-stone-700' : 'bg-white/5 text-stone-400') + (isToday ? ' ring-2 ring-blood' : '')}>{i + 1}</div>;
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-stone-500"><span className="inline-block h-3 w-3 rounded bg-gold"></span> trainiert <span className="inline-block h-3 w-3 rounded ring-2 ring-blood"></span> heute</div>
      </Card>

      <Card>
        <H2 sub="Trainingsminuten der letzten 8 Wochen">Wochen-Verlauf</H2>
        <div className="flex h-32 items-end gap-1.5">
          {weeks.map((w, i) => (
            <div key={w.s} className="flex flex-1 flex-col items-center gap-1">
              <div className="text-[10px] text-stone-500">{w.min || ''}</div>
              <div className={'w-full rounded-t-md ' + (i === weeks.length - 1 ? 'bg-gold' : 'bg-blood/70')} style={{ height: Math.max(3, w.min / maxW * 90) + 'px' }}></div>
              <div className="text-[9px] text-stone-600">{w.s.slice(8, 10)}.{w.s.slice(5, 7)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <H2 sub="Schlag deine eigenen Rekorde">Bestwerte</H2>
        <div className="grid grid-cols-2 gap-2">
          {[['Längstes Training', B.min + ' Min.'], ['Meiste Runden', B.rounds], ['Meiste Schläge', B.punches], ['Längste Serie', d.longest + ' Tage']].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-coal p-3"><div className="font-display text-xl text-gold">{v}</div><div className="text-[11px] text-stone-500">{l}</div></div>
          ))}
        </div>
      </Card>


      {recent.length > 0 && (
        <Card>
          <H2>Letzte Trainings</H2>
          <div className="space-y-1.5">
            {recent.map(l => (
              <div key={l.t} className="flex items-center gap-3 border-b border-white/5 pb-1.5 text-sm">
                <span className="w-12 shrink-0 text-xs text-stone-500">{l.d.slice(8, 10)}.{l.d.slice(5, 7)}.</span>
                <span className="flex-1 truncate text-stone-200">{l.title}</span>
                <span className="shrink-0 text-xs text-stone-500">{l.min} Min.{l.punches ? ' · ' + l.punches + ' 💥' : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      </>}
    </div>
  );
}

/* ---------- Video-Check ---------- */
function VideoCheck({ app, known }) {
  const { state, update, tKey, toast } = app;
  const lefty = state.profile.hand === 'l';
  const opts = TECH_ORDER.filter(id => known.includes(id) && id !== 'knuckle');
  const [tech, setTech] = useState(opts[opts.length - 1] || null);
  const [url, setUrl] = useState(null);
  const [mirror, setMirror] = useState(true);
  const [rate, setRate] = useState(1);
  const [checks, setChecks] = useState({});
  const vref = useRef(null), fref = useRef(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (vref.current) vref.current.playbackRate = rate; }, [rate, url]);
  if (!opts.length) return null;
  const techId = opts.includes(tech) ? tech : opts[opts.length - 1];
  const T = TECH[techId];
  const items = [...T.points(lefty), 'Kein Fehler: ' + T.mistake];
  const onFile = e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (url) URL.revokeObjectURL(url); setUrl(URL.createObjectURL(f)); setChecks({}); e.target.value = ''; };
  const finish = () => { update(s => ({ ...s, videoLog: [...s.videoLog, tKey] })); toast('🎥 Video-Check gespeichert'); setUrl(null); setChecks({}); };
  return (
    <Card className="border-gold/30">
      <H2 sub="Film dich und vergleiche mit der richtigen Technik">🎥 Technik-Check per Video</H2>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {opts.map(id => <button key={id} onClick={() => { setTech(id); setChecks({}); }} className={'shrink-0 rounded-full border px-3 py-1.5 text-xs ' + (techId === id ? 'border-gold bg-gold text-ink' : 'border-white/10 bg-coal text-stone-300')}>{TECH[id].name}</button>)}
      </div>
      <input ref={fref} type="file" accept="video/*" className="hidden" onChange={onFile} />
      {!url ? (
        <div className="mt-3">
          <div className="flex items-center gap-3 rounded-2xl bg-coal p-3">
            <div className="h-20 w-20 shrink-0"><Illu img={T.img} lefty={lefty} className="h-20 w-20" /></div>
            <p className="text-sm text-stone-300">Stell das iPhone so hin, dass du ganz zu sehen bist. Film 20–30 Sekunden «{T.name}».</p>
          </div>
          <div className="mt-3"><BigBtn kind="gold" onClick={() => fref.current && fref.current.click()}>🎥 Video aufnehmen oder wählen</BigBtn></div>
          <p className="mt-2 text-center text-[11px] text-stone-500">Das Video bleibt auf deinem iPhone – es wird nirgends hochgeladen.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <video ref={vref} src={url} controls playsInline loop className="w-full rounded-2xl bg-black" style={{ transform: mirror ? 'scaleX(-1)' : 'none' }} />
          <div className="flex flex-wrap items-center gap-1.5">
            {[0.25, 0.5, 1].map(r => <button key={r} onClick={() => setRate(r)} className={'rounded-lg border px-3 py-1.5 text-xs ' + (rate === r ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-stone-400')}>{String(r).replace('.', ',')}×</button>)}
            <button onClick={() => setMirror(m => !m)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stone-400">⇋ Spiegeln</button>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-coal p-3">
            <div className="h-24 w-24 shrink-0"><Illu img={T.img} lefty={lefty} className="h-24 w-24" /></div>
            <div className="text-xs text-stone-400">So soll es aussehen. Schau dein Video in Zeitlupe und hake ab, was schon klappt.</div>
          </div>
          <div className="space-y-2">{items.map((it, i) => <Check key={i} checked={!!checks[i]} label={it} onChange={() => setChecks(c => ({ ...c, [i]: !c[i] }))} />)}</div>
          <p className="text-center text-sm text-stone-300">{Object.values(checks).filter(Boolean).length} von {items.length} Punkten passen{Object.values(checks).filter(Boolean).length === items.length ? ' – perfekt! 🔥' : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            <BigBtn kind="ghost" onClick={() => fref.current && fref.current.click()}>Neues Video</BigBtn>
            <BigBtn kind="gold" onClick={finish}>Check fertig</BigBtn>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Einkaufsliste ---------- */
const RAW = { rice: [0.4, 'Reis (trocken)'], pasta: [0.45, 'Vollkornpasta (trocken)'], lentils: [0.4, 'Linsen (trocken)'], chicken: [1.3, 'Pouletbrust (roh)'], salmon: [1.25, 'Lachs (roh)'], beef: [1.3, 'Rindshackfleisch mager (roh)'], sweet: [1.1, 'Süsskartoffeln'], potato: [1.05, 'Kartoffeln'] };
const SHOP_GROUPS = [['🍗 Eiweiss', ['chicken', 'salmon', 'beef', 'tuna', 'egg', 'quark', 'skyr', 'yog', 'milk', 'lentils']], ['🍚 Kohlenhydrate', ['oats', 'bread', 'rice', 'pasta', 'potato', 'sweet', 'ricecake', 'honey']], ['🥦 Obst & Gemüse', ['banana', 'berries', 'veg', 'tomato', 'avo']], ['🥜 Fett', ['nuts', 'oil']]];
function weekShopping(n) {
  const sum = {};
  for (let d = 1; d <= 7; d++) {
    const rest = d >= 6;
    const T = { p: n.prot, f: n.fat, c: rest ? Math.round(n.carbs * 0.75) : n.carbs };
    MEALS_PLAN.forEach((m, i) => {
      const v = m.variants[(d + i) % 3];
      const share = rest && m.id === 'snack' ? { p: 0.1, c: 0.12, f: 0.08 } : m.share;
      const r = solveMeal(v, { p: T.p * share.p, c: T.c * share.c, f: T.f * share.f });
      Object.entries(r.g).forEach(([k, g]) => { sum[k] = (sum[k] || 0) + g; });
    });
  }
  return sum;
}
function shopAmount(k, g) {
  const F = FOODS[k];
  if (k === 'egg' || k === 'banana' || k === 'ricecake') return Math.ceil(g / F.unit) + ' Stk';
  if (k === 'bread') return Math.ceil(g / F.unit) + ' Scheiben (≈ ' + Math.ceil(g / 500) + ' Brot)';
  if (k === 'oil') return '≈ ' + Math.ceil(g / 10) * 10 + ' ml';
  if (k === 'tuna') return Math.ceil(g / 130) + ' Dosen';
  if (k === 'milk') return (Math.ceil(g / 250) * 0.25).toString().replace('.', ',') + ' l';
  const raw = RAW[k] ? g * RAW[k][0] : g;
  const r = Math.ceil(raw / 50) * 50;
  return r >= 1000 ? (Math.round(r / 100) / 10).toString().replace('.', ',') + ' kg' : r + ' g';
}
function ShoppingList({ app }) {
  const { state, update, d, tKey, toast } = app;
  const wk = weekStart(tKey);
  const sum = useMemo(() => weekShopping(d.n), [d.n.prot, d.n.fat, d.n.carbs]);
  const checked = state.shop[wk] || {};
  const toggle = k => update(s => ({ ...s, shop: { [wk]: { ...(s.shop[wk] || {}), [k]: !(s.shop[wk] || {})[k] } } }));
  const name = k => RAW[k] ? RAW[k][1] : FOODS[k].n.replace(/ \(.*\)$/, '');
  const text = SHOP_GROUPS.map(([g, ks]) => g + '\n' + ks.filter(k => sum[k]).map(k => '- ' + name(k) + ': ' + shopAmount(k, sum[k])).join('\n')).join('\n\n');
  const copy = async () => { try { await navigator.clipboard.writeText('Einkaufsliste Fight Camp\n\n' + text); toast('Liste kopiert ✓'); } catch (e) { toast('Kopieren nicht möglich'); } };
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-400">Für eine Woche nach deinem Essensplan ({state.profile.weight} kg, 5 Trainingstage + 2 Ruhetage). Fleisch und Beilagen sind als Einkaufsmenge angegeben (roh/trocken).</p>
      {SHOP_GROUPS.map(([g, ks]) => (
        <Card key={g}>
          <div className="mb-2 font-display text-lg uppercase tracking-wider text-stone-100">{g}</div>
          <div className="space-y-1.5">
            {ks.filter(k => sum[k]).map(k => (
              <button key={k} onClick={() => toggle(k)} className="flex w-full items-center gap-3 border-b border-white/5 pb-1.5 text-left text-sm">
                <span className={'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ' + (checked[k] ? 'border-gold bg-gold text-ink' : 'border-white/30')}>{checked[k] ? '✓' : ''}</span>
                <span className={'flex-1 ' + (checked[k] ? 'text-stone-500 line-through' : 'text-stone-200')}>{name(k)}</span>
                <span className={'shrink-0 font-display ' + (checked[k] ? 'text-stone-600' : 'text-stone-50')}>{shopAmount(k, sum[k])}</span>
              </button>
            ))}
          </div>
        </Card>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <BigBtn kind="gold" onClick={copy}>📋 Kopieren</BigBtn>
        <BigBtn kind="ghost" onClick={() => update(s => ({ ...s, shop: { [wk]: {} } }))}>Haken löschen</BigBtn>
      </div>
      <p className="text-xs text-stone-500">Tipp: Kopieren und in die Notizen oder Erinnerungen einfügen. Mengen sind grob aufgerundet.</p>
    </div>
  );
}

/* ---------- Home-Extras ---------- */
function HomeExtras({ app }) {
  const { state, go, tKey, d } = app;
  const W = [...state.weights].sort((a, b) => a.d < b.d ? -1 : 1);
  const last = W[W.length - 1];
  const needWeigh = !d.n.minor && (!last || last.d <= addDays(tKey, -7));
  return (
    <div className="space-y-3">
      <ChallengesCard app={app} mini />
      {needWeigh && (
        <button onClick={() => go('weight')} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-anth p-3 text-left">
          <span className="text-2xl">⚖️</span><span className="flex-1"><span className="block text-sm text-stone-100">Zeit zum Wiegen</span><span className="block text-xs text-stone-500">Damit dein Essensplan zu dir passt</span></span><span className="text-stone-500">›</span>
        </button>
      )}
    </div>
  );
}

/* =====================================================================
   NEUE STRUKTUR: Startbildschirm mit Ring-Szene, 4 Bereiche mit Unterreitern
   ===================================================================== */

function RingScene({ lefty }) {
  const body = '#18181b', rim = 'rgba(212,175,55,0.55)';
  return (
    <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="rsSpot" cx="50%" cy="0%" r="90%">
          <stop offset="0%" stopColor="#fff6dc" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#d4af37" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rsFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b1518" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </linearGradient>
        <radialGradient id="rsGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rsGlove" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2343e" />
          <stop offset="100%" stopColor="#7a0c12" />
        </linearGradient>
      </defs>
      <rect width="400" height="440" fill="#070708" />
      {/* Publikum / Hintergrund-Lichter */}
      {Array.from({ length: 26 }).map((_, i) => <circle key={i} cx={(i * 61) % 400} cy={40 + ((i * 37) % 120)} r={i % 3 ? 1.2 : 2} fill="#d4af37" opacity={0.08 + (i % 4) * 0.04} />)}
      <polygon points="200,-20 40,360 360,360" fill="url(#rsSpot)" />
      {/* Ringboden */}
      <polygon points="30,300 370,300 430,440 -30,440" fill="url(#rsFloor)" />
      <ellipse cx="200" cy="352" rx="170" ry="36" fill="url(#rsGlow)" />
      {/* Eckpfosten */}
      <rect x="26" y="168" width="10" height="138" rx="3" fill="#b3121b" />
      <rect x="364" y="168" width="10" height="138" rx="3" fill="#d4af37" />
      {/* hintere Seile */}
      {[188, 218, 248].map(y => <line key={y} x1="31" y1={y} x2="369" y2={y} stroke="#e7e3da" strokeOpacity="0.22" strokeWidth="2.5" />)}
      {/* Boxer */}
      <g transform={(lefty ? 'translate(400 0) scale(-1 1) ' : '') + 'translate(200 356) scale(0.84) translate(-200 -356)'}>
        <ellipse cx="200" cy="356" rx="74" ry="10" fill="#000" opacity="0.65" />
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 3;0 0" dur="1.6s" repeatCount="indefinite" />
          {/* Beine */}
          <path d="M178 290 L160 322 L150 350" fill="none" stroke={body} strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M222 290 L236 322 L244 350" fill="none" stroke={body} strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M178 290 L160 322 L150 350" fill="none" stroke={rim} strokeWidth="1.2" />
          <ellipse cx="146" cy="353" rx="18" ry="8" fill="#0d0d0f" stroke="#e7e3da" strokeOpacity="0.5" />
          <ellipse cx="249" cy="353" rx="18" ry="8" fill="#0d0d0f" stroke="#e7e3da" strokeOpacity="0.5" />
          {/* Hose */}
          <path d="M160 236 L240 236 L250 292 L208 300 L200 272 L192 300 L150 292 Z" fill="#b3121b" />
          <rect x="159" y="232" width="82" height="10" rx="2" fill="#d4af37" />
          {/* Oberkörper */}
          <path d="M156 156 Q200 142 244 156 L238 236 Q200 246 162 236 Z" fill={body} stroke={rim} strokeWidth="1.4" />
          <path d="M184 176 Q200 182 216 176 M200 182 L200 226" fill="none" stroke="#e7e3da" strokeOpacity="0.07" strokeWidth="2" />
          <rect x="190" y="136" width="20" height="18" rx="5" fill={body} />
          {/* Kopf */}
          <ellipse cx="200" cy="116" rx="22" ry="26" fill={body} stroke={rim} strokeWidth="1.4" />
          {/* Arme */}
          <path d="M160 160 L146 206 L170 146" fill="none" stroke={body} strokeWidth="19" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M240 160 L256 202 L234 128" fill="none" stroke={body} strokeWidth="19" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M240 160 L256 202" fill="none" stroke={rim} strokeWidth="1.2" />
          {/* Handschuhe */}
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 0;-5 -10;0 0;0 0" keyTimes="0;0.6;0.68;0.76;1" dur="3.2s" repeatCount="indefinite" />
            <ellipse cx="234" cy="122" rx="18" ry="21" fill="url(#rsGlove)" />
            <ellipse cx="228" cy="113" rx="6" ry="8" fill="#fff" opacity="0.18" />
            <rect x="222" y="138" width="24" height="9" rx="3" fill="#e7e3da" opacity="0.85" />
          </g>
          <ellipse cx="170" cy="136" rx="18" ry="21" fill="url(#rsGlove)" />
          <ellipse cx="164" cy="127" rx="6" ry="8" fill="#fff" opacity="0.18" />
          <rect x="158" y="152" width="24" height="9" rx="3" fill="#e7e3da" opacity="0.85" />
        </g>
      </g>
      {/* vordere Seile */}
      <line x1="-10" y1="318" x2="410" y2="318" stroke="#b3121b" strokeWidth="5" />
      <line x1="-10" y1="350" x2="410" y2="350" stroke="#e7e3da" strokeOpacity="0.85" strokeWidth="5" />
      <line x1="-10" y1="382" x2="410" y2="382" stroke="#b3121b" strokeWidth="5" />
      <rect x="0" y="405" width="400" height="35" fill="#7a0c12" />
      <text x="200" y="428" textAnchor="middle" fill="#d4af37" fontSize="15" fontFamily="Oswald, 'Avenir Next Condensed', sans-serif" letterSpacing="6">FIGHT · CAMP</text>
    </svg>
  );
}

function loadPhoto(file, cb, onErr) {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1000, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); onErr && onErr(); };
    img.src = url;
  } catch (e) { onErr && onErr(); }
}

function StartScene({ app }) {
  const { state, update, d, go, toast } = app;
  const fref = useRef(null);
  const [menu, setMenu] = useState(false);
  const lefty = state.profile.hand === 'l';
  const nextL = LESSONS.find(l => !state.path.done.includes(l.id));
  const knownN = state.path.done.length ? knownUpTo(Math.max(...state.path.done.map(lessonIndex))).filter(x => TECH[x]).length : 0;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const W = [...state.weights].sort((a, b) => a.d < b.d ? -1 : 1);
  const BTN = [
    { side: 'l', top: '17%', icon: '🥊', label: 'Training', sub: nextL ? 'Lektion ' + (lessonIndex(nextL.id) + 1) + ' · Workouts' : 'Workouts · Timer', to: 'training' },
    { side: 'l', top: '50%', icon: '📖', label: 'Technik', sub: knownN + ' Techniken · Video', to: 'technik' },
    { side: 'r', top: '17%', icon: '🥦', label: 'Körper', sub: 'Essen · ' + (W.length ? String(W[W.length - 1].kg).replace('.', ',') + ' kg' : 'Gewicht'), to: 'body' },
    { side: 'r', top: '50%', icon: '🏆', label: 'Fortschritt', sub: d.rank.name + ' · ' + d.xp + ' XP', to: 'progress' },
  ];
  return (
    <div className="relative -mx-4 overflow-hidden" style={{ height: 'min(120vw, 480px)' }}>
      {state.heroImg ? <img src={state.heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} /> : <RingScene lefty={lefty} />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.75) 0%, rgba(10,10,10,0) 22%, rgba(10,10,10,0) 70%, rgba(10,10,10,1) 100%)' }}></div>
      <div className="absolute left-4 right-4 top-3 flex items-start justify-between">
        <div>
          <div className="text-xs text-stone-300">{greet},</div>
          <div className="font-display text-2xl uppercase leading-none text-white" style={{ textShadow: '0 2px 8px #000' }}>{state.profile.name || 'Champion'}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl leading-none text-white" style={{ textShadow: '0 2px 8px #000' }}>{d.streak}🔥</div>
          <div className="text-[9px] uppercase tracking-wider text-stone-300">Tage am Stück</div>
        </div>
      </div>
      {BTN.map(b => (
        <button key={b.label} onClick={() => go(b.to)} className={'absolute w-[28%] rounded-2xl border border-gold/40 bg-ink/75 px-1.5 py-2.5 text-center shadow-lg backdrop-blur-md transition active:scale-95 ' + (b.side === 'l' ? 'left-3' : 'right-3')} style={{ top: b.top }}>
          <div className="text-2xl leading-none">{b.icon}</div>
          <div className="mt-1 font-display text-[13px] uppercase tracking-wide text-gold">{b.label}</div>
          <div className="mt-0.5 text-[10px] leading-tight text-stone-400">{b.sub}</div>
        </button>
      ))}
      <button onClick={() => setMenu(m => !m)} className="absolute bottom-14 right-3 rounded-full border border-white/10 bg-ink/70 px-3 py-1.5 text-[11px] text-stone-300 backdrop-blur">📷 {state.heroImg ? 'Bild ändern' : 'Eigenes Bild'}</button>
      {menu && (
        <div className="absolute bottom-24 right-3 z-10 w-52 rounded-2xl border border-white/10 bg-anth p-1.5 shadow-xl">
          <button onClick={() => { setMenu(false); fref.current && fref.current.click(); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-stone-200">📷 Foto auswählen</button>
          {state.heroImg && <button onClick={() => { setMenu(false); update(s => ({ ...s, heroImg: null })); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-stone-200">🥊 Zurück zum Boxer im Ring</button>}
          <button onClick={() => setMenu(false)} className="w-full rounded-xl px-3 py-2 text-left text-xs text-stone-500">Abbrechen</button>
        </div>
      )}
      <input ref={fref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files && e.target.files[0]; if (f) loadPhoto(f, url => { update(s => ({ ...s, heroImg: url })); toast('Startbild gespeichert'); }, () => toast('Bild konnte nicht geladen werden')); e.target.value = ''; }} />
    </div>
  );
}

function Seg({ items, value, onChange }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 bg-ink/95 px-4 py-2 backdrop-blur" style={{ top: 0 }}>
      <div className="flex gap-1 rounded-2xl border border-white/10 bg-anth p-1">
        {items.map(([v, l]) => (
          <button key={v} onClick={() => { onChange(v); window.scrollTo({ top: 0 }); }} className={'flex-1 rounded-xl px-1 py-2 text-[12px] font-medium leading-tight transition ' + (value === v ? 'bg-gold text-ink' : 'text-stone-400')}>{l}</button>
        ))}
      </div>
    </div>
  );
}
const AreaTitle = ({ icon, title, sub }) => (
  <div className="mb-1">
    <div className="font-display text-3xl uppercase leading-tight text-stone-50">{icon} {title}</div>
    {sub && <p className="text-sm text-stone-400">{sub}</p>}
  </div>
);

function TrainingTab({ app, sub, setSub, focusWarmup }) {
  const { state, openLesson, startRegen, today, tKey } = app;
  const nextL = LESSONS.find(l => !state.path.done.includes(l.id));
  return (
    <div>
      <AreaTitle icon="🥊" title="Training" sub="Lektionen, fertige Workouts, Timer und Trainingsplan" />
      <Seg value={sub} onChange={setSub} items={[['lessons', 'Lektionen'], ['workouts', 'Workouts'], ['timer', 'Timer'], ['camp', 'Fight Camp']]} />
      {sub === 'lessons' && (
        <div className="space-y-4">
          {nextL ? (
            <button onClick={() => openLesson(nextL)} className="flex w-full items-center gap-3 rounded-3xl border border-blood/50 bg-gradient-to-br from-blood/35 to-anth p-4 text-left">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blood font-display text-2xl text-white">{lessonIndex(nextL.id) + 1}</span>
              <span className="flex-1"><span className="block text-[11px] uppercase tracking-[0.2em] text-gold">Nächste Lektion</span><span className="block font-display text-xl uppercase leading-tight text-stone-50">{nextL.title}</span><span className="block text-xs text-stone-400">{nextL.goal}</span></span>
              <span className="font-display text-2xl text-white">▶</span>
            </button>
          ) : <div className="rounded-3xl border border-gold/40 bg-gold/10 p-4 text-center font-display uppercase text-gold">Alle 24 Lektionen geschafft 🏆</div>}
          <button onClick={startRegen} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-anth p-3 text-left">
            <span className="text-2xl">😌</span><span className="flex-1"><span className="block text-sm text-stone-100">Erholungstag (10 Min.)</span><span className="block text-xs text-stone-500">Locker bewegen zwischen den Lektionen</span></span><span className="text-stone-500">›</span>
          </button>
          <PathView app={app} />
        </div>
      )}
      {sub === 'workouts' && <WorkoutsTab app={app} />}
      <div className={sub === 'timer' ? '' : 'hidden'}><TimerPanel app={app} /></div>
      <div className={sub === 'camp' ? '' : 'hidden'}><PlanPanel app={app} focusWarmup={focusWarmup} /></div>
    </div>
  );
}

function TechnikTab({ app, sub, setSub }) {
  return (
    <div>
      <AreaTitle icon="📖" title="Technik" sub="Schläge lernen, dich filmen, eigene Kombis, Hände schützen" />
      <Seg value={sub} onChange={setSub} items={[['tech', 'Techniken'], ['video', 'Video-Check'], ['combos', 'Kombis'], ['schutz', 'Schutz & Regeln']]} />
      {sub === 'combos' ? <ComboBuilder app={app} /> : <LearnTab app={app} part={sub} />}
    </div>
  );
}

function BodyTab({ app, sub, setSub }) {
  return (
    <div>
      <AreaTitle icon="🥦" title="Körper" sub="Essen, Trinken, Schlaf und Gewicht" />
      <Seg value={sub} onChange={setSub} items={[['food', 'Essen'], ['shop', 'Einkauf'], ['drink', 'Trinken & Schlaf'], ['weight', 'Gewicht']]} />
      {sub === 'food' && <FoodPanel app={app} section="food" />}
      {sub === 'shop' && <ShoppingList app={app} />}
      {sub === 'drink' && <FoodPanel app={app} section="drink" />}
      {sub === 'weight' && <div className="space-y-4"><WeightCard app={app} /><p className="px-1 text-xs text-stone-500">Wenn du dein Gewicht einträgst, passt sich dein Essensplan automatisch an.</p></div>}
    </div>
  );
}

function ProgressHub({ app, sub, setSub }) {
  return (
    <div>
      <AreaTitle icon="🏆" title="Fortschritt" sub="Was du schon geschafft hast" />
      <Seg value={sub} onChange={setSub} items={[['overview', 'Übersicht'], ['challenges', 'Challenges'], ['trophies', 'Ränge & Trophäen']]} />
      <ProgressTab app={app} part={sub} />
    </div>
  );
}

function SettingsPage({ app, onBack }) {
  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-2 text-sm text-stone-400">← Zurück</button>
      <AreaTitle icon="⚙️" title="Einstellungen" />
      <div className="mt-3"><SettingsPanel app={app} /></div>
    </div>
  );
}

/* =====================================================================
   VOLLBILD-START, SCHNELLAKTIONEN, PLAN-KALENDER, SCHWIERIGKEIT
   ===================================================================== */

const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const fmtKg = v => String(Math.round(v * 10) / 10).replace('.', ',');
const shortDate = k => k.slice(8, 10) + '.' + k.slice(5, 7) + '.';

/* ---------- Schwierigkeit aus Feedback ---------- */
const scaleWork = (w, adj) => w <= 30 ? w : clamp(w + adj * 15, 45, 300);
const scaleRest = (r, adj) => r <= 15 ? r : clamp(r - adj * 10, 20, 120);
function applyFeedback(st, v) {
  const adj = clamp((st.path.adjust || 0) + v, -2, 3);
  const order = ['leicht', 'mittel', 'hart'];
  let inten = st.settings.intensity || 'mittel';
  let i = order.indexOf(inten);
  if (v > 0 && adj >= 2 && i < 2) i++;
  if (v < 0 && adj <= -1 && i > 0) i--;
  inten = order[i];
  return { st: { ...st, path: { ...st.path, adjust: adj }, settings: { ...st.settings, intensity: inten } }, adj, inten, changedInt: inten !== st.settings.intensity };
}
function feedbackMsg(v, adj, inten, changedInt) {
  if (v === 0) return '👍 Passt – das Niveau bleibt so.';
  const r = adj > 0 ? '+' + adj + ' Runde' + (adj > 1 ? 'n' : '') : adj < 0 ? adj + ' Runde' + (adj < -1 ? 'n' : '') : 'normale Rundenzahl';
  const t = adj !== 0 ? ', Runden ' + (adj > 0 ? Math.abs(adj) * 15 + ' Sek. länger' : Math.abs(adj) * 15 + ' Sek. kürzer') : '';
  return (v > 0 ? '💪 Nächstes Mal härter: ' : '😌 Nächstes Mal leichter: ') + r + t + (changedInt ? ', Coach «' + inten + '»' : '') + '.';
}

/* ---------- Planung ---------- */
function planDays(state, from, count) {
  const days = (state.plan && state.plan.days) || [1, 3, 5];
  const done = state.path.done;
  let idx = LESSONS.findIndex(l => !done.includes(l.id));
  const t = todayKey();
  const res = {};
  for (let i = 0; i < count; i++) {
    const k = addDays(from, i);
    const wd = weekdayIdx(keyToDate(k));
    const isTrain = days.includes(wd);
    if (k < t) {
      const L = state.log.filter(l => l.d === k);
      res[k] = L.length ? { type: 'past', items: L } : { type: 'none', train: isTrain };
      continue;
    }
    if (k === t && getDay(state, k).workout) { res[k] = { type: 'done', items: state.log.filter(l => l.d === k), train: isTrain }; continue; }
    if (isTrain) {
      if (idx >= 0 && idx < LESSONS.length) { res[k] = { type: 'lesson', lesson: LESSONS[idx], train: true }; idx++; }
      else res[k] = { type: 'camp', train: true };
    } else {
      const prevTrain = days.includes(wd === 1 ? 7 : wd - 1);
      res[k] = prevTrain ? { type: 'regen', train: false } : { type: 'free', train: false };
    }
  }
  return res;
}
function weighTarget(state, k) {
  const W = [...state.weights].sort((a, b) => a.d < b.d ? -1 : 1);
  if (!W.length || state.profile.age < 18) return null;
  const first = W[0];
  const weeks = Math.max(0, (keyToDate(k) - keyToDate(first.d)) / (7 * 864e5));
  const rate = state.profile.goal === 'cut' ? -0.006 : state.profile.goal === 'aufbau' ? 0.0025 : 0;
  return rate === 0 ? first.kg : first.kg * Math.pow(1 + rate, weeks);
}
function mealsFor(d, k, isTrain) {
  const n = d.n, rest = !isTrain, wd = weekdayIdx(keyToDate(k));
  const T = { p: n.prot, f: n.fat, c: rest ? Math.round(n.carbs * 0.75) : n.carbs };
  return MEALS_PLAN.map((m, i) => {
    const v = m.variants[(wd + i) % 3];
    const share = rest && m.id === 'snack' ? { p: 0.1, c: 0.12, f: 0.08 } : m.share;
    const r = solveMeal(v, { p: T.p * share.p, c: T.c * share.c, f: T.f * share.f });
    return { m, v, ...r, title: rest && m.restTitle ? m.restTitle : m.title };
  });
}

function DayMeals({ app, k, isTrain }) {
  const { d } = app;
  const [open, setOpen] = useState(null);
  const meals = mealsFor(d, k, isTrain);
  const kcal = Math.round(meals.reduce((a, x) => a + x.tot.kcal, 0));
  return (
    <div>
      <div className="mb-2 text-xs text-stone-500">{isTrain ? '🥊 Trainingstag' : '😌 Ruhetag'} · ≈ {kcal} kcal</div>
      <div className="space-y-1.5">
        {meals.map((x, i) => (
          <div key={x.m.id} className="rounded-xl bg-coal">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
              <span className="flex-1"><span className="block text-[10px] uppercase tracking-wider text-blood">{x.title}</span><span className="block text-sm text-stone-100">{x.v.name}</span></span>
              <span className="text-xs text-stone-500">{Math.round(x.tot.kcal)} kcal</span>
              <span className="text-stone-500">{open === i ? '▾' : '▸'}</span>
            </button>
            {open === i && (
              <ul className="space-y-1 px-3 pb-3">
                {x.v.items.map(([fk]) => <li key={fk} className="flex justify-between gap-3 text-xs"><span className="text-stone-400">{FOODS[fk].n}</span><span className="shrink-0 text-stone-100">{fmtAmount(fk, x.g[fk])}</span></li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Bottom-Sheet ---------- */
function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-anth p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20"></div>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-2xl uppercase text-stone-50">{title}</h3><button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="Schliessen">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function SleepPicker({ app, onDone }) {
  const { today, updateToday, state } = app;
  return (
    <div>
      <p className="mb-3 text-sm text-stone-400">Wie viele Stunden hast du letzte Nacht geschlafen?</p>
      <div className="grid grid-cols-4 gap-2">
        {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(h => (
          <button key={h} onClick={() => { updateToday(r => ({ ...r, sleep: h })); onDone && onDone(); }} className={'rounded-xl border py-3 text-sm ' + (today.sleep === h ? 'border-gold bg-gold text-ink' : 'border-white/10 bg-coal text-stone-200')}>{String(h).replace('.', ',')} h</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-stone-500">Ziel: ab {state.goals.sleepH || 7} Stunden.</p>
    </div>
  );
}

/* ---------- Vollbild-Start ---------- */
function StartScreen({ app }) {
  const { state, update, d, today, tKey, updateToday, go, openLesson, startRegen, toast, claimReward } = app;
  const [sheet, setSheet] = useState(null);
  const [reward, setReward] = useState(null);
  const fref = useRef(null);
  const plan = planDays(state, tKey, 1)[tKey];
  const nextL = LESSONS.find(l => !state.path.done.includes(l.id));
  const G = state.goals;
  const goals = [
    ...(G.train ? [{ id: 'train', icon: '🥊', label: 'Training', done: today.workout }] : []),
    ...(G.water ? [{ id: 'water', icon: '💧', label: 'Trinken', done: today.water >= d.n.glasses }] : []),
    ...(G.food ? [{ id: 'food', icon: '🥦', label: 'Gesund essen', done: NUT_ITEMS.every(i => today.nut[i.id]) }] : []),
    ...(G.sleep ? [{ id: 'sleep', icon: '😴', label: 'Schlafen', done: today.sleep != null }] : []),
    ...G.custom.map(c => ({ id: c.id, icon: c.emoji, label: c.label, done: !!(today.custom || {})[c.id], custom: true })),
  ];
  const doneN = goals.filter(g => g.done).length, allDone = goals.length > 0 && doneN === goals.length;
  const W = [...state.weights].sort((a, b) => a.d < b.d ? -1 : 1);
  const lastW = W[W.length - 1];
  const nutN = NUT_ITEMS.filter(i => today.nut[i.id]).length;

  const session = plan.type === 'lesson' ? { title: 'Heutige Session starten', sub: 'Lektion ' + (lessonIndex(plan.lesson.id) + 1) + ': ' + plan.lesson.title + ' · ca. ' + estMinutes(resolveSteps(plan.lesson.steps, state.equip), state.path.adjust || 0) + ' Min.', act: () => openLesson(plan.lesson) }
    : plan.type === 'regen' ? { title: 'Heutige Session: Erholung', sub: '10 Min. locker bewegen', act: startRegen }
      : plan.type === 'camp' ? { title: 'Heutige Session starten', sub: 'Fight Camp: Klassische Runden', act: () => openLesson({ ...LIB.find(w => w.id === 'w_classic'), kind: 'workout', learns: [] }) }
        : plan.type === 'done' ? { title: '✓ Heute erledigt', sub: 'Stark! Noch Lust auf ein Workout?', act: () => go('workouts'), done: true }
          : { title: 'Heute ist frei 🛋', sub: nextL ? 'Trotzdem trainieren? Lektion ' + (lessonIndex(nextL.id) + 1) + ': ' + nextL.title : 'Trotzdem trainieren? Zu den Workouts', act: () => nextL ? openLesson(nextL) : go('workouts'), free: true };

  const QUICK = [
    { icon: '💧', label: 'Trinken', sub: (today.water * 0.25).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' / ' + fmtKg(d.n.liters) + ' l', done: today.water >= d.n.glasses, act: () => { updateToday(r => ({ ...r, water: r.water + 1 })); toast('💧 +1 Glas (' + ((today.water + 1) * 0.25).toFixed(2).replace('.', ',') + ' l)'); } },
    { icon: '⚖️', label: 'Gewicht', sub: lastW && lastW.d === tKey ? fmtKg(lastW.kg) + ' kg ✓' : 'eintragen', done: lastW && lastW.d === tKey, act: () => setSheet('weight') },
    { icon: '😴', label: 'Schlaf', sub: today.sleep != null ? String(today.sleep).replace('.', ',') + ' h' : 'eintragen', done: today.sleep != null, act: () => setSheet('sleep') },
    { icon: '🥦', label: 'Essen', sub: nutN + ' / 5', done: nutN === 5, act: () => setSheet('food') },
    { icon: '📅', label: 'Plan', sub: 'Woche', act: () => go('plan') },
  ];

  return (
    <div className="relative -mx-4 -mt-4 overflow-hidden" style={{ height: 'calc(100dvh - 68px - env(safe-area-inset-bottom))', minHeight: 560 }}>
      {state.heroImg ? <img src={state.heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 25%' }} /> : <RingScene lefty={state.profile.hand === 'l'} />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0) 20%, rgba(10,10,10,0) 42%, rgba(10,10,10,0.9) 72%, rgba(10,10,10,1) 100%)' }}></div>

      {/* Kopfzeile */}
      <div className="absolute inset-x-0 top-0 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="font-display text-xl uppercase leading-none tracking-[0.12em] text-stone-100">Fight<span className="text-blood">·</span><span className="text-gold">Camp</span></div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => fref.current && fref.current.click()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-ink/60 backdrop-blur" aria-label="Startbild ändern">📷</button>
            <button onClick={() => go('trophy')} className="rounded-full border border-gold/40 bg-ink/60 px-3 py-1.5 text-xs text-gold backdrop-blur">{d.rank.name}</button>
            <button onClick={() => go('settings')} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-ink/60 backdrop-blur" aria-label="Einstellungen">⚙️</button>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs text-stone-300">{new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Hallo' : 'Guten Abend'},</div>
            <div className="font-display text-3xl uppercase leading-none text-white" style={{ textShadow: '0 2px 10px #000' }}>{state.profile.name || 'Champion'}</div>
          </div>
          <div className="text-right"><div className="font-display text-2xl leading-none text-white" style={{ textShadow: '0 2px 10px #000' }}>{d.streak}🔥</div><div className="text-[9px] uppercase tracking-wider text-stone-300">Tage am Stück</div></div>
        </div>
      </div>
      <input ref={fref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files && e.target.files[0]; if (f) loadPhoto(f, url => { update(s => ({ ...s, heroImg: url })); toast('Startbild gespeichert – nur auf diesem iPhone'); }, () => toast('Bild konnte nicht geladen werden')); e.target.value = ''; }} />

      {/* Unterer Bereich */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="mb-2.5 flex items-center gap-2">
          <button onClick={() => setSheet('goals')} className="flex items-center gap-2 rounded-full border border-white/15 bg-ink/70 px-3 py-1.5 text-xs text-stone-200 backdrop-blur">
            🎯 Ziele heute <span className={doneN === goals.length ? 'text-gold' : 'text-stone-400'}>{doneN}/{goals.length}</span>
          </button>
          {allDone && !today.claimed && <button onClick={() => { const r = claimReward(); setReward(r || 'xp'); setSheet('reward'); }} className="animate-pulse rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-ink">🎁 Belohnung abholen</button>}
          {today.claimed && <span className="text-xs text-stone-500">🎁 abgeholt</span>}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {QUICK.map(q => (
            <button key={q.label} onClick={q.act} className={'relative rounded-2xl border px-1 py-2 text-center backdrop-blur-md transition active:scale-95 ' + (q.done ? 'border-gold/60 bg-gold/15' : 'border-white/15 bg-ink/70')}>
              {q.done && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] text-ink">✓</span>}
              <div className="text-2xl leading-none">{q.icon}</div>
              <div className="mt-1 text-[11px] font-medium text-stone-100">{q.label}</div>
              <div className="text-[9px] leading-tight text-stone-400">{q.sub}</div>
            </button>
          ))}
        </div>
        <button onClick={session.act} className={'mt-3 w-full rounded-2xl px-4 py-4 text-left shadow-xl transition active:scale-[0.98] ' + (session.done ? 'border border-gold/50 bg-ink/80 backdrop-blur' : session.free ? 'border border-white/20 bg-ink/80 backdrop-blur' : 'bg-blood')}>
          <div className="flex items-center gap-3">
            <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ' + (session.done ? 'bg-gold/20 text-gold' : session.free ? 'bg-white/10' : 'bg-white/20 text-white')}>{session.done ? '✓' : session.free ? '🛋' : '▶'}</span>
            <span className="flex-1">
              <span className={'block font-display text-xl uppercase leading-tight ' + (session.done ? 'text-gold' : 'text-white')}>{session.title}</span>
              <span className="block text-xs text-white/75">{session.sub}</span>
            </span>
          </div>
        </button>
      </div>

      {sheet === 'weight' && <Sheet title="Gewicht" onClose={() => setSheet(null)}><WeightCard app={app} /></Sheet>}
      {sheet === 'sleep' && <Sheet title="Schlaf" onClose={() => setSheet(null)}><SleepPicker app={app} onDone={() => { setSheet(null); toast('😴 Schlaf eingetragen'); }} /></Sheet>}
      {sheet === 'food' && (
        <Sheet title="Essen heute" onClose={() => setSheet(null)}>
          <DayMeals app={app} k={tKey} isTrain={!!plan.train || plan.type === 'done'} />
          <div className="mt-4 mb-2 text-xs uppercase tracking-wider text-stone-500">Gesund-essen-Checkliste</div>
          <div className="space-y-2">{NUT_ITEMS.map(i => <Check key={i.id} checked={!!today.nut[i.id]} label={i.label} sub={i.sub} xp={4} onChange={() => updateToday(r => ({ ...r, nut: { ...r.nut, [i.id]: !r.nut[i.id] } }))} />)}</div>
        </Sheet>
      )}
      {sheet === 'goals' && (
        <Sheet title="Ziele heute" onClose={() => setSheet(null)}>
          <div className="space-y-2">
            {goals.map(g => (
              <Check key={g.id} checked={g.done} label={g.icon + ' ' + g.label} onChange={() => {
                if (g.custom) updateToday(r => ({ ...r, custom: { ...(r.custom || {}), [g.id]: !(r.custom || {})[g.id] } }));
                else if (g.id === 'water') updateToday(r => ({ ...r, water: r.water + 1 }));
                else if (g.id === 'sleep') setSheet('sleep');
                else if (g.id === 'food') setSheet('food');
                else if (g.id === 'train') { setSheet(null); session.act(); }
              }} />
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Alle Ziele geschafft = Tagesbelohnung + 25 XP.</p>
          <div className="mt-3"><BigBtn kind="ghost" onClick={() => setSheet('editgoals')}>✏️ Ziele anpassen</BigBtn></div>
        </Sheet>
      )}
      {sheet === 'editgoals' && <GoalsEditor app={app} onClose={() => setSheet(null)} />}
      {sheet === 'reward' && (
        <Sheet title="Tagesbelohnung" onClose={() => setSheet(null)}>
          {reward && reward !== 'xp' ? <RewardCard r={reward} /> : <p className="text-stone-300">+25 XP – du hast alle Belohnungen gesammelt!</p>}
        </Sheet>
      )}
    </div>
  );
}

/* ---------- Plan-Kalender ---------- */
function PlanTab({ app }) {
  const { state, update, d, tKey, openLesson, startRegen, go } = app;
  const [wOff, setWOff] = useState(0);
  const [sel, setSel] = useState(tKey);
  const [weighOpen, setWeighOpen] = useState(false);
  const days = (state.plan && state.plan.days) || [1, 3, 5];
  const start = addDays(weekStart(tKey), wOff * 7);
  const horizonFrom = start < tKey ? start : tKey;
  const span = Math.max(7, Math.round((keyToDate(addDays(start, 7)) - keyToDate(horizonFrom)) / 864e5));
  const plan = planDays(state, horizonFrom, span + 1);
  const toggleDay = wd => update(s => {
    const cur = (s.plan && s.plan.days) || [1, 3, 5];
    const nd = cur.includes(wd) ? cur.filter(x => x !== wd) : [...cur, wd].sort();
    return nd.length ? { ...s, plan: { ...(s.plan || {}), days: nd } } : s;
  });
  const p = plan[sel] || { type: 'none' };
  const isTrain = p.type === 'lesson' || p.type === 'camp' || p.type === 'done' || p.type === 'past' || !!p.train;
  const wEntry = state.weights.find(w => w.d === sel);
  const target = weighTarget(state, sel);
  const weighDay = weekdayIdx(keyToDate(sel)) === 1;
  const icon = q => !q ? '' : q.type === 'lesson' ? '🥊' : q.type === 'camp' ? '🔔' : q.type === 'regen' ? '😌' : q.type === 'done' || q.type === 'past' ? '✅' : q.type === 'none' && q.train ? '✖️' : '·';
  const label = q => q.type === 'lesson' ? 'Lektion ' + (lessonIndex(q.lesson.id) + 1) + ': ' + q.lesson.title : q.type === 'camp' ? 'Fight Camp: Klassische Runden' : q.type === 'regen' ? 'Erholung (10 Min., freiwillig)' : q.type === 'free' ? 'Frei – Pause machen' : q.type === 'done' || q.type === 'past' ? q.items.map(x => x.title).join(', ') || 'Trainiert' : q.train ? 'Training verpasst' : 'Frei';
  return (
    <div className="space-y-4">
      <AreaTitle icon="📅" title="Plan" sub="Training, Essen und Gewicht für jeden Tag" />
      <Card>
        <div className="mb-2 flex items-end justify-between"><div className="text-xs uppercase tracking-wider text-stone-500">Deine Trainingstage</div><div className="text-[11px] text-stone-500">{days.length}× pro Woche</div></div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_SHORT.map((n, i) => <button key={n} onClick={() => toggleDay(i + 1)} className={'rounded-lg border py-2 text-xs ' + (days.includes(i + 1) ? 'border-gold bg-gold/20 text-gold' : 'border-white/10 text-stone-500')}>{n}</button>)}
        </div>
        <p className="mt-2 text-[11px] text-stone-500">Für Anfänger: 3 Tage mit Pause dazwischen. Am Tag danach ist eine kurze Erholung eingeplant.</p>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => setWOff(w => w - 1)} className="h-9 w-9 rounded-lg bg-white/10">‹</button>
          <div className="text-sm text-stone-200">{shortDate(start)} – {shortDate(addDays(start, 6))}{wOff === 0 ? ' · diese Woche' : ''}</div>
          <button onClick={() => setWOff(w => Math.min(w + 1, 8))} className="h-9 w-9 rounded-lg bg-white/10">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const k = addDays(start, i), q = plan[k], isSel = k === sel, isToday = k === tKey;
            const hasW = state.weights.some(w => w.d === k);
            return (
              <button key={k} onClick={() => setSel(k)} className={'flex flex-col items-center rounded-xl border py-2 transition ' + (isSel ? 'border-gold bg-gold/15' : 'border-white/10 bg-anth') + (isToday ? ' ring-2 ring-blood' : '')}>
                <span className="text-[10px] uppercase text-stone-500">{DAY_SHORT[i]}</span>
                <span className={'font-display text-lg leading-tight ' + (isSel ? 'text-gold' : 'text-stone-100')}>{+k.slice(8, 10)}</span>
                <span className="text-sm leading-none">{icon(q)}</span>
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: hasW ? GOLD : 'transparent' }}></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="font-display text-xl uppercase text-stone-100">{keyToDate(sel).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</div>

      <Card>
        <div className="mb-2 text-xs uppercase tracking-wider text-stone-500">🥊 Training</div>
        <div className="text-base text-stone-100">{label(p)}</div>
        {sel === tKey && p.type === 'lesson' && <div className="mt-3"><BigBtn onClick={() => openLesson(p.lesson)}>▶ Jetzt starten</BigBtn></div>}
        {sel === tKey && p.type === 'regen' && <div className="mt-3"><BigBtn kind="gold" onClick={startRegen}>▶ Erholung starten</BigBtn></div>}
        {sel === tKey && p.type === 'camp' && <div className="mt-3"><BigBtn onClick={() => openLesson({ ...LIB.find(w => w.id === 'w_classic'), kind: 'workout', learns: [] })}>▶ Jetzt starten</BigBtn></div>}
        {sel > tKey && p.type === 'lesson' && <p className="mt-1 text-xs text-stone-500">Ca. {estMinutes(resolveSteps(p.lesson.steps, state.equip), state.path.adjust || 0)} Min. · {p.lesson.goal}</p>}
      </Card>

      <Card>
        <div className="mb-2 text-xs uppercase tracking-wider text-stone-500">🥦 Mahlzeiten</div>
        <DayMeals key={sel} app={app} k={sel} isTrain={isTrain} />
        <button onClick={() => go('food')} className="mt-3 text-xs text-stone-400">Essensplan anpassen (Gewicht, Ziel) ›</button>
      </Card>

      <Card>
        <div className="mb-2 text-xs uppercase tracking-wider text-stone-500">⚖️ Gewicht</div>
        {wEntry ? <div className="text-base text-stone-100">{fmtKg(wEntry.kg)} kg eingetragen ✓</div>
          : sel <= tKey ? <div className="text-sm text-stone-400">{weighDay ? 'Wiegetag' : 'Kein Eintrag'}{sel === tKey ? '' : ''}</div>
            : <div className="text-sm text-stone-400">{weighDay ? 'Wiegetag (montags)' : 'Kein Wiegetag'}</div>}
        {target && weighDay && !wEntry && sel >= tKey && <div className="mt-1 text-xs text-stone-500">Richtwert laut deinem Ziel: ≈ {fmtKg(target)} kg</div>}
        {sel === tKey && !wEntry && <div className="mt-3"><BigBtn kind="ghost" onClick={() => setWeighOpen(true)}>Gewicht eintragen</BigBtn></div>}
      </Card>
      {weighOpen && <Sheet title="Gewicht" onClose={() => setWeighOpen(false)}><WeightCard app={app} /></Sheet>}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error(err); } catch (e) { } }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#e7e3da', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: 56 }}>🥊</div>
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 26, textTransform: 'uppercase', color: '#d4af37', marginTop: 12 }}>Kurzer K.o.</div>
        <p style={{ marginTop: 8, color: '#a8a29e', maxWidth: 320 }}>Da ist etwas schiefgelaufen. Dein Fortschritt ist gespeichert. Tippe auf den Knopf, um weiterzumachen.</p>
        <button onClick={() => { try { location.reload(); } catch (e) { this.setState({ err: null }); } }} style={{ marginTop: 20, background: '#b3121b', color: '#fff', border: 0, borderRadius: 16, padding: '14px 28px', fontFamily: 'Oswald, sans-serif', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }}>Weitermachen</button>
        <p style={{ marginTop: 16, fontSize: 11, color: '#57534e' }}>{String(this.state.err && this.state.err.message || '').slice(0, 120)}</p>
      </div>
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
