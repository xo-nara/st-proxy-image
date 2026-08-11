import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { NAI_DOCS, docsToMarkdown } from './docs.js';

const MODULE_NAME = 'proxyImageGen';
const LOG = '[ProxyImageGen]';
const NAI_SECRET_KEY = 'api_key_novel';

/** โฟลเดอร์จริงของ extension (รองรับกรณีผู้ใช้เปลี่ยนชื่อโฟลเดอร์) */
const EXT_PATH = (() => {
    try {
        const parts = new URL('.', import.meta.url).pathname.split('/').filter(Boolean);
        return parts.slice(-2).join('/');
    } catch {
        return 'third-party/st-proxy-image';
    }
})();

/* ================================================================== */
/* Prompt templates (ค่าเริ่มต้น)                                      */
/* ================================================================== */

const NAI_RULES = 'Output rules: lowercase Danbooru-style tags, comma-separated, English only. No sentences, no markdown, no quotes, no explanations. Output the tag list only.';

const IDENTITY_RULE = `For every character, ask whether that name belongs to an existing character from an anime, game, manga, VTuber or other work that Danbooru would have a tag for.\n- If yes, that character's tags MUST open with the canonical Danbooru character tag written as "name (series)", then the series tag on its own: "amiya (arknights), arknights". A recognised costume tag may follow when the scene matches it: "usada pekora (1st costume)". Gendered variants belong inside the tag itself: "female rover (wuthering waves)".\n- If you are not certain of the exact Danbooru spelling, drop the identity tag and describe the look instead. Never invent or half-guess a tag.\n- Always write appearance tags as well. The identity tag sets the face and silhouette; the appearance tags keep this scene correct.`;

const HEIGHT_RULE = `Heights and eye lines - the model flattens everyone to the same height unless you fight it:\n- Rank the cast from tallest to shortest using the appearance block, the persona block, what the identity tag implies, and anything the message states outright.\n- Give every character an absolute build tag inside their own group so the ranking has something to hold onto: "tall", "very tall", "average height", "short", "petite", "small build", "lanky", "muscular", "broad shoulders", "slender". A tall character with no tag will be drawn average.\n- When two characters differ noticeably, put "height difference" in BOTH groups, and add "size difference" when the gap is large. These tags only work when both sides carry them.\n- Reinforce from the shorter side with "looking up at another", "standing on tiptoes", "reaching up", and from the taller side with "looking down at another", "leaning down", "bending over".\n- Set each gaze from the eye lines you just worked out. Lower eyes get "looking up", higher eyes get "looking down", equal eye levels get "eye contact" or "looking at another". A seated or kneeling character looks up at a standing one even when they are the taller of the two - posture beats raw height.\n- Camera tags are separate: "from above" and "from below" describe where the viewer stands, not who is taller. Never use them as a substitute for height tags.`;

const STYLE_TAIL = `=== STYLE TAIL - ALWAYS END THE PROMPT WITH THIS ===\nAfter every character group and every scene tag, close the prompt with a style tail in this order:\n1. Franchise art style - when the cast comes from a work with a distinctive house style, name it as an official-art tag: "genshin impact", "arknights", "project sekai", "honkai: star rail", "blue archive", "wuthering waves", "zenless zone zero", "hololive", "fate/grand order", "nikke", "azur lane". Add "official art" next to it when the look matches promotional art. Repeating the series tag here is deliberate - it steers the rendering style, so write it both in the character group and here. Two characters from different works: name both series, or drop this line rather than blending them badly. Original characters with no franchise: skip this line.\n2. Rendering style - one or two tags that match the source's look, chosen from: "anime coloring", "cel shading", "soft shading", "painterly", "detailed background", "game cg", "official art", "gradient hair", "glowing eyes", "sparkle", "depth of field", "bloom", "rim light", "cinematic lighting".\n3. Quality tail - always exactly this, always last: "masterpiece, very aesthetic, absurdres, best quality"\nNever place the style tail in the middle of the prompt and never put it inside a character group. It belongs after everything else, as the final tags of the output.`;

const BACKGROUND_RULE = `Background - never fall back to an empty studio backdrop:\n- The background MUST be the place the character is in according to the latest message: the room, the furniture and objects around them, the time of day, the weather, the light source. Name them as tags: "bedroom, indoors, night, unmade bed, curtains, lamplight" rather than "simple background".\n- Do not write "simple background", "white background", "grey background", "gradient background" or "transparent background" unless the message really puts the character against a blank wall or void.\n- If the model still tends to flatten it, push back with "-1::simple background ::" and add "location" so it commits to a real place.\n- Only when the message gives no location at all, infer the most likely place from the scene that came before it, and only if that fails choose a plain but real setting such as "indoors, wooden wall, window light".\n- Depth tags are welcome: "depth of field", "blurry background", "bokeh" keep the focus on the character while the place still reads.`;

const RATING_RULE = `Rating: prepend "rating:general" for a safe scene, "rating:sensitive" for suggestive, "rating:explicit" for an adult scene. Adult content only for characters who are adults; if a character reads as young, do not write an adult scene for them regardless of what the text says.`;

const ORDER_RULE = 'Tag order: subject count tags first, then character identity and appearance, then clothing, then expression and pose, then action, then camera framing, then setting, background, lighting and mood. Pick exactly one framing tag - never combine conflicting ones such as full body and close-up.';

const RENAMED_RULE = 'Renamed tags: write "peace sign" not "v", "double peace" not "double v", "neutral face" not ":|", "square bikini" not "eyepatch bikini".';

const DENSITY_RULE = 'Emphasis is numeric: "1.2::tag, tag ::" always closed by a bare "::". Use it in 2 or 3 spots at most - raise the focus of the moment to 1.15-1.3, lower distracting background detail to 0.7-0.9, and use "-1::tag ::" to remove something a character normally wears when the scene says it is gone. Never use the Stable Diffusion form (tag:1.2), never use BREAK, never use the "|" character, and never wrap tags in [ ] or { } - in NovelAI those change the weight instead of grouping.';

