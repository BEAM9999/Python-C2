import { DEFAULT_AVATAR, MAX_HEARTS, MODEL_OPTIONS, STAGE_BUFFER } from "./data.js";
import { playClick, playFail, playSuccess } from "./audio.js";
import { probeModel } from "./gemini.js";
import { buildReviewRecord, calculateLevel, compareStepAnswer, getCurrentStep, getStageById, nextHeartsAfterFailure } from "./lesson-engine.js";
import { createStage } from "./stage-generator.js";
import { loadState, saveState } from "./storage.js";

const DEFAULT_STATE = {
  profileName: "",
  profileAvatar: DEFAULT_AVATAR,
  playerId: "",
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
};

function createPlayerId() {
  return `ID-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function migrateState(rawState) {
  const base = { ...DEFAULT_STATE, ...(rawState || {}) };
  return {
    ...base,
    profileAvatar: base.profileAvatar || DEFAULT_AVATAR,
    playerId: base.playerId || createPlayerId(),
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
    screen: base.screen === "lesson" ? "lesson" : "map",
  };
}

const state = migrateState(loadState(DEFAULT_STATE));

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
  modelSelect: document.querySelector("#modelSelect"),
  settingsBtn: document.querySelector("#settingsBtn"),
  lessonStageCode: document.querySelector("#lessonStageCode"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonSubtitle: document.querySelector("#lessonSubtitle"),
  lessonHeartCount: document.querySelector("#lessonHeartCount"),
  stepCounter: document.querySelector("#stepCounter"),
  lessonProgressFill: document.querySelector("#lessonProgressFill"),
  lessonDifficulty: document.querySelector("#lessonDifficulty"),
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
  validateModelsBtn: document.querySelector("#validateModelsBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
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

function answerDraftKey(stageId, stepId) {
  return `${stageId}:${stepId}`;
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

function getDifficultyLabel(stage) {
  if (!stage) return "ง่าย";
  if (stage.difficulty <= 2) return "เริ่มต้น";
  if (stage.difficulty <= 4) return "กลางทาง";
  if (stage.difficulty <= 6) return "จริงจัง";
  return "โปรเจกต์ใหญ่";
}

function renderModelSelect() {
  ui.modelSelect.innerHTML = "";
  MODEL_OPTIONS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    const statuses = Object.entries(state.modelStatuses).filter(([key]) => key.endsWith(`:${model}`));
    const anyQuota = statuses.some(([, value]) => value.status === "quota");
    option.textContent = anyQuota ? `${model} (quota)` : model;
    if (model === state.preferredModel) option.selected = true;
    ui.modelSelect.appendChild(option);
  });
}

function renderSettings() {
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
      persist();
    });
    row.querySelector("button").addEventListener("click", () => {
      state.apiKeys.splice(index, 1);
      if (!state.apiKeys.length) state.apiKeys.push("");
      renderSettings();
      persist();
    });
    ui.apiKeyList.appendChild(row);
  });

  ui.settingsModelList.innerHTML = "";
  MODEL_OPTIONS.forEach((model) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "model-status-card";
    const statuses = Object.entries(state.modelStatuses).filter(([key]) => key.endsWith(`:${model}`));
    const ready = statuses.some(([, value]) => value.status === "ready");
    const quota = statuses.some(([, value]) => value.status === "quota");
    card.innerHTML = `
      <div class="panel-header">
        <strong>${model}</strong>
        <span class="${ready ? "badge-ready" : quota ? "badge-lock" : "pill"}">
          ${ready ? "พร้อม" : quota ? "โควต้าหมด" : "ยังไม่ตรวจ"}
        </span>
      </div>
      <p class="muted">กดเพื่อเลือกเป็นโมเดลหลัก</p>
    `;
    card.addEventListener("click", () => {
      state.preferredModel = model;
      renderModelSelect();
      renderSettings();
      persist();
    });
    ui.settingsModelList.appendChild(card);
  });
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
  textarea.value = state.draftAnswers[key] ?? step.starterCode ?? "";
  textarea.addEventListener("input", (event) => {
    state.draftAnswers[key] = event.target.value;
    persist();
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
  ui.teacherSpeech.textContent = step.teacherPrompt || stage.intro;
  ui.memoryHook.textContent = step.memoryHook || stage.intro;
  renderTeacherBullets(step);
  ui.codePreview.textContent = step.code || "// ขั้นนี้เน้นการฟังคำอธิบายจากครู";
  ui.outputPreview.textContent = step.output || step.expectedOutput || "ผลลัพธ์จะอยู่ตรงนี้เมื่อครูยกตัวอย่าง";
  ui.stepInstruction.textContent =
    step.instruction || "อ่านคำอธิบายให้ครบ แล้วทำตามสิ่งที่ครูบอกทีละบรรทัด";

  if (step.answerReveal) {
    ui.answerReveal.classList.remove("hidden");
    ui.answerReveal.innerHTML = "";
    const label = document.createElement("strong");
    label.textContent = "ครูเปิดคำตอบให้เห็นก่อน";
    const code = document.createElement("pre");
    code.className = "code-preview";
    code.textContent = step.answerReveal;
    ui.answerReveal.append(label, code);
  } else {
    ui.answerReveal.classList.add("hidden");
    ui.answerReveal.innerHTML = "";
  }

  renderAnswerArea(stage, step);

  ui.feedbackPanel.className = `feedback-panel ${state.lessonFeedback.type || ""}`.trim();
  ui.feedbackPanel.textContent =
    state.lessonFeedback.text ||
    (step.type === "teach"
      ? "ขั้นนี้เน้นฟังให้เข้าใจและจำภาพของโค้ดก่อน"
      : "เมื่อพร้อมแล้วกดส่งคำตอบ ครูจะเช็กให้ทันที");

  ui.primaryActionBtn.textContent = step.type === "teach" ? "ฉันเข้าใจแล้ว" : "ส่งคำตอบ";
}

function renderMapView() {
  const keyMessage = sanitizeKeys(state.apiKeys).length
    ? ""
    : " ยังไม่ได้ใส่ Gemini key ตอนนี้ครูสำรองในเครื่องจะสอนให้ก่อน และยังบันทึกทุกด่านไว้เหมือนเดิม";
  const message =
    state.generationBusy
      ? "ครู AI กำลังสร้างด่านใหม่เพิ่มให้อยู่"
      : state.generationError
        ? state.generationError
        : state.lastCampaignMessage ||
          `เลือกด่านที่อยากเล่นได้เลย ด่านใหม่จะถูกสร้างต่อจากสิ่งที่คุณเคยเรียนมา${keyMessage}`;
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
  }
}

async function validateModels() {
  const keys = sanitizeKeys(state.apiKeys);
  if (!keys.length) return;

  ui.validateModelsBtn.disabled = true;
  ui.validateModelsBtn.textContent = "กำลังตรวจสอบ...";

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    for (let modelIndex = 0; modelIndex < MODEL_OPTIONS.length; modelIndex += 1) {
      const modelName = MODEL_OPTIONS[modelIndex];
      const result = await probeModel(keys[keyIndex], modelName);
      state.modelStatuses[`${keyIndex}:${modelName}`] = result;
      persist();
      renderModelSelect();
      renderSettings();
    }
  }

  ui.validateModelsBtn.disabled = false;
  ui.validateModelsBtn.textContent = "ตรวจสอบโมเดลตอนนี้";
}

async function ensureStagePool() {
  const targetCount = Math.max(STAGE_BUFFER, state.completedStageIds.length + STAGE_BUFFER);
  if (state.generationBusy || state.stageCatalog.length >= targetCount) return;

  state.generationBusy = true;
  state.generationError = "";
  render();

  try {
    while (state.stageCatalog.length < targetCount) {
      const stage = await createStage({
        order: state.stageCatalog.length + 1,
        reviewDeck: state.reviewDeck,
        journal: state.teacherJournal,
        keys: sanitizeKeys(state.apiKeys),
        models: MODEL_OPTIONS,
        preferredModel: state.preferredModel,
        statusMap: state.modelStatuses,
        onStatus: (keyIndex, modelName, value) => {
          state.modelStatuses[`${keyIndex}:${modelName}`] = value;
          persist();
          renderSettings();
          renderModelSelect();
        },
      });

      state.stageCatalog.push(stage);
      persist();
    }
  } catch (error) {
    state.generationError = `สร้างด่านไม่สำเร็จ: ${error.message}`;
  } finally {
    state.generationBusy = false;
    render();
  }
}

function removeReviewRecord(reviewSourceId) {
  if (!reviewSourceId) return;
  state.reviewDeck = state.reviewDeck.filter((item) => item.id !== reviewSourceId);
}

function startStage(stageId) {
  const stage = getStageById(state.stageCatalog, stageId);
  if (!stage) return;

  const completed = isStageCompleted(stageId);
  state.activeStageId = stageId;
  state.activeStepIndex = completed ? 0 : state.stageAttempts[stageId]?.currentStep || 0;
  state.screen = "lesson";
  clearFeedback();
  updateStageAttempt(stageId, { currentStep: state.activeStepIndex });
  persist();
  render();
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
  state.screen = "map";
  state.activeStageId = null;
  state.activeStepIndex = 0;
  clearFeedback();
  updateStageAttempt(stage.id, {
    currentStep: 0,
    clears: (state.stageAttempts[stage.id]?.clears || 0) + 1,
  });
  updateCampaignMessage(`ผ่าน ${stage.title} แล้ว ได้ ${stage.rewards.xp} XP และปลดล็อกด่านถัดไป`);
  persist();
  render();

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
    state.activeStepIndex += 1;
    clearFeedback();
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
  const result = compareStepAnswer(step, answer);

  if (result.correct) {
    playSuccess();
    state.xp += step.type === "choice" ? 16 : 22;
    state.gems += step.type === "choice" ? 4 : 6;
    removeReviewRecord(step.reviewSourceId);
    state.activeStepIndex += 1;
    clearFeedback();
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

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      playClick();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.screen === "lesson") {
      state.screen = "map";
      state.activeStageId = null;
      clearFeedback();
      persist();
      render();
    }
  });

  ui.openProfileBtn.addEventListener("click", openProfile);
  ui.settingsBtn.addEventListener("click", () => ui.settingsDialog.showModal());
  ui.primaryActionBtn.addEventListener("click", async () => {
    await handlePrimaryAction();
  });
  ui.modelSelect.addEventListener("change", (event) => {
    state.preferredModel = event.target.value;
    persist();
  });
  ui.addKeyRowBtn.addEventListener("click", () => {
    state.apiKeys.push("");
    renderSettings();
    persist();
  });
  ui.bulkPasteBtn.addEventListener("click", () => ui.bulkPasteDialog.showModal());
  ui.bulkPasteApplyBtn.addEventListener("click", () => {
    const keys = parseBulkKeys(ui.bulkPasteInput.value);
    if (keys.length) {
      state.apiKeys = [...new Set([...sanitizeKeys(state.apiKeys), ...keys])];
      persist();
      renderSettings();
    }
    ui.bulkPasteInput.value = "";
    ui.bulkPasteDialog.close();
  });
  ui.validateModelsBtn.addEventListener("click", async () => {
    await validateModels();
  });
  ui.saveSettingsBtn.addEventListener("click", () => {
    persist();
    render();
    ui.settingsDialog.close();
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

bindEvents();
render();

if (!state.askedForProfile) {
  setTimeout(() => openProfile(), 250);
}

ensureStagePool();

if (sanitizeKeys(state.apiKeys).length) {
  validateModels();
}
