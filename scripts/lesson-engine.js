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

function isStringLiteral(value) {
  return /^(["']).*[\s\S]*\1$/.test(value.trim());
}

function getExpressionKind(value) {
  const normalized = value.trim();

  if (!normalized) return "empty";
  if (isStringLiteral(normalized)) return "string";
  if (/^\[.*\]$/s.test(normalized)) return "list";
  if (/^\{.*\}$/s.test(normalized)) return "dict";
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]+\])?$/.test(normalized)) {
    return normalized.includes("[") ? "index" : "name";
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s*\([\s\S]*\)$/.test(normalized)) {
    return "call";
  }
  if (/^[0-9][0-9\s+\-*/().]*$/.test(normalized)) return "number";
  return "expression";
}

function normalizeExpressionSignature(value) {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
}

function stripQuotedContent(line) {
  let output = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      output += " ";
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

function buildIssue(message, line, column) {
  return { message, line, column };
}

function formatIssue(issue) {
  if (!issue) return "";
  const location = issue.line ? `บรรทัด ${issue.line}${issue.column ? ` คอลัมน์ ${issue.column}` : ""}` : "ตรงจุดนี้";
  return `${location}: ${issue.message}`;
}

function findUnclosedQuote(text) {
  let quote = null;
  let escaped = false;
  let line = 1;
  let column = 0;
  let startLine = 1;
  let startColumn = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    column += 1;

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      startLine = line;
      startColumn = column;
    }

    if (char === "\n") {
      line += 1;
      column = 0;
      escaped = false;
    }
  }

  if (quote) {
    return buildIssue(`ยังปิดเครื่องหมายคำพูด ${quote} ไม่ครบ`, startLine, startColumn);
  }

  return null;
}

function findBracketMismatch(text) {
  const stack = [];
  const openers = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]);
  const closers = new Map([
    [")", "("],
    ["]", "["],
    ["}", "{"],
  ]);

  let quote = null;
  let escaped = false;
  let line = 1;
  let column = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    column += 1;

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (openers.has(char)) {
      stack.push({ char, line, column });
    } else if (closers.has(char)) {
      const opener = stack.pop();
      if (!opener || opener.char !== closers.get(char)) {
        return buildIssue(`วงเล็บ ${char} ตัวนี้ไม่มีคู่ที่ตรงกัน`, line, column);
      }
    }

    if (char === "\n") {
      line += 1;
      column = 0;
      escaped = false;
    }
  }

  if (stack.length) {
    const opener = stack.pop();
    return buildIssue(`วงเล็บ ${opener.char} ตัวนี้ยังไม่ถูกปิด`, opener.line, opener.column);
  }

  return null;
}

function findBlockIssue(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let pendingBlock = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) continue;

    const indent = rawLine.length - rawLine.trimStart().length;

    if (pendingBlock && indent <= pendingBlock.indent) {
      return buildIssue("หลังบรรทัดที่ลงท้ายด้วย : ต้องมีบรรทัดถัดไปที่ย่อหน้าเข้าไป", index + 1, 1);
    }

    pendingBlock = null;

    if (/^(if|for|while|def|class|elif|else|with|try|except|finally)\b/.test(trimmedLine)) {
      if (!trimmedLine.endsWith(":")) {
        return buildIssue("บรรทัดประเภทนี้ต้องลงท้ายด้วย :", index + 1, rawLine.length || trimmedLine.length);
      }

      pendingBlock = { indent };
    }
  }

  if (pendingBlock) {
    return buildIssue("ยังขาดบรรทัดคำสั่งที่ย่อหน้าอยู่ใต้บรรทัดหัวข้อ", lines.length, 1);
  }

  return null;
}