const DEFAULT_TEMPLATES = {
    free: {
        label: 'Free / Scene (คำสั่งทั่วไป)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nRead the roleplay excerpt and describe the CURRENT scene as one image.\n\nCast: include every character the excerpt shows as present, not only the ones you were given blocks for. Count tags must match that cast. Several unnamed people become one crowd tag instead of their own group.\n\n${IDENTITY_RULE}\n\n${HEIGHT_RULE}\n\nWrite each character as one unbroken group wrapped in a numeric-emphasis boundary so their traits cannot mix: "1.05::girl, <identity>, <hair>, <eyes>, <height and build>, <clothing>, <expression>, <gaze>, <posture>, <action tag> ::". Open with the bare word "girl", "boy" or "other" - numbered count tags live only in the scene header.\n\n${ORDER_RULE}\n${RENAMED_RULE}\n${DENSITY_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\n\n35-50 tags total.\n${NAI_RULES}`,
    },
    portrait: {
        label: 'Portrait (ตัวละคร)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nWrite ONE solo portrait prompt of the CHARACTER as they appear in the latest message.\n\nSource priority:\n- The latest message is the PRIMARY source. Take the outfit worn right now, hair up or down, wet, dirty or damaged states, expression, gaze, pose, and the place they are in from it.\n- The character sheet is the FALLBACK for fixed traits only: gender, build, height, hair colour and length, eye colour, permanent marks. Use it whenever the scene does not mention something.\n- When the two conflict on anything temporary (clothes, hairstyle, mood, location), the latest message wins.\n- If the scene gives no clothing, fall back to the sheet.\n\nStart with the count tag (1girl / 1boy / 1other) and solo, then the identity tags, then hair, eyes, height and build, distinctive features, the current outfit, expression and gaze, pose, framing (upper body or cowboy shot), background, lighting.\n\n${IDENTITY_RULE} A costume variant tag may be used only when the scene actually describes that outfit.\n\n${BACKGROUND_RULE}\n\nGive the character an absolute build tag such as "tall", "petite" or "slender" - without one the model draws an average build.\n\n${ORDER_RULE}\n${RENAMED_RULE}\n${DENSITY_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\n\nDraw only this one character and only what the moment shows: no second person, no past events, no dialogue text. Do not use source#, target# or mutual# tags.\n25-40 tags.\n${NAI_RULES}`,
    },
    selfie: {
        label: 'Selfie (โคลสอัพหน้า {{char}})',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nWrite ONE close-up face shot of the CHARACTER, as if it were a selfie taken right now.\nAlways include, in this order:\n1. Count tag (1girl / 1boy / 1other), solo, then the character identity tags.\n2. Framing that keeps it head-to-neck: portrait, close-up, face focus. Never add tags for torso, hands, legs, breasts or full body.\n3. Face detail: hair colour and style around the face, hair ornaments, eye colour, blush, sweat or tears if present.\n4. Expression from the current scene plus gaze direction (looking at viewer / looking away).\n5. Collar-level clothing only: shirt collar, choker, scarf and the like.\n6. Background of the place they are in right now, plus lighting, and depth of field or blurry background.\n\n${BACKGROUND_RULE}\n\n${IDENTITY_RULE}\n${RENAMED_RULE}\n${DENSITY_RULE}\nPut the face emphasis to work, for example "1.2::face focus, looking at viewer ::" and weaken the background with something like "0.8::blurry background ::".\n${RATING_RULE}\n\n${STYLE_TAIL}\n\n20-32 tags.\nDo not use source#, target# or mutual# tags: this is a solo close-up.\n${NAI_RULES}`,
    },
    user: {
        label: 'User (ตัวละครฝั่งผู้ใช้)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nWrite ONE solo prompt of the USER's character as they are in the latest message.\n\nTwo sources are given and they have different jobs:\n- The persona block holds the FIXED traits: gender, body type, height, build, hair colour and length, eye colour, permanent marks. Take these from the persona unless the scene explicitly changed them.\n- The latest message holds the CURRENT state and it decides everything temporary. Read it for: what they are wearing right now, hair put up or let down, wet, dirty or damaged states, expression and gaze, POSTURE AND POSE (standing, sitting, kneeling, lying, leaning, walking, arms crossed, hands behind back, what they are holding or touching), and the PLACE they are in with its furniture, time of day, weather and lighting. When the scene contradicts the persona on something temporary, the scene wins.\n- Take the pose and the background from the character's FINAL position in the message, not where they started.\n- Only when the latest message says nothing about clothing or pose, fall back to the persona and pick a neutral pose.\n\n${BACKGROUND_RULE}\n\nSolo image: draw only the user's character. If the other character is touching them in the scene, keep the effect on the user's own body - a blush, dishevelled clothes, an outstretched arm - but do not draw the second person and do not use source#, target# or mutual# tags.\n\nStart with the count tag (1girl / 1boy / 1other) and solo, then identity and appearance, then height and build, clothing, expression and gaze, posture and pose, framing (upper body or cowboy shot; use full body when the pose is the point), background, lighting.\n${IDENTITY_RULE}\n\nGive the character an absolute build tag such as "tall", "petite" or "slender" - without one the model draws an average build.\n\n${ORDER_RULE}\n${RENAMED_RULE}\n${DENSITY_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\nMatch the franchise style to the world the scene takes place in, so the user's character sits in the same art style as the character they are with.\n\n25-40 tags.\n${NAI_RULES}`,
    },
    last: {
        label: 'Last Message (ฉากล่าสุด)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nTurn the LATEST message into one image that reads as the whole scene at that instant - who is there, where each of them stands, how tall each of them is next to the others, what they are doing to each other, and what the place looks like around them.\n\n=== STEP 1: BUILD THE CAST ===\nList EVERY character physically present in the latest message, not just the ones you were given blocks for. A character counts as present if the message shows them acting, speaking, being touched, being looked at, or standing in the frame.\n- Side characters, named NPCs, servants, guards, shopkeepers, classmates and rivals all belong in the image if the moment shows them. Several unnamed people become one crowd tag in the header ("crowd", "people", "multiple boys") instead of groups.\n- Leave someone out only if the message shows them absent, off-screen, behind a door, or merely mentioned rather than present.\n- Count tags MUST match this cast. Two women and a man is "2girls, 1boy" - never shrink it to "1girl" just because only one character had an appearance block supplied.\n\n=== STEP 2: RESOLVE POSITIONS ===\nA message often moves people around. Read it start to finish and take each character's FINAL position - where they ended up by the last sentence, not where they began.\n- Note for each character: where they are in the room, how far from the others, whether standing, sitting, kneeling or lying, and what they are on or against.\n- Then decide the left-to-right order of the frame. Character groups are emitted in that order: the first group is the leftmost figure, the last group is the rightmost. This ordering is the main way the model places people, so choose it deliberately.\n- Reinforce the layout with relation tags inside the group of the character they describe: "standing", "sitting", "kneeling", "lying", "sitting on lap", "on person", "behind another", "in front of another", "back-to-back", "side-by-side", "leaning forward", "leaning on person", "foreground", "background".\n- If two characters are apart rather than touching, use distance tags such as "facing each other", "across the room", "looking at another" instead of contact tags.\n\n=== STEP 3: RESOLVE HEIGHTS AND EYE LINES ===\n${HEIGHT_RULE}\n- If the height gap is the point of the moment, raise it once: "1.25::height difference, looking up at another ::".\n\n=== STEP 4: IDENTIFY EACH ONE ===\n${IDENTITY_RULE}\n\nWhere each look comes from, in order:\n1. The latest message - always wins for clothing, hair state, expression, pose, injuries, anything temporary.\n2. The appearance block (main character) and the persona block (user's character), for fixed traits including height and build.\n3. For a side character with no block, build the look from what the message says plus what their identity tag implies. If the message gives nothing, write plain role-appropriate tags rather than skipping them.\n\n=== STEP 5: OUTPUT SHAPE ===\nOne flat comma-separated list in this order:\n\n1. SCENE HEADER - count tags for the whole cast, then the setting: place, indoors or outdoors, time of day, weather, key objects and furniture that anchor the layout, lighting, mood. Then exactly one framing tag wide enough to hold everyone: "wide shot", "full body" and "cowboy shot" work for two or more people and are the ones that actually show a height difference; "from side" helps a layout read clearly; reserve "close-up" and "portrait" for a single figure. Never combine conflicting framing tags.\n\n2. ONE GROUP PER CHARACTER, emitted left to right, each a numeric-emphasis group so the model cannot mix two characters together:\n   "1.05::girl, <identity tags>, <hair>, <eyes>, <height and build>, <skin>, <clothing>, <expression>, <gaze>, <posture and position>, <action tag> ::"\n   - Open with the bare word "girl", "boy" or "other" - never a numbered count tag, those live only in the header.\n   - Close every group with a bare "::" before the next one. Never let one character's tags spill into another group.\n   - Clothing is mandatory. If a character is undressed, say so explicitly or the model will invent an outfit.\n   - The character the moment centres on goes at 1.15; the others stay at 1.05.\n\n=== ACTION TAGS ===\n- Different roles: "source#<action>" on the one performing it, "target#<action>" on the one receiving it. One hugs the other gives source#hug and target#hug.\n- Reciprocal: the same "mutual#<action>" written identically in both groups - mutual#hug, mutual#kissing.\n- Test: if swapping the two characters changes the meaning, use source/target; if it stays the same, use mutual.\n- One action tag per character, except mutual# which is shared. Put it last inside the group. Never rename source, target or mutual, never use them in a solo image, never use them for something done alone - that is a plain tag such as "sitting" or "drinking".\n- With three or more characters, tag only the pair actually interacting; give the bystanders ordinary posture and gaze tags.\n- If nobody is touching anyone, omit action tags entirely.\n\n=== SYNTAX ===\n${DENSITY_RULE}\n${RENAMED_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\n\nAt most 4 character groups; if the moment holds more, keep the ones the message focuses on and cover the rest with a crowd tag.\n40-55 tags total.\n${NAI_RULES}`,
    },
};

const MODES = Object.keys(DEFAULT_TEMPLATES);

function defaultTemplate(mode) {
    return { sys: DEFAULT_TEMPLATES[mode].sys };
}

function cloneTemplates() {
    const out = {};
    for (const mode of MODES) out[mode] = defaultTemplate(mode);
    return out;
}

/* ================================================================== */
/* Settings                                                            */
/* ================================================================== */

const defaultSettings = {
    enabled: true,
    edit_before: true,
    swipe_regen: true,

    // Connection 1
    c1_source: 'profile',
    c1_profile: '',
    llm_url: '',
    llm_key: '',
    llm_model: '',
    llm_max_tokens: 350,
    llm_temp: 0.7,
    llm_timeout: 90,

    // Context budget
    ctx_messages: 6,
    ctx_chars: 350,
    ctx_total: 3000,
    strip_html: true,
    strip_system: true,

    // Connection 2
    c2_source: 'nai',
    nai_model: 'nai-diffusion-4-5-full',
    anlas_guard: true,
    img_url: '',
    img_key: '',
    img_model: '',
    img_format: 'b64_json',
    img_timeout: 180,

    // Image parameters
    size: '832x1216',
    sampler: 'k_euler_ancestral',
    scheduler: 'karras',
    steps: 28,
    scale: 5,
    seed: -1,
    upscale_ratio: 1,
    decrisper: false,
    variety_boost: true,
    sm: false,
    sm_dyn: false,
    extra_body: '',

    prefix: '',
    suffix: '',
    negative: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',

    // Templates
    templates: cloneTemplates(),
    extra_instruction: '',

    // Output
    msg_template: '{{prompt}}',
    hide_message: false,
    wand_button: true,
};

const BINDINGS = [
    ['pxi_enabled', 'enabled', 'bool'],
    ['pxi_edit_before', 'edit_before', 'bool'],
    ['pxi_swipe_regen', 'swipe_regen', 'bool'],
    ['pxi_c1_source', 'c1_source', 'text'],
    ['pxi_c1_profile', 'c1_profile', 'text'],
    ['pxi_llm_url', 'llm_url', 'text'],
    ['pxi_llm_key', 'llm_key', 'text'],
    ['pxi_llm_model', 'llm_model', 'text'],
    ['pxi_llm_max_tokens', 'llm_max_tokens', 'number'],
    ['pxi_llm_temp', 'llm_temp', 'number'],
    ['pxi_llm_timeout', 'llm_timeout', 'number'],
    ['pxi_ctx_messages', 'ctx_messages', 'number'],
    ['pxi_ctx_chars', 'ctx_chars', 'number'],
    ['pxi_ctx_total', 'ctx_total', 'number'],
    ['pxi_strip_html', 'strip_html', 'bool'],
    ['pxi_strip_system', 'strip_system', 'bool'],
    ['pxi_c2_source', 'c2_source', 'text'],
    ['pxi_nai_model', 'nai_model', 'text'],
    ['pxi_anlas_guard', 'anlas_guard', 'bool'],
    ['pxi_img_url', 'img_url', 'text'],
    ['pxi_img_key', 'img_key', 'text'],
    ['pxi_img_model', 'img_model', 'text'],
    ['pxi_img_format', 'img_format', 'text'],
    ['pxi_img_timeout', 'img_timeout', 'number'],
    ['pxi_size', 'size', 'text'],
    ['pxi_sampler', 'sampler', 'text'],
    ['pxi_scheduler', 'scheduler', 'text'],
    ['pxi_steps', 'steps', 'number'],
    ['pxi_scale', 'scale', 'number'],
    ['pxi_seed', 'seed', 'number'],
    ['pxi_upscale', 'upscale_ratio', 'number'],
    ['pxi_decrisper', 'decrisper', 'bool'],
    ['pxi_variety', 'variety_boost', 'bool'],
    ['pxi_sm', 'sm', 'bool'],
    ['pxi_sm_dyn', 'sm_dyn', 'bool'],
    ['pxi_extra_body', 'extra_body', 'text'],
    ['pxi_prefix', 'prefix', 'text'],
    ['pxi_suffix', 'suffix', 'text'],
    ['pxi_negative', 'negative', 'text'],
    ['pxi_msg_template', 'msg_template', 'text'],
    ['pxi_hide_message', 'hide_message', 'bool'],
    ['pxi_wand_button', 'wand_button', 'bool'],
    ['pxi_extra_instruction', 'extra_instruction', 'text'],
];

