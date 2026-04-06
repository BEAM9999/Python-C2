const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

function isQuotaError(payloadText, status) {
  return status === 429 || /quota|exhausted|rate limit/i.test(payloadText);
}

function stripJsonFence(text) {
  return text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
}

async function sendGeminiRequest({ apiKey, modelName, body }) {
  const response = await fetch(`${API_ROOT}/${modelName}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { response, text, json };
}

function getOrderedModels(models, preferredModel) {
  return preferredModel ? [preferredModel, ...models.filter((model) => model !== preferredModel)] : [...models];
}

function getCandidateText(text, json) {
  return json?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("")?.trim() || stripJsonFence(text);
}

async function requestJsonAcrossModels({
  keys,
  models,
  preferredModel,
  statusMap,
  onStatus,
  prompt,
  generationConfig,
}) {
  const orderedModels = getOrderedModels(models, preferredModel);

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]?.trim();
    if (!key) continue;

    for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex += 1) {
      const modelName = orderedModels[modelIndex];
      const statusForModel = statusMap?.[`${keyIndex}:${modelName}`];
      if (statusForModel?.status === "quota") continue;

      try {
        const { response, text, json } = await sendGeminiRequest({
          apiKey: key,
          modelName,
          body: {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
              ...generationConfig,
            },
          },
        });

        if (response.ok) {
          onStatus?.(keyIndex, modelName, { status: "ready", detail: "พร้อมใช้งาน" });
          const candidateText = getCandidateText(text, json);

          if (candidateText) {
            try {
              return JSON.parse(candidateText);
            } catch {
              continue;
            }
          }
        }

        const payloadText = text || JSON.stringify(json);
        const nextStatus = isQuotaError(payloadText, response.status) ? "quota" : "error";
        onStatus?.(keyIndex, modelName, {
          status: nextStatus,
          detail: json?.error?.message || `HTTP ${response.status}`,
        });
      } catch (error) {
        onStatus?.(keyIndex, modelName, { status: "error", detail: error.message });
      }
    }
  }

  return null;
}

export async function probeModel(apiKey, modelName) {
  if (!apiKey) {
    return { ok: false, status: "missing-key", detail: "ยังไม่มี API key" };
  }

  try {
    const { response, text } = await sendGeminiRequest({
      apiKey,
      modelName,
      body: {
        contents: [{ role: "user", parts: [{ text: "Reply with READY only." }] }],
        generationConfig: { maxOutputTokens: 5, temperature: 0 },
      },
    });

    if (response.ok) {
      return { ok: true, status: "ready", detail: "พร้อมใช้งาน" };
    }

    return {
      ok: false,
      status: isQuotaError(text, response.status) ? "quota" : "error",
      detail: text.slice(0, 140) || `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, status: "error", detail: error.message };
  }
}

