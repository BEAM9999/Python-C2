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
}) {
  const orderedModels = preferredModel
    ? [preferredModel, ...models.filter((model) => model !== preferredModel)]
    : [...models];

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
- No topic repetition if it already appears in prior history.
- Make the learner type real Python or real terminal commands where appropriate.
- Show exact correct code first for easier levels.
- The stage must be clean, correct, and child-friendly but technically true.

Blueprint:
- Order: ${order}
- Title: ${blueprint.title}
- Summary: ${blueprint.summary}
- Difficulty: ${blueprint.difficulty}
- Tags: ${(blueprint.tags || []).join(", ")}
- Hint: ${blueprint.unlockHint}
- Extra teaching goal: ${blueprint.teacherPrompt}

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
      "explanation": "string",
      "bulletPoints": ["string"],
      "code": "string",
      "output": "string",
      "instruction": "string",
      "starterCode": "string",
      "answerReveal": "string",
      "expectedAnswer": "string",
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
              temperature: 0.5,
              maxOutputTokens: 1600,
              responseMimeType: "application/json",
            },
          },
        });

        if (response.ok) {
          onStatus?.(keyIndex, modelName, { status: "ready", detail: "พร้อมใช้งาน" });
          const candidateText =
            json?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("")?.trim() || stripJsonFence(text);

          try {
            return JSON.parse(candidateText);
          } catch {
            return json;
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