let isBusy = false;
let connectionService = null;

function settings() {
    return extension_settings[MODULE_NAME];
}

function initSettings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = {};
    }
    const s = extension_settings[MODULE_NAME];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (s[key] === undefined) s[key] = value;
    }
    if (!s.templates || typeof s.templates !== 'object') s.templates = cloneTemplates();
    // ย้ายของเก่า: yourself (v2.0) = พอร์เทรตเพอร์โซนาผู้ใช้ -> user
    if (s.templates.yourself && !s.templates.user) s.templates.user = s.templates.yourself;
    delete s.templates.yourself;
    delete s.user_use_default;
    for (const mode of MODES) {
        if (!s.templates[mode] || typeof s.templates[mode] !== 'object') s.templates[mode] = defaultTemplate(mode);
        if (typeof s.templates[mode].sys !== 'string') s.templates[mode].sys = DEFAULT_TEMPLATES[mode].sys;
        delete s.templates[mode].user;
    }
}

function setStatus(text, isError = false) {
    const el = document.getElementById('pxi_status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('pxi-error', !!isError);
}

function notify(message, type = 'info') {
    try {
        if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](message, 'Proxy Image Gen');
        else console.log(LOG, message);
    } catch {
        console.log(LOG, message);
    }
}

/* ================================================================== */
/* Errors                                                              */
/* ================================================================== */

class PxiError extends Error {
    constructor(message, { stage = '', status = 0, raw = '', hints = [] } = {}) {
        super(message);
        this.stage = stage;
        this.status = status;
        this.raw = raw;
        this.hints = hints;
    }
}

function hintsForStatus(stage, status, raw) {
    const text = String(raw || '').toLowerCase();
    const isNai = stage === '2' && settings().c2_source === 'nai';
    const out = [];

    if (status === 0) out.push('เชื่อมต่อไม่ได้เลย — เช็ค URL, ปัญหา CORS ของ proxy หรือเน็ตหลุด');
    if (status === 400 && isNai) out.push('ปกติแปลว่า SillyTavern ยังไม่มีคีย์ NovelAI — กดปุ่มบันทึกคีย์ในหมวด Connection 2 ก่อน');
    else if (status === 400) out.push('พารามิเตอร์ไม่ถูกใจ endpoint — เช็คชื่อโมเดล ขนาดภาพ หรือ Extra body JSON');
    if (status === 401 || status === 403) out.push('API key ผิด หมดอายุ หรือไม่มีสิทธิ์ใช้โมเดลนี้');
    if (status === 402) out.push('เครดิต/Anlas ไม่พอ หรือ subscription หมดอายุ');
    if (status === 404) out.push('ไม่พบ endpoint — เช็คว่า Base URL ลงท้าย /v1 ถูกต้องไหม');
    if (status === 429) out.push('ยิงถี่เกินหรือคิวเต็ม — เว้น 10-30 วินาทีแล้วลองใหม่ (NovelAI จำกัดงานพร้อมกันต่อบัญชี)');
    if (status >= 500) {
        if (isNai) out.push('เซิร์ฟเวอร์ ST ตีกลับ 500 = NovelAI ปฏิเสธคำขอ ดูเหตุผลจริงได้ที่คอนโซลของ SillyTavern (มักเป็นคีย์ผิด, Anlas หมด, ขนาด/steps เกินโควตา หรือคิวชนกัน)');
        else out.push('ฝั่ง proxy พัง หรือโมเดลกำลังบ่ม/โหลดอยู่ (cold start) — รอสักครู่แล้วลองใหม่');
    }
    if (text.includes('content') && text.includes('filter')) out.push('โดนฟิลเตอร์เนื้อหาของ Connection 1 — ลดความโจ่งแจ้งของฉาก หรือเปลี่ยนโปรไฟล์/โมเดล');
    if (text.includes('warm') || text.includes('loading') || text.includes('cold')) out.push('โมเดลกำลังบ่ม (warming up) — รอ 30-60 วินาทีแล้วยิงใหม่');
    if (text.includes('quota') || text.includes('insufficient')) out.push('โควตา/เครดิตหมด');
    if (!out.length) out.push('ลองกดปุ่มทดสอบการเชื่อมต่อในหน้าตั้งค่า เพื่อแยกว่าเป็นที่การเชื่อมต่อหรือที่ prompt');
    return out;
}

async function showErrorPopup(error) {
    const context = getContext();
    const stage = error?.stage === '1' ? '① Connection 1 (สร้าง prompt)'
        : error?.stage === '2' ? '② Connection 2 (เจนรูป)'
            : 'Proxy Image Gen';
    const hints = error?.hints?.length ? error.hints : hintsForStatus(error?.stage, error?.status || 0, error?.raw);

    const root = document.createElement('div');
    root.className = 'pxi-errbox';

    const title = document.createElement('h3');
    title.textContent = `${stage} ล้มเหลว`;
    const reason = document.createElement('div');
    reason.className = 'pxi-err-reason';
    reason.textContent = String(error?.message || error);
    root.append(title, reason);

    if (error?.status) {
        const code = document.createElement('div');
        code.className = 'pxi-hint';
        code.textContent = `HTTP ${error.status}`;
        root.append(code);
    }

    const list = document.createElement('ul');
    list.className = 'pxi-err-hints';
    for (const hint of hints) {
        const li = document.createElement('li');
        li.textContent = hint;
        list.append(li);
    }
    root.append(list);

    if (error?.raw) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'รายละเอียดดิบจากเซิร์ฟเวอร์';
        const pre = document.createElement('pre');
        pre.className = 'pxi-preview';
        pre.textContent = String(error.raw).slice(0, 1200);
        details.append(summary, pre);
        root.append(details);
    }

    try {
        await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, okButton: 'ปิด' });
    } catch {
        notify(String(error?.message || error), 'error');
    }
}

/* ================================================================== */
/* HTTP helpers                                                        */
/* ================================================================== */

function buildUrl(base, endpoint) {
    let url = String(base || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!url) throw new PxiError('ยังไม่ได้ตั้งค่า Base URL', { stage: '2' });
    if (url.toLowerCase().endsWith('/' + endpoint)) return url;
    url = url.replace(/\/(chat\/completions|completions|images\/generations|models)$/i, '');
    if (/\/v\d+(?:[a-z]*)$/i.test(url)) return `${url}/${endpoint}`;
    return `${url}/v1/${endpoint}`;
}

function authHeaders(key) {
    const headers = { 'Content-Type': 'application/json' };
    const k = String(key || '').trim();
    if (k) {
        headers['Authorization'] = `Bearer ${k}`;
        headers['x-api-key'] = k;
    }
    return headers;
}

async function requestRaw(url, options, timeoutSec, stage) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(5, Number(timeoutSec) || 60) * 1000);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const raw = await response.text();
        if (!response.ok) {
            let detail = raw;
            try { const parsed = JSON.parse(raw); detail = parsed?.error?.message || parsed?.message || raw; } catch { /* text */ }
            throw new PxiError(String(detail || response.statusText || 'คำขอล้มเหลว').slice(0, 300), { stage, status: response.status, raw });
        }
        return raw;
    } catch (error) {
        if (error instanceof PxiError) throw error;
        if (error?.name === 'AbortError') throw new PxiError('หมดเวลาเชื่อมต่อ (timeout)', { stage, hints: ['เพิ่มค่า Timeout ในหน้าตั้งค่า หรือลด steps / ขนาดภาพลง'] });
        throw new PxiError(String(error?.message || error), { stage, status: 0 });
    } finally {
        clearTimeout(timer);
    }
}

async function requestJson(url, options, timeoutSec, stage) {
    const raw = await requestRaw(url, options, timeoutSec, stage);
    try {
        return JSON.parse(raw);
    } catch {
        throw new PxiError('ตอบกลับไม่ใช่ JSON ที่อ่านได้', { stage, raw });
    }
}

/* ================================================================== */
/* Context building                                                    */
/* ================================================================== */

const INLINE_TAGS = /^(b|i|em|strong|u|s|q|p|br|blockquote)$/i;

