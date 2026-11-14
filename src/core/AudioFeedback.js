/**
 * AudioFeedback — synthetic interface tones generated in real time with
 * Tone.js (loaded globally from the CDN). Every call is a no-op when Tone is
 * unavailable or audio is muted, so the app never depends on sound.
 */
let synth = null;
let muted = false;
let started = false;

const tone = () => globalThis.Tone;

/** Must be called from a user gesture (browser autoplay policy). */
export async function unlockAudio() {
  if (started || !tone()) return;
  try {
    await tone().start();
    synth = new (tone().PolySynth)(tone().Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.05, release: 0.12 },
      volume: -14,
    }).toDestination();
    started = true;
  } catch {
    synth = null;
  }
}

export function setMuted(value) { muted = value; }
export function isMuted() { return muted; }

function play(notes, duration = '32n', gap = 0.07) {
  if (muted || !synth) return;
  const now = tone().now();
  notes.forEach((n, i) => synth.triggerAttackRelease(n, duration, now + i * gap));
}

export const sfx = {
  click: () => play(['C6']),
  toggle: () => play(['E5', 'A5']),
  waypoint: () => play(['A5', 'E6']),
  route: () => play(['C5', 'E5', 'G5', 'C6']),
  blocked: () => play(['D4', 'C#4'], '16n', 0.1),
  caution: () => play(['A4', 'A4'], '16n', 0.16),
  danger: () => play(['F#5', 'C5', 'F#5', 'C5'], '16n', 0.13),
  emergency: () => play(['C6', 'G5', 'C6', 'G5', 'C6', 'G5'], '16n', 0.11),
  arrive: () => play(['G5', 'C6', 'E6'], '8n', 0.12),
};
