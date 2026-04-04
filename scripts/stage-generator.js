import { ADVANCED_PROJECT_ROTATION, CORE_CURRICULUM } from "./data.js";
import { requestTeacherStage } from "./gemini.js";

function teachStep(id, title, teacherPrompt, options = {}) {
  return {
    id,
    type: "teach",
    title,
    teacherPrompt,
    explanation: options.explanation || "",
    bulletPoints: options.bulletPoints || [],
    code: options.code || "",
    output: options.output || "",
    memoryHook: options.memoryHook || "",
  };
}

function practiceStep(id, title, teacherPrompt, options = {}) {
  return {
    id,
    type: options.type || "practice",
    title,
    teacherPrompt,
    explanation: options.explanation || "",
    bulletPoints: options.bulletPoints || [],
    code: options.code || "",
    output: options.output || "",
    instruction: options.instruction || "",
    starterCode: options.starterCode || "",
    answerReveal: options.answerReveal || "",
    expectedAnswer: options.expectedAnswer || "",
    acceptedAnswers: options.acceptedAnswers || [],
    expectedOutput: options.expectedOutput || "",
    correctionFocus: options.correctionFocus || "",
    successText: options.successText || "",
    memoryHook: options.memoryHook || "",
    options: options.options || [],
    reviewSourceId: options.reviewSourceId || "",
  };
}

function stageBase(blueprint, order, steps, extras = {}) {
  return {
    id: `stage-${order.toString().padStart(3, "0")}`,
    blueprintId: blueprint.id,
    order,
    title: blueprint.title,
    summary: blueprint.summary,
    unlockHint: blueprint.unlockHint,
    difficulty: blueprint.difficulty,
    tags: blueprint.tags,
    generatedBy: extras.generatedBy || "local",
    intro:
      extras.intro ||
      `ครู AI จะพาเรียนด่านนี้แบบบอกก่อน ทำให้ดู แล้วค่อยให้พิมพ์จริง หัวใจหลักคือ ${blueprint.summary}`,
    completionTeaser:
      extras.completionTeaser ||
      "ผ่านด่านนี้แล้ว ด่านถัดไปจะเริ่มรวมความจำเดิมเข้ากับของใหม่ให้กลายเป็นทักษะจริง",
    rewards: extras.rewards || {
      xp: 45 + blueprint.difficulty * 7,
      gems: 10 + blueprint.difficulty * 2,
      hearts: blueprint.difficulty >= 4 ? 1 : 2,
    },
    steps,
  };
}

function buildReviewStep(reviewItem) {
  return practiceStep(`review-${reviewItem.id}`, "ทบทวนของที่เคยพลาด", reviewItem.teacherPrompt, {
    instruction: reviewItem.instruction,
    starterCode: reviewItem.starterCode,
    answerReveal: reviewItem.expectedAnswer,
    expectedAnswer: reviewItem.expectedAnswer,
    acceptedAnswers: reviewItem.acceptedAnswers || [],
    expectedOutput: reviewItem.expectedOutput || "",
    correctionFocus: reviewItem.correctionFocus || "",
    successText: "ดีมาก จุดที่เคยสะดุดเริ่มกลายเป็นทางที่คุ้นแล้ว",
    memoryHook: "การจำโค้ดก็เหมือนจำทาง ขับซ้ำจนสมองไม่ต้องเดา",
    reviewSourceId: reviewItem.id,
  });
}

function mergeReviewSteps(steps, reviewDeck) {
  if (!reviewDeck.length) return steps;
  const reviewSteps = reviewDeck.slice(0, 1).map(buildReviewStep);
  return [...reviewSteps, ...steps];
}