function cleanText(text) {
    let out = String(text || '');
    if (settings().strip_html) {
        out = out.replace(/```[\s\S]*?```/g, ' ');
        out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
        for (let pass = 0; pass < 2; pass++) {
            out = out.replace(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
                (match, tag) => (INLINE_TAGS.test(tag) ? match : ' '));
        }
        out = out.replace(/<[^>]+>/g, ' ');
    }
    return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function visibleMessages() {
    const context = getContext();
    const s = settings();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    return chat.filter(m => m && m.mes && !(s.strip_system && m.is_system) && !m.extra?.pxi);
}

function buildChatBlock() {
    const s = settings();
    const limit = Math.max(0, Number(s.ctx_messages) || 0);
    if (!limit) return '';
    const context = getContext();
    const cap = Math.max(50, Number(s.ctx_chars) || 350);

    const picked = [];
    const pool = visibleMessages();
    for (let i = pool.length - 1; i >= 0 && picked.length < limit; i--) {
        const message = pool[i];
        const body = cleanText(message.mes);
        if (!body) continue;
        const name = message.name || (message.is_user ? context.name1 : context.name2) || '???';
        picked.push(`${name}: ${body.length > cap ? '…' + body.slice(-cap).trim() : body}`);
    }
    picked.reverse();

    let block = picked.join('\n');
    const total = Math.max(200, Number(s.ctx_total) || 3000);
    if (block.length > total) block = block.slice(-total).trim();
    return block;
}

function buildLastMessage() {
    const context = getContext();
    const s = settings();
    const pool = visibleMessages();
    const message = pool[pool.length - 1];
    if (!message) return '';
    const cap = Math.max(200, Number(s.ctx_chars) * 3 || 1200);
    const body = cleanText(message.mes);
    const name = message.name || (message.is_user ? context.name1 : context.name2) || '???';
    return `${name}: ${body.length > cap ? '…' + body.slice(-cap).trim() : body}`;
}

async function getCardFields() {
    const context = getContext();
    try {
        const fields = await context.getCharacterCardFields?.({ chid: context.characterId });
        if (fields) return fields;
    } catch { /* older signature */ }
    try {
        const fields = await context.getCharacterCardFields?.();
        if (fields) return fields;
    } catch { /* ignore */ }
    const character = context.characters?.[context.characterId];
    return {
        description: character?.description || '',
        personality: character?.personality || '',
        persona: context.powerUserSettings?.persona_description || '',
        scenario: character?.scenario || '',
    };
}

async function buildMacros(extra = '') {
    const fields = await getCardFields();
    const s = settings();
    const cap = Math.max(400, Number(s.ctx_total) || 3000);
    const trim = (text, limit) => {
        const clean = cleanText(text);
        return clean.length > limit ? clean.slice(0, limit).trim() + '…' : clean;
    };
    const context = getContext();
    return {
        char: context.name2 || 'the character',
        user: context.name1 || 'the user',
        chat: buildChatBlock(),
        lastMessage: buildLastMessage(),
        description: trim(fields.description, cap),
        personality: trim(fields.personality, Math.floor(cap / 2)),
        persona: trim(fields.persona, Math.floor(cap / 2)),
        scenario: trim(fields.scenario, Math.floor(cap / 2)),
        extra: String(extra || '').trim(),
    };
}

/** user message ที่ระบบประกอบให้เอง (โหมดที่ไม่ใช่ User) */
function buildAutoUserMessage(mode, macros) {
    const parts = [];
    const push = (title, body) => {
        const text = String(body || '').trim();
        if (text) parts.push(`--- ${title} ---\n${text}`);
    };

    switch (mode) {
        case 'portrait':
            parts.push(`Character: ${macros.char}`);
            push('Character sheet (fixed traits)', [macros.description, macros.personality].filter(Boolean).join('\n'));
            push('Latest message (current outfit, hair, mood, place)', macros.lastMessage);
            break;
        case 'selfie':
            parts.push(`Character: ${macros.char}`);
            push('Appearance', macros.description);
            push('Current moment (use it for expression and background)', macros.lastMessage);
            break;
        case 'user':
            parts.push(`This is the user's character: ${macros.user}`);
            push('Persona (fixed traits)', macros.persona);
            push('Latest message (current outfit, hair, mood, place)', macros.lastMessage);
            break;
        case 'last':
            parts.push(`Character: ${macros.char} • User persona: ${macros.user}`);
            push('Character appearance', macros.description);
            push(`Persona appearance of ${macros.user}`, macros.persona);
            push('Recent scene', macros.chat);
            push('Latest message (draw THIS)', macros.lastMessage);
            break;
        default:
            parts.push(`Character: ${macros.char} • User: ${macros.user}`);
            push('Recent scene', macros.chat);
            break;
    }
    return parts.join('\n\n');
}

async function buildStage1Messages(mode = 'free', extra = '') {
    const context = getContext();
    const s = settings();
    const macros = await buildMacros(extra);
    const template = s.templates[mode] || s.templates.free;

    const substitute = (text) => {
        try {
            return context.substituteParamsExtended
                ? context.substituteParamsExtended(String(text || ''), macros)
                : String(text || '').replace(/{{(\w+)}}/g, (m, key) => macros[key] ?? m);
        } catch {
            return String(text || '').replace(/{{(\w+)}}/g, (m, key) => macros[key] ?? m);
        }
    };

    let userMessage = buildAutoUserMessage(mode, macros);
    if (macros.extra) {
        userMessage += `\n\n--- Extra instruction (override the rules above if they conflict) ---\n${macros.extra}`;
    }
    userMessage += '\n\nWrite the image prompt now.';

    const messages = [];
    const system = substitute(template.sys).trim();
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: userMessage.trim() || macros.chat });
    return messages;
}

/* ================================================================== */
/* Stage 1                                                             */
/* ================================================================== */