export async function requestTeacherStage({
  keys,
  models,
  preferredModel,
  blueprint,
  order,
  priorJournal,
  statusMap,
  onStatus,
  curriculumSeed,
}) {
  const history = priorJournal
    .slice(-8)
    .map((entry) => `${entry.title} | tags: ${(entry.tags || []).join(", ")}`)
    .join("\n");

  const prompt = `
You are creating one stage for a gamified Python learning site for Thai absolute beginners.
Return JSON only, with no markdown fences.

Rules:
- Teach before asking.
- Thai explanation, English code.
- The learner is a true beginner who gets confused easily, so explain very slowly and very concretely.
- Move in tiny steps. Prefer one micro-concept per stage.
- Reuse and recap earlier ideas instead of jumping ahead fast.
- The tone must be patient, warm, and extremely beginner-friendly, like teaching someone who has never seen code before.
- No topic repetition if it already appears in prior history.
- Make the learner type real Python or real terminal commands where appropriate.
- You may show one valid example first for easier levels, but do not design the task so the learner must match the sample exactly.
- Prefer goal-based instructions such as the intended behavior, concept, or output.
- Treat answerReveal and expectedAnswer as one valid example, not the only acceptable solution.
- Avoid wording like "type every character exactly" unless the task is a literal terminal command that truly must be exact.
- Use 5 to 7 steps per stage.
- Include at least 2 teach steps and at least 2 active steps (practice, choice, or command).
- For the first half of the curriculum, prefer a slow pattern such as watch -> copy -> recognize -> edit a little -> recap.
- Fill explanation with 2 to 4 short Thai paragraphs for beginners, not just one sentence.
- teacherPrompt should be a short Thai lesson goal, not a long explanation block.
- code must contain only a code example, command example, or URL example. Never put Thai explanation sentences in code.
- output must contain only the literal output or visible result. Never put Thai explanation sentences in output.
- answerReveal and expectedAnswer must contain only code or command text, never explanatory prose.
- The stage must be clean, correct, and child-friendly but technically true.

Blueprint:
- Order: ${order}
- Title: ${blueprint.title}
- Summary: ${blueprint.summary}
- Difficulty: ${blueprint.difficulty}
- Tags: ${(blueprint.tags || []).join(", ")}
- Hint: ${blueprint.unlockHint}
- Extra teaching goal: ${blueprint.teacherPrompt}
- Curriculum seed for variation: ${curriculumSeed || "default-seed"}

Prior completed history:
${history || "None yet"}

JSON shape:
{
  "intro": "string",
  "completionTeaser": "string",
  "rewards": { "xp": number, "gems": number, "hearts": number },
  "steps": [
    {
      "id": "string",
      "type": "teach|practice|choice|command",
      "title": "string",
      "teacherPrompt": "string",
      "explanation": "2-4 short Thai paragraphs for a very beginner learner",
      "bulletPoints": ["string"],
      "code": "code/command/url only",
      "output": "literal output/result only",
      "instruction": "string",
      "starterCode": "code/command only",
      "answerReveal": "one valid code/command example only",
      "expectedAnswer": "one valid code/command example only",
      "acceptedAnswers": ["string"],
      "expectedOutput": "string",
      "correctionFocus": "string",
      "successText": "string",
      "memoryHook": "string",
      "options": ["string"]
    }
  ]
}
`;

  return requestJsonAcrossModels({
    keys,
    models,
    preferredModel,
    statusMap,
    onStatus,
    prompt,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2200,
    },
  });
}

export async function requestAnswerEvaluation({
  keys,
  models,
  preferredModel,
  statusMap,
  onStatus,
  step,
  answer,
}) {
  const prompt = `
You are grading a learner answer inside a Thai beginner Python learning game.
Return JSON only.

Judging rules:
- Be permissive.
- Accept any answer that is syntactically valid and semantically accomplishes the task.
- Do not require the learner to match the sample solution exactly.
- Different quote styles, spacing, string wording, variable names, or equivalent code patterns are acceptable when the task goal is still satisfied.
- Treat expectedAnswer and answerReveal as only one valid example.
- Only require exact text for literal shell commands or multiple-choice answers.
- If the answer is wrong, point out the first concrete issue in Thai and say where it is when possible.
- If the answer is correct, say briefly why it is accepted even if it differs from the sample.

Return shape:
{
  "correct": true,
  "category": "correct|syntax|concept|format",
  "feedbackThai": "string",
  "line": 1,
  "column": 1
}

Task context JSON:
${JSON.stringify(
    {
      type: step.type,
      title: step.title,
      instruction: step.instruction,
      teacherPrompt: step.teacherPrompt,
      correctionFocus: step.correctionFocus,
      expectedOutput: step.expectedOutput,
      expectedAnswer: step.expectedAnswer,
      acceptedAnswers: step.acceptedAnswers || [],
      answerReveal: step.answerReveal,
    },
    null,
    2,
  )}

Learner answer:
${answer}
`;

  const result = await requestJsonAcrossModels({
    keys,
    models,
    preferredModel,
    statusMap,
    onStatus,
    prompt,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 400,
    },
  });

  if (!result || typeof result.correct !== "boolean") {
    return null;
  }

  const line = Number.isFinite(Number(result.line)) ? Number(result.line) : null;
  const column = Number.isFinite(Number(result.column)) ? Number(result.column) : null;
  const location = line ? `บรรทัด ${line}${column ? ` คอลัมน์ ${column}` : ""}: ` : "";

  return {
    correct: result.correct,
    category: result.category || (result.correct ? "correct" : "concept"),
    feedback:
      result.feedbackThai ||
      (result.correct
        ? "คำตอบนี้ถูกต้องตามเป้าหมายของโจทย์ แม้จะไม่เหมือนตัวอย่างทุกตัวอักษร"
        : `${location}คำตอบนี้ยังไม่ตรงเป้าหมายของโจทย์`),
  };
}
