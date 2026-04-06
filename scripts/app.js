import { DEFAULT_AVATAR, MAX_HEARTS, MODEL_OPTIONS, STAGE_BUFFER } from "./data.js";
import { playClick, playFail, playSuccess } from "./audio.js";
import { probeModel, requestAnswerEvaluation } from "./gemini.js";
import { cancelSpeech, initializeSpeech, isSpeechSupported, refreshSpeechVoices, speakText } from "./speech.js";
import {
  analyzeDraftAnswer,
  buildReviewRecord,
  calculateLevel,
  compareStepAnswer,
  getCurrentStep,
  getStageById,
  nextHeartsAfterFailure,
} from "./lesson-engine.js";
import { createStage } from "./stage-generator.js";
import { loadState, saveState } from "./storage.js";

const DEFAULT_STATE = {
  profileName: "",
  profileAvatar: DEFAULT_AVATAR,
  playerId: "",
  curriculumSeed: createCurriculumSeed(),
  askedForProfile: false,
  screen: "map",
  hearts: MAX_HEARTS,
  gems: 0,
  xp: 0,
  wins: 0,
  losses: 0,
  apiKeys: [""],
  preferredModel: MODEL_OPTIONS[0],
  modelStatuses: {},
  stageCatalog: [],
  completedStageIds: [],
  activeStageId: null,
  activeStepIndex: 0,
  reviewDeck: [],
  teacherJournal: [],
  stageAttempts: {},
  draftAnswers: {},
  lessonFeedback: { type: "", text: "" },
  generationBusy: false,
  generationError: "",
  lastCampaignMessage: "",
  speechSettingsVersion: 3,
  speechAutoRead: false,
  speechVoiceFilter: "all",
  speechVoiceURI: "",
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
};

function createCurriculumSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function createPlayerId() {
  return `ID-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeBoundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeSpeechFilter(value) {
  return ["all", "female", "male"].includes(value) ? value : "all";
}

function detectSpeechBrowserProfile() {
  const userAgent = String(navigator?.userAgent || "").toLowerCase();
  if (userAgent.includes("edg/")) return "edge";
  if (userAgent.includes("chrome/") || userAgent.includes("crios/")) return "chrome";
  return "other";
}

function matchesVoiceKeywords(voice, keywords) {
  const sample = `${String(voice?.name || "").toLowerCase()} ${String(voice?.voiceURI || "").toLowerCase()}`;
  return keywords.every((keyword) => sample.includes(keyword));
}

function browserDefaultThaiVoice(voices) {
  const browserProfile = detectSpeechBrowserProfile();
  const profiles = {
    chrome: [
      ["microsoft", "pattara", "thai"],
      ["pattara", "thai"],
      ["pattara"],
    ],
    edge: [
      ["microsoft", "นิวัฒน์", "online"],
      ["microsoft", "niwat", "online"],
      ["นิวัฒน์", "online"],
      ["niwat", "online"],
      ["นิวัฒน์"],
      ["niwat"],
    ],
    other: [],
  };

  const preferredPatterns = profiles[browserProfile] || [];
  for (let index = 0; index < preferredPatterns.length; index += 1) {
    const match = voices.find((voice) => matchesVoiceKeywords(voice, preferredPatterns[index]));
    if (match) return match;
  }

  return null;
}

function migrateState(rawState) {
  const base = { ...DEFAULT_STATE, ...(rawState || {}) };
  const shouldResetSpeechDefaults = Number(base.speechSettingsVersion || 0) < 3;
  return {
    ...base,
    profileAvatar: base.profileAvatar || DEFAULT_AVATAR,
    playerId: base.playerId || createPlayerId(),
    curriculumSeed: base.curriculumSeed || createCurriculumSeed(),
    hearts: Math.min(MAX_HEARTS, Math.max(1, Number(base.hearts) || MAX_HEARTS)),
    gems: Number(base.gems) || 0,
    xp: Number(base.xp) || 0,
    wins: Number(base.wins) || 0,
    losses: Number(base.losses) || 0,
    apiKeys: Array.isArray(base.apiKeys) && base.apiKeys.length ? base.apiKeys : [""],
    preferredModel: MODEL_OPTIONS.includes(base.preferredModel) ? base.preferredModel : MODEL_OPTIONS[0],
    modelStatuses: typeof base.modelStatuses === "object" && base.modelStatuses ? base.modelStatuses : {},
    stageCatalog: Array.isArray(base.stageCatalog) && base.stageCatalog.every((stage) => Array.isArray(stage.steps))
      ? base.stageCatalog
      : [],
    completedStageIds: Array.isArray(base.completedStageIds) ? base.completedStageIds : [],
    activeStageId: base.activeStageId || null,
    activeStepIndex: Number.isFinite(base.activeStepIndex) ? base.activeStepIndex : 0,
    reviewDeck: Array.isArray(base.reviewDeck) ? base.reviewDeck : [],
    teacherJournal: Array.isArray(base.teacherJournal) ? base.teacherJournal : [],
    stageAttempts: typeof base.stageAttempts === "object" && base.stageAttempts ? base.stageAttempts : {},
    draftAnswers: typeof base.draftAnswers === "object" && base.draftAnswers ? base.draftAnswers : {},
    lessonFeedback:
      typeof base.lessonFeedback === "object" && base.lessonFeedback
        ? base.lessonFeedback
        : { type: "", text: "" },
    generationBusy: false,
    generationError: "",
    lastCampaignMessage: base.lastCampaignMessage || "",
    speechSettingsVersion: 3,
    speechAutoRead: shouldResetSpeechDefaults ? false : typeof base.speechAutoRead === "boolean" ? base.speechAutoRead : false,
    speechVoiceFilter: shouldResetSpeechDefaults ? "all" : normalizeSpeechFilter(base.speechVoiceFilter),
    speechVoiceURI: shouldResetSpeechDefaults ? "" : typeof base.speechVoiceURI === "string" ? base.speechVoiceURI : "",
    speechRate: normalizeBoundedNumber(base.speechRate, 0.75, 1.25, 1),
    speechPitch: normalizeBoundedNumber(base.speechPitch, 0.8, 1.2, 1),
    speechVolume: normalizeBoundedNumber(base.speechVolume, 0.4, 1, 1),
    screen: base.screen === "lesson" ? "lesson" : "map",
  };
}

const state = migrateState(loadState(DEFAULT_STATE));

const runtime = {
  modelPickerOpen: false,
  modelValidationBusy: false,
  modelValidationTargets: [],
  modelValidationToken: 0,
  generationToken: 0,
  answerEvaluationBusy: false,
  liveFeedback: { stageId: null, stepId: null, type: "", text: "" },
  speechSupported: isSpeechSupported(),
  speechVoices: [],
  speechActive: false,
  speechCurrentKey: "",
  speechStatusText: "",
  speechLastAutoKey: "",
};

const ui = {
  mapScreen: document.querySelector("#mapScreen"),
  lessonScreen: document.querySelector("#lessonScreen"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileNameLabel: document.querySelector("#profileNameLabel"),
  playerIdLabel: document.querySelector("#playerIdLabel"),
  openProfileBtn: document.querySelector("#openProfileBtn"),
  heartCount: document.querySelector("#heartCount"),
  gemCount: document.querySelector("#gemCount"),
  levelLabel: document.querySelector("#levelLabel"),
  xpCount: document.querySelector("#xpCount"),
  winCount: document.querySelector("#winCount"),
  lossCount: document.querySelector("#lossCount"),
  reviewCount: document.querySelector("#reviewCount"),
  campaignStatus: document.querySelector("#campaignStatus"),
  stageGrid: document.querySelector("#stageGrid"),
  modelPicker: document.querySelector("#modelPicker"),
  modelPickerButton: document.querySelector("#modelPickerButton"),
  modelPickerStatusDot: document.querySelector("#modelPickerStatusDot"),
  modelPickerValue: document.querySelector("#modelPickerValue"),
  modelPickerStatusText: document.querySelector("#modelPickerStatusText"),
  modelPickerMenu: document.querySelector("#modelPickerMenu"),
  settingsBtn: document.querySelector("#settingsBtn"),
  lessonStageCode: document.querySelector("#lessonStageCode"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonSubtitle: document.querySelector("#lessonSubtitle"),
  lessonHeartCount: document.querySelector("#lessonHeartCount"),
  stepCounter: document.querySelector("#stepCounter"),
  lessonProgressFill: document.querySelector("#lessonProgressFill"),
  lessonBackBtn: document.querySelector("#lessonBackBtn"),
  lessonDifficulty: document.querySelector("#lessonDifficulty"),
  speakLessonBtn: document.querySelector("#speakLessonBtn"),
  speechStatus: document.querySelector("#speechStatus"),
  stepTitle: document.querySelector("#stepTitle"),
  teacherSpeech: document.querySelector("#teacherSpeech"),
  teacherBullets: document.querySelector("#teacherBullets"),
  memoryHook: document.querySelector("#memoryHook"),
  codePreview: document.querySelector("#codePreview"),
  outputPreview: document.querySelector("#outputPreview"),
  answerReveal: document.querySelector("#answerReveal"),
  stepInstruction: document.querySelector("#stepInstruction"),
  answerArea: document.querySelector("#answerArea"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  primaryActionBtn: document.querySelector("#primaryActionBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  profileDialog: document.querySelector("#profileDialog"),
  bulkPasteDialog: document.querySelector("#bulkPasteDialog"),
  stageResultDialog: document.querySelector("#stageResultDialog"),
  stageResultTitle: document.querySelector("#stageResultTitle"),
  stageResultBody: document.querySelector("#stageResultBody"),
  stageResultBtn: document.querySelector("#stageResultBtn"),
  apiKeyList: document.querySelector("#apiKeyList"),
  addKeyRowBtn: document.querySelector("#addKeyRowBtn"),
  bulkPasteBtn: document.querySelector("#bulkPasteBtn"),
  settingsModelList: document.querySelector("#settingsModelList"),
  speechSupportBadge: document.querySelector("#speechSupportBadge"),
  speechSupportText: document.querySelector("#speechSupportText"),
  speechAutoReadToggle: document.querySelector("#speechAutoReadToggle"),
  speechVoiceFilterSelect: document.querySelector("#speechVoiceFilterSelect"),
  speechVoiceSelect: document.querySelector("#speechVoiceSelect"),
  speechRateInput: document.querySelector("#speechRateInput"),
  speechRateValue: document.querySelector("#speechRateValue"),
  speechPitchInput: document.querySelector("#speechPitchInput"),
  speechPitchValue: document.querySelector("#speechPitchValue"),
  speechVolumeInput: document.querySelector("#speechVolumeInput"),
  speechVolumeValue: document.querySelector("#speechVolumeValue"),
  previewVoiceBtn: document.querySelector("#previewVoiceBtn"),
  stopVoiceBtn: document.querySelector("#stopVoiceBtn"),
  refreshVoicesBtn: document.querySelector("#refreshVoicesBtn"),
  validateModelsBtn: document.querySelector("#validateModelsBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  resetLearningBtn: document.querySelector("#resetLearningBtn"),
  profileNameInput: document.querySelector("#profileNameInput"),
  profileAvatarInput: document.querySelector("#profileAvatarInput"),
  profileSaveBtn: document.querySelector("#profileSaveBtn"),
  profileSkipBtn: document.querySelector("#profileSkipBtn"),
  bulkPasteInput: document.querySelector("#bulkPasteInput"),
  bulkPasteApplyBtn: document.querySelector("#bulkPasteApplyBtn"),
  typeAnswerTemplate: document.querySelector("#typeAnswerTemplate"),
  choiceAnswerTemplate: document.querySelector("#choiceAnswerTemplate"),
};

function persist() {
  saveState(state);
}

function sanitizeKeys(keys) {
  return keys.map((key) => key.trim()).filter(Boolean);
}

function configuredKeys() {
  return sanitizeKeys(state.apiKeys);
}

function clearStageDrafts(stageId) {
  Object.keys(state.draftAnswers).forEach((key) => {
    if (key.startsWith(`${stageId}:`)) {
      delete state.draftAnswers[key];
    }
  });
}

function invalidateModelStatuses() {
  runtime.modelValidationToken += 1;
  runtime.modelValidationBusy = false;
  runtime.modelValidationTargets = [];
  state.modelStatuses = {};
  persist();
}

function answerDraftKey(stageId, stepId) {
  return `${stageId}:${stepId}`;
}

function setLiveFeedback(stageId, stepId, type, text) {
  runtime.liveFeedback = { stageId, stepId, type, text };
}

function clearLiveFeedback() {
  runtime.liveFeedback = { stageId: null, stepId: null, type: "", text: "" };
}

function voiceGenderLabel(gender) {
  if (gender === "female") return "เสียงผู้หญิงไทย";
  if (gender === "male") return "เสียงผู้ชายไทย";
  return "เสียงไทย";
}

function isThaiVoiceSummary(voice) {
  const lang = String(voice?.lang || "").trim().toLowerCase();
  const name = String(voice?.name || "").trim().toLowerCase();
  return lang.startsWith("th") || /\bthai\b|ภาษาไทย|premwadee|niwat/.test(name);
}

function thaiSpeechVoices() {
  return runtime.speechVoices.filter((voice) => isThaiVoiceSummary(voice));
}

function speechVoiceScore(voice) {
  let score = 0;

  if (/^th-TH$/i.test(voice.lang || "")) score += 120;
  else if (/^th/i.test(voice.lang || "")) score += 100;

  if (voice.default) score += 12;
  if (voice.localService) score += 8;

  if (voice.gender === "female") score += 18;
  if (voice.gender === "male") score += 8;

  return score;
}

function sortedSpeechVoices() {
  const browserPreferredVoice = browserDefaultThaiVoice(thaiSpeechVoices());
  return [...thaiSpeechVoices()].sort((left, right) => {
    if (browserPreferredVoice) {
      if (left.voiceURI === browserPreferredVoice.voiceURI) return -1;
      if (right.voiceURI === browserPreferredVoice.voiceURI) return 1;
    }

    const scoreDiff = speechVoiceScore(right) - speechVoiceScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    return `${left.name} ${left.lang}`.localeCompare(`${right.name} ${right.lang}`);
  });
}

function filteredSpeechVoices() {
  const voices = sortedSpeechVoices();
  if (state.speechVoiceFilter === "all") return voices;
  return voices.filter((voice) => voice.gender === state.speechVoiceFilter);
}

function findSpeechVoiceByURI(voiceURI) {
  return sortedSpeechVoices().find((voice) => voice.voiceURI === voiceURI) || null;
}

function preferredSpeechVoice() {
  const voice = findSpeechVoiceByURI(state.speechVoiceURI);
  if (!voice) return null;
  if (state.speechVoiceFilter === "all") return voice;
  return voice.gender === state.speechVoiceFilter ? voice : null;
}

function ensureSpeechVoiceSelection(options = {}) {
  const voices = sortedSpeechVoices();
  if (!voices.length) return null;

  const availableVoices = filteredSpeechVoices();
  const currentVoice = preferredSpeechVoice();
  if (currentVoice) return currentVoice;

  const browserPreferred = browserDefaultThaiVoice(voices);
  const filteredVoice = state.speechVoiceFilter === "all"
    ? browserPreferred || voices[0]
    : availableVoices[0] || null;
  if (filteredVoice) {
    state.speechVoiceURI = filteredVoice.voiceURI;
    if (options.persistState) {
      persist();
    }
  }

  return filteredVoice || null;
}

function speechSupportSummary() {
  if (!runtime.speechSupported) {
    return {
      tone: "error",
      label: "ไม่รองรับ",
      text: "เบราว์เซอร์นี้ยังไม่รองรับระบบเสียงอ่านฟรีแบบในเครื่อง จึงยังใช้ระบบเสียงภาษาไทยของเว็บนี้ไม่ได้",
    };
  }

  if (!runtime.speechVoices.length) {
    return {
      tone: "checking",
      label: "กำลังโหลด",
      text: "กำลังขอรายการเสียงจากเบราว์เซอร์และ Windows อยู่ เพื่อคัดเฉพาะเสียงภาษาไทยให้ ถ้ายังไม่ขึ้นให้กดรีเฟรชรายการเสียง",
    };
  }

  if (!thaiSpeechVoices().length) {
    return {
      tone: "error",
      label: "ไม่พบเสียงไทย",
      text: "เครื่องนี้ยังไม่พบเสียงพูดภาษาไทยในระบบ จึงยังไม่มีโมเดลเสียงภาษาไทยให้เลือก ลองติดตั้งเสียงไทยของ Windows แล้วกดรีเฟรชรายการเสียง",
    };
  }

  if (!filteredSpeechVoices().length) {
    return {
      tone: "error",
      label: "ยังไม่มีเสียงในหมวดนี้",
      text:
        state.speechVoiceFilter === "female"
          ? "ตอนนี้ยังไม่พบเสียงผู้หญิงภาษาไทยในเครื่อง ลองเปลี่ยนเป็นเสียงผู้ชายไทยหรือเสียงไทยทั้งหมด"
          : state.speechVoiceFilter === "male"
            ? "ตอนนี้ยังไม่พบเสียงผู้ชายภาษาไทยในเครื่อง ลองเปลี่ยนเป็นเสียงผู้หญิงไทยหรือเสียงไทยทั้งหมด"
            : "ตอนนี้ยังไม่พบโมเดลเสียงไทยที่ใช้ได้",
    };
  }

  const currentVoice = ensureSpeechVoiceSelection();
  return {
    tone: "ready",
    label: "พร้อมใช้",
    text:
      currentVoice
        ? `ตอนนี้พร้อมใช้โมเดลเสียงภาษาไทย ${currentVoice.name} (${voiceGenderLabel(currentVoice.gender)}) ค่าเริ่มต้นจะไม่อ่านเอง และ Chrome/Google กับ Edge จะพยายามเลือกเสียงเริ่มต้นตามที่กำหนดไว้ก่อน`
        : "ระบบเสียงไทยพร้อมแล้ว แต่ยังไม่ได้เลือกเสียง",
  };
}

function currentSpeechStepKey(stage, step) {
  if (!stage || !step) return "";
  return `${stage.id}:${step.id}:${state.activeStepIndex}`;
}

function buildLessonNarration(stage, step) {
  const parts = [
    `ด่าน ${String(stage.order).padStart(3, "0")} ${stage.title}`,
    `ขั้นนี้คือ ${step.title}`,
    buildTeacherSpeech(stage, step),
  ];

  if (Array.isArray(step.bulletPoints) && step.bulletPoints.length) {
    parts.push(`สรุปสั้น ๆ ${step.bulletPoints.join(". ")}`);
  }

  if (step.memoryHook) {
    parts.push(`จำง่าย ๆ ว่า ${step.memoryHook}`);
  }

  if (step.type !== "teach" && step.instruction) {
    parts.push(`โจทย์ของขั้นนี้คือ ${step.instruction}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function renderSpeechControls() {
  if (!ui.speakLessonBtn || !ui.speechStatus) return;

  const support = speechSupportSummary();
  const stage = getCurrentStage();
  const step = getCurrentStep(stage, state.activeStepIndex);
  const stepKey = currentSpeechStepKey(stage, step);
  const isCurrentStepSpeaking = runtime.speechActive && runtime.speechCurrentKey === stepKey;

  ui.speakLessonBtn.disabled = !runtime.speechSupported || !ensureSpeechVoiceSelection() || !stage || !step;
  ui.speakLessonBtn.setAttribute("aria-pressed", String(isCurrentStepSpeaking));
  ui.speakLessonBtn.textContent = isCurrentStepSpeaking ? "หยุดเสียงที่กำลังอ่าน" : "อ่านด้วยเสียง AI ไทย";
  ui.speechStatus.textContent = runtime.speechStatusText || support.text;
}

function renderSpeechSettings() {
  if (!ui.speechSupportBadge) return;

  const support = speechSupportSummary();
  const filteredVoicesList = filteredSpeechVoices();
  const selectedVoice = ensureSpeechVoiceSelection();

  ui.speechSupportBadge.className = `status-badge tone-${support.tone}`;
  ui.speechSupportBadge.textContent = support.label;
  ui.speechSupportText.textContent = support.text;

  ui.speechAutoReadToggle.checked = state.speechAutoRead;
  ui.speechAutoReadToggle.disabled = !runtime.speechSupported;

  ui.speechVoiceFilterSelect.value = state.speechVoiceFilter;
  ui.speechVoiceFilterSelect.disabled = !runtime.speechSupported || !thaiSpeechVoices().length;

  ui.speechVoiceSelect.innerHTML = "";

  if (!runtime.speechSupported) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "เบราว์เซอร์นี้ยังไม่รองรับเสียงอ่านฟรี";
    ui.speechVoiceSelect.appendChild(option);
  } else if (!filteredVoicesList.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = thaiSpeechVoices().length
      ? state.speechVoiceFilter === "female"
        ? "ยังไม่พบเสียงผู้หญิงไทย ลองเปลี่ยนเป็นเสียงผู้ชายไทยหรือเสียงไทยทั้งหมด"
        : state.speechVoiceFilter === "male"
          ? "ยังไม่พบเสียงผู้ชายไทย ลองเปลี่ยนเป็นเสียงผู้หญิงไทยหรือเสียงไทยทั้งหมด"
          : "ยังไม่พบโมเดลเสียงไทยที่ใช้ได้ ลองรีเฟรชรายการเสียง"
      : "กำลังโหลดรายการเสียงไทย...";
    ui.speechVoiceSelect.appendChild(option);
  } else {
    filteredVoicesList.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} • ${voice.lang} • ${voiceGenderLabel(voice.gender)}`;
      ui.speechVoiceSelect.appendChild(option);
    });
  }

  ui.speechVoiceSelect.disabled = !runtime.speechSupported || !filteredVoicesList.length;
  ui.speechVoiceSelect.value = filteredVoicesList.some((voice) => voice.voiceURI === state.speechVoiceURI)
    ? state.speechVoiceURI
    : filteredVoicesList[0]?.voiceURI || "";

  ui.speechRateInput.value = String(state.speechRate);
  ui.speechPitchInput.value = String(state.speechPitch);
  ui.speechVolumeInput.value = String(state.speechVolume);
  ui.speechRateValue.textContent = `${state.speechRate.toFixed(2)}x`;
  ui.speechPitchValue.textContent = `${state.speechPitch.toFixed(2)}x`;
  ui.speechVolumeValue.textContent = `${Math.round(state.speechVolume * 100)}%`;

  const canPlay = runtime.speechSupported && Boolean(selectedVoice) && Boolean(filteredVoicesList.length);
  ui.previewVoiceBtn.disabled = !canPlay;
  ui.stopVoiceBtn.disabled = !runtime.speechActive;
  ui.refreshVoicesBtn.disabled = !runtime.speechSupported;
}

function stopSpeechPlayback(statusText = "หยุดเสียงแล้ว") {
  cancelSpeech();
  runtime.speechActive = false;
  runtime.speechCurrentKey = "";
  runtime.speechStatusText = statusText;
  renderSpeechControls();
  renderSpeechSettings();
}

function speakWithCurrentVoice(text, speechKey, statusPrefix) {
  if (!runtime.speechSupported) {
    runtime.speechStatusText = "เบราว์เซอร์นี้ยังไม่รองรับระบบเสียงอ่านภาษาไทยฟรี";
    renderSpeechControls();
    renderSpeechSettings();
    return false;
  }

  const voice = ensureSpeechVoiceSelection({ persistState: !state.speechVoiceURI });
  if (!voice) {
    runtime.speechStatusText = "ยังไม่พบเสียงภาษาไทยในเครื่อง ลองติดตั้งเสียงไทยของ Windows แล้วกดรีเฟรชรายการเสียงอีกครั้ง";
    renderSpeechControls();
    renderSpeechSettings();
    return false;
  }

  const started = speakText({
    text,
    voiceURI: voice.voiceURI,
    rate: state.speechRate,
    pitch: state.speechPitch,
    volume: state.speechVolume,
    onStart: () => {
      runtime.speechActive = true;
      runtime.speechCurrentKey = speechKey;
      runtime.speechStatusText = `${statusPrefix}ด้วยเสียง ${voice.name}`;
      renderSpeechControls();
      renderSpeechSettings();
    },
    onEnd: () => {
      if (runtime.speechCurrentKey !== speechKey) return;
      runtime.speechActive = false;
      runtime.speechCurrentKey = "";
      runtime.speechStatusText = `อ่านจบแล้วด้วยเสียง ${voice.name}`;
      renderSpeechControls();
      renderSpeechSettings();
    },
    onError: () => {
      if (runtime.speechCurrentKey !== speechKey) return;
      runtime.speechActive = false;
      runtime.speechCurrentKey = "";
      runtime.speechStatusText = "เริ่มอ่านเสียงไม่สำเร็จ ลองเปลี่ยนเสียงหรือกดอ่านใหม่อีกครั้ง";
      renderSpeechControls();
      renderSpeechSettings();
    },
  });

  if (!started) {
    runtime.speechStatusText = "ยังไม่มีข้อความให้อ่านในขั้นนี้";
    renderSpeechControls();
    renderSpeechSettings();
  }

  return started;
}

function speakCurrentLesson(stage, step, options = {}) {
  const speechKey = currentSpeechStepKey(stage, step);
  const narration = buildLessonNarration(stage, step);
  return speakWithCurrentVoice(narration, speechKey, options.statusPrefix || "กำลังอ่านคำอธิบาย ");
}

function maybeAutoSpeakLesson(stage, step) {
  if (!state.speechAutoRead || state.screen !== "lesson") return;

  const speechKey = currentSpeechStepKey(stage, step);
  if (!speechKey || runtime.speechLastAutoKey === speechKey) return;

  const started = speakCurrentLesson(stage, step, { statusPrefix: "กำลังอ่านอัตโนมัติ " });
  if (started) {
    runtime.speechLastAutoKey = speechKey;
  }
}

function handleSpeechVoicesChanged(voices) {
  runtime.speechVoices = Array.isArray(voices) ? voices : [];
  ensureSpeechVoiceSelection({ persistState: true });
  renderSpeechControls();
  renderSpeechSettings();

  const stage = getCurrentStage();
  const step = getCurrentStep(stage, state.activeStepIndex);
  if (stage && step) {
    maybeAutoSpeakLesson(stage, step);
  }
}

function normalizedSnippet(value) {
  return (value || "").replace(/\r\n/g, "\n").trim();
}

function sameSnippet(left, right) {
  return normalizedSnippet(left) === normalizedSnippet(right);
}

function looksLikeCodePreview(value) {
  const text = normalizedSnippet(value);
  if (!text) return false;

  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  return (
    /^https?:\/\//i.test(firstLine) ||
    /^(print|input|if|elif|else:|for|while|def|class|with|assert|from|import|python\b|py\b|pip\b|\.venv\\|[A-Za-z_][A-Za-z0-9_]*\s*=|[A-Za-z_][A-Za-z0-9_]*\(|[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\()/.test(firstLine) ||
    /[=(){}\[\]]/.test(text)
  );
}

function looksLikeOutputPreview(value) {
  const text = normalizedSnippet(value);
  if (!text) return false;
  if (text.length > 240) return false;
  if (/^(คำอธิบาย|อธิบาย|โจทย์|ขั้นนี้|ให้พิมพ์|มอง|ดู|ลอง|ครู|หมายความ)/.test(text)) {
    return false;
  }
  return true;
}

function selectCodePreview(step) {
  const candidates = [step.code, step.answerReveal, step.expectedAnswer, step.starterCode];
  return candidates.find((candidate) => looksLikeCodePreview(candidate)) || "";
}

function selectOutputPreview(step) {
  const candidates = [step.output, step.expectedOutput];
  return candidates.find((candidate) => looksLikeOutputPreview(candidate)) || "";
}

function buildTeacherSpeech(stage, step) {
  const previewCode = selectCodePreview(step);
  const previewOutput = selectOutputPreview(step);
  const baseExplanation = (step.explanation || step.teacherPrompt || stage.intro || "").trim();
  const parts = [];

  if (baseExplanation) {
    parts.push(baseExplanation);
  }

  if (step.type === "teach") {
    parts.push("ขั้นนี้ยังไม่ใช่ช่วงสอบหรือช่วงรีบพิมพ์ สิ่งสำคัญที่สุดคือมองให้ออกว่าคำสั่งส่วนไหนทำหน้าที่อะไรและเชื่อมกับผลลัพธ์อย่างไร");
  } else if (step.type === "command") {
    parts.push("ขั้นนี้เป็นการพิมพ์คำสั่งจริง จึงค่อย ๆ ดูรูปทรงของคำสั่งทีละช่วงได้เลย โดยเฉพาะขีด วงเล็บ และช่องว่างที่จำเป็น");
  } else if (step.type === "choice") {
    parts.push("ขั้นนี้ไม่ได้วัดความเร็ว แต่กำลังฝึกตาให้แยกออกว่าโค้ดแบบไหนหน้าตาถูกต้องหรือสื่อความหมายได้ตรงโจทย์");
  } else {
    parts.push("ขั้นนี้ให้ดูตัวอย่างก่อนแล้วค่อยพิมพ์ตามเป้าหมายของโจทย์ ไม่จำเป็นต้องรีบและไม่จำเป็นต้องเหมือนตัวอย่างทุกตัวอักษรถ้าความหมายยังถูกต้อง");
  }

  if (previewCode) {
    parts.push("ช่องตัวอย่างโค้ดทางขวาเอาไว้ดูรูปทรงของโค้ดหรือคำสั่ง ไม่ใช่พื้นที่อธิบายทฤษฎี ถ้ายังงงให้เทียบทีละส่วนว่าชื่อคำสั่ง วงเล็บ ข้อความ และตัวแปรอยู่ตรงไหน");
  }

  if (previewOutput) {
    parts.push("ช่องผลลัพธ์ที่ควรเห็นเอาไว้บอกภาพปลายทางว่าเมื่อรันตัวอย่างแล้วหน้าจอควรออกมาแบบไหน ให้ค่อย ๆ เชื่อมจากโค้ดด้านขวาไปสู่ผลลัพธ์ทีละบรรทัด");
  }

  if (step.correctionFocus) {
    parts.push(`จุดที่มือใหม่มักสะดุดในขั้นนี้คือ ${step.correctionFocus}`);
  }

  if (step.instruction && step.type !== "teach") {
    parts.push(`เป้าหมายของขั้นนี้คือ ${step.instruction}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function isStageCompleted(stageId) {
  return state.completedStageIds.includes(stageId);
}

function unlockedStageOrder() {
  return state.completedStageIds.length + 1;
}

function getCurrentStage() {
  return getStageById(state.stageCatalog, state.activeStageId);
}

function setFeedback(type, text) {
  state.lessonFeedback = { type, text };
}

function clearFeedback() {
  state.lessonFeedback = { type: "", text: "" };
}

function updateCampaignMessage(message) {
  state.lastCampaignMessage = message;
}

function updateStageAttempt(stageId, partial) {
  state.stageAttempts[stageId] = {
    currentStep: 0,
    mistakes: 0,
    clears: 0,
    ...(state.stageAttempts[stageId] || {}),
    ...partial,
  };
}

function resetStageProgress(stageId) {
  if (!stageId) return;
  clearStageDrafts(stageId);
  updateStageAttempt(stageId, { currentStep: 0 });
}

function getModelStatusesFor(modelName) {
  const keys = configuredKeys();
  const statuses = [];

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const status = state.modelStatuses[`${keyIndex}:${modelName}`];
    if (status) statuses.push(status);
  }

  return statuses;
}