function buildCoreStage(blueprint, order, reviewDeck) {
  let steps = [];

  switch (blueprint.id) {
    case "setup-python":
      steps = [
        teachStep(
          "open-installer",
          "ติดตั้ง Python บนเครื่องจริง",
          "ก่อนจะเขียนโค้ด เราต้องทำให้เครื่องคุยกับ Python ได้ก่อน ครูจะบอกทางตรง ๆ ทีละขั้น",
          {
            bulletPoints: [
              "เข้าเว็บ python.org/downloads",
              "ดาวน์โหลดตัวติดตั้งล่าสุดของ Python 3",
              "ตอนติดตั้งให้ติ๊ก Add Python to PATH ก่อนกด Install",
            ],
            code: "https://www.python.org/downloads/",
            output: "Python installer is ready",
            memoryHook: "จำประโยคนี้ไว้: Add Python to PATH = เปิดทางให้คอมเจอ Python",
          },
        ),
        practiceStep(
          "check-version",
          "เช็กว่าเครื่องเจอ Python แล้ว",
          "ตอนนี้ให้เปิด Command Prompt หรือ PowerShell แล้วพิมพ์คำสั่งนี้ตามครู",
          {
            type: "command",
            instruction: "พิมพ์คำสั่งตรวจเวอร์ชันให้ตรง",
            starterCode: "python --version",
            answerReveal: "python --version",
            expectedAnswer: "python --version",
            acceptedAnswers: ["python --version", "py --version"],
            expectedOutput: "Python 3.13.0",
            correctionFocus: "คำว่า version ต้องมีขีดสองตัว -- อยู่ข้างหน้า",
            successText: "เยี่ยม เครื่องของเราพร้อมรัน Python แล้ว",
            memoryHook: "เมื่ออยากเช็ก Python ให้คิดถึงคำว่า version ก่อนเสมอ",
          },
        ),
        practiceStep(
          "open-repl",
          "เข้าโหมดพิมพ์ Python สด ๆ",
          "ต่อไปคือการเปิด Python interpreter ที่หน้าจอจะขึ้น >>> ให้เห็น",
          {
            type: "command",
            instruction: "พิมพ์คำสั่งเปิด Python",
            starterCode: "python",
            answerReveal: "python",
            expectedAnswer: "python",
            acceptedAnswers: ["python", "py"],
            expectedOutput: ">>>",
            correctionFocus: "คำสั่งเปิดโหมด Python คือ python หรือ py เท่านั้น",
            successText: "เห็น >>> เมื่อไร แปลว่าเรากำลังคุยกับ Python ตรง ๆ",
          },
        ),
        practiceStep(
          "first-print",
          "ลองสั่ง Python พูดครั้งแรก",
          "เมื่อเข้าโหมด >>> แล้ว ให้พิมพ์โค้ดนี้ลงไปตรง ๆ เพื่อให้ Python ทักเรา",
          {
            instruction: "พิมพ์โค้ดให้ตรงทุกตัว",
            starterCode: 'print("Hello from Python")',
            answerReveal: 'print("Hello from Python")',
            expectedAnswer: 'print("Hello from Python")',
            expectedOutput: "Hello from Python",
            correctionFocus: "ข้อความต้องอยู่ใน \" \" และคำสั่งต้องขึ้นต้นด้วย print",
            successText: "นี่คือโค้ด Python แรกบนเครื่องจริงของเราแล้ว",
          },
        ),
      ];
      break;
    case "hello-print":
      steps = [
        teachStep(
          "print-memory",
          "จำหน้าตาของ print()",
          "ถ้าอยากให้คอมพิวเตอร์โชว์ข้อความ เราจะใช้ print() เหมือนสั่งให้คอมพูดออกมา",
          {
            bulletPoints: [
              "print = ชื่อคำสั่ง",
              "( ) = ที่ใส่ของที่จะให้แสดง",
              '"ข้อความ" = ของที่อยากให้คอมพูด',
            ],
            code: 'print("Hello")',
            output: "Hello",
            memoryHook: "จำภาพนี้ไว้: print(\"...\") คือรูปทรงพื้นฐานที่ต้องเห็นจนชินตา",
          },
        ),
        practiceStep(
          "copy-print",
          "พิมพ์ตามแบบตรง ๆ",
          "ด่านแรกของ print() คือพิมพ์ตามให้ตรงก่อน ครูเปิดคำตอบให้ดูเลย ไม่ต้องเดา",
          {
            instruction: "พิมพ์โค้ดให้ตรงทุกตัวอักษร",
            starterCode: 'print("")',
            answerReveal: 'print("Hello")',
            expectedAnswer: 'print("Hello")',
            expectedOutput: "Hello",
            correctionFocus: "อย่าลืมวงเล็บและเครื่องหมายคำพูด",
            successText: "ถูกต้อง นี่คือเส้นทางมาตรฐานของคำสั่ง print",
          },
        ),
        practiceStep(
          "choice-print",
          "เลือกโค้ดที่ถูก",
          "พอจำหน้าตาได้แล้ว ครูจะให้เลือกโค้ดที่ถูกต้องหนึ่งข้อ",
          {
            type: "choice",
            instruction: "เลือกคำตอบที่เขียนถูกต้องสำหรับแสดงคำว่า Cat",
            options: ['print("Cat")', "print(Cat)", 'printf("Cat")'],
            expectedAnswer: 'print("Cat")',
            answerReveal: 'print("Cat")',
            correctionFocus: "คำว่า print ต้องสะกดตรง และข้อความต้องอยู่ในเครื่องหมายคำพูด",
            successText: "ดีมาก ตอนนี้สมองเริ่มแยกโค้ดที่ถูกกับโค้ดที่ผิดได้แล้ว",
          },
        ),
        practiceStep(
          "edit-print",
          "เปลี่ยนคำใน print() ให้เป็นของเรา",
          "ครูอยากให้ลองเปลี่ยนข้อความเองบ้าง แต่ยังบอกคำตอบให้อยู่",
          {
            instruction: "พิมพ์โค้ดเพื่อให้แสดงคำว่า Python สนุก",
            starterCode: 'print("")',
            answerReveal: 'print("Python สนุก")',
            expectedAnswer: 'print("Python สนุก")',
            expectedOutput: "Python สนุก",
            correctionFocus: "คำพูดต้องอยู่ใน \" \" และทุกอย่างอยู่ในวงเล็บของ print",
            successText: "ยอดเยี่ยม เราเริ่มเปลี่ยนข้อความเองได้แล้ว",
          },
        ),
      ];
      break;
    case "numbers-math":
      steps = [
        teachStep(
          "math-idea",
          "ไม่มี \" \" = คิดเลขจริง",
          "ถ้าเราเขียนตัวเลขเปล่า ๆ Python จะคิดให้ แต่ถ้าใส่เครื่องหมายคำพูด มันจะอ่านเป็นข้อความแทน",
          {
            bulletPoints: ['print(2 + 3) = คิดเลข', 'print("2 + 3") = อ่านเป็นข้อความ'],
            code: 'print(2 + 3)\nprint("2 + 3")',
            output: "5\n2 + 3",
            memoryHook: "ประโยคจำง่าย: ไม่มีคำพูด = คิดเลข, มีคำพูด = แค่พูดตาม",
          },
        ),
        practiceStep(
          "sum-seven-one",
          "พิมพ์ให้ Python คิดเลข",
          "ครูบอกคำตอบตรง ๆ ก่อน ให้พิมพ์ตามจนตาเริ่มคุ้น",
          {
            instruction: "พิมพ์โค้ดเพื่อให้ Python แสดงผลของ 7 + 1",
            starterCode: "print()",
            answerReveal: "print(7 + 1)",
            expectedAnswer: "print(7 + 1)",
            expectedOutput: "8",
            correctionFocus: "ตัวเลขต้องไม่อยู่ในเครื่องหมายคำพูด",
            successText: "ถูกต้อง Python จะคิดก่อนแล้วค่อยแสดงผล",
          },
        ),
        practiceStep(
          "math-choice",
          "แยกให้ออกว่าข้อไหนคือการคำนวณจริง",
          "ต่อไปครูจะถามว่าโค้ดไหนทำให้คอมคิดเลขจริง ๆ",
          {
            type: "choice",
            instruction: "เลือกบรรทัดที่เป็นการคำนวณจริง",
            options: ['print("5 + 5")', "print(5 + 5)", 'print("10")'],
            expectedAnswer: "print(5 + 5)",
            answerReveal: "print(5 + 5)",
            correctionFocus: "มองหาเลขที่ไม่ได้ถูกห่อด้วยเครื่องหมายคำพูด",
            successText: "ดีมาก เราเริ่มเห็นแล้วว่าโค้ดหน้าตาแบบไหนทำงานจริง",
          },
        ),
      ];
      break;
    case "variables-boxes":
      steps = [
        teachStep(
          "box-idea",
          "ตัวแปรคือกล่องที่มีป้ายชื่อ",
          "ถ้าอยากเก็บข้อมูลไว้ใช้ทีหลัง เราจะเอามันใส่กล่องที่มีชื่อเรียก หรือที่เรียกว่าตัวแปร",
          {
            bulletPoints: ['name = "Mali" = กล่องชื่อ name เก็บคำว่า Mali', "print(name) = หยิบของในกล่องออกมาโชว์"],
            code: 'name = "Mali"\nprint(name)',
            output: "Mali",
            memoryHook: "ซ้ายคือชื่อกล่อง ขวาคือของที่จะใส่ลงไป",
          },
        ),
        practiceStep(
          "store-friend",
          "สร้างกล่องของเราเอง",
          "ครูบอกคำตอบให้เห็นก่อน เราแค่พิมพ์ให้กล้ามเนื้อมือจำ",
          {
            instruction: 'พิมพ์โค้ดเพื่อเก็บคำว่า Ball ในตัวแปรชื่อ friend',
            starterCode: 'friend = ""',
            answerReveal: 'friend = "Ball"',
            expectedAnswer: 'friend = "Ball"',
            correctionFocus: 'ชื่อกล่องอยู่ซ้าย เครื่องหมาย = อยู่กลาง และคำว่า "Ball" อยู่ขวา',
            successText: "เยี่ยม เราสร้างกล่องเก็บข้อมูลได้แล้ว",
          },
        ),
        practiceStep(
          "print-friend",
          "หยิบค่าจากกล่องออกมาใช้",
          "ตอนนี้ให้พิมพ์คำสั่งโชว์ค่าจากกล่อง friend",
          {
            instruction: "พิมพ์โค้ดเพื่อแสดงค่าจากตัวแปร friend",
            starterCode: "print()",
            answerReveal: "print(friend)",
            expectedAnswer: "print(friend)",
            expectedOutput: "Ball",
            correctionFocus: "เวลาเรียกตัวแปรมาใช้ ไม่ต้องมีเครื่องหมายคำพูด",
            successText: "ตอนนี้เราแยกออกแล้วว่าข้อความกับตัวแปรต่างกันยังไง",
          },
        ),
      ];
      break;
    case "input-chat":
      steps = [
        teachStep(
          "input-idea",
          "input() คือการให้โปรแกรมถามกลับ",
          "ปกติเราพิมพ์คำสั่งใส่คอม แต่ input() ทำให้คอมถามเราแล้วเก็บคำตอบไว้",
          {
            code: 'name = input("คุณชื่ออะไร? ")\nprint(name)',
            output: "คุณชื่ออะไร? Mali\nMali",
            bulletPoints: ['input("...") = ถามคำถาม', "คำตอบที่พิมพ์จะถูกเก็บในตัวแปรด้านซ้าย"],
            memoryHook: "สูตรจำ: ตัวแปร = input(\"คำถาม\")",
          },
        ),
        practiceStep(
          "copy-input",
          "พิมพ์สูตรพื้นฐานของ input()",
          "ด่านนี้ครูยังเปิดเฉลยให้เหมือนเดิม เพราะต้องการให้จำทรงของโค้ดก่อน",
          {
            instruction: 'พิมพ์โค้ดเพื่อถามชื่อผู้ใช้แล้วเก็บไว้ใน name',
            starterCode: 'name = input("")',
            answerReveal: 'name = input("ชื่ออะไร? ")',
            expectedAnswer: 'name = input("ชื่ออะไร? ")',
            correctionFocus: "ด้านซ้ายเป็นตัวแปร ด้านขวาเป็น input พร้อมข้อความคำถาม",
            successText: "ดีมาก ตอนนี้โปรแกรมของเราถามคนได้แล้ว",
          },
        ),
        practiceStep(
          "echo-name",
          "ตอบกลับสิ่งที่ผู้ใช้พิมพ์",
          "ต่อด้วยการแสดงค่าที่ผู้ใช้เพิ่งพิมพ์กลับออกมา",
          {
            instruction: "พิมพ์โค้ดเพื่อแสดงค่าจากตัวแปร name",
            starterCode: "print()",
            answerReveal: "print(name)",
            expectedAnswer: "print(name)",
            expectedOutput: "Mali",
            correctionFocus: "ตัวแปรไม่ต้องมีเครื่องหมายคำพูด",
            successText: "ตอนนี้โปรแกรมถามและตอบกลับได้แล้ว",
          },
        ),
      ];
      break;
    case "if-doors":
      steps = [
        teachStep(
          "if-door",
          "if คือประตูตัดสินใจ",
          "ถ้าเงื่อนไขจริง โค้ดที่ย่อหน้าอยู่ข้างล่างจะทำงาน ถ้าไม่จริงก็ข้ามไป",
          {
            code: 'score = 12\nif score >= 10:\n    print("ผ่าน")',
            output: "ผ่าน",
            bulletPoints: ['if = เริ่มตรวจเงื่อนไข', "บรรทัดข้างล่างต้องย่อหน้า", ": = บอกว่าบล็อกคำสั่งกำลังจะเริ่ม"],
            memoryHook: "จำว่า if ต้องคู่กับ : และบรรทัดข้างล่างต้องถอยเข้าไป",
          },
        ),
        practiceStep(
          "if-copy",
          "พิมพ์ if ตามครู",
          "ครูเปิดคำตอบให้เห็น เพราะรูปทรงของ if สำคัญมาก",
          {
            instruction: 'พิมพ์โค้ด: ถ้า age มากกว่าหรือเท่ากับ 7 ให้แสดงคำว่า "เข้าได้"',
            starterCode: 'if age >= :\n    print("")',
            answerReveal: 'if age >= 7:\n    print("เข้าได้")',
            expectedAnswer: 'if age >= 7:\n    print("เข้าได้")',
            expectedOutput: "เข้าได้",
            correctionFocus: "อย่าลืม : หลังเงื่อนไข และต้องย่อหน้าบรรทัด print",
            successText: "ดีมาก โครงสร้าง if เริ่มติดตาแล้ว",
          },
        ),
        practiceStep(
          "if-choice",
          "ดูว่าอันไหนมีรูปทรง if ถูกต้อง",
          "ครูจะเริ่มให้เลือกจากสิ่งที่เห็น เพื่อฝึกสมองให้ชินกับโครงสร้าง",
          {
            type: "choice",
            instruction: "เลือกบรรทัดที่เขียน if ได้ถูกต้อง",
            options: ['if age >= 7 print("เข้าได้")', 'if age >= 7:\n    print("เข้าได้")', "if (age >= 7)"],
            expectedAnswer: 'if age >= 7:\n    print("เข้าได้")',
            answerReveal: 'if age >= 7:\n    print("เข้าได้")',
            correctionFocus: "if แบบพื้นฐานต้องมีเงื่อนไข + : + บรรทัดย่อหน้า",
            successText: "ดีมาก ตาเริ่มแยกโครงสร้างบล็อกโค้ดออกแล้ว",
          },
        ),
      ];
      break;
    case "loops-repeat":
      steps = [
        teachStep(
          "loop-idea",
          "for loop คือการสั่งงานซ้ำแบบไม่พิมพ์ใหม่หลายรอบ",
          "ถ้าอยากพูดคำเดิม 3 ครั้ง เราใช้ loop ได้เลย ไม่ต้องเขียน print 3 บรรทัด",
          {
            code: 'for i in range(3):\n    print("Hi")',
            output: "Hi\nHi\nHi",
            bulletPoints: ["range(3) = ทำซ้ำ 3 รอบ", "บรรทัดข้างล่างต้องย่อหน้าเหมือน if"],
            memoryHook: "ภาพจำ: for ... in range(...): แล้วด้านล่างคือสิ่งที่จะทำซ้ำ",
          },
        ),
        practiceStep(
          "loop-copy",
          "พิมพ์ลูปตามรูปทรงที่ถูก",
          "ลูปมีรูปทรงชัดเจน ให้พิมพ์ตามก่อนจนจำได้",
          {
            instruction: 'พิมพ์โค้ดให้แสดงคำว่า "Go" จำนวน 3 รอบ',
            starterCode: 'for i in range():\n    print("")',
            answerReveal: 'for i in range(3):\n    print("Go")',
            expectedAnswer: 'for i in range(3):\n    print("Go")',
            expectedOutput: "Go\nGo\nGo",
            correctionFocus: "อย่าลืม : และการย่อหน้าบรรทัด print",
            successText: "เยี่ยม ตอนนี้ลูปเริ่มมีเส้นทางในหัวแล้ว",
          },
        ),
        practiceStep(
          "loop-choice",
          "เลือกโค้ดที่ทำซ้ำถูกต้อง",
          "ตานักเขียนโค้ดต้องเห็นลูปแล้วรู้ทันทีว่าตรงหรือไม่ตรง",
          {
            type: "choice",
            instruction: "เลือกโค้ดที่ทำซ้ำได้ถูกต้อง",
            options: ['for i in range(2)\n print("Hi")', 'for i in range(2):\n    print("Hi")', 'for range(2): print("Hi")'],
            expectedAnswer: 'for i in range(2):\n    print("Hi")',
            answerReveal: 'for i in range(2):\n    print("Hi")',
            correctionFocus: "for loop ต้องมีตัวแปร, in, range(), :, และย่อหน้า",
            successText: "ดีมาก เราเริ่มเห็นโครงร่างของลูปได้ทันทีแล้ว",
          },
        ),
      ];
      break;
    case "functions-helper":
      steps = [
        teachStep(
          "function-idea",
          "ฟังก์ชันคือผู้ช่วยที่เรียกใช้ซ้ำได้",
          "แทนที่จะเขียนงานเดิมซ้ำ เราสร้างชื่อผู้ช่วยขึ้นมาแล้วเรียกใช้เมื่อต้องการ",
          {
            code: 'def say_hi():\n    print("Hi")\n\nsay_hi()',
            output: "Hi",
            bulletPoints: ['def = เริ่มสร้างฟังก์ชัน', "say_hi = ชื่อผู้ช่วย", "ต้องเรียก say_hi() ถึงจะทำงาน"],
            memoryHook: "สูตรจำ: def สร้าง, ชื่อ() เรียกใช้",
          },
        ),
        practiceStep(
          "function-copy",
          "สร้างผู้ช่วยของเราเอง",
          "ครูบอกคำตอบให้ก่อน เพื่อจำทรงของฟังก์ชัน",
          {
            instruction: 'พิมพ์ฟังก์ชันชื่อ say_name ที่แสดงคำว่า "Mali"',
            starterCode: 'def say_name():\n    print("")',
            answerReveal: 'def say_name():\n    print("Mali")',
            expectedAnswer: 'def say_name():\n    print("Mali")',
            expectedOutput: "Mali",
            correctionFocus: "def ต้องมี : และบรรทัดข้างล่างต้องย่อหน้า",
            successText: "ตอนนี้เราสร้างผู้ช่วยของเราเองได้แล้ว",
          },
        ),
        practiceStep(
          "function-call",
          "เรียกใช้ผู้ช่วย",
          "เมื่อสร้างแล้ว ต้องเรียกชื่อมันพร้อมวงเล็บ",
          {
            instruction: "พิมพ์คำสั่งเรียกใช้ฟังก์ชัน say_name",
            starterCode: "say_name",
            answerReveal: "say_name()",
            expectedAnswer: "say_name()",
            expectedOutput: "Mali",
            correctionFocus: "เวลาสั่งให้ฟังก์ชันทำงาน ต้องมีวงเล็บ ()",
            successText: "เยี่ยม เรารู้แล้วว่าฟังก์ชันต้องทั้งสร้างและเรียกใช้",
          },
        ),
      ];
      break;
    case "lists-bag":
      steps = [
        teachStep(
          "list-idea",
          "list คือถุงที่เก็บของหลายชิ้น",
          "ถ้าอยากเก็บหลายค่าไว้ด้วยกัน เราใช้ list ได้เลย",
          {
            code: 'fruits = ["apple", "banana", "cat"]\nprint(fruits[0])',
            output: "apple",
            bulletPoints: ["[ ] = รูปทรงของ list", "ตำแหน่งเริ่มนับจาก 0"],
            memoryHook: "คิดว่า list เป็นถุง และเลขตำแหน่งเริ่มจาก 0 เสมอ",
          },
        ),
        practiceStep(
          "list-copy",
          "สร้าง list ตามครู",
          "ครูอยากให้จำหน้าตา list ก่อน จึงเปิดเฉลยให้เห็นชัด ๆ",
          {
            instruction: 'พิมพ์โค้ดสร้าง list ชื่อ colors ที่มี "red", "blue"',
            starterCode: "colors = []",
            answerReveal: 'colors = ["red", "blue"]',
            expectedAnswer: 'colors = ["red", "blue"]',
            correctionFocus: "ของแต่ละชิ้นอยู่ใน [ ] และคั่นด้วยเครื่องหมาย ,",
            successText: "ดีมาก ตอนนี้เรารู้จักถุงเก็บข้อมูลหลายชิ้นแล้ว",
          },
        ),
        practiceStep(
          "list-index",
          "หยิบของชิ้นแรกจาก list",
          "ต่อไปคือการหยิบของจากถุงด้วยเลขตำแหน่ง",
          {
            instruction: "พิมพ์โค้ดเพื่อแสดงสมาชิกตัวแรกของ colors",
            starterCode: "print()",
            answerReveal: "print(colors[0])",
            expectedAnswer: "print(colors[0])",
            expectedOutput: "red",
            correctionFocus: "ชิ้นแรกของ list อยู่ตำแหน่ง 0 ไม่ใช่ 1",
            successText: "เยี่ยม เราเริ่มคุยกับข้อมูลหลายชิ้นได้แล้ว",
          },
        ),
      ];
      break;
    case "dict-map":
      steps = [
        teachStep(
          "dict-idea",
          "dictionary คือแผนที่ของข้อมูล",
          "แทนที่จะจำแค่ตำแหน่ง เราจับคู่ชื่อกับข้อมูล เช่น ชื่อกับอายุ",
          {
            code: 'student = {"name": "Mali", "age": 10}\nprint(student["name"])',
            output: "Mali",
            bulletPoints: ['ซ้ายของ : คือ key', 'ขวาของ : คือ value'],
            memoryHook: "จำว่าดิกชันนารีคือ key: value",
          },
        ),
        practiceStep(
          "dict-copy",
          "สร้าง dictionary ของเรา",
          "ครูจะให้พิมพ์ตามเพื่อจำรูปแบบ key:value ให้แม่น",
          {
            instruction: 'พิมพ์โค้ดสร้าง dict ชื่อ pet ที่มี key "name" เป็นค่า "Milo"',
            starterCode: "pet = {}",
            answerReveal: 'pet = {"name": "Milo"}',
            expectedAnswer: 'pet = {"name": "Milo"}',
            correctionFocus: 'key และ value เป็นข้อความจึงต้องอยู่ใน " "',
            successText: "ดีมาก ตอนนี้เราจับคู่ชื่อกับข้อมูลได้แล้ว",
          },
        ),
        practiceStep(
          "dict-read",
          "อ่านค่าจาก key",
          "ต่อไปคือหยิบค่าจากชื่อ key ที่ต้องการ",
          {
            instruction: 'พิมพ์โค้ดเพื่อแสดงค่าที่ key "name" จาก pet',
            starterCode: "print()",
            answerReveal: 'print(pet["name"])',
            expectedAnswer: 'print(pet["name"])',
            expectedOutput: "Milo",
            correctionFocus: 'ชื่อ key อยู่ใน [ ] และต้องมี " " ครอบ',
            successText: "ยอดเยี่ยม เราใช้แผนที่ข้อมูลเป็นแล้ว",
          },
        ),
      ];
      break;
    case "files-save":
      steps = [
        teachStep(
          "file-idea",
          "ไฟล์ช่วยให้โปรแกรมจำข้อมูลไว้หลังปิดหน้าจอ",
          "เมื่ออยากเก็บข้อความลงเครื่อง เราเขียนมันลงไฟล์ได้",
          {
            code: 'with open("note.txt", "w", encoding="utf-8") as file:\n    file.write("hello")',
            output: "note.txt now contains hello",
            bulletPoints: ['"w" = เปิดเพื่อเขียน', 'with = ช่วยปิดไฟล์ให้อัตโนมัติ'],
            memoryHook: "สูตรจำ: with open(..., \"w\") as file",
          },
        ),
        practiceStep(
          "file-write",
          "เขียนข้อความลงไฟล์",
          "ครูเปิดคำตอบให้เห็นเพราะบรรทัดนี้ค่อนข้างยาว ต้องเห็นจนคุ้น",
          {
            instruction: 'พิมพ์บรรทัดเปิดไฟล์ note.txt เพื่อเขียนข้อความ',
            starterCode: 'with open("", "", encoding="utf-8") as file:',
            answerReveal: 'with open("note.txt", "w", encoding="utf-8") as file:',
            expectedAnswer: 'with open("note.txt", "w", encoding="utf-8") as file:',
            correctionFocus: 'ชื่อไฟล์, โหมด "w", และ : ต้องอยู่ครบ',
            successText: "ดีมาก ตอนนี้เรารู้ทางเปิดไฟล์เพื่อเขียนแล้ว",
          },
        ),
        practiceStep(
          "file-read",
          "อ่านข้อมูลกลับจากไฟล์",
          "เมื่อเก็บได้แล้ว เราต้องอ่านกลับมาเป็นด้วย",
          {
            instruction: 'พิมพ์บรรทัดเปิดไฟล์ note.txt เพื่ออ่าน',
            starterCode: 'with open("", "", encoding="utf-8") as file:',
            answerReveal: 'with open("note.txt", "r", encoding="utf-8") as file:',
            expectedAnswer: 'with open("note.txt", "r", encoding="utf-8") as file:',
            correctionFocus: 'โหมดอ่านต้องเป็น "r"',
            successText: "เยี่ยม ตอนนี้เราเริ่มทำงานกับข้อมูลจริงบนเครื่องได้แล้ว",
          },
        ),
      ];
      break;
    case "debug-errors":
      steps = [
        teachStep(
          "error-idea",
          "error ไม่ได้มาดุเรา แต่มาบอกทาง",
          "เมื่อโค้ดพัง Python จะฟ้องว่าบรรทัดไหนมีปัญหา เราต้องอ่านมันทีละชิ้น",
          {
            code: 'print("Hello)',
            output: "SyntaxError: unterminated string literal",
            bulletPoints: ['SyntaxError = รูปทรงโค้ดไม่ถูก', 'มองหาส่วนที่เปิดแล้วไม่ปิด เช่น " '],
            memoryHook: "เวลาพัง อย่าเดา ให้มองชื่อ error ก่อน",
          },
        ),
        practiceStep(
          "fix-string",
          "แก้โค้ดที่ปิดคำพูดไม่ครบ",
          "ครูจะให้โค้ดที่พัง แล้วให้เราแก้ให้กลับมาถูก",
          {
            instruction: 'พิมพ์โค้ดที่ถูกต้องเพื่อแสดงคำว่า Hello',
            starterCode: 'print("Hello)',
            answerReveal: 'print("Hello")',
            expectedAnswer: 'print("Hello")',
            expectedOutput: "Hello",
            correctionFocus: 'ข้อความต้องเปิดและปิดด้วย " ครบทั้งคู่',
            successText: "ยอดเยี่ยม เราเริ่มมองออกแล้วว่า error ตัวนี้เกิดจากอะไร",
          },
        ),
        practiceStep(
          "fix-colon",
          "แก้ if ที่ลืม :",
          "อีก error ยอดฮิตคือ if แล้วลืมเครื่องหมาย :",
          {
            instruction: 'พิมพ์ if ที่ถูกต้อง: ถ้า score >= 10 ให้แสดงคำว่า pass',
            starterCode: 'if score >= 10\n    print("pass")',
            answerReveal: 'if score >= 10:\n    print("pass")',
            expectedAnswer: 'if score >= 10:\n    print("pass")',
            correctionFocus: "หลังเงื่อนไขของ if ต้องมี : เสมอ",
            successText: "ดีมาก ตอนนี้เรารู้จุดเช็กหลักเวลา if พังแล้ว",
          },
        ),
      ];
      break;
    case "venv-pip":
      steps = [
        teachStep(
          "venv-idea",
          "venv คือห้องแยกของโปรเจกต์",
          "เวลาทำงานจริง เราไม่อยากให้แพ็กเกจของโปรเจกต์หนึ่งไปปนกับอีกโปรเจกต์",
          {
            code: "python -m venv .venv",
            output: ".venv folder created",
            bulletPoints: ["python -m venv .venv = สร้างห้องแยกชื่อ .venv", "pip install ... = ติดตั้งแพ็กเกจเข้าโปรเจกต์นี้"],
            memoryHook: "สูตรจำของคนทำงานจริง: สร้าง venv ก่อน install package",
          },
        ),
        practiceStep(
          "create-venv",
          "สร้าง virtual environment",
          "ครูอยากให้จำคำสั่งนี้จนพิมพ์ได้เอง",
          {
            type: "command",
            instruction: "พิมพ์คำสั่งสร้าง virtual environment",
            starterCode: "python -m venv ",
            answerReveal: "python -m venv .venv",
            expectedAnswer: "python -m venv .venv",
            expectedOutput: ".venv created",
            correctionFocus: "คำสั่งพื้นฐานคือ python -m venv ตามด้วยชื่อโฟลเดอร์",
            successText: "ดีมาก ห้องแยกของโปรเจกต์เกิดขึ้นแล้ว",
          },
        ),
        practiceStep(
          "activate-venv",
          "เปิดใช้งาน venv บน Windows",
          "เมื่อสร้างแล้วต้องเปิดใช้ก่อนจึงจะติดตั้งแพ็กเกจเข้าไปในห้องนี้",
          {
            type: "command",
            instruction: "พิมพ์คำสั่งเปิดใช้งาน venv บน PowerShell",
            starterCode: ".venv\\Scripts\\",
            answerReveal: ".venv\\Scripts\\Activate.ps1",
            expectedAnswer: ".venv\\Scripts\\Activate.ps1",
            acceptedAnswers: [".venv\\Scripts\\Activate.ps1", ".venv\\Scripts\\activate"],
            expectedOutput: "(.venv) appears at the start of the line",
            correctionFocus: "คำสั่งเปิดใช้งานอยู่ในโฟลเดอร์ Scripts ของ .venv",
            successText: "เยี่ยม ตอนนี้เราอยู่ในห้องแยกของโปรเจกต์แล้ว",
          },
        ),
        practiceStep(
          "pip-install",
          "ติดตั้งแพ็กเกจจริง",
          "ต่อไปคือการติดตั้ง requests ซึ่งใช้บ่อยมากเวลาเรียก API",
          {
            type: "command",
            instruction: "พิมพ์คำสั่งติดตั้ง requests",
            starterCode: "pip install ",
            answerReveal: "pip install requests",
            expectedAnswer: "pip install requests",
            expectedOutput: "Successfully installed requests",
            correctionFocus: "รูปแบบของ pip install คือ pip install ตามด้วยชื่อแพ็กเกจ",
            successText: "ยอดเยี่ยม เราเริ่มใช้เครื่องมือแบบคนทำงานจริงแล้ว",
          },
        ),
      ];
      break;
    case "modules-reuse":
      steps = [
        teachStep(
          "module-idea",
          "เมื่อโค้ดยาวขึ้น เราควรแยกไฟล์",
          "ไฟล์หนึ่งทำหน้าที่หนึ่งอย่าง แล้ว import มาใช้ จะทำให้โค้ดอ่านง่ายและดูแลต่อได้",
          {
            code: 'from greet import say_hi\n\nsay_hi()',
            output: "Hi",
            bulletPoints: ["from greet import say_hi = ดึงฟังก์ชันจากไฟล์ greet.py", "ไฟล์แยกกันได้ แต่ทำงานร่วมกันได้"],
            memoryHook: "จำภาพนี้: from ไฟล์ import ของที่อยากใช้",
          },
        ),
        practiceStep(
          "module-import",
          "พิมพ์บรรทัด import ตามครู",
          "บรรทัด import เป็นโครงพื้นฐานที่ต้องเห็นแล้วอ่านออกทันที",
          {
            instruction: "พิมพ์บรรทัด import ฟังก์ชัน say_hi จากไฟล์ greet",
            starterCode: "from  import ",
            answerReveal: "from greet import say_hi",
            expectedAnswer: "from greet import say_hi",
            correctionFocus: "รูปทรงคือ from ชื่อไฟล์ import ชื่อสิ่งที่ต้องใช้",
            successText: "ดีมาก ตอนนี้เรารู้ทางแยกไฟล์และเรียกใช้ข้ามไฟล์แล้ว",
          },
        ),
        practiceStep(
          "module-call",
          "เรียกใช้ของที่ import มา",
          "เมื่อ import แล้ว เราก็เรียกใช้เหมือนฟังก์ชันปกติ",
          {
            instruction: "พิมพ์คำสั่งเรียก say_hi",
            starterCode: "say_hi",
            answerReveal: "say_hi()",
            expectedAnswer: "say_hi()",
            expectedOutput: "Hi",
            correctionFocus: "เรียกฟังก์ชันต้องมีวงเล็บ",
            successText: "เยี่ยม ตอนนี้โค้ดของเราเริ่มเป็นหลายไฟล์อย่างมีระเบียบแล้ว",
          },
        ),
      ];
      break;
    case "oop-objects":
      steps = [
        teachStep(
          "class-idea",
          "class คือแม่พิมพ์ object",
          "ถ้าอยากสร้างสิ่งที่มีข้อมูลและพฤติกรรมของตัวเอง เช่น Robot หรือ Player เราใช้ class ได้",
          {
            code: 'class Dog:\n    def bark(self):\n        print("woof")',
            output: "Dog.bark() -> woof",
            bulletPoints: ["class = แม่พิมพ์", "object = ของจริงที่สร้างจากแม่พิมพ์"],
            memoryHook: "คิดว่า class คือแบบพิมพ์เขียว ส่วน object คือของจริงที่สร้างออกมา",
          },
        ),
        practiceStep(
          "class-copy",
          "พิมพ์ class แบบพื้นฐาน",
          "ครูยังเปิดคำตอบให้เพราะรูปทรงของ class ต้องจำให้ตาเห็นจนชิน",
          {
            instruction: 'พิมพ์ class ชื่อ Cat ที่มีเมทอด say() แสดงคำว่า "meow"',
            starterCode: 'class Cat:\n    def say(self):\n        print("")',
            answerReveal: 'class Cat:\n    def say(self):\n        print("meow")',
            expectedAnswer: 'class Cat:\n    def say(self):\n        print("meow")',
            expectedOutput: "meow",
            correctionFocus: "class และ def ต้องมี : และบรรทัดข้างล่างต้องย่อหน้าให้ถูก",
            successText: "ดีมาก เราเริ่มแตะระดับโครงสร้างแบบคนทำโปรแกรมจริงแล้ว",
          },
        ),
        practiceStep(
          "object-create",
          "สร้าง object จาก class",
          "เมื่อมีแบบพิมพ์แล้ว เราจะสร้างของจริงจากมันได้",
          {
            instruction: "พิมพ์โค้ดสร้าง object ชื่อ pet จาก Cat",
            starterCode: "pet = ",
            answerReveal: "pet = Cat()",
            expectedAnswer: "pet = Cat()",
            correctionFocus: "การสร้าง object คือเรียกชื่อ class ตามด้วย ()",
            successText: "เยี่ยม ตอนนี้เราเข้าใจวงจร class -> object แล้ว",
          },
        ),
      ];
      break;
    case "tests-safety":
      steps = [
        teachStep(
          "test-idea",
          "การทดสอบคือการถามโค้ดว่า ยังถูกอยู่ไหม",
          "คนเขียนโค้ดจริงจะไม่เชื่อความรู้สึกอย่างเดียว แต่จะเขียนคำเช็กไว้ด้วย",
          {
            code: 'def add(a, b):\n    return a + b\n\nassert add(2, 3) == 5',
            output: "No output = test passed",
            bulletPoints: ["assert = ถ้าไม่จริง โปรแกรมจะฟ้อง", "ถ้าจริง โปรแกรมจะเงียบ"],
            memoryHook: "จำว่า assert คือด่านตรวจของโค้ด",
          },
        ),
        practiceStep(
          "assert-copy",
          "พิมพ์ assert ตามครู",
          "บรรทัด assert สั้นแต่ทรงสำคัญมาก",
          {
            instruction: "พิมพ์บรรทัด assert เพื่อตรวจว่า add(2, 3) ได้ 5",
            starterCode: "assert ",
            answerReveal: "assert add(2, 3) == 5",
            expectedAnswer: "assert add(2, 3) == 5",
            correctionFocus: "รูปแบบคือ assert ตามด้วยผลลัพธ์ที่คาดหวัง",
            successText: "ดีมาก เราเริ่มเช็กงานแบบ engineer แล้ว",
          },
        ),
        practiceStep(
          "assert-choice",
          "เลือก test ที่เขียนถูกต้อง",
          "ต่อไปคือแยกว่าบรรทัดทดสอบแบบไหนเขียนถูกจริง",
          {
            type: "choice",
            instruction: "เลือกบรรทัดที่เป็น assert ถูกต้อง",
            options: ["assert add(2, 3) = 5", "assert add(2, 3) == 5", "assert(add(2,3),5)"],
            expectedAnswer: "assert add(2, 3) == 5",
            answerReveal: "assert add(2, 3) == 5",
            correctionFocus: "การเทียบค่าใน Python ใช้ == ไม่ใช่ =",
            successText: "ยอดเยี่ยม ตอนนี้เราเริ่มคิดเรื่องความปลอดภัยของโค้ดแล้ว",
          },
        ),
      ];
      break;
    case "json-api":
      steps = [
        teachStep(
          "json-idea",
          "API ส่งข้อมูลมาเป็น JSON บ่อยมาก",
          "เวลาคุยกับโลกภายนอก เรามักได้ข้อมูลหน้าตาเหมือน dict กลับมา",
          {
            code: 'data = {"name": "Mali", "score": 9}\nprint(data["name"])',
            output: "Mali",
            bulletPoints: ["JSON ที่แปลงแล้วมักใช้งานเหมือน dict", "ใช้ key เพื่อดึงข้อมูลที่ต้องการ"],
            memoryHook: "คิดว่า JSON ที่แปลงแล้วคือ dict ที่เราคุ้นมือ",
          },
        ),
        practiceStep(
          "request-line",
          "จำบรรทัดเรียก API แบบพื้นฐาน",
          "ครูจะให้จำบรรทัดเรียก requests.get ไว้ก่อน เพราะในงานจริงจะเจอบ่อย",
          {
            instruction: "พิมพ์บรรทัดเรียก API ด้วย requests.get",
            starterCode: 'response = requests.get("")',
            answerReveal: 'response = requests.get("https://example.com/data")',
            expectedAnswer: 'response = requests.get("https://example.com/data")',
            correctionFocus: "requests.get ต้องมี URL อยู่ในวงเล็บและเครื่องหมายคำพูด",
            successText: "ดีมาก เราเริ่มรู้ทางเข้าหา API แล้ว",
          },
        ),
        practiceStep(
          "json-read",
          "อ่านค่า name จาก data",
          "แม้ยังไม่ยิง API จริง เราก็เริ่มฝึกหยิบค่าจากข้อมูลที่ API ส่งมาได้แล้ว",
          {
            instruction: 'พิมพ์โค้ดเพื่อแสดงค่า name จากตัวแปร data',
            starterCode: "print()",
            answerReveal: 'print(data["name"])',
            expectedAnswer: 'print(data["name"])',
            expectedOutput: "Mali",
            correctionFocus: 'ใช้ ["name"] เหมือนการอ่านค่าใน dict',
            successText: "เยี่ยม ตอนนี้เราเริ่มอ่านข้อมูลจากภายนอกได้แล้ว",
          },
        ),
      ];
      break;
    case "automation-engineer":
      steps = [
        teachStep(
          "project-idea",
          "ด่านนี้คือโค้ดก้อนใหญ่ขึ้น แต่ทุกส่วนมาจากสิ่งที่เราเคยฝึกแล้ว",
          "เราจะรวม input, function, file และ loop ให้เกิดเครื่องมือเล็ก ๆ ที่ใช้งานได้จริง",
          {
            code:
              'def save_note(text):\n    with open("notes.txt", "a", encoding="utf-8") as file:\n        file.write(text + "\\n")\n\nnote = input("พิมพ์โน้ต: ")\nsave_note(note)',
            output: "notes.txt gets a new line",
            bulletPoints: ["นี่คือการรวมสิ่งที่เรียนมาเป็นโปรเจกต์", "ยิ่งรวมหลายบทได้ ยิ่งเข้าใกล้การเป็น engineer"],
            memoryHook: "โค้ดใหญ่ไม่ได้มาจากเวทมนตร์ แต่มาจากบทเล็ก ๆ ที่เราจำได้จนใช้ร่วมกันเป็น",
          },
        ),
        practiceStep(
          "project-function",
          "สร้างฟังก์ชัน save_note",
          "ครูจะให้พิมพ์แกนหลักของโปรเจกต์ทีละก้อน",
          {
            instruction: "พิมพ์บรรทัดหัวฟังก์ชัน save_note ที่รับ text",
            starterCode: "def save_note():",
            answerReveal: "def save_note(text):",
            expectedAnswer: "def save_note(text):",
            correctionFocus: "ฟังก์ชันนี้ต้องรับ text เข้ามา เพราะเราจะส่งข้อความเข้าไปเก็บ",
            successText: "เยี่ยม เรากำลังแยกโปรเจกต์เป็นก้อนที่ควบคุมได้แล้ว",
          },
        ),
        practiceStep(
          "project-call",
          "เรียกใช้ฟังก์ชันกับ input",
          "ต่อไปคือเชื่อมคำสั่งรับข้อมูลเข้ากับฟังก์ชันที่เราเพิ่งสร้าง",
          {
            instruction: "พิมพ์โค้ดเรียก save_note โดยส่งตัวแปร note เข้าไป",
            starterCode: "save_note()",
            answerReveal: "save_note(note)",
            expectedAnswer: "save_note(note)",
            correctionFocus: "เมื่อจะส่งค่าที่ผู้ใช้พิมพ์ ให้ใส่ตัวแปร note ในวงเล็บ",
            successText: "ตอนนี้เรารู้แล้วว่าโปรเจกต์จริงคือการต่อร่างของชิ้นเล็กหลายชิ้นเข้าด้วยกัน",
          },
        ),
      ];
      break;
    default:
      steps = [];
  }

  return stageBase(blueprint, order, mergeReviewSteps(steps, reviewDeck));
}

