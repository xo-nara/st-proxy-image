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

const IDENTITY_RULE = `Character identity - resolve this before any other tag.\n1. Name the character and the work they come from, using the character block, persona block or scene text.\n2. Recall their booru tag. Danbooru spelling wins because NovelAI trained on it, but the scheme is shared with Gelbooru, Safebooru, AIBooru and e621 (furry/anthro) - recall from whichever you know best. Shapes: "amiya (arknights)" when ambiguous, a bare "hatsune miku" when unique, Japanese names surname-first and lowercase, costume variants as a second tag "usada pekora (1st costume)", gendered variants inside the tag "female rover (wuthering waves)".\n3. Judge your confidence and take the first branch that fits:\na. Sure of the tag -> character tag, then series tag, then appearance tags.\nb. Sure of the work only -> no character tag, but still write the series tag alone; it pulls the right style and often the right look.\nc. Original or unrecognised -> appearance tags only.\nNever invent a tag you have not seen - a wrong one summons a different character. Always write the full appearance tags whichever branch you take.\nA pinned glossary in the input overrides your own recall: copy those spellings verbatim.`;

const HEIGHT_RULE = `Heights and eye lines - the model flattens everyone to the same height unless you fight it:\n- Rank the cast from tallest to shortest using the appearance block, the persona block, what the identity tag implies, and anything the message states outright.\n- Give every character an absolute build tag inside their own group so the ranking has something to hold onto: "tall", "very tall", "average height", "short", "petite", "small build", "lanky", "muscular", "broad shoulders", "slender". A tall character with no tag will be drawn average.\n- When two characters differ noticeably, put "height difference" in BOTH groups, and add "size difference" when the gap is large. These tags only work when both sides carry them.\n- Reinforce from the shorter side with "looking up at another", "standing on tiptoes", "reaching up", and from the taller side with "looking down at another", "leaning down", "bending over".\n- Set each gaze from the eye lines you just worked out. Lower eyes get "looking up", higher eyes get "looking down", equal eye levels get "eye contact" or "looking at another". A seated or kneeling character looks up at a standing one even when they are the taller of the two - posture beats raw height.\n- Camera tags are separate: "from above" and "from below" describe where the viewer stands, not who is taller. Never use them as a substitute for height tags.`;

const STYLE_TAIL = `=== STYLE TAIL - ALWAYS END THE PROMPT WITH THIS ===\nAfter every character group and every scene tag, close the prompt with a style tail in this order:\n1. Franchise art style - when the cast comes from a work with a distinctive house style, name it as an official-art tag: "genshin impact", "arknights", "project sekai", "honkai: star rail", "blue archive", "wuthering waves", "zenless zone zero", "hololive", "fate/grand order", "nikke", "azur lane". Add "official art" next to it when the look matches promotional art. Repeating the series tag here is deliberate - it steers the rendering style, so write it both in the character group and here. Two characters from different works: name both series, or drop this line rather than blending them badly. Original characters with no franchise: skip this line.\n2. Rendering style - one or two tags that match the source's look, chosen from: "anime coloring", "cel shading", "soft shading", "painterly", "detailed background", "game cg", "official art", "gradient hair", "glowing eyes", "sparkle", "depth of field", "bloom", "rim light", "cinematic lighting".\n3. Quality tail - always exactly this, always last: "masterpiece, very aesthetic, absurdres, best quality"\nNever place the style tail in the middle of the prompt and never put it inside a character group. It belongs after everything else, as the final tags of the output.`;

const BACKGROUND_RULE = `Background - never fall back to an empty studio backdrop:\n- The background MUST be the place the character is in according to the latest message: the room, the furniture and objects around them, the time of day, the weather, the light source. Name them as tags: "bedroom, indoors, night, unmade bed, curtains, lamplight" rather than "simple background".\n- Do not write "simple background", "white background", "grey background", "gradient background" or "transparent background" unless the message really puts the character against a blank wall or void.\n- If the model still tends to flatten it, push back with "-1::simple background ::" and add "location" so it commits to a real place.\n- Only when the message gives no location at all, infer the most likely place from the scene that came before it, and only if that fails choose a plain but real setting such as "indoors, wooden wall, window light".\n- Depth tags are welcome: "depth of field", "blurry background", "bokeh" keep the focus on the character while the place still reads.`;

const POSITION_RULE = `Placement - the model has no coordinate system here, so state placement in words:\n- Emit character groups strictly left to right: the first group is the leftmost figure, the last is the rightmost.\n- Put an explicit side tag inside each group: "on left", "on right", "in the middle", "in the center". With two characters, tag both sides; with three, tag all three.\n- Add a depth tag when they are not side by side: "foreground", "background", "in front of another", "behind another".\n- Prefer relation tags that already carry a position: "lap sitting", "carrying", "piggyback", "shoulder carry", "hug from behind", "back-to-back", "side-by-side", "wall slam", "against wall", "on bed", "sitting on person", "standing behind". These read far more reliably than a bare description of where someone stands.\n- Anchor people to objects in the scene when possible: "sitting on chair", "leaning on table", "standing in doorway". A character tied to furniture lands where the furniture is.\n- Keep every side and depth tag inside the group of the character it describes, never in the scene header.`;

const RATING_RULE = `Rating: prepend "rating:general" for a safe scene, "rating:sensitive" for suggestive, "rating:explicit" for an adult scene. Adult content only for characters who are adults; if a character reads as young, do not write an adult scene for them regardless of what the text says.`;

const ORDER_RULE = 'Tag order: subject count tags first, then character identity and appearance, then clothing, then expression and pose, then action, then camera framing, then setting, background, lighting and mood. Pick exactly one framing tag - never combine conflicting ones such as full body and close-up.';

const RENAMED_RULE = 'Renamed tags: write "peace sign" not "v", "double peace" not "double v", "neutral face" not ":|", "square bikini" not "eyepatch bikini".';

const DENSITY_RULE = 'Emphasis is numeric: "1.2::tag, tag ::" always closed by a bare "::". Use it in 2 or 3 spots at most - raise the focus of the moment to 1.15-1.3, lower distracting background detail to 0.7-0.9, and use "-1::tag ::" to remove something a character normally wears when the scene says it is gone. Never use the Stable Diffusion form (tag:1.2), never use BREAK, never use the "|" character, and never wrap tags in [ ] or { } - in NovelAI those change the weight instead of grouping.';

const SEARCH_RULE = `You have web access. Use it for identity work instead of relying on memory:\n- Whenever you are not certain of a character's exact booru tag, look it up before answering. Search Danbooru, Gelbooru, Safebooru, AIBooru, or e621 for furry and anthro characters, and read the tag exactly as the site spells it.\n- Look up costume variant tags the same way when the scene calls for a specific outfit, and confirm the series tag while you are there.\n- One or two lookups is enough. If the search comes back empty or ambiguous, fall back to the confidence ladder rather than searching again.\n- Report nothing about the search itself. No citations, no footnote markers, no source names, no links, no "according to". The reply must contain the tag list and nothing else.`;

const PLANNING_RULE = `Think before you answer. Open your reply with a <planning> block and work through these in order:\n1. Cast - list every character present in the moment by name.\n2. Identity - for each one, name the work they come from, then write the booru tag you intend to use and how sure you are of the exact spelling. If you are sure, commit to it. If you only know the work, say so and commit to the series tag alone. If you recognise nothing, say "original" and move on. Check the pinned glossary first if one was supplied.\n3. Placement - each one's final position, and the left-to-right order of the frame.\n4. Heights - rank them, and note who looks up and who looks down.\n5. Interaction - who acts on whom, and whether it is source/target or mutual.\n6. Setting - place, time, light, and the franchise style to close on.\nKeep the block short, one line per item. Close it with </planning>, then output the tag list on the next line with nothing else after it. The planning block is discarded and never reaches the image model.`;

const ANALYSIS_SYSTEM = `You are analysing a roleplay scene so that another model can turn it into an image prompt for NovelAI Diffusion V4.5.\nDo not write any tags except the character and series tags asked for in item 2. Write a short analysis in plain English, one line per item:\n1. Cast - every character physically present in the latest message, by name.\n2. Identity - for each character, name the work they come from, then give the booru tag you would use and how sure you are of the exact spelling. NovelAI follows Danbooru, but the scheme is shared with Gelbooru, Safebooru, AIBooru and e621, so recall from whichever you know best. Format is usually "name (series)" or a bare name, lowercase, surname first for Japanese names. If you know the work but not the exact character spelling, say so and give the series tag alone. If the character is original, say "original". Check the pinned glossary first if one was supplied and use those spellings verbatim.\n3. Appearance - for each character: hair, eyes, build and height, and what they are wearing RIGHT NOW according to the scene.\n4. Placement - each character's final position, and the left-to-right order they should appear in the frame.\n5. Heights and eye lines - who is taller, who looks up, who looks down, who is seated or kneeling.\n6. Interaction - who is doing what to whom, or state that nobody is touching anyone.\n7. Setting - place, indoors or outdoors, time of day, light, mood, and the notable objects around them.\n8. Framing - the single camera framing that fits, and the franchise art style if there is one.\nBe concrete and brief. No preamble, no markdown.`;

const DEFAULT_TEMPLATES = {
    free: {
        label: 'Free / Scene (คำสั่งทั่วไป)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nRead the roleplay excerpt and describe the CURRENT scene as one image.\n\nCast: include every character the excerpt shows as present, not only the ones you were given blocks for. Count tags must match that cast. Several unnamed people become one crowd tag instead of their own group.\n\n${IDENTITY_RULE}\n\n${HEIGHT_RULE}\n\nWrite each character as one unbroken group wrapped in a numeric-emphasis boundary so their traits cannot mix: "1.05::girl, <identity>, <hair>, <eyes>, <height and build>, <clothing>, <expression>, <gaze>, <posture>, <action tag> ::". Open with the bare word "girl", "boy" or "other" - numbered count tags live only in the scene header.\n\n${ORDER_RULE}\n${RENAMED_RULE}\n${POSITION_RULE}\n${DENSITY_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\n\n35-50 tags total.\n${NAI_RULES}`,
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
    manga: {
        label: 'Manga Panel (แบ่งช่อง)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nTurn the recent scene into ONE comic page made of separate panels - a sequence of moments, not a single illustration.\n\n=== STEP 1: PICK THE BEATS ===\nRead the scene and choose 2-4 moments that actually move the story, in the order they happen. Skip anything that would look identical to the panel before it.\nA reliable shape when the scene is short: establishing shot, then the reaction, then the action itself, then the aftermath.\nOne beat per panel. A panel is a single instant, not a summary.\n\n=== STEP 2: PAGE HEADER - ALWAYS FIRST ===\nOpen the prompt with the page tags in this order:\n1. "comic, silent comic, multiple views, panel layout, borders" - "silent comic" is the danbooru tag for a wordless page and does the heaviest lifting for keeping text out.\n2. The panel count, exactly one of: "4koma" (four equal panels stacked vertically - by far the most reliable), "2koma", "3koma", or "6 panels" for a denser page. Never combine two count tags.\n3. The total cast across the whole page as count tags: 1girl / 2girls / 1girl, 1boy ...\n4. "no text, textless" as a safety net.\nNever put a single-image framing tag such as "cowboy shot" or "close-up" in the header - framing belongs to individual panels. Putting it here collapses the page into one picture with decorative borders.\n\n=== STEP 3: ONE GROUP PER PANEL ===\nWrite each panel as its own numeric-emphasis group so the model keeps them apart:\n   "1.05::panel 1, <framing>, <character tags>, <expression>, <pose or action>, <background> ::"\nRules:\n- Number them "panel 1", "panel 2" and so on in reading order, and close every group with a bare "::".\n- Give every panel its own framing tag and vary it across the page: close-up, upper body, full body, wide shot, from above, from behind, pov, from side. A page where every panel is the same shot reads flat.\n- Repeat each character's identity and key appearance tags inside every panel they appear in. The model does not carry a character from one panel to the next on its own.\n- Keep each panel to 6-12 tags.\n- If a panel has no people in it - a hand, an object, a doorway, the sky - say so with "no humans" inside that group. Cutaway panels like this make a page feel like real manga.\n\n=== STEP 4: WHAT NOT TO DO ===\n- No speech bubbles, no captions, no sound effects, no signage, no lettering of any kind. Never write those as positive tags. Tell the story through expression, posture and framing alone.\n- Do not describe the same moment twice in different panels.\n- Do not let one character's tags spill into another panel's group.\n\n${IDENTITY_RULE}\n${RENAMED_RULE}\n${DENSITY_RULE}\n${RATING_RULE}\n\nThe page look is given separately in the input - follow it exactly and do not add colour tags that contradict it.\nClose with: masterpiece, very aesthetic, absurdres, best quality\n40-60 tags total.\n${NAI_RULES}`,
    },
    last: {
        label: 'Last Message (ฉากล่าสุด)',
        sys: `You write image prompts for NovelAI Diffusion V4.5 (anime model).\nTurn the LATEST message into one image that reads as the whole scene at that instant - who is there, where each of them stands, how tall each of them is next to the others, what they are doing to each other, and what the place looks like around them.\n\n=== STEP 1: BUILD THE CAST ===\nList EVERY character physically present in the latest message, not just the ones you were given blocks for. A character counts as present if the message shows them acting, speaking, being touched, being looked at, or standing in the frame.\n- Side characters, named NPCs, servants, guards, shopkeepers, classmates and rivals all belong in the image if the moment shows them. Several unnamed people become one crowd tag in the header ("crowd", "people", "multiple boys") instead of groups.\n- Leave someone out only if the message shows them absent, off-screen, behind a door, or merely mentioned rather than present.\n- Count tags MUST match this cast. Two women and a man is "2girls, 1boy" - never shrink it to "1girl" just because only one character had an appearance block supplied.\n\n=== STEP 2: RESOLVE POSITIONS ===\nA message often moves people around. Read it start to finish and take each character's FINAL position - where they ended up by the last sentence, not where they began.\n- Note for each character: where they are in the room, how far from the others, whether standing, sitting, kneeling or lying, and what they are on or against.\n- Then decide the left-to-right order of the frame. Character groups are emitted in that order: the first group is the leftmost figure, the last group is the rightmost. This ordering is the main way the model places people, so choose it deliberately.\n- Reinforce the layout with relation tags inside the group of the character they describe: "standing", "sitting", "kneeling", "lying", "sitting on lap", "on person", "behind another", "in front of another", "back-to-back", "side-by-side", "leaning forward", "leaning on person", "foreground", "background".\n- If two characters are apart rather than touching, use distance tags such as "facing each other", "across the room", "looking at another" instead of contact tags.\n\n=== STEP 3: RESOLVE HEIGHTS AND EYE LINES ===\n${HEIGHT_RULE}\n- If the height gap is the point of the moment, raise it once: "1.25::height difference, looking up at another ::".\n\n=== STEP 4: IDENTIFY EACH ONE ===\n${IDENTITY_RULE}\n\nWhere each look comes from:\n1. The latest message - always wins for clothing, hair state, expression, pose, injuries, anything temporary.\n2. The appearance block (main character) and the persona block (user's character), for fixed traits including height and build. A persona block appears only when the user's character is actually in the shot - if it is missing, do not draw that character and do not include them in the count tags. If it is present but the latest message shows they are absent, ignore it the same way.\n3. For a side character with no block, build the look from what the message says plus what their identity tag implies. If the message gives nothing, write plain role-appropriate tags rather than skipping them.\n\n=== STEP 5: OUTPUT SHAPE ===\nOne flat comma-separated list in this order:\n\n1. SCENE HEADER - count tags for the whole cast, then the setting: place, indoors or outdoors, time of day, weather, key objects and furniture that anchor the layout, lighting, mood. Then exactly one framing tag wide enough to hold everyone: "wide shot", "full body" and "cowboy shot" work for two or more people and are the ones that actually show a height difference; "from side" helps a layout read clearly; reserve "close-up" and "portrait" for a single figure. Never combine conflicting framing tags.\n\n2. ONE GROUP PER CHARACTER, emitted left to right, each a numeric-emphasis group so the model cannot mix two characters together:\n   "1.05::girl, <identity tags>, <hair>, <eyes>, <height and build>, <skin>, <clothing>, <expression>, <gaze>, <posture and position>, <action tag> ::"\n   - Open with the bare word "girl", "boy" or "other" - never a numbered count tag, those live only in the header.\n   - Close every group with a bare "::" before the next one. Never let one character's tags spill into another group.\n   - Clothing is mandatory. If a character is undressed, say so explicitly or the model will invent an outfit.\n   - The character the moment centres on goes at 1.15; the others stay at 1.05.\n\n=== PLACEMENT ===\n${POSITION_RULE}\n\n=== ACTION TAGS ===\n- Different roles: "source#<action>" on the one performing it, "target#<action>" on the one receiving it. One hugs the other gives source#hug and target#hug.\n- Reciprocal: the same "mutual#<action>" written identically in both groups - mutual#hug, mutual#kissing.\n- Test: if swapping the two characters changes the meaning, use source/target; if it stays the same, use mutual.\n- One action tag per character, except mutual# which is shared. Put it last inside the group. Never rename source, target or mutual, never use them in a solo image, never use them for something done alone - that is a plain tag such as "sitting" or "drinking".\n- With three or more characters, tag only the pair actually interacting; give the bystanders ordinary posture and gaze tags.\n- If nobody is touching anyone, omit action tags entirely.\n\n=== SYNTAX ===\n${DENSITY_RULE}\n${RENAMED_RULE}\n${RATING_RULE}\n\n${STYLE_TAIL}\n\nAt most 4 character groups; if the moment holds more, keep the ones the message focuses on and cover the rest with a crowd tag.\n40-55 tags total.\n${NAI_RULES}`,
    },
};