function getModelStatusSummary(modelName) {
  const keys = configuredKeys();
  const statuses = getModelStatusesFor(modelName);
  const fullyChecked = keys.length > 0 && statuses.length >= keys.length;

  if (!keys.length) {
    return {
      tone: "idle",
      label: "ยังไม่มี API key",
      helper: "เพิ่มคีย์ก่อน ระบบถึงจะเช็กสถานะโมเดลให้อัตโนมัติ",
    };
  }

  if (statuses.some((item) => item.status === "ready")) {
    return {
      tone: "ready",
      label: "พร้อมใช้งาน",
      helper: "มีอย่างน้อยหนึ่งคีย์ที่เรียกโมเดลนี้ได้",
    };
  }

  if (runtime.modelValidationBusy && runtime.modelValidationTargets.includes(modelName) && !fullyChecked) {
    return {
      tone: "checking",
      label: "กำลังตรวจสอบ",
      helper: "กำลังส่งคำสั้น ๆ ไปเช็กว่าโมเดลนี้ยังตอบกลับได้หรือไม่",
    };
  }

  if (fullyChecked && statuses.every((item) => item.status === "quota")) {
    return {
      tone: "quota",
      label: "โควต้าหมด",
      helper: "ทุกคีย์ที่มีใช้โควต้าของโมเดลนี้ครบแล้ว",
    };
  }

  if (fullyChecked && statuses.every((item) => item.status === "error")) {
    return {
      tone: "error",
      label: "เรียกใช้ไม่ได้",
      helper: statuses[0]?.detail || "เชื่อมต่อโมเดลนี้ไม่สำเร็จ",
    };
  }

  if (statuses.some((item) => item.status === "quota")) {
    return {
      tone: "quota",
      label: "บางคีย์โควต้าหมด",
      helper: "ยังไม่เจอคีย์ที่พร้อมใช้งานสำหรับโมเดลนี้",
    };
  }

  if (statuses.some((item) => item.status === "error")) {
    return {
      tone: "error",
      label: "ตรวจสอบไม่ผ่าน",
      helper: statuses[0]?.detail || "ลองตรวจสอบอีกครั้ง",
    };
  }

  return {
    tone: "unknown",
    label: "ยังไม่ตรวจสอบ",
    helper: "เลือกโมเดลนี้เมื่อไรก็จะเช็กสถานะให้อีกครั้งทันที",
  };
}

