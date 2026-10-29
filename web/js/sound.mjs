/** Synthesized short, quiet chibi effects; no remote audio assets. */
let context;
let enabled = true;
export function toggleSound() { enabled = !enabled; return enabled; }
export function isSoundEnabled() { return enabled; }
export function playSound(kind = 'fire', intensity = 1) {
  if (!enabled) return;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    context ||= new Ctor();
    if (context.state === 'suspended') context.resume();
    const t = context.currentTime;
    const osc = context.createOscillator(); const gain = context.createGain();
    osc.connect(gain); gain.connect(context.destination);
    osc.type = kind === 'fire' ? 'triangle' : 'sine';
    const base = kind === 'fire' ? 210 : 270;
    osc.frequency.setValueAtTime(base + intensity * 75, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'fire' ? 75 : 120, t + 0.15);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.start(t); osc.stop(t + 0.2);
  } catch { /* autoplay blocked or disabled device: visual interaction still works */ }
}