/* ================================================================== */
/* GPT-Image templates (prompt แบบประโยคบรรยาย ไม่ใช่แท็ก)             */
/* ================================================================== */

const GPT_STYLE_PRESETS = {
    realistic: {
        label: 'Realistic / ภาพถ่ายจริง',
        text: 'Style: photorealistic. Real human proportions and skin texture, natural lighting with believable shadows and depth of field, shot as if on a full-frame camera with a fast prime lens. No illustration or cartoon cues.',
    },
    semi_real: {
        label: 'Semi-realistic / กึ่งสมจริง',
        text: 'Style: semi-realistic illustration. Realistic proportions, anatomy and lighting, rendered as painted digital art with visible brushwork and slightly stylised faces. Between anime and photography, close to a modern game or light-novel cover painting.',
    },
    anime: {
        label: 'Anime / อนิเมะ',
        text: 'Style: modern anime illustration. Clean cel shading, crisp linework, expressive stylised eyes, saturated but controlled colour. A high-budget TV anime key visual, not a photograph.',
    },
    painterly: {
        label: 'Painterly / ภาพวาดฝีแปรง',
        text: 'Style: painterly digital illustration. Textured brushwork, expressive colour, soft edges and atmospheric light. Storybook or concept-art feel rather than photographic or flat anime.',
    },
    cinematic: {
        label: 'Cinematic / ภาพนิ่งจากหนัง',
        text: 'Style: cinematic film still. Anamorphic framing, motivated practical lighting, filmic colour grading with lifted shadows, subtle grain and shallow focus. Looks like a frame pulled from a feature film.',
    },
    watercolour: {
        label: 'Watercolour / สีน้ำ',
        text: 'Style: watercolour painting. Translucent washes, soft bleeding edges, visible paper texture, restrained palette with white space left to breathe.',
    },
    oil: {
        label: 'Oil painting / สีน้ำมัน',
        text: 'Style: oil painting on canvas. Thick impasto strokes, rich saturated pigment, warm classical lighting and visible canvas weave.',
    },
    render3d: {
        label: '3D render / ภาพเรนเดอร์',
        text: 'Style: polished 3D render. Stylised character modelling with soft global illumination, subsurface scattering on skin, clean materials and a shallow depth of field, in the manner of a modern animated feature.',
    },
    comic: {
        label: 'Western comic / คอมิกฝั่งตะวันตก',
        text: 'Style: western comic book art. Bold inked outlines, dynamic foreshortening, flat spot colour with halftone shading and dramatic high-contrast lighting.',
    },
    sketch: {
        label: 'Sketch / ลายเส้นดินสอ',
        text: 'Style: pencil sketch. Loose graphite linework, visible construction lines and hatching for shadow, minimal or no colour, on off-white paper.',
    },
    retro_anime: {
        label: 'Retro anime / อนิเมะยุค 90',
        text: 'Style: 1990s cel animation. Hand-painted cel look with slightly muted film-stock colour, heavier outlines, soft analogue grain and period character design.',
    },
    flat_vector: {
        label: 'Flat vector / กราฟิกแบน',
        text: 'Style: flat vector illustration. Clean geometric shapes, limited flat colour palette, no gradients or texture, generous negative space and confident silhouettes.',
    },
    storybook: {
        label: 'Storybook / หนังสือนิทาน',
        text: 'Style: children\'s storybook illustration. Warm gouache-like colour, gentle rounded shapes, cosy hand-made texture and soft even lighting.',
    },
    noir: {
        label: 'Noir / ขาวดำคอนทราสต์สูง',
        text: 'Style: black and white noir photography. High contrast monochrome, hard directional light carving deep shadows, visible film grain and a moody, restrained composition.',
    },
};

/** ลำดับที่แสดงใน dropdown — เรียงตามที่ใช้บ่อยที่สุดก่อน */
const GPT_STYLE_ORDER = ['realistic', 'semi_real', 'anime', 'painterly', 'cinematic', 'watercolour', 'oil', 'render3d', 'comic', 'sketch', 'retro_anime', 'flat_vector', 'storybook', 'noir'];

const GPT_BASE_RULES = `Write ONE image prompt in natural English prose for an image model that reads plain descriptions.\nRules that always apply:\n- Write flowing sentences, not a comma-separated tag list. Do not use booru tags, weights like 1.2::tag::, or the source#/target#/mutual# syntax - this model understands none of them.\n- Order it like this: the subject or subjects, then their appearance and clothing, then expression and pose, then how they relate to each other, then the setting, then the lighting and mood, and finally the camera framing.\n- Describe named characters by their appearance instead of relying on the audience knowing them: hair colour and style, eye colour, build, clothing, and distinguishing features. You may name them and the work they come from once - \"Amiya from Arknights\" - as a reference, but the description must stand on its own without it.\n- Be concrete about placement: say who is on the left, who is on the right, who is nearer the camera, who is taller, and who is looking up or down. This model follows plain spatial language well, so use it instead of tags.\n- Say how many people are in the frame.\n- State the lighting and mood explicitly.\n- Do not ask for any text, lettering, captions, speech bubbles, watermarks or signatures in the image.\n- 80-160 words. No preamble, no headings, no quotes around the prompt - output the description only.`;

const GPT_TEMPLATES = {
    free: {
        sys: `${GPT_BASE_RULES}\n\nRead the roleplay excerpt and describe the CURRENT scene as one image.\nCover every character the excerpt shows as present, what each of them looks like, what they are doing, and the place around them.`,
    },
    portrait: {
        sys: `${GPT_BASE_RULES}\n\nDescribe a single-character portrait of the CHARACTER as they appear in the latest message.\nThe latest message decides the outfit, hair state, expression, pose and location; the character sheet supplies fixed traits it does not mention.\nChoose the tightest crop the moment needs - a head-and-shoulders portrait, a half-body shot, or a fuller view - and say which one you mean. If the lower body is not doing anything, crop it out.\nOnly this one character appears in the frame.`,
    },
    selfie: {
        sys: `${GPT_BASE_RULES}\n\nDescribe a close-up of the CHARACTER's face, framed head to collarbone as if taken at arm's length right now.\nFocus on the face: hair framing it, eye colour, skin, blush, sweat or tears, and the exact expression and gaze from the current scene. Mention only the clothing visible at the neck and shoulders.\nDescribe the real place behind them, softly out of focus.\nOnly this one character appears in the frame.`,
    },
    user: {
        sys: `${GPT_BASE_RULES}\n\nDescribe a single-character image of the USER's character.\nThe persona block gives their fixed traits: build, height, hair, eyes, permanent features. The latest message gives their current state: what they are wearing, how their hair sits, their expression, their pose and where they are. When the two disagree about something temporary, the scene wins.\nIf another character is touching them in the scene, keep only the effect on this character's own body and do not describe the second person.\nOnly this one character appears in the frame.`,
    },
    manga: {
        sys: `${GPT_BASE_RULES}\n\nDescribe ONE comic page divided into separate panels, drawn in black and white with screentone shading.\nSay how many panels there are and how they are arranged - four equal panels stacked vertically is the most reliable choice. Then describe each panel in order as its own sentence or two: what the camera shows, who is in it, what they are doing, and their expression.\nVary the shot across panels rather than repeating the same distance.\nRe-describe each character in every panel they appear in, so they stay consistent.\nThe page contains no writing at all: no dialogue, no speech balloons, no sound effects.`,
    },
    last: {
        sys: `${GPT_BASE_RULES}\n\nTurn the LATEST message into one image of that exact moment.\nInclude every character physically present in it, not only the ones given appearance blocks. Describe each one's look, then where they stand relative to each other, who is taller and who is looking up or down, and exactly what they are doing to one another.\nTake each character's final position in the message, not where they started.\nThen describe the setting, the time of day, the light and the mood.\nDraw only what this moment shows - no earlier events.`,
    },
};

/* ---------- สไตล์หน้าการ์ตูนฝั่ง NovelAI ---------- */

const MANGA_STYLE_PRESETS = {
    mono: {
        label: 'ขาวดำ + สกรีนโทน (คลาสสิก)',
        text: 'Page look: greyscale, monochrome, screentone, halftone, manga. Shade with screentone and hatching, no colour anywhere.',
    },
    mono_clean: {
        label: 'ขาวดำ เส้นสะอาด ไม่มีสกรีนโทน',
        text: 'Page look: greyscale, monochrome, lineart, high contrast, manga. Flat blacks and clean whites, no screentone, no halftone dots.',
    },
    colour: {
        label: 'สีเต็ม (อนิเมะ)',
        text: 'Page look: colorful, anime coloring, cel shading, comic. Full colour panels with clean cel shading, no greyscale, no screentone.',
    },
    webtoon: {
        label: 'เว็บตูน (สีนุ่ม แสงฟุ้ง)',
        text: 'Page look: colorful, soft shading, gradient, bloom, comic. Soft digital colour with glowing rim light and gentle gradients, in the manner of a webtoon.',
    },
    sepia: {
        label: 'ซีเปีย / ย้อนยุค',
        text: 'Page look: sepia, monochrome, retro artstyle, screentone, comic. Aged paper tone throughout, muted and warm, as if printed decades ago.',
    },
    sketch: {
        label: 'ร่างดินสอ (storyboard)',
        text: 'Page look: sketch, greyscale, graphite (medium), rough, comic. Loose construction lines and visible hatching, like a storyboard rather than a finished page.',
    },
};

const MANGA_STYLE_ORDER = ['mono', 'mono_clean', 'colour', 'webtoon', 'sepia', 'sketch'];

let runMangaOverride = '';
let runVibeOverride = null;

/** vibe ที่จะใช้รอบนี้ — null = ไม่ใช้ */
function activeVibe() {
    const s = settings();
    if (runVibeOverride === 'none') return null;
    const id = runVibeOverride || s.vibe_active;
    if (!id) return null;
    return (s.vibes || []).find(v => v.id === id) || null;
}

function vibeText() {
    return String(activeVibe()?.tags || '').trim();
}

function mangaStyleKey() {
    const key = runMangaOverride || settings().manga_style;
    return MANGA_STYLE_PRESETS[key] ? key : 'mono';
}

function mangaStyleText() {
    return MANGA_STYLE_PRESETS[mangaStyleKey()].text;
}

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
    take_over_overswipe: true,

    // Connection 1
    c1_source: 'profile',
    c1_profile: '',
    llm_url: '',
    llm_url_mode: 'auto',
    c1_via_server: true,
    llm_gen_path: 'chat/completions',
    llm_models_path: 'models',
    llm_models: [],
    llm_key: '',
    llm_model: '',
    llm_max_tokens: 600,
    cot_mode: 'off',
    llm_can_search: false,
    llm_temp: 0.7,
    llm_timeout: 90,

    // Context budget
    tag_hints: '',
    persona_mode: 'auto',
    ctx_messages: 0,
    ctx_chars: 1200,
    ctx_total: 10000,
    strip_html: true,
    strip_system: true,

    // Connection 2
    c2_source: 'nai',
    param_engine: 'nai',
    tpl_engine: 'nai',
    nai_model: 'nai-diffusion-4-5-full',
    nai_models_extra: [],
    model_list_url: '',
    model_list_auto: false,
    anlas_guard: true,
    img_url: '',
    img_key: '',
    img_model: '',
    gpt_model: 'gpt-image-2',
    gpt_size: '1024x1536',
    gpt_quality: 'high',
    gpt_output_format: 'png',
    gpt_output_compression: 100,
    gpt_background: 'auto',
    gpt_moderation: 'auto',
    docs_engine: 'nai',
    vibes: [],
    vibe_active: '',
    vibe_remember: false,
    manga_style: 'mono',
    manga_style_remember: false,
    gpt_style: 'realistic',
    gpt_style_custom: '',
    remember_style: false,
    style_per_mode: false,
    gpt_style_modes: {},
    gpt_n: 1,
    img_url_mode: 'auto',
    img_gen_path: 'images/generations',
    img_models_path: 'models',
    img_models: [],
    gpt_extra: '',
    gpt_templates: {},
    img_format: 'b64_json',
    img_timeout: 180,

    // Image parameters
    size: '768x1344',
    sampler: 'k_euler_ancestral',
    scheduler: 'karras',
    steps: 28,
    scale: 5,
    seed: -1,
    upscale_ratio: 1,
    decrisper: false,
    variety_boost: true,
    sm: false,
    sm_dyn: false, // ปิดถาวร: SMEA DYN ใช้ไม่ได้กับ V4 ขึ้นไป
    extra_body: '',

    prefix: '',
    suffix: '',
    negative: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',

    // Templates
    templates: cloneTemplates(),
    extra_instruction: '',

    // Output
    wand_button: true,
};

