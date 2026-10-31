// Sons do jogo, gerados na hora com a Web Audio API (sem arquivos de áudio):
// efeitos (dados rolando, soldado posto, conquista…) e trilhas originais de marcha
// militar em loop, que se alternam.

type Prefs = { sfx: boolean; music: boolean };
const PREFS_KEY = "dominio-audio";

let prefs: Prefs = { sfx: true, music: true };
try {
  const saved = localStorage.getItem(PREFS_KEY);
  if (saved) prefs = { ...prefs, ...(JSON.parse(saved) as Partial<Prefs>) };
} catch {
  // armazenamento indisponível: usa o padrão
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // sem problema: a preferência só não fica salva
  }
}

let ctx: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Chamar num toque do usuário: o navegador só libera o som depois de uma interação. */
export function unlockAudio(): void {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  if (prefs.music) startMusic();
}

document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});

export const sfxOn = () => prefs.sfx;
export const musicOn = () => prefs.music;

export function toggleSfx(): void {
  prefs.sfx = !prefs.sfx;
  savePrefs();
}

export function toggleMusic(): void {
  prefs.music = !prefs.music;
  savePrefs();
  if (prefs.music) {
    unlockAudio();
  } else {
    stopMusic();
  }
}

// ---- instrumentos ----

function env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseHit(
  out: AudioNode,
  t: number,
  opts: { freq: number; q?: number; type?: BiquadFilterType; peak: number; decay: number },
) {
  const ac = ctx!;
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ac.createBiquadFilter();
  filter.type = opts.type ?? "bandpass";
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1;
  const gain = ac.createGain();
  env(gain, t, opts.peak, 0.002, opts.decay);
  src.connect(filter).connect(gain).connect(out);
  src.start(t, Math.random() * 0.5, opts.decay + 0.05);
}

function tone(
  out: AudioNode,
  t: number,
  opts: {
    freq: number;
    to?: number;
    type?: OscillatorType;
    peak: number;
    attack?: number;
    decay: number;
  },
) {
  const ac = ctx!;
  const osc = ac.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.decay);
  const gain = ac.createGain();
  env(gain, t, opts.peak, opts.attack ?? 0.005, opts.decay);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + (opts.attack ?? 0.005) + opts.decay + 0.05);
}

