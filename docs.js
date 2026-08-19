/**
 * NovelAI cheatsheet — เนื้อหาสั้น ๆ สำหรับกดอ่านในหน้า Extension
 * อ้างอิงหลักจาก docs.novelai.net (Tagging, Strengthening & Weakening,
 * Add Quality Tags, Undesired Content, Multi-Character Prompting, Artstyles tutorial)
 */

export const NAI_DOCS = [
    {
        id: 'artist',
        icon: 'fa-palette',
        title: 'Artist / Style tags',
        body: `# Artist tags

## รูปแบบ
- V4 / V4.5 : ใช้ prefix เสมอ -> \`artist:ชื่อ\`  เช่น \`artist:ask (askzy)\`
  (NovelAI ประกาศ tag รูปแบบนี้ตอนพัฒนา V4 เอง)
- V3 หรือเก่ากว่า : ใส่ชื่อศิลปินดิบ ๆ ตามแบบ danbooru เช่น \`wlop\`, \`ciloranko\`
- ผสมได้หลายคน 2-4 คนเพื่อสร้างสไตล์ลูกผสม ยิ่งเยอะยิ่งกลืนกันจนจืด

## ตำแหน่ง
วางไว้ "ต้น prompt" จะมีผลแรงสุด (tag ที่มาก่อนมีน้ำหนักกว่า)
ถ้าอยากให้สไตล์ชัดขึ้นแต่ไม่พังองค์ประกอบ ใช้ \`1.2::artist:xxx ::\`
ถ้าสไตล์กลบทุกอย่าง ลด \`0.8::artist:xxx ::\`

## ปะทะกับ quality tag
\`very aesthetic\` / \`masterpiece\` ดันภาพไปทางสไตล์กลางของ NAI
ถ้าจะเน้นสไตล์ศิลปินจริง ๆ ให้ครอบ \`[very aesthetic]\` หรือตัดออก

## ตัวอย่าง tag ที่โมเดลรู้จักดี (ตรวจชื่อจริงที่ danbooru ก่อนใช้เสมอ)
โทนสีจัด / คอนทราสต์สูง
  artist:ciloranko, artist:sho (sho lwlw), artist:wlop, artist:rella
  artist:as109, artist:kedama milk, artist:mika pikazo

ไลน์คม อนิเมะโมเดิร์น
  artist:ask (askzy), artist:ningen mame, artist:quasarcake
  artist:hiten (hitenkei), artist:kantoku, artist:fuzichoco

น่ารัก / โมเอะ / ป็อป
  artist:mogumo, artist:wanke, artist:yuuki hagure, artist:momoko (momopoco)
  artist:tsukumo (soar99), artist:kani biimu

เกม CG / อิลลัสเรชันเชิงพาณิชย์
  artist:takeuchi takashi, artist:redjuice, artist:yoneyama mai
  artist:huke, artist:pottsness

สีน้ำ / traditional
  artist:hosizora mikoto, artist:modare, artist:torino aqua

เข้ม / cinematic
  artist:krenz cushart, artist:tianliang duohe fangdongye, artist:jw (jw1224)

## หมายเหตุ
ชื่อ tag บน danbooru ใช้ตัวพิมพ์เล็กและมีวงเล็บกำกับเมื่อชื่อซ้ำ เช่น
\`ask (askzy)\` ถ้าเขียนผิดแม้แต่ตัวเดียวโมเดลจะไม่รู้จักและมองข้ามไปเฉย ๆ
วิธีเช็คเร็วสุดคือค้นชื่อบน danbooru แล้วดูว่า tag artist สะกดยังไง`,
    },
    {
        id: 'interaction',
        icon: 'fa-people-arrows',
        title: 'source# / target# / mutual#',
        body: `# Action tags สำหรับหลายตัวละคร (V4 ขึ้นไป)

## หลักการ
เวลาตัวละครทำอะไรใส่กัน ให้เติม prefix หน้า action tag เพื่อบอกว่าใครทำ ใครโดน
- \`source#hug\`  -> คนที่เป็นฝ่ายกอด
- \`target#hug\`  -> คนที่ถูกกอด
- \`mutual#hug\`  -> ทั้งคู่กอดกัน (ใส่ทั้งสองฝั่ง)

ใช้ได้กับ action แทบทุกตัว: kiss, pointing at another, holding hands,
headpat, carrying, hair grab, looking at another, feeding ฯลฯ

## ข้อควรระวังจาก docs
- NovelAI ระบุเองว่า syntax นี้ "ไม่ได้แม่นเสมอไป" แต่ช่วยได้ในหลายกรณี
- ห้ามเปลี่ยนคำ prefix ต้องเป็น source# / target# / mutual# เป๊ะ ๆ
- ใส่ใน "character prompt" ของแต่ละคน ไม่ใช่ base prompt
- หนึ่ง action ต่อคนก็พอ ยกเว้น mutual# ที่ต้องใส่คู่กัน

## โครงสร้าง base prompt vs character prompt
- base prompt: count tag (\`2girls\`, \`1girl, 1boy\`), ฉาก, แสง, มุมกล้อง, quality tag
- character prompt: ใส่ \`girl\` / \`boy\` / \`other\` เฉย ๆ ไม่ต้องมีตัวเลข
  ตามด้วยผม ตา เสื้อผ้า สีหน้า ท่าทาง แล้วปิดด้วย action tag
- ลำดับ character prompt = ตำแหน่งในภาพ (บนลงล่าง / ซ้ายไปขวา)

## เครื่องหมาย |
บนเว็บ NovelAI ใช้ \`|\` คั่น base prompt กับ character prompt ได้
แต่ผ่าน SillyTavern เส้นทาง NovelAI Official จะส่ง char_captions ว่างเสมอ
ทำให้ \`|\` กลายเป็นตัวอักษรธรรมดา -> extension นี้จึงเขียน prompt เป็นก้อนเดียว
และกัน character bleeding ด้วยการเรียงแท็กของแต่ละคนติดกันเป็นกลุ่มแทน
(ถ้า proxy ส่วนตัวรองรับ char_captions ค่อยแก้ template ใส่ \`|\` เองได้)`,
    },
    {
        id: 'emphasis',
        icon: 'fa-scale-balanced',
        title: 'Density / น้ำหนักแท็ก',
        body: `# Strengthening & Weakening

## แบบวงเล็บ
- \`{tag}\`  = คูณน้ำหนัก 1.05
- \`{{tag}}\` = 1.1025
- \`[tag]\`  = หาร 1.05
- ซ้อนได้เรื่อย ๆ แต่ควรปิดให้ครบจำนวน

## แบบตัวเลข (V4 ขึ้นไป) — แนะนำ
ใส่ตัวเลขแล้วตามด้วย \`::\` ทุกอย่างทางขวาจะโดนน้ำหนักนั้น
จนกว่าจะเจอ \`::\` เปล่า ๆ ที่ปิดท้าย

    1girl, 1.5::rain, night ::, 0.5::coat ::, black shoes

- มากกว่า 1.0 = เน้น, 0.0-1.0 = ลด
- \`::\` เปล่ายังใช้ปิดวงเล็บ {} [] ที่ค้างอยู่ได้ด้วย

## ตัวเลขติดลบ (V4.5 ขึ้นไป)
- \`-1::hat ::\` = ถอดหมวกออกจากภาพ (แรงกว่านี้ใช้ \`-3::hat ::\`)
- ใช้เรียก "ตรงข้าม" ของแท็กได้ด้วย
  \`-1::monochrome ::\` -> สีสดขึ้น
  \`-2.5::flat color ::\` -> ดีเทลละเอียดขึ้น
  \`-1::simple background ::, location\` -> ดึงตัวละครออกจากพื้นหลังว่างเปล่า
- เหมาะกับ "ลบเฉพาะจุด" ส่วน Undesired Content เหมาะกับลิสต์ยาว ๆ

## ห้ามสับสนกับ Stable Diffusion
\`(tag:1.2)\` เป็นไวยากรณ์ของ A1111 **ใช้ไม่ได้กับ NovelAI**
NAI จะอ่านวงเล็บกลมเป็นตัวอักษรธรรมดา
เทียบคร่าว ๆ: (tag:1.15) -> {tag} / (tag:1.2) -> {{tag}}
และ NAI ไม่ต้องใช้ BREAK

## ใช้แค่ไหนถึงพอดี
2-3 จุดต่อ prompt กำลังดี เน้นตัวเอก 1.2-1.3 ลดพื้นหลังหรือของที่ไม่อยากให้เด่น 0.7-0.9
ใส่เยอะเกินภาพจะเพี้ยนและสีแตก`,
    },
    {
        id: 'quality',
        icon: 'fa-star',
        title: 'Quality / Aesthetic / Special tags',
        body: `# แท็กพิเศษของ NovelAI

## Quality tags
best quality / amazing quality / great quality / normal quality / bad quality / worst quality

## Aesthetic tags
masterpiece (V4.5 เท่านั้น) / top aesthetic (V4 เท่านั้น) / very aesthetic / aesthetic
/ displeasing / very displeasing

## ชุด quality tag อัตโนมัติของ NAI (ต่อ "ท้าย" prompt)
- V4.5 Full     : \`location, very aesthetic, masterpiece, no text\`
- V4.5 Curated  : \`location, masterpiece, no text, -0.8::feet::, rating:general\`
- V4 Full       : \`no text, best quality, very aesthetic, absurdres\`
- V4 Curated    : \`rating:general, amazing quality, very aesthetic, absurdres\`
- Anime V3      : \`best quality, amazing quality, very aesthetic, absurdres\`
- Furry V3      : \`{best quality}, {amazing quality}\`
ตั้งค่าในช่อง Positive suffix ของ extension ได้เลย

## Year tags
\`year 2014\`, \`year 2023\` ... ดึงสไตล์ยุคนั้น ใช้ได้ทุกปีแต่ผลต่างกันไป

## Dataset tags (ต้องอยู่ต้น prompt สุด)
- \`fur dataset\` (V4+) โหมดเฟอร์รี
- \`background dataset\` (V4.5+) ภาพวิว/สัตว์/still life แบบไม่มีคน

## Tag อื่นที่มีประโยชน์
- \`location\` = รวม indoors + outdoors ใช้เมื่อไม่อยากระบุว่าในหรือนอกอาคาร
- \`rating:general\` / \`rating:sensitive\` / \`rating:nsfw\` คุมระดับเนื้อหา
- \`no text\` กันตัวหนังสือโผล่

## ลำดับแท็กที่ NAI แนะนำ
\`1boy, 1girl, ชื่อตัวละคร, ชื่อซีรีส์, ที่เหลือตามใจ\`
สำหรับ V3 หรือต่ำกว่า ยิ่งอยู่ต้น prompt ยิ่งมีผลแรง

## แท็กที่ถูกเปลี่ยนชื่อ (เพราะสัญลักษณ์ชนกับ syntax)
- \`v\` -> \`peace sign\`
- \`double v\` -> \`double peace\`
- \`|_|\` -> \`bar eyes\`
- \`:|\` / \`;|\` -> \`neutral face\`
- \`eyepatch bikini\` -> \`square bikini\`
- \`tachi-e\` -> \`character image\``,
    },
    {
        id: 'undesired',
        icon: 'fa-ban',
        title: 'Undesired Content (negative)',
        body: `# ชุด Undesired Content ทางการของ NovelAI
คัดลอกไปวางในช่อง Negative prompt ได้เลย

## V4.5 Full — Heavy
lowres, artistic error, film grain, scan artifacts, worst quality, bad quality,
jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone,
screentone, multiple views, logo, too many watermarks, negative space, blank page

## V4.5 Full — Light
lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts,
multiple views, very displeasing, too many watermarks, negative space, blank page

## V4.5 Full — Human Focus (แนะนำสำหรับ RP)
lowres, artistic error, film grain, scan artifacts, worst quality, bad quality,
jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone,
screentone, multiple views, logo, too many watermarks, negative space, blank page,
@_@, mismatched pupils, glowing eyes, bad anatomy

## V4.5 Curated — Human Focus
blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy,
bad hands, worst quality, bad quality, jpeg artifacts, very displeasing,
chromatic aberration, halftone, multiple views, logo, too many watermarks,
@_@, mismatched pupils, glowing eyes, negative space, blank page

## V4 Full — Heavy
blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality,
jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo,
too many watermarks

## Anime V3 — Human Focus
lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts,
bad quality, watermark, unfinished, displeasing, chromatic aberration, signature,
extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands,
@_@, mismatched pupils, heart-shaped pupils, glowing eyes

## เคล็ดลับ
- ในช่อง negative นั้น \`{tag}\` = หลีกเลี่ยงมากขึ้น, \`[tag]\` = หลีกเลี่ยงน้อยลง
- บางปัญหาต้องคิดอ้อม ๆ เช่น \`freckles\` ทำให้เกิด artifact แปลก ๆ
  แก้ด้วยการใส่ \`tattoo\` ในช่อง negative แทน
- ถ้าอยากลบของชิ้นเดียวแบบเจาะจง ใช้ negative numerical emphasis
  (\`-1::hat ::\`) ในช่อง prompt จะตรงเป้ากว่า`,
    },
    {
        id: 'style',
        icon: 'fa-brush',
        title: 'Medium / Art style / Coloring / FX',
        body: `# แท็กสไตล์ภาพ (วางไว้ต้น prompt จะได้ผลดีสุด)

## Medium
traditional media / faux traditional media / mixed media / unconventional media
คู่กับ: acrylic paint (medium), ballpoint pen (medium), colored pencil (medium),
graphite (medium), ink (medium), marker (medium), millipen (medium),
oil painting (medium), painting (medium), pastel (medium), watercolor (medium)

ฝั่งดิจิทัล: 3d, blender (medium), anime screencap, pixel art (คู่กับ dithering)

## Art style
abstract, surreal, art nouveau, impressionism, ligne claire, nihonga, ukiyo-e,
realistic, photorealistic, retro artstyle

เชิงเทคนิคการวาด: painterly, sketch, lineart, no lineart, jaggy lines, outline,
vector trace, color trace, game cg, official art, shikishi, oekaki, tegaki

## Coloring
anime coloring, colorful, dark, limited palette, partially colored, spot color,
monochrome, greyscale, muted color, pale color, pastel colors, flat color,
high contrast, sepia

โทนสีเดียว: aqua theme, black theme, blue theme, brown theme, green theme,
grey theme, orange theme, pink theme, purple theme, red theme, white theme, yellow theme

## Special effects
backlighting, bloom, bokeh, chromatic aberration, depth of field,
diffraction spikes, dithering, drop shadow, emphasis lines, speed lines,
motion lines, glitch, halftone, lens flare, motion blur, soft focus

## หมายเหตุ
ถ้าใช้ Undesired Content แบบ Heavy จะมี \`chromatic aberration\`, \`halftone\`,
\`dithering\` อยู่ในนั้น -> แท็กพวกนี้ในฝั่ง prompt จะไม่ทำงาน ต้องเอาออกจาก negative ก่อน
และเวลาใช้ monochrome/greyscale ให้เช็คว่าใน prompt ไม่มีแท็กที่ระบุสีอื่นค้างอยู่`,
    },
    {
        id: 'composition',
        icon: 'fa-camera',
        title: 'มุมกล้อง / เฟรม / แสง',
        body: `# แท็กจัดองค์ประกอบภาพ

## ระยะภาพ (เลือกอันเดียว ห้ามใส่ชนกัน)
portrait -> หัวถึงไหล่
upper body -> ครึ่งบน
cowboy shot -> หัวถึงต้นขา (ยอดนิยมสำหรับตัวละคร)
full body -> เต็มตัว
close-up / face focus -> โคลสอัพหน้า
wide shot -> เห็นฉากกว้าง

ตัวอย่างที่ชนกันแล้วภาพพัง: \`full body\` + \`close-up\` พร้อมกัน

## มุมกล้อง
from above, from below, from side, from behind, dutch angle, straight-on,
pov, first-person view, fisheye

## ทิศทางสายตา / การจัดวาง
looking at viewer, looking away, looking back, looking to the side,
eye contact, side-by-side, back-to-back, symmetrical docking

## แสง
backlighting, rim light, sunlight, dappled sunlight, moonlight, candlelight,
neon lights, cinematic lighting, dramatic shadow, god rays, lens flare,
chiaroscuro, colored lighting, two-tone lighting

## พื้นหลัง
simple background, white background, gradient background, blurry background,
depth of field, scenery, detailed background, indoors, outdoors, location

## เวลาและอากาศ
night, evening, sunset, golden hour, dawn, overcast, rain, snow, fog, cloudy sky,
starry sky, underwater

## เคล็ดลับ
- อยากให้พื้นหลังเบลอสวย ๆ : \`depth of field, blurry background, bokeh\`
- ตัวละครลอยอยู่ในความว่าง : เติม \`-1::simple background ::, location\`
- เน้นหน้าให้คม : \`1.2::face focus ::\` แล้วปิดด้วย \`::\``,
    },
    {
        id: 'costume',
        icon: 'fa-shirt',
        title: 'Character / Costume variant tags',
        body: `# แท็กตัวละครและชุดเฉพาะ (Optional แต่ได้ผลมาก)

## รูปแบบ
ตัวละครที่โมเดลรู้จักจะมี tag แบบ \`ชื่อ (ซีรีส์)\` และหลายตัวมี "ชุดเฉพาะ"
เป็น tag แยกอีกชั้น ใส่แล้วได้เครื่องแต่งกายตรงเป๊ะโดยไม่ต้องบรรยายทีละชิ้น

    ชื่อ (ชื่อชุด)
    ชื่อ (ชื่อชุด) (ซีรีส์)

## ตัวอย่างจริง
- usada pekora (1st costume)
- hoshimachi suisei (oriental suit)
- carlotta (splashing summer) (wuthering waves)
- changli (laurel nymph) (wuthering waves)
- belle (summer skies) (zenless zone zero)
- ganyu (twilight blossom) (genshin impact)
- amiya (guard) (arknights)
- hatsune miku (racing miku)

## วิธีใช้ให้ได้ผล
1. ใส่ tag ตัวละครก่อน แล้วตามด้วย tag ซีรีส์
   \`1girl, solo, usada pekora, usada pekora (1st costume), hololive\`
2. ถ้าอยากได้เฉพาะหน้า/ทรงผม แต่เปลี่ยนชุดเอง ให้ใส่แค่ tag ตัวละคร
   แล้วเขียนเสื้อผ้าที่ต้องการต่อ พร้อมกด \`-1::ชื่อชุดเดิม ::\` ถ้าชุดเดิมยังติดมา
3. ชุดที่ไม่ค่อยมีรูปบน danbooru โมเดลจะไม่รู้จัก ให้ถอยไปบรรยายเป็นแท็กเสื้อผ้าปกติ

## วิธีหา tag ที่ถูกต้อง
- ค้นบน danbooru.donmai.us แล้วดูหมวด Character ในแถบซ้ายของรูป
- สะกดต้องตรงเป๊ะ ตัวพิมพ์เล็ก เว้นวรรคและวงเล็บครบ ผิดนิดเดียวโมเดลจะมองข้าม
- ในหน้าเว็บ NovelAI มี tag suggestion พร้อมจุดบอกว่าโมเดลรู้จัก tag นั้นมากแค่ไหน
  ยิ่งจุดทึบยิ่งรู้จักดี ใช้เช็คก่อนเอามาใส่ใน extension ได้

## ข้อควรระวัง
tag ชุดเฉพาะจะลาก "ท่าทาง/พื้นหลังประจำตัว" มาด้วยบางครั้ง
ถ้าไม่อยากได้ ให้ระบุ pose กับ background ของตัวเองให้ชัด หรือถ่วงน้ำหนัก
\`0.8::ชื่อ (ชุด) ::\``,
    },
    {
        id: 'nsfw',
        icon: 'fa-triangle-exclamation',
        title: 'NSFW / rating tags (18+)',
        body: `# เนื้อหาผู้ใหญ่กับ NovelAI

## 1. Rating tags — สวิตช์หลัก
NovelAI เรียนรู้ระบบ rating มาจาก danbooru วางไว้ต้น prompt
- \`rating:general\`      ปลอดภัยเต็มที่
- \`rating:sensitive\`    วาบหวิวเบา ๆ เช่น ชุดว่ายน้ำ ชุดรัดรูป
- \`rating:questionable\` โป๊บางส่วน สื่อความหมายชัด
- \`rating:explicit\`     เนื้อหาผู้ใหญ่เต็มรูปแบบ (บางที่เขียน \`rating:nsfw\`)

ถ้าไม่ใส่อะไรเลย โมเดลจะเดาจากแท็กอื่นในภาพ ซึ่งมักได้ผลไม่นิ่ง
การระบุ rating ตรง ๆ จึงคุมทิศทางได้แม่นกว่า

## 2. โมเดลไหนทำอะไรได้
- Full (V4.5 Full, V4 Full, Anime V3) เทรนกับชุดข้อมูลเต็ม รองรับ NSFW
- Curated ผ่านการคัดกรองมาแล้ว จะเอนไปทาง SFW เสมอ ต่อให้ใส่ \`rating:explicit\`
  ก็มักได้ผลจืดหรือไม่ตรง
- ชุด quality tag ทางการของ Curated มี \`rating:general\` ติดมาด้วย
  ถ้าจะทำ NSFW ต้องเอาออกจากช่อง Positive suffix ก่อน ไม่งั้นมันตีกันเอง

## 3. อยากได้ SFW ล้วน ๆ
- ใส่ \`rating:general\` ใน prompt
- ใส่ในช่อง negative: \`nsfw, nude, nipples, sex, cleavage\`
- หรือใช้ negative numerical emphasis เจาะจง เช่น \`-2::nsfw ::\`
- เลือกโมเดล Curated จะกันพลาดได้อีกชั้น

## 4. โครงสร้าง prompt ฝั่ง NSFW
เรียงแบบเดียวกับภาพทั่วไป แค่เพิ่มสองกลุ่มนี้เข้าไป
1. rating tag ไว้ต้น prompt
2. สภาพเสื้อผ้า: \`nude\`, \`topless\`, \`bottomless\`, \`partially undressed\`,
   \`clothes lift\`, \`open shirt\`, \`undressing\`, \`torn clothes\`, \`covering\`
3. บริบทและท่าทาง แล้วค่อยตามด้วยมุมกล้อง ฉาก แสง ตามปกติ

สำคัญ: ถ้าไม่เขียนสภาพเสื้อผ้าไว้เลย โมเดลจะเติมชุดให้เอง
กลับกัน ถ้าอยากให้ใส่ชุดอยู่ ต้องระบุเสื้อผ้าให้ครบ อย่าปล่อยว่าง

## 5. ควบคุมระดับความแรง
- ถ่วงน้ำหนักได้เหมือนแท็กอื่น เช่น \`0.8::rating:explicit ::\` เพื่อลดทอน
- \`-1::nsfw ::\` ดึงกลับมาทาง SFW โดยไม่ต้องรื้อ prompt
- ระดับ censor: \`censored\`, \`mosaic censoring\`, \`bar censor\`, \`uncensored\`

## 6. ปัญหาที่เจอบ่อย
- ภาพวาบหวิวโผล่มาเองทั้งที่ไม่ได้สั่ง มักมาจากแท็กที่พ่วงความหมายมา เช่น
  \`bed\`, \`bathing\`, \`onsen\`, \`wet clothes\` แก้ด้วย \`rating:general\` + negative
- สั่ง NSFW แล้วไม่ยอมออก เช็คว่าใช้โมเดล Full และไม่มี \`rating:general\`
  ค้างอยู่ใน Positive suffix
- กายวิภาคเพี้ยนเวลาสองคนขึ้นไป ใส่ \`bad anatomy, extra limbs\` ในช่อง negative
  แยกกลุ่มแท็กของแต่ละตัวละครให้ชัด และใช้ source# / target# / mutual#

## 7. ข้อกำหนดที่ต้องรู้
- NovelAI ห้ามสร้างเนื้อหาทางเพศที่เกี่ยวข้องกับผู้เยาว์โดยเด็ดขาด ผิดข้อนี้บัญชีถูกระงับได้ทันที
  เลี่ยงแท็กกลุ่มนี้ทั้งหมด และถ้าตัวละครหน้าเด็ก ให้ระบุแท็กผู้ใหญ่ให้ชัด เช่น \`adult\`, \`mature female\`
- ภาพที่ได้อยู่ภายใต้ ToS ของ NovelAI ตรวจเงื่อนไขก่อนนำไปเผยแพร่หรือใช้เชิงพาณิชย์
- ฝั่ง Connection 1 (โมเดลข้อความที่เขียน prompt) มีฟิลเตอร์ของตัวเอง
  ถ้าโดนบล็อกจะเห็น error content_filter ให้สลับโปรไฟล์ที่ผ่อนกว่า
  หรือข้าม Connection 1 ไปเลยด้วย \`/pxi raw=true <prompt ของคุณ>\``,
    },
    {
        id: 'gptimage',
        icon: 'fa-wand-magic-sparkles',
        title: 'GPT-Image 2 (คู่มือย่อ)',
        body: `# GPT-Image 2 — คู่มือย่อ

อ้างอิงจาก OpenAI Cookbook "GPT Image Generation Models Prompting Guide" (21 เม.ย. 2026)

## 1. เลือกโมเดลตัวไหน
- \`gpt-image-2\` ค่าเริ่มต้นที่แนะนำสำหรับงานใหม่ทุกอย่าง คุณภาพสูงสุด แก้ภาพแม่นสุด เขียนตัวหนังสือในภาพได้ดีสุด
- \`gpt-image-2\` + quality \`low\` เมื่อเน้นเร็วและถูก คุณภาพยังดีพอสำหรับงานส่วนใหญ่
- \`gpt-image-1.5\` / \`gpt-image-1\` เก็บไว้เพื่อความเข้ากันได้กับของเดิมเท่านั้น ไม่แนะนำสำหรับงานใหม่
- \`gpt-image-1-mini\` เมื่อต้นทุนสำคัญกว่าคุณภาพ เช่นงานสร้างจำนวนมากเพื่อคัดเลือก

หมายเหตุ: \`input_fidelity\` ไม่มีผลกับ gpt-image-2 เพราะมันคืนภาพความละเอียดสูงอยู่แล้ว

## 2. ขนาดภาพ
gpt-image-2 ใส่ขนาดอะไรก็ได้ ขอแค่ผ่านเงื่อนไขครบทุกข้อ
- ด้านยาวสุดต้องน้อยกว่า 3840px
- ทั้งสองด้านต้องหารด้วย 16 ลงตัว
- อัตราส่วนด้านยาวต่อด้านสั้นต้องไม่เกิน 3:1
- พิกเซลรวมไม่เกิน 8,294,400 และไม่น้อยกว่า 655,360

ขนาดที่ใช้บ่อย
- 1024x1536 แนวตั้งมาตรฐาน
- 1536x1024 แนวนอนมาตรฐาน
- 1024x1024 จัตุรัส ใช้ได้ทั่วไป
- 2560x1440 (2K) เพดานที่ยังนิ่ง เกินกว่านี้ผลลัพธ์เริ่มแกว่ง
- 3840x2160 (4K) ยังเป็นของทดลอง ถ้าติดกฎด้านยาวให้ปัดลงเป็น 3824x2144

รุ่นเก่า (1 / 1.5 / mini) รับแค่ \`1024x1024\`, \`1024x1536\`, \`1536x1024\`, \`auto\`

## 3. หลักการเขียน prompt
- **เรียงลำดับให้คงที่** ฉาก/พื้นหลัง → ตัวแบบ → รายละเอียดสำคัญ → ข้อจำกัด และบอกด้วยว่าเอาไปใช้ทำอะไร (โฆษณา, ภาพประกอบ, mockup) เพื่อให้โมเดลรู้ระดับความเนี้ยบที่ต้องการ
- **งานซับซ้อนให้แบ่งบรรทัดหรือใส่หัวข้อสั้น ๆ** ดีกว่าเขียนยาวรวดเดียว
- **รูปแบบไหนก็ได้** ประโยคบรรยาย, JSON, คำสั่งเป็นข้อ ๆ หรือแท็ก ใช้ได้หมดตราบใดที่เจตนาชัด เลือกแบบที่ดูแลง่ายที่สุด
- **เจาะจงเรื่องวัสดุ พื้นผิว และสื่อ** (ภาพถ่าย, สีน้ำ, เรนเดอร์ 3D) แล้วค่อยเติมคำเพิ่มคุณภาพเฉพาะจุดที่ต้องการ เช่น film grain, macro detail
- **อยากได้ภาพถ่ายจริง ให้ใส่คำว่า photorealistic ตรง ๆ** คำอย่าง real photograph / taken on a real camera / iPhone photo ก็ช่วยได้ ส่วนสเปกกล้องละเอียด ๆ โมเดลตีความหลวม ๆ ใช้กำหนดโทนรวมได้แต่อย่าหวังผลเป๊ะ
- **ค่อย ๆ แก้ทีละจุด** ดีกว่ายัดทุกอย่างในรอบเดียว เริ่มจาก prompt ฐานสะอาด ๆ แล้วสั่งแก้ทีละอย่าง

## 4. องค์ประกอบภาพและคน
- ระบุระยะภาพและมุมกล้อง: close-up, wide, top-down, eye-level, low-angle
- ระบุแสงและอารมณ์: soft diffuse, golden hour, high-contrast
- ถ้าตำแหน่งสำคัญให้บอกตรง ๆ เช่น "logo top-right", "subject centered with negative space on left"
- ฉากกว้าง ฉากกลางคืน ฝน หรือนีออน ให้เพิ่มรายละเอียดเรื่องสเกล บรรยากาศ และสี ไม่งั้นโมเดลจะเลือกความสมจริงของพื้นผิวแทนอารมณ์
- **เรื่องคน** ให้บอกสัดส่วนในเฟรม ส่วนของร่างกายที่เห็น ทิศทางสายตา และการจับต้องสิ่งของ เช่น "full body visible, feet included", "looking down at the open book, not at the camera", "hands naturally gripping the handlebars" ช่วยเรื่องสัดส่วนและท่าทางได้มาก

## 5. ข้อจำกัด — บอกให้ชัดว่าอะไรเปลี่ยน อะไรห้ามแตะ
- เขียนข้อห้ามตรง ๆ: no watermark, no extra text, no logos/trademarks
- เวลาแก้ภาพให้ใช้สูตร "change only X" + "keep everything else the same" และ**ทวนรายการที่ห้ามเปลี่ยนทุกรอบ** เพื่อกันภาพเพี้ยนสะสม
- ถ้าต้องการแก้แบบผ่าตัด ให้บอกด้วยว่าห้ามแตะความอิ่มสี คอนทราสต์ เลย์เอาต์ ลูกศร ป้ายกำกับ มุมกล้อง และวัตถุรอบข้าง

## 6. ตัวหนังสือในภาพ
- ใส่ข้อความจริงใน**เครื่องหมายคำพูด** หรือ**ตัวพิมพ์ใหญ่ทั้งหมด**
- ระบุลักษณะตัวอักษรเป็นข้อจำกัด: แบบอักษร ขนาด สี ตำแหน่ง
- คำยาก ชื่อแบรนด์ หรือคำสะกดแปลก ให้สะกดทีละตัวอักษร
- ตัวหนังสือเล็ก แผงข้อมูลแน่น หรือหลายฟอนต์ ให้ใช้ quality \`medium\` หรือ \`high\`
- โมเดลเก่งเรื่องตัวหนังสือ แต่ถ้าปล่อยหลวมมันจะแถตัวอักษรมั่ว ๆ มาให้ ต้องล็อกข้อความและตำแหน่งเสมอ

## 7. quality กับความเร็ว
- \`low\` เริ่มจากตรงนี้ก่อนถ้างานเน้นเร็วหรือทำจำนวนมาก หลายกรณีคุณภาพพอแล้ว
- \`medium\` / \`high\` เทียบก่อนใช้จริงเมื่อเป็นตัวหนังสือเล็ก อินโฟกราฟิกแน่น ๆ ภาพใบหน้าโคลสอัพ งานแก้ที่ต้องรักษาหน้าคน และภาพความละเอียดสูง

## 8. พารามิเตอร์อื่น
- \`n\` สร้างหลายภาพในคำขอเดียว (1-10) เหมาะกับการทำตัวเลือกมาเทียบกัน แต่คิดเงินตามจำนวนภาพจริง
- \`output_format\` png (ค่าเริ่มต้น) / jpeg / webp — jpeg เร็วกว่า png เมื่อต้องการความไว
- \`output_compression\` 0-100 ใช้ได้เฉพาะ jpeg และ webp
- \`background\` transparent ต้องคู่กับ png หรือ webp เท่านั้น
- \`moderation\` auto หรือ low — low คือกรองหลวมกว่า
- คิดเงินเป็น token ไม่ใช่ต่อภาพ ภาพออกแพงกว่าข้อความเข้าหลายเท่า ตั้ง n สูง ๆ จึงกินเงินไวกว่าที่คิด

## 9. ใช้กับ extension นี้ยังไง
- ตั้ง "ชุดพารามิเตอร์" ในหมวด ⑤ เป็น GPT-Image แล้วชุด template จะเปลี่ยนเป็นแบบประโยคบรรยายให้เอง
- template ฝั่ง GPT เขียนเป็นร้อยแก้วตามหลักข้อ 3 อยู่แล้ว ไม่ใช้แท็กแบบ NovelAI
- "สไตล์เริ่มต้น" ในหมวด ⑤ จะถูกต่อท้าย system prompt เป็นบรรทัด Style: ... ตามหลักข้อ 3 เรื่องการระบุสื่อและวิธีเรนเดอร์
- template ทุกโหมดสั่งห้ามใส่ตัวหนังสือในภาพไว้แล้วตามข้อ 5 ยกเว้นจะสั่งเพิ่มเองในช่อง Extra instruction
- ถ้าโดนกรองเนื้อหา popup จะให้แก้ prompt แล้วยิงใหม่ได้ทันที ลองแก้เฉพาะคำที่สุ่มเสี่ยง และลองตั้ง moderation เป็น low`,
    },
    {
        id: 'settings',
        icon: 'fa-sliders',
        title: 'ค่าที่แนะนำ + เกร็ด Anlas',
        body: `# ค่าตั้งต้นที่ใช้ได้ดีกับ V4.5

## พารามิเตอร์
- Sampler: k_euler_ancestral (เอนกประสงค์) / k_dpmpp_2m (นิ่ง คมกว่า)
- Scheduler: karras
- Steps: 23-28 (เกิน 28 คุณภาพแทบไม่ต่างแต่เสีย Anlas)
- CFG (scale): 5-6 สำหรับ V4.5, สูงกว่า 7 เริ่มสีแตกและเส้นแข็ง
- Variety boost: เปิดไว้ ช่วยไม่ให้ทุกภาพหน้าเหมือนกัน
- Decrisper: เปิดเมื่อใช้ CFG สูงแล้วภาพเริ่มไหม้
- SMEA / SMEA DYN: ใช้กับ V3 เท่านั้น V4 ขึ้นไปไม่ต้องเปิด

## ขนาดภาพยอดนิยม
832x1216 (แนวตั้ง) / 1216x832 (แนวนอน) / 1024x1024 (จัตุรัส)

## Anlas
- Opus tier เจนฟรีเมื่อ "ไม่เกิน 1024x1024" และ "steps ไม่เกิน 28"
- Upscale เป็นงานแยกที่คิด Anlas ต่างหากเสมอ
- ติ๊ก Avoid spending Anlas ใน extension จะย่อขนาดและตัด steps ให้อัตโนมัติ
  เฉพาะตอนยิงจริง โดยไม่แก้ค่าที่ตั้งไว้

## Seed
- -1 = สุ่มใหม่ทุกครั้ง
- ล็อก seed ไว้แล้วแก้ prompt ทีละนิด = วิธีไล่หาองค์ประกอบที่ถูกใจ
- seed เดียวกันแต่ต่างขนาดภาพ จะไม่ได้ภาพเดิม

## เวิร์กโฟลว์ที่แนะนำในส่วนขยายนี้
1. ตั้ง Positive suffix เป็นชุด quality tag ของโมเดลที่ใช้
2. ตั้ง Negative เป็นชุด Human Focus ของโมเดลนั้น
3. เจนจาก Last Message -> ปัดขวาที่รูปเพื่อแก้ prompt แล้วเจนใบใหม่
4. ได้องค์ประกอบที่ชอบแล้วค่อยล็อก seed และเปิด Upscale`,
    },
];

export function docsToMarkdown() {
    const header = '# Cheatsheet — Proxy Image Gen\n\nรวบรวมจาก docs.novelai.net และ OpenAI Cookbook\n';
    return [header, ...NAI_DOCS.map(doc => doc.body)].join('\n\n---\n\n');
}