function closeModelPicker() {
  runtime.modelPickerOpen = false;
  ui.modelPickerButton.classList.remove("is-open");
  ui.modelPickerButton.setAttribute("aria-expanded", "false");
  ui.modelPickerMenu.classList.add("hidden");
}

function setModelPickerOpen(nextOpen) {
  runtime.modelPickerOpen = nextOpen;
  ui.modelPickerButton.classList.toggle("is-open", nextOpen);
  ui.modelPickerButton.setAttribute("aria-expanded", String(nextOpen));
  ui.modelPickerMenu.classList.toggle("hidden", !nextOpen);
}

function syncValidationButton() {
  const hasKeys = configuredKeys().length > 0;
  ui.validateModelsBtn.disabled = runtime.modelValidationBusy || !hasKeys;
  ui.validateModelsBtn.textContent = runtime.modelValidationBusy ? "กำลังตรวจสอบ..." : "ตรวจสอบโมเดลตอนนี้";
}

function renderModelSelect() {
  const currentStatus = getModelStatusSummary(state.preferredModel);

  ui.modelPickerValue.textContent = state.preferredModel;
  ui.modelPickerStatusText.textContent = currentStatus.label;
  ui.modelPickerStatusDot.className = `model-status-dot tone-${currentStatus.tone}`;
  ui.modelPickerButton.className = `model-picker-button tone-${currentStatus.tone}${runtime.modelPickerOpen ? " is-open" : ""}`;
  ui.modelPickerButton.title = currentStatus.helper;

  ui.modelPickerMenu.innerHTML = "";

  MODEL_OPTIONS.forEach((modelName) => {
    const status = getModelStatusSummary(modelName);
    const option = document.createElement("button");
    const copy = document.createElement("span");
    const heading = document.createElement("span");
    const detail = document.createElement("small");
    const statusWrap = document.createElement("span");
    const dot = document.createElement("span");
    const badge = document.createElement("span");

    option.type = "button";
    option.role = "option";
    option.className = `model-option tone-${status.tone}`;
    if (modelName === state.preferredModel) option.classList.add("selected");

    copy.className = "model-option-copy";
    heading.textContent = modelName;
    detail.textContent = status.helper;
    copy.append(heading, detail);

    statusWrap.className = "model-option-status";
    dot.className = `model-status-dot tone-${status.tone}`;
    badge.className = `status-badge tone-${status.tone}`;
    badge.textContent = status.label;
    statusWrap.append(dot, badge);

    option.append(copy, statusWrap);
    option.addEventListener("click", () => {
      state.preferredModel = modelName;
      persist();
      renderModelSelect();
      renderSettingsModelList();
      closeModelPicker();
      void validateModels({ models: [modelName] });
    });

    ui.modelPickerMenu.appendChild(option);
  });
}