function findCallShapeIssue(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const checks = [
    {
      keyword: "print",
      message: 'print ต้องตามด้วยวงเล็บ เช่น print("Hi")',
    },
    {
      keyword: "input",
      message: 'input ต้องตามด้วยวงเล็บ เช่น input("ชื่ออะไร? ")',
    },
    {
      keyword: "range",
      message: "range ต้องตามด้วยวงเล็บ เช่น range(3)",
    },
    {
      keyword: "open",
      message: 'open ต้องตามด้วยวงเล็บ เช่น open("note.txt", "w")',
    },
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const sanitized = stripQuotedContent(lines[index]);

    for (let checkIndex = 0; checkIndex < checks.length; checkIndex += 1) {
      const check = checks[checkIndex];
      const regex = new RegExp(`\\b${check.keyword}\\b(?!\\s*\\()`);
      const match = sanitized.match(regex);
      if (match?.index !== undefined) {
        return buildIssue(check.message, index + 1, match.index + 1);
      }
    }
  }

  return null;
}

function findBasicSyntaxIssue(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  return (
    findUnclosedQuote(normalized) ||
    findBracketMismatch(normalized) ||
    findBlockIssue(normalized) ||
    findCallShapeIssue(normalized)
  );
}

function extractFirstLine(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function extractOpenMode(source) {
  const match = source.match(/open\s*\([^,]+,\s*(["'])([^"']+)\1/);
  return match?.[2] || "";
}

function inferExpectedShape(step) {
  const sample = normalizeText(step.expectedAnswer || step.answerReveal || "");
  const firstLine = extractFirstLine(sample);

  if (!sample) return { kind: "freeform", sample };

  if (/^print\s*\(/.test(firstLine)) {
    const innerMatch = firstLine.match(/^print\s*\((.*)\)$/s);
    const inner = innerMatch?.[1]?.trim() || "";
    return {
      kind: "print",
      sample,
      expectedInnerText: inner,
      expectedInnerKind: getExpressionKind(inner),
    };
  }

  if (/^with\s+open\s*\(/.test(firstLine)) {
    return {
      kind: "with-open",
      sample,
      mode: extractOpenMode(firstLine),
    };
  }

  if (/^if\b/.test(firstLine)) {
    return { kind: "if-block", sample };
  }

  if (/^for\b/.test(firstLine)) {
    return { kind: "for-block", sample };
  }

  if (/^def\b/.test(firstLine)) {
    const name = firstLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || "";
    const params = firstLine.match(/^def\s+[A-Za-z_][A-Za-z0-9_]*\s*\((.*)\):$/)?.[1] || "";
    const parameterCount = params.trim() ? params.split(",").map((part) => part.trim()).filter(Boolean).length : 0;
    return { kind: "def-block", sample, name, parameterCount };
  }

  if (/^class\b/.test(firstLine)) {
    return {
      kind: "class-block",
      sample,
      className: firstLine.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || "",
      requiresMethod: /\n\s+def\b/.test(sample),
    };
  }

  if (/^assert\b/.test(firstLine)) {
    return { kind: "assert", sample };
  }

  const assignmentMatch = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/s);
  if (assignmentMatch) {
    const rhs = assignmentMatch[2].trim();
    const callMatch = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\((.*)\)$/s);

    if (/^input\s*\(/.test(rhs)) {
      return { kind: "input-assignment", sample };
    }

    if (/^requests\.get\s*\(/.test(rhs)) {
      return { kind: "requests-get", sample };
    }

    if (/^\[.*\]$/s.test(rhs)) {
      return { kind: "list-assignment", sample };
    }

    if (/^\{.*\}$/s.test(rhs)) {
      return { kind: "dict-assignment", sample };
    }

    if (callMatch) {
      return {
        kind: "call-assignment",
        sample,
        callee: callMatch[1],
        requiresArgument: Boolean(callMatch[2].trim()),
      };
    }

    return {
      kind: "assignment",
      sample,
      valueKind: getExpressionKind(rhs),
    };
  }

  const methodCallMatch = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
  if (methodCallMatch) {
    return {
      kind: "method-call",
      sample,
      methodName: methodCallMatch[2],
      requiresArgument: Boolean(methodCallMatch[3].trim()),
    };
  }

  const functionCallMatch = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
  if (functionCallMatch) {
    return {
      kind: "function-call",
      sample,
      functionName: functionCallMatch[1],
      requiresArgument: Boolean(functionCallMatch[2].trim()),
    };
  }

  return { kind: "freeform", sample };
}

function analyzeByShape(step, normalizedAnswer) {
  const shape = inferExpectedShape(step);
  const firstLine = extractFirstLine(normalizedAnswer);

  const accept = (feedback) => ({ verdict: "accept", feedback });
  const reject = (feedback) => ({ verdict: "reject", feedback });
  const unknown = (feedback) => ({ verdict: "needs-ai", feedback });

  switch (shape.kind) {
    case "print": {
      const match = normalizedAnswer.match(/^print\s*\((.*)\)$/s);
      if (!match) {
        if (/^print\b/.test(firstLine)) {
          return reject('รูปทรงของ print เกือบถูกแล้ว แต่ยังต้องเป็น print(...)');
        }
        return reject('ข้อนี้ควรใช้คำสั่ง print(...)');
      }

      const inner = match[1].trim();
      if (!inner) {
        return reject('ในวงเล็บของ print() ยังว่างอยู่');
      }

      if (shape.expectedInnerKind === "number" && isStringLiteral(inner)) {
        return reject('ข้อนี้ควรให้ Python คิดหรือแสดงค่าจริง ไม่ใช่ใส่ตัวเลขไว้ในเครื่องหมายคำพูด');
      }

      if (shape.expectedInnerKind === "name" && isStringLiteral(inner)) {
        return reject('ข้อนี้ควรแสดงค่าจากตัวแปร ไม่ใช่พิมพ์ข้อความใหม่ตรง ๆ');
      }

      if (shape.expectedInnerKind === "index") {
        if (!/\[[^\]]+\]/.test(inner)) {
          return reject('ข้อนี้ควรมีการอ้างถึงข้อมูลด้วย [ ]');
        }

        if (normalizeExpressionSignature(inner) !== normalizeExpressionSignature(shape.expectedInnerText || "")) {
          return reject('ข้อนี้ยังดึงตำแหน่งหรือ key ไม่ตรงกับที่โจทย์ต้องการ');
        }
      }

      return accept('รูปแบบ print() นี้ถูกหลักแล้ว แม้จะไม่เหมือนตัวอย่างทุกตัวอักษรก็ผ่านได้');
    }

    case "input-assignment": {
      const match = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*input\s*\((.*)\)$/s);
      if (!match) {
        if (/^input\s*\(/.test(firstLine)) {
          return reject('ข้อนี้ควรเก็บค่าที่รับมาไว้ในตัวแปรด้วย เช่น name = input(...)');
        }
        return reject('ข้อนี้ควรมีรูปแบบ ตัวแปร = input(...)');
      }

      return accept('รูปแบบรับค่าด้วย input() ใช้ได้แล้ว แม้ข้อความคำถามจะต่างจากตัวอย่างก็ยังถูกได้');
    }

    case "requests-get": {
      const match = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*requests\.get\s*\((.*)\)$/s);
      if (!match) {
        return reject('ข้อนี้ควรมีรูปแบบ ตัวแปร = requests.get(...)');
      }

      if (!match[2].trim()) {
        return reject('ในวงเล็บของ requests.get() ยังว่างอยู่');
      }

      return accept('รูปแบบการเรียก requests.get() นี้ถูกหลักแล้ว');
    }

    case "list-assignment":
    case "dict-assignment":
    case "assignment":
    case "call-assignment": {
      const match = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/s);
      if (!match) {
        return reject('ข้อนี้ควรมีรูปแบบ ตัวแปร = ค่า');
      }

      const rhs = match[2].trim();
      if (!rhs) {
        return reject('หลังเครื่องหมาย = ยังไม่มีค่าที่จะเก็บ');
      }

      if (shape.kind === "list-assignment" && !/^\[.*\]$/s.test(rhs)) {
        return reject('โจทย์นี้ควรเก็บค่าเป็น list ซึ่งต้องใช้ [ ]');
      }

      if (shape.kind === "dict-assignment" && !/^\{.*\}$/s.test(rhs)) {
        return reject('โจทย์นี้ควรเก็บค่าเป็น dict ซึ่งต้องใช้ { }');
      }

      if (shape.kind === "call-assignment" && !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s*\([\s\S]*\)$/.test(rhs)) {
        return reject('ค่าด้านขวาควรเป็นการเรียกฟังก์ชันหรือเมทอด');
      }

      if (shape.kind === "call-assignment") {
        const rhsCall = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\((.*)\)$/s);
        if (shape.callee && rhsCall?.[1] !== shape.callee) {
          return reject(`จุดนี้น่าจะต้องเรียก ${shape.callee}(...)`);
        }

        if (shape.requiresArgument && !rhsCall?.[2]?.trim()) {
          return reject('การเรียกด้านขวานี้ยังขาดค่าที่ควรส่งเข้าไปในวงเล็บ');
        }
      }

      if (shape.kind === "assignment" && shape.valueKind === "string" && !isStringLiteral(rhs)) {
        return reject('โจทย์นี้ต้องการให้ด้านขวาเป็นข้อความในเครื่องหมายคำพูด');
      }

      return accept('รูปแบบการกำหนดค่าแบบนี้ใช้ได้แล้ว ไม่จำเป็นต้องตรงกับตัวอย่างทุกตัวอักษร');
    }

    case "method-call": {
      const match = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
      if (!match) {
        return reject('ข้อนี้ควรเรียกเมทอดในรูปแบบ object.method(...)');
      }

      if (shape.methodName && match[2] !== shape.methodName) {
        return reject(`จุดนี้น่าจะต้องใช้เมทอด ${shape.methodName}(...)`);
      }

      if (shape.requiresArgument && !match[3].trim()) {
        return reject('เมทอดนี้ยังขาดค่าที่ควรส่งเข้าไปในวงเล็บ');
      }

      return accept('การเรียกเมทอดรูปแบบนี้ถูกต้องแล้ว');
    }

    case "function-call": {
      const match = firstLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
      if (!match) {
        return reject('ข้อนี้ควรเป็นการเรียกฟังก์ชันด้วยวงเล็บท้ายชื่อ');
      }

      if (shape.functionName && match[1] !== shape.functionName) {
        return reject(`ข้อนี้น่าจะต้องเรียกฟังก์ชัน ${shape.functionName}(...)`);
      }

      if (shape.requiresArgument && !match[2].trim()) {
        return reject('ฟังก์ชันนี้ยังขาดค่าที่ควรส่งเข้าไปในวงเล็บ');
      }

      return accept('รูปแบบการเรียกฟังก์ชันนี้ถูกแล้ว');
    }

    case "if-block": {
      if (!/^if\s+.+:\s*(\n[ \t]+\S[\s\S]*)?$/s.test(normalizedAnswer)) {
        return reject('ข้อนี้ควรเป็น if ...: แล้วมีบรรทัดด้านล่างที่ย่อหน้าเข้าไป');
      }

      if (!/\n[ \t]+\S/.test(normalizedAnswer)) {
        return reject('หลังบรรทัด if ยังขาดคำสั่งที่ย่อหน้าอยู่ด้านล่าง');
      }

      return accept('รูปแบบ if นี้ถูกหลักแล้ว ถึงเงื่อนไขหรือข้อความจะไม่เหมือนตัวอย่างก็ยังผ่านได้');
    }

    case "for-block": {
      if (!/^for\s+.+\s+in\s+.+:\s*(\n[ \t]+\S[\s\S]*)?$/s.test(normalizedAnswer)) {
        return reject('ข้อนี้ควรเป็น for ... in ...: แล้วมีบรรทัดด้านล่างที่ย่อหน้าเข้าไป');
      }

      if (!/\n[ \t]+\S/.test(normalizedAnswer)) {
        return reject('ลูปนี้ยังขาดคำสั่งที่อยู่ข้างในลูป');
      }

      return accept('โครงสร้าง for loop นี้ใช้ได้แล้ว');
    }

    case "def-block": {
      const headerMatch = normalizedAnswer.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\):\s*(\n[ \t]+\S[\s\S]*)?$/s);
      if (!headerMatch) {
        return reject('ข้อนี้ควรเป็น def ชื่อฟังก์ชัน(...): แล้วมีคำสั่งด้านในที่ย่อหน้าเข้าไป');
      }

      if (!/\n[ \t]+\S/.test(normalizedAnswer)) {
        return reject('ฟังก์ชันนี้ยังขาดคำสั่งที่อยู่ข้างใน');
      }

      if (shape.name && headerMatch[1] !== shape.name) {
        return reject(`ฟังก์ชันนี้ควรใช้ชื่อ ${shape.name}`);
      }

      const currentParams = headerMatch[2].trim()
        ? headerMatch[2].split(",").map((part) => part.trim()).filter(Boolean).length
        : 0;
      if (shape.parameterCount > 0 && currentParams < shape.parameterCount) {
        return reject('ฟังก์ชันนี้ยังขาดพารามิเตอร์ที่โจทย์ต้องการ');
      }

      return accept('รูปแบบฟังก์ชันนี้ถูกหลักแล้ว');
    }

    case "class-block": {
      const classMatch = normalizedAnswer.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\n[ \t]+\S[\s\S]*)?$/s);
      if (!classMatch) {
        return reject('ข้อนี้ควรเป็น class ชื่อคลาส: แล้วมีคำสั่งด้านในที่ย่อหน้าเข้าไป');
      }

      if (!/\n[ \t]+\S/.test(normalizedAnswer)) {
        return reject('class นี้ยังขาดเนื้อหาด้านใน');
      }

      if (shape.className && classMatch[1] !== shape.className) {
        return reject(`class นี้ควรใช้ชื่อ ${shape.className}`);
      }

      if (shape.requiresMethod && !/\n[ \t]+def\s+/.test(normalizedAnswer)) {
        return reject('ใน class นี้ยังขาดเมทอด def ... ที่ควรอยู่ด้านใน');
      }

      return accept('โครงสร้าง class นี้ใช้ได้แล้ว');
    }

    case "with-open": {
      if (!/^with\s+open\s*\(.+\)\s+as\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(\n[ \t]+\S[\s\S]*)?$/s.test(normalizedAnswer)) {
        return reject('ข้อนี้ควรเป็น with open(... ) as ชื่อตัวแปร: แล้วมีคำสั่งด้านล่างที่ย่อหน้าเข้าไป');
      }

      if (shape.mode && !new RegExp(`["']${shape.mode}["']`).test(firstLine)) {
        return reject(`บรรทัดนี้ควรเปิดไฟล์ในโหมด ${shape.mode}`);
      }

      return accept('โครงสร้าง with open(...) แบบนี้ถูกหลักแล้ว');
    }

    case "assert": {
      if (!/^assert\s+.+$/.test(firstLine)) {
        return reject('ข้อนี้ควรเริ่มด้วย assert');
      }

      if (/==/.test(shape.sample) && !/==/.test(firstLine)) {
        return reject('บรรทัด assert นี้ควรใช้ == เพื่อเทียบค่าที่คาดหวัง');
      }

      return accept('รูปแบบ assert นี้ถูกต้องแล้ว');
    }

    default:
      return unknown('โค้ดนี้เริ่มมีทรงแล้ว ถ้าไม่ตรงตัวอย่างเป๊ะ ระบบจะเช็กความหมายให้อีกชั้นตอนกดส่ง');
  }
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

