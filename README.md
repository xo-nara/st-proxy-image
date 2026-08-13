# Proxy Image Gen (NovelAI / OpenAI-Compatible) — v2.0

Extension สำหรับ SillyTavern ที่แยกงานเจนรูปเป็น 2 Connection

```
Connection 1  →  [ตรวจ/แก้ prompt]  →  Connection 2  →  รูปเข้าแชท (ปัดขวาเพื่อแก้ prompt แล้วเจนใบใหม่)
Connection Profile ของ ST                NovelAI Official
หรือ Custom OpenAI-compatible            หรือ Reverse Proxy
```

## ติดตั้ง
วางโฟลเดอร์นี้ใน `SillyTavern/public/scripts/extensions/third-party/` แล้วรีเฟรช
ไฟล์ที่ต้องมี: `manifest.json`, `index.js`, `settings.html`, `style.css`

## โหมดการเจน
| โหมด | ใช้ข้อมูล | เหมาะกับ |
|---|---|---|
| Portrait | `{{description}}` `{{personality}}` + `{{lastMessage}}` | รูปตัวละครเดี่ยวตามสภาพในฉากปัจจุบัน |
| Selfie | `{{description}}` + `{{lastMessage}}` | โคลสอัพหน้า {{char}} หัวถึงคอ พร้อมสีหน้าและฉากปัจจุบัน |
| User | `{{persona}}` (โครง) + `{{lastMessage}}` (ชุด/ท่าทาง/ฉาก) | ตัวละครฝั่ง {{user}} ตามสภาพและท่าทางในฉากปัจจุบัน |
| Last Message | `{{lastMessage}}` + `{{chat}}` | ฉากล่าสุด รองรับหลายตัวละคร |
| Free / Scene | `{{chat}}` | คำสั่งอิสระ |

เรียกได้จากปุ่มในหน้าตั้งค่า, เมนูไม้กายสิทธิ์ (มี submenu ลอย), หรือ
`/pxi mode=last` • `/pxi mode=portrait ใส่ชุดคลุมสีดำ` • `/pxi raw=true 1girl, silver hair`

## Prompt Templates
หมวด ② แก้ได้เฉพาะ **System** ของแต่ละโหมด (พร้อมปุ่มรีเซ็ตทีละโหมด/ทั้งหมด)
ส่วน user message ระบบประกอบให้เองตามโหมด จึงไม่ต้องดูแล

ทุก default template สอนโมเดลเรื่อง:
- **Cast ทั้งฉาก** (โหมด last/free) ไล่ชื่อตัวละครทุกตัวที่ปรากฏในข้อความ ไม่ใช่แค่ `{{char}}` + count tag ต้องตรงกับ cast
- **ตำแหน่ง** ยึดตำแหน่งสุดท้ายในข้อความ เรียงบล็อกซ้าย→ขวา และเสริมด้วย relation/foreground/background
- **ส่วนสูงและระดับสายตา** แท็ก build สัมบูรณ์ + `height difference` ทั้งสองฝั่ง + เงย/ก้มตามระดับสายตาจริง (นั่ง/คุกเข่าชนะส่วนสูงดิบ)
- **Style tail** ปิดท้ายทุก prompt ทั้ง 5 โหมด ด้วยแท็กสไตล์ของแฟรนไชส์ (genshin impact / arknights / project sekai ฯลฯ) + rendering style + `masterpiece, very aesthetic, absurdres, best quality`
- แท็กตัวละครแบบ Danbooru `name (series)` และแท็กชุดเฉพาะ เช่น `usada pekora (1st costume)` ถ้าไม่มั่นใจให้ข้ามไม่ให้เดา
- ลำดับแท็กตามที่ NAI แนะนำ + ห้ามใส่แท็กเฟรมชนกัน + แท็กที่ถูกเปลี่ยนชื่อ (`peace sign` ไม่ใช่ `v`)
- **Density**: `1.2::tag, tag ::` ปิดด้วย `::` เปล่า, `-1::hat ::` เพื่อลบของ, ใช้ 2-3 จุดพอ และห้ามใช้ `(tag:1.2)` แบบ SD หรือ `|`

โหมด **User** ใช้ `{{persona}}` เป็นลักษณะถาวร (เพศ รูปร่าง ทรงผม สีตา) และใช้ข้อความล่าสุดเป็นสถานะปัจจุบัน (ชุดที่ใส่อยู่ ผมเปลี่ยนทรง สีหน้า สถานที่) เมื่อขัดกันในเรื่องชั่วคราว ให้ยึดตามฉาก

### {{extra}}
ช่อง **Extra instruction** ในหมวด ② คือค่าของ `{{extra}}` — แทรกท้าย user message เป็นบล็อก `--- Extra instruction ---` ทุกโหมด และข้อความหลัง `/pxi` จะถูกต่อเข้ากับช่องนี้

## NovelAI Cheatsheet (หมวด ⑦)
ปุ่มเล็ก 10 หัวข้อ กดอ่านในป็อปอัพ คัดลอก หรือบันทึกเป็น `.md` ได้ (มีปุ่มบันทึกรวมทั้งหมดด้วย)
Artist tags • source#/target#/mutual# • Density/น้ำหนักแท็ก • Quality/Aesthetic/Special tags •
Undesired Content ทางการ • Medium/Art style/Coloring/FX • มุมกล้อง/เฟรม/แสง • Character & Costume variant tags • NSFW / rating tags (18+) • ค่าที่แนะนำ + เกร็ด Anlas