const BINDINGS = [
    ['pxi_enabled', 'enabled', 'bool'],
    ['pxi_edit_before', 'edit_before', 'bool'],
    ['pxi_swipe_regen', 'swipe_regen', 'bool'],
    ['pxi_take_over_overswipe', 'take_over_overswipe', 'bool'],
    ['pxi_c1_source', 'c1_source', 'text'],
    ['pxi_c1_profile', 'c1_profile', 'text'],
    ['pxi_llm_url', 'llm_url', 'text'],
    ['pxi_llm_url_mode', 'llm_url_mode', 'text'],
    ['pxi_c1_via_server', 'c1_via_server', 'bool'],
    ['pxi_llm_gen_path', 'llm_gen_path', 'text'],
    ['pxi_llm_models_path', 'llm_models_path', 'text'],
    ['pxi_llm_key', 'llm_key', 'text'],
    ['pxi_llm_model', 'llm_model', 'text'],
    ['pxi_llm_max_tokens', 'llm_max_tokens', 'number'],
    ['pxi_cot_mode', 'cot_mode', 'text'],
    ['pxi_llm_can_search', 'llm_can_search', 'bool'],
    ['pxi_llm_temp', 'llm_temp', 'number'],
    ['pxi_llm_timeout', 'llm_timeout', 'number'],
    ['pxi_tag_hints', 'tag_hints', 'text'],
    ['pxi_persona_mode', 'persona_mode', 'text'],
    ['pxi_ctx_messages', 'ctx_messages', 'number'],
    ['pxi_ctx_chars', 'ctx_chars', 'number'],
    ['pxi_ctx_total', 'ctx_total', 'number'],
    ['pxi_strip_html', 'strip_html', 'bool'],
    ['pxi_strip_system', 'strip_system', 'bool'],
    ['pxi_c2_source', 'c2_source', 'text'],
    ['pxi_param_engine', 'param_engine', 'text'],
    ['pxi_tpl_engine', 'tpl_engine', 'text'],
    ['pxi_nai_model', 'nai_model', 'text'],
    ['pxi_model_list_url', 'model_list_url', 'text'],
    ['pxi_model_list_auto', 'model_list_auto', 'bool'],
    ['pxi_anlas_guard', 'anlas_guard', 'bool'],
    ['pxi_img_url', 'img_url', 'text'],
    ['pxi_img_key', 'img_key', 'text'],
    ['pxi_gpt_model', 'gpt_model', 'text'],
    ['pxi_gpt_size', 'gpt_size', 'text'],
    ['pxi_gpt_quality', 'gpt_quality', 'text'],
    ['pxi_gpt_output_format', 'gpt_output_format', 'text'],
    ['pxi_gpt_output_compression', 'gpt_output_compression', 'number'],
    ['pxi_gpt_background', 'gpt_background', 'text'],
    ['pxi_gpt_moderation', 'gpt_moderation', 'text'],
    ['pxi_docs_engine', 'docs_engine', 'text'],
    ['pxi_vibe_remember', 'vibe_remember', 'bool'],
    ['pxi_manga_style', 'manga_style', 'text'],
    ['pxi_manga_style_remember', 'manga_style_remember', 'bool'],
    ['pxi_gpt_style', 'gpt_style', 'text'],
    ['pxi_gpt_style_custom', 'gpt_style_custom', 'text'],
    ['pxi_remember_style', 'remember_style', 'bool'],
    ['pxi_style_per_mode', 'style_per_mode', 'bool'],
    ['pxi_gpt_n', 'gpt_n', 'number'],
    ['pxi_img_url_mode', 'img_url_mode', 'text'],
    ['pxi_img_gen_path', 'img_gen_path', 'text'],
    ['pxi_img_models_path', 'img_models_path', 'text'],
    ['pxi_img_model', 'img_model', 'text'],
    ['pxi_img_format', 'img_format', 'text'],
    ['pxi_gpt_extra', 'gpt_extra', 'text'],
    ['pxi_img_timeout', 'img_timeout', 'number'],
    ['pxi_sampler', 'sampler', 'text'],
    ['pxi_scheduler', 'scheduler', 'text'],
    ['pxi_steps', 'steps', 'number'],
    ['pxi_scale', 'scale', 'number'],
    ['pxi_seed', 'seed', 'number'],
    ['pxi_upscale', 'upscale_ratio', 'number'],
    ['pxi_decrisper', 'decrisper', 'bool'],
    ['pxi_variety', 'variety_boost', 'bool'],
    ['pxi_sm', 'sm', 'bool'],
    ['pxi_extra_body', 'extra_body', 'text'],
    ['pxi_prefix', 'prefix', 'text'],
    ['pxi_suffix', 'suffix', 'text'],
    ['pxi_negative', 'negative', 'text'],
    ['pxi_wand_button', 'wand_button', 'bool'],
    ['pxi_extra_instruction', 'extra_instruction', 'text'],
];

let isBusy = false;
let lastAnalysis = '';

/* ---------- งานที่กำลังวิ่ง: ใช้ทั้งปุ่ม Stop และแถบสถานะ ---------- */
const activeControllers = new Set();
let userAborted = false;
let wakeLock = null;

/** เวลาสะสมที่หน้าเว็บถูกพับ/สลับไปแอปอื่น นับตั้งแต่เริ่มคำขอ */
let hiddenSince = document?.hidden ? Date.now() : 0;
let hiddenTotal = 0;

function trackVisibility() {
    if (typeof document?.addEventListener !== 'function') return;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            hiddenSince = Date.now();
            return;
        }
        if (hiddenSince) hiddenTotal += Date.now() - hiddenSince;
        hiddenSince = 0;
        if (activeControllers.size) reacquireWakeLock();
    });
}

/** เวลาที่หน้าเว็บถูกพับไปแล้วทั้งหมด ณ ตอนนี้ */
function hiddenElapsed() {
    return hiddenTotal + (hiddenSince ? Date.now() - hiddenSince : 0);
}

async function reacquireWakeLock() {
    try {
        if (!navigator?.wakeLock?.request) return;
        if (wakeLock && !wakeLock.released) return;
        wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* ไม่รองรับหรือถูกปฏิเสธ ไม่เป็นไร */ }
}

async function releaseWakeLock() {
    try { await wakeLock?.release?.(); } catch { /* ignore */ }
    wakeLock = null;
}

function abortActiveRequests() {
    userAborted = true;
    for (const controller of activeControllers) {
        try { controller.abort(); } catch { /* ignore */ }
    }
    activeControllers.clear();
}
let isSwipePromptOpen = false;
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
    s.sm_dyn = false; // ปิดถาวรตั้งแต่ 2.6.0
    delete s.msg_template;  // ยกเลิกตั้งแต่ 2.11.0 (ข้อความ = prompt เสมอ)
    delete s.hide_message;  // ยกเลิกตั้งแต่ 2.11.0 (ซ่อนจาก AI เสมอ)
    if (!['off', 'light', 'heavy'].includes(s.cot_mode)) s.cot_mode = 'off';
    if (!['auto', 'always', 'never'].includes(s.persona_mode)) s.persona_mode = 'auto';
    if (!Array.isArray(s.img_models)) s.img_models = [];
    if (!['auto', 'path', 'exact'].includes(s.img_url_mode)) s.img_url_mode = 'auto';
    if (!['auto', 'path', 'exact'].includes(s.llm_url_mode)) s.llm_url_mode = 'auto';
    if (!s.gpt_templates || typeof s.gpt_templates !== 'object') s.gpt_templates = {};
    if (!GPT_STYLE_PRESETS[s.gpt_style]) s.gpt_style = 'realistic';
    if (!MANGA_STYLE_PRESETS[s.manga_style]) s.manga_style = 'mono';
    if (!['nai', 'gpt'].includes(s.docs_engine)) s.docs_engine = 'nai';
    if (!Array.isArray(s.vibes)) s.vibes = [];
    s.vibes = s.vibes.filter(v => v && typeof v === 'object' && v.id).map(v => ({
        id: String(v.id),
        name: String(v.name || 'vibe'),
        tags: String(v.tags || ''),
        note: String(v.note || ''),
    }));
    const seenVibeIds = new Set();
    for (const vibe of s.vibes) {
        while (seenVibeIds.has(vibe.id)) vibe.id = `${vibe.id}_${Math.random().toString(36).slice(2, 6)}`;
        seenVibeIds.add(vibe.id);
    }
    if (!s.vibes.some(v => v.id === s.vibe_active)) s.vibe_active = '';
    if (s.c2_source === 'gptimage') { s.c2_source = 'custom'; s.param_engine = 'gpt'; s.tpl_engine = 'gpt'; }
    if (!['nai', 'custom'].includes(s.c2_source)) s.c2_source = 'nai';
    if (s.engine === 'gpt') { s.param_engine ??= 'gpt'; s.tpl_engine ??= 'gpt'; }
    delete s.engine;
    if (!['nai', 'gpt'].includes(s.param_engine)) s.param_engine = 'nai';
    if (!['nai', 'gpt'].includes(s.tpl_engine)) s.tpl_engine = 'nai';
    if (!Array.isArray(s.llm_models)) s.llm_models = [];
    if (!Array.isArray(s.nai_models_extra)) s.nai_models_extra = [];
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
    if (status === 404) {
        out.push('ไม่พบ endpoint ที่ URL นี้');
        if (stage === '1' && settings().c1_source === 'custom') {
            out.push('ถ้า proxy ไม่ได้ใช้รูปแบบ /v1/chat/completions ให้เปลี่ยน "โหมด URL" เป็น "กำหนด path เอง" หรือ "ใช้ URL นี้ตรง ๆ" ในหมวด Connection 1');
            out.push('กดปุ่ม "เชื่อมต่อ" เพื่อดูว่า /models ตอบกลับได้ไหม จะได้แยกว่าเป็นที่ URL หรือที่ endpoint');
        } else if (stage === '2' && settings().c2_source === 'custom') {
            out.push('ถ้า /models ตอบ 200 ได้แต่ตัวเจนรูป 404 แปลว่า proxy ช่องนั้นยังไม่ได้เปิด endpoint เจนรูปแบบ OpenAI ถึงจะมีชื่อโมเดลรูปอยู่ในลิสต์ก็ตาม — ต้องให้คนดูแล proxy เปิดให้ หรือถามว่า path จริงคืออะไร');
            out.push('ถ้ารู้ path จริงแล้ว ให้เปลี่ยน "โหมด URL" เป็น "กำหนด path เอง" หรือ "ใช้ URL นี้ตรง ๆ"');
            out.push('กดปุ่ม "ค้นหา endpoint" ในหมวด Connection 2 เพื่อให้ระบบไล่ยิง path ที่พบบ่อยแล้วบอกว่าอันไหนมีอยู่จริง');
        } else {
            out.push('เช็คว่า Base URL ลงท้าย /v1 ถูกต้องไหม');
        }
    }
    if (status === 429) out.push('ยิงถี่เกินหรือคิวเต็ม — เว้น 10-30 วินาทีแล้วลองใหม่ (NovelAI จำกัดงานพร้อมกันต่อบัญชี)');
    if (status >= 500) {
        if (isNai) out.push('เซิร์ฟเวอร์ ST ตีกลับ 500 = NovelAI ปฏิเสธคำขอ ดูเหตุผลจริงได้ที่คอนโซลของ SillyTavern (มักเป็นคีย์ผิด, Anlas หมด, ขนาด/steps เกินโควตา หรือคิวชนกัน)');
        else out.push('ฝั่ง proxy พัง หรือโมเดลกำลังบ่ม/โหลดอยู่ (cold start) — รอสักครู่แล้วลองใหม่');
    }
    if (text.includes('content') && text.includes('filter')) out.push('โดนฟิลเตอร์เนื้อหาของ Connection 1 — ลดความโจ่งแจ้งของฉาก หรือเปลี่ยนโปรไฟล์/โมเดล');
    if (text.includes('warm') || text.includes('loading') || text.includes('cold')) out.push('โมเดลกำลังบ่ม (warming up) — รอ 30-60 วินาทีแล้วยิงใหม่');
    if (text.includes('quota') || text.includes('insufficient')) out.push('โควตา/เครดิตหมด');
    if (/moderation|safety|content[_ ]policy|rejected|violat/i.test(text)) {
        out.push('prompt โดนระบบกรองเนื้อหาของฝั่งเจนรูปตีกลับ — มักมาจากคำไม่กี่คำ ไม่ใช่ทั้งประโยค');
        out.push('ลองแก้เฉพาะคำที่สุ่มเสี่ยง เช่นคำบรรยายร่างกาย เสื้อผ้าที่เปิดเผย หรือคำที่ตีความได้สองแง่ แล้วยิงใหม่');
        if (paramsAreGpt()) out.push('ถ้าใช้ GPT-Image ลองตั้ง Moderation เป็น low ในหมวด ⑤ เพื่อให้กรองหลวมลง');
    }
    if (!out.length) out.push('ลองกดปุ่มทดสอบการเชื่อมต่อในหน้าตั้งค่า เพื่อแยกว่าเป็นที่การเชื่อมต่อหรือที่ prompt');
    return out;
}

async function showErrorPopup(error, { retry = false } = {}) {
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
        await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', {
            wide: true,
            okButton: retry ? 'แก้ prompt แล้วลองใหม่' : 'ปิด',
        });
    } catch {
        notify(String(error?.message || error), 'error');
    }
}

/* ================================================================== */
/* HTTP helpers                                                        */
/* ================================================================== */

const KNOWN_ENDPOINTS = /\/(chat\/completions|completions|images\/generations|images\/edits|models)$/i;

function buildUrl(base, endpoint) {
    const url = String(base || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!url) throw new PxiError('ยังไม่ได้ตั้งค่า Base URL', { stage: '2' });
    if (url.toLowerCase().endsWith('/' + endpoint.toLowerCase())) return url;

    // ตัดเฉพาะ endpoint มาตรฐานที่ผู้ใช้เผลอวางมาเต็ม ๆ แล้วประกอบใหม่จาก base เดิม
    const trimmed = url.replace(KNOWN_ENDPOINTS, '');
    if (/\/v\d+[a-z]*$/i.test(trimmed)) return joinUrl(trimmed, endpoint);
    return joinUrl(trimmed, `v1/${endpoint}`);
}

function joinUrl(base, path) {
    const left = String(base || '').replace(/\/+$/, '');
    const right = String(path || '').trim().replace(/^\/+/, '');
    return right ? `${left}/${right}` : left;
}

/**
 * ประกอบ URL ของ Connection 2 ตามโหมดที่เลือก
 * auto  = เติม /v1 ให้เมื่อยังไม่มี แล้วต่อ path มาตรฐาน
 * path  = ต่อ path ที่ผู้ใช้กรอกเอง โดยไม่เติมอะไรทั้งสิ้น
 * exact = ยิงไปที่ URL นั้นตรง ๆ
 */
function resolveLlmUrl(kind) {
    const s = settings();
    const base = String(s.llm_url || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!base) throw new PxiError('ยังไม่ได้ตั้งค่า Base URL ของ Connection 1', { stage: '1' });
    const mode = s.llm_url_mode || 'auto';

    if (mode === 'exact') return kind === 'models' ? null : base;

    if (mode === 'path') {
        const path = kind === 'models' ? s.llm_models_path : s.llm_gen_path;
        if (kind === 'models' && !String(path || '').trim()) return null;
        return joinUrl(base, path);
    }

    return buildUrl(base, kind === 'models' ? 'models' : 'chat/completions');
}