/** Metal (trompete/trompa): dois "dentes de serra" desafinados num filtro que abre. */
function brass(out: AudioNode, t: number, freq: number, dur: number, peak = 0.35) {
  const ac = ctx!;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.linearRampToValueAtTime(2600, t + 0.06);
  filter.frequency.linearRampToValueAtTime(1300, t + Math.min(dur, 0.4));
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.04);
  gain.gain.setValueAtTime(peak * 0.8, t + Math.max(0.05, dur - 0.08));
  gain.gain.linearRampToValueAtTime(0.0001, t + dur);
  filter.connect(gain).connect(out);
  for (const detune of [-7, 7]) {
    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

const kick = (out: AudioNode, t: number, peak = 0.9) =>
  tone(out, t, { freq: 130, to: 42, peak, decay: 0.22 });

function snare(out: AudioNode, t: number, peak = 0.5) {
  noiseHit(out, t, { freq: 2200, q: 0.7, peak, decay: 0.12 });
  tone(out, t, { freq: 190, to: 150, type: "triangle", peak: peak * 0.5, decay: 0.07 });
}

function timpani(out: AudioNode, t: number, freq: number, peak = 0.7) {
  tone(out, t, { freq: freq * 1.02, to: freq, peak, decay: 1.1 });
  tone(out, t, { freq: freq * 1.5, to: freq * 1.49, peak: peak * 0.25, decay: 0.6 });
  noiseHit(out, t, { freq: 300, type: "lowpass", peak: peak * 0.4, decay: 0.08 });
}

// ---- efeitos ----

function play(fn: (ac: AudioContext, t: number) => void) {
  if (!prefs.sfx) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  fn(ac, ac.currentTime + 0.01);
}

export const sfx = {
  /** Dados rolando: batidas na mesa e o chacoalhar, acalmando até parar. */
  dice(count = 2, duration = 0.85) {
    play((_, t) => {
      const hits = 8 + count * 5;
      let at = t;
      for (let i = 0; i < hits; i++) {
        const progress = i / hits;
        at += 0.012 + Math.random() * 0.05 * (0.4 + progress * 1.6);
        if (at > t + duration) break;
        const peak = 0.55 * (1 - progress * 0.75);
        noiseHit(sfxBus, at, {
          freq: 1800 + Math.random() * 3200,
          q: 4 + Math.random() * 6,
          peak,
          decay: 0.02 + Math.random() * 0.03,
        });
        if (Math.random() < 0.3) {
          tone(sfxBus, at, { freq: 140 + Math.random() * 90, peak: peak * 0.45, decay: 0.05 });
        }
      }
      // os dados param
      for (let d = 0; d < count; d++) {
        const end = t + duration - 0.05 + d * 0.04;
        noiseHit(sfxBus, end, { freq: 2600, q: 6, peak: 0.35, decay: 0.03 });
        tone(sfxBus, end, { freq: 170, peak: 0.25, decay: 0.06 });
      }
    });
  },
  /** Soldadinho posto no mapa: "toc" de peça de madeira. */
  place() {
    play((_, t) => {
      tone(sfxBus, t, { freq: 820, to: 420, type: "triangle", peak: 0.35, decay: 0.08 });
      noiseHit(sfxBus, t, { freq: 3000, q: 3, peak: 0.15, decay: 0.02 });
    });
  },
  /** Ataque declarado: rufar curto e bumbo. */
  attack() {
    play((_, t) => {
      for (let i = 0; i < 6; i++) snare(sfxBus, t + i * 0.045, 0.18 + i * 0.05);
      kick(sfxBus, t + 0.3, 0.8);
    });
  },
  /** Conquista: toque de clarim. */
  conquer() {
    play((_, t) => {
      brass(sfxBus, t, 392, 0.14, 0.25);
      brass(sfxBus, t + 0.15, 523, 0.14, 0.25);
      brass(sfxBus, t + 0.3, 659, 0.4, 0.28);
      snare(sfxBus, t + 0.3, 0.3);
    });
  },
  /** Defesa segurou: pancada seca. */
  hold() {
    play((_, t) => {
      kick(sfxBus, t, 0.6);
      noiseHit(sfxBus, t, { freq: 900, peak: 0.25, decay: 0.15 });
    });
  },
  /** Carta: papel deslizando. */
  card() {
    play((_, t) => {
      noiseHit(sfxBus, t, { freq: 5000, type: "highpass", peak: 0.3, decay: 0.12 });
      noiseHit(sfxBus, t + 0.06, { freq: 3500, q: 2, peak: 0.15, decay: 0.08 });
    });
  },
  /** Troca de cartas: cartas + acorde de metais. */
  trade() {
    play((_, t) => {
      for (let i = 0; i < 3; i++) {
        noiseHit(sfxBus, t + i * 0.07, { freq: 5000, type: "highpass", peak: 0.25, decay: 0.08 });
      }
      for (const f of [294, 370, 440]) brass(sfxBus, t + 0.25, f, 0.6, 0.15);
    });
  },
  /** Passa a vez: chamada de trompa. */
  turn() {
    play((_, t) => {
      brass(sfxBus, t, 294, 0.18, 0.18);
      brass(sfxBus, t + 0.2, 440, 0.45, 0.2);
    });
  },
  /** Jogador eliminado: estrondo grave. */
  eliminated() {
    play((_, t) => {
      tone(sfxBus, t, { freq: 90, to: 30, peak: 0.9, decay: 1.4 });
      noiseHit(sfxBus, t, { freq: 400, type: "lowpass", peak: 0.6, decay: 1 });
      timpani(sfxBus, t + 0.35, 73, 0.6);
    });
  },
  /** Vitória: fanfarra. */
  victory() {
    play((_, t) => {
      const notes: [number, number, number][] = [
        [392, 0, 0.18],
        [392, 0.2, 0.18],
        [392, 0.4, 0.18],
        [523, 0.6, 0.6],
        [466, 1.25, 0.2],
        [523, 1.5, 0.2],
        [587, 1.75, 0.2],
        [659, 2.0, 1.2],
      ];
      for (const [f, at, dur] of notes) brass(sfxBus, t + at, f, dur, 0.28);
      for (const at of [0.6, 2.0]) {
        timpani(sfxBus, t + at, 98, 0.7);
        kick(sfxBus, t + at, 0.6);
      }
    });
  },
  /** Toque leve em botões. */
  click() {
    play((_, t) => tone(sfxBus, t, { freq: 1200, peak: 0.08, decay: 0.03 }));
  },
};

// ---- música: trilhas originais de marcha militar ----

/** Nota (ex.: "D4", "Bb3", "C#4") → frequência em Hz. */
function hz(note: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(note);
  if (!m) throw new Error(`nota inválida: ${note}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"];
  const semis = base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

type Play = (out: AudioNode, t: number, step: number) => void;
interface Track {
  name: string;
  bpm: number;
  /** Passos de semicolcheia no loop inteiro. */
  steps: number;
  events: Map<number, Play[]>;
}

function track(name: string, bpm: number, bars: number): Track {
  return { name, bpm, steps: bars * 16, events: new Map() };
}

function at(tr: Track, step: number, fn: Play) {
  const list = tr.events.get(step) ?? [];
  list.push(fn);
  tr.events.set(step, list);
}

/** Melodia: lista de [nota ou "-" (pausa), duração em semicolcheias]. */
function melody(
  tr: Track,
  start: number,
  notes: [string, number][],
  voice: (out: AudioNode, t: number, f: number, dur: number) => void,
) {
  let step = start;
  for (const [note, len] of notes) {
    if (note !== "-") {
      const f = hz(note);
      at(tr, step, (out, t, s) => voice(out, t, f, len * s * 0.92));
    }
    step += len;
  }
}

/** "Marcha" — caixa militar, bumbo, baixo e clarins (ré menor, 108 bpm). */
function marchTrack(): Track {
  const tr = track("Marcha", 108, 8);
  const snarePattern = [1, 0, 0, 0, 0.6, 0, 0.5, 0.6, 1, 0, 0, 0, 0.6, 0, 0.5, 0.6];
  const bassRoots = ["D2", "A1", "Bb1", "A1", "D2", "G1", "A1", "D2"];
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 16;
    snarePattern.forEach((v, i) => {
      if (v) at(tr, b + i, (out, t) => snare(out, t, 0.32 * v));
    });
    // rufar no fim de cada 4 compassos
    if (bar % 4 === 3) {
      for (let i = 12; i < 16; i++)
        at(tr, b + i, (out, t, s) => {
          snare(out, t, 0.25);
          snare(out, t + s / 2, 0.2);
        });
    }
    at(tr, b, (out, t) => kick(out, t, 0.8));
    at(tr, b + 8, (out, t) => kick(out, t, 0.7));
    const root = hz(bassRoots[bar]!);
    for (let q = 0; q < 4; q++) {
      const f = q % 2 === 0 ? root : root * 1.5;
      at(tr, b + q * 4, (out, t, s) =>
        tone(out, t, { freq: f, type: "triangle", peak: 0.35, decay: s * 3.5 }),
      );
    }
  }
  // prettier-ignore
  melody(
    tr,
    0,
    [
      ["D4", 4], ["D4", 2], ["D4", 2], ["A4", 8],
      ["F4", 4], ["E4", 2], ["D4", 2], ["E4", 8],
      ["F4", 4], ["F4", 2], ["G4", 2], ["A4", 4], ["Bb4", 4],
      ["A4", 12], ["-", 4],
      ["D5", 4], ["C5", 2], ["Bb4", 2], ["A4", 8],
      ["G4", 4], ["F4", 2], ["G4", 2], ["A4", 8],
      ["E4", 4], ["F4", 2], ["G4", 2], ["E4", 4], ["C#4", 4],
      ["D4", 12], ["-", 4],
    ],
    (out, t, f, dur) => brass(out, t, f, dur, 0.22),
  );
  return tr;
}

/** "Avanço" — tímpanos, acordes graves de metais e chamadas de trompa (84 bpm). */
function advanceTrack(): Track {
  const tr = track("Avanço", 84, 8);
  const chords = [
    ["D3", "F3", "A3"],
    ["C3", "E3", "G3"],
    ["Bb2", "D3", "F3"],
    ["A2", "C#3", "E3"],
  ];
  const timp = [hz("D2"), hz("A1")];
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 16;
    // tímpanos em colcheias: D D A D
    [0, 0, 1, 0, 0, 0, 1, 1].forEach((which, i) => {
      at(tr, b + i * 2, (out, t) => timpani(out, t, timp[which]!, i % 4 === 0 ? 0.55 : 0.32));
    });
    if (bar % 2 === 0) {
      const chord = chords[(bar / 2) % chords.length]!;
      at(tr, b, (out, t, s) => {
        for (const n of chord) brass(out, t, hz(n), s * 30, 0.08);
      });
    }
    // rufar crescente antes da virada
    if (bar % 4 === 3) {
      for (let i = 0; i < 16; i++) at(tr, b + i, (out, t) => snare(out, t, 0.05 + i * 0.018));
    } else {
      at(tr, b + 4, (out, t) => snare(out, t, 0.25));
      at(tr, b + 12, (out, t) => snare(out, t, 0.25));
    }
  }
  // prettier-ignore
  melody(
    tr,
    32,
    [
      ["A3", 4], ["D4", 4], ["F4", 8],
      ["E4", 16],
    ],
    (out, t, f, dur) => brass(out, t, f, dur, 0.2),
  );
  // prettier-ignore
  melody(
    tr,
    96,
    [
      ["A3", 4], ["D4", 4], ["F4", 4], ["A4", 4],
      ["G4", 8], ["E4", 8],
    ],
    (out, t, f, dur) => brass(out, t, f, dur, 0.2),
  );
  return tr;
}

const TRACKS = [marchTrack, advanceTrack];
/** Cada trilha toca algumas vezes antes de trocar para a próxima. */
const LOOPS_PER_TRACK = 3;

let scheduler: number | null = null;

function startMusic() {
  const ac = audio();
  if (!ac || scheduler !== null) return;
  let trackIndex = Math.floor(Math.random() * TRACKS.length);
  let current = TRACKS[trackIndex]!();
  let loops = 0;
  let step = 0;
  let nextTime = ac.currentTime + 0.1;

  scheduler = window.setInterval(() => {
    const stepDur = 60 / current.bpm / 4;
    while (nextTime < ac.currentTime + 0.2) {
      for (const fn of current.events.get(step) ?? []) fn(musicBus, nextTime, stepDur);
      nextTime += stepDur;
      step++;
      if (step >= current.steps) {
        step = 0;
        loops++;
        if (loops >= LOOPS_PER_TRACK) {
          loops = 0;
          trackIndex = (trackIndex + 1) % TRACKS.length;
          current = TRACKS[trackIndex]!();
          nextTime += 0.6; // pequena pausa entre as trilhas
        }
      }
    }
  }, 50);
}

function stopMusic() {
  if (scheduler !== null) {
    clearInterval(scheduler);
    scheduler = null;
  }
}