function normalizePrompt(text) {
    let out = String(text || '').trim();
    out = out.replace(/^```[a-z]*\s*|\s*```$/gi, '');
    out = out.replace(/<(think|thinking|reasoning)[\s\S]*?<\/\1>/gi, '');
    out = out.replace(/^\s*(prompt|image prompt|output)\s*[:：]\s*/i, '');
    out = out.replace(/^["'“”]+|["'“”]+$/g, '');
    return out.replace(/\s*\n+\s*/g, ', ').replace(/\s*,\s*,+/g, ', ').trim();
}

const REFUSAL_PATTERN = /\b(i (can'?t|cannot|won'?t)|i'?m (sorry|unable)|as an ai|against my|cannot assist)\b/i;

function assertUsablePrompt(prompt, rawText, finishReason) {
    if (String(finishReason || '').toLowerCase().includes('content_filter')) {
        throw new PxiError('Connection 1 ถูกฟิลเตอร์เนื้อหาบล็อก (finish_reason: content_filter)', {
            stage: '1',
            raw: rawText,
            hints: [
                'โมเดลฝั่งสร้าง prompt ปฏิเสธเนื้อหาของฉากนี้',
                'สลับไปโปรไฟล์/โมเดลที่ผ่อนกว่า หรือแก้ template ให้เป็นงานแปลงข้อความเป็นแท็กภาพล้วน ๆ',
                'หรือข้าม Connection 1 ไปเลยด้วย /pxi raw=true <prompt ของคุณ>',
            ],
        });
    }
    if (!prompt) {
        throw new PxiError('Connection 1 ตอบกลับว่างเปล่า', {
            stage: '1',
            raw: rawText,
            hints: ['มักเกิดจากฟิลเตอร์เนื้อหา หรือ Max tokens ต่ำเกินไป', 'ลองเพิ่ม Max tokens หรือเปลี่ยนโปรไฟล์การเชื่อมต่อ'],
        });
    }
    if (REFUSAL_PATTERN.test(prompt) && prompt.split(',').length < 6) {
        throw new PxiError('Connection 1 ตอบกลับเป็นคำปฏิเสธ ไม่ใช่ prompt', {
            stage: '1',
            raw: prompt,
            hints: ['โมเดลปฏิเสธที่จะบรรยายฉากนี้', 'เปลี่ยนโปรไฟล์/โมเดล หรือปรับ system template ให้เน้นว่าเป็นการแปลงข้อความเป็นแท็กภาพ'],
        });
    }
}

async function loadConnectionService() {
    if (connectionService !== null) return connectionService;
    try {
        const module = await import('../../shared.js');
        connectionService = module.ConnectionManagerRequestService || false;
    } catch (error) {
        console.warn(LOG, 'ไม่พบ ConnectionManagerRequestService', error);
        connectionService = false;
    }
    return connectionService;
}

async function stage1ViaProfile(messages) {
    const context = getContext();
    const s = settings();
    const service = await loadConnectionService();
    const profileId = s.c1_profile || context.extensionSettings?.connectionManager?.selectedProfile || '';

    if (service && profileId) {
        try {
            const result = await service.sendRequest(profileId, messages, Math.max(16, Number(s.llm_max_tokens) || 350), {
                stream: false,
                extractData: true,
                includePreset: false,
                includeInstruct: false,
            });
            const content = typeof result === 'string' ? result : result?.content;
            if (content) return { text: content, raw: String(content).slice(0, 800), finish: result?.finishReason };
        } catch (error) {
            throw new PxiError(String(error?.message || error), {
                stage: '1',
                hints: [
                    'ถ้าเพิ่งสร้างหรือเพิ่งแก้โปรไฟล์ ให้กลับไปกดปุ่ม Save (💾) ใน Connection Manager ก่อน — โปรไฟล์ที่ยังไม่เซฟจะไม่มีข้อมูล API ให้ extension เรียกใช้ และค่าจะรีเซ็ตทุกครั้งที่สลับโปรไฟล์',
                    'เช็คใน Connection Manager ว่าโปรไฟล์นี้ยังต่อ API ได้อยู่',
                    'รองรับเฉพาะโปรไฟล์แบบ Chat Completion และ Text Completion',
                ],
            });
        }
    }

    // fallback: ใช้ API ปัจจุบันของ SillyTavern
    if (typeof context.generateQuietPrompt !== 'function') {
        throw new PxiError('ไม่พบโปรไฟล์การเชื่อมต่อที่ใช้ได้', {
            stage: '1',
            hints: [
                'เลือกโปรไฟล์ในหมวด Connection 1 หรือสร้างโปรไฟล์ใน Connection Manager ก่อน',
                'สร้างโปรไฟล์แล้วอย่าลืมกดปุ่ม Save (💾) ใน Connection Manager — โปรไฟล์ที่ยังไม่เซฟจะไม่ถูก detect และจะรีเซ็ตเมื่อสลับโปรไฟล์',
                'หรือสลับ "แหล่งที่ใช้สร้าง prompt" เป็น Custom OpenAI-compatible แทน',
            ],
        });
    }
    const quietPrompt = messages.map(m => m.content).join('\n\n');
    const text = await context.generateQuietPrompt({
        quietPrompt,
        quietToLoud: false,
        skipWIAN: true,
        responseLength: Math.max(16, Number(s.llm_max_tokens) || 350),
        quietName: 'PromptMaker',
    });
    return { text, raw: String(text || '').slice(0, 800), finish: '' };
}

async function stage1ViaCustom(messages) {
    const s = settings();
    const url = buildUrl(s.llm_url, 'chat/completions');
    const data = await requestJson(url, {
        method: 'POST',
        headers: authHeaders(s.llm_key),
        body: JSON.stringify({
            model: s.llm_model || undefined,
            messages,
            max_tokens: Math.max(16, Number(s.llm_max_tokens) || 350),
            temperature: Number.isFinite(Number(s.llm_temp)) ? Number(s.llm_temp) : 0.7,
            stream: false,
        }),
    }, s.llm_timeout, '1');

    const choice = data?.choices?.[0];
    let text = choice?.message?.content ?? choice?.text ?? data?.content ?? '';
    if (Array.isArray(text)) text = text.map(p => p?.text || '').join(' ');
    return { text, raw: JSON.stringify(data).slice(0, 1200), finish: choice?.finish_reason || choice?.native_finish_reason };
}

async function stage1GeneratePrompt(mode, extra) {
    const s = settings();
    const messages = await buildStage1Messages(mode, extra);
    const result = s.c1_source === 'custom' ? await stage1ViaCustom(messages) : await stage1ViaProfile(messages);
    const prompt = normalizePrompt(result.text);
    assertUsablePrompt(prompt, result.raw, result.finish);
    return prompt;
}

/* ================================================================== */
/* Bridge — review & edit                                              */
/* ================================================================== */

async function editPrompt(prompt, title = 'แก้ไข prompt ก่อนส่งไป Connection 2') {
    const context = getContext();
    const result = await context.callGenericPopup(title, context.POPUP_TYPE.INPUT, prompt, {
        rows: 10,
        okButton: 'Generate',
        cancelButton: 'ยกเลิก',
        wide: true,
    });
    if (result === false || result === null || result === undefined) return null;
    const edited = String(result).trim();
    return edited || null;
}

/* ================================================================== */
/* Stage 2                                                             */
/* ================================================================== */

function composePrompt(prompt) {
    const s = settings();
    return [s.prefix, prompt, s.suffix].map(p => String(p || '').trim()).filter(Boolean).join(', ');
}

function parseSize() {
    const match = String(settings().size || '').match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
    if (!match) return { width: 832, height: 1216 };
    return { width: Number(match[1]), height: Number(match[2]) };
}

function parseExtraBody() {
    const raw = String(settings().extra_body || '').trim();
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch {
        throw new PxiError('Extra body ไม่ใช่ JSON ที่ถูกต้อง', { stage: '2', hints: ['ตรวจวงเล็บปีกกาและเครื่องหมายคำพูดในช่อง Advanced extra body'] });
    }
}

function extractImage(data) {
    const item = Array.isArray(data?.data) ? data.data[0] : null;
    const b64 = item?.b64_json
        || item?.image
        || (typeof item === 'string' ? item : null)
        || data?.b64_json
        || (Array.isArray(data?.images) ? data.images[0] : null)
        || (Array.isArray(data?.artifacts) ? data.artifacts[0]?.base64 : null)
        || (typeof data?.image === 'string' ? data.image : null);
    const url = item?.url || data?.url || null;
    if (b64 && typeof b64 === 'string') {
        const clean = b64.startsWith('data:') && b64.includes(',') ? b64.split(',')[1] : b64;
        return { kind: 'base64', value: clean };
    }
    if (url && typeof url === 'string') return { kind: 'url', value: url };
    throw new PxiError('อ่านรูปจากผลลัพธ์ของ Connection 2 ไม่ได้', {
        stage: '2',
        raw: JSON.stringify(data).slice(0, 800),
        hints: ['proxy อาจตอบกลับรูปแบบที่ไม่รู้จัก — ลองสลับ Response format เป็น url หรือ b64_json'],
    });
}

/** ลดขนาด/steps ให้อยู่ในโควตาฟรีของ Opus tier */
function applyAnlasGuard(width, height, steps) {
    if (!settings().anlas_guard) return { width, height, steps };
    const MAX_STEPS = 28;
    const MAX_PIXELS = 1024 * 1024;

    if (width * height > MAX_PIXELS) {
        const ratio = Math.sqrt(MAX_PIXELS / (width * height));
        let newWidth = Math.round(width * ratio);
        let newHeight = Math.round(height * ratio);
        if (newWidth % 64 !== 0) newWidth -= newWidth % 64;
        if (newHeight % 64 !== 0) newHeight -= newHeight % 64;
        while (newWidth * newHeight > MAX_PIXELS && newWidth > 64 && newHeight > 64) {
            if (newWidth > newHeight) newWidth -= 64; else newHeight -= 64;
        }
        console.log(LOG, `Anlas guard: ${width}x${height} -> ${newWidth}x${newHeight}`);
        width = newWidth;
        height = newHeight;
    }
    if (steps > MAX_STEPS) {
        console.log(LOG, `Anlas guard: steps ${steps} -> ${MAX_STEPS}`);
        steps = MAX_STEPS;
    }
    return { width, height, steps };
}

async function stage2NovelAI(prompt) {
    const context = getContext();
    const s = settings();
    const size = parseSize();
    const { width, height, steps } = applyAnlasGuard(
        size.width,
        size.height,
        Math.min(50, Math.max(1, Number(s.steps) || 28)),
    );
    const body = {
        prompt: composePrompt(prompt),
        model: s.nai_model,
        sampler: s.sampler,
        scheduler: s.scheduler,
        steps,
        scale: Number(s.scale) || 5,
        width,
        height,
        negative_prompt: String(s.negative || '').trim(),
        upscale_ratio: Number(s.upscale_ratio) || 1,
        decrisper: !!s.decrisper,
        variety_boost: !!s.variety_boost,
        sm: !!s.sm,
        sm_dyn: !!s.sm_dyn,
        seed: Number(s.seed) >= 0 ? Number(s.seed) : undefined,
    };
    const raw = await requestRaw('/api/novelai/generate-image', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify(body),
    }, s.img_timeout, '2');
    const clean = String(raw || '').trim().replace(/^"|"$/g, '');
    if (!clean) throw new PxiError('NovelAI ส่งรูปกลับมาว่างเปล่า', { stage: '2' });
    return { kind: 'base64', value: clean };
}

async function stage2Custom(prompt) {
    const s = settings();
    const url = buildUrl(s.img_url, 'images/generations');
    const { width, height } = parseSize();
    const body = {
        prompt: composePrompt(prompt),
        n: 1,
        size: `${width}x${height}`,
        width,
        height,
        sampler: s.sampler,
        scheduler: s.scheduler,
        steps: Number(s.steps) || 28,
        scale: Number(s.scale) || 5,
        cfg_scale: Number(s.scale) || 5,
    };
    if (s.img_model) body.model = s.img_model;
    if (s.img_format) body.response_format = s.img_format;
    if (String(s.negative || '').trim()) body.negative_prompt = String(s.negative).trim();
    if (Number(s.seed) >= 0) body.seed = Number(s.seed);
    if (Number(s.upscale_ratio) > 1) body.upscale_ratio = Number(s.upscale_ratio);
    Object.assign(body, parseExtraBody());

    const data = await requestJson(url, {
        method: 'POST',
        headers: authHeaders(s.img_key),
        body: JSON.stringify(body),
    }, s.img_timeout, '2');
    return extractImage(data);
}

async function stage2GenerateImage(prompt) {
    return settings().c2_source === 'nai' ? await stage2NovelAI(prompt) : await stage2Custom(prompt);
}

async function uploadBase64(base64) {
    const context = getContext();
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            image: base64,
            format: 'png',
            ch_name: context.name2 || 'user',
            filename: `pxi_${Date.now()}`,
        }),
    });
    if (!response.ok) throw new PxiError('บันทึกรูปลงเซิร์ฟเวอร์ไม่สำเร็จ', { stage: '2', status: response.status });
    const data = await response.json();
    return data.path;
}

/* ================================================================== */
/* Output                                                              */
/* ================================================================== */

function supportsMediaArray() {
    return typeof getContext().getMediaIndex === 'function';
}

