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
| User | `{{persona}}` + `{{lastMessage}}` | ตัวละครฝั่ง {{user}} ตามสภาพในฉากปัจจุบัน |
| Last Message | `{{lastMessage}}` + `{{chat}}` | ฉากล่าสุด รองรับหลายตัวละคร |
| Free / Scene | `{{chat}}` | คำสั่งอิสระ |

เรียกได้จากปุ่มในหน้าตั้งค่า, เมนูไม้กายสิทธิ์ (มี submenu ลอย), หรือ
`/pxi mode=last` • `/pxi mode=portrait ใส่ชุดคลุมสีดำ` • `/pxi raw=true 1girl, silver hair`

## Prompt Templates
หมวด ② แก้ได้เฉพาะ **System** ของแต่ละโหมด (พร้อมปุ่มรีเซ็ตทีละโหมด/ทั้งหมด)
ส่วน user message ระบบประกอบให้เองตามโหมด จึงไม่ต้องดูแล

ทุก default template สอนโมเดลเรื่อง:
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

## NovelAI Official
กรอกคีย์แล้วกดบันทึก — คีย์ถูกเก็บในช่อง NovelAI ของ SillyTavern เอง (`api_key_novel`) ไม่ได้เก็บในไฟล์ตั้งค่าของ extension
คำขอวิ่งผ่าน `/api/novelai/generate-image` ของเซิร์ฟเวอร์ ST จึงไม่ติด CORS
โมเดล: V4.5 Full / V4.5 Curated / V4 Full / V4 Curated / V3 / Furry V3

**Avoid spending Anlas (Opus tier)** — เปิดไว้ระบบจะย่อภาพให้ไม่เกิน 1024x1024 (คงอัตราส่วน ปัดเป็นทวีคูณของ 64) และตัด steps เหลือ 28 เฉพาะตอนยิงจริง ไม่แก้ค่าที่ตั้งไว้ในหน้าตั้งค่า
**View my Anlas** — เช็คยอด Anlas, tier และสิทธิ์เจนรูปฟรีจาก `/api/novelai/status`

**ข้อจำกัดที่ต้องรู้:** เซิร์ฟเวอร์ ST ส่ง `char_captions: []` เสมอ แปลว่าไวยากรณ์ `|` (base prompt | character prompt) ของ V4 **ใช้ไม่ได้** ผ่านเส้นทางนี้ default template จึงเขียนเป็น prompt ก้อนเดียว ถ้า proxy ส่วนตัวรองรับ char_captions ค่อยแก้ template เพิ่ม `|` เอง

## Image Parameters
Sampling method, Scheduler, Steps, CFG scale, Seed, Upscale, Variety boost, Decrisper, SMEA / SMEA DYN
โหมด Custom มีช่อง Advanced extra body (JSON) สำหรับ merge ทับพารามิเตอร์ทั้งหมด

## Context Budget
จำกัดข้อความล่าสุด / ตัวอักษรต่อข้อความ / เพดานรวม, ตัด HTML + UI module block + code block ออกก่อนส่ง
ปุ่ม **Preview** ดู payload จริงของ Connection 1 พร้อมนับ token

## เมื่อเกิดปัญหา
ทุก error เด้ง popup บอกสาเหตุ + คำแนะนำ + raw response เช่น ติดฟิลเตอร์เนื้อหา (`content_filter` / คำปฏิเสธ),
คีย์ผิด, Anlas หมด, คิวเต็ม 429, โมเดลกำลังบ่ม 5xx

---
@xo.nara & Claude