function resolveImageUrl(kind) {
    const s = settings();
    const base = String(s.img_url || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!base) throw new PxiError('ยังไม่ได้ตั้งค่า Base URL ของ Connection 2', { stage: '2' });
    const mode = s.img_url_mode || 'auto';

    if (mode === 'exact') {
        if (kind === 'models') return null;
        return base;
    }

    if (mode === 'path') {
        const path = kind === 'models' ? s.img_models_path : s.img_gen_path;
        if (kind === 'models' && !String(path || '').trim()) return null;
        return joinUrl(base, path);
    }

    return buildUrl(base, kind === 'models' ? 'models' : 'images/generations');
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

/** เบราว์เซอร์บล็อก http:// เมื่อหน้าเว็บเป็น https:// (mixed content) — ตรวจก่อนยิงเพื่อให้ error อ่านรู้เรื่อง */
function assertReachableScheme(url, stage) {
    try {
        const target = new URL(url, location.href);
        if (location.protocol === 'https:' && target.protocol === 'http:') {
            throw new PxiError('เบราว์เซอร์บล็อกคำขอนี้ (mixed content)', {
                stage,
                hints: [
                    `หน้า SillyTavern เปิดผ่าน https:// แต่ URL ปลายทางเป็น http:// — เบราว์เซอร์จะบล็อกทิ้งก่อนถึงเซิร์ฟเวอร์เสมอ`,
                    'แก้ด้วยการเปลี่ยน Base URL เป็น https:// (ถ้า proxy รองรับ) หรือเปิด SillyTavern ผ่าน http:// แทน',
                    'ถ้า proxy เปิดเฉพาะพอร์ตแปลก ๆ ผ่าน http ให้หา endpoint แบบ https ของเจ้านั้นมาใช้',
                ],
            });
        }
    } catch (error) {
        if (error instanceof PxiError) throw error;
    }
}

async function requestRaw(url, options, timeoutSec, stage) {
    assertReachableScheme(url, stage);
    const controller = new AbortController();
    activeControllers.add(controller);

    // นับ timeout เฉพาะเวลาที่หน้าเว็บเปิดอยู่จริง
    // ถ้าพับจอไปเล่นแอปอื่น timer ของเบราว์เซอร์จะถูกหน่วงแล้วยิงรัวตอนกลับมา
    // ถ้า abort ตามนั้นตรง ๆ คำขอที่ยังวิ่งอยู่จะถูกตัดทิ้งทันทีที่ผู้ใช้กลับมา
    const limitMs = Math.max(5, Number(timeoutSec) || 60) * 1000;
    const startedAt = Date.now();
    const hiddenAtStart = hiddenElapsed();
    const timer = setInterval(() => {
        const activeMs = (Date.now() - startedAt) - (hiddenElapsed() - hiddenAtStart);
        if (activeMs >= limitMs) controller.abort();
    }, 1000);
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
        if (error?.name === 'AbortError') {
            if (userAborted) throw new PxiError('ยกเลิกโดยผู้ใช้', { stage, hints: ['กดปุ่ม Stop ระหว่างกำลังทำงาน'] });
            throw new PxiError('หมดเวลาเชื่อมต่อ (timeout)', { stage, hints: ['เพิ่มค่า Timeout ในหน้าตั้งค่า หรือลด steps / ขนาดภาพลง'] });
        }
        if (userAborted) throw new PxiError('ยกเลิกโดยผู้ใช้', { stage, hints: ['กดปุ่ม Stop ระหว่างกำลังทำงาน'] });
        throw new PxiError(String(error?.message || error), { stage, status: 0 });
    } finally {
        clearInterval(timer);
        activeControllers.delete(controller);
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
/**
 * สรรพนามบุรุษที่ 2 เท่านั้น = ผู้บรรยายกำลังพูดถึงผู้ใช้ในฉาก
 * ไม่รวมบุรุษที่ 1 (ผม/ฉัน/เรา) เพราะในบทบรรยายมักหมายถึงตัวละครเอง ไม่ใช่ผู้ใช้
 * ไม่รวม "เธอ" เพราะภาษาไทยใช้เป็นบุรุษที่ 3 (หล่อน) ได้บ่อยพอ ๆ กัน
 */
const USER_PRONOUNS = /\b(you|your|yours|yourself)\b|คุณ|นาย|แก|มึง/i;

/**
 * ผู้ใช้อยู่ในเฟรมของข้อความล่าสุดหรือไม่
 * ใช้ตัดสินว่าจะส่งบล็อก persona ไปให้ Connection 1 ไหม
 */
function isUserInScene(macros) {
    const context = getContext();
    const scene = String(macros.lastMessage || '');
    if (!scene) return false;

    const name = String(context.name1 || '').trim();
    if (name && new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(scene)) return true;

    // ข้อความของผู้ใช้เอง = ผู้ใช้กำลังลงมือทำอะไรอยู่ในฉาก
    if (/^\s*[^:\n]{1,40}:/.test(scene) && name && scene.trimStart().toLowerCase().startsWith(name.toLowerCase())) return true;

    return USER_PRONOUNS.test(scene);
}

function shouldIncludePersona(macros) {
    const mode = settings().persona_mode || 'auto';
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return isUserInScene(macros);
}

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
        case 'manga':
            parts.push(`Character: ${macros.char} • User persona: ${macros.user}`);
            push('Character appearance', macros.description);
            push(`Persona appearance of ${macros.user}`, macros.persona);
            push('Scene to break into panels (earliest first)', macros.chat);
            push('Final beat', macros.lastMessage);
            break;
        case 'last': {
            const withPersona = shouldIncludePersona(macros);
            parts.push(withPersona
                ? `Character: ${macros.char} • User persona: ${macros.user}`
                : `Character: ${macros.char} • The user's character (${macros.user}) is NOT in this shot - do not draw them and do not count them.`);
            push('Character appearance', macros.description);
            if (withPersona) push(`Persona appearance of ${macros.user}`, macros.persona);
            push('Recent scene', macros.chat);
            push('Latest message (draw THIS)', macros.lastMessage);
            break;
        }
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
    const useGpt = targetIsGpt();
    const template = useGpt ? gptTemplate(mode) : (s.templates[mode] || s.templates.free);

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

    const glossary = String(s.tag_hints || '').trim();
    if (glossary) {
        userMessage += `\n\n--- Pinned tag glossary (authoritative - copy these spellings verbatim when the character appears) ---\n${glossary}`;
    }
    if (macros.extra) {
        userMessage += `\n\n--- Extra instruction (override the rules above if they conflict) ---\n${macros.extra}`;
    }
    userMessage += '\n\nWrite the image prompt now.';

    const messages = [];
    let system = substitute(template.sys).trim();
    // สไตล์ยึดจากหมวด ⑤ Image Parameters เท่านั้น ไม่ผูกกับชุด template ที่กำลังเปิดดู
    if (paramsAreGpt()) system = `${system}\n\n${gptStyleText(mode)}`;
    const vibe = vibeText();
    if (vibe) system = `${system}\n\nRecurring look to keep consistent across images: ${vibe}`;
    else if (mode === 'manga') system = `${system}\n\n${mangaStyleText()}`;
    if (settings().llm_can_search) system = `${system}\n\n${SEARCH_RULE}`;
    if (settings().cot_mode === 'light') system = `${system}\n\n${PLANNING_RULE}`;
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: userMessage.trim() || macros.chat });
    return messages;
}

/** รอบวิเคราะห์ของโหมด CoT หนัก */
async function buildAnalysisMessages(mode, extra) {
    const macros = await buildMacros(extra);
    const glossary = String(settings().tag_hints || '').trim();
    let content = buildAutoUserMessage(mode, macros);
    if (glossary) {
        content += `\n\n--- Pinned tag glossary (authoritative - copy these spellings verbatim when the character appears) ---\n${glossary}`;
    }
    const analysisSystem = settings().llm_can_search
        ? `${ANALYSIS_SYSTEM}\n\n${SEARCH_RULE}`
        : ANALYSIS_SYSTEM;
    return [
        { role: 'system', content: analysisSystem },
        { role: 'user', content: content + '\n\nAnalyse the scene now.' },
    ];
}

/* ================================================================== */
/* Stage 1                                                             */
/* ================================================================== */

function normalizePrompt(text) {
    let out = String(text || '').trim();
    out = out.replace(/^```[a-z]*\s*|\s*```$/gi, '');
    out = out.replace(/<(think|thinking|reasoning|planning|plan|analysis)[\s\S]*?<\/\1>/gi, '');
    out = out.replace(/^[\s\S]*<\/(?:think|thinking|reasoning|planning|plan|analysis)>/i, '');
    out = out.replace(/^\s*(prompt|image prompt|output)\s*[:：]\s*/i, '');
    // ผลพลอยได้จากโมเดลที่ค้นเว็บได้: อ้างอิง เชิงอรรถ ลิงก์ และบล็อกแหล่งที่มา
    out = out.replace(/\n\s*(sources?|references?|citations?|แหล่งที่มา|อ้างอิง)\s*[:：]?[\s\S]*$/i, '');
    out = out.replace(/\[\^?\d+\](?:\([^)]*\))?/g, '');
    out = out.replace(/\u3010[^\u3011]{0,80}\u3011/g, '');
    out = out.replace(/\[([^\]]+)\]\((?:https?:|\/)[^)]*\)/g, '$1');
    out = out.replace(/\bhttps?:\/\/\S+/gi, '');
    out = out.replace(/\((?:\s*(?:source|ref|cite)[^)]*)\)/gi, '');
    out = out.replace(/^["'“”]+|["'“”]+$/g, '');
    out = out.replace(/\s*\n+\s*/g, ', ').replace(/[ \t]{2,}/g, ' ').replace(/\s+,/g, ',').replace(/\s*,\s*,+/g, ', ');
    // ตัดคอมมาที่ค้างหัวหรือท้ายหลังตัดบล็อก planning ออก
    return out.replace(/^[\s,]+|[\s,]+$/g, '').trim();
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
            const result = await service.sendRequest(profileId, messages, tokenBudget(), {
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
        responseLength: tokenBudget(),
        quietName: 'PromptMaker',
    });
    return { text, raw: String(text || '').slice(0, 800), finish: '' };
}

/**
 * ฐาน URL ที่เซิร์ฟเวอร์ ST รับ relay ได้
 * endpoint ฝั่ง ST เป็น `${base}/chat/completions` ตายตัว
 * ถ้า URL ที่ตั้งไว้ไม่ได้ลงท้ายแบบนั้น ต้องยิงตรงจากเบราว์เซอร์แทน
 */
function relayBaseUrl() {
    let url;
    try { url = resolveLlmUrl('generate'); } catch { return null; }
    if (!url) return null;
    const match = String(url).match(/^(.*)\/chat\/completions\/?$/i);
    return match ? match[1] : null;
}

/** ยิงผ่านเซิร์ฟเวอร์ ST (Node) เพื่อให้คำขอไม่ตายตอนพับจอ */
async function stage1ViaRelay(messages, base) {
    const context = getContext();
    const s = settings();
    const body = {
        chat_completion_source: 'openai',
        reverse_proxy: base,
        proxy_password: String(s.llm_key || '').trim(),
        model: s.llm_model || undefined,
        messages,
        max_tokens: tokenBudget(),
        temperature: Number.isFinite(Number(s.llm_temp)) ? Number(s.llm_temp) : 0.7,
        stream: false,
    };
    const raw = await requestRaw('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify(body),
    }, s.llm_timeout, '1');

    let data;
    try { data = JSON.parse(raw); } catch { throw new PxiError('เซิร์ฟเวอร์ ST ตอบกลับไม่ใช่ JSON', { stage: '1', raw }); }
    if (data?.error) {
        throw new PxiError(String(data.error?.message || 'คำขอถูกปฏิเสธ'), {
            stage: '1',
            raw,
            hints: ['ตรวจ URL และคีย์ของ Connection 1', 'ดู log ในหน้าต่าง Termux ที่รัน SillyTavern เพื่อดูข้อความจริงจากปลายทาง'],
        });
    }

    const choice = data?.choices?.[0];
    let text = choice?.message?.content ?? choice?.text ?? data?.content ?? '';
    if (Array.isArray(text)) text = text.map(p => p?.text || '').join(' ');
    return { text, raw: JSON.stringify(data).slice(0, 1200), finish: choice?.finish_reason || choice?.native_finish_reason };
}

async function stage1ViaCustom(messages) {
    const s = settings();
    if (s.c1_via_server) {
        const base = relayBaseUrl();
        if (base) return await stage1ViaRelay(messages, base);
        console.warn(LOG, 'โหมด URL นี้ relay ผ่านเซิร์ฟเวอร์ ST ไม่ได้ ยิงตรงจากเบราว์เซอร์แทน');
    }
    const url = resolveLlmUrl('generate');
    const data = await requestJson(url, {
        method: 'POST',
        headers: authHeaders(s.llm_key),
        body: JSON.stringify({
            model: s.llm_model || undefined,
            messages,
            max_tokens: tokenBudget(),
            temperature: Number.isFinite(Number(s.llm_temp)) ? Number(s.llm_temp) : 0.7,
            stream: false,
        }),
    }, s.llm_timeout, '1');

    const choice = data?.choices?.[0];
    let text = choice?.message?.content ?? choice?.text ?? data?.content ?? '';
    if (Array.isArray(text)) text = text.map(p => p?.text || '').join(' ');
    return { text, raw: JSON.stringify(data).slice(0, 1200), finish: choice?.finish_reason || choice?.native_finish_reason };
}

function tokenBudget() {
    const s = settings();
    const base = Math.max(16, Number(s.llm_max_tokens) || 600);
    return s.cot_mode === 'light' ? Math.round(base * 1.8) : base;
}

async function callStage1(messages) {
    const s = settings();
    return s.c1_source === 'custom' ? await stage1ViaCustom(messages) : await stage1ViaProfile(messages);
}

async function stage1GeneratePrompt(mode, extra) {
    const s = settings();
    let extraText = String(extra || '');

    if (s.cot_mode === 'heavy') {
        setProgress('analyse');
        setStatus('① รอบที่ 1 — กำลังวิเคราะห์ฉาก...');
        const analysis = await callStage1(await buildAnalysisMessages(mode, extraText));
        const notes = String(analysis.text || '').trim();
        if (notes) {
            console.log(LOG, 'scene analysis', notes);
            lastAnalysis = notes;
            extraText = `${extraText}\n\n--- Scene analysis (already worked out, follow it) ---\n${notes}`.trim();
        }
        setProgress('prompt');
        setStatus('① รอบที่ 2 — กำลังเขียนแท็ก...');
    }

    const messages = await buildStage1Messages(mode, extraText);
    const result = await callStage1(messages);
    if (s.cot_mode === 'light') {
        const planning = String(result.text || '').match(/<planning>([\s\S]*?)<\/planning>/i);
        if (planning) { lastAnalysis = planning[1].trim(); console.log(LOG, 'planning', lastAnalysis); }
    }
    const prompt = targetIsGpt() ? normaliseProse(result.text) : normalizePrompt(result.text);
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

/** ชุด template ที่กำลังใช้/กำลังแก้ (หมวด ②) — อิสระจากชุดพารามิเตอร์ */
function targetIsGpt() {
    return settings().tpl_engine === 'gpt';
}

/** ชุดพารามิเตอร์ที่จะถูกส่งไป Connection 2 (หมวด ⑤) — อิสระจากชุด template */
function paramsAreGpt() {
    return settings().param_engine === 'gpt';
}

function gptTemplate(mode) {
    const saved = settings().gpt_templates || {};
    const entry = saved[mode];
    if (entry && typeof entry.sys === 'string') return entry;
    return GPT_TEMPLATES[mode] || GPT_TEMPLATES.free;
}

/** สไตล์ที่ใช้จริงของรอบนี้ (override ชั่วคราวจาก popup มาก่อน) */
let runStyleOverride = '';

function styleKeyFor(mode) {
    const s = settings();
    if (s.style_per_mode && s.gpt_style_modes?.[mode]) return s.gpt_style_modes[mode];
    return s.gpt_style;
}

function gptStyleText(mode = '') {
    const s = settings();
    const key = runStyleOverride || styleKeyFor(mode);
    if (key === 'custom') {
        const custom = String(s.gpt_style_custom || '').trim();
        if (custom) return custom.toLowerCase().startsWith('style:') ? custom : `Style: ${custom}`;
    }
    return (GPT_STYLE_PRESETS[key] || GPT_STYLE_PRESETS.realistic).text;
}

/** GPT-Image รับ prompt เป็นข้อความบรรยาย จึงห้ามยุบบรรทัดเป็นคอมมาแบบฝั่งแท็ก */
function normaliseProse(text) {
    let out = String(text || '').trim();
    out = out.replace(/^```[a-z]*\s*|\s*```$/gi, '');
    out = out.replace(/<(think|thinking|reasoning|planning|plan|analysis)[\s\S]*?<\/\1>/gi, '');
    out = out.replace(/^[\s\S]*<\/(?:think|thinking|reasoning|planning|plan|analysis)>/i, '');
    out = out.replace(/^\s*(prompt|image prompt|output|description)\s*[:：]\s*/i, '');
    out = out.replace(/\n\s*(sources?|references?|citations?|แหล่งที่มา|อ้างอิง)\s*[:：]?[\s\S]*$/i, '');
    out = out.replace(/\[\^?\d+\](?:\([^)]*\))?/g, '');
    out = out.replace(/\u3010[^\u3011]{0,80}\u3011/g, '');
    out = out.replace(/\[([^\]]+)\]\((?:https?:|\/)[^)]*\)/g, '$1');
    out = out.replace(/\bhttps?:\/\/\S+/gi, '');
    out = out.replace(/^["'“”]+|["'“”]+$/g, '');
    return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function composePrompt(prompt) {
    const s = settings();
    const vibe = vibeText();
    // prefix/suffix เป็นแท็กคุณภาพของ NovelAI ไม่มีความหมายกับ GPT-Image
    if (paramsAreGpt()) return String(prompt || '').trim();
    return [s.prefix, prompt, vibe, s.suffix].map(p => String(p || '').trim()).filter(Boolean).join(', ');
}

const SIZE_PRESETS = [
    ['768x1344', '768 x 1344  (3:4 แนวตั้ง)'],
    ['1344x768', '1344 x 768  (4:3 แนวนอน)'],
    ['832x1216', '832 x 1216  (2:3 แนวตั้ง, NAI Portrait)'],
    ['1216x832', '1216 x 832  (3:2 แนวนอน, NAI Landscape)'],
    ['1024x1024', '1024 x 1024  (1:1 จัตุรัส)'],
    ['896x1152', '896 x 1152  (3:4 แนวตั้ง เล็ก)'],
    ['1152x896', '1152 x 896  (4:3 แนวนอน เล็ก)'],
    ['640x1536', '640 x 1536  (9:21 แนวตั้งสูง)'],
    ['1536x640', '1536 x 640  (21:9 แนวนอนกว้าง)'],
    ['1024x1536', '1024 x 1536  (2:3 ใหญ่, กิน Anlas)'],
    ['1536x1024', '1536 x 1024  (3:2 ใหญ่, กิน Anlas)'],
    ['1472x1472', '1472 x 1472  (1:1 ใหญ่, กิน Anlas)'],
];

/** ปัดลงเป็นทวีคูณของ 64 ตามที่โมเดล diffusion ต้องการ */
function snap64(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 64) return fallback;
    const snapped = Math.round(number / 64) * 64;
    return Math.min(2048, Math.max(64, snapped));
}

function parseSize() {
    const match = String(settings().size || '').match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
    if (!match) return { width: 768, height: 1344 };
    return { width: snap64(match[1], 768), height: snap64(match[2], 1344) };
}

/** ขนาดที่จะถูกส่งจริง หลังปัด 64 และหลัง Anlas guard */
function resolvedSize() {
    const base = parseSize();
    const steps = Math.min(50, Math.max(1, Number(settings().steps) || 28));
    return applyAnlasGuard(base.width, base.height, steps);
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
    const { width, height, steps } = resolvedSize();
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
        sm_dyn: false,
        seed: Number(s.seed) >= 0 ? Number(s.seed) : undefined,
    };
    console.log(LOG, 'NovelAI payload', { ...body, prompt: body.prompt.slice(0, 80) + '…' });
    const raw = await requestRaw('/api/novelai/generate-image', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify(body),
    }, s.img_timeout, '2');
    const clean = String(raw || '').trim().replace(/^"|"$/g, '');
    if (!clean) throw new PxiError('NovelAI ส่งรูปกลับมาว่างเปล่า', { stage: '2' });
    return { kind: 'base64', value: clean };
}