function buildProjectStage(blueprint, order, reviewDeck, journal) {
  const masteredTags = Array.from(new Set(journal.flatMap((entry) => entry.tags || []))).slice(-6);
  const comboText = masteredTags.length ? masteredTags.join(", ") : "print, ตัวแปร, if, loop";
  const steps = [
    teachStep(
      "project-overview",
      blueprint.title,
      `ด่านนี้ครูจะรวมความรู้ที่ผ่านมาหลายก้อนให้กลายเป็นงานจริง โดยจะใช้ ${comboText}`,
      {
        explanation: blueprint.summary,
        bulletPoints: ["โปรเจกต์จริงคือการรวมบทเก่าให้ทำงานร่วมกัน", "เราจะยังคงสอนก่อน แล้วค่อยให้ทำทีละก้อน"],
        memoryHook: "โค้ดใหญ่คือการต่อจิ๊กซอว์จากชิ้นเล็กที่เราจำได้แล้ว",
      },
    ),
  ];

  switch (blueprint.id) {
    case "project-guessing-game":
      steps.push(
        practiceStep("guess-secret", "สร้างเลขลับ", "เกมทายเลขเริ่มจากการให้คอมสุ่มเลขเก็บไว้", {
          instruction: "พิมพ์บรรทัดสุ่มเลข 1 ถึง 10 เก็บไว้ในตัวแปร secret",
          starterCode: "secret = ",
          answerReveal: "secret = random.randint(1, 10)",
          expectedAnswer: "secret = random.randint(1, 10)",
          correctionFocus: "การสุ่มเลขช่วงนี้ใช้ random.randint(1, 10)",
          successText: "ดีมาก เราเริ่มสร้างแกนของเกมแล้ว",
        }),
        practiceStep("guess-check", "เช็กคำตอบผู้เล่น", "ต่อไปคือ if ที่เช็กว่าทายถูกไหม", {
          instruction: 'พิมพ์ if ตรวจว่า guess เท่ากับ secret แล้วแสดงคำว่า "ถูกต้อง"',
          starterCode: 'if guess == :\n    print("")',
          answerReveal: 'if guess == secret:\n    print("ถูกต้อง")',
          expectedAnswer: 'if guess == secret:\n    print("ถูกต้อง")',
          correctionFocus: "ฝั่งซ้ายและขวาของ == คือ guess กับ secret",
          successText: "เยี่ยม เกมเริ่มมีจุดตัดสินใจแล้ว",
        }),
      );
      break;
    case "project-todo-cli":
      steps.push(
        practiceStep("todo-list", "สร้างถุงเก็บงาน", "โปรเจกต์ TODO เริ่มจาก list เปล่าหนึ่งใบ", {
          instruction: "พิมพ์โค้ดสร้าง list ชื่อ todos",
          starterCode: "todos = ",
          answerReveal: "todos = []",
          expectedAnswer: "todos = []",
          correctionFocus: "list ว่างเขียนเป็น []",
          successText: "ดีมาก ถุงเก็บงานพร้อมแล้ว",
        }),
        practiceStep("todo-add", "เพิ่มงานเข้า list", "เมื่อผู้ใช้พิมพ์งานใหม่ เราจะเติมเข้า list", {
          instruction: "พิมพ์โค้ดเพิ่มตัวแปร task เข้า todos",
          starterCode: "todos.",
          answerReveal: "todos.append(task)",
          expectedAnswer: "todos.append(task)",
          correctionFocus: "การเพิ่มของเข้า list ใช้ append(...)",
          successText: "ยอดเยี่ยม ตอนนี้โปรแกรมรับงานใหม่ได้แล้ว",
        }),
      );
      break;
    case "project-expense-tracker":
      steps.push(
        practiceStep("expense-dict", "สร้างข้อมูลรายจ่ายหนึ่งรายการ", "รายการรายจ่ายหนึ่งชิ้นอาจเป็น dict ที่มีชื่อกับจำนวนเงิน", {
          instruction: 'พิมพ์ dict ที่มี key "title" และ "amount"',
          starterCode: "expense = {}",
          answerReveal: 'expense = {"title": title, "amount": amount}',
          expectedAnswer: 'expense = {"title": title, "amount": amount}',
          correctionFocus: "dict ใช้ key:value อยู่ใน { }",
          successText: "ดีมาก เราเริ่มจัดโครงข้อมูลของโปรเจกต์แล้ว",
        }),
        practiceStep("expense-save", "เก็บรายการลง list ใหญ่", "เมื่อมีรายการหนึ่งชิ้นแล้ว เราจะเก็บมันลง list ของทั้งโปรเจกต์", {
          instruction: "พิมพ์โค้ดเพิ่ม expense เข้า expenses",
          starterCode: "expenses.",
          answerReveal: "expenses.append(expense)",
          expectedAnswer: "expenses.append(expense)",
          correctionFocus: "list ใช้ append เพื่อเก็บรายการใหม่",
          successText: "ยอดเยี่ยม โครงของระบบบันทึกรายจ่ายเริ่มชัดเจนแล้ว",
        }),
      );
      break;
    case "project-api-dashboard":
      steps.push(
        practiceStep("api-request", "ยิงคำขอไปยัง API", "แดชบอร์ดจะเริ่มจากการขอข้อมูลจากภายนอก", {
          instruction: "พิมพ์บรรทัด requests.get ไปยัง API ตัวอย่าง",
          starterCode: 'response = requests.get("")',
          answerReveal: 'response = requests.get("https://example.com/data")',
          expectedAnswer: 'response = requests.get("https://example.com/data")',
          correctionFocus: "requests.get ต้องมี URL เป็นข้อความในวงเล็บ",
          successText: "ดีมาก เราเริ่มดึงข้อมูลเข้าสู่โปรเจกต์แล้ว",
        }),
        practiceStep("api-json", "แปลงข้อมูลเป็น JSON", "หลังได้ response มา เรามักแปลงมันเป็น JSON ทันที", {
          instruction: "พิมพ์บรรทัดแปลง response เป็น JSON เก็บใน data",
          starterCode: "data = ",
          answerReveal: "data = response.json()",
          expectedAnswer: "data = response.json()",
          correctionFocus: "เรียกเมทอด json() จาก response",
          successText: "ยอดเยี่ยม ตอนนี้ข้อมูลพร้อมให้เราอ่านแล้ว",
        }),
      );
      break;
    default:
      steps.push(
        practiceStep("refactor-import", "แยกไฟล์ให้ดูแลง่าย", "โปรเจกต์ระดับ engineer จะเริ่มจัดระเบียบเป็นหลายไฟล์", {
          instruction: "พิมพ์บรรทัด import ฟังก์ชัน run_app จากไฟล์ app_core",
          starterCode: "from  import ",
          answerReveal: "from app_core import run_app",
          expectedAnswer: "from app_core import run_app",
          correctionFocus: "รูปแบบ import มาตรฐานคือ from ไฟล์ import ของที่ต้องใช้",
          successText: "ดีมาก งานเริ่มมีโครงสร้างแบบดูแลต่อได้แล้ว",
        }),
        practiceStep("refactor-test", "เขียนด่านตรวจให้โปรเจกต์", "เมื่อโค้ดเริ่มใหญ่ เราต้องมีด่านตรวจของตัวเอง", {
          instruction: "พิมพ์บรรทัด assert ว่า run_app() ให้ค่า True",
          starterCode: "assert ",
          answerReveal: "assert run_app() is True",
          expectedAnswer: "assert run_app() is True",
          correctionFocus: "assert ใช้เช็กสิ่งที่เราคาดหวังจากโค้ด",
          successText: "ยอดเยี่ยม นี่คือความคิดแบบ engineer เต็มตัวมากขึ้นแล้ว",
        }),
      );
  }

  return stageBase(blueprint, order, mergeReviewSteps(steps, reviewDeck), {
    intro: `ด่านนี้เป็นโปรเจกต์รวมสกิล ${comboText} เพื่อให้เราเห็นว่าความจำเดิมเริ่มต่อเป็นงานจริงได้`,
    completionTeaser: "ด่านถัดไปจะรวมของเดิมให้ใหญ่ขึ้นไปอีกจนเริ่มเป็นงานระดับ engineer",
  });
}