async function postImageMessage(imagePath, prompt, mode) {
    const context = getContext();
    const s = settings();
    const name = context.name2 || 'System';
    let text = s.msg_template || '{{prompt}}';
    try {
        text = context.substituteParamsExtended
            ? context.substituteParamsExtended(text, { prompt, char: name })
            : text.replace(/{{prompt}}/gi, prompt);
    } catch {
        text = text.replace(/{{prompt}}/gi, prompt);
    }

    const extra = { inline_image: false, pxi: { prompt, mode } };
    if (supportsMediaArray()) {
        extra.media = [{ url: imagePath, type: 'image', title: prompt, source: 'generated', generation_type: 'proxy_image_gen' }];
        extra.media_display = 'gallery';
        extra.media_index = 0;
    } else {
        extra.image = imagePath;
        extra.title = prompt;
    }

    const message = {
        name,
        is_user: false,
        is_system: !!s.hide_message,
        send_date: context.humanizedDateTime ? context.humanizedDateTime() : new Date().toLocaleString(),
        mes: text,
        extra,
    };

    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await context.eventSource.emit(context.eventTypes.MESSAGE_RECEIVED, messageId, 'extension');
    context.addOneMessage(message);
    await context.eventSource.emit(context.eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await context.saveChat();
    setTimeout(() => {
        try { (context.scrollOnMediaLoad || context.scrollChatToBottom)?.(); } catch { /* ignore */ }
    }, 200);
}

/* ================================================================== */
/* Pipeline                                                            */
/* ================================================================== */

function mergeExtra(extra) {
    return [String(settings().extra_instruction || '').trim(), String(extra || '').trim()]
        .filter(Boolean).join('\n');
}

async function runPipeline({ mode = 'free', rawPrompt = '', extra = '', quiet = false } = {}) {
    const s = settings();
    if (!s.enabled) { notify('Extension ถูกปิดอยู่', 'warning'); return null; }
    if (isBusy) { notify('กำลังทำงานอยู่ กรุณารอสักครู่', 'warning'); return null; }
    isBusy = true;
    try {
        let prompt = String(rawPrompt || '').trim();
        const fromStage1 = !prompt;

        if (fromStage1) {
            setStatus(`① กำลังสร้าง prompt (${mode})...`);
            if (!quiet) notify('กำลังสร้าง prompt (Connection 1)...');
            prompt = await stage1GeneratePrompt(mode, mergeExtra(extra));
        }

        if (fromStage1 && s.edit_before) {
            setStatus('⇄ รอตรวจ/แก้ prompt...');
            const edited = await editPrompt(prompt);
            if (!edited) { setStatus('ยกเลิกแล้ว'); return null; }
            prompt = edited;
        }

        setStatus('② กำลังเจนรูป...');
        if (!quiet) notify('กำลังเจนรูป (Connection 2)...');
        const image = await stage2GenerateImage(prompt);
        const path = image.kind === 'base64' ? await uploadBase64(image.value) : image.value;
        await postImageMessage(path, prompt, mode);
        setStatus('เสร็จสิ้น');
        return path;
    } catch (error) {
        console.error(LOG, error);
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
        return null;
    } finally {
        isBusy = false;
    }
}

/* ================================================================== */
/* Swipe → review & regenerate                                         */
/* ================================================================== */

async function onImageSwiped({ message, direction }) {
    const s = settings();
    if (!s.enabled || !s.swipe_regen) return;
    if (direction !== 'right') return;
    if (!message?.extra?.pxi) return;
    if (isBusy) return;

    const media = message.extra.media;
    if (!Array.isArray(media) || media.length === 0) return;
    const index = Number(message.extra.media_index) || 0;
    if (index !== media.length - 1) return; // ปัดถึงใบสุดท้ายแล้วเท่านั้น

    const previous = media[index]?.title || message.extra.pxi.prompt || '';
    const edited = await editPrompt(previous, 'ตรวจและแก้ prompt แล้วเจนใบใหม่ (ปัดซ้ายเพื่อย้อนดูใบเก่า)');
    if (!edited) return;

    isBusy = true;
    try {
        setStatus('② กำลังเจนใบใหม่...');
        notify('กำลังเจนรูปใบใหม่...');
        const image = await stage2GenerateImage(edited);
        const path = image.kind === 'base64' ? await uploadBase64(image.value) : image.value;
        media.push({ url: path, type: 'image', title: edited, source: 'generated', generation_type: 'proxy_image_gen' });
        message.extra.pxi.prompt = edited;
        setStatus('เสร็จสิ้น');
    } catch (error) {
        console.error(LOG, error);
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
    } finally {
        isBusy = false;
    }
}

/* ================================================================== */
/* Tools                                                               */
/* ================================================================== */

async function saveNovelKey() {
    const context = getContext();
    const input = document.getElementById('pxi_nai_key');
    const value = String(input?.value || '').trim();
    if (!value) { notify('ยังไม่ได้กรอกคีย์', 'warning'); return; }
    try {
        const response = await fetch('/api/secrets/write', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({ key: NAI_SECRET_KEY, value, label: 'Proxy Image Gen' }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (input) input.value = '';
        notify('บันทึกคีย์ NovelAI แล้ว', 'success');
        setStatus('บันทึกคีย์ NovelAI ลง SillyTavern แล้ว (ใช้ช่องเดียวกับ NovelAI API ของ ST)');
    } catch (error) {
        setStatus('บันทึกคีย์ไม่สำเร็จ: ' + String(error?.message || error), true);
        notify('บันทึกคีย์ไม่สำเร็จ', 'error');
    }
}

/** ชุดค่าที่ NovelAI แนะนำสำหรับโมเดลที่เลือกอยู่ */
const NAI_QUALITY_SUFFIX = {
    'nai-diffusion-4-5-full': 'location, very aesthetic, masterpiece, no text',
    'nai-diffusion-4-5-curated': 'location, masterpiece, no text, -0.8::feet::, rating:general',
    'nai-diffusion-4-full': 'no text, best quality, very aesthetic, absurdres',
    'nai-diffusion-4-curated-preview': 'rating:general, amazing quality, very aesthetic, absurdres',
    'nai-diffusion-3': 'best quality, amazing quality, very aesthetic, absurdres',
    'nai-diffusion-furry-3': '{best quality}, {amazing quality}',
};

const NAI_NEGATIVE = {
    curated: 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
    full: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
    v3: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
};

function applyRecommended() {
    const context = getContext();
    const s = settings();
    const model = s.nai_model || 'nai-diffusion-4-5-full';
    const isV3 = model.includes('-3');
    s.prefix = '';
    s.suffix = NAI_QUALITY_SUFFIX[model] || NAI_QUALITY_SUFFIX['nai-diffusion-4-5-full'];
    s.negative = isV3 ? NAI_NEGATIVE.v3 : (model.includes('curated') ? NAI_NEGATIVE.curated : NAI_NEGATIVE.full);
    s.sampler = 'k_euler_ancestral';
    s.scheduler = 'karras';
    s.steps = 28;
    s.scale = 5;
    s.variety_boost = true;
    s.decrisper = false;
    s.sm = isV3 ? s.sm : false;
    s.sm_dyn = isV3 ? s.sm_dyn : false;
    loadSettingsToUi();
    context.saveSettingsDebounced();
    notify('ใส่ค่าที่ NovelAI แนะนำสำหรับ ' + model + ' แล้ว', 'success');
    setStatus('ใช้ค่าแนะนำของ ' + model + ' (quality tag ต่อท้าย + Human Focus UC)');
}

async function viewAnlas() {
    const context = getContext();
    try {
        setStatus('กำลังเช็ค Anlas...');
        const response = await fetch('/api/novelai/status', { method: 'POST', headers: context.getRequestHeaders() });
        if (!response.ok) {
            throw new PxiError('อ่านข้อมูลบัญชี NovelAI ไม่ได้', {
                stage: '2',
                status: response.status,
                hints: ['ยังไม่ได้บันทึกคีย์ NovelAI หรือคีย์ผิด', 'บัญชีต้องมี subscription ที่ใช้งานอยู่'],
            });
        }
        const data = await response.json();
        const anlas = data?.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0;
        const bonus = data?.trainingStepsLeft?.purchasedTrainingSteps ?? 0;
        const unlimited = data?.perks?.unlimitedImageGeneration ?? false;
        const tier = data?.tier ?? '?';
        const message = `Anlas: ${anlas}${bonus ? ` (+${bonus} ซื้อเพิ่ม)` : ''} • Tier ${tier} • เจนรูปฟรี: ${unlimited ? 'ได้' : 'ไม่ได้'}`;
        notify(message, 'success');
        setStatus(message);
    } catch (error) {
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
    }
}

async function fetchModels(kind) {
    const s = settings();
    const isLlm = kind === 'llm';
    try {
        const url = buildUrl(isLlm ? s.llm_url : s.img_url, 'models');
        const data = await requestJson(url, { method: 'GET', headers: authHeaders(isLlm ? s.llm_key : s.img_key) }, 30, isLlm ? '1' : '2');
        const list = (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
            .map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean).sort();
        const datalist = document.getElementById(isLlm ? 'pxi_llm_model_list' : 'pxi_img_model_list');
        if (datalist) datalist.innerHTML = list.map(id => `<option value="${String(id).replace(/"/g, '&quot;')}"></option>`).join('');
        notify(`พบ ${list.length} โมเดล`, 'success');
        setStatus(`ดึงรายชื่อโมเดลสำเร็จ (${list.length})`);
    } catch (error) {
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
    }
}

async function testConnection(kind) {
    const s = settings();
    try {
        if (kind === 'llm') {
            setStatus('กำลังทดสอบ Connection 1...');
            const messages = [{ role: 'user', content: 'Reply with the single word: ok' }];
            const result = s.c1_source === 'custom' ? await stage1ViaCustom(messages) : await stage1ViaProfile(messages);
            if (!String(result.text || '').trim()) throw new PxiError('ไม่มีข้อความตอบกลับ', { stage: '1', raw: result.raw });
            notify('Connection 1 ใช้งานได้', 'success');
            setStatus('Connection 1 ✓ — ' + String(result.text).trim().slice(0, 60));
        } else if (s.c2_source === 'nai') {
            setStatus('กำลังทดสอบ NovelAI (เจนรูปทดสอบ 1 ใบ)...');
            const image = await stage2NovelAI('1girl, simple background');
            notify(`NovelAI ใช้งานได้ (${Math.round(image.value.length / 1024)} KB)`, 'success');
            setStatus('Connection 2 ✓ NovelAI ส่งรูปกลับมาแล้ว');
        } else {
            setStatus('กำลังทดสอบ Connection 2...');
            await requestJson(buildUrl(s.img_url, 'models'), { method: 'GET', headers: authHeaders(s.img_key) }, 30, '2');
            notify('Connection 2 ตอบกลับปกติ', 'success');
            setStatus('Connection 2 ✓ (endpoint /models ตอบกลับได้)');
        }
    } catch (error) {
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
    }
}

async function previewPrompt() {
    const context = getContext();
    const mode = document.getElementById('pxi_tpl_mode')?.value || 'free';
    const messages = await buildStage1Messages(mode, mergeExtra(''));
    const text = messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n');
    let tokens = '~' + Math.ceil(text.length / 4);
    try { if (context.getTokenCountAsync) tokens = String(await context.getTokenCountAsync(text)); } catch { /* fallback */ }

    const root = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = `Stage 1 payload — ${DEFAULT_TEMPLATES[mode]?.label || mode}`;
    const info = document.createElement('div');
    info.className = 'pxi-hint';
    info.textContent = `${text.length} ตัวอักษร • ประมาณ ${tokens} tokens`;
    const pre = document.createElement('pre');
    pre.className = 'pxi-preview';
    pre.textContent = text;
    root.append(title, info, pre);
    await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: 'ปิด' });
}

/* ================================================================== */
/* Docs (NovelAI cheatsheet)                                           */
/* ================================================================== */

function downloadText(filename, text) {
    try {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
        console.error(LOG, error);
        notify('ดาวน์โหลดไม่สำเร็จ', 'error');
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        notify('คัดลอกแล้ว', 'success');
    } catch {
        notify('เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ ให้เลือกข้อความแล้วคัดลอกเอง', 'warning');
    }
}

async function showDoc(doc) {
    const context = getContext();
    const root = document.createElement('div');
    root.className = 'pxi-docbox';

    const title = document.createElement('h3');
    title.textContent = doc.title;

    const buttons = document.createElement('div');
    buttons.className = 'pxi-row';
    const copyButton = document.createElement('div');
    copyButton.className = 'menu_button menu_button_icon';
    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i><span></span>';
    copyButton.querySelector('span').textContent = 'คัดลอก';
    copyButton.addEventListener('click', () => copyText(doc.body));
    const saveButton = document.createElement('div');
    saveButton.className = 'menu_button menu_button_icon';
    saveButton.innerHTML = '<i class="fa-solid fa-download"></i><span></span>';
    saveButton.querySelector('span').textContent = 'บันทึก .md';
    saveButton.addEventListener('click', () => downloadText(`nai-${doc.id}.md`, doc.body));
    buttons.append(copyButton, saveButton);

    const pre = document.createElement('pre');
    pre.className = 'pxi-preview pxi-doc';
    pre.textContent = doc.body;

    root.append(title, buttons, pre);
    await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: 'ปิด' });
}