const GPT_MODELS = [
    ['gpt-image-1', 'gpt-image-1'],
    ['gpt-image-1-mini', 'gpt-image-1-mini'],
    ['gpt-image-1.5', 'gpt-image-1.5'],
    ['gpt-image-2', 'gpt-image-2 (ขนาดอิสระ)'],
    ['gpt-image-2-2026-04-21', 'gpt-image-2-2026-04-21'],
    ['chatgpt-image-latest', 'chatgpt-image-latest'],
];

const GPT_SIZE_PRESETS = [
    ['auto', 'auto (ให้โมเดลเลือกเอง)'],
    ['1024x1536', '1024 x 1536  (2:3 แนวตั้ง)'],
    ['1536x1024', '1536 x 1024  (3:2 แนวนอน)'],
    ['1024x1024', '1024 x 1024  (1:1 จัตุรัส)'],
    ['1152x1536', '1152 x 1536  (3:4 แนวตั้ง) — gpt-image-2'],
    ['1536x1152', '1536 x 1152  (4:3 แนวนอน) — gpt-image-2'],
    ['1088x1920', '1088 x 1920  (9:16 แนวตั้ง) — gpt-image-2'],
    ['1920x1088', '1920 x 1088  (16:9 แนวนอน) — gpt-image-2'],
    ['2560x1440', '2560 x 1440  (16:9 ใหญ่) — gpt-image-2'],
    ['1440x2560', '1440 x 2560  (9:16 ใหญ่) — gpt-image-2'],
];

/** ส่งขนาดตามที่ผู้ใช้กรอกตรง ๆ ไม่ดัดค่า ไม่ล็อกสเปก */
function resolveGptSize() {
    const raw = String(settings().gpt_size || 'auto').trim().replace(/\s+/g, '').toLowerCase();
    if (!raw || raw === 'auto') return { size: 'auto', warnings: [] };
    const match = raw.match(/^(\d{2,5})[x×*](\d{2,5})$/);
    if (!match) return { size: 'auto', warnings: [`ขนาด "${settings().gpt_size}" อ่านไม่ออก จะส่ง auto แทน`] };
    return { size: `${match[1]}x${match[2]}`, warnings: [] };
}

async function stage2GptImage(prompt) {
    const s = settings();
    const url = resolveImageUrl('generate');
    const { size, warnings } = resolveGptSize();
    for (const warning of warnings) console.warn(LOG, 'GPT-Image:', warning);

    const format = ['png', 'jpeg', 'webp'].includes(s.gpt_output_format) ? s.gpt_output_format : 'png';
    const body = {
        model: s.gpt_model || 'gpt-image-2',
        prompt: composePrompt(prompt).slice(0, 32000),
        size,
        output_format: format,
    };

    if (['low', 'medium', 'high', 'auto'].includes(s.gpt_quality)) body.quality = s.gpt_quality;
    body.n = Math.min(10, Math.max(1, Number(s.gpt_n) || 1));
    if (format !== 'png') {
        const compression = Number(s.gpt_output_compression);
        if (Number.isFinite(compression)) body.output_compression = Math.min(100, Math.max(0, compression));
    }
    if (s.gpt_background && s.gpt_background !== 'auto') body.background = s.gpt_background;
    if (s.gpt_moderation === 'low') body.moderation = 'low';
    Object.assign(body, parseExtraBody());

    console.log(LOG, 'GPT-Image payload', { ...body, prompt: body.prompt.slice(0, 120) + '…' });
    const data = await requestJson(url, {
        method: 'POST',
        headers: authHeaders(s.img_key),
        body: JSON.stringify(body),
    }, s.img_timeout, '2');
    return extractImage(data);
}

async function stage2Custom(prompt) {
    const s = settings();
    const url = resolveImageUrl('generate');
    const { width, height } = parseSize();
    console.log(LOG, 'custom image request', { url, width, height, model: s.img_model });
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
    if (settings().c2_source === 'nai') return await stage2NovelAI(prompt);
    return paramsAreGpt() ? await stage2GptImage(prompt) : await stage2Custom(prompt);
}

/**
 * ยิงเจนรูป ถ้าพลาด (โดยเฉพาะโดนฟิลเตอร์) จะเด้ง popup ให้แก้ prompt แล้วลองใหม่
 * กดยกเลิกใน popup แก้ prompt เมื่อไหร่ถึงจะเลิก
 */
const MAX_GENERATE_ATTEMPTS = 5;

async function generateWithRetry(prompt, { quiet = false } = {}) {
    let current = String(prompt || '').trim();
    for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
        try {
            setProgress('image', attempt > 1 ? `ครั้งที่ ${attempt}` : '');
            setStatus(attempt === 1 ? '② กำลังเจนรูป...' : `② กำลังเจนรูป (ครั้งที่ ${attempt})...`);
            if (!quiet && attempt === 1) notify('กำลังเจนรูป (Connection 2)...');
            const image = await stage2GenerateImage(current);
            return { image, prompt: current };
        } catch (error) {
            console.error(LOG, error);
            setStatus(String(error?.message || error), true);
            if (userAborted) { setStatus('หยุดแล้ว'); return null; }
            const last = attempt >= MAX_GENERATE_ATTEMPTS;
            await showErrorPopup(error, { retry: !last });
            if (last) {
                notify(`ลองแล้ว ${MAX_GENERATE_ATTEMPTS} ครั้งยังไม่ผ่าน หยุดไว้ก่อน`, 'warning');
                setStatus(`หยุดหลังลอง ${MAX_GENERATE_ATTEMPTS} ครั้ง — ลองแก้การตั้งค่าแล้วเริ่มใหม่`, true);
                return null;
            }
            const edited = await editPrompt(current, `เจนไม่ผ่าน — แก้ prompt แล้วลองใหม่ (ครั้งที่ ${attempt + 1} จาก ${MAX_GENERATE_ATTEMPTS})`);
            if (!edited) { setStatus('ยกเลิกแล้ว'); return null; }
            current = edited;
        }
    }
    return null;
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
    const name = context.name2 || 'System';

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
        // ซ่อนจาก prompt ของ AI เสมอ (เทียบเท่า /hide) แท็กภาพไม่ควรถูกป้อนกลับเข้าบทสนทนา
        is_system: true,
        send_date: context.humanizedDateTime ? context.humanizedDateTime() : new Date().toLocaleString(),
        mes: prompt,
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
/* แถบสถานะ + ปุ่ม Stop ในช่องพิมพ์ของ SillyTavern                     */
/* ================================================================== */

/** แต่ละขั้นผูกกับ connection ไหน และคืบหน้าเท่าไรใน connection นั้น */
const PROGRESS_STEPS = {
    style:   { phase: 'c1', label: 'เลือกสไตล์', percent: 10 },
    analyse: { phase: 'c1', label: 'วิเคราะห์ฉาก', percent: 45 },
    prompt:  { phase: 'c1', label: 'เขียน prompt', percent: 80 },
    review:  { phase: 'c1', label: 'รอตรวจ prompt', percent: 100 },
    image:   { phase: 'c2', label: 'เจนรูป', percent: 65 },
    upload:  { phase: 'c2', label: 'บันทึกรูป', percent: 90 },
    done:    { phase: 'c2', label: 'เสร็จสิ้น', percent: 100 },
};

function ensureProgressUi() {
    const form = document.getElementById('rightSendForm');
    if (form && !document.getElementById('pxi_stop')) {
        const stop = document.createElement('div');
        stop.id = 'pxi_stop';
        stop.className = 'pxi-stop pxi-hidden';
        stop.title = 'หยุดการสร้างภาพของ Proxy Image Gen';
        stop.innerHTML = '<i class="fa-solid fa-circle-stop"></i>';
        stop.addEventListener('click', () => {
            abortActiveRequests();
            notify('หยุดการทำงานแล้ว', 'warning');
        });
        const sendButton = document.getElementById('send_but');
        if (sendButton) form.insertBefore(stop, sendButton);
        else form.append(stop);
    }

    const holder = document.getElementById('send_form');
    if (holder && !document.getElementById('pxi_progress')) {
        const bar = document.createElement('div');
        bar.id = 'pxi_progress';
        bar.className = 'pxi-progress pxi-hidden';
        bar.innerHTML = '<div class="pxi-progress-track"><div class="pxi-progress-fill"></div></div><span class="pxi-progress-text"></span>';
        holder.prepend(bar);
    }
}

/** อัปเดตแถบสถานะ ส่ง null เพื่อซ่อน */
function setProgress(step, detail = '') {
    ensureProgressUi();
    const bar = document.getElementById('pxi_progress');
    const stop = document.getElementById('pxi_stop');
    if (!bar) return;

    if (!step) {
        bar.classList.add('pxi-hidden');
        stop?.classList.add('pxi-hidden');
        return;
    }

    const info = PROGRESS_STEPS[step] || { phase: 'c1', label: step, percent: 0 };
    bar.classList.remove('pxi-hidden');
    bar.classList.toggle('pxi-phase-c2', info.phase === 'c2');
    stop?.classList.toggle('pxi-hidden', step === 'done');

    const fill = bar.querySelector('.pxi-progress-fill');
    const text = bar.querySelector('.pxi-progress-text');
    if (fill) fill.style.width = `${info.percent}%`;
    const prefix = info.phase === 'c2' ? '②' : '①';
    if (text) text.textContent = detail ? `${prefix} ${info.label} · ${detail}` : `${prefix} ${info.label}`;
}

/* ================================================================== */
/* Pipeline                                                            */
/* ================================================================== */

function mergeExtra(extra) {
    return [String(settings().extra_instruction || '').trim(), String(extra || '').trim()]
        .filter(Boolean).join('\n');
}

/**
 * ถามค่าที่ยังไม่ได้สั่งให้จำ ก่อนเริ่มเจน — รวมทุกอย่างไว้ใน popup เดียว
 * คืน null เมื่อผู้ใช้กดยกเลิก, คืน {} เมื่อไม่มีอะไรต้องถาม
 */
async function askBeforeGenerate(mode) {
    const context = getContext();
    const s = settings();

    const wantVibe = (s.vibes || []).length > 0 && !s.vibe_remember;
    const wantStyle = paramsAreGpt() && !s.remember_style;
    const wantManga = mode === 'manga' && !paramsAreGpt() && !s.manga_style_remember;
    if (!wantVibe && !wantStyle && !wantManga) return {};

    const root = document.createElement('div');
    root.className = 'pxi-stylebox';

    const title = document.createElement('h3');
    title.textContent = 'ก่อนสร้างภาพ';
    const hint = document.createElement('div');
    hint.className = 'pxi-hint';
    hint.textContent = `โหมด ${DEFAULT_TEMPLATES[mode]?.label || mode} — ค่าที่เลือกจะถูกส่งไปกับ prompt`;
    root.append(title, hint);

    const addLabel = (text) => {
        const label = document.createElement('div');
        label.className = 'pxi-stylebox-label';
        label.textContent = text;
        root.append(label);
    };

    let vibeSelect = null;
    if (wantVibe) {
        addLabel('Vibe (ชุดแท็กที่บันทึกไว้)');
        vibeSelect = document.createElement('select');
        vibeSelect.className = 'text_pole';
        const none = document.createElement('option');
        none.value = 'none';
        none.textContent = '⟨ไม่ใช้ vibe⟩';
        vibeSelect.append(none);
        for (const vibe of s.vibes) {
            const option = document.createElement('option');
            option.value = vibe.id;
            option.textContent = vibe.name;
            vibeSelect.append(option);
        }
        vibeSelect.value = s.vibe_active || 'none';
        root.append(vibeSelect);
    }

    let styleSelect = null;
    if (wantStyle) {
        addLabel('สไตล์ภาพ');
        styleSelect = document.createElement('select');
        styleSelect.className = 'text_pole';
        for (const key of GPT_STYLE_ORDER) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = GPT_STYLE_PRESETS[key].label;
            styleSelect.append(option);
        }
        if (String(s.gpt_style_custom || '').trim()) {
            const option = document.createElement('option');
            option.value = 'custom';
            option.textContent = 'กำหนดเอง (ตามที่เขียนไว้ในหมวด ⑤)';
            styleSelect.append(option);
        }
        styleSelect.value = styleKeyFor(mode);
        root.append(styleSelect);
    }

    let mangaSelect = null;
    if (wantManga) {
        addLabel('หน้าการ์ตูนแบบไหน');
        mangaSelect = document.createElement('select');
        mangaSelect.className = 'text_pole';
        for (const key of MANGA_STYLE_ORDER) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = MANGA_STYLE_PRESETS[key].label;
            mangaSelect.append(option);
        }
        mangaSelect.value = mangaStyleKey();
        root.append(mangaSelect);
    }

    const rememberLabel = document.createElement('label');
    rememberLabel.className = 'checkbox_label';
    const remember = document.createElement('input');
    remember.type = 'checkbox';
    const rememberText = document.createElement('span');
    rememberText.textContent = 'จำค่าเหล่านี้ไว้ ไม่ต้องถามอีก (ยกเลิกได้ที่หมวด ⑤)';
    rememberLabel.append(remember, rememberText);
    root.append(rememberLabel);

    const ok = await context.callGenericPopup(root, context.POPUP_TYPE.CONFIRM, '', {
        okButton: 'สร้างภาพ',
        cancelButton: 'ยกเลิก',
    });
    if (!ok) return null;

    const picked = {
        vibe: vibeSelect ? vibeSelect.value : undefined,
        style: styleSelect ? styleSelect.value : undefined,
        manga: mangaSelect ? mangaSelect.value : undefined,
    };

    if (remember.checked) {
        if (picked.vibe !== undefined) {
            s.vibe_active = picked.vibe === 'none' ? '' : picked.vibe;
            s.vibe_remember = true;
        }
        if (picked.style !== undefined) {
            s.remember_style = true;
            if (s.style_per_mode) {
                if (!s.gpt_style_modes || typeof s.gpt_style_modes !== 'object') s.gpt_style_modes = {};
                s.gpt_style_modes[mode] = picked.style;
            } else {
                s.gpt_style = picked.style;
            }
        }
        if (picked.manga !== undefined) {
            s.manga_style = picked.manga;
            s.manga_style_remember = true;
        }
        loadSettingsToUi();
        context.saveSettingsDebounced();
    }
    return picked;
}