function getBlueprintForOrder(order) {
  if (order <= CORE_CURRICULUM.length) {
    return CORE_CURRICULUM[order - 1];
  }

  const index = (order - CORE_CURRICULUM.length - 1) % ADVANCED_PROJECT_ROTATION.length;
  const project = ADVANCED_PROJECT_ROTATION[index];
  return {
    ...project,
    difficulty: 6 + Math.floor((order - CORE_CURRICULUM.length - 1) / ADVANCED_PROJECT_ROTATION.length),
    teacherPrompt:
      "Create a combined project stage that uses previously learned Python skills and increases the size of the work while still teaching before asking.",
  };
}

function sanitizeAiSteps(rawSteps) {
  if (!Array.isArray(rawSteps)) return [];
  return rawSteps
    .map((step, index) => ({
      id: step.id || `ai-step-${index + 1}`,
      type: ["teach", "practice", "choice", "command"].includes(step.type) ? step.type : "teach",
      title: step.title || `AI Step ${index + 1}`,
      teacherPrompt: step.teacherPrompt || step.explanation || "",
      explanation: step.explanation || "",
      bulletPoints: Array.isArray(step.bulletPoints) ? step.bulletPoints : [],
      code: step.code || "",
      output: step.output || "",
      instruction: step.instruction || "",
      starterCode: step.starterCode || "",
      answerReveal: step.answerReveal || "",
      expectedAnswer: step.expectedAnswer || "",
      acceptedAnswers: Array.isArray(step.acceptedAnswers) ? step.acceptedAnswers : [],
      expectedOutput: step.expectedOutput || "",
      correctionFocus: step.correctionFocus || "",
      successText: step.successText || "",
      memoryHook: step.memoryHook || "",
      options: Array.isArray(step.options) ? step.options : [],
      reviewSourceId: "",
    }))
    .filter((step) => step.title && step.teacherPrompt);
}

