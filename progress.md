Original prompt: สร้างโปรเจคเว็บไซต์ฟรีฉันจะเอาลง GitHub ฟรี เว็บไซต์นี้เกี่ยวกับการสอนเขียนโค้ด python เริ่มตั้งแต่มือใหม่ที่ไม่รู้จักโค้ด สอนแบบรายละเอียดระดับประถม ทำให้เข้าใจง่าย แบบเกมผ่านด่านสไตล์ Duolingo มี AI ช่วยสอน ตรวจคำตอบ ใช้ Gemini API keys หลายอันและหลายโมเดลได้ บันทึกข้อมูลในเครื่อง โทนมืดสบายตา และต้องเปิด localhost ทดสอบกับดีบัคให้ใช้งานได้จริง

TODO
- สร้าง static site พร้อม UI เกมสอน Python และ onboarding/settings
- เพิ่ม localStorage, lesson engine, AI tutor, model fallback และ sound effects
- ทดสอบบน localhost และเก็บผล debug

Progress notes
- สร้างโปรเจกต์ static เรียบร้อย: `index.html`, `styles/main.css`, และโมดูล JS แยกตามหน้าที่
- ทำ UI ธีมมืดแบบเกม มี HUD, profile onboarding, settings dialog, Gemini model picker, AI coach, lesson/review panels
- เพิ่มระบบ `localStorage` สำหรับโปรไฟล์ ความคืบหน้า API keys โมเดล และคิวทบทวน
- ทำ lesson engine แบบสอนก่อนค่อยทำ พร้อม feedback บอกจุดผิดทีละตำแหน่ง และคิวทบทวนคำถามที่พลาด
- เพิ่ม Gemini integration แบบหลายคีย์หลายโมเดล พร้อมตรวจสถานะโมเดลและ fallback อัตโนมัติเมื่อ quota/error
- ทดสอบ syntax ของไฟล์ JS ด้วย `node --check`
- ทดสอบเสิร์ฟเว็บผ่าน `python -m http.server` และยืนยันว่า `http://127.0.0.1:4317/index.html` ตอบกลับ `200` พร้อม title `PyQuest Academy`
- เปิด localhost ให้ผู้ใช้บนเครื่องแล้ว
- ยกเครื่อง flow ใหม่ให้หน้าแรกเป็นหน้าเลือกด่านอย่างเดียว และหน้าบทเรียนเป็นอีกหน้าจอที่โฟกัสเฉพาะการเรียน
- เปลี่ยนระบบบทเรียนจากชุดเล็กคงที่ เป็นระบบสร้างด่านต่อเนื่องด้วย AI หรือ generator สำรองในเครื่อง พร้อมเก็บ stage catalog ลง local
- เพิ่ม curriculum ยาวตั้งแต่ติดตั้ง Python ไปจนถึง project และ engineer-oriented stages
- เพิ่ม review deck, journal ของสิ่งที่สอนไปแล้ว, stage unlock, replay และ stage result dialog
- ยืนยันอีกครั้งว่า `scripts/app.js`, `scripts/stage-generator.js`, `scripts/gemini.js`, `scripts/lesson-engine.js` ผ่าน `node --check`