async function runPipeline({ mode = 'free', rawPrompt = '', extra = '', quiet = false } = {}) {
    const s = settings();
    if (!s.enabled) { notify('Extension ถูกปิดอยู่', 'warning'); return null; }
    if (isBusy) { notify('กำลังทำงานอยู่ กรุณารอสักครู่', 'warning'); return null; }
    isBusy = true;
    userAborted = false;
    hiddenTotal = 0;
    hiddenSince = document?.hidden ? Date.now() : 0;
    reacquireWakeLock();
    try {
        let prompt = String(rawPrompt || '').trim();
        const fromStage1 = !prompt;
        lastAnalysis = '';
        runStyleOverride = '';
        runMangaOverride = '';
        runVibeOverride = null;

        if (fromStage1) {
            setProgress('style');
            const picked = await askBeforeGenerate(mode);
            if (!picked) { setStatus('ยกเลิกแล้ว'); return null; }
            if (picked.vibe !== undefined) runVibeOverride = picked.vibe;
            if (picked.style !== undefined) runStyleOverride = picked.style;
            if (picked.manga !== undefined) runMangaOverride = picked.manga;
        }

        if (fromStage1) {
            setProgress('prompt', mode);
            setStatus(`① กำลังสร้าง prompt (${mode})...`);
            if (!quiet) notify('กำลังสร้าง prompt (Connection 1)...');
            prompt = await stage1GeneratePrompt(mode, mergeExtra(extra));
        }

        if (fromStage1 && s.edit_before) {
            setProgress('review');
            setStatus('⇄ รอตรวจ/แก้ prompt...');
            const title = lastAnalysis
                ? 'แก้ prompt ก่อนส่งไป Connection 2 (ดูผลวิเคราะห์ฉากได้ใน console)'
                : 'แก้ prompt ก่อนส่งไป Connection 2';
            const edited = await editPrompt(prompt, title);
            if (!edited) { setStatus('ยกเลิกแล้ว'); return null; }
            prompt = edited;
        }

        const result = await generateWithRetry(prompt, { quiet });
        if (!result) return null;
        setProgress('upload');
        const path = result.image.kind === 'base64' ? await uploadBase64(result.image.value) : result.image.value;
        await postImageMessage(path, result.prompt, mode);
        setProgress('done');
        setStatus('เสร็จสิ้น');
        return path;
    } catch (error) {
        console.error(LOG, error);
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
        return null;
    } finally {
        isBusy = false;
        runStyleOverride = '';
        runMangaOverride = '';
        runVibeOverride = null;
        userAborted = false;
        releaseWakeLock();
        setTimeout(() => setProgress(null), 900);
    }
}

/* ================================================================== */
/* Swipe → review & regenerate                                         */
/* ================================================================== */

/**
 * ST มี Image Generation ในตัวที่ดักปัดรูปเหมือนกัน ถ้า "Image Swipe Behavior"
 * ตั้งเป็น generate มันจะเจนรูปซ้อนด้วยค่าของมันเอง (ขนาด, negative, upscale คนละชุด)
 * ฟังก์ชันนี้สลับค่านั้นเป็น rollover เพื่อให้เหลือ extension นี้ทำงานคนเดียว
 */
function resolveOverswipeConflict({ silent = false } = {}) {
    const s = settings();
    const context = getContext();
    const power = context.powerUserSettings;
    if (!power || typeof power !== 'object') return false;
    const conflicted = power.image_overswipe === 'generate';

    const note = document.getElementById('pxi_swipe_note');
    if (!s.swipe_regen || !s.take_over_overswipe) {
        if (note) {
            note.classList.toggle('pxi-hidden', !conflicted || !s.swipe_regen);
            note.textContent = conflicted
                ? 'ตอนนี้ Image Generation ในตัวของ ST จะเจนรูปซ้อนตอนปัดด้วย (คนละชุดค่ากับที่ตั้งไว้ที่นี่) — ติ๊ก "ให้ extension นี้จัดการการปัดรูปคนเดียว" เพื่อปิด'
                : '';
        }
        return false;
    }

    if (!conflicted) {
        note?.classList.add('pxi-hidden');
        return false;
    }

    power.image_overswipe = 'rollover';
    try { context.saveSettingsDebounced(); } catch { /* ignore */ }
    if (note) {
        note.classList.remove('pxi-hidden');
        note.textContent = 'ปิด "Image Swipe Behavior: Generate" ของ ST ให้แล้ว — การปัดรูปจะใช้ค่าของ extension นี้เท่านั้น';
    }
    if (!silent) {
        notify('ปิดการเจนซ้ำของ Image Generation ในตัว ST ให้แล้ว', 'success');
        setStatus('พบว่า ST ตั้ง Image Swipe Behavior เป็น Generate อยู่ — เปลี่ยนเป็น Rollover ให้แล้วเพื่อไม่ให้เจนซ้อนกัน');
    }
    return true;
}

async function onImageSwiped({ message, direction }) {
    const s = settings();
    if (!s.enabled || !s.swipe_regen) return;
    resolveOverswipeConflict({ silent: true });
    if (direction !== 'right') return;
    if (!message?.extra?.pxi) return;
    if (isBusy) return;

    const media = message.extra.media;
    if (!Array.isArray(media) || media.length === 0) return;
    const index = Number(message.extra.media_index) || 0;
    if (index !== media.length - 1) return; // ปัดถึงใบสุดท้ายแล้วเท่านั้น

    // กันหน้าต่างแก้ prompt เด้งซ้ำเมื่อ IMAGE_SWIPED ยิงมาหลายครั้งระหว่างที่ popup ยังเปิดอยู่
    if (isSwipePromptOpen) return;
    isSwipePromptOpen = true;

    let edited;
    try {
        const previous = media[index]?.title || message.extra.pxi.prompt || '';
        edited = await editPrompt(previous, 'ตรวจและแก้ prompt แล้วเจนใบใหม่ (ปัดซ้ายเพื่อย้อนดูใบเก่า)');
    } finally {
        isSwipePromptOpen = false;
    }
    if (!edited) return;
    if (isBusy) { notify('กำลังทำงานอยู่ กรุณารอสักครู่', 'warning'); return; }

    isBusy = true;
    userAborted = false;
    reacquireWakeLock();
    try {
        notify('กำลังเจนรูปใบใหม่...');
        const result = await generateWithRetry(edited, { quiet: true });
        if (!result) return;
        const path = result.image.kind === 'base64' ? await uploadBase64(result.image.value) : result.image.value;
        media.push({ url: path, type: 'image', title: result.prompt, source: 'generated', generation_type: 'proxy_image_gen' });
        message.extra.media_index = media.length - 1;
        message.extra.pxi.prompt = result.prompt;
        try { await getContext().saveChat(); } catch { /* ignore */ }
        setStatus('เสร็จสิ้น');
    } catch (error) {
        console.error(LOG, error);
        setStatus(String(error?.message || error), true);
        await showErrorPopup(error);
    } finally {
        isBusy = false;
        userAborted = false;
        releaseWakeLock();
        setTimeout(() => setProgress(null), 900);
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
/** รายชื่อโมเดล NovelAI ที่มากับตัว extension — ผู้ใช้พิมพ์ชื่ออื่นเองได้เสมอ */
const NAI_MODELS_BUILTIN = [
    { id: 'nai-diffusion-4-5-full', label: 'NAI Diffusion Anime V4.5 (Full)' },
    { id: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion Anime V4.5 (Curated)' },
    { id: 'nai-diffusion-4-full', label: 'NAI Diffusion Anime V4 (Full)' },
    { id: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion Anime V4 (Curated)' },
    { id: 'nai-diffusion-3', label: 'NAI Diffusion Anime V3' },
    { id: 'nai-diffusion-furry-3', label: 'NAI Diffusion Furry V3' },
];

const NAI_QUALITY_SUFFIX = {
    'nai-diffusion-4-5-full': 'location, very aesthetic, masterpiece, no text',
    'nai-diffusion-4-5-curated': 'location, masterpiece, no text, -0.8::feet::, rating:general',
    'nai-diffusion-4-full': 'no text, best quality, very aesthetic, absurdres',
    'nai-diffusion-4-curated-preview': 'rating:general, amazing quality, very aesthetic, absurdres',
    'nai-diffusion-3': 'best quality, amazing quality, very aesthetic, absurdres',
    'nai-diffusion-furry-3': '{best quality}, {amazing quality}',
};

const NAI_REMOTE_NEGATIVE = {};

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
    const isCurated = model.includes('curated');

    // ขนาดภาพเป็นค่าเดียวที่ไม่แตะ ตามที่ผู้ใช้ตั้งไว้เอง
    s.prefix = '';
    s.suffix = NAI_QUALITY_SUFFIX[model] || NAI_QUALITY_SUFFIX['nai-diffusion-4-5-full'];
    s.negative = NAI_REMOTE_NEGATIVE[model]
        || (isV3 ? NAI_NEGATIVE.v3 : (isCurated ? NAI_NEGATIVE.curated : NAI_NEGATIVE.full));
    s.sampler = 'k_euler_ancestral';
    s.scheduler = 'karras';
    s.steps = 28;
    s.scale = isV3 ? 6 : 5;
    s.seed = -1;
    s.upscale_ratio = 1;
    s.variety_boost = !isV3;
    s.decrisper = false;
    s.sm = isV3;
    s.sm_dyn = false;
    s.anlas_guard = true;
    s.img_timeout = 180;
    s.extra_body = '';

    loadSettingsToUi();
    context.saveSettingsDebounced();
    notify('ใส่ค่าที่ NovelAI แนะนำสำหรับ ' + model + ' แล้ว (ไม่แตะขนาดภาพ)', 'success');
    setStatus('ใช้ค่าแนะนำของ ' + model + ' — ขนาดภาพคงไว้ที่ ' + (s.size || '-'));
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

function setC2State(text, tone = 'idle') {
    const el = document.getElementById('pxi_c2_state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('pxi-warn', tone === 'error');
    el.classList.toggle('pxi-ok', tone === 'ok');
}

function populateImageModels() {
    const select = document.getElementById('pxi_img_model_select');
    if (!select) return;
    const s = settings();
    const list = Array.isArray(s.img_models) ? s.img_models : [];
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '⟨เลือกโมเดล⟩' : '⟨ยังไม่ได้เชื่อมต่อ⟩';
    select.append(placeholder);

    for (const id of list) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        select.append(option);
    }
    select.value = list.includes(s.img_model) ? s.img_model : '';
}

/** ตรวจการเชื่อมต่อของ Connection 2 แล้วโหลดรายชื่อโมเดล */
async function connectC2() {
    const context = getContext();
    const s = settings();
    try {
        if (s.c2_source === 'nai') {
            setC2State('กำลังตรวจบัญชี NovelAI...');
            const response = await fetch('/api/novelai/status', { method: 'POST', headers: context.getRequestHeaders() });
            if (!response.ok) {
                throw new PxiError('เชื่อมต่อ NovelAI ไม่สำเร็จ', {
                    stage: '2',
                    status: response.status,
                    hints: [
                        'ยังไม่ได้บันทึกคีย์ NovelAI หรือคีย์ผิด — กรอกคีย์แล้วกดปุ่มบันทึกก่อน',
                        'บัญชีต้องมี subscription ที่ใช้งานอยู่',
                    ],
                });
            }
            const data = await response.json();
            const anlas = data?.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0;
            const bonus = data?.trainingStepsLeft?.purchasedTrainingSteps ?? 0;
            const unlimited = data?.perks?.unlimitedImageGeneration ?? false;
            const tier = data?.tier ?? '?';
            setC2State(`เชื่อมต่อแล้ว • NovelAI Tier ${tier} • Anlas ${anlas}${bonus ? ` (+${bonus})` : ''} • เจนรูปฟรี: ${unlimited ? 'ได้' : 'ไม่ได้'}`, 'ok');
            notify('เชื่อมต่อ NovelAI สำเร็จ', 'success');
            return;
        }

        const url = resolveImageUrl('models');
        if (!url) {
            const target = resolveImageUrl('generate');
            s.img_models = [];
            populateImageModels();
            context.saveSettingsDebounced();
            setC2State(`โหมดนี้ไม่ดึงรายชื่อโมเดล — จะยิงไปที่ ${target} โดยตรง ใช้ปุ่ม "ทดสอบเจนรูป" เพื่อยืนยัน`, 'ok');
            notify('ตั้งค่า URL แล้ว ใช้ปุ่มทดสอบเจนรูปเพื่อยืนยัน', 'success');
            return;
        }
        setC2State('กำลังเชื่อมต่อและดึงรายชื่อโมเดล...');
        const data = await requestJson(url, { method: 'GET', headers: authHeaders(s.img_key) }, 30, '2');
        const list = (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
            .map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean).sort();
        s.img_models = list;
        populateImageModels();
        context.saveSettingsDebounced();
        setC2State(list.length
            ? `เชื่อมต่อแล้ว • พบ ${list.length} โมเดล — เลือกจากรายการด้านล่าง`
            : 'เชื่อมต่อได้ แต่ endpoint ไม่ส่งรายชื่อโมเดลมา — พิมพ์ชื่อโมเดลเอง', 'ok');
        notify(list.length ? `เชื่อมต่อสำเร็จ พบ ${list.length} โมเดล` : 'เชื่อมต่อสำเร็จ แต่ไม่มีรายชื่อโมเดล', 'success');
    } catch (error) {
        setC2State(String(error?.message || error), 'error');
        await showErrorPopup(error);
    }
}

const ENDPOINT_CANDIDATES = [
    'images/generations',
    'v1/images/generations',
    'images/generation',
    'image/generations',
    'generate',
    'generate-image',
    'ai/generate-image',
    'txt2img',
    'sdapi/v1/txt2img',
    'v1/txt2img',
    'images',
];

/** ไล่ยิง path ที่พบบ่อยด้วย body ว่าง: 404 = ไม่มี, อย่างอื่น = มี endpoint อยู่ */
async function probeEndpoints() {
    const s = settings();
    const base = String(s.img_url || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!base) { notify('กรอก Base URL ก่อน', 'warning'); return; }

    const root = base.replace(KNOWN_ENDPOINTS, '');
    const seen = new Set();
    const targets = [];
    for (const path of ENDPOINT_CANDIDATES) {
        const url = joinUrl(root, path);
        if (!seen.has(url)) { seen.add(url); targets.push({ url, path }); }
    }

    setC2State(`กำลังไล่ตรวจ ${targets.length} path...`);
    const found = [];
    const results = [];
    for (const target of targets) {
        let label;
        try {
            assertReachableScheme(target.url, '2');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const response = await fetch(target.url, {
                method: 'POST',
                headers: authHeaders(s.img_key),
                body: '{}',
                signal: controller.signal,
            }).finally(() => clearTimeout(timer));
            label = `HTTP ${response.status}`;
            if (response.status !== 404) { found.push(target); label += ' ← มี endpoint นี้'; }
        } catch (error) {
            label = error?.name === 'AbortError' ? 'timeout' : 'ต่อไม่ได้';
        }
        results.push(`${label.padEnd(22)} ${target.url}`);
    }

    const context = getContext();
    const box = document.createElement('div');
    box.className = 'pxi-errbox';
    const title = document.createElement('h3');
    title.textContent = 'ผลการค้นหา endpoint';
    const summary = document.createElement('div');
    summary.className = 'pxi-err-reason';
    summary.textContent = found.length
        ? `พบ ${found.length} path ที่ตอบกลับ (ไม่ใช่ 404) — 400/401/422 ถือว่า endpoint มีอยู่จริง แค่ body ที่ส่งไปทดสอบไม่ถูกต้อง`
        : 'ไม่พบ path ที่ใช้ได้เลย — proxy ช่องนี้อาจยังไม่ได้เปิดบริการเจนรูป หรือใช้ path ที่ไม่อยู่ในรายการมาตรฐาน';
    const pre = document.createElement('pre');
    pre.className = 'pxi-preview';
    pre.textContent = results.join('\n');
    box.append(title, summary, pre);

    if (found.length) {
        const apply = document.createElement('div');
        apply.className = 'pxi-hint';
        apply.textContent = `แนะนำ: ตั้งโหมด URL เป็น "ใช้ URL นี้ตรง ๆ" แล้ววาง ${found[0].url} ลงช่อง Base URL`;
        box.append(apply);
    }

    setC2State(found.length ? `พบ endpoint ที่ตอบกลับ: ${found[0].url}` : 'ไม่พบ endpoint เจนรูปที่ใช้ได้', found.length ? 'ok' : 'error');
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: 'ปิด' });
}

function setC1State(text, tone = 'idle') {
    const el = document.getElementById('pxi_c1_state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('pxi-warn', tone === 'error');
    el.classList.toggle('pxi-ok', tone === 'ok');
}

function populateLlmModels() {
    const select = document.getElementById('pxi_llm_model_select');
    if (!select) return;
    const s = settings();
    const list = Array.isArray(s.llm_models) ? s.llm_models : [];
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '⟨เลือกโมเดล⟩' : '⟨ยังไม่ได้เชื่อมต่อ⟩';
    select.append(placeholder);

    for (const id of list) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        select.append(option);
    }
    select.value = list.includes(s.llm_model) ? s.llm_model : '';
}

/** ตรวจการเชื่อมต่อของ Connection 1 (โหมด Custom) แล้วโหลดรายชื่อโมเดล */
async function connectC1() {
    const context = getContext();
    const s = settings();
    try {
        const url = resolveLlmUrl('models');
        if (!url) {
            const target = resolveLlmUrl('generate');
            s.llm_models = [];
            populateLlmModels();
            context.saveSettingsDebounced();
            setC1State(`โหมดนี้ไม่ดึงรายชื่อโมเดล — จะยิงไปที่ ${target} โดยตรง ใช้ปุ่ม "ทดสอบ" เพื่อยืนยัน`, 'ok');
            notify('ตั้งค่า URL แล้ว ใช้ปุ่มทดสอบเพื่อยืนยัน', 'success');
            return;
        }
        setC1State('กำลังเชื่อมต่อและดึงรายชื่อโมเดล...');
        const data = await requestJson(url, { method: 'GET', headers: authHeaders(s.llm_key) }, 30, '1');
        const list = (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
            .map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean).sort();
        s.llm_models = list;
        populateLlmModels();
        context.saveSettingsDebounced();
        setC1State(list.length
            ? `เชื่อมต่อแล้ว • พบ ${list.length} โมเดล — เลือกจากรายการด้านล่าง`
            : 'เชื่อมต่อได้ แต่ endpoint ไม่ส่งรายชื่อโมเดลมา — พิมพ์ชื่อโมเดลเอง', 'ok');
        notify(list.length ? `เชื่อมต่อสำเร็จ พบ ${list.length} โมเดล` : 'เชื่อมต่อสำเร็จ แต่ไม่มีรายชื่อโมเดล', 'success');
    } catch (error) {
        setC1State(String(error?.message || error), 'error');
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
            setC1State('ทดสอบผ่าน — ตอบกลับว่า "' + String(result.text).trim().slice(0, 40) + '"', 'ok');
        } else {
            if (isBusy) { notify('กำลังทำงานอยู่ กรุณารอสักครู่', 'warning'); return; }
            isBusy = true;
            try {
                const prompt = '1girl, solo, upper body, looking at viewer, simple background';
                setStatus('กำลังทดสอบเจนรูป 1 ใบ...');
                setC2State('กำลังทดสอบเจนรูป 1 ใบ...');
                const result = await generateWithRetry(prompt, { quiet: true });
                if (!result) { setC2State('ยกเลิกการทดสอบ'); return; }
                const image = result.image;
                const path = image.kind === 'base64' ? await uploadBase64(image.value) : image.value;
                const size = image.kind === 'base64' ? `${Math.round(image.value.length / 1024)} KB` : 'URL รูป';
                await postImageMessage(path, result.prompt, 'test');
                notify(`Connection 2 เจนรูปได้ (${size}) — ส่งเข้าแชทแล้ว`, 'success');
                setStatus('Connection 2 ✓ เจนรูปทดสอบสำเร็จ ส่งเข้าแชทแล้ว');
                setC2State(`ทดสอบเจนรูปสำเร็จ (${size}) — รูปอยู่ท้ายแชท`, 'ok');
            } finally {
                isBusy = false;
            }
        }
    } catch (error) {
        setStatus(String(error?.message || error), true);
        if (kind === 'llm') setC1State(String(error?.message || error), 'error');
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
    const engine = settings().docs_engine === 'gpt' ? 'gpt' : 'nai';
    container.innerHTML = '';
    for (const doc of NAI_DOCS.filter(d => d.engine === engine)) {
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
    if (s.c1_source === 'custom') updateLlmUrlModeUi();
    document.querySelectorAll('.pxi-c2-nai').forEach(el => el.classList.toggle('pxi-hidden', s.c2_source !== 'nai'));
    // GPT-Image ใช้ URL/key/timeout ชุดเดียวกับ Custom
    const usesCustomEndpoint = s.c2_source === 'custom';
    document.querySelectorAll('.pxi-c2-custom').forEach(el => el.classList.toggle('pxi-hidden', !usesCustomEndpoint));
    const gptParams = s.param_engine === 'gpt';
    document.querySelectorAll('.pxi-p-gpt').forEach(el => el.classList.toggle('pxi-hidden', !gptParams));
    document.querySelectorAll('.pxi-p-diffusion').forEach(el => el.classList.toggle('pxi-hidden', gptParams));
    document.querySelectorAll('.pxi-style-custom').forEach(el => el.classList.toggle('pxi-hidden', s.gpt_style !== 'custom'));
    if (usesCustomEndpoint) updateUrlModeUi();
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
    const useGpt = targetIsGpt();
    if (sys) {
        sys.value = useGpt
            ? gptTemplate(mode).sys
            : (settings().templates[mode] || settings().templates.free).sys;
    }
    const badge = document.getElementById('pxi_tpl_set');
    if (badge) {
        badge.textContent = useGpt
            ? 'กำลังแก้ชุด GPT-Image (prompt แบบประโยคบรรยาย) — เก็บแยกจากชุด NovelAI ที่แก้ไว้ ไม่ทับกัน'
            : 'กำลังแก้ชุด NovelAI / Diffusion (prompt แบบแท็ก) — เก็บแยกจากชุด GPT-Image ที่แก้ไว้ ไม่ทับกัน';
    }
    document.getElementById('pxi_manga_note')?.classList.toggle('pxi-hidden', mode !== 'manga' || useGpt);
}

function saveTemplateEditor() {
    const context = getContext();
    const s = settings();
    const mode = document.getElementById('pxi_tpl_mode')?.value || 'free';
    const sys = document.getElementById('pxi_tpl_sys');
    if (!sys) return;
    if (targetIsGpt()) {
        if (!s.gpt_templates || typeof s.gpt_templates !== 'object') s.gpt_templates = {};
        s.gpt_templates[mode] = { sys: sys.value };
    } else if (s.templates[mode]) {
        s.templates[mode].sys = sys.value;
    }
    context.saveSettingsDebounced();
}

function resetTemplate(all = false) {
    const context = getContext();
    const modes = all ? MODES : [document.getElementById('pxi_tpl_mode')?.value || 'free'];
    for (const mode of modes) {
        if (targetIsGpt()) delete (settings().gpt_templates || {})[mode];
        else settings().templates[mode] = defaultTemplate(mode);
    }
    loadTemplateEditor();
    context.saveSettingsDebounced();
    notify(all ? 'รีเซ็ตทุก template กลับค่าเริ่มต้นแล้ว' : 'รีเซ็ต template นี้แล้ว', 'success');
}

/** รวมรายชื่อ built-in + ที่ดึงมาจาก remote + ที่ผู้ใช้พิมพ์เอง */
function naiModelList() {
    const s = settings();
    const seen = new Set();
    const out = [];
    for (const item of [...NAI_MODELS_BUILTIN, ...(s.nai_models_extra || [])]) {
        const id = typeof item === 'string' ? item : item?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, label: (typeof item === 'object' && item.label) || id });
    }
    if (s.nai_model && !seen.has(s.nai_model)) out.push({ id: s.nai_model, label: s.nai_model + ' (พิมพ์เอง)' });
    return out;
}

function populateNaiModels() {
    const list = document.getElementById('pxi_nai_model_list');
    if (!list) return;
    list.innerHTML = '';
    for (const model of naiModelList()) {
        const option = document.createElement('option');
        option.value = model.id;
        option.label = model.label;
        option.textContent = model.label;
        list.append(option);
    }
}

/**
 * ดึงรายชื่อโมเดลจาก URL ภายนอก (เช่นไฟล์ JSON บน GitHub ของผู้ใช้เอง)
 * รองรับทั้ง ["id", ...] และ [{ id, label, suffix, negative }, ...]
 */
async function fetchRemoteModelList({ silent = false } = {}) {
    const context = getContext();
    const s = settings();
    const url = String(s.model_list_url || '').trim();
    if (!url) {
        if (!silent) notify('ยังไม่ได้ใส่ URL ของรายชื่อโมเดล', 'warning');
        return false;
    }
    try {
        assertReachableScheme(url, '2');
        const data = await requestJson(url, { method: 'GET' }, 20, '2');
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.models) ? data.models : []);
        const parsed = [];
        for (const item of raw) {
            if (typeof item === 'string') { parsed.push({ id: item }); continue; }
            if (!item?.id) continue;
            const entry = { id: String(item.id) };
            if (item.label) entry.label = String(item.label);
            if (item.suffix) entry.suffix = String(item.suffix);
            if (item.negative) entry.negative = String(item.negative);
            parsed.push(entry);
        }
        if (!parsed.length) throw new PxiError('ไฟล์นี้ไม่มีรายชื่อโมเดลที่อ่านได้', { stage: '2' });

        s.nai_models_extra = parsed;
        for (const entry of parsed) {
            if (entry.suffix) NAI_QUALITY_SUFFIX[entry.id] = entry.suffix;
            if (entry.negative) NAI_REMOTE_NEGATIVE[entry.id] = entry.negative;
        }
        populateNaiModels();
        context.saveSettingsDebounced();
        if (!silent) notify(`อัปเดตรายชื่อโมเดลแล้ว (${parsed.length} รายการ)`, 'success');
        setStatus(`รายชื่อโมเดล NovelAI: ${parsed.length} รายการจาก remote list`);
        return true;
    } catch (error) {
        console.warn(LOG, 'ดึงรายชื่อโมเดลไม่สำเร็จ', error);
        if (!silent) await showErrorPopup(error);
        return false;
    }
}