function analyzeLocalAnswer(step, answer) {
  if (!step) {
    return { verdict: "reject", feedback: "ยังไม่มีด่านนี้ในระบบ" };
  }

  if (step.type === "teach") {
    return {
      verdict: "accept",
      feedback: "ด่านสอนขั้นนี้ผ่านได้เลย เพราะหน้าที่ของเราคืออ่านให้เข้าใจก่อน",
    };
  }

  const normalizedAnswer = getNormalizedValue(step, answer);
  const expectedPool = getExpectedPool(step).map((entry) => getNormalizedValue(step, entry));

  if (!normalizedAnswer) {
    return {
      verdict: "empty",
      feedback: step.type === "command" ? "ลองพิมพ์คำสั่งลงมาก่อน" : "ลองพิมพ์คำตอบหรือโค้ดลงมาก่อน",
    };
  }

  if (step.type === "choice") {
    if (expectedPool.includes(normalizedAnswer)) {
      return {
        verdict: "accept",
        feedback: step.successText || "ถูกต้องมาก ตัวเลือกนี้ใช่แล้ว",
      };
    }

    return {
      verdict: "reject",
      feedback: step.correctionFocus || "ตัวเลือกนี้ยังไม่ตรง ลองดูรูปทรงของโค้ดอีกครั้ง",
    };
  }

  if (step.type === "command") {
    if (expectedPool.includes(normalizedAnswer)) {
      return {
        verdict: "accept",
        feedback: step.successText || "คำสั่งนี้ถูกต้องแล้ว",
      };
    }

    const nearest = expectedPool[0] || "";
    const diff = findFirstDiff(nearest, normalizedAnswer);
    return {
      verdict: "reject",
      feedback:
        `คำสั่งนี้ยังไม่ตรงนะ ผิดครั้งแรกตรงตำแหน่งที่ ${diff.position} ` +
        `ควรเป็น "${diff.expectedChar}" แต่ตอนนี้เป็น "${diff.actualChar}"\n` +
        `ตัวอย่างที่ถูกคือ ${step.expectedAnswer || nearest}`,
    };
  }

  if (expectedPool.includes(normalizedAnswer)) {
    return {
      verdict: "accept",
      feedback: step.successText || "ถูกต้องมาก นี่เป็นหนึ่งในรูปแบบที่ใช้ได้จริง",
    };
  }

  const syntaxIssue = findBasicSyntaxIssue(answer || "");
  if (syntaxIssue) {
    return {
      verdict: "reject",
      feedback: `${formatIssue(syntaxIssue)}\n${step.correctionFocus || "ลองแก้จุดนี้ก่อนแล้วค่อยกดส่งอีกครั้ง"}`,
    };
  }

  return analyzeByShape(step, normalizedAnswer);
}

export function analyzeDraftAnswer(step, answer) {
  const analysis = analyzeLocalAnswer(step, answer);

  if (analysis.verdict === "empty") {
    return { type: "", text: "" };
  }

  if (analysis.verdict === "accept") {
    return {
      type: "success",
      text: analysis.feedback || "รูปแบบนี้ดูถูกแล้ว ถ้าพร้อมกดส่งได้เลย",
    };
  }

  if (analysis.verdict === "reject") {
    return {
      type: "error",
      text: analysis.feedback,
    };
  }

  return {
    type: "",
    text: analysis.feedback || "โค้ดนี้อาจถูกได้หลายแบบ ถ้าพร้อมกดส่ง ระบบจะช่วยเช็กความหมายให้อีกชั้น",
  };
}

export function compareStepAnswer(step, answer) {
  const analysis = analyzeLocalAnswer(step, answer);

  if (analysis.verdict === "accept") {
    return {
      correct: true,
      feedback: analysis.feedback,
    };
  }

  if (analysis.verdict === "needs-ai") {
    return {
      correct: false,
      requiresAiJudge: true,
      feedback: analysis.feedback,
    };
  }

  return {
    correct: false,
    feedback: analysis.feedback,
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
