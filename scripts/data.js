export const MODEL_OPTIONS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-3.1-pro-preview",
];

export const MAX_HEARTS = 7;
export const STAGE_BUFFER = 8;

export const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8bd76d"/>
          <stop offset="100%" stop-color="#304830"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="52" fill="url(#g)"/>
      <circle cx="128" cy="92" r="40" fill="#10210d"/>
      <path d="M60 206c12-38 41-58 68-58s56 20 68 58" fill="#10210d"/>
    </svg>
  `);

export const CORE_CURRICULUM = [
  {
    id: "setup-python",
    title: "ติดตั้ง Python และเปิดใช้งานครั้งแรก",
    summary: "พาเครื่องจากยังไม่พร้อม ให้พร้อมรัน Python จริงบนเครื่อง",
    unlockHint: "จะได้รู้จัก Python บนเครื่องของตัวเองจริง ๆ",
    difficulty: 1,
    tags: ["setup", "terminal", "python"],
    teacherPrompt:
      "Teach a Thai absolute beginner how to install Python on Windows, verify installation, and open the interpreter. Explain every step simply.",
  },
  {
    id: "hello-print",
    title: "คำสั่ง print() และข้อความแรก",
    summary: "จำให้แม่นว่าถ้าอยากให้คอมพูด ต้องใช้ print()",
    unlockHint: "ปลดล็อกเมื่อพร้อมสั่งให้คอมแสดงข้อความ",
    difficulty: 1,
    tags: ["print", "strings"],
    teacherPrompt:
      "Teach print() to a total beginner. Show exact code, exact output, and explain quotes and parentheses clearly in Thai.",
  },
  {
    id: "numbers-math",
    title: "ตัวเลขและการคำนวณ",
    summary: "แยกให้ออกระหว่างข้อความกับการคิดเลขจริง",
    unlockHint: "ปลดล็อกเมื่อพร้อมให้ Python คิดเลขแทนเรา",
    difficulty: 1,
    tags: ["numbers", "math", "print"],
    teacherPrompt:
      "Teach numbers, arithmetic, and the difference between strings and expressions. Keep it beginner-friendly and concrete.",
  },
  {
    id: "variables-boxes",
    title: "ตัวแปรคือกล่องเก็บข้อมูล",
    summary: "เริ่มเก็บข้อมูลไว้ใช้ซ้ำจนเกิดภาพจำ",
    unlockHint: "ปลดล็อกเมื่อพร้อมฝากข้อมูลไว้ในกล่อง",
    difficulty: 1,
    tags: ["variables", "strings", "numbers"],
    teacherPrompt:
      "Teach variables like boxes with names. Use very simple Thai explanations and concrete examples.",
  },
  {
    id: "input-chat",
    title: "รับข้อมูลจากผู้ใช้ด้วย input()",
    summary: "จากโค้ดนิ่ง ๆ สู่โค้ดที่คุยกับคนได้",
    unlockHint: "ปลดล็อกเมื่อพร้อมให้โปรแกรมถามคำถามกลับ",
    difficulty: 2,
    tags: ["input", "variables", "strings"],
    teacherPrompt:
      "Teach input() as a way for Python to ask the user a question. Explain storing the answer and printing it back.",
  },
  {
    id: "if-doors",
    title: "if คือประตูตัดสินใจ",
    summary: "เริ่มให้โปรแกรมเลือกทางตามเงื่อนไข",
    unlockHint: "ปลดล็อกเมื่อพร้อมให้โปรแกรมตัดสินใจ",
    difficulty: 2,
    tags: ["if", "comparison", "input"],
    teacherPrompt:
      "Teach if statements as decision doors. Explain conditions and blocks simply, with exact code samples.",
  },
  {
    id: "loops-repeat",
    title: "ลูปคือการทำซ้ำแบบฉลาด",
    summary: "ให้ Python ทำงานซ้ำโดยไม่ต้องพิมพ์ใหม่หลายรอบ",
    unlockHint: "ปลดล็อกเมื่อพร้อมสั่งงานซ้ำ ๆ ให้คอม",
    difficulty: 2,
    tags: ["loops", "range", "print"],
    teacherPrompt:
      "Teach for loops and repetition. Keep the wording simple and help the learner see the repeated output clearly.",
  },
  {
    id: "functions-helper",
    title: "ฟังก์ชันคือผู้ช่วยของเรา",
    summary: "แยกงานเป็นก้อนเล็ก ๆ แล้วเรียกใช้ซ้ำ",
    unlockHint: "ปลดล็อกเมื่อพร้อมสร้างคำสั่งของตัวเอง",
    difficulty: 3,
    tags: ["functions", "parameters", "return"],
    teacherPrompt:
      "Teach functions as reusable helpers. Explain def, parentheses, parameters, and calling the function.",
  },
  {
    id: "lists-bag",
    title: "list คือถุงเก็บหลายอย่าง",
    summary: "เริ่มจัดการข้อมูลหลายชิ้นในที่เดียว",
    unlockHint: "ปลดล็อกเมื่อพร้อมเก็บข้อมูลหลายอันในถุงเดียว",
    difficulty: 3,
    tags: ["lists", "index", "loops"],
    teacherPrompt:
      "Teach Python lists as bags holding many items. Explain indexing and looping through a list simply.",
  },
  {
    id: "dict-map",
    title: "dictionary คือแผนที่ของข้อมูล",
    summary: "เชื่อมคำกับค่าของมันให้ค้นง่าย",
    unlockHint: "ปลดล็อกเมื่อพร้อมจับคู่ชื่อกับข้อมูล",
    difficulty: 3,
    tags: ["dict", "keys", "values"],
    teacherPrompt:
      "Teach dictionaries with clear key-value examples. Show accessing and updating values in Thai explanations.",
  },
  {
    id: "files-save",
    title: "บันทึกข้อมูลลงไฟล์",
    summary: "จากโค้ดในหน้าจอ สู่ข้อมูลที่เก็บไว้ใช้ต่อได้",
    unlockHint: "ปลดล็อกเมื่อพร้อมให้โปรแกรมจำข้อมูลไว้",
    difficulty: 4,
    tags: ["files", "write", "read"],
    teacherPrompt:
      "Teach writing and reading text files safely. Explain what the file does and show simple examples.",
  },
  {
    id: "debug-errors",
    title: "อ่าน error และแก้บัคอย่างเป็นขั้นตอน",
    summary: "เริ่มจับจุดผิดแล้วรู้ว่าควรแก้ตรงไหน",
    unlockHint: "ปลดล็อกเมื่อพร้อมคุยกับ error message",
    difficulty: 4,
    tags: ["debug", "syntax", "traceback"],
    teacherPrompt:
      "Teach how to read Python errors, especially syntax and name errors, for a complete beginner.",
  },
  {
    id: "venv-pip",
    title: "ติดตั้งแพ็กเกจด้วย pip และแยกงานด้วย venv",
    summary: "เริ่มใช้เครื่องมือจริงแบบคนทำงาน",
    unlockHint: "ปลดล็อกเมื่อพร้อมขยายพลัง Python",
    difficulty: 4,
    tags: ["pip", "venv", "packages"],
    teacherPrompt:
      "Teach pip, virtual environments, and why they matter. Keep it practical and use exact commands.",
  },
  {
    id: "modules-reuse",
    title: "แยกไฟล์และใช้ module",
    summary: "เริ่มจัดโค้ดให้เป็นระเบียบและเรียกใช้ข้ามไฟล์",
    unlockHint: "ปลดล็อกเมื่อพร้อมแยกงานเป็นหลายไฟล์",
    difficulty: 5,
    tags: ["modules", "imports", "files"],
    teacherPrompt:
      "Teach imports and multiple files. Show a tiny project split across files in a very clear way.",
  },
  {
    id: "oop-objects",
    title: "คลาสและ object สำหรับโลกจริง",
    summary: "เริ่มสร้างแม่พิมพ์ของข้อมูลและพฤติกรรม",
    unlockHint: "ปลดล็อกเมื่อพร้อมคิดแบบ object",
    difficulty: 5,
    tags: ["classes", "objects", "methods"],
    teacherPrompt:
      "Teach classes and objects gently. Avoid jargon overload and connect it to real-world objects.",
  },
  {
    id: "tests-safety",
    title: "ทดสอบโค้ดเพื่อกันพลาด",
    summary: "เขียนโค้ดแล้วเช็กว่ามันยังทำงานถูก",
    unlockHint: "ปลดล็อกเมื่อพร้อมคิดแบบ engineer",
    difficulty: 5,
    tags: ["testing", "assert", "quality"],
    teacherPrompt:
      "Teach basic automated testing and asserts for Python beginners transitioning into engineering thinking.",
  },
  {
    id: "json-api",
    title: "คุยกับ API และอ่าน JSON",
    summary: "เริ่มดึงข้อมูลจากโลกภายนอกมาใช้ในโปรแกรม",
    unlockHint: "ปลดล็อกเมื่อพร้อมเชื่อม Python กับโลกจริง",
    difficulty: 6,
    tags: ["api", "json", "requests"],
    teacherPrompt:
      "Teach making a simple API request, handling JSON, and explaining each line clearly in Thai.",
  },
  {
    id: "automation-engineer",
    title: "สร้างงานอัตโนมัติแบบโปรเจกต์จริง",
    summary: "รวมสิ่งที่เรียนมาให้เป็นเครื่องมือที่ใช้งานได้จริง",
    unlockHint: "ปลดล็อกเมื่อพร้อมสร้างโปรเจกต์ระดับ engineer",
    difficulty: 6,
    tags: ["automation", "project", "engineer"],
    teacherPrompt:
      "Teach a real mini automation project by combining previous Python topics. Make the project practical and clear.",
  },
];

export const ADVANCED_PROJECT_ROTATION = [
  {
    id: "project-guessing-game",
    title: "มินิโปรเจกต์เกมทายตัวเลข",
    summary: "รวม input, if, while และ random ให้กลายเป็นเกม",
    unlockHint: "กุญแจนี้จะเปิดเมื่อคุณพร้อมรวมหลายสกิลเข้าด้วยกัน",
    tags: ["project", "input", "if", "loops"],
  },
  {
    id: "project-todo-cli",
    title: "มินิโปรเจกต์รายการสิ่งที่ต้องทำ",
    summary: "รวม list, function และ file ให้เกิดโปรแกรมจริง",
    unlockHint: "ยังล็อกอยู่ เพราะต้องใช้ความจำหลายบทพร้อมกัน",
    tags: ["project", "lists", "functions", "files"],
  },
  {
    id: "project-expense-tracker",
    title: "มินิโปรเจกต์บันทึกรายรับรายจ่าย",
    summary: "รวม dict, loop และ file ให้เป็นเครื่องมือที่ใช้ได้จริง",
    unlockHint: "ต้องรู้จักการเก็บข้อมูลและวนดูข้อมูลก่อน",
    tags: ["project", "dict", "loops", "files"],
  },
  {
    id: "project-api-dashboard",
    title: "มินิโปรเจกต์แดชบอร์ด API",
    summary: "รวม API, JSON, function และ error handling เข้าด้วยกัน",
    unlockHint: "ล็อกอยู่จนกว่าจะคุยกับโลกภายนอกผ่าน API เป็น",
    tags: ["project", "api", "json", "functions"],
  },
  {
    id: "project-engineer-refactor",
    title: "มินิโปรเจกต์จัดระเบียบโค้ดระดับ engineer",
    summary: "รวม module, class และ test ให้เป็นงานที่ดูแลต่อได้",
    unlockHint: "ปลดล็อกหลังผ่านบทจัดระเบียบและทดสอบโค้ด",
    tags: ["project", "modules", "classes", "testing"],
  },
];