function renderApiKeyList() {
  ui.apiKeyList.innerHTML = "";
  state.apiKeys.forEach((key, index) => {
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `
      <input type="password" value="${key.replace(/"/g, "&quot;")}" placeholder="วาง Gemini API key ตรงนี้" />
      <button type="button" class="ghost-button">ลบ</button>
    `;
    row.querySelector("input").addEventListener("input", (event) => {
      state.apiKeys[index] = event.target.value;
      invalidateModelStatuses();
      renderModelSelect();
      renderSettingsModelList();
      syncValidationButton();
    });
    row.querySelector("button").addEventListener("click", () => {
      state.apiKeys.splice(index, 1);
      if (!state.apiKeys.length) state.apiKeys.push("");
      invalidateModelStatuses();
      renderSettings();
      renderModelSelect();
    });
    ui.apiKeyList.appendChild(row);
  });
}

function renderSettingsModelList() {
  ui.settingsModelList.innerHTML = "";
  MODEL_OPTIONS.forEach((model) => {
    const status = getModelStatusSummary(model);
    const card = document.createElement("button");
    const header = document.createElement("div");
    const title = document.createElement("strong");
    const badge = document.createElement("span");
    const body = document.createElement("p");

    card.type = "button";
    card.className = `model-status-card tone-${status.tone}`;
    if (model === state.preferredModel) card.classList.add("selected");

    header.className = "panel-header";
    title.textContent = model;
    badge.className = `status-badge tone-${status.tone}`;
    badge.textContent = status.label;
    header.append(title, badge);

    body.className = "muted";
    body.textContent = status.helper;

    card.append(header, body);
    card.addEventListener("click", () => {
      state.preferredModel = model;
      persist();
      renderModelSelect();
      renderSettingsModelList();
      void validateModels({ models: [model] });
    });
    ui.settingsModelList.appendChild(card);
  });
}

function getFallbackFeedback(step) {
  return step.type === "teach"
    ? "ขั้นนี้เน้นทำความเข้าใจภาพรวมก่อน ยังไม่ต้องรีบตอบหรือรีบจำทุกอย่างในครั้งเดียว"
    : "ค่อย ๆ ดูตัวอย่างด้านขวาแล้วทำตามโจทย์ได้เลย ถ้าพร้อมเมื่อไรค่อยกดส่งคำตอบ";
}

function renderFeedbackPanel(stage, step) {
  const liveFeedback =
    runtime.liveFeedback.stageId === stage.id && runtime.liveFeedback.stepId === step.id && runtime.liveFeedback.text
      ? runtime.liveFeedback
      : null;

  const feedback = liveFeedback?.text
    ? liveFeedback
    : state.lessonFeedback.text
      ? state.lessonFeedback
      : { type: "", text: getFallbackFeedback(step) };

  ui.feedbackPanel.className = `feedback-panel ${feedback.type || ""}`.trim();
  ui.feedbackPanel.textContent = feedback.text;
}

function handleModelStatusUpdate(keyIndex, modelName, value) {
  state.modelStatuses[`${keyIndex}:${modelName}`] = value;
  persist();
  renderSettingsModelList();
  renderModelSelect();
}

function getDifficultyLabel(stage) {
  if (!stage) return "ง่าย";
  if (stage.difficulty <= 2) return "เริ่มต้น";
  if (stage.difficulty <= 4) return "กลางทาง";
  if (stage.difficulty <= 6) return "จริงจัง";
  return "โปรเจกต์ใหญ่";
}

function renderSettings() {
  renderApiKeyList();
  renderSettingsModelList();
  renderSpeechSettings();
  syncValidationButton();
}

function renderTopHud() {
  ui.profileAvatar.src = state.profileAvatar || DEFAULT_AVATAR;
  ui.profileNameLabel.textContent = state.profileName || "นักเรียนใหม่";
  ui.playerIdLabel.textContent = state.playerId;
  ui.heartCount.textContent = String(state.hearts);
  ui.gemCount.textContent = String(state.gems);
  ui.levelLabel.textContent = String(calculateLevel(state.xp));
  ui.xpCount.textContent = String(state.xp);
  ui.winCount.textContent = String(state.wins);
  ui.lossCount.textContent = String(state.losses);
  ui.reviewCount.textContent = String(state.reviewDeck.length);
  renderModelSelect();
}

function renderStageGrid() {
  ui.stageGrid.innerHTML = "";

  if (!state.stageCatalog.length) {
    const card = document.createElement("div");
    card.className = "stage-card locked";
    card.innerHTML = `
      <div class="stage-card-top">
        <span class="badge-lock">กำลังสร้าง</span>
      </div>
      <h3>กำลังเตรียมแผนที่ด่าน</h3>
      <p>ครู AI กำลังจัดเส้นทางการเรียนให้ตรงกับผู้เล่นคนนี้</p>
    `;
    ui.stageGrid.appendChild(card);
    return;
  }

  const unlockedOrder = unlockedStageOrder();

  state.stageCatalog.forEach((stage) => {
    const completed = isStageCompleted(stage.id);
    const unlocked = completed || stage.order <= unlockedOrder;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "stage-card";
    if (completed) card.classList.add("completed");
    if (stage.order === unlockedOrder && !completed) card.classList.add("current");
    if (!unlocked) {
      card.classList.add("locked");
      card.disabled = true;
    }

    card.innerHTML = `
      <div class="stage-card-top">
        <span class="${completed ? "badge-done" : unlocked ? "badge-ready" : "badge-lock"}">
          ${completed ? "ผ่านแล้ว" : unlocked ? `Stage ${String(stage.order).padStart(3, "0")}` : "🔒 ล็อก"}
        </span>
        <span class="pill">LV ${stage.difficulty}</span>
      </div>
      <h3>${stage.title}</h3>
      <p>${unlocked ? stage.summary : stage.unlockHint}</p>
      <div class="stage-card-bottom">
        <span class="muted">${stage.generatedBy === "gemini" ? "AI สด" : "แผนสำรองในเครื่อง"}</span>
        <span class="muted">${stage.tags.slice(0, 3).join(" / ")}</span>
      </div>
    `;

    if (unlocked) {
      card.addEventListener("click", () => {
        startStage(stage.id);
      });
    }

    ui.stageGrid.appendChild(card);
  });
}