function sanitizeAiStage(aiStage, blueprint, order, reviewDeck) {
  if (!aiStage || !Array.isArray(aiStage.steps) || !aiStage.steps.length) {
    return null;
  }

  return stageBase(blueprint, order, mergeReviewSteps(sanitizeAiSteps(aiStage.steps), reviewDeck), {
    generatedBy: "gemini",
    intro: aiStage.intro || aiStage.summary || blueprint.summary,
    completionTeaser: aiStage.completionTeaser || aiStage.nextTeaser || blueprint.unlockHint,
    rewards: {
      xp: Math.max(40, Number(aiStage.rewards?.xp) || 45 + blueprint.difficulty * 7),
      gems: Math.max(8, Number(aiStage.rewards?.gems) || 10 + blueprint.difficulty * 2),
      hearts: Math.max(1, Number(aiStage.rewards?.hearts) || (blueprint.difficulty >= 4 ? 1 : 2)),
    },
  });
}

export async function createStage(options) {
  const { order, reviewDeck, journal, keys, models, preferredModel, statusMap, onStatus } = options;
  const blueprint = getBlueprintForOrder(order);

  if (keys.length) {
    const aiStage = await requestTeacherStage({
      keys,
      models,
      preferredModel,
      blueprint,
      order,
      priorJournal: journal,
      statusMap,
      onStatus,
    });

    const sanitized = sanitizeAiStage(aiStage, blueprint, order, reviewDeck);
    if (sanitized) {
      return sanitized;
    }
  }

  if (order <= CORE_CURRICULUM.length) {
    return buildCoreStage(blueprint, order, reviewDeck);
  }

  return buildProjectStage(blueprint, order, reviewDeck, journal);
}
