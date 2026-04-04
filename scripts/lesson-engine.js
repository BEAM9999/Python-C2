export function calculateLevel(xp) {
  return Math.max(1, Math.floor(xp / 140) + 1);
}

export function getStageById(stageCatalog, stageId) {
  return stageCatalog.find((stage) => stage.id === stageId) || null;
}

export function getCurrentStep(stage, stepIndex) {
  return stage?.steps?.[Math.min(stepIndex, (stage?.steps?.length || 1) - 1)] || null;
}

function normalizeText(value) {
  return (value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function normalizeCommand(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function getNormalizedValue(step, value) {
  if (step.type === "command") {
    return normalizeCommand(value);
  }
  return normalizeText(value);
}

function getExpectedPool(step) {
  const answers = [step.expectedAnswer, ...(step.acceptedAnswers || [])].filter(Boolean);
  return answers;
}

function findFirstDiff(expected, actual) {
  const expectedChars = [...expected];
  const actualChars = [...actual];
  let index = 0;

  while (
    index < expectedChars.length &&
    index < actualChars.length &&
    expectedChars[index] === actualChars[index]
  ) {
    index += 1;
  }

  return {
    position: index + 1,
    expectedChar: expectedChars[index] || "(จบประโยคแล้ว)",
    actualChar: actualChars[index] || "(ยังไม่ได้พิมพ์)",
  };
}

export function compareStepAnswer(step, answer) {
  if (!step) {
    return { correct: false, feedback: "ยังไม่มีด่านนี้ในระบบ" };
  }

  if (step.type === "teach") {
    return {
      correct: true,
      feedback: "ด่านสอนขั้นนี้ผ่านได้เลย เพราะหน้าที่ของเราคืออ่านให้เข้าใจก่อน",
    };
  }

  const normalizedAnswer = getNormalizedValue(step, answer);
  const expectedPool = getExpectedPool(step).map((entry) => getNormalizedValue(step, entry));

  if (expectedPool.includes(normalizedAnswer)) {
    return {
      correct: true,
      feedback: step.successText || "ถูกต้องมาก นี่คือรูปแบบที่ด่านนี้ต้องการพอดี",
    };
  }

  const nearest = expectedPool[0] || "";
  const diff = findFirstDiff(nearest, normalizedAnswer);
  return {
    correct: false,
    feedback:
      `ยังไม่ตรงนะ ผิดครั้งแรกตรงตำแหน่งที่ ${diff.position} ` +
      `ควรเป็น "${diff.expectedChar}" แต่ตอนนี้เป็น "${diff.actualChar}"\n` +
      `รูปแบบที่ถูกคือ ${step.expectedAnswer || nearest}`,
  };
}

export function buildReviewRecord(stage, step) {
  return {
    id: `${stage.id}:${step.id}`,
    stageId: stage.id,
    stageTitle: stage.title,
    teacherPrompt: `ก่อนเริ่มด่านใหม่ ครูอยากให้ทบทวนสิ่งที่เคยพลาดใน "${stage.title}" อีกครั้ง`,
    instruction: step.instruction || step.title,
    starterCode: step.starterCode || "",
    expectedAnswer: step.expectedAnswer || "",
    acceptedAnswers: step.acceptedAnswers || [],
    expectedOutput: step.expectedOutput || "",
    correctionFocus: step.correctionFocus || "",
    tags: stage.tags || [],
  };
}

export function nextHeartsAfterFailure(currentHearts, maxHearts) {
  if (currentHearts > 1) {
    return currentHearts - 1;
  }

  return Math.max(3, Math.floor(maxHearts / 2));
}