function renderTeacherBullets(step) {
  ui.teacherBullets.innerHTML = "";
  if (!step?.bulletPoints?.length) return;

  step.bulletPoints.forEach((point) => {
    const item = document.createElement("div");
    item.className = "teacher-point";
    item.textContent = point;
    ui.teacherBullets.appendChild(item);
  });
}

function renderAnswerArea(stage, step) {
  const key = answerDraftKey(stage.id, step.id);
  ui.answerArea.innerHTML = "";

  if (step.type === "teach") {
    const tip = document.createElement("div");
    tip.className = "memory-hook";
    tip.textContent = "ขั้นนี้คือการรับภาพให้ชัดก่อน อ่านจบแล้วกดปุ่มด้านล่างเพื่อไปขั้นต่อไป";
    ui.answerArea.appendChild(tip);
    return;
  }

  if (step.type === "choice") {
    const content = ui.choiceAnswerTemplate.content.cloneNode(true);
    const wrap = content.querySelector("#choiceAnswerWrap");
    const selectedAnswer = state.draftAnswers[key] || "";
    step.options.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      if (selectedAnswer === choice) button.classList.add("selected");
      button.textContent = choice;
      button.addEventListener("click", () => {
        state.draftAnswers[key] = choice;
        persist();
        renderAnswerArea(stage, step);
      });
      wrap.appendChild(button);
    });
    ui.answerArea.appendChild(content);
    return;
  }

  const content = ui.typeAnswerTemplate.content.cloneNode(true);
  const textarea = content.querySelector("#typedAnswerInput");
  textarea.value = state.draftAnswers[key] ?? "";
  textarea.placeholder = step.starterCode || "พิมพ์คำตอบหรือโค้ดตรงนี้";
  textarea.addEventListener("input", (event) => {
    state.draftAnswers[key] = event.target.value;
    clearFeedback();
    persist();

    const draftFeedback = analyzeDraftAnswer(step, event.target.value);
    setLiveFeedback(stage.id, step.id, draftFeedback.type, draftFeedback.text);
    renderFeedbackPanel(stage, step);
  });
  ui.answerArea.appendChild(content);
}

function renderLessonView() {
  const stage = getCurrentStage();
  if (!stage) {
    state.screen = "map";
    render();
    return;
  }

  const step = getCurrentStep(stage, state.activeStepIndex);
  if (!step) {
    state.screen = "map";
    render();
    return;
  }

  ui.lessonStageCode.textContent = `Stage ${String(stage.order).padStart(3, "0")}`;
  ui.lessonTitle.textContent = stage.title;
  ui.lessonSubtitle.textContent = stage.summary;
  ui.lessonHeartCount.textContent = String(state.hearts);
  ui.stepCounter.textContent = `Step ${state.activeStepIndex + 1} / ${stage.steps.length}`;
  ui.lessonProgressFill.style.width = `${Math.round(((state.activeStepIndex + 1) / stage.steps.length) * 100)}%`;
  ui.lessonDifficulty.textContent = getDifficultyLabel(stage);
  ui.stepTitle.textContent = step.title;
  const codePreviewText = selectCodePreview(step);
  const outputPreviewText = selectOutputPreview(step);

  ui.teacherSpeech.textContent = buildTeacherSpeech(stage, step);
  ui.memoryHook.textContent = step.memoryHook || stage.intro;
  renderTeacherBullets(step);
  ui.codePreview.textContent = codePreviewText || "// ช่องนี้ใช้แสดงตัวอย่างโค้ดหรือคำสั่งของขั้นนี้";
  ui.outputPreview.textContent = outputPreviewText || "เมื่อมีตัวอย่าง โค้ดด้านซ้ายจะเชื่อมกับผลลัพธ์ตรงนี้";
  ui.stepInstruction.textContent =
    step.type === "practice"
      ? `${step.instruction || "อ่านคำอธิบายให้ครบ แล้วลองเขียนโค้ดให้ตรงเป้าหมาย"} ทำช้า ๆ ได้เลย ตัวอย่างด้านบนเป็นเพียงหนึ่งวิธีที่ถูก คำตอบอื่นที่ถูกจริงก็ผ่านได้เหมือนกัน`
      : step.instruction || "อ่านคำอธิบายให้ครบ แล้วทำตามสิ่งที่ครูบอกทีละบรรทัด";

  if (step.answerReveal && !sameSnippet(step.answerReveal, codePreviewText)) {
    ui.answerReveal.classList.remove("hidden");
    ui.answerReveal.innerHTML = "";
    const label = document.createElement("strong");
    label.textContent = "เฉลยตัวอย่างอีกแบบหนึ่ง";
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "ถ้าตัวอย่างด้านบนยังไม่พอ ดูบล็อกนี้เพิ่มได้ คุณยังใช้วิธีอื่นที่ถูกจริงได้ ไม่จำเป็นต้องพิมพ์ให้เหมือนบรรทัดนี้ทุกตัวอักษร";
    const code = document.createElement("pre");
    code.className = "code-preview";
    code.textContent = step.answerReveal;
    ui.answerReveal.append(label, note, code);
  } else {
    ui.answerReveal.classList.add("hidden");
    ui.answerReveal.innerHTML = "";
  }

  renderAnswerArea(stage, step);

  renderFeedbackPanel(stage, step);

  ui.primaryActionBtn.disabled = runtime.answerEvaluationBusy;
  ui.primaryActionBtn.textContent = runtime.answerEvaluationBusy
    ? "กำลังตรวจคำตอบ..."
    : step.type === "teach"
      ? "ฉันเข้าใจแล้ว"
      : "ส่งคำตอบ";

  renderSpeechControls();
  maybeAutoSpeakLesson(stage, step);
}

function renderMapView() {
  const keyMessage = configuredKeys().length
    ? ""
    : " ยังไม่ได้ใส่ Gemini key ตอนนี้ครูสำรองในเครื่องจะสอนให้ก่อน และยังบันทึกทุกด่านไว้เหมือนเดิม";
  const message =
    state.generationBusy
      ? "ครู AI กำลังสร้างด่านใหม่เพิ่มให้อยู่"
      : state.generationError
        ? state.generationError
        : state.lastCampaignMessage ||
          `เลือกด่านที่อยากเล่นได้เลย ครูจะค่อย ๆ ปูพื้นฐานให้ช้าและซ้ำพอสำหรับมือใหม่ ด่านใหม่จะถูกสร้างต่อจากสิ่งที่คุณเคยเรียนมา${keyMessage}`;
  ui.campaignStatus.textContent = message;
  renderStageGrid();
}

function render() {
  renderTopHud();
  renderSettings();
  ui.mapScreen.classList.toggle("hidden", state.screen !== "map");
  ui.lessonScreen.classList.toggle("hidden", state.screen !== "lesson");

  if (state.screen === "lesson") {
    renderLessonView();
  } else {
    renderMapView();
    renderSpeechControls();
  }
}

async function validateModels(options = {}) {
  const targetModels = Array.isArray(options.models) && options.models.length
    ? MODEL_OPTIONS.filter((model) => options.models.includes(model))
    : [...MODEL_OPTIONS];
  const keys = configuredKeys();

  if (!keys.length) {
    invalidateModelStatuses();
    renderModelSelect();
    renderSettingsModelList();
    syncValidationButton();
    return;
  }

  if (runtime.modelValidationBusy) return;

  runtime.modelValidationBusy = true;
  runtime.modelValidationTargets = targetModels;
  runtime.modelValidationToken += 1;
  const validationToken = runtime.modelValidationToken;

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    for (let modelIndex = 0; modelIndex < targetModels.length; modelIndex += 1) {
      delete state.modelStatuses[`${keyIndex}:${targetModels[modelIndex]}`];
    }
  }

  persist();
  syncValidationButton();
  renderModelSelect();
  renderSettingsModelList();

  try {
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      for (let modelIndex = 0; modelIndex < targetModels.length; modelIndex += 1) {
        if (runtime.modelValidationToken !== validationToken) return;

        const modelName = targetModels[modelIndex];
        const result = await probeModel(keys[keyIndex], modelName);

        if (runtime.modelValidationToken !== validationToken) return;

        state.modelStatuses[`${keyIndex}:${modelName}`] = result;
        persist();
        renderModelSelect();
        renderSettingsModelList();
      }
    }
  } finally {
    if (runtime.modelValidationToken === validationToken) {
      runtime.modelValidationBusy = false;
      runtime.modelValidationTargets = [];
      syncValidationButton();
      renderModelSelect();
      renderSettingsModelList();
    }
  }
}