ปุ่ม **ใส่ค่าที่ NovelAI แนะนำ** ในหมวด ⑤ จะเซ็ต suffix เป็นชุด quality tag ทางการของโมเดลที่เลือก, negative เป็นชุด Human Focus, และ sampler/scheduler/steps/CFG ให้ทันที

## Connection 2
กดปุ่ม **เชื่อมต่อ** เพื่อตรวจการเชื่อมต่อและโหลดรายชื่อโมเดล — โหมด NovelAI จะแสดง tier, ยอด Anlas และสิทธิ์เจนรูปฟรี ส่วนโหมด Custom จะดึง `/models` มาเติมใน dropdown ให้เลือก (พิมพ์ชื่อโมเดลเองก็ได้ถ้า endpoint ไม่มี `/models`)
ปุ่ม **ทดสอบเจนรูป** ยิงจริง 1 ใบเพื่อยืนยันว่า pipeline ทำงานครบ

## NovelAI Official
กรอกคีย์แล้วกดบันทึก — คีย์ถูกเก็บในช่อง NovelAI ของ SillyTavern เอง (`api_key_novel`) ไม่ได้เก็บในไฟล์ตั้งค่าของ extension
คำขอวิ่งผ่าน `/api/novelai/generate-image` ของเซิร์ฟเวอร์ ST จึงไม่ติด CORS
โมเดล: V4.5 Full / V4.5 Curated / V4 Full / V4 Curated / V3 / Furry V3

**Avoid spending Anlas (Opus tier)** — เปิดไว้ระบบจะย่อภาพให้ไม่เกิน 1024x1024 (คงอัตราส่วน ปัดเป็นทวีคูณของ 64) และตัด steps เหลือ 28 เฉพาะตอนยิงจริง ไม่แก้ค่าที่ตั้งไว้ในหน้าตั้งค่า
**View my Anlas** — เช็คยอด Anlas, tier และสิทธิ์เจนรูปฟรีจาก `/api/novelai/status`

**ข้อจำกัดที่ต้องรู้:** เซิร์ฟเวอร์ ST ส่ง `char_captions: []` เสมอ แปลว่าไวยากรณ์ `|` (base prompt | character prompt) ของ V4 **ใช้ไม่ได้** ผ่านเส้นทางนี้ default template จึงเขียนเป็น prompt ก้อนเดียว ถ้า proxy ส่วนตัวรองรับ char_captions ค่อยแก้ template เพิ่ม `|` เอง

## Image Parameters
จัดเป็น 4 กลุ่ม: **ขนาดภาพ** (dropdown สำเร็จรูป + ช่องกำหนดเอง + ปุ่มบันทึก, ปัดเป็นทวีคูณของ 64 อัตโนมัติ, มีบรรทัดบอก "จะส่งจริง WxH" หลังผ่าน Anlas guard) • **การสุ่มภาพ** (Sampler, Scheduler, Steps, CFG, Seed, Upscale, Timeout) • **ตัวเลือกเสริม** (Variety boost, Decrisper, SMEA; SMEA DYN ปิดถาวรเพราะทำให้ภาพเพี้ยนบน V4 ขึ้นไป) • **แท็กประกอบ** (prefix / suffix / negative / extra body)

ค่าเริ่มต้นของขนาดคือ **768x1344 (3:4)** และมี 1344x768 (4:3) ให้เลือกคู่กัน
ปุ่ม **ใส่ค่าที่ NovelAI แนะนำ** ตั้งทุกค่าในหมวดนี้ให้ตามโมเดลที่เลือก **ยกเว้นขนาดภาพ** ที่คงไว้ตามที่ตั้งเอง

## Context Budget
จำกัดข้อความล่าสุด / ตัวอักษรต่อข้อความ / เพดานรวม, ตัด HTML + UI module block + code block ออกก่อนส่ง
ค่าแนะนำ: ข้อความล่าสุด **3-8** (4) • ตัด/ข้อความ **300-1200** (600) • เพดานรวม **1000-10000** (4000)
ช่อง "ตัด/ข้อความ" คูณ 3 = ความยาวสูงสุดของข้อความล่าสุด และหน้าตั้งค่ามีบรรทัดคำนวณสด ๆ พร้อมเตือนเมื่อค่าต่ำ/สูงเกินไปหรือ Max tokens ของ Connection 1 น้อยจน prompt ถูกตัดกลางคัน
ปุ่ม **Preview** ดู payload จริงของ Connection 1 พร้อมนับ token

## เมื่อเกิดปัญหา
ทุก error เด้ง popup บอกสาเหตุ + คำแนะนำ + raw response เช่น ติดฟิลเตอร์เนื้อหา (`content_filter` / คำปฏิเสธ),
คีย์ผิด, Anlas หมด, คิวเต็ม 429, โมเดลกำลังบ่ม 5xx

---
@xo.nara & Claude