function populateVibes() {
    const select = document.getElementById('pxi_vibe_select');
    if (!select) return;
    const s = settings();
    select.innerHTML = '';

    const none = document.createElement('option');
    none.value = '';
    none.textContent = (s.vibes || []).length ? '⟨ไม่ใช้ vibe⟩' : '⟨ยังไม่มี vibe⟩';
    select.append(none);
    for (const vibe of s.vibes || []) {
        const option = document.createElement('option');
        option.value = vibe.id;
        option.textContent = vibe.name;
        select.append(option);
    }
    select.value = (s.vibes || []).some(v => v.id === s.vibe_active) ? s.vibe_active : '';
    loadVibeEditor();
}

function loadVibeEditor() {
    const s = settings();
    const id = document.getElementById('pxi_vibe_select')?.value || '';
    const vibe = (s.vibes || []).find(v => v.id === id);
    const name = document.getElementById('pxi_vibe_name');
    const tags = document.getElementById('pxi_vibe_tags');
    const note = document.getElementById('pxi_vibe_note');
    if (name) name.value = vibe?.name || '';
    if (tags) tags.value = vibe?.tags || '';
    if (note) note.value = vibe?.note || '';
    document.getElementById('pxi_vibe_delete')?.classList.toggle('pxi-hidden', !vibe);
}