function renderDocsButtons() {
    const container = document.getElementById('pxi_docs_list');
    if (!container) return;
    container.innerHTML = '';
    for (const doc of NAI_DOCS) {
        const button = document.createElement('div');
        button.className = 'menu_button menu_button_icon pxi-doc-button';
        button.innerHTML = `<i class="fa-solid ${doc.icon}"></i><span></span>`;
        button.querySelector('span').textContent = doc.title;
        button.addEventListener('click', () => showDoc(doc));
        container.append(button);
    }
}

/* ================================================================== */
/* UI                                                                  */
/* ================================================================== */

function toggleSourceBlocks() {
    const s = settings();
    document.querySelectorAll('.pxi-c1-profile').forEach(el => el.classList.toggle('pxi-hidden', s.c1_source !== 'profile'));
    document.querySelectorAll('.pxi-c1-custom').forEach(el => el.classList.toggle('pxi-hidden', s.c1_source !== 'custom'));
    document.querySelectorAll('.pxi-c2-nai').forEach(el => el.classList.toggle('pxi-hidden', s.c2_source !== 'nai'));
    document.querySelectorAll('.pxi-c2-custom').forEach(el => el.classList.toggle('pxi-hidden', s.c2_source !== 'custom'));
}

async function populateProfiles() {
    const select = document.getElementById('pxi_c1_profile');
    if (!select) return;
    const context = getContext();
    let profiles = [];
    try {
        const service = await loadConnectionService();
        if (service) profiles = service.getSupportedProfiles() || [];
    } catch (error) {
        console.warn(LOG, 'อ่านรายชื่อโปรไฟล์ไม่ได้', error);
    }
    const selected = settings().c1_profile;
    const current = context.extensionSettings?.connectionManager?.selectedProfile;
    const currentName = profiles.find(p => p.id === current)?.name;

    select.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = currentName ? `⟨ตามโปรไฟล์ที่ใช้อยู่⟩ — ${currentName}` : '⟨ตามโปรไฟล์ที่ใช้อยู่⟩';
    select.append(auto);
    for (const profile of profiles) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `${profile.name}${profile.model ? ` (${profile.model})` : ''}`;
        select.append(option);
    }
    const warning = document.getElementById('pxi_profile_warning');
    if (warning) warning.classList.toggle('pxi-hidden', profiles.length > 0);
    select.value = profiles.some(p => p.id === selected) ? selected : '';
    settings().c1_profile = select.value;
    context.saveSettingsDebounced();
}

function loadTemplateEditor() {
    const mode = document.getElementById('pxi_tpl_mode')?.value || 'free';
    const sys = document.getElementById('pxi_tpl_sys');
    if (sys) sys.value = (settings().templates[mode] || settings().templates.free).sys;
}

function saveTemplateEditor() {
    const context = getContext();
    const mode = document.getElementById('pxi_tpl_mode')?.value || 'free';
    const sys = document.getElementById('pxi_tpl_sys');
    if (sys && settings().templates[mode]) settings().templates[mode].sys = sys.value;
    context.saveSettingsDebounced();
}

function resetTemplate(all = false) {
    const context = getContext();
    const modes = all ? MODES : [document.getElementById('pxi_tpl_mode')?.value || 'free'];
    for (const mode of modes) settings().templates[mode] = defaultTemplate(mode);
    loadTemplateEditor();
    context.saveSettingsDebounced();
    notify(all ? 'รีเซ็ตทุก template กลับค่าเริ่มต้นแล้ว' : 'รีเซ็ต template นี้แล้ว', 'success');
}

function updateContextHints() {
    const el = document.getElementById('pxi_ctx_hint');
    if (!el) return;
    const s = settings();
    const messages = Math.max(0, Number(s.ctx_messages) || 0);
    const perMessage = Math.max(50, Number(s.ctx_chars) || 350);
    const total = Math.max(200, Number(s.ctx_total) || 3000);
    const lastCap = perMessage * 3;
    const budget = Math.min(messages * perMessage, total);
    const tokens = Math.ceil((budget + lastCap + 2600) / 3.6);

    const warnings = [];
    if (perMessage < 300) warnings.push(`ตัด/ข้อความ ${perMessage} น้อยไป — ข้อความล่าสุดเหลือแค่ ${lastCap} ตัวอักษร ฉากที่มีหลายตัวละครจะถูกตัดหัวทิ้ง แนะนำ 600`);
    if (perMessage > 1200) warnings.push(`ตัด/ข้อความ ${perMessage} สูงมาก — ข้อความล่าสุดกินไป ${lastCap} ตัวอักษร เสี่ยง Connection 1 ตอบช้าหรือไม่ยอมตอบ แนะนำไม่เกิน 1200`);
    if (total < 1000) warnings.push('เพดานรวมต่ำกว่า 1000 — ฉากก่อนหน้าจะหายเกือบหมด แนะนำอย่างน้อย 1000');
    if (total > 10000) warnings.push('เพดานรวมเกิน 10000 — เกินความจำเป็นและเสี่ยงชน context limit ของโปรไฟล์ แนะนำไม่เกิน 10000');
    if (messages === 0) warnings.push('ข้อความล่าสุด = 0 จะไม่ส่งบทสนทนาไปเลย โหมด Last Message จะเหลือแค่ข้อความเดียว');
    if (messages > 12) warnings.push(`ข้อความล่าสุด ${messages} เยอะเกินจำเป็น — โหมดเจนรูปใช้แค่ฉากปัจจุบัน แนะนำ 3-8`);
    if (Number(s.llm_max_tokens) < 200) warnings.push('Max tokens ของ Connection 1 ต่ำกว่า 200 — prompt ที่มีหลายตัวละครจะถูกตัดกลางคัน แนะนำ 350-600');

    el.textContent = '';
    const summary = document.createElement('div');
    summary.textContent = `งบจริง ≈ ${budget} ตัวอักษรจากบทสนทนา + ข้อความล่าสุดสูงสุด ${lastCap} ตัวอักษร รวมกับ template แล้วราว ${tokens} tokens`;
    el.append(summary);
    for (const warning of warnings) {
        const line = document.createElement('div');
        line.className = 'pxi-warn-line';
        line.textContent = '• ' + warning;
        el.append(line);
    }
    el.classList.toggle('pxi-warn', warnings.length > 0);
}