async function ensureStagePool() {
  const targetCount = Math.max(STAGE_BUFFER, state.completedStageIds.length + STAGE_BUFFER);
  if (state.generationBusy || state.stageCatalog.length >= targetCount) return;

  const generationToken = runtime.generationToken + 1;
  runtime.generationToken = generationToken;
  state.generationBusy = true;
  state.generationError = "";
  render();

  try {
    while (state.stageCatalog.length < targetCount) {
      if (runtime.generationToken !== generationToken) return;

      const stage = await createStage({
        order: state.stageCatalog.length + 1,
        reviewDeck: state.reviewDeck,
        journal: state.teacherJournal,
        keys: sanitizeKeys(state.apiKeys),
        models: MODEL_OPTIONS,
        preferredModel: state.preferredModel,
        statusMap: state.modelStatuses,
        onStatus: handleModelStatusUpdate,
        curriculumSeed: state.curriculumSeed,
      });

      if (runtime.generationToken !== generationToken) return;

      state.stageCatalog.push(stage);
      persist();
    }
  } catch (error) {
    if (runtime.generationToken === generationToken) {
      state.generationError = `สร้างด่านไม่สำเร็จ: ${error.message}`;
    }
  } finally {
    if (runtime.generationToken === generationToken) {
      state.generationBusy = false;
      render();
    }
  }
}

function removeReviewRecord(reviewSourceId) {
  if (!reviewSourceId) return;
  state.reviewDeck = state.reviewDeck.filter((item) => item.id !== reviewSourceId);
}

function initializeNavigation() {
  const activeStage = getCurrentStage();
  if (state.screen === "lesson" && activeStage) {
    history.replaceState({ screen: "map" }, "", window.location.href);
    history.pushState({ screen: "lesson", stageId: activeStage.id }, "", window.location.href);
    return;
  }

  history.replaceState({ screen: "map" }, "", window.location.href);
}

function exitLessonToMap({ fromHistory = false } = {}) {
  if (state.screen !== "lesson") {
    closeModelPicker();
    if (history.state?.screen !== "map") {
      history.replaceState({ screen: "map" }, "", window.location.href);
    }
    return;
  }

  if (state.activeStageId) {
    resetStageProgress(state.activeStageId);
  }

  state.screen = "map";
  state.activeStageId = null;
  state.activeStepIndex = 0;
  clearFeedback();
  clearLiveFeedback();
  stopSpeechPlayback("หยุดเสียงแล้ว กลับสู่หน้าแผนที่");
  closeModelPicker();
  persist();
  render();

  if (!fromHistory && history.state?.screen === "lesson") {
    history.back();
    return;
  }

  if (history.state?.screen !== "map") {
    history.replaceState({ screen: "map" }, "", window.location.href);
  }
}

function startStage(stageId) {
  const stage = getStageById(state.stageCatalog, stageId);
  if (!stage) return;

  stopSpeechPlayback("เตรียมอ่านคำอธิบายของด่านใหม่");
  runtime.speechLastAutoKey = "";
  resetStageProgress(stageId);
  state.activeStageId = stageId;
  state.activeStepIndex = 0;
  state.screen = "lesson";
  clearFeedback();
  clearLiveFeedback();
  persist();
  render();
  closeModelPicker();
  history.pushState({ screen: "lesson", stageId }, "", window.location.href);
}

async function completeStage(stage) {
  if (!isStageCompleted(stage.id)) {
    state.completedStageIds.push(stage.id);
    state.teacherJournal.push({
      stageId: stage.id,
      title: stage.title,
      tags: stage.tags,
    });
  }

  state.wins += 1;
  state.xp += stage.rewards.xp;
  state.gems += stage.rewards.gems;
  state.hearts = Math.min(MAX_HEARTS, state.hearts + stage.rewards.hearts);
  resetStageProgress(stage.id);
  updateStageAttempt(stage.id, {
    currentStep: 0,
    clears: (state.stageAttempts[stage.id]?.clears || 0) + 1,
  });
  updateCampaignMessage(`ผ่าน ${stage.title} แล้ว ได้ ${stage.rewards.xp} XP และปลดล็อกด่านถัดไป`);
  exitLessonToMap();

  ui.stageResultTitle.textContent = `${stage.title} ผ่านแล้ว`;
  ui.stageResultBody.textContent =
    `ครูบันทึกด่านนี้ไว้ในเครื่องแล้ว คุณจะกลับมาเล่นซ้ำเมื่อไรก็ได้ ` +
    `และด่านต่อไปจะพยายามต่อจากความจำเดิมของคุณ`;
  if (!ui.stageResultDialog.open) {
    ui.stageResultDialog.showModal();
  }

  await ensureStagePool();
}

async function handlePrimaryAction() {
  const stage = getCurrentStage();
  const step = getCurrentStep(stage, state.activeStepIndex);
  if (!stage || !step) return;

  if (step.type === "teach") {
    stopSpeechPlayback("หยุดเสียงของขั้นก่อนหน้าแล้ว");
    state.activeStepIndex += 1;
    clearFeedback();
    clearLiveFeedback();
    updateStageAttempt(stage.id, { currentStep: state.activeStepIndex });
    if (state.activeStepIndex >= stage.steps.length) {
      await completeStage(stage);
      return;
    }
    persist();
    render();
    return;
  }

  const draftKey = answerDraftKey(stage.id, step.id);
  const answer = state.draftAnswers[draftKey] || "";
  let result = compareStepAnswer(step, answer);

  if (result.requiresAiJudge && configuredKeys().length) {
    runtime.answerEvaluationBusy = true;
    setLiveFeedback(stage.id, step.id, "", "กำลังให้ AI ช่วยตรวจความหมายของโค้ดและความถูกต้องจริง...");
    render();

    try {
      const aiResult = await requestAnswerEvaluation({
        keys: configuredKeys(),
        models: MODEL_OPTIONS,
        preferredModel: state.preferredModel,
        statusMap: state.modelStatuses,
        onStatus: handleModelStatusUpdate,
        step,
        answer,
      });

      if (aiResult) {
        result = {
          correct: aiResult.correct,
          feedback: aiResult.feedback,
        };
      }
    } catch {
      result = {
        correct: false,
        feedback: `${result.feedback}\nตอนนี้ AI ช่วยตัดสินเพิ่มไม่สำเร็จ ลองปรับให้ชัดขึ้นอีกนิดแล้วกดส่งใหม่`,
      };
    } finally {
      runtime.answerEvaluationBusy = false;
    }
  }

  if (result.correct) {
    playSuccess();
    stopSpeechPlayback("หยุดเสียงของขั้นก่อนหน้าแล้ว");
    state.xp += step.type === "choice" ? 16 : 22;
    state.gems += step.type === "choice" ? 4 : 6;
    removeReviewRecord(step.reviewSourceId);
    state.activeStepIndex += 1;
    clearFeedback();
    clearLiveFeedback();
    updateStageAttempt(stage.id, { currentStep: state.activeStepIndex });
    persist();

    if (state.activeStepIndex >= stage.steps.length) {
      await completeStage(stage);
      return;
    }

    render();
    return;
  }

  playFail();
  clearLiveFeedback();
  const heartsBefore = state.hearts;
  state.hearts = nextHeartsAfterFailure(state.hearts, MAX_HEARTS);
  updateStageAttempt(stage.id, { mistakes: (state.stageAttempts[stage.id]?.mistakes || 0) + 1 });

  const reviewRecord = buildReviewRecord(stage, step);
  if (!state.reviewDeck.some((item) => item.id === reviewRecord.id)) {
    state.reviewDeck.push(reviewRecord);
  }

  if (heartsBefore === 1) {
    state.losses += 1;
    setFeedback(
      "error",
      `${result.feedback}\nหัวใจหมดแล้ว ครูช่วยชุบชีวิตให้กลับมาฝึกต่อ และจะพาเอาสิ่งนี้กลับมาทบทวนอีกในด่านถัดไป`,
    );
  } else {
    setFeedback("error", result.feedback);
  }

  persist();
  render();
}

function parseBulkKeys(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/AIza[0-9A-Za-z\-_]+/);
      return match ? match[0] : line.replace(/^key\s*=\s*/i, "").trim();
    })
    .filter(Boolean);
}