/** id ที่ไม่มีทางชนกัน แม้กดสร้างรัว ๆ ในมิลลิวินาทีเดียวกัน */
function newVibeId(existing) {
    const taken = new Set((existing || []).map(v => v.id));
    let id;
    do {
        id = `vibe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    } while (taken.has(id));
    return id;
}

function saveVibe() {
    const context = getContext();
    const s = settings();
    const select = document.getElementById('pxi_vibe_select');
    const name = String(document.getElementById('pxi_vibe_name')?.value || '').trim();
    const tags = String(document.getElementById('pxi_vibe_tags')?.value || '').trim();
    const note = String(document.getElementById('pxi_vibe_note')?.value || '').trim();

    if (!name) { notify('ตั้งชื่อ vibe ก่อน', 'warning'); return; }
    if (!tags) { notify('ใส่แท็กหรือคำบรรยายของ vibe ก่อน', 'warning'); return; }

    const id = select?.value || '';
    const existing = (s.vibes || []).find(v => v.id === id);
    if (existing) {
        existing.name = name;
        existing.tags = tags;
        existing.note = note;
        notify(`บันทึก vibe "${name}" แล้ว`, 'success');
    } else {
        const fresh = { id: newVibeId(s.vibes), name, tags, note };
        s.vibes.push(fresh);
        s.vibe_active = fresh.id;
        notify(`เพิ่ม vibe "${name}" แล้ว`, 'success');
    }
    populateVibes();
    if (select && !existing) select.value = s.vibe_active;
    loadVibeEditor();
    context.saveSettingsDebounced();
}

async function deleteVibe() {
    const context = getContext();
    const s = settings();
    const id = document.getElementById('pxi_vibe_select')?.value || '';
    const vibe = (s.vibes || []).find(v => v.id === id);
    if (!vibe) return;
    const ok = await context.callGenericPopup(`ลบ vibe "${vibe.name}" ?`, context.POPUP_TYPE.CONFIRM, '', { okButton: 'ลบ', cancelButton: 'ยกเลิก' });
    if (!ok) return;
    s.vibes = s.vibes.filter(v => v.id !== id);
    if (s.vibe_active === id) s.vibe_active = '';
    populateVibes();
    context.saveSettingsDebounced();
    notify('ลบแล้ว', 'success');
}

function newVibe() {
    const select = document.getElementById('pxi_vibe_select');
    if (select) select.value = '';
    const name = document.getElementById('pxi_vibe_name');
    const tags = document.getElementById('pxi_vibe_tags');
    const note = document.getElementById('pxi_vibe_note');
    if (name) name.value = '';
    if (tags) tags.value = '';
    if (note) note.value = '';
    document.getElementById('pxi_vibe_delete')?.classList.add('pxi-hidden');
    name?.focus?.();
}

function populateMangaStyles() {
    const select = document.getElementById('pxi_manga_style');
    if (!select || select.dataset?.filled === '1') return;
    select.innerHTML = '';
    for (const key of MANGA_STYLE_ORDER) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = MANGA_STYLE_PRESETS[key].label;
        select.append(option);
    }
    if (select.dataset) select.dataset.filled = '1';
    select.value = mangaStyleKey();
}

function populateGptStyles() {
    const select = document.getElementById('pxi_gpt_style');
    if (!select || select.dataset?.filled === '1') return;
    select.innerHTML = '';
    for (const key of GPT_STYLE_ORDER) {
        const preset = GPT_STYLE_PRESETS[key];
        if (!preset) continue;
        const option = document.createElement('option');
        option.value = key;
        option.textContent = preset.label;
        select.append(option);
    }
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'กำหนดเอง (เขียนข้อความสไตล์เอง)';
    select.append(customOption);
    if (select.dataset) select.dataset.filled = '1';
    const current = GPT_STYLE_PRESETS[settings().gpt_style] ? settings().gpt_style : 'realistic';
    settings().gpt_style = current;
    select.value = current;
}

function populateSizePresets() {
    const select = document.getElementById('pxi_size_preset');
    if (!select || select.dataset?.filled === '1') return;
    select.innerHTML = '';
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = '⟨กำหนดเอง⟩';
    select.append(custom);
    for (const [value, label] of SIZE_PRESETS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
    }
    if (select.dataset) select.dataset.filled = '1';
}

function updateLlmUrlModeUi() {
    const s = settings();
    const mode = s.llm_url_mode || 'auto';
    document.querySelectorAll('.pxi-llm-url-path').forEach(el => el.classList.toggle('pxi-hidden', mode !== 'path'));

    const hint = document.getElementById('pxi_llm_url_hint');
    if (!hint) return;
    if (!String(s.llm_url || '').trim()) {
        hint.textContent = 'กรอก Base URL ของ proxy ก่อน';
        hint.classList.remove('pxi-warn');
        return;
    }
    try {
        const generate = resolveLlmUrl('generate');
        const models = resolveLlmUrl('models');
        const base = s.c1_via_server ? relayBaseUrl() : null;
        const route = base
            ? `สร้าง prompt → ผ่านเซิร์ฟเวอร์ ST → POST ${base}/chat/completions`
            : `สร้าง prompt → ยิงตรงจากเบราว์เซอร์ → POST ${generate}`;
        const warn = (s.c1_via_server && !base)
            ? '\n(โหมด URL นี้ relay ไม่ได้ ต้องลงท้ายด้วย /chat/completions)'
            : '';
        hint.textContent = route + warn + (models ? `\nรายชื่อโมเดล → GET ${models}` : '\nโหมดนี้ไม่ดึงรายชื่อโมเดล');
        hint.classList.remove('pxi-warn');
    } catch (error) {
        hint.textContent = String(error?.message || error);
        hint.classList.add('pxi-warn');
    }
}

function updateUrlModeUi() {
    const s = settings();
    const mode = s.img_url_mode || 'auto';
    document.querySelectorAll('.pxi-url-path').forEach(el => el.classList.toggle('pxi-hidden', mode !== 'path'));

    const hint = document.getElementById('pxi_img_url_hint');
    if (!hint) return;
    if (!String(s.img_url || '').trim()) {
        hint.textContent = 'กรอก Base URL ของ proxy ก่อน';
        hint.classList.remove('pxi-warn');
        return;
    }
    try {
        const generate = resolveImageUrl('generate');
        const models = resolveImageUrl('models');
        hint.textContent = `เจนรูป → POST ${generate}` + (models ? `\nรายชื่อโมเดล → GET ${models}` : '\nโหมดนี้ไม่ดึงรายชื่อโมเดล');
        hint.classList.remove('pxi-warn');
    } catch (error) {
        hint.textContent = String(error?.message || error);
        hint.classList.add('pxi-warn');
    }
}

function updateGptSizeHint() {
    const el = document.getElementById('pxi_gpt_size_hint');
    if (!el) return;
    try {
        const { size, warnings } = resolveGptSize();
        el.textContent = warnings.length
            ? `จะส่ง size: ${size}\n• ${warnings.join('\n• ')}`
            : `จะส่ง size: ${size}`;
        el.classList.toggle('pxi-warn', warnings.length > 0);
    } catch (error) {
        el.textContent = String(error?.message || error);
        el.classList.add('pxi-warn');
    }
}

function updateSizeUi() {
    const s = settings();
    const select = document.getElementById('pxi_size_preset');
    const field = document.getElementById('pxi_size');
    const hint = document.getElementById('pxi_size_hint');
    const current = String(s.size || '').replace(/\s/g, '').toLowerCase();

    if (select) select.value = SIZE_PRESETS.some(([value]) => value === current) ? current : '';
    if (field && document.activeElement !== field) field.value = s.size ?? '';

    if (hint) {
        const base = parseSize();
        const final = resolvedSize();
        const shrunk = final.width !== base.width || final.height !== base.height;
        const orientation = final.width > final.height ? 'แนวนอน' : final.width < final.height ? 'แนวตั้ง' : 'จัตุรัส';
        hint.textContent = shrunk
            ? `จะส่งจริง ${final.width}x${final.height} (${orientation}) — ย่อจาก ${base.width}x${base.height} โดย "Avoid spending Anlas"`
            : `จะส่งจริง ${final.width}x${final.height} (${orientation})`;
        hint.classList.toggle('pxi-warn', shrunk);
    }
}

function applySizeFromField() {
    const context = getContext();
    const field = document.getElementById('pxi_size');
    const raw = String(field?.value || '').trim();
    const match = raw.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
    if (!match) {
        notify('รูปแบบขนาดไม่ถูกต้อง ใช้แบบ 768x1344', 'warning');
        return;
    }
    const width = snap64(match[1], 768);
    const height = snap64(match[2], 1344);
    settings().size = `${width}x${height}`;
    if (field) field.value = settings().size;
    updateSizeUi();
    context.saveSettingsDebounced();
    const snapped = width !== Number(match[1]) || height !== Number(match[2]);
    notify(snapped ? `บันทึกแล้ว ปัดเป็นทวีคูณของ 64 เป็น ${settings().size}` : `บันทึกขนาด ${settings().size} แล้ว`, 'success');
}

let personaHintTimer = null;

/** เรียกได้ถี่แค่ไหนก็ได้ รวมเป็นครั้งเดียวใน 300ms */
function schedulePersonaHint() {
    clearTimeout(personaHintTimer);
    personaHintTimer = setTimeout(() => { updatePersonaHint(); }, 300);
}

async function updatePersonaHint() {
    const el = document.getElementById('pxi_persona_hint');
    if (!el) return;
    // ไม่ต้องคำนวณถ้าหน้าตั้งค่ายังไม่ถูกเปิดดู
    if (el.offsetParent === null && el.offsetParent !== undefined) return;
    const mode = settings().persona_mode || 'auto';
    if (mode === 'always') {
        el.textContent = 'ส่งบล็อก persona ไปทุกครั้ง — ฉากที่ผู้ใช้ไม่ได้อยู่ในเฟรม โมเดลอาจลากตัวละครที่สองเข้ามาเอง';
        el.classList.remove('pxi-warn');
        return;
    }
    if (mode === 'never') {
        el.textContent = 'ไม่ส่ง persona เลย — ฉากที่มีผู้ใช้อยู่ด้วยจะถูกวาดจากสิ่งที่ข้อความบรรยายล้วน ๆ';
        el.classList.remove('pxi-warn');
        return;
    }
    try {
        const macros = await buildMacros('');
        const inScene = isUserInScene(macros);
        const name = getContext().name1 || 'ผู้ใช้';
        const preview = String(macros.lastMessage || '').slice(0, 60);
        el.textContent = inScene
            ? `ฉากล่าสุดตรวจพบ ${name} อยู่ในเฟรม — จะส่ง persona ไปด้วย\n"${preview}…"`
            : `ฉากล่าสุดไม่พบ ${name} — จะไม่ส่ง persona และสั่งไม่ให้วาดตัวละครนี้\n"${preview}…"`;
        el.classList.remove('pxi-warn');
    } catch {
        el.textContent = 'ตรวจจากชื่อผู้ใช้และสรรพนามในข้อความล่าสุด (ไทย/อังกฤษ) ถ้าตรวจพลาดให้สลับไปโหมดบังคับ';
        el.classList.remove('pxi-warn');
    }
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
    if (perMessage < 400) warnings.push(`ตัด/ข้อความ ${perMessage} น้อยไป — ข้อความล่าสุดเหลือแค่ ${lastCap} ตัวอักษร ฉากที่มีหลายตัวละครจะถูกตัดหัวทิ้ง แนะนำ 1200`);
    if (perMessage > 1200) warnings.push(`ตัด/ข้อความ ${perMessage} สูงมาก — ข้อความล่าสุดกินไป ${lastCap} ตัวอักษร เสี่ยง Connection 1 ตอบช้าหรือไม่ยอมตอบ แนะนำไม่เกิน 1200`);
    if (total < 1000) warnings.push('เพดานรวมต่ำกว่า 1000 — ฉากก่อนหน้าจะหายเกือบหมด แนะนำอย่างน้อย 1000');
    if (total > 10000) warnings.push('เพดานรวมเกิน 10000 — เกินความจำเป็นและเสี่ยงชน context limit ของโปรไฟล์ แนะนำไม่เกิน 10000');
    if (messages === 1) warnings.push('ข้อความล่าสุด = 1 จะส่งข้อความเดียวกันซ้ำสองรอบ (ทั้งใน chat และ lastMessage) — ใช้ 0 แทน');
    if (messages > 4) warnings.push(`ข้อความล่าสุด ${messages} ย้อนไปไกลเกินจำเป็น — เสี่ยงหยิบเนื้อหาเก่าที่ไม่เกี่ยวกับฉากปัจจุบัน และเพิ่มโอกาสติดฟิลเตอร์ของ Connection 1 แนะนำ 0`);
    const answerBudget = Number(s.llm_max_tokens) || 600;
    if (answerBudget < 400) warnings.push(`เพดานความยาวคำตอบ ${answerBudget} ต่ำไป — prompt ที่มีหลายตัวละครจะถูกตัดกลางคัน แนะนำ 600 ขึ้นไป`);
    if (s.cot_mode === 'heavy' && answerBudget < 600) warnings.push('โหมด CoT หนักต้องการที่ให้รอบวิเคราะห์ด้วย — ตั้งเพดานความยาวคำตอบอย่างน้อย 600');

    el.textContent = '';
    const summary = document.createElement('div');
    const scopeNote = messages === 0 ? ' • อ่านเฉพาะข้อความล่าสุดข้อความเดียว' : '';
    const cotNote = s.cot_mode === 'heavy' ? ' • CoT หนัก = ยิง 2 รอบ'
        : s.cot_mode === 'light' ? ' • CoT เบา = เผื่อคำตอบ 1.8 เท่า' : '';
    summary.textContent = `งบจริง ≈ ${budget} ตัวอักษรจากบทสนทนา + ข้อความล่าสุดสูงสุด ${lastCap} ตัวอักษร รวมกับ template แล้วราว ${tokens} tokens${scopeNote}${cotNote}`;
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
    populateSizePresets();
    populateNaiModels();
    populateVibes();
    populateMangaStyles();
    populateGptStyles();
    populateImageModels();
    populateLlmModels();
    updateGptSizeHint();
    updateUrlModeUi();
    updateLlmUrlModeUi();
    resolveOverswipeConflict({ silent: true });
    updateSizeUi();
    updateContextHints();
    updatePersonaHint();
    const smeaDyn = document.getElementById('pxi_sm_dyn');
    if (smeaDyn) {
        smeaDyn.checked = false;
        smeaDyn.disabled = true;
        smeaDyn.closest?.('label')?.classList?.add('pxi-disabled');
    }
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
            if (key === 'c2_source') loadTemplateEditor();
            if (key === 'gpt_size' || key === 'gpt_model') updateGptSizeHint();
            if (key.startsWith('ctx_') || key === 'llm_max_tokens' || key === 'cot_mode') updateContextHints();
            if (key === 'persona_mode') updatePersonaHint();
            if (key === 'size' || key === 'steps' || key === 'anlas_guard') updateSizeUi();
            if (key === 'img_model') {
                const select = document.getElementById('pxi_img_model_select');
                if (select) select.value = (settings().img_models || []).includes(el.value) ? el.value : '';
            }
            if (key === 'swipe_regen' || key === 'take_over_overswipe') resolveOverswipeConflict();
            if (key === 'c2_source') setC2State('ยังไม่ได้เชื่อมต่อ — กรอกค่าด้านล่างแล้วกด "เชื่อมต่อ"');
            if (key === 'img_url' || key === 'img_url_mode' || key === 'img_gen_path' || key === 'img_models_path') updateUrlModeUi();
            if (key === 'llm_url' || key === 'llm_url_mode' || key === 'llm_gen_path' || key === 'llm_models_path' || key === 'c1_via_server') updateLlmUrlModeUi();
            if (key === 'llm_model') {
                const select = document.getElementById('pxi_llm_model_select');
                if (select) select.value = (settings().llm_models || []).includes(el.value) ? el.value : '';
            }
            if (key === 'tpl_engine') { populateGptStyles(); loadTemplateEditor(); }
            if (key === 'param_engine') toggleSourceBlocks();
            if (key === 'gpt_style') toggleSourceBlocks();
            if (key === 'docs_engine') renderDocsButtons();
            if (key === 'c1_source') setC1State('ยังไม่ได้เชื่อมต่อ — กรอกค่าด้านล่างแล้วกด "เชื่อมต่อ"');
            context.saveSettingsDebounced();
        });
    }

    document.getElementById('pxi_tpl_mode')?.addEventListener('change', loadTemplateEditor);
    document.getElementById('pxi_tpl_sys')?.addEventListener('input', saveTemplateEditor);
    document.getElementById('pxi_tpl_reset')?.addEventListener('click', () => resetTemplate(false));
    document.getElementById('pxi_tpl_reset_all')?.addEventListener('click', () => resetTemplate(true));

    document.getElementById('pxi_c1_connect')?.addEventListener('click', () => connectC1());
    document.getElementById('pxi_llm_model_select')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) return;
        settings().llm_model = value;
        const field = document.getElementById('pxi_llm_model');
        if (field) field.value = value;
        getContext().saveSettingsDebounced();
        setC1State(`เลือกโมเดล ${value} แล้ว`, 'ok');
    });
    document.getElementById('pxi_llm_test')?.addEventListener('click', () => testConnection('llm'));
    document.getElementById('pxi_img_test')?.addEventListener('click', () => testConnection('img'));
    document.getElementById('pxi_c2_connect')?.addEventListener('click', () => connectC2());
    document.getElementById('pxi_c2_probe')?.addEventListener('click', () => probeEndpoints());
    document.getElementById('pxi_img_model_select')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) return;
        settings().img_model = value;
        const field = document.getElementById('pxi_img_model');
        if (field) field.value = value;
        getContext().saveSettingsDebounced();
        setC2State(`เลือกโมเดล ${value} แล้ว`, 'ok');
    });
    document.getElementById('pxi_nai_save')?.addEventListener('click', () => saveNovelKey());
    document.getElementById('pxi_vibe_select')?.addEventListener('change', (event) => {
        settings().vibe_active = event.target.value;
        loadVibeEditor();
        getContext().saveSettingsDebounced();
    });
    document.getElementById('pxi_vibe_save')?.addEventListener('click', () => saveVibe());
    document.getElementById('pxi_vibe_new')?.addEventListener('click', () => newVibe());
    document.getElementById('pxi_vibe_delete')?.addEventListener('click', () => deleteVibe());
    document.getElementById('pxi_model_list_fetch')?.addEventListener('click', () => fetchRemoteModelList());
    document.getElementById('pxi_nai_model')?.addEventListener('change', () => populateNaiModels());
    document.getElementById('pxi_size_save')?.addEventListener('click', () => applySizeFromField());
    document.getElementById('pxi_size')?.addEventListener('change', () => applySizeFromField());
    document.getElementById('pxi_size_preset')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) return;
        settings().size = value;
        const field = document.getElementById('pxi_size');
        if (field) field.value = value;
        updateSizeUi();
        getContext().saveSettingsDebounced();
        notify(`ตั้งขนาดเป็น ${value} แล้ว`, 'success');
    });
    document.getElementById('pxi_anlas_view')?.addEventListener('click', () => viewAnlas());
    document.getElementById('pxi_profile_refresh')?.addEventListener('click', () => populateProfiles());
    document.getElementById('pxi_persona_refresh')?.addEventListener('click', () => updatePersonaHint());
    document.getElementById('pxi_preview')?.addEventListener('click', () => previewPrompt());
    document.getElementById('pxi_docs_save_all')?.addEventListener('click', () => {
        const engine = settings().docs_engine === 'gpt' ? 'gpt' : 'nai';
        downloadText(`${engine === 'gpt' ? 'gpt-image' : 'novelai'}-cheatsheet.md`, docsToMarkdown(engine));
    });
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
        ['manga', 'fa-table-cells-large', 'Manga Panel'],
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
        resolveOverswipeConflict({ silent: true });

        const context = getContext();
        for (const key of ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'CHAT_CHANGED']) {
            const eventName = context.eventTypes?.[key];
            if (eventName) context.eventSource.on(eventName, schedulePersonaHint);
        }

        const imageSwipedEvent = context.eventTypes?.IMAGE_SWIPED;
        if (imageSwipedEvent) context.eventSource.on(imageSwipedEvent, onImageSwiped);
        else console.warn(LOG, 'SillyTavern เวอร์ชันนี้ไม่มี IMAGE_SWIPED — ปิดฟีเจอร์ปัดเพื่อเจนใหม่');

        console.log(LOG, 'พร้อมใช้งาน', EXT_PATH);
    } catch (error) {
        console.error(LOG, 'เริ่มต้นไม่สำเร็จ', error);
    }
});