function loadSettingsToUi() {
    const s = settings();
    for (const [id, key, type] of BINDINGS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (type === 'bool') el.checked = !!s[key];
        else el.value = s[key] ?? '';
    }
    loadTemplateEditor();
    toggleSourceBlocks();
    updateContextHints();
}

function bindEvents() {
    const context = getContext();
    for (const [id, key, type] of BINDINGS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const eventName = (type === 'bool' || el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            const s = settings();
            if (type === 'bool') s[key] = !!el.checked;
            else if (type === 'number') s[key] = Number(el.value);
            else s[key] = el.value;
            if (key === 'wand_button') updateWandButton();
            if (key === 'c1_source' || key === 'c2_source') toggleSourceBlocks();
            if (key.startsWith('ctx_') || key === 'llm_max_tokens') updateContextHints();
            context.saveSettingsDebounced();
        });
    }

    document.getElementById('pxi_tpl_mode')?.addEventListener('change', loadTemplateEditor);
    document.getElementById('pxi_tpl_sys')?.addEventListener('input', saveTemplateEditor);
    document.getElementById('pxi_tpl_reset')?.addEventListener('click', () => resetTemplate(false));
    document.getElementById('pxi_tpl_reset_all')?.addEventListener('click', () => resetTemplate(true));

    document.getElementById('pxi_llm_fetch')?.addEventListener('click', () => fetchModels('llm'));
    document.getElementById('pxi_img_fetch')?.addEventListener('click', () => fetchModels('img'));
    document.getElementById('pxi_llm_test')?.addEventListener('click', () => testConnection('llm'));
    document.getElementById('pxi_img_test')?.addEventListener('click', () => testConnection('img'));
    document.getElementById('pxi_nai_save')?.addEventListener('click', () => saveNovelKey());
    document.getElementById('pxi_anlas_view')?.addEventListener('click', () => viewAnlas());
    document.getElementById('pxi_profile_refresh')?.addEventListener('click', () => populateProfiles());
    document.getElementById('pxi_preview')?.addEventListener('click', () => previewPrompt());
    document.getElementById('pxi_docs_save_all')?.addEventListener('click', () => downloadText('novelai-cheatsheet.md', docsToMarkdown()));
    document.getElementById('pxi_nai_recommended')?.addEventListener('click', () => applyRecommended());

    for (const mode of MODES) {
        document.getElementById(`pxi_run_${mode}`)?.addEventListener('click', () => runPipeline({ mode }));
    }
}

/* ---- wand menu + floating submenu ---- */

function closeWandMenu() {
    document.getElementById('pxi_dropdown')?.classList.add('pxi-hidden');
}

function buildDropdown() {
    let dropdown = document.getElementById('pxi_dropdown');
    if (dropdown) return dropdown;
    dropdown = document.createElement('div');
    dropdown.id = 'pxi_dropdown';
    dropdown.className = 'list-group pxi-dropdown pxi-hidden';
    const items = [
        ['portrait', 'fa-user', 'Portrait'],
        ['selfie', 'fa-face-smile', 'Selfie'],
        ['user', 'fa-user-astronaut', 'User'],
        ['last', 'fa-comment-dots', 'Last Message'],
        ['free', 'fa-pen-nib', 'Free / Scene'],
    ];
    for (const [mode, icon, label] of items) {
        const item = document.createElement('div');
        item.className = 'list-group-item pxi-dropdown-item interactable';
        item.tabIndex = 0;
        item.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
        item.querySelector('span').textContent = label;
        const activate = (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeWandMenu();
            try { jQuery('#extensionsMenu').fadeOut(200); } catch { /* ignore */ }
            runPipeline({ mode });
        };
        item.addEventListener('click', activate);
        item.addEventListener('touchend', activate);
        dropdown.append(item);
    }
    document.body.append(dropdown);
    window.addEventListener('scroll', (event) => {
        if (event?.target === dropdown || dropdown.contains?.(event?.target)) return;
        closeWandMenu();
    }, true);
    window.addEventListener('resize', closeWandMenu);
    const outside = (event) => {
        if (dropdown.classList.contains('pxi-hidden')) return;
        if (dropdown.contains(event.target)) return;
        if (document.getElementById('pxi_wand_button_item')?.contains(event.target)) return;
        closeWandMenu();
    };
    document.addEventListener('click', outside);
    document.addEventListener('touchend', outside);
    // ถ้าเมนูไม้กายสิทธิ์ถูกปิด ให้ submenu ปิดตาม
    const menu = document.getElementById('extensionsMenu');
    if (menu && typeof MutationObserver === 'function') {
        new MutationObserver(() => {
            if (!dropdown.classList.contains('pxi-hidden') && !menu.offsetParent) closeWandMenu();
        }).observe(menu, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    return dropdown;
}

function positionDropdown(dropdown, anchor) {
    const rect = anchor.getBoundingClientRect();
    const height = dropdown.offsetHeight || 200;
    const width = dropdown.offsetWidth || 180;
    const margin = 6;

    // แนวนอน: กางออกข้าง ๆ ปุ่ม ขวาก่อน ไม่พอค่อยซ้าย ไม่พออีกก็ชิดขอบจอ
    let left;
    if (rect.right + margin + width <= window.innerWidth) left = rect.right + margin;
    else if (rect.left - margin - width >= 0) left = rect.left - margin - width;
    else left = Math.max(margin, window.innerWidth - width - margin);

    // แนวตั้ง: เริ่มที่ระดับเดียวกับปุ่ม แล้ว clamp ไม่ให้หลุดขอบจอ
    let top = rect.top;
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
}

function toggleWandMenu(anchor) {
    const dropdown = buildDropdown();
    if (!dropdown.classList.contains('pxi-hidden')) { closeWandMenu(); return; }
    dropdown.classList.remove('pxi-hidden');
    positionDropdown(dropdown, anchor);
    // จัดตำแหน่งซ้ำหลัง layout จริง (กันกรณีวัดความสูงไม่ได้ในเฟรมแรก)
    requestAnimationFrame(() => {
        if (!dropdown.classList.contains('pxi-hidden')) positionDropdown(dropdown, anchor);
    });
}

function updateWandButton() {
    const existing = document.getElementById('pxi_wand_button_item');
    if (!settings().wand_button) { existing?.remove(); closeWandMenu(); return; }
    if (existing) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const item = document.createElement('div');
    item.id = 'pxi_wand_button_item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-image extensionsMenuExtensionButton"></div><span>Proxy Image Gen</span><i class="fa-solid fa-caret-right pxi-caret"></i>';
    const open = (event) => { event.preventDefault(); event.stopPropagation(); toggleWandMenu(item); };
    item.addEventListener('click', open);
    item.addEventListener('touchend', open);
    menu.append(item);
}

/* ---- slash commands ---- */

function registerSlashCommands() {
    const context = getContext();
    try {
        const { SlashCommandParser, SlashCommand, SlashCommandNamedArgument, SlashCommandArgument, ARGUMENT_TYPE } = context;
        if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'pxi',
            callback: async (args, value) => {
                const text = String(value || '').trim();
                const useRaw = String(args?.raw || '').toLowerCase() === 'true';
                const mode = MODES.includes(String(args?.mode)) ? String(args.mode) : 'free';
                const result = await runPipeline({
                    mode,
                    rawPrompt: useRaw ? text : '',
                    extra: useRaw ? '' : text,
                    quiet: true,
                });
                return result || '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'mode',
                    description: 'โหมดการเจน',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'free',
                    enumList: MODES,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'raw',
                    description: 'true = ใช้ข้อความนี้เป็น image prompt ตรง ๆ (ข้าม Connection 1)',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: 'false',
                    enumList: ['true', 'false'],
                }),
            ],
            unnamedArgumentList: SlashCommandArgument?.fromProps ? [
                SlashCommandArgument.fromProps({
                    description: 'ข้อความเสริม ({{extra}}) หรือ image prompt ตรง ๆ เมื่อใช้ raw=true',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                }),
            ] : [],
            helpString: 'สร้างรูปผ่าน Proxy Image Gen เช่น <code>/pxi mode=last</code>, <code>/pxi mode=portrait</code>, <code>/pxi raw=true 1girl, silver hair</code>',
            returns: 'path ของรูปที่สร้าง',
        }));
    } catch (error) {
        console.warn(LOG, 'ลงทะเบียน slash command ไม่สำเร็จ', error);
    }
}

async function loadTemplate() {
    try {
        return await renderExtensionTemplateAsync(EXT_PATH, 'settings');
    } catch (error) {
        console.warn(LOG, 'renderExtensionTemplateAsync ล้มเหลว ใช้ fetch แทน', error);
        const response = await fetch(new URL('./settings.html', import.meta.url));
        return await response.text();
    }
}

jQuery(async () => {
    try {
        initSettings();
        const html = await loadTemplate();
        const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!container) { console.error(LOG, 'ไม่พบ container ของหน้า Extensions'); return; }
        container.insertAdjacentHTML('beforeend', html);
        bindEvents();
        await populateProfiles();
        loadSettingsToUi();
        renderDocsButtons();
        updateWandButton();
        registerSlashCommands();

        const context = getContext();
        const imageSwipedEvent = context.eventTypes?.IMAGE_SWIPED;
        if (imageSwipedEvent) context.eventSource.on(imageSwipedEvent, onImageSwiped);
        else console.warn(LOG, 'SillyTavern เวอร์ชันนี้ไม่มี IMAGE_SWIPED — ปิดฟีเจอร์ปัดเพื่อเจนใหม่');

        console.log(LOG, 'พร้อมใช้งาน', EXT_PATH);
    } catch (error) {
        console.error(LOG, 'เริ่มต้นไม่สำเร็จ', error);
    }
});
