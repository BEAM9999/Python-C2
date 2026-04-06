const FEMALE_HINTS = [
  "female",
  "woman",
  "girl",
  "zira",
  "aria",
  "jenny",
  "samantha",
  "sonya",
  "sara",
  "ava",
  "libby",
  "natasha",
  "premwadee",
  "heami",
  "noelle",
  "catherine",
  "jessa",
  "kimberly",
  "kendra",
  "salli",
  "ruth",
  "microsoft th-premwadee",
];

const MALE_HINTS = [
  "male",
  "man",
  "boy",
  "pattara",
  "พัทรา",
  "niwat",
  "นิวัฒน์",
  "david",
  "mark",
  "guy",
  "tony",
  "arthur",
  "james",
  "thomas",
  "daniel",
  "ryan",
  "benjamin",
  "george",
  "gordon",
  "liam",
  "matthew",
  "ravi",
  "diego",
  "microsoft th-niwat",
];

let cachedVoices = [];
let initialized = false;
const listeners = new Set();

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function classifyVoice(voice) {
  const sample = normalizeToken(`${voice?.name || ""} ${voice?.voiceURI || ""}`);

  if (FEMALE_HINTS.some((hint) => sample.includes(hint))) {
    return "female";
  }

  if (MALE_HINTS.some((hint) => sample.includes(hint))) {
    return "male";
  }

  return "other";
}

function getVoiceIdentity(voice, index) {
  return voice.voiceURI || `${voice.name || "voice"}:${voice.lang || "unknown"}:${index}`;
}

function rawVoices() {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

function toVoiceSummary(voice, index) {
  return {
    voiceURI: getVoiceIdentity(voice, index),
    name: voice.name || `Voice ${index + 1}`,
    lang: voice.lang || "unknown",
    localService: Boolean(voice.localService),
    default: Boolean(voice.default),
    gender: classifyVoice(voice),
  };
}

function notifyVoiceListeners() {
  const summaries = getSpeechVoices();
  listeners.forEach((listener) => listener(summaries));
}

function loadVoices() {
  cachedVoices = rawVoices();
  notifyVoiceListeners();
  return cachedVoices;
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function findVoiceByURI(voiceURI) {
  const voices = rawVoices();
  return voices.find((voice, index) => getVoiceIdentity(voice, index) === voiceURI) || null;
}

export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function initializeSpeech(onVoicesChanged) {
  if (!isSpeechSupported()) {
    onVoicesChanged?.([]);
    return () => {};
  }

  if (!initialized) {
    const handleVoicesChanged = () => {
      loadVoices();
    };

    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    } else {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }

    initialized = true;
    queueMicrotask(loadVoices);
    setTimeout(loadVoices, 0);
    setTimeout(loadVoices, 350);
  }

  if (typeof onVoicesChanged === "function") {
    listeners.add(onVoicesChanged);
    onVoicesChanged(getSpeechVoices());
  }

  return () => {
    if (typeof onVoicesChanged === "function") {
      listeners.delete(onVoicesChanged);
    }
  };
}

export function getSpeechVoices() {
  return cachedVoices.map((voice, index) => toVoiceSummary(voice, index));
}

export function refreshSpeechVoices() {
  loadVoices();
  return getSpeechVoices();
}

export function cancelSpeech() {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakText({ text, voiceURI, rate = 1, pitch = 1, volume = 1, onStart, onEnd, onError }) {
  if (!isSpeechSupported()) {
    return false;
  }

  const cleanedText = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText) {
    return false;
  }

  cancelSpeech();

  const utterance = new SpeechSynthesisUtterance(cleanedText);
  const voice = findVoiceByURI(voiceURI);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || "th-TH";
  } else {
    utterance.lang = "th-TH";
  }

  utterance.rate = clamp(rate, 0.75, 1.25, 1);
  utterance.pitch = clamp(pitch, 0.8, 1.2, 1);
  utterance.volume = clamp(volume, 0.4, 1, 1);
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = (event) => onError?.(event);

  window.speechSynthesis.speak(utterance);
  return true;
}