function openProfile() {
  ui.profileNameInput.value = state.profileName;
  ui.profileDialog.showModal();
}

function resetLearningProgress() {
  const confirmed = window.confirm(
    "ต้องการรีเซ็ตเส้นทางเรียนทั้งหมดใช่ไหม?\n\nระบบจะล้างด่านที่ปลดล็อก, XP, หัวใจ, review deck และ stage ที่สร้างไว้ แล้วเริ่มสร้างเส้นทางใหม่ตั้งแต่ต้น แต่จะเก็บโปรไฟล์กับ API keys ไว้เหมือนเดิม",
  );

  if (!confirmed) return;

  runtime.generationToken += 1;
  stopSpeechPlayback("รีเซ็ตเส้นทางเรียนและหยุดเสียงแล้ว");
  runtime.speechLastAutoKey = "";
  closeModelPicker();
  clearFeedback();
  clearLiveFeedback();

  state.curriculumSeed = createCurriculumSeed();
  state.screen = "map";
  state.hearts = MAX_HEARTS;
  state.gems = 0;
  state.xp = 0;
  state.wins = 0;
  state.losses = 0;
  state.stageCatalog = [];
  state.completedStageIds = [];
  state.activeStageId = null;
  state.activeStepIndex = 0;
  state.reviewDeck = [];
  state.teacherJournal = [];
  state.stageAttempts = {};
  state.draftAnswers = {};
  state.lessonFeedback = { type: "", text: "" };
  state.generationBusy = false;
  state.generationError = "";
  state.lastCampaignMessage = "รีเซ็ตเส้นทางการเรียนแล้ว กำลังสร้างด่านชุดใหม่ให้ตั้งแต่พื้นฐานที่สุด";

  if (ui.stageResultDialog.open) {
    ui.stageResultDialog.close();
  }

  if (ui.settingsDialog.open) {
    ui.settingsDialog.close();
  }

  if (history.state?.screen !== "map") {
    history.replaceState({ screen: "map" }, "", window.location.href);
  }

  persist();
  render();
  void ensureStagePool();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      playClick();
    }

    if (runtime.modelPickerOpen && !ui.modelPicker.contains(event.target)) {
      closeModelPicker();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && runtime.modelPickerOpen) {
      closeModelPicker();
      return;
    }

    if (event.key === "Escape" && runtime.speechActive) {
      stopSpeechPlayback("หยุดเสียงแล้ว");
      return;
    }

    if (event.key === "Escape" && state.screen === "lesson") {
      exitLessonToMap();
    }
  });

  window.addEventListener("popstate", (event) => {
    if (event.state?.screen === "lesson") {
      history.replaceState({ screen: "map" }, "", window.location.href);
    }

    if (state.screen === "lesson") {
      exitLessonToMap({ fromHistory: true });
      return;
    }

    if (history.state?.screen !== "map") {
      history.replaceState({ screen: "map" }, "", window.location.href);
    }
  });

  ui.openProfileBtn.addEventListener("click", openProfile);
  ui.modelPickerButton.addEventListener("click", () => {
    setModelPickerOpen(!runtime.modelPickerOpen);
  });
  ui.settingsBtn.addEventListener("click", () => {
    closeModelPicker();
    ui.settingsDialog.showModal();
  });
  ui.speakLessonBtn.addEventListener("click", () => {
    const stage = getCurrentStage();
    const step = getCurrentStep(stage, state.activeStepIndex);
    if (!stage || !step) return;

    const speechKey = currentSpeechStepKey(stage, step);
    if (runtime.speechActive && runtime.speechCurrentKey === speechKey) {
      stopSpeechPlayback("หยุดเสียงแล้ว");
      return;
    }

    void speakCurrentLesson(stage, step, { statusPrefix: "กำลังอ่านคำอธิบาย " });
  });
  ui.primaryActionBtn.addEventListener("click", async () => {
    await handlePrimaryAction();
  });
  ui.lessonBackBtn.addEventListener("click", () => {
    exitLessonToMap();
  });
  ui.addKeyRowBtn.addEventListener("click", () => {
    state.apiKeys.push("");
    invalidateModelStatuses();
    renderSettings();
    renderModelSelect();
  });
  ui.bulkPasteBtn.addEventListener("click", () => ui.bulkPasteDialog.showModal());
  ui.bulkPasteApplyBtn.addEventListener("click", () => {
    const keys = parseBulkKeys(ui.bulkPasteInput.value);
    if (keys.length) {
      state.apiKeys = [...new Set([...sanitizeKeys(state.apiKeys), ...keys])];
      invalidateModelStatuses();
      renderSettings();
      renderModelSelect();
      void validateModels();
    }
    ui.bulkPasteInput.value = "";
    ui.bulkPasteDialog.close();
  });
  ui.validateModelsBtn.addEventListener("click", async () => {
    await validateModels();
  });
  ui.speechAutoReadToggle.addEventListener("change", (event) => {
    state.speechAutoRead = Boolean(event.target.checked);
    persist();
    renderSpeechControls();
  });
  ui.speechVoiceFilterSelect.addEventListener("change", (event) => {
    state.speechVoiceFilter = normalizeSpeechFilter(event.target.value);
    const nextVoice = filteredSpeechVoices()[0];
    if (nextVoice) {
      state.speechVoiceURI = nextVoice.voiceURI;
    }
    persist();
    renderSpeechSettings();
    renderSpeechControls();
  });
  ui.speechVoiceSelect.addEventListener("change", (event) => {
    state.speechVoiceURI = event.target.value;
    persist();
    renderSpeechSettings();
    renderSpeechControls();
  });
  ui.speechRateInput.addEventListener("input", (event) => {
    state.speechRate = normalizeBoundedNumber(event.target.value, 0.75, 1.25, 1);
    persist();
    renderSpeechSettings();
  });
  ui.speechPitchInput.addEventListener("input", (event) => {
    state.speechPitch = normalizeBoundedNumber(event.target.value, 0.8, 1.2, 1);
    persist();
    renderSpeechSettings();
  });
  ui.speechVolumeInput.addEventListener("input", (event) => {
    state.speechVolume = normalizeBoundedNumber(event.target.value, 0.4, 1, 1);
    persist();
    renderSpeechSettings();
  });
  ui.previewVoiceBtn.addEventListener("click", () => {
    speakWithCurrentVoice(
      "สวัสดี นี่คือตัวอย่างเสียงภาษาไทยของครู AI ฟรีในเครื่อง ค่าปกติของระบบจะยังไม่อ่านเองจนกว่าคุณจะกดปุ่มอ่าน",
      "voice-preview",
      "กำลังลองเสียงตัวอย่าง ",
    );
  });
  ui.stopVoiceBtn.addEventListener("click", () => {
    stopSpeechPlayback("หยุดเสียงแล้ว");
  });
  ui.refreshVoicesBtn.addEventListener("click", () => {
    refreshSpeechVoices();
    renderSpeechSettings();
    renderSpeechControls();
  });
  ui.resetLearningBtn.addEventListener("click", () => {
    resetLearningProgress();
  });
  ui.saveSettingsBtn.addEventListener("click", () => {
    persist();
    render();
    ui.settingsDialog.close();
    if (configuredKeys().length) {
      void validateModels();
    }
  });
  ui.profileSaveBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    state.profileName = ui.profileNameInput.value.trim();
    const file = ui.profileAvatarInput.files?.[0];
    if (file) {
      state.profileAvatar = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
    state.askedForProfile = true;
    persist();
    render();
    ui.profileDialog.close();
  });
  ui.profileSkipBtn.addEventListener("click", () => {
    state.askedForProfile = true;
    persist();
  });
  ui.stageResultBtn.addEventListener("click", () => {
    ui.stageResultDialog.close();
  });
}

window.render_game_to_text = () =>
  JSON.stringify({
    screen: state.screen,
    hearts: state.hearts,
    xp: state.xp,
    wins: state.wins,
    losses: state.losses,
    playerId: state.playerId,
    activeStageId: state.activeStageId,
    activeStepIndex: state.activeStepIndex,
    availableStages: state.stageCatalog.map((stage) => ({
      id: stage.id,
      order: stage.order,
      title: stage.title,
      unlocked: stage.order <= unlockedStageOrder() || isStageCompleted(stage.id),
    })),
  });

window.advanceTime = () => {};

initializeNavigation();
bindEvents();
initializeSpeech(handleSpeechVoicesChanged);
render();

if (!state.askedForProfile) {
  setTimeout(() => openProfile(), 250);
}

ensureStagePool();

if (configuredKeys().length) {
  void validateModels();
}
