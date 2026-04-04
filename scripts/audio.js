let audioContext;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({ frequency, duration, type = "sine", gain = 0.03, slideTo }) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const now = ctx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    osc.frequency.linearRampToValueAtTime(slideTo, now + duration);
  }

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(amp).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

export function playClick() {
  playTone({ frequency: 440, duration: 0.08, type: "triangle", gain: 0.022, slideTo: 560 });
}

export function playSuccess() {
  playTone({ frequency: 520, duration: 0.12, type: "triangle", gain: 0.028, slideTo: 660 });
  setTimeout(() => playTone({ frequency: 660, duration: 0.15, type: "triangle", gain: 0.028, slideTo: 820 }), 90);
}

export function playFail() {
  playTone({ frequency: 230, duration: 0.16, type: "sawtooth", gain: 0.03, slideTo: 170 });
}
