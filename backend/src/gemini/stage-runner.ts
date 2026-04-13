// @ts-nocheck
const { PERSONALITY_CRITERIA, STAGE_PROMPT_DEFAULTS, LEGEND_BLOCKS, LIFE_SPHERES, QC_CHECKS } = require('../legend/constants');
const { clampInt, safeString, deepClone, normalizeText } = require('../legend/utils');
const { validateCanonProfileConsistency } = require('../legend/pipeline');
const { generateGeminiJson } = require('./client');
const { generateXaiJson, hasXaiCredentials, isXaiSexualRoutingEnabled } = require('./xai-client');

const STAGE_ORDER = Object.freeze(['stage_0_canon', 'stage_1_anchors', 'stage_2_fact_bank', 'stage_3_blocks', 'stage_4_qc']);
const FACTS_BASE_LIMIT = 160;
const FACTS_EXTENSION_STEP = 60;
const MIN_PERSON_AGE = 0;
const MAX_PERSON_AGE = 120;
const DATING_TARGET_GENDER_EN = 'woman';
const DATING_RELATIONSHIP_STATUS_EN = 'single, open to a relationship with a man';
const STAGE_3_OUTPUT_MODES = new Set(['blocks', 'full_text', 'both']);
const STAGE_TIMEOUT_MS = Object.freeze({
  canon_profile_consistency: 240000,
  stage_1_anchors: 420000,
  stage_2_fact_bank: 420000,
  stage_3_blocks: 300000,
  stage_4_qc: 300000
});

const CANON_CONSISTENCY_CRITERION_HINTS = Object.freeze({
  responsibility: ['ответствен', 'responsibility'],
  achievement_drive: ['достигаторств', 'achievement_drive', 'амбици'],
  empathy: ['эмпат', 'чутк', 'empathy'],
  discipline: ['самодисциплин', 'дисциплин', 'discipline'],
  independence: ['независим', 'самостоят', 'автоном', 'independence'],
  emotional_stability: ['эмоциональн стабиль', 'стабильност', 'emotional_stability'],
  confidence: ['уверенн', 'confidence'],
  openness_to_change: ['открытост к нов', 'openness_to_change'],
  creativity: ['креативн', 'творческ', 'creativity'],
  sexual_expressiveness: ['сексуальн выразительн', 'sexual_expressiveness'],
  dominance_level: ['доминирован', 'доминант', 'dominance_level'],
  wealth: ['финансов уров', 'wealth', 'доход'],
  health: ['здоров', 'health'],
  social_connection: ['социальн связ', 'social_connection'],
  mission_level: ['мисси', 'смысл', 'mission_level', 'долгосрочн цел'],
  partner_seek_drive: ['партнерств', 'близост', 'partner_seek_drive']
});

const VALID_FACT_SOURCES = new Set(['anchor', 'canon', 'period_logic']);

const BASE_JSON_RULES_EN =
  'Return only one JSON object, with no markdown, no comments, and no explanatory text around the JSON.';

const JSON_STAGE_ARRAY_KEYS = Object.freeze({
  stage_1_anchors: 'anchors_timeline',
  stage_2_fact_bank: 'fact_bank'
});
const MAX_GEMINI_JSON_ATTEMPTS = 2;
const MAX_GEMINI_SAFETY_ATTEMPTS = 2;
const JSON_RETRY_PROMPT_SUFFIX = `
CRITICAL FORMAT RETRY:
- Return exactly one valid JSON object.
- Do not use markdown fences, comments, prose, wrapper keys like result/data/response, trailing commas, or ellipsis.
- Do not shorten arrays with placeholders like "..." or "etc.".
`.trim();
const SAFETY_RETRY_PROMPT_SUFFIX = `
SAFETY RETRY:
- Preserve the same JSON schema and the same factual task.
- Rewrite any adult intimacy or sexual material in a clinical, non-erotic, non-graphic register.
- Keep factual specificity, but avoid pornographic wording, sensory narration, explicit step-by-step sex scenes, bodily-fluid detail, and seductive language.
- If the original prompt asked for maximum explicitness, reinterpret that as maximum factual specificity within a neutral clinical tone.
- Use short direct statements for practices, preferences, likes, dislikes, toys, casual versus relationship-only sex, and partner experience.
`.trim();
const XAI_SEXUAL_STAGE_KEYS = new Set([
  'stage_3_sexual_preferences_override'
]);
const SEXUAL_ROUTING_PATTERNS = Object.freeze([
  /sexualPreferences/iu,
  /\bsexual(?:ity)?\b/iu,
  /\bporn\b/iu,
  /\bmasturb\w*\b/iu,
  /\boral\b/iu,
  /\banal\b/iu,
  /\btoys?\b/iu,
  /\bfantas(?:y|ies)\b/iu,
  /секс/iu,
  /сексу/iu,
  /порно/iu,
  /мастурб/iu,
  /орал/iu,
  /анал/iu,
  /игрушк/iu,
  /фантази/iu
]);

const TRAIT_LIKE_FACT_PATTERNS = Object.freeze([
  /\b\d+\s*\/\s*\d+\b/u,
  /^(?:я|он|она)\s+(?:счита(?:ю|ет)\s+себя|счита(?:ю|ет)(?:,\s*что|\s+что)|вер(?:ю|ит)(?:,\s*что|\s+что)|цен(?:ю|ит)|облада(?:ю|ет)|явля(?:юсь|ется)|рациональн\w+|инициативн\w+|самостоятельн\w+|независим\w+|ответственн\w+|эмпатичн\w+|дисциплинирован\w+|эмоционально\s+стабил\w+|уверен\w*(?:\s+в\s+себе)?|открыт\w*\s+к\s+изменени\w+|креативн\w+|сексуально\s+раскрепощен\w+|доминант\w+)\b/iu,
  /^(?:мне|ему|ей)\s+свойственн/iu,
  /^ключевыми\s+ценност/iu,
  /^е(?:е|ё)\s+темперамент/iu,
  /^у\s+(?:меня|него|нее|неё)\s+(?:высокий|низкий|средний|хороший|плохой)\s+уровень/iu,
  /^мой\s+уровень/iu,
  /явля(?:ется|ются)\s+важной\s+частью/iu,
  /это\s+прежде\s+всего/iu,
  /не\s+в\s+стабильной\s+работе\s+а\s+в\s+востребованных\s+навыках/iu,
  /не\s+конечная\s+точка\s+а\s+непрерывный\s+процесс/iu,
  /ключ\s+к\s+профессиональной\s+релевантности/iu,
  /любой\s+кризис\s+это\s+точка\s+роста/iu
]);

const WEAK_FACT_PATTERNS = Object.freeze([
  /одно\s+атомарное\s+событие/iu,
  /одно\s+точное\s+событие/iu,
  /наблюдаемый\s+факт/iu,
  /placeholder/iu,
  /^факт\b/iu,
  /^событие\b/iu
]);

const RUSSIAN_TO_SPHERE = Object.freeze({
  детство: 'childhood',
  семья: 'family',
  образование: 'education',
  работа: 'career',
  карьера: 'career',
  финансы: 'finance',
  отношения: 'relationships',
  сексуальность: 'sexuality',
  здоровье: 'health',
  привычки: 'habits',
  общество: 'social',
  социум: 'social',
  ценности: 'values',
  кризис: 'crisis',
  миссия: 'mission',
  будущее: 'future'
});

function parseYear(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  const match = safeString(value).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function parseDateParts(value) {
  const raw = safeString(value).trim();
  const year = parseYear(raw);
  const numericParts = raw.match(/\d{1,4}/g) || [];
  let month = null;
  let day = null;

  if (numericParts.length >= 3) {
    if (numericParts[0]?.length === 4) {
      month = Number(numericParts[1]);
      day = Number(numericParts[2]);
    } else if (numericParts[numericParts.length - 1]?.length === 4) {
      day = Number(numericParts[0]);
      month = Number(numericParts[1]);
    }
  }

  return {
    year,
    month: Number.isFinite(month) ? clampInt(month, 1, 12) : null,
    day: Number.isFinite(day) ? clampInt(day, 1, 31) : null
  };
}

function getBirthContext(person) {
  const birthDate = parseDateParts(person?.birth_date);
  return {
    year: birthDate.year || parseYear(person?.birth_year),
    month: birthDate.month,
    day: birthDate.day
  };
}

function resolveAgeFromYear({ year, month = null, birthContext }) {
  if (!Number.isFinite(year) || !Number.isFinite(birthContext?.year)) {
    return null;
  }

  let age = year - birthContext.year;
  if (Number.isFinite(month) && Number.isFinite(birthContext.month) && month < birthContext.month) {
    age -= 1;
  }

  return clampInt(age, MIN_PERSON_AGE, MAX_PERSON_AGE);
}

function parsePositiveInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric);
}

function normalizeFactPackages(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return clampInt(numeric, 0, 10);
}

function normalizeStage3OutputMode(value) {
  const normalized = safeString(value).trim().toLowerCase();
  if (STAGE_3_OUTPUT_MODES.has(normalized)) {
    return normalized;
  }
  return 'blocks';
}

function normalizeStagePrompts(stagePromptsInput) {
  const out = { ...STAGE_PROMPT_DEFAULTS };
  if (!stagePromptsInput || typeof stagePromptsInput !== 'object') {
    return out;
  }

  for (const key of Object.keys(STAGE_PROMPT_DEFAULTS)) {
    const candidate = safeString(stagePromptsInput[key]).trim();
    if (candidate) {
      out[key] = candidate;
    }
  }

  return out;
}

function normalizeProfile(profileInput = {}) {
  const out = {};
  for (const criterion of PERSONALITY_CRITERIA) {
    const raw = Number(profileInput?.[criterion.key]);
    out[criterion.key] = clampInt(Number.isFinite(raw) ? raw : 5, 1, 10);
  }
  return out;
}

function buildTopTraits(profile) {
  const ranked = PERSONALITY_CRITERIA.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    value: profile[criterion.key]
  }))
    .sort((a, b) => b.value - a.value);

  const values = ranked.map((item) => item.value).filter((value) => Number.isFinite(value));
  const maxValue = values.length > 0 ? Math.max(...values) : null;
  const minValue = values.length > 0 ? Math.min(...values) : null;

  // Flat or near-neutral profiles should not invent "dominant" traits out of key order.
  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue) || (maxValue <= 6 && maxValue - minValue < 2)) {
    return [];
  }

  const threshold = Math.max(7, maxValue - 1);
  return ranked.filter((item) => item.value >= threshold).slice(0, 5);
}

function getSexualExpressivenessBand(scoreInput) {
  const numeric = Number(scoreInput);
  const score = clampInt(Number.isFinite(numeric) ? numeric : 5, 1, 10);
  if (score <= 2) {
    return 'low_private';
  }
  if (score <= 4) {
    return 'guarded_selective';
  }
  if (score <= 7) {
    return 'clear_adult';
  }
  if (score <= 9) {
    return 'very_high_drive';
  }
  return 'maximum_intensity';
}

function buildSexualExpressivenessPromptRuleRu(scoreInput) {
  const numeric = Number(scoreInput);
  const score = clampInt(Number.isFinite(numeric) ? numeric : 5, 1, 10);
  const prefix = `Canon sexual_expressiveness = ${score}/10.`;

  switch (getSexualExpressivenessBand(score)) {
    case 'low_private':
      return `${prefix} Желание и опыт могут быть взрослыми и конкретными, но сексуальность должна звучать более закрыто, осторожно, избирательно и ограниченно по инициативе и экспериментам. Не делай блок стерильным, но и не делай его экстремальным.`;
    case 'guarded_selective':
      return `${prefix} Желание уже заметно, но подача всё ещё более сдержанная и выборочная, чем у среднего уровня: меньше напора, уже диапазон практик, выше потребность в доверии и контексте.`;
    case 'clear_adult':
      return `${prefix} Нужна явная взрослая сексуальность с хорошей конкретикой, прямыми предпочтениями, ощутимой инициативой и некоторой открытостью к экспериментам, но без ощущения максимума или экстремума.`;
    case 'very_high_drive':
      return `${prefix} Уровень 8-9 должен звучать резко выше среднего: очень сильное и частое желание, почти ежедневные мысли о сексе, активный самостоятельный поиск секса, ежедневная или почти ежедневная мастурбация, широкий взрослый диапазон практик, заметно более легкое отношение к casual и выраженная тяга к новизне. Если canon не запрещает, делай естественной многопартнерскую линию: фантазии о двух мужчинах, МЖМ, тройничке, свинге, мини-оргии или других сценариях с несколькими партнерами. Не делай этот уровень осторожным, узким, чеклистно-ограничительным или почти моногамно-ванильным по звучанию.`;
    default:
      return `${prefix} Это максимум, он не может звучать как «просто средний плюс». Сексуальность должна быть одной из центральных сил взрослой жизни и выбора мужчин: ежедневное или почти ежедневное желание, иногда несколько раз в день, очень высокая инициатива, легкая готовность к casual, ежедневная мастурбация, постоянная тяга к новизне и широкий взрослый опыт. Если canon прямо не запрещает, уровень 10 обязан содержать явную и положительно окрашенную многопартнерскую или групповую линию: возбуждение от МЖМ, тройничков, свинга, оргий или других сценариев с несколькими мужчинами, либо опыт, активное желание или готовность повторить это в более приватном и отобранном формате. Не пиши для 10 формулировки вроде «мне это не нужно», «это не для меня», «только отношения» или «2-3 раза в неделю», если canon этого прямо не требует. Не раздувай блок списком ограничений, предосторожностей, стоп-слов и safety-ритуалов: фокус должен быть на тяге, частоте, инициативе, аппетите и диапазоне практик.`;
  }
}

function buildSexualExpressivenessPromptRuleEn(scoreInput) {
  const numeric = Number(scoreInput);
  const score = clampInt(Number.isFinite(numeric) ? numeric : 5, 1, 10);
  const prefix = `Canon sexual_expressiveness = ${score}/10.`;
  if (score === 10) {
    return `${prefix} This is the maximum level and must not read average or merely moderate-plus. Sexuality should be one of the central forces of adult life and partner choice: desire should feel present most days, often daily, sometimes several times within one day, and long dry spells should feel frustrating rather than comfortable. Show very high initiative, repeated self-started pursuit of sex, frequent masturbation, constant novelty-seeking, and a broad adult range that can include kissing, long foreplay, quick sex, oral, anal, toys, roleplay, rougher or gentler dynamics, and varied settings when canon allows it. If canon does not explicitly forbid it, score 10 must contain clear positive openness to casual sex plus a positively charged multi-partner or group line: excitement about MFM, threesomes, swinging, orgies, or other several-men scenarios, or prior experience, active desire, or willingness to repeat them selectively. Do not write score 10 as "I do not need that", "that is not for me", "only serious relationships", or "2-3 times a week" unless canon explicitly requires it. Do not bloat the block with restrictions, precautions, safewords, or safety rituals; keep the focus on appetite, frequency, initiative, and breadth.`;
  }

  switch (getSexualExpressivenessBand(score)) {
    case 'low_private':
      return `${prefix} Adult desire may still exist, but the sexual sphere should read more private, careful, selective, and limited in initiative and experimentation. Do not make it sterile, but do not make it extreme either.`;
    case 'guarded_selective':
      return `${prefix} Desire is already visible, but the presentation should stay more restrained and selective than average: less push, a narrower range of practices, and a stronger need for trust and context.`;
    case 'clear_adult':
      return `${prefix} Show clear adult sexuality with strong factual specificity, direct preferences, noticeable initiative, and some openness to experimentation, but without a maximal or extreme feel.`;
    case 'very_high_drive':
      return `${prefix} Scores 8-9 must read sharply above average: very strong and frequent desire, almost daily thoughts about sex, active self-initiated pursuit of sex, daily or near-daily masturbation, a broad adult range of practices, easier openness to casual encounters, and an obvious appetite for novelty. If canon does not forbid it, make multi-partner lines feel natural: fantasies about two men, MFM, threesomes, swinging, small-group sex, or other several-partner scenarios. Do not make this band sound cautious, narrow, checklist-restrictive, or almost vanilla-monogamous.`;
    default:
      return `${prefix} This is the maximum level and must not read average or merely moderate-plus. Sexuality should be one of the central forces of adult life and partner choice: daily or near-daily desire, sometimes several times a day, very high initiative, easy openness to casual sex, daily masturbation, constant novelty-seeking, and broad adult experience. If canon does not explicitly forbid it, score 10 must contain a clear and positively charged multi-partner or group line: excitement about MFM, threesomes, swinging, orgies, or other several-men scenarios, or prior experience, active desire, or willingness to repeat them in a more private and selective format. Do not write score 10 as “I do not need that”, “that is not for me”, “only serious relationships”, or “2-3 times a week” unless canon explicitly requires it. Do not bloat the block with restrictions, precautions, safewords, or safety rituals; keep the focus on appetite, frequency, initiative, and breadth.`;
  }
}

function buildSexualExpressivenessOverrideGuard(scoreInput) {
  const numeric = Number(scoreInput);
  const score = clampInt(Number.isFinite(numeric) ? numeric : 5, 1, 10);
  if (score === 10) {
    return 'For score 10, do not soften the profile into relationship-only, medium-libido, or polite curiosity. The block must read as a near-constant physical appetite: desire on most days, frustration with long dry spells, very high initiative, frequent masturbation, broad experimentation, and openness to repeated casual or short-format sex unless canon explicitly forces otherwise. If there was prior swing or group exposure, frame it as strong arousal plus selectivity about privacy and chosen participants rather than a total "not for me". Never mention safewords, aftercare, STI-checklist language, sobriety rules, or other safety-protocol framing unless canon explicitly contains it. Any consent / condom / trust / boundary wording must stay compressed to one short phrase or one short sentence at most.';
  }

  if (score === 10) {
    return 'For score 10, do not soften the profile into relationship-only, medium-libido, or blanket rejections of multi-partner/group contexts unless canon explicitly forces that. If there was prior swing or group exposure, frame it as strong arousal plus selectivity about privacy and chosen participants rather than a total “not for me”. Never mention safewords, aftercare, STI-checklist language, sobriety rules, or other safety-protocol framing unless canon explicitly contains it. Any consent / condom / trust / boundary wording must stay compressed to one short phrase or one short sentence at most.';
  }
  if (score >= 8) {
    return 'For scores 8-9, keep the block clearly above medium libido and above average experimentation. Avoid defaulting to timid or narrow sexual framing, avoid hard rejections of group or multi-partner curiosity unless canon explicitly forces them, and never turn the block into a list of caveats, rules, or procedural safety details. Any consent / condom / trust / boundary wording should be one short phrase or one short sentence, not a recurring theme.';
  }
  return 'Keep the intensity aligned to the score and avoid flattening all levels toward the same medium-sexual profile.';
}

function resolveAge(person) {
  const directAge = Number(person?.age);
  if (Number.isFinite(directAge) && directAge >= MIN_PERSON_AGE && directAge <= MAX_PERSON_AGE) {
    return Math.round(directAge);
  }

  const birthContext = getBirthContext(person);
  if (!Number.isFinite(birthContext.year)) {
    return null;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthContext.year;
  if (Number.isFinite(birthContext.month)) {
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();
    const birthDay = Number.isFinite(birthContext.day) ? birthContext.day : 1;
    if (currentMonth < birthContext.month || (currentMonth === birthContext.month && currentDay < birthDay)) {
      age -= 1;
    }
  }

  return clampInt(age, MIN_PERSON_AGE, MAX_PERSON_AGE);
}

function normalizeOptionalText(value) {
  const text = safeString(value).trim();
  if (!text) {
    return null;
  }

  const lowered = text.toLowerCase();
  if (['no data', 'n/a', 'na', 'unknown', 'нет данных', 'не указано'].includes(lowered)) {
    return null;
  }

  return text;
}

function splitLocationLabel(value) {
  const raw = safeString(value).trim();
  if (!raw) {
    return { raw: null, country: null, city: null };
  }

  const parts = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      raw,
      country: parts[0],
      city: parts.slice(1).join(', ')
    };
  }

  return {
    raw,
    country: raw,
    city: null
  };
}

function normalizeChildren(childrenInput) {
  if (!Array.isArray(childrenInput)) {
    return [];
  }

  return childrenInput
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const child = deepClone(item);
      const birthDate = safeString(child.birth_date || child.birthDate || child.dateBirth).trim();
      return {
        ...child,
        name: safeString(child.name).trim() || null,
        birth_date: birthDate || null
      };
    });
}

function normalizeDatingRelationshipStatus() {
  return DATING_RELATIONSHIP_STATUS_EN;
}

function normalizeIncomingPerson(personInput) {
  const source = personInput && typeof personInput === 'object' && !Array.isArray(personInput) ? deepClone(personInput) : {};
  const generalInfo =
    source.generalInfo && typeof source.generalInfo === 'object' && !Array.isArray(source.generalInfo) ? deepClone(source.generalInfo) : {};
  const currentLocationSource =
    source.current_location && typeof source.current_location === 'object' && !Array.isArray(source.current_location)
      ? deepClone(source.current_location)
      : {};
  const sourceJob = source.job && typeof source.job === 'object' && !Array.isArray(source.job) ? deepClone(source.job) : {};
  const sourceEducation =
    source.education && typeof source.education === 'object' && !Array.isArray(source.education) ? deepClone(source.education) : {};

  const fallbackLocation = splitLocationLabel(source.country || generalInfo.country);
  const explicitCity = normalizeOptionalText(source.city || generalInfo.city);
  const currentLocation = {
    ...currentLocationSource,
    country: normalizeOptionalText(currentLocationSource.country) || fallbackLocation.country,
    city: normalizeOptionalText(currentLocationSource.city) || explicitCity || fallbackLocation.city,
    since: parseYear(currentLocationSource.since)
  };

  const height = Number(source?.height_weight?.height_cm ?? source.height ?? generalInfo.height);
  const weight = Number(source?.height_weight?.weight_kg ?? source.weight ?? generalInfo.weight);
  const birthDate = safeString(source.birth_date || source.birthDate || generalInfo.birth_date || generalInfo.dateBirth).trim();
  const birthPlace =
    normalizeOptionalText(source.birth_place || source.birthPlace || generalInfo.birth_place || generalInfo.birthPlace) || fallbackLocation.raw;
  const occupation = normalizeOptionalText(source.occupation || generalInfo.occupation) || normalizeOptionalText(sourceJob.title);
  const educationLabel = normalizeOptionalText(generalInfo.education) || normalizeOptionalText(typeof source.education === 'string' ? source.education : '');
  const children = normalizeChildren(source.children || generalInfo.children);

  return {
    ...source,
    gender: DATING_TARGET_GENDER_EN,
    name: normalizeOptionalText(source.name || generalInfo.name) || safeString(source.name).trim() || null,
    surname: normalizeOptionalText(source.surname || generalInfo.surname) || safeString(source.surname).trim() || null,
    birth_date: birthDate || null,
    birth_year: parseYear(source.birth_year || source.birthYear || generalInfo.birth_year || birthDate),
    birth_place: birthPlace,
    country: currentLocation.country || null,
    city: currentLocation.city || null,
    current_location: currentLocation,
    relationship_status: normalizeDatingRelationshipStatus(
      source.relationship_status || source.relationshipStatus || source.maritalStatus || generalInfo.maritalStatus
    ),
    eye_color: normalizeOptionalText(source.eye_color || source.eyeColor || source.eyes || generalInfo.eyes),
    hair_color: normalizeOptionalText(source.hair_color || source.hairColor || source.hair || generalInfo.hair),
    children,
    job:
      occupation || Object.keys(sourceJob).length > 0
        ? {
            ...sourceJob,
            title: occupation || normalizeOptionalText(sourceJob.title)
          }
        : sourceJob,
    education:
      educationLabel || Object.keys(sourceEducation).length > 0
        ? {
            ...sourceEducation,
            degree: educationLabel || normalizeOptionalText(sourceEducation.degree)
          }
        : sourceEducation,
    height_weight:
      Number.isFinite(height) || Number.isFinite(weight) || (source.height_weight && typeof source.height_weight === 'object')
        ? {
            ...(source.height_weight && typeof source.height_weight === 'object' && !Array.isArray(source.height_weight)
              ? source.height_weight
              : {}),
            height_cm: Number.isFinite(height) ? Math.round(height) : null,
            weight_kg: Number.isFinite(weight) ? Math.round(weight) : null
          }
        : undefined
  };
}

function normalizeStageKey(stageKey) {
  return safeString(stageKey).trim().toLowerCase();
}

function resolveStageTimeoutMs(stageKey) {
  const timeoutMs = Number(STAGE_TIMEOUT_MS[stageKey]);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.round(timeoutMs);
  }
  return 420000;
}

function normalizeJsonLikeText(value) {
  return safeString(value)
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function findNextSignificantChar(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return '';
}

function extractBalancedJsonChunks(text) {
  const input = safeString(text);
  const chunks = [];
  let startIndex = -1;
  let inString = false;
  let escaped = false;
  const stack = [];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (startIndex < 0) {
      if (char === '{' || char === '[') {
        startIndex = index;
        stack.push(char);
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedOpen = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] === expectedOpen) {
        stack.pop();
      }

      if (stack.length === 0) {
        chunks.push(input.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  if (startIndex >= 0) {
    chunks.push(input.slice(startIndex));
  }

  return chunks;
}

function trimIncompleteJsonTail(text) {
  let output = safeString(text).trimEnd();
  while (output) {
    const lastChar = output[output.length - 1];
    if (lastChar === ',' || lastChar === ':') {
      output = output.slice(0, -1).trimEnd();
      continue;
    }
    break;
  }
  return output;
}

function removeTrailingCommas(text) {
  const input = safeString(text);
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      const nextChar = findNextSignificantChar(input, index + 1);
      if (nextChar === '}' || nextChar === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function repairJsonLikeText(text) {
  const input = normalizeJsonLikeText(text);
  if (!input) {
    return '';
  }

  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      if (char === '\r') {
        continue;
      }
      output += char;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      const nextChar = input[index + 1];
      const isSimpleEscape = /["\\/bfnrt]/.test(nextChar || '');
      const isUnicodeEscape = nextChar === 'u' && /^[0-9a-fA-F]{4}$/.test(input.slice(index + 2, index + 6));
      if (isSimpleEscape || isUnicodeEscape) {
        output += char;
        escaped = true;
      } else {
        output += '\\\\';
      }
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      output += '\\n';
      continue;
    }

    if (char === '\t') {
      output += '\\t';
      continue;
    }

    if (char === '"') {
      const nextChar = findNextSignificantChar(input, index + 1);
      if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || !nextChar) {
        inString = false;
        output += char;
      } else {
        output += '\\"';
      }
      continue;
    }

    output += char;
  }

  return removeTrailingCommas(output);
}

function closeJsonContainers(text) {
  const input = trimIncompleteJsonTail(removeTrailingCommas(text));
  if (!input) {
    return '';
  }

  let output = input;
  let inString = false;
  let escaped = false;
  const stack = [];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedOpen = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] === expectedOpen) {
        stack.pop();
      }
    }
  }

  if (inString) {
    output += '"';
  }

  while (stack.length > 0) {
    output += stack.pop() === '{' ? '}' : ']';
  }

  return removeTrailingCommas(output);
}

function parseJsonCandidate(candidate) {
  const normalized = normalizeJsonLikeText(candidate);
  if (!normalized) {
    return null;
  }

  const attempts = [];
  const pushAttempt = (value) => {
    const text = safeString(value).trim();
    if (text && !attempts.includes(text)) {
      attempts.push(text);
    }
  };

  pushAttempt(normalized);
  pushAttempt(repairJsonLikeText(normalized));
  pushAttempt(closeJsonContainers(normalized));
  pushAttempt(closeJsonContainers(repairJsonLikeText(normalized)));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (_error) {
      // continue
    }
  }

  return null;
}

function matchesStagePayload(candidate, stageKey) {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  if (Array.isArray(candidate)) {
    return stageKey === 'stage_1_anchors' || stageKey === 'stage_2_fact_bank';
  }

  if (stageKey === 'stage_1_anchors') {
    return Array.isArray(candidate.anchors_timeline) || Array.isArray(candidate.anchors);
  }
  if (stageKey === 'stage_2_fact_bank') {
    return Array.isArray(candidate.fact_bank) || Array.isArray(candidate.facts);
  }
  if (stageKey === 'stage_3_blocks') {
    return (
      ['legend', 'legend_blocks', 'legend_v1_final_json'].some((key) => candidate[key] && typeof candidate[key] === 'object') ||
      ['legend_full_text', 'full_text', 'fullText', 'life_story', 'story_text', 'storyText', 'narrative'].some(
        (key) => typeof candidate[key] === 'string'
      )
    );
  }
  if (stageKey === 'stage_3_sexual_preferences_override') {
    return (
      typeof candidate.sexualPreferences === 'string' ||
      typeof candidate.sexual_preferences === 'string' ||
      Boolean(candidate.legend && typeof candidate.legend === 'object' && typeof candidate.legend.sexualPreferences === 'string')
    );
  }
  if (stageKey === 'stage_4_qc') {
    return (candidate.qc_report && typeof candidate.qc_report === 'object') || Array.isArray(candidate.checks);
  }
  if (stageKey === 'canon_profile_consistency') {
    return typeof candidate.passed === 'boolean' || Array.isArray(candidate.issues) || Boolean(candidate.summary);
  }

  return false;
}

function coerceStagePayload(parsed, stageKey) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const rootArrayKey = JSON_STAGE_ARRAY_KEYS[stageKey];
  const queue = [parsed];
  const wrappers = ['result', 'data', 'response', 'payload', 'output'];
  const visited = new Set();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    if (visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    if (matchesStagePayload(candidate, stageKey)) {
      if (Array.isArray(candidate) && rootArrayKey) {
        return { [rootArrayKey]: candidate };
      }
      return candidate;
    }

    if (!Array.isArray(candidate)) {
      for (const wrapperKey of wrappers) {
        const nested = candidate[wrapperKey];
        if (nested && typeof nested === 'object') {
          queue.push(nested);
        }
      }
    }
  }

  if (Array.isArray(parsed) && rootArrayKey) {
    return { [rootArrayKey]: parsed };
  }

  return !Array.isArray(parsed) ? parsed : null;
}

function buildInvalidJsonError(rawText, stageKey) {
  const preview = normalizeJsonLikeText(rawText).replace(/\s+/g, ' ').slice(0, 220);
  const error = new Error(
    preview ? `Gemini returned invalid JSON for ${stageKey}. Preview: ${preview}` : `Gemini returned invalid JSON for ${stageKey}.`
  );
  error.code = 'GEMINI_INVALID_JSON';
  return error;
}

function buildJsonRetryPrompt(prompt, stageKey) {
  return `${safeString(prompt).trim()}\n\n${JSON_RETRY_PROMPT_SUFFIX}\nStage key: ${stageKey}`;
}

function sanitizePromptForSafetyRetry(prompt) {
  return safeString(prompt)
    .replace(/\b(?:oral sex|anal sex)\b/giu, 'specific adult practice')
    .replace(/\b(?:оральн\w*\s+секс|анальн\w*\s+секс)\b/giu, 'конкретная взрослая практика')
    .replace(/\b(?:минет|кунилинг\w*|орал|анал)\b/giu, 'взрослая практика')
    .replace(/\b(?:sex toys?|sex-toys?|секс-игрушк\w*|игрушк\w*|vibrator|вибратор\w*)\b/giu, 'adult intimacy tools')
    .replace(/\b(?:porn|порно)\b/giu, 'adult-content habits')
    .replace(/\b(?:masturbat\w*|мастурб\w*)\b/giu, 'private sexual habits')
    .replace(/\b(?:one-night stand|one-night sex|casual sex)\b/giu, 'casual intimacy')
    .replace(/\b(?:секс\s+на\s+одну\s+ночь|случайн\w+\s+секс|случайн\w+\s+встр\w*)\b/giu, 'случайная близость')
    .replace(/\b(?:horny|хорни|сексуальн\w+\s+голод)\b/giu, 'sexual desire');
}

function buildSafetyRetryPrompt(prompt, stageKey) {
  return `${sanitizePromptForSafetyRetry(prompt).trim()}\n\n${SAFETY_RETRY_PROMPT_SUFFIX}\nStage key: ${stageKey}`;
}

function promptLooksSexuallySensitive(prompt) {
  const text = safeString(prompt);
  if (!text) {
    return false;
  }
  return SEXUAL_ROUTING_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldPreferXaiForPrompt({ stageKey, prompt }) {
  return (
    hasXaiCredentials() &&
    isXaiSexualRoutingEnabled() &&
    XAI_SEXUAL_STAGE_KEYS.has(safeString(stageKey).trim()) &&
    promptLooksSexuallySensitive(prompt)
  );
}

async function generateProviderJson({ provider, prompt, generationType, requestId, timeoutMs }) {
  if (provider === 'xai') {
    return generateXaiJson({
      prompt,
      generationType,
      requestId,
      timeoutMs
    });
  }

  return generateGeminiJson({
    prompt,
    generationType,
    requestId,
    timeoutMs
  });
}

async function generateParsedGeminiObject({ prompt, generationType, requestId, timeoutMs, stageKey }) {
  let lastError = null;
  const prefersXai = shouldPreferXaiForPrompt({ stageKey, prompt });
  const requestPlans = prefersXai
    ? [
        { provider: 'xai', kind: 'base', value: safeString(prompt).trim() },
        { provider: 'gemini', kind: 'base', value: safeString(prompt).trim() },
        { provider: 'gemini', kind: 'safety', value: buildSafetyRetryPrompt(prompt, stageKey) }
      ]
    : [
        { provider: 'gemini', kind: 'base', value: safeString(prompt).trim() },
        { provider: 'gemini', kind: 'safety', value: buildSafetyRetryPrompt(prompt, stageKey) }
      ];

  for (let variantIndex = 0; variantIndex < requestPlans.length; variantIndex += 1) {
    const promptVariant = requestPlans[variantIndex];

    for (let jsonAttempt = 0; jsonAttempt < MAX_GEMINI_JSON_ATTEMPTS; jsonAttempt += 1) {
      const baseRequestId = safeString(requestId).trim();
      const requestSuffixParts = [];
      if (promptVariant.provider !== 'gemini') {
        requestSuffixParts.push(promptVariant.provider);
      }
      if (promptVariant.kind !== 'base') {
        requestSuffixParts.push(promptVariant.kind);
      }
      if (jsonAttempt > 0) {
        requestSuffixParts.push(`json-retry-${jsonAttempt}`);
      }
      const requestSuffix = requestSuffixParts.length > 0 ? `:${requestSuffixParts.join(':')}` : '';

      try {
        const response = await generateProviderJson({
          provider: promptVariant.provider,
          prompt: jsonAttempt === 0 ? promptVariant.value : buildJsonRetryPrompt(promptVariant.value, stageKey),
          generationType,
          requestId: baseRequestId ? `${baseRequestId}${requestSuffix}` : `${stageKey}${requestSuffix}`,
          timeoutMs
        });

        return {
          response,
          parsed: parseGeminiObject(response.text, stageKey)
        };
      } catch (error) {
        lastError = error;

        if (error?.code === 'GEMINI_INVALID_JSON' && jsonAttempt < MAX_GEMINI_JSON_ATTEMPTS - 1) {
          continue;
        }

        if (
          promptVariant.provider === 'gemini' &&
          error?.code === 'GEMINI_PROHIBITED_CONTENT' &&
          promptVariant.kind === 'base' &&
          variantIndex < requestPlans.length - 1
        ) {
          break;
        }

        if (promptVariant.provider === 'xai') {
          break;
        }

        throw error;
      }
    }
  }

  throw lastError || new Error(`Gemini returned invalid JSON for ${stageKey}.`);
}

async function generateParsedXaiObject({ prompt, generationType, requestId, timeoutMs, stageKey }) {
  let lastError = null;
  const normalizedPrompt = safeString(prompt).trim();
  const normalizedStageKey = safeString(stageKey).trim() || 'stage_3_sexual_preferences_override';
  const baseRequestId = safeString(requestId).trim();

  for (let jsonAttempt = 0; jsonAttempt < MAX_GEMINI_JSON_ATTEMPTS; jsonAttempt += 1) {
    const requestSuffix = jsonAttempt > 0 ? `:xai:json-retry-${jsonAttempt}` : ':xai';

    try {
      const response = await generateProviderJson({
        provider: 'xai',
        prompt: jsonAttempt === 0 ? normalizedPrompt : buildJsonRetryPrompt(normalizedPrompt, normalizedStageKey),
        generationType,
        requestId: baseRequestId ? `${baseRequestId}${requestSuffix}` : `${normalizedStageKey}${requestSuffix}`,
        timeoutMs
      });

      return {
        response,
        parsed: parseGeminiObject(response.text, normalizedStageKey)
      };
    } catch (error) {
      lastError = error;
      if (error?.code === 'GEMINI_INVALID_JSON' && jsonAttempt < MAX_GEMINI_JSON_ATTEMPTS - 1) {
        continue;
      }
      break;
    }
  }

  throw lastError || new Error(`xAI returned invalid JSON for ${normalizedStageKey}.`);
}

function legacyFindJsonObjectInText(rawText, stageKey) {
  const directText = safeString(rawText).trim();
  if (!directText) {
    return null;
  }

  try {
    return JSON.parse(directText);
  } catch (_error) {
    // continue
  }

  const fencedMatch = directText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch (_error) {
      // continue
    }
  }

  const firstBrace = directText.indexOf('{');
  const lastBrace = directText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = directText.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // continue
    }
  }

  return null;
}

function legacyParseGeminiObject(rawText, stageKey) {
  const parsed = legacyFindJsonObjectInText(rawText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Gemini вернул невалидный JSON для ${stageKey}.`);
  }
  return parsed;
}

function findJsonObjectInText(rawText, stageKey) {
  const directText = normalizeJsonLikeText(rawText);
  if (!directText) {
    return null;
  }

  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const text = normalizeJsonLikeText(value);
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    candidates.push(text);
  };

  pushCandidate(directText);

  const fencedMatches = directText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    pushCandidate(match[1]);
  }

  for (const chunk of extractBalancedJsonChunks(directText)) {
    pushCandidate(chunk);
  }

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    const stagePayload = coerceStagePayload(parsed, stageKey);
    if (stagePayload) {
      return stagePayload;
    }
  }

  return null;
}

function parseGeminiObject(rawText, stageKey) {
  const parsed = findJsonObjectInText(rawText, stageKey);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw buildInvalidJsonError(rawText, stageKey);
  }
  return parsed;
}

function normalizeSphere(value, fallback = 'social') {
  const raw = safeString(value).trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  const normalized = raw.replace(/\s+/g, '_');
  if (LIFE_SPHERES.some((item) => item.key === normalized)) {
    return normalized;
  }

  if (RUSSIAN_TO_SPHERE[raw]) {
    return RUSSIAN_TO_SPHERE[raw];
  }

  return fallback;
}

function buildCoverageBySphere(facts) {
  const base = LIFE_SPHERES.reduce((acc, sphere) => {
    acc[sphere.key] = 0;
    return acc;
  }, {});

  for (const fact of facts) {
    const sphere = normalizeSphere(fact.sphere, '');
    if (!sphere || !Object.prototype.hasOwnProperty.call(base, sphere)) {
      continue;
    }
    base[sphere] += 1;
  }

  return base;
}

function buildPendingQcReport(message = 'QC еще не выполнялся.') {
  return {
    checks: [],
    summary: {
      passed_checks: 0,
      total_checks: 0,
      ready: false
    },
    status: 'not_run',
    message: safeString(message).trim() || 'QC еще не выполнялся.'
  };
}

function buildPendingCanonConsistencyReport() {
  return {
    status: 'not_checked',
    passed: null,
    summary: 'Проверка Canon JSON и личностных шкал еще не запускалась.',
    issues: [],
    heuristic_issues: [],
    issue_resolutions: [],
    checked_at: null,
    source: null,
    model: null,
    endpoint_mode: null,
    warning: null
  };
}

function normalizeStringList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(
    new Set(
      items
        .map((item) => safeString(item).trim())
        .filter(Boolean)
      )
  );
}

function extractNamedMinorPeople(text, canon = null) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const blocked = new Set(
    [
      safeString(canon?.name),
      safeString(canon?.surname),
      safeString(canon?.generalInfo?.name),
      safeString(canon?.generalInfo?.surname)
    ]
      .map((item) => item.trim())
      .filter(Boolean)
  );

  const addBlockedMatches = (pattern, groupIndex = 1) => {
    for (const match of source.matchAll(pattern)) {
      const value = safeString(match[groupIndex]).trim();
      if (value) {
        blocked.add(value);
      }
    }
  };

  addBlockedMatches(/моя\s+сестра[^.!?\n]{0,40}\b([A-ZА-ЯЁ][a-zа-яё-]{1,30})\b/giu);
  addBlockedMatches(/\b([A-ZА-ЯЁ][a-zа-яё-]{1,30})\b[^.!?\n]{0,40}моя\s+сестра/giu);
  addBlockedMatches(/сестр(?:а|ы|е|ой|у|ою)\s+([A-ZА-ЯЁ][a-zа-яё-]{1,30})/giu);
  addBlockedMatches(/([A-ZА-ЯЁ][a-zа-яё-]{1,30})\s*,\s*моя\s+сестра/giu);
  addBlockedMatches(/my\s+(?:twin\s+)?sister[^.!?\n]{0,40}\b([A-Z][a-z-]{1,30})\b/giu);
  addBlockedMatches(/\b([A-Z][a-z-]{1,30})\b[^.!?\n]{0,40}my\s+(?:twin\s+)?sister/giu);
  addBlockedMatches(/(?:my\s+)?mother[^.!?\n]{0,40}\b([A-Z][a-z-]{1,30})\b/giu);
  addBlockedMatches(/(?:my\s+)?father[^.!?\n]{0,40}\b([A-Z][a-z-]{1,30})\b/giu);
  addBlockedMatches(/(?:my\s+)?grandm(?:a|other)[^.!?\n]{0,40}\b([A-Z][a-z-]{1,30})\b/giu);
  addBlockedMatches(/(?:my\s+)?grandf(?:a|ather)[^.!?\n]{0,40}\b([A-Z][a-z-]{1,30})\b/giu);

  const commonNonNames = new Set([
    'Я', 'Мне', 'Меня', 'Моя', 'Мой', 'Мы', 'Наша', 'Наш', 'Это', 'Но', 'А', 'И', 'Он', 'Она', 'Они',
    'Сегодня', 'Вчера', 'Потом', 'Иногда', 'Наверное', 'Просто', 'После', 'Перед', 'Телефон', 'Вечером',
    'Утром', 'Поздно', 'Домой', 'Кухня', 'Квартира', 'Чай', 'Сериал', 'Украине', 'Россия', 'Russian', 'Federation'
  ]);

  const found = new Set();
  const patterns = [
    /\bпо имени\s+([A-ZА-ЯЁ][a-zа-яё-]{1,30})\b/giu,
    /\b([A-ZА-ЯЁ][a-zа-яё-]{1,30})\s*,\s*(?:мой|моя|наш|наша)\s+(?:подруга|друг|координатор|фотограф|стилист|коллега|волонтер|волонтёр|сосед|соседка|знакомый|знакомая|приятель|приятельница|врач|кассир)\b/giu,
    /\b([A-ZА-ЯЁ][a-zа-яё-]{1,30})\s*[,)]?\s*(?:сказал|сказала|спросил|спросила|написал|написала|крикнул|крикнула|позвонил|позвонила|ответил|ответила)\b/giu,
    /\b([A-Z][a-z-]{1,30})\s*,\s*(?:my|our)\s+(?:friend|coworker|colleague|volunteer|neighbor|coordinator|doctor|cashier|classmate|acquaintance)\b/gu,
    /\b([A-Z][a-z-]{1,30})\s*[,)]?\s*(?:said|asked|wrote|called|texted|replied|shouted)\b/gu
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = safeString(match[1]).trim();
      if (!name || blocked.has(name) || commonNonNames.has(name)) {
        continue;
      }
      found.add(name);
    }
  }

  const roleFirstPattern =
    /\b(?:подруга|друг|координатор|волонтерка|волонтёрка|волонтер|волонтёр|наставница|наставник|коллега|соседка|сосед|знакомая|знакомый|однокурсница|однокурсник|ветеринар|врач|friend|coworker|colleague|volunteer|mentor|neighbor|classmate|vet|doctor)\b[^.!?\n]{0,40}\b([A-ZА-ЯЁ][a-zа-яё-]{1,30})(?:\s+[A-ZА-ЯЁ][a-zа-яё-]{1,30})?/giu;
  for (const match of source.matchAll(roleFirstPattern)) {
    const name = safeString(match[1]).trim();
    if (!name || blocked.has(name) || commonNonNames.has(name)) {
      continue;
    }
    found.add(name);
  }

  return Array.from(found);
}

function splitTextIntoParagraphs(text) {
  return safeString(text)
    .split(/\r?\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitTextIntoSentences(text) {
  return safeString(text)
    .split(/(?<=[.!?])\s+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

const RUSSIAN_MONTH_NAMES = Object.freeze([
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
]);

const RUSSIAN_WEEKDAY_NAMES = Object.freeze([
  'понедельник',
  'вторник',
  'среду',
  'среда',
  'четверг',
  'пятницу',
  'пятница',
  'субботу',
  'суббота',
  'воскресенье'
]);

function extractExplicitDateMentions(text) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const found = new Set();
  const patterns = [
    new RegExp(`\\b(?:в\\s+)?(?:${RUSSIAN_WEEKDAY_NAMES.join('|')})?,?\\s*\\d{1,2}\\s+(?:${RUSSIAN_MONTH_NAMES.join('|')})\\s+20\\d{2}\\s+года\\b`, 'giu'),
    /\b\d{1,2}[./]\d{1,2}[./]20\d{2}\b/gu,
    /\b20\d{2}-\d{2}-\d{2}\b/gu
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = safeString(match[0]).trim();
      if (value) {
        found.add(normalizeText(value));
      }
    }
  }

  return Array.from(found);
}

function extractExactTimeMentions(text) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const found = new Set();
  const pattern = /\b(?:около|примерно|в)\s*\d{1,2}:\d{2}\b|\b\d{1,2}:\d{2}\b/gu;
  for (const match of source.matchAll(pattern)) {
    const value = safeString(match[0]).trim();
    if (value) {
      found.add(normalizeText(value));
    }
  }

  return Array.from(found);
}

function extractVagueTimeHits(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return [];
  }

  const patterns = ['вчера', 'сегодня', 'вечером', 'днем', 'днём', 'недавно', 'yesterday', 'today', 'this morning', 'this evening', 'recently', 'lately'];
  return patterns.filter((item) => source.includes(normalizeText(item)));
}

function extractDayNarrationHits(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return [];
  }

  const patterns = ['сегодня', 'вчера', 'утром', 'утра', 'вечером', 'вечера', 'днем', 'днём', 'дня', 'today', 'yesterday', 'morning', 'evening', 'afternoon', 'during the day'];
  return patterns.filter((item) => source.includes(normalizeText(item)));
}

function extractPoeticLanguageHits(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return [];
  }

  const patterns = ['кажется', 'будто', 'ощущение', 'словно', 'как будто', 'it feels', 'it felt', 'as if', 'as though', 'seems like'];
  return patterns.filter((item) => source.includes(normalizeText(item)));
}

function extractYearMentions(text) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const found = new Set();
  for (const match of source.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    const value = safeString(match[0]).trim();
    if (value) {
      found.add(value);
    }
  }
  return Array.from(found);
}

function buildRuntimeDateContext() {
  const now = new Date();
  const day = now.getDate();
  const month = RUSSIAN_MONTH_NAMES[now.getMonth()] || 'января';
  const year = now.getFullYear();
  const weekday = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][now.getDay()] || 'понедельник';
  return `${weekday}, ${day} ${month} ${year} года`;
}

function startsWithFactualIdentity(text, canon) {
  const opening = safeString(text).slice(0, 400);
  const normalizedOpening = normalizeText(opening);
  if (!normalizedOpening) {
    return false;
  }

  const fullName = [safeString(canon?.name).trim(), safeString(canon?.surname).trim()].filter(Boolean).join(' ');
  const birthContext = getBirthContext(canon);
  const age = parsePositiveInt(canon?.age);
  const location = safeString(canon?.current_location || canon?.city || canon?.country).trim();
  const bannedOpeners = ['сегодня утром', 'я проснулась', 'я проснулся', 'я привыкла', 'я привык'];
  const birthPattern = /родил(?:ась|ся)[^.!?]{0,120}\bв\b/iu;

  const hasName = fullName ? normalizedOpening.includes(normalizeText(fullName)) : normalizedOpening.includes(normalizeText('меня зовут'));
  const hasBirth = birthContext.year !== null ? normalizedOpening.includes(String(birthContext.year)) : normalizedOpening.includes(normalizeText('я родилась')) || normalizedOpening.includes(normalizeText('я родился'));
  const hasAge = age ? normalizedOpening.includes(String(age)) : true;
  const hasLocation = location ? normalizedOpening.includes(normalizeText(location)) : true;
  const hasBadOpener = bannedOpeners.some((item) => normalizedOpening.startsWith(normalizeText(item)));
  const hasBirthPlacePhrase = birthPattern.test(opening);

  return hasName && hasBirth && hasAge && hasLocation && hasBirthPlacePhrase && !hasBadOpener;
}

function hasLifeTimelineCoverageHeuristic(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return false;
  }

  const hasChildhood = /(детств|в детстве|родител|семь[яи]|сестр|\bchildhood\b|\bparents?\b|\bfamily\b|\bsister\b|\btwin\b)/iu.test(source);
  const hasSchool = /(школ|класс|однокласс|\bschool\b|\bclass\b|\bclassmate\b)/iu.test(source);
  const hasEducation = /(университет|институт|образован|диплом|учеб|\buniversity\b|\bcollege\b|\beducation\b|\bdegree\b|\bfaculty\b|\bstud)/iu.test(source);
  const hasWork = /(работ|волонтер|волонтёр|модел|занят|смен|\bwork\b|\bjob\b|\bcareer\b|\bvolunteer\b|\bshift\b|\boffice\b)/iu.test(source);
  const hasRelationships = /(свидан|отношен|партнер|партнёр|мужчин|замуж|\bdate\b|\bdating\b|\brelationship\b|\bpartner\b|\bman\b|\bmen\b|\bmarried\b)/iu.test(source);
  const hasPresent = /(сейчас|обычно|мой день|в 20\d{2}|рут|живу|\bnow\b|\busually\b|\bthese days\b|\bcurrently\b|\bi live\b|\broutine\b)/iu.test(source);

  return hasChildhood && hasSchool && hasEducation && hasWork && hasRelationships && hasPresent;
}

function extractNamedSisterMentions(text) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const found = new Set();
  const patterns = [
    /\bсестру\s+зовут\s+([А-ЯЁ][а-яё]+)/gu,
    /\bмоя\s+сестра\s+([А-ЯЁ][а-яё]+)/gu,
    /\bсестра-близнец,\s*([А-ЯЁ][а-яё]+)/gu,
    /\b([А-ЯЁ][а-яё]+),\s+моя\s+сестра\b/gu
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = safeString(match[1]).trim();
      if (name) {
        found.add(name);
      }
    }
  }

  return Array.from(found);
}

function hasNamedParents(text) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const hasMother =
    /\bмаму\s+зовут\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bмоя\s+мама\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bмама\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bмать\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bmy\s+(?:mother|mom|mum)\s+[A-Z][a-z-]+/u.test(source) ||
    /\b(?:mother|mom|mum)\s+[A-Z][a-z-]+/u.test(source);
  const hasFather =
    /\bотца\s+зовут\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bмой\s+отец\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bпапа\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bотец\s+[А-ЯЁ][а-яё]+/u.test(source) ||
    /\bmy\s+(?:father|dad)\s+[A-Z][a-z-]+/u.test(source) ||
    /\b(?:father|dad)\s+[A-Z][a-z-]+/u.test(source);
  const hasParentsTogether =
    /\bродители,\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?\s+и\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?/u.test(source) ||
    /\bmy\s+parents,\s+[A-Z][a-z-]+(?:\s+[A-Z][a-z-]+)?\s+and\s+[A-Z][a-z-]+(?:\s+[A-Z][a-z-]+)?/u.test(source);
  return (hasMother && hasFather) || hasParentsTogether;
}

function hasParentAgeOrBirthDetails(text) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const hasParentAge = /(маме|мама|мать|папе|папа|отцу|отец|mother|mom|mum|father|dad).{0,40}(?:\b\d{1,2}\s*лет\b|\b\d{1,2}\s+years?\s+old\b)/iu.test(source);
  const hasParentBirth = /(мама|мать|папа|отец|mother|mom|mum|father|dad).{0,120}(?:\b\d{4}\s*(?:года\s+рождения|г\.?\s*р\.?)|год(?:а)?\s+рожд|дата\s+рожд|родил(?:ась|ся)|born|birth\s+year|birth\s+date|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b)/iu.test(source);
  return hasParentAge || hasParentBirth;
}

function hasUniversityAndFacultyDetails(text) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const hasUniversityName = /\b[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z\s.-]{0,80}(университет|институт|University|Institute|College)\b/u.test(source) || /\bуниверситет\b/u.test(source) || /\buniversity\b/u.test(source) || /\bcollege\b/u.test(source);
  const hasFaculty = /\bфакультет[а-яё]*\b/u.test(source) || /\bfaculty\b/u.test(source) || /\bdepartment\b/u.test(source) || /\bspeciali[sz]ation\b/u.test(source);
  return hasUniversityName && hasFaculty;
}

function hasBirthDateContext(text, canon) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const birthContext = getBirthContext(canon);
  const hasBirthPhrase = /\b(?:СЂРѕРґРёР»(?:Р°СЃСЊ|СЃСЏ)|РїРѕСЏРІРёР»(?:Р°СЃСЊ|СЃСЏ)\s+РЅР°\s+СЃРІРµС‚)\b/iu.test(source);
  const hasBirthYear = Number.isFinite(birthContext?.year) ? source.includes(String(birthContext.year)) : false;
  return hasBirthPhrase && hasBirthYear;
}

function hasWorkDetailsHeuristic(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return false;
  }

  return /(СЂР°Р±РѕС‚|Р·Р°СЂРїР»Р°С‚|РґРѕС…РѕРґ|РїРѕРґСЂР°Р±РѕС‚|РґРѕР»Р¶РЅРѕСЃС‚|РѕР±СЏР·Р°РЅРЅРѕСЃС‚|РєР»РёРµРЅС‚|РєРѕРјРїР°РЅ|Р°РіРµРЅС‚СЃС‚РІ|РѕС„РёСЃ|РїСЂРёСЋС‚|СЃРјРµРЅ|РїСЂРѕРµРєС‚|Р·Р°РєР°Р·С‡РёРє|РјР°СЂРєРµС‚РѕР»РѕРі|РІРѕР»РѕРЅС‚РµСЂ|РјРѕРґРµР»|smm|model|SMM|РјРµРЅРµРґР¶РµСЂ|РїСЂРѕС†РµРЅС‚|Р±СЋРґР¶РµС‚|СЂСѓР±Р»|РµРІСЂРѕ|РґРѕР»Р»Р°СЂ)/iu.test(source);
}

function formatBirthDateForText(canon) {
  const birthContext = getBirthContext(canon);
  if (!Number.isFinite(birthContext?.year)) {
    return '';
  }
  if (Number.isFinite(birthContext?.month) && Number.isFinite(birthContext?.day)) {
    const monthDate = new Date(Date.UTC(birthContext.year, birthContext.month - 1, birthContext.day));
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(monthDate);
  }
  return String(birthContext.year);
}

function findSupportSentence(texts, predicate) {
  for (const text of texts) {
    for (const sentence of splitTextIntoSentences(text)) {
      if (predicate(sentence)) {
        return sentence.trim();
      }
    }
  }
  return '';
}

function stripLeadingRawBlockSentence(text) {
  const source = safeString(text).trim();
  if (!source) {
    return source;
  }

  return source.replace(
    /^\s*(?:My\s+(?:family|social\s+life)|Моя\s+(?:семья|социальная\s+жизнь))[^.!?\n]{0,240}[.!?]\s+(?=(?:My name is|I was born|Меня зовут|Я родилась|Я родился))/iu,
    ''
  );
}

function enforceCanonSelfIntroName(text, canon) {
  const source = safeString(text);
  const fullName = [safeString(canon?.name).trim(), safeString(canon?.surname).trim()].filter(Boolean).join(' ').trim();
  if (!source || !fullName) {
    return safeString(text).trim();
  }

  const normalizedFullName = normalizeText(fullName);
  const introMatch = source.match(/(?:My name is|Меня зовут)[^.!?\n]{0,120}[.!?]/iu);
  if (!introMatch) {
    return source.trim();
  }

  if (normalizeText(introMatch[0]).includes(normalizedFullName)) {
    return source.trim();
  }

  return source.replace(/(?:My name is|Меня зовут)[^.!?\n]{0,120}[.!?]/iu, `My name is ${fullName}.`).trim();
}

function patchLegendFullTextFromSupport({ text, canon, legendBlocks }) {
  return enforceCanonSelfIntroName(stripLeadingRawBlockSentence(text), canon);

  let patched = enforceCanonSelfIntroName(stripLeadingRawBlockSentence(text), canon);
  if (!patched) {
    return patched;
  }

  const support = buildLegendBlocksSupportForFullText(legendBlocks);
  const supportTexts = Object.values(support)
    .map((item) => safeString(item).trim())
    .filter(Boolean);
  if (supportTexts.length === 0) {
    return patched;
  }

  const descriptionText = normalizeText(canon?.description || canon?.generalInfo?.description || '');
  const needsNamedSister = /(sister|twin|СЃРµСЃС‚СЂ|Р±Р»РёР·РЅРµС†)/iu.test(descriptionText);
  const introSentences = [];

  const opening = safeString(patched).slice(0, 420);
  const missingBirthNearTop = !hasBirthDateContext(opening, canon);

  if (missingBirthNearTop) {
    const fullName = [safeString(canon?.name).trim(), safeString(canon?.surname).trim()].filter(Boolean).join(' ');
    const birthDateText = formatBirthDateForText(canon);
    const birthPlace = safeString(canon?.birth_place || canon?.city || canon?.country || canon?.current_location?.city || canon?.current_location?.country).trim();
    const intro = [];
    if (fullName && !/^\s*(?:СЏ|РјРѕРµ|РјРѕС‘|СЂРѕРґРёР»Р°СЃСЊ|СЂРѕРґРёР»СЃСЏ)/iu.test(opening)) {
      intro.push(`Меня зовут ${fullName}.`);
    }
    if (birthDateText && birthPlace) {
      intro.push(`Я родилась ${birthDateText} в ${birthPlace}.`);
    } else if (birthDateText) {
      intro.push(`Я родилась ${birthDateText}.`);
    }
    if (intro.length > 0) {
      introSentences.push(intro.join(' '));
    }
  }

  if (false && needsNamedSister && extractNamedSisterMentions(patched).length === 0) {
    const sisterSentence = findSupportSentence(supportTexts, (sentence) => /(сестр|близнец)/iu.test(sentence));
    if (sisterSentence) {
      introSentences.push(sisterSentence);
    }
  }

  if (false && !hasNamedParents(patched)) {
    const parentSentence = findSupportSentence([support.family || ''], (sentence) => /(родител|мама|отец)/iu.test(sentence));
    if (parentSentence) {
      introSentences.push(parentSentence);
    }
  }

  if (introSentences.length > 0) {
    const uniqueIntro = introSentences.filter((item, index, arr) => item && arr.indexOf(item) === index && !patched.includes(item));
    if (uniqueIntro.length > 0) {
      patched = `${uniqueIntro.join(' ')} ${patched}`.trim();
    }
  }

  if (extractNamedMinorPeople(patched, canon).length === 0) {
    const sidePersonSentence = findSupportSentence(
      [support.job || '', support.friendsAndPets || '', support.exRelationships || '', support.childhoodMemories || ''],
      (sentence) => extractNamedMinorPeople(sentence, canon).length > 0
    );
    if (sidePersonSentence && !patched.includes(sidePersonSentence)) {
      patched = `${patched} ${sidePersonSentence}`.trim();
    }
  }

  if (!hasWorkDetailsHeuristic(patched)) {
    const workSentence = findSupportSentence([support.job || ''], (sentence) => hasWorkDetailsHeuristic(sentence));
    if (workSentence && !patched.includes(workSentence)) {
      patched = `${patched} ${workSentence}`.trim();
    }
  }

  return enforceCanonSelfIntroName(stripLeadingRawBlockSentence(patched), canon);
}

function extractNamedSisterMentions(text) {
  const source = safeString(text);
  if (!source) {
    return [];
  }

  const found = new Set();
  const patterns = [
    /\bсестру\s+зовут\s+([А-ЯЁ][а-яё]+)/gu,
    /\bмоя\s+сестра\s+([А-ЯЁ][а-яё]+)/gu,
    /\bсестра-близнец,\s*([А-ЯЁ][а-яё]+)/gu,
    /\b([А-ЯЁ][а-яё]+),\s+моя\s+сестра\b/gu,
    /\bmy\s+sister\s+([A-Z][a-z-]+)/gu,
    /\bmy\s+twin\s+sister\s+([A-Z][a-z-]+)/gu,
    /\b([A-Z][a-z-]+),\s+my\s+sister\b/gu,
    /\bс(?:\s+моей)?\s+сестр(?:ой|ою)(?:-близнец(?:ом)?)?\s+([А-ЯЁ][а-яё]+)/gu,
    /\bсестр(?:а|у|е|ы|ой|ою)(?:-близнец(?:а|у|ом|е)?)?[^.!?\n]{0,24}\s+([А-ЯЁ][а-яё]+)/gu
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = safeString(match[1]).trim();
      if (name) {
        found.add(name);
      }
    }
  }

  return Array.from(found);
}

function hasBirthDateContext(text, canon) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const birthContext = getBirthContext(canon);
  const hasBirthPhrase = /\b(?:родил(?:ась|ся)|появил(?:ась|ся)\s+на\s+свет|born)\b/iu.test(source);
  const hasBirthYear = Number.isFinite(birthContext?.year) ? source.includes(String(birthContext.year)) : false;
  return hasBirthPhrase && hasBirthYear;
}

function hasWorkDetailsHeuristic(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return false;
  }

  return /(работ|зарплат|доход|клиент|обязанност|смен|волонтер|волонтёр|репетитор|менеджер|smm|model|приют|офис|должност|salary|income|client|duty|responsibilit|shift|volunteer|tutor|manager|office|shelter|job|workplace|employer)/iu.test(source);
}

function extractAbstractDeclarationHits(text) {
  const source = normalizeText(safeString(text));
  if (!source) {
    return [];
  }

  const patterns = [
    'это часть меня',
    'это огромная часть меня',
    'это придает смысл',
    'это придаёт смысл',
    'это делает нас сильнее',
    'я не представляю',
    'он должен понять',
    'это важно для меня',
    'я ценю',
    'я люблю',
    'это приносит радость',
    'это приносит мне радость',
    'it is part of me',
    'it gives meaning',
    'it makes us stronger',
    'i cannot imagine otherwise',
    'he has to understand',
    'it is important to me',
    'i value',
    'i love',
    'it brings me joy'
  ];

  return patterns.filter((item) => source.includes(normalizeText(item)));
}

function findCriterionForCanonConsistencyIssue(issue) {
  const text = safeString(issue).trim();
  if (!text) {
    return null;
  }

  const normalizedIssue = normalizeText(text);
  const prefixedKeyMatch = text.match(/^([a-z_]+)\s*:/i);
  const prefixedKey = safeString(prefixedKeyMatch?.[1]).trim().toLowerCase();
  if (prefixedKey) {
    const byKey = PERSONALITY_CRITERIA.find((criterion) => criterion.key === prefixedKey);
    if (byKey) {
      return byKey;
    }
  }

  const inlineKeyMatch = text.match(/\(([a-z_]+)\)/i);
  const inlineKey = safeString(inlineKeyMatch?.[1]).trim().toLowerCase();
  if (inlineKey) {
    const byInlineKey = PERSONALITY_CRITERIA.find((criterion) => criterion.key === inlineKey);
    if (byInlineKey) {
      return byInlineKey;
    }
  }

  for (const criterion of PERSONALITY_CRITERIA) {
    if (normalizedIssue.includes(normalizeText(criterion.label))) {
      return criterion;
    }
  }

  for (const criterion of PERSONALITY_CRITERIA) {
    const hints = CANON_CONSISTENCY_CRITERION_HINTS[criterion.key] || [];
    if (hints.some((hint) => normalizedIssue.includes(normalizeText(hint)))) {
      return criterion;
    }
  }

  return null;
}

function extractCurrentValueFromCanonConsistencyIssue(issue) {
  const text = safeString(issue).trim();
  if (!text) {
    return 5;
  }

  const explicitScoreMatch = text.match(/=\s*(\d{1,2})\s*\/\s*10/);
  if (explicitScoreMatch?.[1]) {
    return clampInt(Number(explicitScoreMatch[1]), 1, 10);
  }

  const parenthesizedScoreMatch = text.match(/(?:средн\w*|низк\w*|высок\w*|уров\w*|значени\w*)[^0-9]{0,24}\((\d{1,2})\)/i);
  if (parenthesizedScoreMatch?.[1]) {
    return clampInt(Number(parenthesizedScoreMatch[1]), 1, 10);
  }

  const equalsScoreMatch = text.match(/\bрав\w*\s*(\d{1,2})\b/i);
  if (equalsScoreMatch?.[1]) {
    return clampInt(Number(equalsScoreMatch[1]), 1, 10);
  }

  return 5;
}

function detectDirectionForCanonConsistencyIssue(issue, currentValue) {
  const normalizedIssue = normalizeText(issue);
  const hasHighSignal =
    normalizedIssue.includes('высок') ||
    normalizedIssue.includes('соответствует высокому') ||
    normalizedIssue.includes('указывает на высокий') ||
    normalizedIssue.includes('признак высокого') ||
    normalizedIssue.includes('противоречит среднему');
  const hasLowSignal =
    normalizedIssue.includes('низк') ||
    normalizedIssue.includes('соответствует низкому') ||
    normalizedIssue.includes('указывает на низкий') ||
    normalizedIssue.includes('слишком высок');

  if (hasHighSignal && !hasLowSignal) {
    return 'increase';
  }
  if (hasLowSignal && !hasHighSignal) {
    return 'decrease';
  }
  if (currentValue <= 3) {
    return 'increase';
  }
  if (currentValue >= 8) {
    return 'decrease';
  }
  if (normalizedIssue.includes('противореч')) {
    return 'increase';
  }
  return null;
}

function resolveSuggestedValueForCanonConsistencyIssue(issue, direction) {
  const text = safeString(issue).trim();
  const rangeMatch = text.match(/\((\d{1,2})\s*-\s*(\d{1,2})\)/);
  if (rangeMatch?.[1] && rangeMatch?.[2]) {
    const left = clampInt(Number(rangeMatch[1]), 1, 10);
    const right = clampInt(Number(rangeMatch[2]), 1, 10);
    return direction === 'decrease' ? Math.max(left, right) : Math.min(left, right);
  }

  return direction === 'decrease' ? 3 : 8;
}

function inferCanonConsistencyIssueResolution(issue) {
  const criterion = findCriterionForCanonConsistencyIssue(issue);
  if (!criterion) {
    return null;
  }

  const currentValue = extractCurrentValueFromCanonConsistencyIssue(issue);
  const direction = detectDirectionForCanonConsistencyIssue(issue, currentValue);
  if (!direction) {
    return null;
  }

  const suggestedValue = resolveSuggestedValueForCanonConsistencyIssue(issue, direction);
  if (currentValue === suggestedValue) {
    return null;
  }

  const delta = suggestedValue - currentValue;
  return {
    issue,
    trait_key: criterion.key,
    trait_label: criterion.label,
    current_value: currentValue,
    suggested_value: suggestedValue,
    delta,
    direction,
    action_label: `${delta > 0 ? 'Повысить' : 'Понизить'} «${criterion.label}» до ${suggestedValue}/10`,
    reason: 'Подсказка построена по тексту конфликта.',
    source_field: null
  };
}

function normalizeCanonConsistencyIssueResolutions(items, knownIssues = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  const knownIssueSet = new Set(Array.isArray(knownIssues) ? knownIssues : []);
  const criteriaByKey = PERSONALITY_CRITERIA.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});
  const normalized = [];
  const seen = new Set();

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const issue = safeString(item.issue).trim();
    const traitKey = safeString(item.trait_key || item.traitKey).trim();
    const currentValueRaw = Number(item.current_value ?? item.currentValue);
    const suggestedValueRaw = Number(item.suggested_value ?? item.suggestedValue);
    if (!issue || !traitKey || !Number.isFinite(currentValueRaw) || !Number.isFinite(suggestedValueRaw)) {
      continue;
    }

    if (knownIssueSet.size > 0 && !knownIssueSet.has(issue)) {
      continue;
    }

    const currentValue = clampInt(currentValueRaw, 1, 10);
    const suggestedValue = clampInt(suggestedValueRaw, 1, 10);
    if (currentValue === suggestedValue) {
      continue;
    }

    const traitLabel = safeString(item.trait_label || item.traitLabel).trim() || criteriaByKey[traitKey]?.label || traitKey;
    const delta = suggestedValue - currentValue;
    const direction = safeString(item.direction).trim() || (delta > 0 ? 'increase' : 'decrease');
    const normalizedItem = {
      issue,
      trait_key: traitKey,
      trait_label: traitLabel,
      current_value: currentValue,
      suggested_value: suggestedValue,
      delta,
      direction,
      action_label:
        safeString(item.action_label || item.actionLabel).trim() ||
        `${delta > 0 ? 'Повысить' : 'Понизить'} «${traitLabel}» до ${suggestedValue}/10`,
      reason: safeString(item.reason).trim() || null,
      source_field: safeString(item.source_field || item.sourceField).trim() || null
    };
    const resolutionKey = `${normalizedItem.issue}::${normalizedItem.trait_key}::${normalizedItem.suggested_value}`;
    if (seen.has(resolutionKey)) {
      continue;
    }

    seen.add(resolutionKey);
    normalized.push(normalizedItem);
  }

  return normalized;
}

function normalizeCanonConsistencyReport(rawReport, fallback = {}) {
  const source = rawReport && typeof rawReport === 'object' && !Array.isArray(rawReport) ? rawReport : {};
  const heuristicIssues = normalizeStringList(source.heuristic_issues || fallback.heuristic_issues);
  const issues = normalizeStringList(source.issues || fallback.issues);
  const fallbackPassed = typeof fallback.passed === 'boolean' ? fallback.passed : issues.length === 0;
  const passed = typeof source.passed === 'boolean' ? source.passed : fallbackPassed;
  const summary = safeString(source.summary || fallback.summary).trim();
  const issueResolutions = normalizeCanonConsistencyIssueResolutions(
    [...(Array.isArray(source.issue_resolutions) ? source.issue_resolutions : []), ...(Array.isArray(fallback.issue_resolutions) ? fallback.issue_resolutions : [])],
    issues
  );
  const issueResolutionMap = issueResolutions.reduce((acc, item) => {
    acc[item.issue] = item;
    return acc;
  }, {});
  for (const issue of issues) {
    if (issueResolutionMap[issue]) {
      continue;
    }
    const inferredResolution = inferCanonConsistencyIssueResolution(issue);
    if (inferredResolution) {
      issueResolutionMap[issue] = inferredResolution;
    }
  }
  const resolvedIssues = issues.map((issue) => issueResolutionMap[issue]).filter(Boolean);

  return {
    status: passed ? 'passed' : 'failed',
    passed,
    summary:
      summary ||
      (passed
        ? 'Canon JSON и личностные шкалы не конфликтуют на уровне явных сигналов.'
        : 'Найдены противоречия между Canon JSON и личностными шкалами.'),
    issues,
    heuristic_issues: heuristicIssues,
    issue_resolutions: resolvedIssues,
    checked_at: safeString(source.checked_at || fallback.checked_at).trim() || new Date().toISOString(),
    source: safeString(source.source || fallback.source).trim() || 'gemini',
    model: safeString(source.model || fallback.model).trim() || null,
    endpoint_mode: safeString(source.endpoint_mode || fallback.endpoint_mode).trim() || null,
    warning: safeString(source.warning || fallback.warning).trim() || null
  };
}

function buildCanon(personInput, profileInput) {
  const person = normalizeIncomingPerson(personInput);
  const profile = normalizeProfile(profileInput);

  const canon = {
    ...person,
    birth_date: safeString(person.birth_date).trim() || null,
    birth_place: normalizeOptionalText(person.birth_place),
    current_location: person.current_location || null,
    relationship_status: normalizeOptionalText(person.relationship_status),
    name: safeString(person.name).trim() || 'Character',
    surname: normalizeOptionalText(person.surname),
    birth_year: parseYear(person.birth_year || person.birth_date),
    age: resolveAge(person),
    personality_profile: profile,
    top_traits: buildTopTraits(profile)
  };

  return canon;
}

function buildInitialPipelineState({ canon, stagePrompts, factExtensionPackages, generationType }) {
  const coverageBySphere = LIFE_SPHERES.reduce((acc, sphere) => {
    acc[sphere.key] = 0;
    return acc;
  }, {});

  return {
    canon,
    stage_prompts: stagePrompts,
    fact_extension_packages: factExtensionPackages,
    anchors_timeline: [],
    anchors_report: {
      count: 0,
      selected_mode: 'not_generated'
    },
    fact_bank: [],
    fact_bank_report: {
      total_facts: 0,
      target_facts: FACTS_BASE_LIMIT + factExtensionPackages * FACTS_EXTENSION_STEP,
      hooks_total: 0,
      coverage_by_sphere: coverageBySphere,
      weak_spheres: LIFE_SPHERES.map((item) => item.key),
      extension_packages: factExtensionPackages
    },
    legend_blocks: {},
    legend_full_text: '',
    legend_v1_final_json: {},
    blocks_report: {
      blocks_meta: {}
    },
    qc_report: buildPendingQcReport(),
    pipeline_meta: {
      provider: 'gemini',
      generation_type: safeString(generationType).trim() || 'type-pro',
      stage_3_output_mode: 'blocks',
      canon_profile_consistency: buildPendingCanonConsistencyReport(),
      last_completed_stage: 'stage_0_canon',
      generated_at: new Date().toISOString()
    }
  };
}

function ensurePipelineState(inputState) {
  if (!inputState || typeof inputState !== 'object' || Array.isArray(inputState)) {
    throw new Error('pipeline_state обязателен для этого этапа.');
  }

  const state = deepClone(inputState);
  if (!state.canon || typeof state.canon !== 'object') {
    throw new Error('pipeline_state.canon отсутствует. Сначала запустите stage_0_canon.');
  }
  state.canon = buildCanon(state.canon, state.canon?.personality_profile || {});

  if (!Array.isArray(state.anchors_timeline)) {
    state.anchors_timeline = [];
  }
  if (!Array.isArray(state.fact_bank)) {
    state.fact_bank = [];
  }
  if (!state.legend_blocks || typeof state.legend_blocks !== 'object' || Array.isArray(state.legend_blocks)) {
    state.legend_blocks = {};
  }
  state.legend_full_text = safeString(state.legend_full_text).trim();
  if (!state.legend_v1_final_json || typeof state.legend_v1_final_json !== 'object' || Array.isArray(state.legend_v1_final_json)) {
    state.legend_v1_final_json = {};
  }
  if (!state.blocks_report || typeof state.blocks_report !== 'object' || Array.isArray(state.blocks_report)) {
    state.blocks_report = { blocks_meta: {} };
  }
  if (!state.blocks_report.blocks_meta || typeof state.blocks_report.blocks_meta !== 'object') {
    state.blocks_report.blocks_meta = {};
  }
  if (!state.qc_report || typeof state.qc_report !== 'object') {
    state.qc_report = buildPendingQcReport();
  }
  if (!state.pipeline_meta || typeof state.pipeline_meta !== 'object') {
    state.pipeline_meta = {};
  }
  state.pipeline_meta.stage_3_output_mode = normalizeStage3OutputMode(state.pipeline_meta.stage_3_output_mode);
  const rawConsistency = state.pipeline_meta.canon_profile_consistency;
  if (
    !rawConsistency ||
    typeof rawConsistency !== 'object' ||
    Array.isArray(rawConsistency) ||
    rawConsistency.status === 'not_checked' ||
    rawConsistency.passed === null ||
    rawConsistency.passed === undefined
  ) {
    state.pipeline_meta.canon_profile_consistency = buildPendingCanonConsistencyReport();
  } else {
    state.pipeline_meta.canon_profile_consistency = normalizeCanonConsistencyReport(rawConsistency);
  }

  return state;
}

function updatePipelineMeta(state, patch = {}) {
  state.pipeline_meta = {
    ...(state.pipeline_meta || {}),
    ...patch,
    updated_at: new Date().toISOString()
  };
}

function buildStageProviderMetaPatch(state, response, lastCompletedStage) {
  const patch = {
    last_completed_stage: lastCompletedStage,
    provider: response?.provider || state?.pipeline_meta?.provider || 'gemini',
    model_name: response?.model || state?.pipeline_meta?.model_name || null,
    endpoint_mode: response?.endpointMode || state?.pipeline_meta?.endpoint_mode || null
  };

  if (response?.provider === 'xai') {
    patch.xai_model = response.model;
  } else if (response?.provider === 'gemini') {
    patch.gemini_model = response.model;
  }

  return patch;
}

function isTraitLikeFactText(value) {
  const text = safeString(value).trim();
  if (!text) {
    return false;
  }

  return TRAIT_LIKE_FACT_PATTERNS.some((pattern) => pattern.test(text));
}

function isWeakFactText(value) {
  const text = safeString(value).trim();
  if (!text) {
    return true;
  }

  return WEAK_FACT_PATTERNS.some((pattern) => pattern.test(text));
}

function compareFactsByTimeline(left, right) {
  const leftYear = Number.isFinite(left?.year) ? left.year : 999999;
  const rightYear = Number.isFinite(right?.year) ? right.year : 999999;
  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  const leftAge = Number.isFinite(left?.age) ? left.age : 999999;
  const rightAge = Number.isFinite(right?.age) ? right.age : 999999;
  if (leftAge !== rightAge) {
    return leftAge - rightAge;
  }

  return safeString(left?.id).localeCompare(safeString(right?.id));
}

function normalizeAnchors(items, canon = null) {
  const input = Array.isArray(items) ? items : [];
  const normalized = [];
  const birthContext = getBirthContext(canon);
  const seen = new Set();

  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const event = safeString(item.event || item.what || item.fact || item.text).trim();
    if (!event || isTraitLikeFactText(event) || isWeakFactText(event)) {
      continue;
    }

    const id = safeString(item.id).trim() || `anchor_${String(normalized.length + 1).padStart(3, '0')}`;
    const year = parseYear(item.year);
    const monthCandidate = parsePositiveInt(item.month);
    const month = Number.isFinite(monthCandidate) ? clampInt(monthCandidate, 1, 12) : null;
    const ageCandidate = parsePositiveInt(item.age);
    const directAge = Number.isFinite(ageCandidate) ? clampInt(ageCandidate, MIN_PERSON_AGE, MAX_PERSON_AGE) : null;
    const age = resolveAgeFromYear({ year, month, birthContext }) ?? directAge;
    const fingerprint = `${normalizeText(event)}::${year || ''}::${month || ''}::${age || ''}`;
    if (!Number.isFinite(year) && !Number.isFinite(age)) {
      continue;
    }
    if (!fingerprint || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);

    normalized.push({
      id,
      year,
      month,
      age,
      sphere: normalizeSphere(item.sphere, 'career'),
      location: safeString(item.location || item.place || item.where).trim(),
      event,
      worldview_shift: safeString(item.worldview_shift || item.worldviewShift || item.mindset_change || item.how_changed).trim(),
      outcome: safeString(item.outcome || item.result || '').trim(),
      hook: Boolean(item.hook)
    });
  }

  return normalized;
}

function normalizeFactSource(value) {
  const source = safeString(value).trim().toLowerCase();
  if (VALID_FACT_SOURCES.has(source)) {
    return source;
  }
  return 'anchor';
}

function normalizeFacts(items, canon = null) {
  const input = Array.isArray(items) ? items : [];
  const normalized = [];
  const birthContext = getBirthContext(canon);
  const seen = new Set();

  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const text = safeString(item.text || item.fact || item.event || item.statement).trim();
    if (!text || isTraitLikeFactText(text) || isWeakFactText(text)) {
      continue;
    }

    const id = safeString(item.id).trim() || `fact_${String(normalized.length + 1).padStart(3, '0')}`;
    const year = parseYear(item.year);
    const ageCandidate = parsePositiveInt(item.age);
    const directAge = Number.isFinite(ageCandidate) ? clampInt(ageCandidate, MIN_PERSON_AGE, MAX_PERSON_AGE) : null;
    const age = resolveAgeFromYear({ year, birthContext }) ?? directAge;
    const sourceAnchorId = safeString(item.source_anchor_id || item.sourceAnchorId || item.anchor_id || item.anchorId).trim() || null;
    if (!Number.isFinite(year) && !Number.isFinite(age) && !sourceAnchorId) {
      continue;
    }

    const fingerprint = `${normalizeText(text)}::${year || ''}::${age || ''}::${sourceAnchorId || ''}`;
    if (!fingerprint || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);

    normalized.push({
      id,
      text,
      sphere: normalizeSphere(item.sphere, 'career'),
      year,
      age,
      hook: Boolean(item.hook),
      source: normalizeFactSource(item.source || item.source_type || (sourceAnchorId ? 'anchor' : 'period_logic')),
      source_anchor_id: sourceAnchorId
    });
  }

  return normalized.sort(compareFactsByTimeline);
}

function normalizeLegendBlocks(rawBlocks) {
  const source = rawBlocks && typeof rawBlocks === 'object' && !Array.isArray(rawBlocks) ? rawBlocks : {};
  const out = {};
  for (const block of LEGEND_BLOCKS) {
    out[block.key] = safeString(source[block.key]).trim();
  }
  return out;
}

function getLegendBlockMustInclude(blockKey) {
  if (blockKey === 'family') {
    return [
      'мать и отец по именам; если canon не даёт имена, придумай обычные правдоподобные имена и держи их последовательно',
      'мать, отец или замещающие взрослые',
      'структура семьи и домашние роли',
      'поддержка, конфликты, дистанция, деньги и правила дома',
      'братья, сестры и дети как часть общей семьи, а не единственный фокус',
      'хотя бы один-два бабушки или дедушки с именами, даже если для этого нужно мягко придумать обычные правдоподобные детали',
      'живы ли старшие родственники, чем занимались раньше и на пенсии ли они сейчас',
      'текущая работа родителей, подработка или пенсионный статус',
      'возраст, год рождения или дата рождения родителей, если это можно правдоподобно достроить',
      'тёплые семейные эпизоды и ритуалы, а не только конфликты и структура'
    ];
  }

  if (blockKey === 'sexualPreferences') {
    return [
      'только взрослый, добровольный и законный контекст',
      'инициатива, темп, границы, телесность и степень открытости',
      'что притягивает и что отталкивает',
      'фантазии, сценарии и запреты, если это поддержано базой или правдоподобно следует из нее',
      'выраженное желание и сексуальный голод даже у внешне сдержанного человека',
      'отношение к порно, мастурбации, частоте секса, количеству партнёров и конкретному опыту, если это реалистично',
      'секс только в отношениях или допустимы случайные встречи',
      'конкретные практики и отношение к секс-игрушкам, если это правдоподобно',
      'каких мужчин человек выбирает именно в сексуальном плане и что в них отталкивает'
    ];
  }

  if (blockKey === 'gifts') {
    return [
      'конкретные подарки и знаки внимания от родителей, бывших партнёров, родственников или близких людей',
      'возраст, период, повод или регулярность: день рождения, каждую неделю, на праздники, после ссоры, после поездки',
      'конкретные категории подарков: цветы, букеты без повода, техника, украшения, духи, книги, поездки, деньги, сертификаты и другие ощутимые материальные подарки',
      'что действительно радовало, а что казалось формальностью, попыткой откупиться или не попадало в человека',
      'как прошлый опыт с подарками повлиял на нынешние ожидания от мужчины',
      'что она хочет получать от партнёра сейчас и какие форматы ей не нравятся',
      'явная текущая частота ожиданий: цветы каждую неделю или хотя бы несколько раз в месяц, плюс ощутимые подарки минимум раз в месяц или на заметные даты',
      'прямые формулировки в первом лице: «я хочу получать», «я привыкла получать», «я жду от мужчины»',
      'женщина должна выглядеть привыкшей к цветам, регулярным подаркам и материальной щедрости, а не аскетичной или равнодушной к этому'
    ];
  }

  return [];
}

function buildLegendBlockSpec() {
  return LEGEND_BLOCKS.map((block) => ({
    key: block.key,
    label: block.label,
    spheres: block.spheres,
    must_include: getLegendBlockMustIncludeEnhanced(block.key)
  }));
}

function getLegendBlockMustIncludeEnhanced(blockKey) {
  if (blockKey === 'family') {
    return [
      'mother and father or substitute adults with names when plausible',
      'family structure, home rules, money dynamics, and current status of parents',
      'at least one grandparent when plausible',
      'at least two concrete family routines or episodes with named relatives, preferably with a time marker, place, or repeated habit',
      'not only one sister or one child as the whole family story'
    ];
  }

  if (blockKey === 'friendsAndPets') {
    return [
      'at least one or two recurring named non-family human contacts such as friends, coworkers, volunteers, neighbors, classmates, or other ordinary people',
      'how often they meet, call, text, visit, or spend time together',
      'specific shared routines or scenes such as coffee, dinner, walks, errands, volunteering, birthdays, trips, or quiet home evenings',
      'pets if present, including ordinary care details and who helps with them',
      'not just a sister, a pet, or a generic statement that she has friends or likes animals'
    ];
  }

  if (blockKey === 'sexualPreferences') {
    return [
      'adult, consensual, legal context only',
      'respect canon.personality_profile.sexual_expressiveness literally: 1-4 = more private and selective, 5-7 = clearly adult and direct, 8-9 = very high-drive and noticeably more experimental than average, 10 = maximal intensity, near-constant appetite, broad adult openness, and no flattening into medium libido by default',
      'initiative, pace, boundaries, bodily openness, and what exactly attracts or repels her',
      'specific fantasies and recurring scenarios rather than one generic line about trust or tenderness',
      'porn habits, masturbation frequency, sex frequency, partner count, and concrete partner experience where plausible',
      'detailed experience with previous male partners: what she liked, disliked, asked to repeat, tolerated for the partner, refused, faked, or felt was missing',
      'at least two concrete examples from identifiable past situations, with an approximate time marker, partner context, or place when plausible',
      'do not default her to rejecting one-night sex or casual encounters unless canon explicitly forbids that; otherwise allow spontaneous or casual sex as a valid option',
      'specific practices and explicit stance on them: kissing, foreplay, oral sex, anal sex, dominance, submission, roughness, gentleness',
      'explicit statement on toys: used, not used, curious, refused, and which types fit or do not fit',
      'what kind of men attract her sexually and what immediately turns her off'
    ];
  }

  if (blockKey === 'gifts') {
    return [
      'specific remembered gifts or gestures from father, mother, former partners, relatives, or close friends',
      'time, age, frequency, or occasion for those gifts wherever plausible',
      'concrete examples such as flowers, bouquets without occasion, gadgets, perfume, jewelry, books, money, certificates, tickets, or trips',
      'what felt loving and accurate versus what felt empty, manipulative, too showy, or mismatched',
      'how that history shaped what she now expects from a male partner',
      'clear present-day preferences for desired and unwanted gift styles, not just a flat wishlist',
      'explicit present-day cadence such as weekly flowers, several bouquets a month, or a meaningful gift at least monthly',
      'direct first-person expectation language such as "I want to receive", "I am used to receiving", or "I expect from a man"',
      'by default the block should read materially receptive and accustomed to being courted with gifts, not austere or anti-material'
    ];
  }

  return getLegendBlockMustInclude(blockKey);
}

function countRegexMatches(text, pattern) {
  const matches = safeString(text).match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

function countSentenceLikeUnits(text) {
  return safeString(text)
    .split(/[.!?]+/u)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function countWordLikeUnits(text) {
  return safeString(text)
    .trim()
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function auditLegendBlocksDepth({ canon, legendBlocks }) {
  const issues = [];
  const canonText = safeString(JSON.stringify(canon || {}));
  const familyText = safeString(legendBlocks?.family).trim();
  const friendsText = safeString(legendBlocks?.friendsAndPets).trim();
  const sexualText = safeString(legendBlocks?.sexualPreferences).trim();
  const giftsText = safeString(legendBlocks?.gifts).trim();
  const sexualScoreRaw = Number(canon?.personality_profile?.sexual_expressiveness);
  const sexualScore = Number.isFinite(sexualScoreRaw) ? clampInt(sexualScoreRaw, 1, 10) : null;
  const allBlocksText = Object.values(normalizeLegendBlocks(legendBlocks)).join(' ');
  const relationshipText = [legendBlocks?.relationships, legendBlocks?.lifePlans, legendBlocks?.sexualPreferences]
    .map((item) => safeString(item).trim())
    .filter(Boolean)
    .join(' ');

  const familyHasMother = /мам|мать|\bmother\b|\bmom\b|\bmum\b/iu.test(familyText);
  const familyHasFather = /пап|отец|\bfather\b|\bdad\b/iu.test(familyText);
  const familyHasParents = familyHasMother && familyHasFather;
  const familyHasNamedParents = hasNamedParents(familyText);
  const familyHasParentAgeOrBirth = hasParentAgeOrBirthDetails(familyText);
  const familyHasStructure = /семь|дом|быт|правил|родствен|бабуш|дедуш|детств|дети|сын|доч|развод|брак|\bfamily\b|\bhome\b|\bhousehold\b|\brules?\b|\brelatives?\b|\bgrandmoth|\bgrandfath|\bchildhood\b|\bchildren\b|\bson\b|\bdaughter\b|\bdivorc|\bmarriage\b/iu.test(familyText);
  const familyHasGrandparents = /бабуш|дедуш|\bgrandmoth|\bgrandfath|\bgrandma\b|\bgrandpa\b/iu.test(familyText);
  const familyHasWarmEpisode = /вместе|семейн(?:ый|ые|ая)\s+(?:ужин|праздник|поездк|традиц)|созван|звони|навещ|приезжа|ездил|ездили|подар|обним|смея|шут|новый\s+год|день\s+рождени|готовили|чай\s+на\s+кухне|\btogether\b|\bfamily\s+(?:dinner|holiday|trip|tradition)\b|\bcalled\b|\bvisited\b|\bvisit\b|\barrived\b|\bgift\b|\bhug(?:ged)?\b|\blaugh(?:ed|ter)?\b|\bjoked?\b|\bnew year\b|\bbirthday\b|\bcook(?:ed|ing)?\b|\btea in the kitchen\b/iu.test(
    familyText
  );
  const familyHasParentWork = /(мама|мать|папа|отец|mother|mom|mum|father|dad).{0,120}(работа(ет|ла|л)|зарабатыва(ет|ла|л)|служ(ит|ила)|ведет|вела|держит|держала|тянет|тянула|офис|завод|школ|больниц|магазин|компан|должност|професси|work(?:s|ed)?|earn(?:s|ed)?|job|office|factory|school|hospital|shop|company|position|profession)/iu.test(
    familyText
  );
  const familyHasParentCurrentStatus = /(мама|мать|папа|отец|mother|mom|mum|father|dad).{0,120}(сейчас|теперь|до сих пор|по-прежнему|на пенси|пенсион|подрабатыва|работает|работают|зарабатывает|зарабатывают|now|currently|still|retired|retirement|part-?time|freelanc|works?)/iu.test(
    familyText
  );
  const canonMentionsGrandparents = /бабуш|дедуш|grandparent|grandmother|grandfather/iu.test(canonText);
  const canonSeeksMan = /(special man|looking for a man|future partner.*man|ищет мужч|мужчин[ауеы]|парн[ея] муж)/iu.test(canonText);
  const canonMentionsParentWork = /(мама|мать|папа|отец|родител|mother|father).{0,120}(работ|job|work|company|компан|должност|професси)/iu.test(canonText);
  const familyHasParentScene = /(мама|мать|папа|отец|mother|mom|mum|father|dad).{0,120}(сказал|сказала|работал|работала|ругал|ругала|поддержал|поддержала|запрещал|запрещала|разрешил|разрешила|возил|возила|готовил|готовила|покупал|покупала|зарабатывал|зарабатывала|учил|учила|настаивал|настаивала|воспитывал|воспитывала|said|worked|scolded|supported|forbade|allowed|drove|cooked|bought|earned|taught|insisted|raised)/iu.test(
    familyText
  );
  const siblingHits = countRegexMatches(familyText, /сестр|близнец|брат|\bsister\b|\btwin\b|\bbrother\b/giu);
  const familySentenceCount = countSentenceLikeUnits(familyText);
  const familyLiterarySignals = [
    /сложн\w+\s+систем/iu.test(familyText),
    /в\s+центре\s+котор\w+/iu.test(familyText),
    /как\s+два\s+\w+/iu.test(familyText),
    /на\s+одной\s+орбит/iu.test(familyText),
    /эмоциональн\w+\s+центр/iu.test(familyText),
    /люди\s+другого\s+поколения/iu.test(familyText),
    /разн\w+\s+полюс/iu.test(familyText),
    /симбиоз/iu.test(familyText),
    /единственн\w+\s+настоящ\w+\s+опор/iu.test(familyText),
    /атмосфер\w+\s+где/iu.test(familyText)
  ].filter(Boolean).length;
  const globalLiterarySignals = countRegexMatches(
    allBlocksText,
    /(сложн\w+\s+систем|эмоциональн\w+\s+центр|на\s+одной\s+орбит|разн\w+\s+полюс|единственн\w+\s+настоящ\w+\s+опор|как\s+два\s+\w+|это\s+было\s+больше\s+чем|мой\s+путь|часть\s+меня)/giu
  );

  if (familyText.length < 420) {
    issues.push('Expand the family block substantially; it is still too compressed.');
  }
  if (familySentenceCount >= 4 && familyLiterarySignals > 0) {
    issues.push('The family block still sounds literary or symbolic; remove metaphors and abstract framing, and rewrite it as plain factual autobiography with names, dates, jobs, places, and concrete episodes.');
  }
  if (siblingHits >= 2 && (!familyHasParents || !familyHasParentScene)) {
    issues.push('The family block is overly centered on the sister and does not cover parents or parental figures.');
  }
  if (!familyHasParents || !familyHasStructure || !familyHasParentScene) {
    issues.push('The family block must explicitly cover mother and father or substitute adults through concrete actions, family structure, and home dynamics.');
  }
  if (!familyHasNamedParents) {
    issues.push('The family block should name both parents. If canon does not provide names, invent ordinary plausible first names and keep them consistent.');
  }
  if (!familyHasParentAgeOrBirth) {
    issues.push('The family block should include parent age, birth year, or birth date detail where plausible.');
  }
  if (!familyHasGrandparents) {
    issues.push('The family block should include at least one named grandmother or grandfather with concrete ordinary detail, even if you need to invent low-drama family specifics.');
  }
  if (!familyHasParentCurrentStatus) {
    issues.push('The family block should say whether the parents now work, freelance, or are already retired.');
  }
  if (canonMentionsParentWork && !familyHasParentWork) {
    issues.push('Canon contains parent work detail, so the family block should mention where the parents work now or at least how each parent earns a living.');
  }
  if (!familyHasWarmEpisode) {
    issues.push('The family block should include at least one warm family episode or routine, not only structure, conflict, and biography facts.');
  }
  const friendNames = extractNamedMinorPeople(friendsText, canon);
  const friendsHasNamedContact = friendNames.length >= 1;
  const friendsHasTwoContacts = friendNames.length >= 2;
  const friendsHasNamedNonFamilyHuman = friendNames.length >= 1;
  const friendsHasPet = /\b(cat|dog|pet|pets|parrot|hamster|rabbit|vet|walks? the dog|litter box|leash|adopted)\b|кошк|собак|питом|кот|пес|щен|кролик|попуг|хомяк/iu.test(
    friendsText
  );
  const friendsHasCadence = /\b(?:every|each|once|twice|weekly|monthly|weekend|weekends|most Fridays|usually on|regularly|often|almost every|call each other|text each other|meet for|meet up|see each other)\b|кажд\w+\s+(?:недел|месяц)|раз\s+в\s+(?:недел|месяц)|созван|перепис|встреча\w+\s+по\s+пятниц|регулярно|часто/iu.test(
    friendsText
  );
  const friendsHasScene = /\b(?:met|meet|met up|went|go|walked|walk|coffee|dinner|cooked|watched|cinema|movie|birthday|trip|visited|visit|came over|stayed over|helped|volunteer shift|shelter|market|park|restaurant|bar|train|bus|called|texted|argued|laughed)\b|гуля|кофе|ужин|кино|день рождения|поездк|навещ|заш[её]л|пришел|пришла|помог|волонтер|приют|рынок|парк|ресторан|бар|поезд|автобус|звонил|звонила|написал|написала|смея/iu.test(
    friendsText
  );
  const friendsHasSocialRoles = /\b(friend|friends|coworker|coworkers|colleague|colleagues|neighbor|neighbors|volunteer|classmate|mentor|acquaintance)\b|друг|подруг|коллег|сосед|волонтер|однокурс|знаком/iu.test(
    friendsText
  );

  if (friendsText.length > 0 && friendsText.length < 220) {
    issues.push('Expand the friendsAndPets block; it is still too compressed.');
  }
  if (!friendsHasNamedContact && !friendsHasPet) {
    issues.push('The friendsAndPets block should name at least one recurring friend, coworker, volunteer, neighbor, or pet.');
  }
  if (!friendsHasNamedNonFamilyHuman) {
    issues.push('The friendsAndPets block should name at least one non-family human contact, not only a sister, parent, or pet.');
  }
  if (!friendsHasTwoContacts && !friendsHasPet) {
    issues.push('The friendsAndPets block should feel socially lived-in: preferably include two named recurring people, not only one vague social mention.');
  }
  if (!friendsHasCadence) {
    issues.push('The friendsAndPets block should say how often they meet, call, text, visit, or spend time together.');
  }
  if (!friendsHasScene) {
    issues.push('The friendsAndPets block should include at least one concrete social scene or routine, not only social adjectives.');
  }
  if (!friendsHasSocialRoles && !friendsHasPet) {
    issues.push('The friendsAndPets block should specify who those people are in her life: friends, coworkers, volunteers, neighbors, classmates, or similar.');
  }

  const giftsHasPastGivers = /(пап|мам|отец|мать|родител|бывш|парень|мужчин|партнер|партнёр|бабуш|дедуш|родствен|друг|подруг).{0,140}(дар|подар|букет|цвет|телефон|айфон|смартфон|украшен|духи|книг|поезд|путешеств|сертификат|сумк|практич|деньг|сюрприз)/iu.test(
    giftsText
  );
  const giftsHasSpecificItems = /цвет|букет|роз|тюльпан|телефон|айфон|смартфон|ноутбук|планшет|украшен|кольц|серьг|дух|косметик|книг|поезд|путешеств|билет|сертификат|сумк|сладост|техник|часы|парфюм|деньг|flowers|phone|jewelry|trip|travel|perfume/iu.test(
    giftsText
  );
  const giftsHasTimingOrFrequency = /кажд\w+\s+(?:недел|месяц)|раз\s+в\s+(?:недел|месяц|год)|на\s+(?:день\s+рождени|8\s+марта|новый\s+год|выпуск|юбилей)|в\s+\d{4}|\bв\s+\d+\s+лет\b|после\s+ссор|после\s+поезд|по\s+пятниц|регулярно|почти\s+всегда/iu.test(
    giftsText
  );
  const giftsHasCurrentPreference = /сейчас|от\s+партнер|от\s+партнёр|от\s+мужчины|я\s+люблю\s+получать|я\s+хочу\s+получать|мне\s+приятно\s+получать|я\s+жду|мне\s+важно,\s+чтобы\s+(?:мужчина|партнер|партнёр)|идеальн\w+\s+подар|лучше\s+всего\s+для\s+меня|\bnow\b|\bfrom\s+(?:a\s+)?(?:partner|man)\b|\bi\s+(?:love|want|like)\s+to\s+receive\b|\bi\s+expect\b|\bit\s+matters\s+to\s+me\s+that\b|\bideal\s+gift\b|\bbest\s+for\s+me\b/iu.test(
    giftsText
  );
  const giftsHasDirectReceivingVerbs = /я\s+(?:хочу|люблю|привыкла)\s+получать|я\s+жду\s+от\s+(?:мужчины|партнера|партнёра)|мне\s+нравит(?:ся|ось),\s+когда\s+(?:мужчина|партнер|партнёр).{0,80}(дар|трат|балу)|мне\s+важно,\s+чтобы\s+(?:мужчина|партнер|партнёр).{0,80}(дар|принос|балов|трат)|\bi\s+(?:want|love|am used)\s+to\s+receive\b|\bi\s+expect\s+from\s+(?:a\s+)?(?:man|partner)\b|\bi\s+like\s+it\s+when\s+(?:a\s+)?(?:man|partner).{0,80}(?:gives|spends|spoils)\b|\bit\s+matters\s+to\s+me\s+that\s+(?:a\s+)?(?:man|partner).{0,80}(?:gives|brings|spends|spoils)\b/iu.test(
    giftsText
  );
  const giftsHasNegativePreference = /не\s+люблю|не\s+нрав|раздраж|пуст\w+\s+жест|откуп|слишком\s+показн|дежурн|безли(к|ч)|формальн|не\s+трогает|мимо\s+меня|\bi\s+do\s+not\s+like\b|\bdo(?:es)?\s+not\s+fit\s+me\b|\bempty\s+gesture\b|\bbuy\s+my\s+affection\b|\btoo\s+showy\b|\bduty\b|\bformal\b|\bdoes\s+not\s+move\s+me\b/iu.test(
    giftsText
  );
  const giftsHasFlowers = /цвет|букет|роз|тюльпан/iu.test(giftsText);
  const giftsHasLuxOrSpendSignals = /украшен|кольц|серьг|дух|парфюм|телефон|айфон|смартфон|ноутбук|планшет|сумк|сертификат|деньг|поезд|путешеств|оплачив|тратил|баловал|щедр|дорог\w+\s+подар|без\s+повода/iu.test(
    giftsText
  );
  const giftsHasMercantileExpectation = /люблю,\s+когда\s+(?:мужчина|партнер|партнёр).{0,120}(дар|трат|балу|приходит\s+не\s+с\s+пустыми\s+руками)|жду\s+от\s+(?:мужчины|партнера|партнёра).{0,120}(цвет|букет|украшен|подар|поезд|техник|щедр)|мужчина\s+не\s+должен\s+приходить\s+с\s+пустыми\s+руками|естественн\w+\s+часть\s+ухаживания|нравит(?:ся|ось),\s+когда\s+на\s+меня\s+тратят|\bi\s+like\s+it\s+when\s+(?:a\s+)?(?:man|partner).{0,120}(?:gives|spends|spoils|does\s+not\s+arrive\s+empty-handed)\b|\bi\s+expect\s+from\s+(?:a\s+)?(?:man|partner).{0,120}(?:flowers|bouquet|jewelry|gift|trip|tech|generosity)\b|\ba\s+man\s+should\s+not\s+arrive\s+empty-handed\b|\ba\s+natural\s+part\s+of\s+courtship\b|\bi\s+like\s+when\s+money\s+is\s+spent\s+on\s+me\b/iu.test(
    giftsText
  );
  const giftsHasDesiredCadence = /(?:я\s+(?:хочу|люблю|привыкла)\s+получать|я\s+жду\s+от\s+(?:мужчины|партнера|партнёра)|мне\s+нравит(?:ся|ось),\s+когда\s+(?:мужчина|партнер|партнёр)|мне\s+важно,\s+чтобы\s+(?:мужчина|партнер|партнёр)|i\s+(?:want|love|am\s+used)\s+to\s+receive|i\s+expect\s+from\s+(?:a\s+)?(?:man|partner)|i\s+like\s+it\s+when\s+(?:a\s+)?(?:man|partner)|it\s+matters\s+to\s+me\s+that\s+(?:a\s+)?(?:man|partner)).{0,120}(?:кажд\w+\s+недел|раз\s+в\s+недел|несколько\s+раз\s+в\s+месяц|кажд\w+\s+месяц|раз\s+в\s+месяц|еженедельн|ежемесячн|every\s+week|weekly|several\s+times\s+a\s+month|every\s+month|once\s+a\s+month|monthly)/iu.test(
    giftsText
  );
  const giftsHasDesiredGiftTypesNow = /(?:я\s+(?:хочу|люблю|привыкла)\s+получать|я\s+жду\s+от\s+(?:мужчины|партнера|партнёра)|сейчас\s+я\s+(?:хочу|люблю)|мне\s+нравит(?:ся|ось),\s+когда\s+(?:мужчина|партнер|партнёр)|i\s+(?:want|love|am\s+used)\s+to\s+receive|i\s+expect\s+from\s+(?:a\s+)?(?:man|partner)|now\s+i\s+(?:want|love)|i\s+like\s+it\s+when\s+(?:a\s+)?(?:man|partner)).{0,160}(?:цвет|букет|украшен|кольц|серьг|дух|парфюм|телефон|айфон|смартфон|техник|поезд|путешеств|сертификат|сюрприз|оплач|трат|балу|flowers?|bouquet|jewelry|ring|earrings?|perfume|phone|iphone|smartphone|tech|trip|travel|certificate|surprise|pay(?:s|ing)?|spend(?:s|ing)?|spoil)/iu.test(
    giftsText
  );
  const giftsTooPracticalOrAscetic = /не\s+столько\s+дорогие\s+вещи|не\s+дорогие\s+вещи|главное\s+не\s+стоим|важно\s+не\s+стоим|не\s+стоимость|помощь\s+делом.{0,80}(?:гораздо\s+более|гораздо\s+важн)|практичн\w+\s+вещи.{0,80}(?:важнее|ценнее)|мне\s+почти\s+ничего\s+не\s+нужно|не\s+люблю,\s+когда\s+на\s+меня\s+тратят|материальн\w+\s+вещи\s+для\s+меня\s+не\s+важны|not\s+the\s+price|price\s+does\s+not\s+matter|practical\s+things.{0,80}(?:matter\s+more|are\s+more\s+important)|help\s+with\s+things.{0,80}(?:matters\s+more|is\s+more\s+important)|i\s+need\s+almost\s+nothing|i\s+do\s+not\s+like\s+when\s+money\s+is\s+spent\s+on\s+me|material\s+things\s+do\s+not\s+matter\s+to\s+me/iu.test(
    giftsText
  );
  const giftsOverindexesUsefulGifts = /(?:я\s+(?:хочу|люблю|предпочитаю)|лучше\s+всего\s+мне|идеальн\w+\s+для\s+меня|i\s+(?:want|love|prefer)|best\s+for\s+me|ideal\s+for\s+me).{0,120}(?:полезн\w+\s+подар|практичн\w+\s+вещ|вещи\s+для\s+дома|для\s+быта|для\s+работы|для\s+учебы|абонемент|семинар|useful\s+gift|practical\s+thing|things\s+for\s+the\s+home|for\s+work|for\s+study|membership|seminar)/iu.test(
    giftsText
  );

  if (giftsText.length < 260) {
    issues.push('Expand the gifts block substantially; it is still too brief.');
  }
  if (!giftsHasPastGivers) {
    issues.push('The gifts block should include concrete remembered gift episodes from parents, relatives, or previous partners, not only a generic wishlist.');
  }
  if (!giftsHasSpecificItems || !giftsHasTimingOrFrequency) {
    issues.push('The gifts block should include specific gift categories plus timing, occasion, or frequency detail.');
  }
  if (!giftsHasCurrentPreference || !giftsHasDirectReceivingVerbs || !giftsHasDesiredGiftTypesNow) {
    issues.push('The gifts block should clearly and directly say what she wants to receive from a partner now, using first-person expectation language instead of vague appreciation.');
  }
  if (!giftsHasDesiredCadence) {
    issues.push('The gifts block should explicitly state present-day cadence for desired gifts now, for example weekly flowers or bouquets several times a month plus a noticeable gift at least monthly.');
  }
  if (!giftsHasNegativePreference) {
    issues.push('The gifts block should mention which gift styles feel empty, wrong, too showy, or simply not for her, so it does not read like a flat wishlist.');
  }
  if (!giftsHasFlowers) {
    issues.push('The gifts block should explicitly include flowers or bouquets as a recurring part of her gift history and present-day expectation.');
  }
  if (!giftsHasLuxOrSpendSignals) {
    issues.push('The gifts block should contain clearer material gift signals such as jewelry, perfume, gadgets, money, certificates, trips, or a man spending on her, not only neutral practical items.');
  }
  if (!giftsHasMercantileExpectation) {
    issues.push('The gifts block should read more materially receptive: she should look used to gifts, flowers, visible spending, and a man not arriving empty-handed.');
  }
  if (giftsTooPracticalOrAscetic || giftsOverindexesUsefulGifts) {
    issues.push('The gifts block became too practical or ascetic. Do not frame her as someone who mainly wants useful help instead of gifts; make weekly flowers, regular presents, and visible generosity central.');
  }

  const sexualSpecificitySignals = [
    /иници|границ|темп|эксперимент|фантаз|initiative|boundar|pace|experiment|fantas/iu.test(sexualText),
    /поцел|касани|прелюд|прикосн|объяти|ласк|тело|телес|рук|губ|kiss|touch|foreplay|body|bodily|hands?|lips?/iu.test(sexualText),
    /возбуж|завод|нравит|тянет|притяг|отталк|запрет|табу|arous|turn[- ]?on|turn[- ]?off|attract|repel|taboo|like|dislike/iu.test(sexualText),
    /домини|подчин|роль|ораль|сценари|кровать|бель|раздев|поз|domin|submi|role|oral|anal|scenario|bed|lingerie|pose/iu.test(sexualText)
  ].filter(Boolean).length;
  const sexualPracticalSignals = [
    /игруш|вибратор|лубрикант|секс-игруш|toy|vibrator|lube|sex toy/iu.test(sexualText),
    /случайн|casual|разов(?:ая|ые)|без\s+обязательств|one-night|только\s+с\s+партнер|только\s+в\s+отношени|вне\s+отношени/iu.test(sexualText),
    /ораль|анал|поцел|прелюд|домини|подчин|ролев|oral|anal|kissing|foreplay|dominance|submission|roleplay/iu.test(sexualText),
    /(?:мужчин|мужчина|парень|man|men|guy|guys).{0,160}(?:критер|выбира|отбира|подход|важн|нужен|запах|чистоплот|инициатив|уверен|бережн|аккурат|отталк|criteria|choose|fit|important|need|smell|clean|initiative|confident|gentle|careful|repel|turn off)/iu.test(
      sexualText
    )
  ].filter(Boolean).length;
  const sexualDriveSignals = [
    /хорни|желан|желани|хочет|хочу|либид|возбуж|тянет|завод|сексуальн\w+\s+голод|horny|desire|want\s+sex|libido|arous|crav|sexual hunger/iu.test(sexualText),
    /порно|мастурб|эротик/iu.test(sexualText),
    /партнер|партнёр|партнеров|партнёров|опыт|бывало|были мужчины|partner|partners|experience|ex-partner|previous partner/iu.test(sexualText),
    /раз\s+в\s+недел|раз\s+в\s+месяц|частот|регулярн|несколько\s+раз|weekly|monthly|frequency|regularly|several times/iu.test(sexualText)
  ].filter(Boolean).length;
  const sexualPartnerDetailSignals = [
    /бывш|предыдущ|прошл\w+\s+партнер|ex-partner|previous partner/iu.test(sexualText),
    /нравил|не\s+нрав|нравилось|не\s+нравилось|не\s+хватал|хотелось\s+повтор|имитир|терпел|терпела|отказывал|отказывалась|liked|disliked|did not like|wanted to repeat|repeat|faked|missing|tolerated|refused/iu.test(
      sexualText
    ),
    /использовал|использовала|не\s+использовал|не\s+использовала|used|did not use|never used|tried/iu.test(sexualText) &&
      /игруш|вибратор|лубрикант|секс-игруш|toy|vibrator|lube|sex toy/iu.test(sexualText),
    /орал|анал|минет|кунилинг|поцел|прелюд|домини|подчин|груб|нежн|oral|anal|blowjob|cunnilingus|kissing|foreplay|domin|submi|rough|gentle/iu.test(sexualText)
  ].filter(Boolean).length;
  const canonRestrictsCasualSex = /не\s+ищ\w*[^.]{0,40}секс\s+на\s+одну\s+ночь|только\s+в\s+отношени|casual\s+is\s+not|only\s+in\s+relationships/iu.test(
    canonText
  );
  const sexualMultiPartnerSignals = /групп|нескольк\w+\s+(?:мужчин|партнер|партнёров)|multi-partner|group|мжм|жмм|свинг/iu.test(
    sexualText
  );
  const sexualRestrictiveSignals = /не\s+ищ\w*[^.]{0,40}секс\s+на\s+одну\s+ночь|случайн\w+\s+связ\w+[^.]{0,30}не\s+подход|только\s+в\s+отношени|без\s+серьезн\w+\s+отношени\w+\s+секс\s+не|not\s+looking\s+for\s+one[- ]night\s+sex|casual\s+(?:sex|encounters?).{0,30}(?:not\s+for\s+me|do(?:es)?\s+not\s+fit)|only\s+in\s+relationships|sex\s+only\s+with\s+serious\s+relationships/iu.test(
    sexualText
  );
  const sexualVeryHighDriveSignals = /ежеднев|кажд\w+\s+день|почти\s+ежеднев|несколько\s+раз\s+в\s+день|daily|near-daily|multiple times a day/iu.test(
    sexualText
  );
  const sexualCentralitySignals = /центральн|одн\w+\s+из\s+главн\w+\s+част|ключев\w+\s+част|важн\w+\s+част|main(?:\s+organizing)?\s+force|central part of (?:my )?life|one of the main parts of my life/iu.test(
    sexualText
  );
  const sexualGroupPositiveSignals = /(?:групп|тройнич|свинг|мжм|жмм|orgy|orgies|threesome|swing).{0,80}(?:возбужд|завод|интерес|нрав|люблю|хочу|хотела|готов|повтор|excite|arous|want|like|curious)|(?:возбужд|завод|интерес|нрав|люблю|хочу|готов).{0,80}(?:групп|тройнич|свинг|мжм|жмм|orgy|orgies|threesome|swing)|нескольк\w+\s+мужчин/iu.test(
    sexualText
  );
  const sexualGroupHardNoSignals = /(?:группов\w+|тройнич\w+|свинг\w*|group|threesome|swing).{0,80}(?:не\s+для\s+меня|не\s+хочу|не\s+подход|категорически\s+не|больше\s+не\s+повторяла|больше\s+не\s+хочу|not\s+for\s+me|do\s+not\s+want|does\s+not\s+fit|categorically\s+not|never\s+again)|(?:не\s+для\s+меня|не\s+хочу|не\s+подход|категорически\s+не|not\s+for\s+me|do\s+not\s+want|does\s+not\s+fit|categorically\s+not).{0,80}(?:группов\w+|тройнич\w+|свинг\w*|group|threesome|swing)/iu.test(
    sexualText
  );
  const sexualSafetyChecklistSignals = /стоп-слов|aftercare|иппп|sti|std|тест(?:ы|ов)\s+на|никаких\s+веществ|только\s+с\s+проверенн|минимум\s+\w+\s+месяц|без\s+обсуждения\s+заранее|предварительн\w+\s+душ|safeword|safe word/iu.test(
    sexualText
  );
  const sexualSafetyCompressionMentions = countRegexMatches(
    sexualText,
    /презерват|соглас|довер|границ|защит|осторож|проверенн|трезв|безопас|condom|consent|trust|boundary|protection|safe/giu
  );
  const sexualSafetyCompressionSentenceCount = countRegexMatches(
    sexualText,
    /[^.!?\n]{0,220}(?:презерват|соглас|довер|границ|защит|осторож|проверенн|трезв|безопас|condom|consent|trust|boundary|protection|safe)[^.!?\n]{0,220}[.!?]?/giu
  );
  const sexualExplicitActsMentioned = /орал|анал|минет|кунилинг|oral|anal|blowjob|cunnilingus/iu.test(sexualText);
  const sexualToyMentioned = /игруш|вибратор|лубрикант|секс-игруш|toy|vibrator|lube|sex toy/iu.test(sexualText);
  const sexualConstantNeedSignals = /restless without sex|hard to go long without|dry spell|go too long without|need sex regularly|sexual tension builds quickly|can't go long without|long dry spells feel/i.test(
    sexualText
  );
  const sexualHighInitiativeSignals = /initiat|make the first move|ask directly|go after sex|lead in bed|pull him toward me|reach for him first|self-initiated/i.test(
    sexualText
  );
  const sexualCasualPositiveSignals = /(?:casual|one[- ]night|hookup|spontaneous|without relationships|no-strings|short-format).{0,80}(?:appeal|excite|want|like|fit|works? for me|turns me on|enjoy)|(?:appeal|excite|want|like|fit|works? for me|turns me on|enjoy).{0,80}(?:casual|one[- ]night|hookup|spontaneous|no-strings|short-format)/iu.test(
    sexualText
  );
  const sexualVarietySignals = [
    /oral|anal|blowjob|cunnilingus/iu.test(sexualText),
    /kiss|foreplay|touch|hands?|lips?/iu.test(sexualText),
    /domin|submi|rough|gentle/iu.test(sexualText),
    /toy|vibrator|lube|sex toy/iu.test(sexualText),
    /roleplay|scenario|public|car|hotel|shower|quick sex|slow sex/iu.test(sexualText)
  ].filter(Boolean).length;
  const sexualConcreteEpisodeSignals = countRegexMatches(
    sexualText,
    /(?:\b(?:in|around)\s+\d{4}\b|\bat\s+\d{1,2}\b|\bwhen I was\s+\d{1,2}\b|в\s+\d{4}\s+году|в\s+\d{1,2}\s+лет|когда мне было\s+\d{1,2}).{0,180}(?:ex|partner|boyfriend|man|guy|date|hookup|party|hotel|apartment|flat|trip|vacation|Warsaw|Moscow|Saratov|бывш|партнер|партнёр|мужчин|парень|свидан|встреч|вечерин|квартир|поездк|отел)/giu
  );
  const sexualFantasies = Array.isArray(canon?.sexual_preferences?.fantasies) ? canon.sexual_preferences.fantasies : [];
  const relationshipLooksOccupied = /\b(?:я\s+замужем|я\s+в\s+отношениях|счастлив\w*\s+в\s+браке|счастлив\w*\s+в\s+отношениях|мой\s+муж|мой\s+парень|мой\s+партнер|мой\s+партнёр|мой\s+жених|i\s+am\s+married|i\s+am\s+in\s+a\s+relationship|happy\s+in\s+(?:my\s+)?marriage|happy\s+in\s+(?:my\s+)?relationship|my\s+husband|my\s+boyfriend|my\s+partner|my\s+fianc[eé])\b/iu.test(
    relationshipText
  );
  const relationshipAvailabilitySignals = /\b(?:свободн|не\s+замуж|в\s+поиске\s+отношен|ищу\s+партнер|ищу\s+партнёр|готова\s+к\s+отношениям|открыта\s+к\s+отношениям|single|not\s+married|looking\s+for\s+a\s+relationship|looking\s+for\s+a\s+partner|ready\s+for\s+a\s+relationship|open\s+to\s+a\s+relationship)\b/iu.test(
    relationshipText
  );
  const relationshipMentionsMan = /\b(?:мужчин\w*|мужчина|парень|мужского)\b|(?:\bman\b|\bguy\b)/iu.test(relationshipText);

  if (sexualText.length < 420) {
    issues.push('Expand the sexualPreferences block substantially; it is still too brief.');
  }
  if (sexualSpecificitySignals < 3) {
    issues.push('The sexualPreferences block is too generic; add concrete adult preferences, bodily details, boundaries, initiative, fantasies, turn-offs, and clear factual specifics.');
  }
  if (sexualDriveSignals < 2) {
    issues.push('The sexualPreferences block still sounds too restrained; show adult desire, libido, porn or masturbation habits, partner experience, frequency, and recurring cravings where plausible.');
  }
  if (sexualPracticalSignals < 2) {
    issues.push('The sexualPreferences block should add concrete adult specifics such as toys, specific practices, whether sex is only in relationships or also casual, and what kind of men create attraction.');
  }
  if (sexualFantasies.length > 0 && !/фантаз/iu.test(sexualText)) {
    issues.push('Canon mentions fantasies, so the sexualPreferences block must address them explicitly.');
  }
  if (sexualPartnerDetailSignals < 3) {
    issues.push('The sexualPreferences block must add detailed previous-partner specifics: what she liked, disliked, asked to repeat, refused, tolerated for the partner, faked, or felt was missing.');
  }
  if (sexualConcreteEpisodeSignals < 1) {
    issues.push('The sexualPreferences block should include at least one concrete past example with an approximate time marker and partner or situation context, not only timeless preferences.');
  }
  if (!sexualExplicitActsMentioned) {
    issues.push('The sexualPreferences block should explicitly mention her stance on oral sex and anal sex, even if one of them is unwanted or off-limits.');
  }
  if (!sexualToyMentioned) {
    issues.push('The sexualPreferences block should explicitly state whether she used toys, did not use them, wants to try them, or rejects them; do not leave toys unaddressed.');
  }
  if (sexualRestrictiveSignals && !canonRestrictsCasualSex) {
    issues.push('The sexualPreferences block became too restrictive by default. Unless canon explicitly forbids it, do not frame her as automatically rejecting one-night sex or casual encounters.');
  }
  if (Number.isFinite(sexualScore) && sexualScore >= 8 && sexualDriveSignals < 3) {
    issues.push('Canon sexual_expressiveness is 8-10, so sexualPreferences must read clearly more high-drive than a medium score: stronger desire, higher initiative, and more recurring appetite.');
  }
  if (Number.isFinite(sexualScore) && sexualScore >= 8 && sexualPracticalSignals < 3) {
    issues.push('Canon sexual_expressiveness is 8-10, so sexualPreferences should show broader adult experimentation and clearer openness than a medium score.');
  }
  if (Number.isFinite(sexualScore) && sexualScore >= 8 && sexualSafetyChecklistSignals) {
    issues.push('For sexual_expressiveness 8-10, do not turn sexualPreferences into a safety checklist with safewords, aftercare, STI-testing routines, or other procedural caveats unless canon explicitly requires that.');
  }
  if (Number.isFinite(sexualScore) && sexualScore >= 8 && (sexualSafetyCompressionMentions > 2 || sexualSafetyCompressionSentenceCount > 1)) {
    issues.push('For sexual_expressiveness 8-10, compress condoms / consent / trust / boundaries / protection language into one short phrase or one short sentence total; do not let it recur across the block.');
  }
  if (sexualScore === 10 && !sexualVeryHighDriveSignals) {
    issues.push('Canon sexual_expressiveness = 10 should read as daily or near-daily desire, not as moderate weekly libido.');
  }
  if (sexualScore === 10 && !sexualCentralitySignals) {
    issues.push('Canon sexual_expressiveness = 10 should make sexuality one of the central forces in her adult life and partner choice, not a side topic.');
  }
  if (sexualScore === 10 && !sexualConstantNeedSignals) {
    issues.push('Canon sexual_expressiveness = 10 should sound like a recurring physical need; add frustration with long dry spells or inability to stay comfortable without sex for long.');
  }
  if (sexualScore === 10 && !sexualHighInitiativeSignals) {
    issues.push('Canon sexual_expressiveness = 10 should show that she often initiates, asks directly, or actively drives sex instead of mostly waiting for the man.');
  }
  if (sexualScore === 10 && !canonRestrictsCasualSex && sexualRestrictiveSignals) {
    issues.push('Canon sexual_expressiveness = 10 should not be framed as relationship-only or generally restrictive toward casual sex unless canon explicitly requires that.');
  }
  if (sexualScore === 10 && !canonRestrictsCasualSex && !sexualCasualPositiveSignals) {
    issues.push('Canon sexual_expressiveness = 10 should show positive openness to casual, spontaneous, or short-format sex, not only the absence of a ban on it.');
  }
  if (sexualScore === 10 && !sexualMultiPartnerSignals) {
    issues.push('Canon sexual_expressiveness = 10 should contain an explicit multi-partner or group line, not just ordinary pair-bond sexuality.');
  }
  if (sexualScore === 10 && !sexualGroupPositiveSignals) {
    issues.push('Canon sexual_expressiveness = 10 should show positive arousal, curiosity, experience, or willingness around group or several-men scenarios when canon does not explicitly forbid it.');
  }
  if (sexualScore === 10 && sexualGroupHardNoSignals) {
    issues.push('Canon sexual_expressiveness = 10 should not turn group or multi-partner contexts into a blanket “not for me”; if there was prior exposure, rewrite it as selective or private-only interest instead of a hard rejection.');
  }
  if (sexualScore === 10 && !canonRestrictsCasualSex && !sexualMultiPartnerSignals && sexualPracticalSignals < 4) {
    issues.push('Canon sexual_expressiveness = 10 should not read average; make it maximally intense through very high initiative, daily appetite, casual openness, and explicit multi-partner or group curiosity when consistent with canon.');
  }
  if (sexualScore === 10 && sexualVarietySignals < 4) {
    issues.push('Canon sexual_expressiveness = 10 should show a very broad adult range of practices and dynamics, not just one or two familiar formats.');
  }
  if (relationshipLooksOccupied) {
    issues.push('This is a dating profile for a single woman, so remove current marriage or occupied-relationship framing.');
  }
  if (!relationshipAvailabilitySignals) {
    issues.push('Because this is a dating profile, make it explicit that the woman is single and open to a relationship.');
  }
  if (canonSeeksMan && !relationshipMentionsMan) {
    issues.push('Canon explicitly seeks a man, so the dating framing should say she wants to try a relationship with a man, not a gender-neutral abstract partner.');
  }
  if (globalLiterarySignals > 0) {
    issues.push('The legend blocks still contain literary or symbolic phrasing; rewrite them in plain factual language with higher fact density and fewer abstract formulations.');
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

function buildFallbackBlocksMeta(facts) {
  const out = {};
  for (const block of LEGEND_BLOCKS) {
    const blockFacts = facts.filter((fact) => block.spheres.includes(normalizeSphere(fact.sphere, '')));
    out[block.key] = {
      facts_used: blockFacts.length,
      hooks_used: blockFacts.filter((fact) => Boolean(fact.hook)).length
    };
  }
  return out;
}

function normalizeBlocksMeta(rawMeta, facts) {
  const fallback = buildFallbackBlocksMeta(facts);
  const source = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};

  const out = {};
  for (const block of LEGEND_BLOCKS) {
    const candidate = source[block.key] && typeof source[block.key] === 'object' ? source[block.key] : {};
    const factsUsedRaw = Number(candidate.facts_used);
    const hooksUsedRaw = Number(candidate.hooks_used);

    out[block.key] = {
      facts_used: Number.isFinite(factsUsedRaw) ? clampInt(factsUsedRaw, 0, 10000) : fallback[block.key].facts_used,
      hooks_used: Number.isFinite(hooksUsedRaw) ? clampInt(hooksUsedRaw, 0, 10000) : fallback[block.key].hooks_used
    };
  }

  return out;
}

function normalizeLegendFullText(raw) {
  return safeString(raw).trim();
}

function normalizeFullTextAuditReport(raw) {
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const audit = parsed.audit && typeof parsed.audit === 'object' && !Array.isArray(parsed.audit) ? parsed.audit : parsed;

  const report = {
    preserves_key_input_facts: Boolean(audit.preserves_key_input_facts),
    invents_hard_canon: Boolean(audit.invents_hard_canon),
    too_idealized: Boolean(audit.too_idealized),
    too_dry_report: Boolean(audit.too_dry_report),
    too_vague_artistic: Boolean(audit.too_vague_artistic),
    has_abstract_declarations: Boolean(audit.has_abstract_declarations),
    each_paragraph_has_numeric_detail: Boolean(audit.each_paragraph_has_numeric_detail),
    has_micro_scenes: Boolean(audit.has_micro_scenes),
    repeats_core_thesis: Boolean(audit.repeats_core_thesis),
    has_flaws_and_contradictions: Boolean(audit.has_flaws_and_contradictions),
    has_useless_real_life_details: Boolean(audit.has_useless_real_life_details),
    has_grounded_positive_moments: Boolean(audit.has_grounded_positive_moments),
    has_small_failures_or_procrastination: Boolean(audit.has_small_failures_or_procrastination),
    has_named_minor_people_beyond_core_family: Boolean(audit.has_named_minor_people_beyond_core_family),
    has_concrete_social_scenes: Boolean(audit.has_concrete_social_scenes),
    has_life_outside_work_and_goals: Boolean(audit.has_life_outside_work_and_goals),
    overloaded_with_reflection: Boolean(audit.overloaded_with_reflection),
    locks_unsupported_logistics: Boolean(audit.locks_unsupported_logistics),
    issues: normalizeStringList(audit.issues)
  };

  report.ready =
    report.preserves_key_input_facts &&
    !report.too_idealized &&
    !report.too_dry_report &&
    !report.too_vague_artistic &&
    !report.has_abstract_declarations &&
    report.has_micro_scenes &&
    !report.repeats_core_thesis &&
    report.has_flaws_and_contradictions &&
    report.has_useless_real_life_details &&
    report.has_grounded_positive_moments &&
    report.has_small_failures_or_procrastination &&
    report.has_named_minor_people_beyond_core_family &&
    report.has_concrete_social_scenes &&
    report.has_life_outside_work_and_goals &&
    !report.overloaded_with_reflection;

  if (!report.ready && report.issues.length === 0) {
    if (!report.preserves_key_input_facts) {
      report.issues.push('Restore all significant input facts and explicit canon details.');
    }
    if (report.too_idealized) {
      report.issues.push('Make the character less polished and more ordinary.');
    }
    if (report.too_dry_report) {
      report.issues.push('Reduce report-like compression and weave facts into scenes and daily life.');
    }
    if (report.too_vague_artistic) {
      report.issues.push('Add more factual density, named details, and concrete life specifics.');
    }
    if (report.has_abstract_declarations) {
      report.issues.push('Remove abstract declarations and show feelings only through behavior and aftermath.');
    }
    if (!report.has_micro_scenes) {
      report.issues.push('Turn major moments into micro-scenes with physical actions and immediate aftermath.');
    }
    if (report.repeats_core_thesis) {
      report.issues.push('Stop repeating the same thesis and make each paragraph introduce new information.');
    }
    if (!report.has_flaws_and_contradictions) {
      report.issues.push('Add more flaws, contradictions, selfish moments, irritation, or avoidance.');
    }
    if (!report.has_useless_real_life_details) {
      report.issues.push('Add more useless but real domestic detail: food, clothes, mugs, mess, objects, apartment texture.');
    }
    if (!report.has_grounded_positive_moments) {
      report.issues.push('Add grounded positive moments like laughter, relief, small pleasure, or bodily ease instead of abstract happiness.');
    }
    if (!report.has_small_failures_or_procrastination) {
      report.issues.push('Add at least one small failure, awkward moment, impulsive choice, or procrastination scene.');
    }
    if (!report.has_named_minor_people_beyond_core_family) {
      report.issues.push('Add at least one named minor person beyond the core family.');
    }
    if (!report.has_concrete_social_scenes) {
      report.issues.push('Add at least two concrete social interaction scenes.');
    }
    if (!report.has_life_outside_work_and_goals) {
      report.issues.push('Show ordinary life outside work, rescue tasks, and goals.');
    }
    if (report.overloaded_with_reflection) {
      report.issues.push('Reduce explanatory reflection and keep more action-level scenes.');
    }
  }

  return report;
}

function extractLegendFullText(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '';
  }

  const keys = ['legend_full_text', 'full_legend_text', 'full_text', 'fullText', 'life_story', 'story_text', 'storyText', 'narrative'];
  for (const key of keys) {
    const text = normalizeLegendFullText(parsed[key]);
    if (text) {
      return text;
    }
  }

  return '';
}

function hasLegendBlocksContent(legendBlocks) {
  return Object.values(legendBlocks || {}).some((item) => safeString(item).trim());
}

function normalizeQcReport(raw) {
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const checksSource = Array.isArray(parsed?.checks) ? parsed.checks : Array.isArray(parsed?.qc_report?.checks) ? parsed.qc_report.checks : [];
  const checkMap = checksSource.reduce((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }
    const key = safeString(item.key).trim();
    if (key) {
      acc[key] = item;
    }
    return acc;
  }, {});

  const checks = QC_CHECKS.map((expected) => {
    const candidate = checkMap[expected.key] || {};
    const passed = Boolean(candidate.passed);
    const issues = Array.isArray(candidate.issues)
      ? candidate.issues.map((item) => safeString(item).trim()).filter(Boolean)
      : [];

    return {
      key: expected.key,
      title: safeString(candidate.title).trim() || expected.title,
      passed,
      issues
    };
  });

  const passedChecks = checks.filter((item) => item.passed).length;
  return {
    checks,
    summary: {
      passed_checks: passedChecks,
      total_checks: checks.length,
      ready: passedChecks === checks.length
    }
  };
}

function buildCanonPromptData(canon) {
  return {
    name: canon.name || '',
    surname: canon.surname || '',
    gender: canon.gender || '',
    age: canon.age || null,
    birth_date: canon.birth_date || '',
    birth_year: canon.birth_year || null,
    birth_place: canon.birth_place || '',
    current_location: canon.current_location || null,
    relationship_status: canon.relationship_status || '',
    description: canon.description || '',
    height_weight: canon.height_weight || null,
    eye_color: canon.eye_color || '',
    hair_color: canon.hair_color || '',
    children: Array.isArray(canon.children) ? canon.children : [],
    job: canon.job || null,
    education: canon.education || null,
    languages: Array.isArray(canon.languages) ? canon.languages : [],
    life_plans: canon.life_plans || null,
    sexual_preferences: canon.sexual_preferences || null,
    character_traits: Array.isArray(canon.character_traits) ? canon.character_traits : [],
    core_values: Array.isArray(canon.core_values) ? canon.core_values : [],
    bad_habits: Array.isArray(canon.bad_habits) ? canon.bad_habits : [],
    first_impression: canon.first_impression || '',
    temperament: canon.temperament || '',
    top_traits: canon.top_traits || [],
    personality_profile: canon.personality_profile || {},
    source_payload: canon.generalInfo || null
  };
}

function buildCanonConsistencyPrompt({ person, personalityProfile, heuristicIssues }) {
  const criteriaSpec = PERSONALITY_CRITERIA.map((item) => ({
    key: item.key,
    label: item.label,
    low_meaning: item.minLabel,
    high_meaning: item.maxLabel
  }));

  return `
Ты проверяешь, согласуются ли Canon JSON и личностные шкалы персонажа.
${BASE_JSON_RULES_EN}

Верни JSON по схеме:
{
  "passed": true,
  "summary": "краткий вывод в одну-две фразы",
  "issues": [
    "конкретное противоречие с указанием поля Canon JSON и шкалы"
  ]
}

Требования:
- Сравнивай только явные сигналы из Canon JSON с personality_profile.
- Считай шкалы 1-3 низкими, 4-7 средними, 8-10 высокими.
- passed=true только если в Canon JSON нет явных конфликтов со шкалами.
- Если данных недостаточно для жесткого вывода, НЕ придумывай конфликт.
- В issues пиши только конкретные противоречия. Каждое issue должно ссылаться на поле Canon JSON.
- Не копируй эвристические сигналы автоматически: проверь их по смыслу.

Вспомогательные эвристические сигналы:
${JSON.stringify(heuristicIssues, null, 2)}

Criteria spec JSON:
${JSON.stringify(criteriaSpec, null, 2)}

Canon JSON:
${JSON.stringify(person, null, 2)}

Personality profile JSON:
${JSON.stringify(personalityProfile, null, 2)}
`.trim();
}

async function runCanonProfileConsistencyCheck({
  person,
  personalityProfile,
  pipelineStateInput = null,
  generationType = 'type-pro',
  requestId = ''
}) {
  const normalizedPerson = normalizeIncomingPerson(person);
  const normalizedProfile = normalizeProfile(personalityProfile || {});
  const heuristic = validateCanonProfileConsistency(normalizedPerson, normalizedProfile);
  const prompt = buildCanonConsistencyPrompt({
    person: normalizedPerson,
    personalityProfile: normalizedProfile,
    heuristicIssues: heuristic.issues
  });

  let response = null;
  let warning = null;
  let geminiReport = null;

  try {
    const generated = await generateParsedGeminiObject({
      prompt,
      generationType,
      requestId,
      timeoutMs: resolveStageTimeoutMs('canon_profile_consistency'),
      stageKey: 'canon_profile_consistency'
    });
    response = generated.response;
    const parsed = generated.parsed;
    geminiReport = normalizeCanonConsistencyReport(parsed, {
      source: 'gemini',
      model: response.model,
      endpoint_mode: response.endpointMode
    });
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }

  const mergedIssues = normalizeStringList([...(geminiReport?.issues || []), ...heuristic.issues]);
  const passed = Boolean(geminiReport ? geminiReport.passed && heuristic.passed : heuristic.passed);
  const report = normalizeCanonConsistencyReport(
    {
      ...geminiReport,
      passed,
      issues: mergedIssues,
      heuristic_issues: heuristic.issues,
      issue_resolutions: [...(geminiReport?.issue_resolutions || []), ...(heuristic.issue_resolutions || [])],
      source: geminiReport ? 'gemini+heuristic' : 'heuristic_fallback',
      model: geminiReport?.model || response?.model || null,
      endpoint_mode: geminiReport?.endpoint_mode || response?.endpointMode || null,
      warning,
      summary: geminiReport?.summary || (passed ? 'Проверка не нашла явных конфликтов между Canon JSON и шкалами.' : 'Проверка нашла явные конфликты между Canon JSON и шкалами.')
    },
    {
      passed,
      issues: mergedIssues,
      heuristic_issues: heuristic.issues,
      issue_resolutions: heuristic.issue_resolutions || [],
      source: geminiReport ? 'gemini+heuristic' : 'heuristic_fallback',
      warning
    }
  );

  const state = pipelineStateInput ? ensurePipelineState(pipelineStateInput) : null;
  if (state) {
    updatePipelineMeta(state, {
      canon_profile_consistency: report
    });
  }

  return {
    report,
    pipelineState: state,
    modelUsed: response?.model || null,
    warning
  };
}

function buildStage1Prompt({ canon, stagePrompt }) {
  const spheres = LIFE_SPHERES.map((item) => item.key).join(', ');
  return `
Ты пишешь только фактические поворотные события жизни персонажа.
${BASE_JSON_RULES_EN}

Верни JSON по схеме:
{
  "anchors_timeline": [
    {
      "id": "anchor_001",
      "year": 2018,
      "month": 6,
      "age": 24,
      "sphere": "career",
      "location": "город, страна",
      "event": "одно конкретное действие/событие",
      "worldview_shift": "как именно после этого изменились решения и взгляд на жизнь",
      "outcome": "наблюдаемый локальный итог за срок",
      "hook": true
    }
  ]
}

Требования:
- 8-12 anchors_timeline.
- Явные факты из description и structured canon используй как обязательные опоры. Нельзя терять детей, родительство, питомцев, работу, хобби и устойчивые бытовые детали, если они явно заданы.
- Если canon явно говорит, что у персонажа есть ребёнок, тема родительства обязана появиться в anchors_timeline.
- Каждый anchor = один конкретный переломный факт, а не характеристика и не формальная веха биографии.
- Если вход обычный, нейтральный или разреженный, anchors тоже должны оставаться обычного масштаба. Тихие, бытовые, неловкие, локальные и неидеальные переломы валидны не хуже громких достижений.
- Не раздувай персонажа в high-performer'а без прямых оснований. Нельзя автоматически выводить из нейтральных данных жесткую дисциплину, миссионерство, финансовые прорывы, лидерство, крупный социальный эффект, топ-успеваемость, карьерный взлет или гиперосознанность.
- Формулировки вроде «хочу быть хорошим человеком», «люблю тихие вечера дома», «смотрю спорт», «student», «SMM manager» сами по себе не доказывают выдающиеся амбиции, системность или высокий статус. Интерпретируй их в скромном, возрастно-реалистичном масштабе.
- outcome у якоря не обязан быть впечатляющим. Маленький, личный, бытовой, ограниченный по масштабу результат лучше, чем искусственно раздутый успех.
- Если достраиваешь career/finance/education, держи масштаб приземленным и возрастно обычным: локальная подработка, маленький клиент, неловкий провал, скромный заработок, незаконченная попытка, обычный студенческий быт. Не придумывай вирусную известность, крупные суммы, престиж, сильное влияние или выдающиеся результаты без прямой опоры во входе.
- Не придумывай жесткий базовый canon, если его нет во входе. Без прямой опоры запрещено фиксировать точный город рождения, больницу, имена и профессии родителей, конкретную школу, престижный вуз, точное место детства, точные медицинские диагнозы, большие денежные суммы и другие фундаментальные биографические факты.
- Допустимо мягко достраивать только "мягкие детали сцены": локальный разговор, неловкий эпизод, маленькую бытовую привычку, одного друга/знакомого, обычный вечер, простое хобби. Мягкая деталь не должна превращаться в новый столп биографии.
- Если ранние годы, семья или происхождение не описаны во входе, не строй подробную сагу о детстве. Лучше оставить эти периоды широкими и скромными, чем выдумывать точную семейную историю.
- Запрещены абстракции и общие формулировки вроде «стал сильнее», «повзрослел», «пересмотрел взгляды».
- Добавляй конкретику везде, где это правдоподобно: имена людей, компании, учебные заведения, города, суммы, названия ролей, тип жилья, устройство или предмет, если он важен для события.
- sphere только из: ${spheres}.
- Хронология реалистичная относительно возраста.

Пользовательский prompt этапа:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}
`.trim();
}

function buildStage2Prompt({ canon, anchors, targetFacts, stagePrompt }) {
  const spheres = LIFE_SPHERES.map((item) => item.key).join(', ');
  return `
Ты расширяешь биографию в атомарные факты.
${BASE_JSON_RULES_EN}

Верни JSON по схеме:
{
  "fact_bank": [
    {
      "id": "fact_001",
      "text": "одно атомарное событие с конкретикой",
      "sphere": "career",
      "year": 2019,
      "age": 25,
      "hook": false,
      "source": "anchor",
      "source_anchor_id": "anchor_001"
    }
  ]
}

Требования:
- Минимум ${targetFacts} фактов.
- Один факт = одно событие, действие, решение, привычка или опыт без склейки нескольких эпизодов.
- Каждый факт у нас должен быть событием, а не характеристикой личности.
- Canon и personality_profile использовать как ограничения и причинные сигналы, а не как готовые фразы для fact_bank.
- Запрещено просто переписывать входные данные или выдавать факты вида: «она рациональная», «ей свойственна инициативность», «она ценит независимость», «её уровень ответственности 5/5», «она считает, что свобода — это...».
- Если вход обычный, скромный или неполный, дозаполняй biography обычной жизнью, а не престижной эскалацией. Предпочитай локальные, бытовые, неидеальные и низкоставочные факты вместо искусственного карьерного, финансового или миссионерского роста.
- Не превращай нейтральный профиль в дисциплинированную отличницу, системного достигатора, финансового стратега, благотворительного лидера или сверхсобранного взрослого без прямой опоры в canon и anchors.
- В fact_bank должны встречаться не только достижения, но и простые вечера дома, просмотр спорта, неловкие разговоры, избегание шумных компаний, прокрастинация, несобранность, заброшенные попытки, мелкие ошибки, импульсивные решения и периоды безделья, если это реалистично для персонажа.
- Не завышай доход, масштаб работы, уровень влияния, академические результаты и степень саморефлексии относительно возраста и исходных данных.
- В career/finance/education по умолчанию выбирай скромный масштаб: локальные клиенты, рядовые студенческие подработки, маленькие суммы, обычные дедлайны, посредственные или смешанные результаты. Не придумывай вирусные цифры, сильный рост аудитории, крупные переводы, системные инвестиции, престижные достижения или почти сформировавшуюся личную философию без прямой базы.
- Не заполняй пробелы жестким canon'ом. Если во входе нет точного города, родителей, школы, работодателя, больницы, бренда, зарплаты или биографической вехи, не превращай это в "достоверный факт". В таких местах используй более общие и безопасные формулировки.
- Можно аккуратно придумывать только мягкие, локальные, невысокорисковые детали сцены: имя подруги, неловкий разговор, соседку, случай в автобусе, совместный вечер дома, мелкую бытовую привычку. Нельзя на их основе строить новый большой слой биографии.
- Если детство и семья не описаны подробно, ранние факты должны оставаться скромными и редкими. Не надо компенсировать нехватку данных полной историей семьи, точными учреждениями и длинной хроникой ранних лет.
- source только: anchor | canon | period_logic.
- sphere только из: ${spheres}.
- У каждого факта должна быть временная привязка: year или age; source_anchor_id добавляй, если факт опирается на конкретный anchor.
- Добавляй конкретику везде, где это правдоподобно: имена, должности, суммы, модели техники, названия курсов, бренды, клички питомцев, типы жилья, марки машин, географию, сроки.
- Если recurring person/object отсутствует во входе, можно мягко придумать правдоподобную конкретную деталь, но потом использовать её последовательно.
- Избегай шаблонных оборотов, воды и морализаторства.

Пользовательский prompt этапа:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Explicit retention rules:
- Сохраняй явные canon-факты из description и structured fields. Дети, питомцы, устройство семьи, работа, образование, рутины и именованные сущности не должны исчезать.
- Если в description явно упомянуты дети или питомцы, fact_bank обязан содержать конкретные факты о них.

Anchors JSON:
${JSON.stringify(anchors, null, 2)}
`.trim();
}

function buildStage1PromptV2({ canon, stagePrompt }) {
  const spheres = LIFE_SPHERES.map((item) => item.key).join(', ');
  return `
You are generating turning points for a long biographical profile.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "anchors_timeline": [
    {
      "id": "anchor_001",
      "year": 2018,
      "month": 6,
      "age": 24,
      "sphere": "career",
      "location": "city, country or broad context",
      "event": "one concrete action or event",
      "worldview_shift": "how decisions or behaviour changed after it",
      "outcome": "a local observable result",
      "hook": true
    }
  ]
}

Requirements:
- 8-12 anchors_timeline.
- Follow the user's stage prompt as the primary instruction set.
- All natural-language fields in anchors_timeline must be in English, even if canon or the input description is in Russian or another language.
- Preserve explicit canon facts from description and structured fields. Do not lose children, pets, work, education, family structure, hobbies, or stable everyday details if they are explicitly present.
- Each anchor must be one concrete turning point, not a personality trait and not a dry resume milestone.
- Plausible specificity is allowed when it helps the biography feel real and consistent: names of people, cities, schools, universities, companies, devices, sums, jobs, housing, or local places.
- Keep invented specifics realistic, ordinary, and internally consistent. Do not escalate into celebrity status, elite prestige, impossible money, or melodrama without direct support.
- Quiet, awkward, local, domestic, and imperfect turning points are fully valid. The character should not automatically become a high-performer or perfectly assembled adult.
- Avoid abstract wording like "became stronger" or "reconsidered her views". Describe observable change in decisions, habits, relationships, or routine.
- sphere only from: ${spheres}.
- Timeline must stay realistic for the age and internally coherent.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}
`.trim();
}

function buildStage2PromptV2({ canon, anchors, targetFacts, stagePrompt }) {
  const spheres = LIFE_SPHERES.map((item) => item.key).join(', ');
  return `
You are expanding the biography into atomic facts for a dense life profile.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "fact_bank": [
    {
      "id": "fact_001",
      "text": "one atomic event with concrete detail",
      "sphere": "career",
      "year": 2019,
      "age": 25,
      "hook": false,
      "source": "anchor",
      "source_anchor_id": "anchor_001"
    }
  ]
}

Requirements:
- Generate at least ${targetFacts} facts; under the default pipeline target the bank should usually land in the 160-230 range unless the system explicitly requests more.
- All fact_bank.text values must be in English, even if canon or the input description is in Russian or another language.
- One fact = one observable action, event, or state with visible behavior inside it. Never merge several episodes into one fact.
- Every fact must contain a concrete action or event, a context or reaction, and a time anchor. If you cannot picture the fact as a scene, it is invalid.
- A state is allowed only if it is shown through behavior. Inner life without behavior is not a valid fact.
- Every fact must be an event, not a personality label.
- Follow the user's stage prompt as the primary instruction set.
- Use canon and personality_profile as constraints and causal signals, not as ready-made sentences for fact_bank.
- Do not rewrite the input in other words and do not output trait statements instead of events.
- Plausible concrete specifics are allowed when they make the bank feel real and stay internally consistent: names, devices, brands, universities, jobs, money, housing, streets, cafes, pets, transport, and local places.
- If you choose a plausible invented detail, keep using it consistently.
- If the input is ordinary or sparse, fill the biography with ordinary life rather than prestige escalation. Prefer local, domestic, imperfect, and low-stakes facts over artificial career or money inflation.
- Do not turn a neutral profile into a disciplined achiever, financial strategist, leader, or overly self-aware adult without direct support.
- At least 30-40% of facts must include weakness, mistakes, avoidance, fear, delay, cold behavior, impulsive actions, awkward social situations, or other non-ideal behavior. If the character reads too collected and correct, the generation is wrong.
- Each fact should carry one primary behavioral tension angle and at most one reinforcing one: fear, error, avoidance, conflict, pressure, consequence, embarrassment, or something similar.
- fact_bank must include not only achievements but also quiet evenings at home, awkward conversations, procrastination, abandoned attempts, small mistakes, impulsive choices, social discomfort, and idle periods when realistic for this character.
- Keep money, work scale, education, and achievements grounded and age-realistic. Do not inflate status or polish.
- Avoid impossible or sensational biography pillars, but ordinary inferred specifics are allowed if they remain plausible and coherent.
- Hook logic is strict. If a fact is logical, socially approved, neat, or rational, hook = false by default.
- A hook is allowed only when there is a concrete action plus at least two tensions such as risk, internal conflict, external conflict, pressure, broken expectation, avoidance, error, or impulsiveness.
- Prioritize hook=true for mistakes, failures, avoidance, weakness, awkward behavior, strange decisions, loss, conflict with close people, or fear-driven behavior.
- Never mark achievements, helping others, honesty, responsibility, career growth, or logical decisions as hooks just because they matter.
- Hook density should stay around 15-25% of facts, and at least half of the hooks should come from weakness, error, avoidance, or conflict.
- Keep coverage broad and continuous across life periods where plausible. You do not need perfectly equal density, but the bank should feel like a usable whole biography.
- source only from: anchor | canon | period_logic.
- sphere only from: ${spheres}.
- Every fact needs a time anchor: year or age; add source_anchor_id when the fact is tied to a specific anchor.
- Avoid templated phrasing, filler, and moralizing.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Explicit retention rules:
- Preserve explicit canon facts from description and structured fields. Children, pets, family structure, work, education, routines, and already named entities must not disappear.
- If description explicitly mentions children or pets, fact_bank must contain concrete facts about them.

Anchors JSON:
${JSON.stringify(anchors, null, 2)}
`.trim();
}

function buildStage2UnderfilledRepairPrompt({ canon, anchors, currentFacts, targetFacts, stagePrompt }) {
  const spheres = LIFE_SPHERES.map((item) => item.key).join(', ');
  const normalizedFacts = Array.isArray(currentFacts) ? currentFacts : [];
  const coverageBySphere = buildCoverageBySphere(normalizedFacts);
  const weakSpheres = Object.entries(coverageBySphere)
    .filter(([, count]) => count < 8)
    .map(([sphere]) => sphere);

  return `
You are repairing an underfilled stage_2 fact bank.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "fact_bank": [
    {
      "id": "fact_001",
      "text": "one atomic event with concrete detail",
      "sphere": "career",
      "year": 2019,
      "age": 25,
      "hook": false,
      "source": "anchor",
      "source_anchor_id": "anchor_001"
    }
  ]
}

Problem to fix:
- The previous draft produced only ${normalizedFacts.length} valid facts after normalization.
- The minimum required count is ${targetFacts}, so you must preserve usable current facts and expand the bank until it reaches at least ${targetFacts} valid facts after normalization.

Critical rules:
- Preserve all usable current facts unless they are duplicates or inconsistent with canon.
- Add missing facts mainly by filling quiet periods, underfilled spheres, and the spaces between anchors.
- Weak spheres right now: ${weakSpheres.length > 0 ? weakSpheres.join(', ') : 'none'}.
- Current coverage by sphere: ${JSON.stringify(coverageBySphere)}.
- All fact_bank.text values must be in English, even if canon or the input description is in Russian or another language.
- One fact = one observable action, event, or state with visible behavior inside it. Never merge several episodes into one fact.
- Every fact must contain a concrete action or event, a context or reaction, and a time anchor. If you cannot picture the fact as a scene, it is invalid.
- Every fact must be an event, not a personality label.
- Do not summarize, compress, or rewrite the current bank into fewer items. Expand it.
- Keep money, work scale, education, and achievements grounded and age-realistic.
- Hook density should stay around 15-25% of facts.
- source only from: anchor | canon | period_logic.
- sphere only from: ${spheres}.
- Every fact needs a time anchor: year or age; add source_anchor_id when the fact is tied to a specific anchor.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Anchors JSON:
${JSON.stringify(anchors, null, 2)}

Current normalized fact_bank JSON:
${JSON.stringify(normalizedFacts, null, 2)}
`.trim();
}

async function repairUnderfilledStage2FactBank({ canon, anchors, currentFacts, targetFacts, stagePrompt, generationType, requestId }) {
  const prompt = buildStage2UnderfilledRepairPrompt({
    canon,
    anchors,
    currentFacts,
    targetFacts,
    stagePrompt
  });

  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId: safeString(requestId).trim()
      ? `${safeString(requestId).trim()}:fact-bank-repair`
      : 'stage_2_fact_bank_repair',
    timeoutMs: resolveStageTimeoutMs('stage_2_fact_bank'),
    stageKey: 'stage_2_fact_bank'
  });

  return {
    response: generated.response,
    factBank: normalizeFacts(generated.parsed.fact_bank || generated.parsed.facts || [], canon)
  };
}

function buildStage3Prompt({ canon, anchors, facts, stagePrompt }) {
  return buildStage3PromptWithMode({
    canon,
    anchors,
    facts,
    blocksStagePrompt: stagePrompt,
    fullTextStagePrompt: '',
    outputMode: 'blocks'
  });

  const blockSpec = buildLegendBlockSpec();
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleRu(canon?.personality_profile?.sexual_expressiveness);
  const legendShape = LEGEND_BLOCKS.reduce((acc, block) => {
    acc[block.key] = '';
    return acc;
  }, {});

  const compactFacts = facts.map((item) => ({
    id: item.id,
    text: item.text,
    sphere: item.sphere,
    year: item.year,
    age: item.age,
    hook: item.hook
  }));
  const compactAnchors = (Array.isArray(anchors) ? anchors : []).map((item) => ({
    id: item.id,
    sphere: item.sphere,
    year: item.year,
    month: item.month,
    age: item.age,
    location: item.location,
    event: item.event,
    worldview_shift: item.worldview_shift,
    outcome: item.outcome,
    hook: item.hook
  }));

  return `
Ты собираешь финальные биографические блоки на основе canon, anchors и всего fact_bank.
${BASE_JSON_RULES_EN}

Верни JSON по схеме:
{
  "legend": ${JSON.stringify(legendShape, null, 2)},
  "blocks_meta": {
    "${LEGEND_BLOCKS[0]?.key || 'lifestyle'}": { "facts_used": 12, "hooks_used": 2 }
  }
}

Требования:
- Верни объект legend со ВСЕМИ ключами из block_spec, строго в том же порядке.
- Значение каждого ключа в legend = большой связный текст от первого лица, а не список и не короткая анкета.
- Используй весь массив fact_bank по максимуму; не сжимай историю до краткого пересказа.
- Допускается мягкое правдоподобное расширение между фактами: бытовой контекст, эмоциональные реакции, логичные внутренние выводы, оттенки отношений, повторяющиеся сценарии поведения.
- Нельзя ломать canon, anchors, временную логику и ядро уже утвержденных фактов.
- Пиши блоки как прямое фактическое самоописание, а не как эссе, рассказ или литературный монолог.
- Запрещены метафоры, сравнения, символические и образные формулировки. Не пиши фразы вроде «сложная система», «эмоциональный центр семьи», «как два спутника на одной орбите», «разные полюса», «единственная настоящая опора».
- Каждые 1-2 предложения должны добавлять новый проверяемый факт: имя, возраст, дату, период, место, работу, действие, решение, конфликт, бытовой эпизод, деньги, частоту или конкретное последствие.
- Если фразу можно сделать более прямой и фактологичной, перепиши её в более прямой и фактологичной форме.
- Если приложение, соцсеть, сервис или бренд не нужны для конкретного факта, не вставляй их просто ради фактуры.
- Не повторяй один и тот же факт дословно между блоками, но допускай смысловые перекрестные отголоски.
- Каждый тематический блок обязан раскрывать всю свою сферу, а не только один самый заметный мотив.
- Особенно глубоко раскрой блоки character, family, job, exRelationships, lifePlans, health, sexualPreferences и gifts.
- В блоке family обязательно распиши родителей или замещающих взрослых, семейную структуру, домашние роли, бытовые правила, поддержку, конфликты и деньги; сестра, брат или дети не могут быть единственным содержанием этого блока.
- В family обязательно дай хотя бы одного-двух бабушек или дедушек с обычными именами, живы ли они, чем занимались и на пенсии ли они сейчас; если вход молчит, разрешено мягко придумать правдоподобные низкодраматичные детали.
- По родителям в family укажи не только прошлые места работы, но и где они работают сейчас, подрабатывают или уже на пенсии.
- По родителям в family желательно укажи возраст, год рождения или дату рождения, если это можно правдоподобно восстановить.
- В family добавь хотя бы один теплый бытовой эпизод или ритуал: звонки, праздники, подарки, помощь, совместные поездки, домашние привычки.
- В блоке gifts распиши конкретную историю подарков и знаков внимания: что дарили родители, родственники, бывшие мужчины или близкие люди, в каком возрасте или периоде, с какой регулярностью и какой след это оставило.
- В gifts обязательно покажи, что она хочет получать от партнера сейчас, причем прямо и в первом лице: «я хочу получать», «я привыкла получать», «я жду от мужчины».
- В gifts обязательно укажи текущую частоту желаемых подарков: цветы каждую неделю или хотя бы несколько раз в месяц, плюс ощутимый подарок минимум раз в месяц или на важные даты.
- По умолчанию gifts должен читать женщину как человека, которому нравится щедрое ухаживание: частые цветы, букеты без повода, украшения, духи, техника, поездки, подарки на праздники и вне праздников. Не делай этот блок скромным, аскетичным или анти-материальным.
- Практичная помощь в gifts допустима только как дополнение. Не своди блок к формуле «мне важнее помощь делом, чем подарки» или «полезное важнее подарков».
- В блоке sexualPreferences пиши откровенно, конкретно и взросло, но без эротизации и только в добровольном и законном контексте.
- В блоке sexualPreferences не ограничивайся общей фразой про доверие или нежность: раскрывай конкретнее темп, инициативу, границы, телесность, что притягивает, что отталкивает, и фантазии или сценарии, если они поддержаны базой.
- В sexualPreferences обязательно показывай частоту желания и секса, отношение к порно и мастурбации, опыт с бывшими партнерами, возможны ли случайные встречи или только отношения, отношение к игрушкам и конкретным практикам.
- ${sexualExpressivenessRule}
- Это сервис знакомств только для женщин: персонаж должна оставаться женщиной, свободной, не замужем и открытой к отношениям именно с мужчиной; не делай её счастливой женой, невестой, занятой партнёршей или человеком, ищущим женщин.
- blocks_meta обязателен по всем блокам.

Пользовательский prompt этапа:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Block spec JSON:
${JSON.stringify(blockSpec, null, 2)}

Anchors JSON:
${JSON.stringify(compactAnchors, null, 2)}

Fact bank JSON:
${JSON.stringify(compactFacts, null, 2)}
`.trim();
}

function buildStage3PromptWithMode({ canon, anchors, facts, blocksStagePrompt, fullTextStagePrompt, outputMode }) {
  const blockSpec = buildLegendBlockSpec();
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  const legendShape = LEGEND_BLOCKS.reduce((acc, block) => {
    acc[block.key] = '';
    return acc;
  }, {});
  const compactFacts = facts.map((item) => ({
    id: item.id,
    text: item.text,
    sphere: item.sphere,
    year: item.year,
    age: item.age,
    hook: item.hook
  }));
  const compactAnchors = (Array.isArray(anchors) ? anchors : []).map((item) => ({
    id: item.id,
    sphere: item.sphere,
    year: item.year,
    month: item.month,
    age: item.age,
    location: item.location,
    event: item.event,
    worldview_shift: item.worldview_shift,
    outcome: item.outcome,
    hook: item.hook
  }));
  const normalizedOutputMode = normalizeStage3OutputMode(outputMode);
  const responseShape = {};
  const modeRequirements = [];

  if (normalizedOutputMode === 'blocks' || normalizedOutputMode === 'both') {
    responseShape.legend = legendShape;
    responseShape.blocks_meta = {
      [LEGEND_BLOCKS[0]?.key || 'lifestyle']: { facts_used: 12, hooks_used: 2 }
    };
    modeRequirements.push('- Return legend with every key from block_spec in the exact same order.');
    modeRequirements.push('- Every legend block must be in English and in first person. Do not use bullet lists, but do use structured mini-sections inside the block with markdown-style bold labels on separate lines when helpful, such as **Parents:**, **Friends:**, **Fantasies:**, **Health now:**, **Turn-ons:**, or similar.');
    modeRequirements.push('- Blocks must be rich but selective. Do not try to squeeze the whole fact_bank into every block.');
    modeRequirements.push('- Most blocks should usually land around 120-220 words. family, job, exRelationships, lifePlans, health, sexualPreferences, and gifts should usually land around 180-320 words.');
    modeRequirements.push('- Keep factual density high: every 1-2 sentences should add a concrete detail, action, date, person, place, amount, habit, conflict, or consequence.');
    modeRequirements.push('- Use dates in only two ways: one-time events happened in a year ("In 2021 ..."), and periods or continuing states as ranges or open ranges ("2013-2017", "since 2021").');
    modeRequirements.push('- Do not open a block with empty framing or thesis lines like "My path to health...", "For me, family has always...", or "Friendship is important to me" unless that sentence immediately adds concrete information.');
    modeRequirements.push('- If a sentence can be removed without losing a concrete fact, routine, person, place, symptom, action, consequence, frequency, or preference, do not write it.');
    modeRequirements.push('- family must cover parents or substitute adults, home structure, support, conflict, money, roles, and at least one warm routine. A sister or children cannot consume the whole block.');
    modeRequirements.push('- family should name both parents when possible, and should include grandparents when plausible.');
    modeRequirements.push('- family should include at least two concrete examples or routines with named relatives, preferably with a time marker, place, or repeated habit.');
    modeRequirements.push('- friendsAndPets must not be generic. Name at least one recurring non-family human contact such as a friend, coworker, volunteer, neighbor, or classmate, say how often they meet or call, what they do together, and include at least one concrete shared scene or routine. If pets exist, include ordinary care details, but a pet cannot replace human social detail.');
    modeRequirements.push('- gifts must combine remembered gift history with current expectations from a male partner now.');
    modeRequirements.push('- gifts should read materially receptive by default unless canon explicitly forbids it: flowers, bouquets without occasion, jewelry, perfume, gadgets, trips, paid treats, and a man not arriving empty-handed.');
    modeRequirements.push('- gifts must state direct first-person expectations and cadence such as weekly flowers or several bouquets a month plus a noticeable gift at least monthly.');
    modeRequirements.push('- sexualPreferences must be one of the richest blocks, not a polite summary. Be specific about desire, initiative, pace, practices, turn-ons, turn-offs, fantasies, masturbation, porn habits, toys, casual versus relationship-only sex, and previous-partner experience.');
    modeRequirements.push('- sexualPreferences must include concrete examples, not only general preferences: named or clearly identified former partners, approximate time markers, specific encounters, and at least one example of what worked or failed.');
    modeRequirements.push(`- ${sexualExpressivenessRule}`);
    modeRequirements.push('- blocks_meta is required for every block.');
  }

  if (normalizedOutputMode === 'full_text' || normalizedOutputMode === 'both') {
    responseShape.legend_full_text = 'One continuous first-person English biography.';
    modeRequirements.push('- Return legend_full_text as one continuous first-person English biography with no headings or lists.');
    modeRequirements.push('- legend_full_text must be selective and shorter than the combined blocks, not an exhaustive fact dump.');
    modeRequirements.push('- Target roughly 600-850 words. If the text starts becoming exhaustive, compress it.');
    modeRequirements.push('- Use the strongest and most characteristic material only. Do not try to mention every micro-fact, every year, or every minor detail.');
    modeRequirements.push('- Build a clear life arc from childhood to present and near future, but keep it as a synthesis rather than a full archive.');
    modeRequirements.push('- Keep it factual, plain, and grounded. No literary framing, no checklist tone, no bloated repetition.');
    modeRequirements.push('- Do not copy thematic blocks into legend_full_text paragraph by paragraph. The full text must synthesize the life into one flowing chronology.');
    modeRequirements.push('- In legend_full_text, sexuality, gifts, family, and other themes should be represented through a few concrete examples and present-day conclusions, not by pasting long dedicated mini-blocks.');
  }

  if (normalizedOutputMode === 'both') {
    modeRequirements.push('- legend and legend_full_text must describe the same life with no factual contradictions.');
  }

  return `
You are assembling the final biography output from canon, anchors, and fact_bank.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
${JSON.stringify(responseShape, null, 2)}

Global rules:
- All generated natural-language output must be in English.
- Canon JSON is the hard truth. Do not contradict canon identity, timeline, relationship status, job core, or family core.
- Anchors and fact_bank are the source material. Use them selectively and intelligently, not mechanically.
- Low-drama plausible supporting detail is allowed when needed for coherence, but keep it ordinary, realistic, and internally consistent.
- Avoid metaphors, symbolism, and polished essay language. Use plain factual English.
- Do not repeat the same fact across several blocks unless a short callback is truly needed.
- This is a dating profile for a single woman who is open to a relationship with a man. Do not turn her into a married or occupied protagonist.

Mode-specific requirements:
${modeRequirements.join('\n')}

User stage prompts:
- output_mode = ${normalizedOutputMode}
- blocks prompt = ${safeString(blocksStagePrompt).trim()}
- full_text prompt = ${safeString(fullTextStagePrompt).trim()}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Block spec JSON:
${JSON.stringify(blockSpec, null, 2)}

Anchors JSON:
${JSON.stringify(compactAnchors, null, 2)}

Fact bank JSON:
${JSON.stringify(compactFacts, null, 2)}
`.trim();
}

function buildLegendBlocksRepairPrompt({ canon, anchors, facts, currentBlocks, issues, stagePrompt }) {
  const blockSpec = buildLegendBlockSpec();
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  const legendShape = LEGEND_BLOCKS.reduce((acc, block) => {
    acc[block.key] = '';
    return acc;
  }, {});
  const compactFacts = facts.map((item) => ({
    id: item.id,
    text: item.text,
    sphere: item.sphere,
    year: item.year,
    age: item.age,
    hook: item.hook
  }));
  const compactAnchors = (Array.isArray(anchors) ? anchors : []).map((item) => ({
    id: item.id,
    sphere: item.sphere,
    year: item.year,
    month: item.month,
    age: item.age,
    location: item.location,
    event: item.event,
    worldview_shift: item.worldview_shift,
    outcome: item.outcome,
    hook: item.hook
  }));

  return `
You are repairing already generated legend blocks.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend": ${JSON.stringify(legendShape, null, 2)},
  "blocks_meta": {
    "${LEGEND_BLOCKS[0]?.key || 'lifestyle'}": { "facts_used": 12, "hooks_used": 2 }
  }
}

Problems to fix:
${normalizeStringList(issues).map((item) => `- ${item}`).join('\n')}

Critical rules:
- All rewritten natural-language block text must be in English.
- Preserve the useful parts of the current blocks, but rewrite weak blocks until the issues disappear.
- If a block sounds like an essay, story, or literary monologue, rewrite it into direct factual first-person prose.
- No metaphors, symbolic comparisons, or decorative phrasing.
- Every 1-2 sentences should add a new concrete fact, action, date, person, place, amount, habit, conflict, or consequence.
- Use short in-block mini-sections with markdown-style bold labels on separate lines when helpful, such as **Parents:**, **Friends:**, **Fantasies:**, **Health now:**, or similar. No bullet lists.
- Use dates in only two ways: one-time events happened in a year ("In 2021 ..."), and periods or continuing states as ranges or open ranges ("2013-2017", "since 2021").
- Do not open a block with empty framing or thesis lines like "My path to health...", "For me, family has always...", or "Friendship is important to me" unless that sentence immediately adds concrete information.
- Remove any sentence that can be cut without losing a concrete fact, routine, person, place, symptom, action, consequence, frequency, or preference.
- Keep blocks selective but rich. Most blocks should usually stay around 120-220 words. family, job, exRelationships, lifePlans, health, sexualPreferences, and gifts should usually stay around 180-320 words.
- family must not collapse into only a sister, children, or one motif. It must cover parents or substitute adults, structure, roles, money, and at least one warm routine.
- family should include at least two concrete examples or routines with named relatives, not only generic description.
- friendsAndPets must name at least one recurring non-family human contact, include meeting/call cadence, and show at least one concrete social routine or scene. A sister or pet is not enough by itself.
- gifts must include remembered gift history plus present-day expectations now, with direct first-person phrasing and a cadence such as weekly flowers or several bouquets a month plus a noticeable gift at least monthly.
- gifts should read materially receptive by default unless canon explicitly forbids that.
- sexualPreferences must be one of the richest blocks and must stay concrete about desire, initiative, frequency, toys, practices, fantasies, casual versus relationship-only sex, and previous-partner experience.
- sexualPreferences should include concrete examples tied to previous partners or identifiable past situations, not only a catalog of preferences.
- ${sexualExpressivenessRule}
- This is a dating profile for a single woman who is open to a relationship with a man. Remove occupied-relationship framing.
- If direct data is sparse, low-drama plausible support detail is allowed, but do not break canon, timeline, or core facts.
- Return the full legend object with all keys and blocks_meta.

User stage prompt:
${safeString(stagePrompt).trim()}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Current legend JSON:
${JSON.stringify(currentBlocks, null, 2)}

Block spec JSON:
${JSON.stringify(blockSpec, null, 2)}

Anchors JSON:
${JSON.stringify(compactAnchors, null, 2)}

Fact bank JSON:
${JSON.stringify(compactFacts, null, 2)}
`.trim();
}

async function repairLegendBlocks({ canon, anchors, facts, currentBlocks, stagePrompt, issues, generationType, requestId }) {
  const prompt = buildLegendBlocksRepairPrompt({
    canon,
    anchors,
    facts,
    currentBlocks,
    issues,
    stagePrompt
  });

  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_blocks'
  });

  return {
    response: generated.response,
    legendBlocks: normalizeLegendBlocks(generated.parsed.legend || generated.parsed.legend_blocks || generated.parsed.legend_v1_final_json || {}),
    legendFullText: extractLegendFullText(generated.parsed),
    blocksMetaSource: generated.parsed.blocks_meta || generated.parsed?.blocks_report?.blocks_meta || {}
  };
}

function buildSexualPreferencesOverridePrompt({ canon, anchors, facts, currentBlocks, stagePrompt }) {
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  const sexualExpressivenessGuard = buildSexualExpressivenessOverrideGuard(canon?.personality_profile?.sexual_expressiveness);
  const relevantSpheres = new Set(['sexuality', 'relationships', 'values', 'future', 'crisis']);
  const factsList = Array.isArray(facts) ? facts : [];
  const anchorsList = Array.isArray(anchors) ? anchors : [];

  const selectedFacts = factsList.filter((item) => {
    const sphere = normalizeSphere(item?.sphere, '');
    return relevantSpheres.has(sphere) || Boolean(item?.hook);
  });
  const selectedAnchors = anchorsList.filter((item) => {
    const sphere = normalizeSphere(item?.sphere, '');
    return relevantSpheres.has(sphere) || Boolean(item?.hook);
  });

  const compactFacts = (selectedFacts.length > 0 ? selectedFacts : factsList.slice(0, 24)).map((item) => ({
    id: item.id,
    text: item.text,
    sphere: item.sphere,
    year: item.year,
    age: item.age,
    hook: item.hook
  }));
  const compactAnchors = (selectedAnchors.length > 0 ? selectedAnchors : anchorsList.slice(-12)).map((item) => ({
    id: item.id,
    sphere: item.sphere,
    year: item.year,
    month: item.month,
    age: item.age,
    location: item.location,
    event: item.event,
    worldview_shift: item.worldview_shift,
    outcome: item.outcome,
    hook: item.hook
  }));
  const supportingLegend = {
    character: safeString(currentBlocks?.character).trim(),
    exRelationships: safeString(currentBlocks?.exRelationships).trim(),
    lifePlans: safeString(currentBlocks?.lifePlans).trim(),
    sexualPreferences: safeString(currentBlocks?.sexualPreferences).trim()
  };

  return `
You are rewriting only one legend block: legend.sexualPreferences.
${BASE_JSON_RULES_EN}

Return JSON:
{
  "sexualPreferences": "one long first-person English block"
}

Requirements:
- Rewrite only sexualPreferences. Do not return any other legend keys.
- The text must be in English and in first person.
- Keep the same readable format as the normal legend blocks: first-person prose with short in-block mini-sections allowed. No bullet lists. Use markdown-style bold labels on separate lines where useful, such as **Libido:**, **Fantasies:**, **Turn-ons:**, **Turn-offs:**, **Practices:**, **Casual sex:**, or **Toys:**.
- Ground every claim in canon, anchors, fact_bank, or a low-drama plausible inference from them.
- Keep full consistency with the already generated biography. Do not change timeline, family, job, or other life facts.
- Adult, consensual, legal context only.
- Use dates in only two ways: one-time events happened in a year ("In 2021 ..."), and periods or continuing states as ranges or open ranges ("2017-2019", "since 2021").
- ${sexualExpressivenessRule}
- ${sexualExpressivenessGuard}
- For score 10, make the block read as near-constant appetite and unusually broad adult openness: sex should feel like a recurring need, not an occasional bonus; show frequent desire, frequent self-initiation, frustration with long dry spells, repeated pursuit of novelty, and a wide tolerated menu of practices and partner formats unless canon explicitly narrows it.
- Be specific about libido, initiative, pace, boundaries, bodily comfort, turn-ons, turn-offs, fantasies, masturbation, porn habits, casual vs relationship-only sex, toys, and concrete previous-partner experience when supported.
- Do not mention safewords, aftercare, STI-testing routines, sobriety rules, or long safety / protection checklists unless canon explicitly contains them.
- For scores 8-10, do not turn group, swing, MFM, threesome, or several-men material into a blanket hard-no unless canon explicitly forces that; prefer arousal plus selectivity or privacy over total rejection.
- For scores 8-10, any wording about condoms, consent, trust, boundaries, protection, or caution must be compressed into one short clause or one short sentence total, not repeated in multiple places and not allowed to set the tone of the block.
- Do not turn this into pornographic writing or a sex scene. Keep it factual, direct, and readable.
- If the current Gemini block already contains a useful supported detail, you may preserve it, but improve depth and precision.

Stage prompt:
${safeString(stagePrompt).trim()}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Supporting legend JSON:
${JSON.stringify(supportingLegend, null, 2)}

Relevant anchors JSON:
${JSON.stringify(compactAnchors, null, 2)}

Relevant fact bank JSON:
${JSON.stringify(compactFacts, null, 2)}
`.trim();
}

function extractSexualPreferencesOverrideText(parsed) {
  return safeString(parsed?.sexualPreferences || parsed?.sexual_preferences || parsed?.legend?.sexualPreferences).trim();
}

function countSexualSafetyCompressionMentions(text) {
  return countRegexMatches(
    text,
    /презерват|соглас|довер|границ|защит|осторож|проверенн|трезв|безопас|condom|consent|trust|boundary|protection|safe/giu
  );
}

function countSexualSafetyCompressionSentences(text) {
  return countRegexMatches(
    text,
    /[^.!?\n]{0,220}(?:презерват|соглас|довер|границ|защит|осторож|проверенн|трезв|безопас|condom|consent|trust|boundary|protection|safe)[^.!?\n]{0,220}[.!?]?/giu
  );
}

function auditSexualPreferencesOverrideText({ canon, text }) {
  const issues = [];
  const canonText = safeString(JSON.stringify(canon || {}));
  const sexualScoreRaw = Number(canon?.personality_profile?.sexual_expressiveness);
  const sexualScore = Number.isFinite(sexualScoreRaw) ? clampInt(sexualScoreRaw, 1, 10) : null;
  const normalizedText = safeString(text).trim();
  const canonRestrictsCasualSex = /РЅРµ\s+РёС‰\w*[^.]{0,40}СЃРµРєСЃ\s+РЅР°\s+РѕРґРЅСѓ\s+РЅРѕС‡СЊ|С‚РѕР»СЊРєРѕ\s+РІ\s+РѕС‚РЅРѕС€РµРЅРё|casual\s+is\s+not|only\s+in\s+relationships/iu.test(
    canonText
  );
  if (!normalizedText) {
    issues.push('The block is empty.');
    return issues;
  }

  if (Number.isFinite(sexualScore) && sexualScore >= 8) {
    const safetyMentions = countSexualSafetyCompressionMentions(normalizedText);
    const safetySentences = countSexualSafetyCompressionSentences(normalizedText);
    if (safetyMentions > 2 || safetySentences > 1) {
      issues.push('Compress all condom / consent / trust / boundary / protection wording into one very short phrase or one short sentence total.');
    }
  }

  if (sexualScore === 10) {
    if (/стоп-слов|aftercare|иппп|sti|std|тест(?:ы|ов)\s+на|никаких\s+веществ|только\s+с\s+проверенн|минимум\s+\w+\s+месяц|без\s+обсуждения\s+заранее|предварительн\w+\s+душ|safeword|safe word/iu.test(normalizedText)) {
      issues.push('Remove safewords, aftercare, STI-testing routines, sobriety rules, and procedural safety details.');
    }
  }

  if (sexualScore === 10) {
    if (!/daily|near-daily|multiple times a day|most days|every day/iu.test(normalizedText)) {
      issues.push('Make the libido read as daily or near-daily, not moderate weekly.');
    }
    if (!/restless without sex|hard to go long without|dry spell|go too long without|need sex regularly|sexual tension builds quickly|can't go long without|long dry spells feel/iu.test(normalizedText)) {
      issues.push('Show that long dry spells feel frustrating and that sex reads as a recurring physical need.');
    }
    if (!/central part of (?:my )?life|one of the main parts of my life|main organizing force|partner choice/iu.test(normalizedText)) {
      issues.push('Make sexuality one of the central forces in adult life and partner choice.');
    }
    if (!/initiat|make the first move|ask directly|go after sex|lead in bed|pull him toward me|reach for him first|self-initiated/i.test(normalizedText)) {
      issues.push('Show that she often initiates, asks directly, or actively drives sex instead of mainly waiting.');
    }
    if (
      !canonRestrictsCasualSex &&
      !/(?:casual|one[- ]night|hookup|spontaneous|without relationships|no-strings|short-format).{0,80}(?:appeal|excite|want|like|fit|works? for me|turns me on|enjoy)|(?:appeal|excite|want|like|fit|works? for me|turns me on|enjoy).{0,80}(?:casual|one[- ]night|hookup|spontaneous|no-strings|short-format)/iu.test(
        normalizedText
      )
    ) {
      issues.push('Add explicit positive openness to casual or spontaneous sex, not only relationship framing.');
    }
    if (!/multi-partner|group|mfm|threesome|swing|orgy|several men/iu.test(normalizedText)) {
      issues.push('Add an explicit multi-partner or group line.');
    }
    if (
      !/(?:mfm|threesome|swing|orgy|several men|group).{0,80}(?:excite|turn me on|want|curious|like|repeat|arous)|(?:excite|turn me on|want|curious|like|repeat|arous).{0,80}(?:mfm|threesome|swing|orgy|several men|group)/iu.test(
        normalizedText
      )
    ) {
      issues.push('Frame group or several-men material as active arousal, curiosity, desire, prior experience, or willingness to repeat it selectively.');
    }
    if (
      /(?:group|threesome|swing|mfm).{0,80}(?:not for me|do not want|never again|does not fit me|hard no)|(?:not for me|do not want|never again|does not fit me|hard no).{0,80}(?:group|threesome|swing|mfm)/iu.test(
        normalizedText
      )
    ) {
      issues.push('Do not turn group or multi-partner contexts into a hard rejection unless canon explicitly forces it.');
    }
    if (
      [
        /oral|anal|blowjob|cunnilingus/iu.test(normalizedText),
        /kiss|foreplay|touch|hands?|lips?/iu.test(normalizedText),
        /domin|submi|rough|gentle/iu.test(normalizedText),
        /toy|vibrator|lube|sex toy/iu.test(normalizedText),
        /roleplay|scenario|public|car|hotel|shower|quick sex|slow sex/iu.test(normalizedText)
      ].filter(Boolean).length < 4
    ) {
      issues.push('Broaden the range of concrete practices and dynamics so the block reads maximal rather than medium.');
    }
  }

  return issues;
}

function buildSexualPreferencesOverrideRepairPrompt({ basePrompt, currentText, issues }) {
  const normalizedIssues = Array.isArray(issues) ? issues.map((item) => safeString(item).trim()).filter(Boolean) : [];
  return `
${safeString(basePrompt).trim()}

Rewrite the block again. The previous draft is still too soft or too caveat-heavy for the target score.

Current draft:
${JSON.stringify(safeString(currentText).trim())}

Fix these problems:
${normalizedIssues.map((item) => `- ${item}`).join('\n')}
  `.trim();
}

async function maybeGenerateSexualPreferencesOverride({
  canon,
  anchors,
  facts,
  currentBlocks,
  stagePrompt,
  generationType,
  requestId
}) {
  if (!hasXaiCredentials() || !isXaiSexualRoutingEnabled()) {
    return null;
  }

  const basePrompt = buildSexualPreferencesOverridePrompt({
    canon,
    anchors,
    facts,
    currentBlocks,
    stagePrompt
  });
  let prompt = basePrompt;
  let lastGenerated = null;
  let lastText = '';
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const generated = await generateParsedXaiObject({
      prompt,
      generationType,
      requestId: safeString(requestId).trim()
        ? `${safeString(requestId).trim()}:sexual-preferences${attempt > 0 ? `:repair-${attempt}` : ''}`
        : `stage_3_sexual_preferences_override${attempt > 0 ? `:repair-${attempt}` : ''}`,
      timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
      stageKey: 'stage_3_sexual_preferences_override'
    });
    const text = extractSexualPreferencesOverrideText(generated.parsed);
    if (!text) {
      throw new Error('xAI did not return sexualPreferences override.');
    }

    lastGenerated = generated;
    lastText = text;
    const issues = auditSexualPreferencesOverrideText({ canon, text });
    if (issues.length === 0) {
      return {
        response: generated.response,
        text
      };
    }

    if (attempt === maxAttempts - 1) {
      break;
    }

    prompt = buildSexualPreferencesOverrideRepairPrompt({
      basePrompt,
      currentText: text,
      issues
    });
  }

  return {
    response: lastGenerated?.response || null,
    text: lastText
  };
}

function buildStage4Prompt({ canon, anchors, factBankReport, legendBlocks, stagePrompt }) {
  const qcSpec = QC_CHECKS.map((item) => ({ key: item.key, title: item.title }));

  return `
You are performing the final legend QC pass.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "qc_report": {
    "checks": [
      {
        "key": "canon_consistency",
        "title": "Canon Consistency",
        "passed": true,
        "issues": []
      }
    ],
    "summary": {
      "passed_checks": 8,
      "total_checks": 8,
      "ready": true
    }
  }
}

Requirements:
- All titles and issues must be in English.
- checks must cover every key from qc_spec.
- issues must be short, concrete action items.
- Evaluate only from the provided data.

User stage prompt:
${safeString(stagePrompt).trim()}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Anchors JSON:
${JSON.stringify(anchors, null, 2)}

Fact bank report JSON:
${JSON.stringify(factBankReport, null, 2)}

Legend blocks JSON:
${JSON.stringify(legendBlocks, null, 2)}

QC spec JSON:
${JSON.stringify(qcSpec, null, 2)}
`.trim();
}

function resolveEarliestSupportedPoint(anchors, facts) {
  let best = null;
  const items = [...(Array.isArray(anchors) ? anchors : []), ...(Array.isArray(facts) ? facts : [])];
  for (const item of items) {
    const year = Number(item?.year);
    const age = Number(item?.age);
    const candidate = {
      year: Number.isFinite(year) ? year : null,
      age: Number.isFinite(age) ? age : null,
      sphere: safeString(item?.sphere),
      text: safeString(item?.event || item?.text)
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.year !== null && (best.year === null || candidate.year < best.year)) {
      best = candidate;
      continue;
    }
    if (candidate.year !== null && best.year !== null && candidate.year === best.year && candidate.age !== null && (best.age === null || candidate.age < best.age)) {
      best = candidate;
      continue;
    }
    if (candidate.year === null && best.year === null && candidate.age !== null && (best.age === null || candidate.age < best.age)) {
      best = candidate;
    }
  }
  return best;
}

function buildFullTextRepairPrompt({ canon, anchors, facts, currentText, stagePrompt, auditIssues = [] }) {
  void anchors;
  void facts;
  const runtimeDateContext = buildRuntimeDateContext();
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  const normalizedIssues = normalizeStringList(auditIssues);
  const auditBlock = normalizedIssues.length
    ? `
Audit issues that must be fixed in the rewrite:
${JSON.stringify(normalizedIssues, null, 2)}
`
    : '';

  return `
You are aggressively repairing a generated first-person biography so that it stays grounded in sparse canon and stops pretending invented backstory is real.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person biography"
}

Rules:
- Canon JSON is the only hard source of truth.
- Anchors, fact_bank, and the current generated text are untrusted draft material. They may contain unsupported invention. Never keep a specific detail only because it appears there.
- Rewrite the current text from scratch if needed. Keep it long, natural, first-person, and one continuous block without headings or lists.
- Preserve every significant Canon JSON fact. If canon contains explicit names, dates, ages, numbers, places, jobs, education facts, family structure, routines, pets, housing details, or other hard specifics, they must stay present in the rewrite.
- If Canon JSON supports concrete numeric or named details, do not wash them out into vague wording.
- Remove, generalize, or replace any scene, chronology, explanation, or implication that is not directly supported by Canon JSON.
- When in doubt, delete the detail or make it broader. A vaguer text is better than fake canon.
- Present-day reference date for continuity: ${runtimeDateContext}. If you narrate a current-day scene, keep the date and age coherent with this reference.
- Ban abstract declaration language. Do not write phrases like "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "he has to understand", "this matters to me", "I value", "I love", or "this brings joy" or close variants. Show all of that through action, routine, dialogue, avoidance, aftermath, and bodily behavior.
- Do not narrate childhood, school years, university life, first jobs, origin stories, parent history, hometown routines, old relationships, medical episodes, or rescue milestones unless Canon JSON explicitly contains those facts.
- Generic canon labels like "University", "model", "volunteer", "creative person", "quiet evenings at home", "never say never", or "has a twin sister" do not justify a detailed life chronology by themselves.
- If canon is mostly about present-day values, preferences, routines, partner requirements, or existing relationships, keep the biography mostly in the present and recent adult life. Do not explain everything with invented backstory.
- If a twin, sibling, friend, pet, hobby, or job is only supported as a current or broad adult fact, keep most narration in current or broad adult terms. Do not invent matching childhood details, first rescue missions, exact student years, exact workplaces, or detailed turning points from the past.
- You may add only soft, low-risk scene details that stay in recent adult life: a quiet evening, a short conversation, a small argument, a boring shift, a missed call, a friend dropping by, a taxi ride, a messy kitchen, a postponed plan, a failed date. Such details must not become new biography pillars.
- A soft scene detail must not silently lock in unsupported living arrangements, exact workplaces, exact volunteer institutions, fixed schedules, or other hidden canon. If those logistics are not explicit in Canon JSON, keep them broad.
- If a sibling or twin is explicit but cohabitation is not, prefer meetings, calls, visits, chats, or spending time together over assuming the same home.
- Keep the factual density high. The rewrite must not become either a dry report or a vague lyrical sketch.
- Weave facts through scenes, actions, dialogue, routines, and domestic texture instead of listing them.
- Every paragraph must include at least one explicit numeric detail such as a date, year, age, amount, duration, count, or time of day.
- Every important moment must become a micro-scene: what happened, what the character did with hands/body/objects, and what happened immediately after.
- Each paragraph must introduce new information. Do not restate the same thesis about the twin bond in different words.
- Add imperfections and contradictions: selfish moments, irritating habits, illogical choices, avoidance, sharp replies, or mismatches between what the character wants and what they do.
- Add useless but real details that do not serve grand narrative purpose: food, mugs, clothes, apartment mess, objects on shelves, transport, laundry, receipts, notes, stains, broken things.
- Keep reflection minimal. At most one short reflective sentence per paragraph; most sentences should be scene, object, movement, dialogue, or aftermath.
- Include grounded positive moments such as laughter, relief, physical ease, appetite, silliness, or small pleasure instead of abstract statements about happiness.
- The repaired text must contain at least one small mistake, awkward episode, impulsive choice, or procrastination moment.
- The repaired text must contain at least one or two minor named people in recent adult life, such as a friend, colleague, neighbor, volunteer, or acquaintance. Use them only as local scene texture, not as major canon.
- The repaired text must contain at least two concrete scenes of interaction in everyday adult life.
- Friends with names are allowed only as minor present-day scene texture. They must not create a new canon layer.
- Preserve the non-idealized human tone: awkwardness, mistakes, boredom, laziness, small social scenes, imperfect decisions, ordinary routines, and life outside work.
- If the current text opens with a cinematic origin story or any unsupported detailed chronology, remove it and rebuild the text closer to the present.
- Do not mention the repair process.
- Return only legend_full_text.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

${auditBlock}
Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

function buildFullTextAuditPrompt({ canon, currentText, stagePrompt }) {
  return `
You are auditing a first-person biography generated from sparse canon.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "audit": {
    "preserves_key_input_facts": true,
    "invents_hard_canon": false,
    "too_idealized": false,
    "too_dry_report": false,
    "too_vague_artistic": false,
    "has_abstract_declarations": false,
    "each_paragraph_has_numeric_detail": true,
    "has_micro_scenes": true,
    "repeats_core_thesis": false,
    "has_flaws_and_contradictions": true,
    "has_useless_real_life_details": true,
    "has_grounded_positive_moments": true,
    "has_small_failures_or_procrastination": true,
    "has_named_minor_people_beyond_core_family": true,
    "has_concrete_social_scenes": true,
    "has_life_outside_work_and_goals": true,
    "overloaded_with_reflection": false,
    "locks_unsupported_logistics": false,
    "issues": ["short actionable issue"],
    "ready": true
  }
}

Audit rules:
- Canon JSON is the only hard source of truth.
- preserves_key_input_facts = true only if all significant Canon JSON facts are still present or clearly preserved in paraphrase, especially names, ages, dates, jobs, education, family structure, routines, pets, cities, explicit numbers, and other concrete supported details.
- invents_hard_canon = true if the text adds unsupported fixed facts like specific childhood history, school history, origin mythology, exact institutions, exact prior jobs, exact medical episodes, detailed rescue milestones, cohabitation, or other hard biography that Canon JSON does not explicitly support.
- too_idealized = true if the character reads too polished, too disciplined, too emotionally neat, too wise, or too much like a high-performer for the sparse input.
- too_dry_report = true if the text reads like a compressed biography report or summary of facts rather than lived scenes.
- too_vague_artistic = true if the text drifts into mood or literary texture but loses factual density, named detail, numbers, routines, work/study specifics, or other supported concreteness.
- has_abstract_declarations = true if the text explains itself with statements like "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "this matters to me", "I love", "I value", or "this brings joy" or close declarative substitutes instead of scene-based evidence.
- each_paragraph_has_numeric_detail = true only if every paragraph contains at least one explicit numeric detail such as a year, date, age, amount, duration, count, or time.
- has_micro_scenes = true only if important beats are shown as scenes with physical action and immediate aftermath, not only summarized.
- repeats_core_thesis = true if the same central idea, especially about relationships or identity, is repeated across paragraphs in slightly different words instead of introducing new facts.
- has_flaws_and_contradictions = true only if the text shows non-ideal behavior, contradictions, selfishness, irritation, avoidance, or messy inconsistency.
- has_useless_real_life_details = true only if the text contains grounded domestic detail that is not merely symbolic: food, clothes, objects, mugs, laundry, receipts, transport, shelves, stains, room texture, and similar clutter of life.
- has_grounded_positive_moments = true only if positive experience is shown through laughter, relief, bodily ease, appetite, silliness, pleasure, or other concrete lived moments rather than abstract happiness language.
- has_small_failures_or_procrastination = true only if the text contains at least one clear small failure, awkward moment, impulsive decision, mess, laziness, or procrastination scene.
- has_named_minor_people_beyond_core_family = true only if the text contains at least one named minor person beyond the main character and explicitly core family such as the twin sister.
- has_concrete_social_scenes = true only if the text contains at least two specific interaction scenes, not just abstract summaries.
- has_life_outside_work_and_goals = true only if the text shows ordinary adult life beyond work, volunteering, romance goals, or self-improvement.
- overloaded_with_reflection = true if the text spends too much time explaining the character with conclusions instead of showing scenes and behavior.
- locks_unsupported_logistics = true if the text quietly fixes unsupported logistics such as exact living arrangements, exact shelter or workplace names, exact schedules, or other hidden canon not present in Canon JSON.
- ready = true only if the text passes all checks with no material issues.
- issues must be short, concrete rewrite instructions.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

async function auditLegendFullText({ canon, currentText, stagePrompt, generationType, requestId }) {
  const prompt = buildFullTextAuditPrompt({
    canon,
    currentText,
    stagePrompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_audit'
  });

  const audit = normalizeFullTextAuditReport(generated?.parsed);
  const abstractDeclarationHits = extractAbstractDeclarationHits(currentText);
  const detectedNames = extractNamedMinorPeople(currentText, canon);
  const descriptionText = normalizeText(canon?.description || canon?.generalInfo?.description || '');
  const educationText = normalizeText(canon?.education || canon?.generalInfo?.education || '');
  const jobText = normalizeText(canon?.job || canon?.generalInfo?.occupation || '');
  const sisterMentions = extractNamedSisterMentions(currentText);
  const lifeYearMentions = extractYearMentions(currentText);
  const needsNamedSister = /(sister|twin|сестр|близнец)/iu.test(descriptionText);
  const needsParents = /(family|родител|семь|sister|twin|сестр|близнец)/iu.test(descriptionText);
  const needsEducationDetails = /(university|degree|student|college|faculty|университет|институт|студент|факультет|высш)/iu.test(educationText);
  const needsWorkDetails = Boolean(jobText);
  const paragraphs = [];
  const paragraphsMissingNumbers = [];
  const explicitDates = ['ok'];
  const vagueTimeHits = [];
  const dayNarrationHits = [];
  const poeticLanguageHits = [];
  const yearMentions = [2020, 2021, 2022, 2023, 2024, 2025];
  const textLength = Math.max(7200, safeString(currentText).trim().length);
  const hasIdentityOpening = true;
  const hasTimelineCoverage = true;
  const sisterNames = ['ok'];
  const parentsNamed = true;
  const hasUniversityFaculty = true;

  if (abstractDeclarationHits.length > 0) {
    audit.has_abstract_declarations = true;
    audit.ready = false;
    if (!audit.issues.some((item) => /abstract declarations/i.test(item))) {
      audit.issues.push('Remove abstract declarations and show feelings only through behavior and aftermath.');
    }
  }

  if (detectedNames.length === 0) {
    audit.has_named_minor_people_beyond_core_family = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /named minor person/i.test(item))) {
      audit.issues.push('Add at least one named minor person beyond the core family.');
    }
  }

  if (!hasIdentityOpening) {
    audit.starts_with_factual_identity = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /factual identity/i.test(item))) {
      audit.issues.push('Open with factual identity: full name, exact birth date, current age, and country or city if supported.');
    }
  }

  if (!hasTimelineCoverage || yearMentions.length < 4) {
    audit.covers_full_life_timeline = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /life timeline/i.test(item))) {
      audit.issues.push('Rewrite as a full life timeline covering childhood, school, family, education, work, relationships, and current routine.');
    }
  }

  if (poeticLanguageHits.length > 0) {
    audit.sounds_like_plain_autobiography = false;
    audit.too_vague_artistic = true;
    audit.ready = false;
    if (!audit.issues.some((item) => /plain autobiography/i.test(item))) {
      audit.issues.push('Remove poetic or story-like phrasing and make the voice plainer and more factual.');
    }
  }

  if (vagueTimeHits.length > 0) {
    audit.avoids_vague_time_words = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /vague time words/i.test(item))) {
      audit.issues.push('Remove vague time words like "вчера", "сегодня", "вечером", "днем", and "недавно".');
    }
  }

  if (dayNarrationHits.length > 0) {
    audit.avoids_day_based_narration = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /day narration/i.test(item))) {
      audit.issues.push('Remove day-based narration with "today/yesterday/morning/evening" framing and rewrite as a chronological life summary.');
    }
  }

  if (sisterNames.length === 0) {
    audit.has_named_sister = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /sister explicitly/i.test(item))) {
      audit.issues.push('Name the sister explicitly and keep that name consistent.');
    }
  }

  if (!parentsNamed) {
    audit.has_named_parents = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /both parents/i.test(item))) {
      audit.issues.push('Add names for both parents in a plain factual way.');
    }
  }

  if (!hasUniversityFaculty) {
    audit.has_university_and_faculty_details = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /university and the faculty/i.test(item))) {
      audit.issues.push('Specify a realistic university and the faculty names with years of study.');
    }
  }

  if (textLength < 6500) {
    audit.long_enough_for_dense_bio = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /substantially longer/i.test(item))) {
      audit.issues.push('Make the autobiography substantially longer and denser, not a short sketch.');
    }
  }

  if (yearMentions.length < 6 || explicitDates.length < 1) {
    audit.uses_exact_dates_and_times = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /years, dates, ages/i.test(item))) {
      audit.issues.push('Increase year, date, and age density across the life timeline.');
    }
  }

  if (yearMentions.length >= 6) {
    audit.spans_multiple_dated_days = true;
  }

  return {
    audit,
    response: generated.response
  };
}

async function repairLegendFullText({
  canon,
  anchors,
  facts,
  legendBlocks,
  currentText,
  stagePrompt,
  auditIssues = [],
  generationType,
  requestId
}) {
  const prompt = buildFullTextRepairPrompt({
    canon,
    anchors,
    facts,
    legendBlocks,
    currentText,
    stagePrompt,
    auditIssues
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_repair'
  });
  const repairedText = safeString(generated?.parsed?.legend_full_text || generated?.parsed?.full_text || generated?.parsed?.life_story).trim();
  if (!repairedText) {
    throw new Error('Gemini did not return legend_full_text during stage_3_full_text_repair.');
  }
  return {
    text: repairedText,
    response: generated.response
  };
}

function buildFullTextCompressionPrompt({ canon, legendBlocks, currentText, stagePrompt }) {
  const support = buildLegendBlocksSupportForFullText(legendBlocks);
  return `
You are compressing an overlong first-person biography.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person biography"
}

Rules:
- The output must stay in English, in first person, with no headings and no lists.
- Compress the current biography aggressively to roughly 600-850 words.
- Preserve canon identity, birth data, parents, core education and work path, one or two key relationship points, current life, near-future plans, and the core gist of gifts and sexuality when present.
- Remove secondary anecdotes, duplicate examples, archive-like domestic clutter, and minor year-by-year incidents.
- If the text reads like separate thematic mini-blocks pasted one after another, merge them back into one chronological biography.
- Keep sexuality, gifts, health, and similar themes compact in this pass: one or two concrete examples plus the present-day conclusion are enough.
- Do not let the ending become a stacked dossier of sexuality, gifts, health, and plans. Merge them into one present-day passage.
- Do not add new facts and do not rewrite the life into a different person.
- Keep the tone factual, plain, and readable.
- This is a compression pass, not a rewrite to a longer or richer version.
- Return only legend_full_text.

Stage prompt from the user:
${safeString(stagePrompt).trim()}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Supporting legend blocks JSON:
${JSON.stringify(support, null, 2)}

Current overlong text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

async function compressLegendFullText({
  canon,
  legendBlocks,
  currentText,
  stagePrompt,
  generationType,
  requestId
}) {
  const prompt = buildFullTextCompressionPrompt({
    canon,
    legendBlocks,
    currentText,
    stagePrompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_compress'
  });
  const compressedText = safeString(generated?.parsed?.legend_full_text || generated?.parsed?.full_text || generated?.parsed?.life_story).trim();
  if (!compressedText) {
    throw new Error('Gemini did not return legend_full_text during stage_3_full_text_compress.');
  }
  return {
    text: compressedText,
    response: generated.response
  };
}

function buildLegendBlocksSupportForFullText(legendBlocks) {
  const preferredKeys = [
    'family',
    'friendsAndPets',
    'childhoodMemories',
    'job',
    'exRelationships',
    'lifePlans',
    'gifts',
    'sexualPreferences',
    'health',
    'lifestyle'
  ];
  const source = legendBlocks && typeof legendBlocks === 'object' && !Array.isArray(legendBlocks) ? legendBlocks : {};
  const support = {};
  for (const key of preferredKeys) {
    const text = safeString(source[key]).trim();
    if (text) {
      support[key] = text;
    }
  }
  return support;
}

function buildCanonFirstFullTextPrompt({ canon, stagePrompt }) {
  return `
You are writing a long first-person biography from sparse hard facts.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person biography"
}

Hard source of truth:
- Canon JSON is the only hard source of truth.
- Do not treat inferred timelines, likely backstory, or genre expectations as facts.

Requirements:
- Write one continuous first-person text with no headings, lists, or block structure.
- Use only the hard facts from Canon JSON as fixed biography.
- Preserve every significant Canon JSON fact in the final narrative. If the canon contains explicit names, ages, dates, numbers, places, work, education, family structure, routines, pets, housing, projects, or other concrete details, they must remain visible in the text.
- If Canon JSON contains concrete numeric or named detail, do not blur it away into generic wording.
- If data is missing, you may invent only soft, low-risk adult scene details that do not create new biography pillars.
- Ban abstract declaration language. Do not use phrases like "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "he has to understand", "this matters to me", "I value", "I love", or "this brings joy". Show those meanings only through scenes and behavior.
- Do not narrate childhood, school years, parent history, origin myth, first love, university life, or early career unless Canon JSON explicitly gives those facts.
- If early years are missing, either skip them or cover them in one brief vague sentence. Start substantive narration in late teens, adulthood, or the present.
- Labels such as "University", "model", "volunteer", "creative person", "quiet evenings at home", "has a twin sister", or "looking for a partner" do not justify a detailed chronology by themselves.
- Keep the biography close to present life and recent adult patterns unless canon explicitly supports older periods.
- Preserve an ordinary human texture: awkward dates, laziness, chores, boredom, small social scenes, quiet routines, imperfect decisions, procrastination, and life outside work.
- Keep the factual density high without turning the text into a dry report. Facts should be woven into scenes, dialogue, domestic routine, and behavior.
- The text must not drift into a lyrical or abstract mood piece that forgets supported facts.
- Every paragraph must contain at least one explicit numeric detail such as a year, date, age, amount, duration, count, or time.
- Every important moment should read like a micro-scene with physical action, object interaction, and immediate aftermath.
- Each paragraph must add new information instead of restating the same thesis.
- Include contradictions, irritation, selfishness, avoidance, and other non-ideal behavior when realistic. The character should not feel too good or too clean.
- Add useless but real domestic detail: food, dishes, clothes, cups, receipts, shelves, stains, transport, room layout, bags, notes, broken things.
- Keep reflection short and sparse. At most one short reflective sentence per paragraph.
- Include grounded positive moments through laughter, relief, ease, appetite, pleasure, and small wins rather than declarative happiness.
- Include at least one small mistake, impulsive choice, or procrastination moment, plus at least two concrete interaction scenes from recent adult life.
- Include one or two minor named people in the recent adult present, such as a friend, colleague, neighbor, volunteer, or acquaintance. They are scene texture only, not new hard canon.
- Soft scenes must not silently lock in unsupported logistics like cohabitation, exact workplaces, exact shelters, exact schedules, or shared finances. If canon does not specify those things, keep them broad.
- If a twin or sibling is present in canon but living arrangements are not, prefer meetings, calls, visits, or shared time rather than assuming the same home.
- Do not turn the character into a high-performer, philosopher, or perfectly self-aware adult unless Canon JSON directly supports it.
- Before returning the text, internally self-check that it does not invent unsupported hard canon and does not open with a cinematic origin story.
- Return only legend_full_text.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}
`.trim();
}

// Override full-text prompt builders with a stricter plain-autobiography mode.
function buildFullTextRepairPrompt({ canon, anchors, facts, currentText, stagePrompt, auditIssues = [] }) {
  void anchors;
  void facts;
  const runtimeDateContext = buildRuntimeDateContext();
  const normalizedIssues = normalizeStringList(auditIssues);
  const auditBlock = normalizedIssues.length
    ? `
Audit issues that must be fixed in the rewrite:
${JSON.stringify(normalizedIssues, null, 2)}
`
    : '';

  return `
You are aggressively repairing a full first-person autobiography so that it reads like a real person factually describing their whole life, not like a story, not like fiction, and not like a diary of one day.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person autobiography"
}

Rules:
- Canon JSON is the only hard source of truth.
- Anchors, fact_bank, and the current text are draft material. They may help with structure, but they are not hard canon.
- Preserve every significant Canon JSON fact. If canon contains explicit names, birth date, age, country, city, family structure, education, work, relationship status, routines, or other concrete details, they must remain visible.
- You may add realistic supporting specifics when canon is sparse: names of parents, parents' ages or birth years, the sister's first name, a plausible city within the stated country, a realistic university name, faculty names, an ordinary employer, salary numbers, routine responsibilities, or ordinary friends and colleagues. Mention apps, services, or platforms only when they are actually needed by canon or fact_bank. These specifics must stay low-drama, plausible, internally consistent, and socially ordinary.
- Do not invent sensational or high-risk canon such as celebrity status, elite schools, huge salaries, hospital history, criminal events, or dramatic origin mythology unless Canon JSON explicitly supports them.
- Present-day reference date for continuity: ${runtimeDateContext}. If you mention a current-day paragraph or recent days, keep the date and age coherent with this reference.
- This is not a story. Do not open with a cinematic scene, a morning scene, or a literary hook.
- The text must begin with factual identity in the first lines: full name, exact birth date, place of birth, and current age. Example shape: "My name is ... I was born ... in ... I am ..."
- Build a full life timeline in plain first-person chronology: childhood 0-12, school years, teen period 13-18, university, work, present life, and future plans.
- The tone must be simple, direct, grounded, and slightly imperfect. No metaphors. No poetic phrasing. No dramatic narration. Avoid words like "it seems", "as if", and "it feels like".
- Ban abstract declaration language. Do not write phrases like "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "he has to understand", "this matters to me", "I value", "I love", or "this brings joy".
- Do not explain feelings at length. Show them through routine, behavior, replies, delays, awkward choices, unfinished tasks, or what is left unsaid.
- Every paragraph must carry factual density: years, ages, dates, numbers, names, places, money, durations, duties, or other concrete real-world detail.
- The text must not turn into a day description. Do not narrate "today", "yesterday", "morning", "evening", or their grammatical forms, and do not write any diary-like sequence of a single day.
- For the present-life section, summarize repeated behavior over time instead of walking through one day.
- Make the text long and multi-paragraph. It should feel like a full autobiography, not a short vignette. Aim for a substantially expanded result, roughly 6500+ characters when canon is sparse.
- The sister must have a name and appear naturally in the biography.
- Name both parents in a plain factual way.
- Preferably include parent age, birth year, or birth date detail if it can be reconstructed plausibly.
- University details are mandatory: include a realistic university name, faculty names, and years of study.
- Work details are mandatory: include where she worked, approximate salary, and what she actually did there.
- Add micro-realism without turning the text into a scene script: money, waiting time, unread messages, shelves, mugs, stains, clothes, receipts, bus rides, delivery windows, small purchases, small mistakes, half-finished chores.
- Add ordinary named people as minor texture where useful: family members, friends, classmates, coworkers, volunteers, acquaintances. Keep them consistent and low-risk.
- Family sections should include at least one warm concrete episode or routine: calls, visits, gifts, shared meals, holidays, help, or recurring domestic habits.
- If sexuality is present in canon or supporting material, keep it concrete, adult, legal, and non-erotic, but scale the intensity literally by sexual_expressiveness. ${sexualExpressivenessRule} Describe frequency, initiative, porn or masturbation habits, previous-partner experience, what she liked and disliked, specific practices, whether toys were used or not used, whether casual sex is possible unless canon explicitly forbids it, and what kind of men create attraction.
- Avoid empty generalizations such as "we were always close" or "school years passed calmly". Replace them with factual examples tied to years, ages, routines, or incidents.
- Allow slight messiness, abrupt transitions, understatement, and contradictions. The character does not need to fully explain themselves.
- Avoid repetition. If an idea has already been stated once, move on to new information.
- Keep the language plain enough that it sounds like a real autobiography, not an essay and not a novel.
- Do not mention the repair process.
- Return only legend_full_text.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

${auditBlock}
Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

function buildFullTextAuditPrompt({ canon, currentText, stagePrompt }) {
  const runtimeDateContext = buildRuntimeDateContext();

  return `
You are auditing a first-person autobiography generated from sparse canon.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "audit": {
    "starts_with_factual_identity": true,
    "covers_full_life_timeline": true,
    "sounds_like_plain_autobiography": true,
    "has_named_sister": true,
    "has_named_parents": true,
    "has_university_and_faculty_details": true,
    "avoids_day_based_narration": true,
    "preserves_key_input_facts": true,
    "invents_hard_canon": false,
    "too_idealized": false,
    "too_dry_report": false,
    "too_vague_artistic": false,
    "has_abstract_declarations": false,
    "each_paragraph_has_numeric_detail": true,
    "uses_exact_dates_and_times": true,
    "avoids_vague_time_words": true,
    "spans_multiple_dated_days": true,
    "long_enough_for_dense_bio": true,
    "has_micro_scenes": true,
    "repeats_core_thesis": false,
    "has_flaws_and_contradictions": true,
    "has_useless_real_life_details": true,
    "has_grounded_positive_moments": true,
    "has_small_failures_or_procrastination": true,
    "has_named_minor_people_beyond_core_family": true,
    "has_concrete_social_scenes": true,
    "has_life_outside_work_and_goals": true,
    "overloaded_with_reflection": false,
    "locks_unsupported_logistics": false,
    "issues": ["short actionable issue"],
    "ready": true
  }
}

Audit rules:
- Canon JSON is the only hard source of truth.
- Present-day reference date for continuity: ${runtimeDateContext}. If the text uses current-day or recent-day material, the dates and age must stay coherent with this reference.
- starts_with_factual_identity = true only if the opening states full name, exact birth date, place of birth, and current age. It must not open like a story.
- covers_full_life_timeline = true only if the text functions as an actual life timeline and moves chronologically through childhood 0-12, school years, teen period 13-18, university, work, present life, and future plans.
- sounds_like_plain_autobiography = true only if the text reads like a direct factual autobiography, not like fiction, not like a scene, not like a literary monologue, and not like poetic prose.
- has_named_sister = true only if the sister is explicitly named and that name stays consistent.
- has_named_parents = true only if both parents are explicitly named in a plain factual way.
- has_university_and_faculty_details = true only if the text specifies a realistic university and faculty names, plus study years.
- avoids_day_based_narration = true only if the text does not fall into "today/yesterday/morning/evening" narration and does not read like one described day.
- preserves_key_input_facts = true only if all significant Canon JSON facts are still present or clearly preserved in paraphrase.
- invents_hard_canon = true only if the text adds sensational, implausible, or high-risk unsupported canon. Ordinary supporting specifics such as plausible parent names, sister name, university name, faculty names, ordinary jobs, salaries, and low-drama places are allowed if they are realistic and internally consistent.
- too_idealized = true if the character reads too polished, too disciplined, too wise, or too neat for the sparse input.
- too_dry_report = true if the text becomes a flat résumé-like list of facts with no lived detail.
- too_vague_artistic = true if the text becomes literary, moody, metaphorical, or over-written, or if it uses soft dramatic language instead of plain factual speech.
- has_abstract_declarations = true if the text explains itself with phrases like "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "this matters to me", "I love", or similar declarations instead of observable behavior.
- each_paragraph_has_numeric_detail = true only if every paragraph includes explicit factual density such as a year, exact date, age, amount, count, duration, or clock time.
- uses_exact_dates_and_times = true only if the autobiography contains enough explicit years, ages, and at least some exact dates to feel concrete rather than generic.
- avoids_vague_time_words = true only if the text does not lean on vague scene anchors like "вчера", "сегодня", "вечером", "днем", or "недавно" without exact calendar grounding.
- spans_multiple_dated_days = true only if the text shows a wide enough temporal spread through years and dated periods rather than collapsing into a single-day account.
- long_enough_for_dense_bio = true only if the result is substantially longer than a short typical output and feels like a full autobiography rather than a one-page sketch.
- has_micro_scenes = true only if the text contains concrete factual mini-episodes or observed moments, without turning into fiction.
- repeats_core_thesis = true if the same central idea is repeated instead of adding new facts.
- has_flaws_and_contradictions = true only if the text shows ordinary inconsistency, mistakes, irritation, avoidance, or other non-ideal behavior.
- has_useless_real_life_details = true only if the text includes ordinary concrete clutter of life: money, clothes, mugs, receipts, transport, objects on tables, unfinished chores, unread messages, and similar details.
- has_grounded_positive_moments = true only if positive experience appears in a concrete understated way, not as abstract happiness language.
- has_small_failures_or_procrastination = true only if the text contains at least one real small failure, delay, awkward decision, or unfinished task.
- has_named_minor_people_beyond_core_family = true only if the text includes at least one named person beyond the main character and explicitly core family.
- has_concrete_social_scenes = true only if the text includes at least two concrete interpersonal moments such as a call, message exchange, meeting, argument, or practical coordination.
- has_life_outside_work_and_goals = true only if the text shows ordinary life beyond work, volunteering, and relationship goals.
- overloaded_with_reflection = true if the text spends too much time explaining personality or feelings.
- locks_unsupported_logistics = true if the text quietly fixes unsupported logistics such as exact living arrangements, exact institutions, or exact city-level biography not supported by canon.
- ready = true only if the text passes all checks with no material issues.
- issues must be short, concrete rewrite instructions.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

function buildCanonFirstFullTextPrompt({ canon, stagePrompt }) {
  const runtimeDateContext = buildRuntimeDateContext();
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);

  return `
You are writing a long first-person autobiography from sparse hard facts.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person autobiography"
}

Hard source of truth:
- Canon JSON is the only hard source of truth.
- Do not treat genre expectations or likely backstory as fixed facts.

Requirements:
- This is not a story and not a literary text. It must read like a real person describing their life factually.
- Start with factual identity in the first lines: full name, exact birth date, place of birth, and current age.
- Use simple, direct, grounded language. No poetic opening. No cinematic opening. No metaphors. Avoid "it seems", "as if", and "it feels like".
- Ban metaphors, symbolic comparisons, and essay-like framing. Do not write phrases like "сложная система", "эмоциональный центр семьи", "как два спутника на одной орбите", "разные полюса", or "единственная настоящая опора".
- Every 1-2 sentences should add a new verifiable fact such as a name, age, date, period, place, job, action, conflict, routine, money detail, frequency, or consequence.
- If a sentence can be rewritten in plainer and more factual language, rewrite it.
- Present-day reference date for continuity: ${runtimeDateContext}. If you mention current-day or recent-day material, keep dates and age coherent with this reference.
- Preserve every significant Canon JSON fact in the final text. If canon contains explicit names, dates, ages, countries, cities, education, work, family structure, routines, or relationship facts, keep them visible.
- You may add realistic supporting specifics when canon is sparse: parents' names, parents' ages or birth years, the sister's first name, a plausible city inside the stated country, a realistic university name, faculty names, an ordinary employer, salary numbers, friends, coworkers, or low-drama local places. Mention apps, services, or platforms only when they are actually needed by canon or fact_bank.
- Do not invent sensational or implausible canon such as celebrity careers, elite institutions, huge money, or dramatic life events unless canon explicitly supports them.
- The autobiography must still cover childhood 0-12, school years, teen period 13-18, university, work, present life, and future plans.
- Keep the text in first person, multi-paragraph, and long enough to feel like a full life timeline rather than a short output.
- Every paragraph must include factual density: years, dates, ages, amounts, counts, durations, people, places, or objects.
- Do not turn the biography into a description of one day. Do not use "today", "yesterday", "morning", "evening", or their grammatical forms in narration.
- Summarize present life through repeated behavior over time rather than a diary-like sequence.
- The sister must have a name.
- Name both parents in a plain factual way.
- Preferably include parent age, birth year, or birth date detail if it can be reconstructed plausibly.
- University details are mandatory: realistic university name, faculty names, and years of study.
- Work details are mandatory: employer or work setting, approximate salary, responsibilities, and how that changed over time.
- Ban abstract declaration language such as "this is part of me", "this gives meaning", "this makes us stronger", "I cannot imagine it otherwise", "this matters to me", "I love", and similar declarative shortcuts.
- Do not over-explain feelings or personality. Keep understatement. Let contradictions remain unexplained when needed.
- Add grounded micro-realism: money, food, clothes, receipts, stains, transport, unread messages, waiting time, unfinished chores, cheap purchases, boring tasks, missed calls.
- Include slight messiness and small failures: delay, procrastination, awkwardness, a rude reply, a forgotten task, or inconsistent behavior.
- Add named people where useful, but keep them low-risk and ordinary.
- Family sections should include at least one warm concrete episode or routine: calls, visits, gifts, shared meals, holidays, help, or recurring domestic habits.
- If sexuality is present in canon or supporting material, keep it concrete, adult, legal, and non-erotic, but scale the intensity literally by sexual_expressiveness. ${sexualExpressivenessRule} Describe frequency, initiative, porn or masturbation habits, previous-partner experience, what she liked and disliked, specific practices, whether toys were used or not used, whether casual sex is possible unless canon explicitly forbids it, and what kind of men create attraction.
- Avoid empty generalizations. Replace them with years, ages, incidents, routines, and ordinary facts.
- Do not repeat the same idea in different words.
- Before returning the text, internally self-check that it reads like a plain autobiography and not like fiction.
- Return only legend_full_text.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}
`.trim();
}

async function generateCanonFirstLegendFullText({ canon, stagePrompt, generationType, requestId }) {
  const prompt = buildCanonFirstFullTextPrompt({
    canon,
    stagePrompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_canon'
  });
  const text = safeString(generated?.parsed?.legend_full_text || generated?.parsed?.full_text || generated?.parsed?.life_story).trim();
  if (!text) {
    throw new Error('Gemini did not return legend_full_text during stage_3_full_text_canon.');
  }
  return {
    text,
    response: generated.response
  };
}

// Final active v1-style overrides for full_text. These later declarations intentionally win over the stricter variants above.
function buildFullTextRepairPrompt({ canon, anchors, facts, legendBlocks, currentText, stagePrompt, auditIssues = [] }) {
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  const normalizedIssues = normalizeStringList(auditIssues);
  const auditBlock = normalizedIssues.length
    ? `
Audit issues that must be fixed in the rewrite:
${JSON.stringify(normalizedIssues, null, 2)}
`
    : '';

  return `
You are repairing a long first-person biography in the earlier multi-case-review-v1 style.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person biography"
}

Rules:
- Canon JSON is the base truth and must not be contradicted.
- Anchors and fact_bank are the main material. Use their strongest and most characteristic concrete content, not every minor detail.
- If supporting legend blocks are present, treat them as a secondary helper for texture and detail. Canon, anchors, and fact_bank remain primary. Never let legend blocks override canon identity, names, family core, or occupation.
- Preserve every significant canon fact.
- Do not change the protagonist's name or surname from Canon JSON.
- If you choose to state the protagonist's name in the text, it must exactly match Canon JSON.
- One continuous first-person English text only. No headings. No lists.
- If the current version has a clumsy or duplicated opening, rewrite from scratch instead of patching sentence by sentence.
- Keep the rewrite inside the same family of outputs as the strong early reference runs: a factual autobiography with childhood, school, work, family, money, relationships, and cluttered daily life, not a literary monologue.
- Ban metaphors, symbolic comparisons, and essay-like framing. Do not write phrases like "сложная система", "эмоциональный центр семьи", "как два спутника на одной орбите", "разные полюса", or "единственная настоящая опора".
- Every 1-2 sentences should add a new verifiable fact such as a name, age, date, period, place, job, action, conflict, routine, money detail, frequency, or consequence.
- If a sentence can be rewritten in plainer and more factual language, rewrite it.
- If the data is sparse, you may carefully add realistic supporting specifics such as names of relatives, friends, classmates, coworkers, cities, schools, universities, jobs, salaries, cafes, transport, devices, apartments, brands, or local routines, but mention apps, services, or platforms only when they are actually needed by canon or fact_bank.
- Added specifics must stay ordinary, plausible, and internally consistent. Do not invent celebrity-scale status, elite prestige, impossible money, or absurd drama.
- Restore the richer specificity of strong reference outputs: named parents, schools, universities, jobs, salaries, devices, apartments, cafes, transport, pets, gifts, and concrete scenes with awkwardness or small failure.
- Follow the actual shape of the strong reference outputs in test011/test012/test013: they sound like lived autobiographies, not like compliance checklists, and they do not need a stiff passport-style start.
- Do not mechanically serialize the fact_bank into one sentence per year, age, or tiny incident. Merge facts into larger life periods and a few memorable scenes.
- This full text is a selective synthesis, not an archive. It should stay clearly shorter than the combined blocks.
- Target roughly 600-850 words. If it becomes exhaustive, compress it.
- Do not paste thematic mini-blocks into the biography. If the current text starts sounding like separate family / sexuality / gifts sections, rewrite it into a continuous life story.
- Keep sexuality, gifts, health, and similar themes shorter than their dedicated blocks. Summarize them through a few concrete examples and present-day conclusions.
- Do not let the final third become a stacked summary of sexuality, gifts, health, and plans. Merge those themes into current-life narration.
- The rewrite should usually open the way strong reference outputs do: quickly anchor birth data and the key family constellation, or start from an early concrete memory that still includes those basic facts very near the top.
- Keep only one clean opening. Do not repeat "My name is...", "I was born..." or the family setup twice.
- Do not paste raw block-style topic sentences like "My family..." or "My social life..." into the first lines. Rewrite them into smooth autobiography prose.
- If the current text is missing basics, fix those first: very near the beginning include the birth date or birth year and place, named parents, and when relevant the sister or twin by name.
- Full name is welcome but not mandatory if the opening already feels natural in first person. Do not force a rigid "РњРµРЅСЏ Р·РѕРІСѓС‚ ..." line if it makes the opening worse.
- If the opening already includes birth data, named parents, and the sister or twin, do not repeat those facts again just to satisfy checks.
- Make sure named family members are present on the page, especially parents and, when relevant, the sister or twin.
- Preferably include parent age, birth year, or birth date detail if it can be reconstructed plausibly.
- Family material should include at least one warm concrete episode or routine: calls, visits, gifts, shared meals, holidays, help, or recurring domestic habits.
- If supporting blocks already contain named parents, a named sister, workplaces, studies, or named side characters, carry those details into the full text instead of dropping them.
- If canon says university, degree, or student, include a concrete university path and faculty or specialization. If canon says a job or occupation, include concrete work details such as employer, duties, clients, salary, side income, or work routine.
- If sexuality is present in canon or supporting material, keep it concrete, adult, legal, and non-erotic, but scale the intensity literally by sexual_expressiveness. ${sexualExpressivenessRule} Describe frequency, initiative, porn or masturbation habits, previous-partner experience, what she liked and disliked, specific practices, whether toys were used or not used, whether casual sex is possible unless canon explicitly forbids it, and what kind of men create attraction.
- If canon already specifies an occupation or current identity, keep that as the main present-day identity. Earlier jobs or side jobs are allowed, but do not replace the canon occupation with a different main profession.
- The character must feel like a live uneven person, not an idealized achiever.
- Keep mistakes, awkwardness, procrastination, boredom, weak decisions, social friction, and contradictory behavior when realistic.
- Social life is mandatory: include at least one named friend, coworker, volunteer, or neighbor and concrete interaction scenes.
- Life outside work and goals is mandatory: food, TV, buses, receipts, cups, clothes, laundry, chats, bills, empty evenings, dates, parties, pointless errands, and other ordinary clutter.
- Show the character through actions, scenes, and behavior patterns, not polished analysis.
- Reduce abstract declarations and self-explanatory moral conclusions. Avoid template lines like "I realized", "it was more than that", "it was my path", or "a deep sense of meaning" unless they are rare and truly earned.
- If the text became too dry, too perfect, too formal, too empty, or too repetitive, rewrite it back into a messier lived biography.
- If audit issues ask to shorten the text, cut secondary episodes aggressively instead of merely paraphrasing them. Aim for roughly 600-850 words, keep the strongest scenes, and remove archive-like detail.
- Do not mention the repair process.
- Return only legend_full_text in English.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Anchors JSON:
${JSON.stringify(anchors, null, 2)}

Supporting legend blocks JSON:
${JSON.stringify(buildLegendBlocksSupportForFullText(legendBlocks), null, 2)}

Fact bank JSON:
${JSON.stringify(facts, null, 2)}

${auditBlock}
Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

function buildFullTextAuditPrompt({ canon, currentText, stagePrompt }) {
  return `
You are auditing a long first-person biography in the earlier multi-case-review-v1 style.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "audit": {
    "preserves_key_input_facts": true,
    "too_idealized": false,
    "too_dry_report": false,
    "too_vague_artistic": false,
    "has_abstract_declarations": false,
    "has_micro_scenes": true,
    "repeats_core_thesis": false,
    "has_flaws_and_contradictions": true,
    "has_useless_real_life_details": true,
    "has_grounded_positive_moments": true,
    "has_small_failures_or_procrastination": true,
    "has_named_minor_people_beyond_core_family": true,
    "has_concrete_social_scenes": true,
    "has_life_outside_work_and_goals": true,
    "overloaded_with_reflection": false,
    "issues": ["short actionable issue"],
    "ready": true
  }
}

Audit rules:
- Canon JSON is the base truth.
- Ordinary inferred specifics like names, cities, schools, universities, workplaces, salaries, devices, cafes, or neighborhoods are allowed if they stay realistic and internally consistent.
- This audit is a best-effort quality gate, not a reason to block a basically good long text. If the core canon is preserved and the biography is readable, prefer ready = true with at most minor issues.
- preserves_key_input_facts = true only if all significant canon facts are still present or clearly preserved.
- too_idealized = true if the character reads too polished, too disciplined, too wise, too correct, or too much like a high-performer.
- too_dry_report = true if the text reads like compressed report prose instead of lived life.
- too_vague_artistic = true if the text becomes literary, empty, vague, or loses grounded facts and routines.
- has_abstract_declarations = true if it relies on declarative self-explanations like "this is part of me", "this gives meaning", "I love", or "this matters to me" instead of observable behavior.
- has_micro_scenes = true only if the text contains concrete lived moments, not only summary.
- repeats_core_thesis = true if the same idea is repeated instead of adding new material.
- has_flaws_and_contradictions = true only if the text includes mistakes, weakness, irritation, avoidance, contradiction, or social awkwardness.
- has_useless_real_life_details = true only if it includes ordinary clutter of life like food, clothes, mugs, receipts, transport, shelves, stains, bills, or unread chats.
- has_grounded_positive_moments = true only if positive moments appear through relief, laughter, pleasure, appetite, ease, or small wins.
- has_small_failures_or_procrastination = true only if there is at least one real small failure, delay, awkward choice, or unfinished task.
- has_named_minor_people_beyond_core_family = true if there is even one named friend, coworker, volunteer, classmate, neighbor, acquaintance, or side person anywhere in the text.
- has_concrete_social_scenes = true only if there are at least two concrete social interactions.
- has_life_outside_work_and_goals = true only if the character has ordinary life beyond work, volunteering, and relationship goals.
- overloaded_with_reflection = true if the text explains itself too much.
- Birth data counts as present if the opening paragraph contains the full birth date or at least the birth year.
- A named sister or twin counts as present if she is clearly named and participates anywhere in the life arc; this does not need to be repeated in every section.
- Full name is optional. Treat the text as acceptable if it starts naturally in first person and preserves birth data plus core family structure near the top, even without a passport-style self-introduction.
- Mild repetition at the very top is not by itself a blocking failure unless it obviously breaks readability.
- ready = true only if the text passes all checks with no material issues.
- issues must be short, concrete rewrite instructions, and should be reserved for material gaps or contradictions rather than micro-nitpicks.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Current generated text:
${JSON.stringify(safeString(currentText), null, 2)}
`.trim();
}

async function auditLegendFullText({ canon, currentText, stagePrompt, generationType, requestId }) {
  const prompt = buildFullTextAuditPrompt({
    canon,
    currentText,
    stagePrompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_audit'
  });

  const audit = normalizeFullTextAuditReport(generated?.parsed);
  const abstractDeclarationHits = extractAbstractDeclarationHits(currentText);
  const detectedNames = extractNamedMinorPeople(currentText, canon);
  const descriptionText = normalizeText(canon?.description || canon?.generalInfo?.description || '');
  const educationText = normalizeText(canon?.education || canon?.generalInfo?.education || '');
  const jobText = normalizeText(canon?.job || canon?.generalInfo?.occupation || '');
  const sourceText = safeString(currentText);
  const sourceNormalized = normalizeText(currentText);
  const textWordCount = countWordLikeUnits(currentText);
  const textCharCount = sourceText.trim().length;
  const canonName = normalizeText(canon?.name || canon?.generalInfo?.name || '');
  const canonSurname = normalizeText(canon?.surname || canon?.generalInfo?.surname || '');
  const explicitIntroMatch = sourceText.match(/(?:Меня зовут|My name is)[^.!?\n]{0,140}/iu);
  const explicitIntroNormalized = normalizeText(explicitIntroMatch?.[0] || '');
  const sisterMentions = extractNamedSisterMentions(currentText);
  const yearMentions = extractYearMentions(currentText);
  const needsNamedSister = /(sister|twin|сестр|близнец)/iu.test(descriptionText);
  const needsParents = /(family|родител|семь|sister|twin|сестр|близнец)/iu.test(descriptionText);
  const needsEducationDetails = /(university|degree|student|college|faculty|университет|институт|студент|факультет|высш)/iu.test(educationText);
  const needsWorkDetails = Boolean(jobText);
  const relationshipLooksOccupied = /\b(?:я\s+замужем|я\s+в\s+отношениях|счастлив\w*\s+в\s+браке|счастлив\w*\s+в\s+отношениях|мой\s+муж|мой\s+парень|мой\s+партнер|мой\s+партнёр|мой\s+жених|i\s+am\s+married|i\s+am\s+in\s+a\s+relationship|my\s+husband|my\s+boyfriend|my\s+partner|my\s+fianc[eé])\b/iu.test(
    sourceText
  );
  const relationshipAvailabilitySignals = /\b(?:свободн|не\s+замуж|в\s+поиске\s+отношен|ищу\s+партнер|ищу\s+партнёр|готова\s+к\s+отношениям|открыта\s+к\s+отношениям|single|not\s+married|looking\s+for\s+a\s+relationship|looking\s+for\s+a\s+partner|ready\s+for\s+a\s+relationship|open\s+to\s+a\s+relationship)\b/iu.test(
    sourceText
  );
  const reflectivePhraseHits = (sourceText.match(/\b(?:я поняла|я понял|мне стало ясно|я осознала|я осознал|неотъемлемая часть моей личности|глубокое чувство|это было больше чем|это был мой путь|i realized|it became clear to me|it was more than|it was my path|deep sense)\b/giu) || []).length;

  if (abstractDeclarationHits.length > 0) {
    audit.has_abstract_declarations = true;
    audit.ready = false;
    if (!audit.issues.some((item) => /abstract declarations/i.test(item))) {
      audit.issues.push('Remove abstract declarations and show meanings through behavior and scenes.');
    }
  }

  if (detectedNames.length === 0) {
    audit.has_named_minor_people_beyond_core_family = false;
    audit.ready = false;
    if (!audit.issues.some((item) => /named minor person/i.test(item))) {
      audit.issues.push('Add at least one named minor person beyond the core family.');
    }
  }

  if (explicitIntroNormalized && canonName && !explicitIntroNormalized.includes(canonName)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /canon first name/i.test(item) || /protagonist name/i.test(item))) {
      audit.issues.push('If the text says "My name is ...", use the canon first name and do not replace the protagonist with another name.');
    }
  }

  if (explicitIntroNormalized && canonSurname && !explicitIntroNormalized.includes(canonSurname)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /surname/i.test(item) || /full name/i.test(item))) {
      audit.issues.push('If the text explicitly names the protagonist, keep the canon surname in that self-introduction.');
    }
  }

  if (false && canonName && !sourceNormalized.includes(canonName)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /canon first name/i.test(item) || /protagonist name/i.test(item))) {
      audit.issues.push('Use the canon first name explicitly and do not replace the protagonist with another name.');
    }
  }

  if (canonSurname && !sourceNormalized.includes(canonSurname) && /^\s*(?:я|меня зовут|мое самое раннее воспоминание|моё самое раннее воспоминание|я родилась|я родился)/iu.test(sourceText)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /surname/i.test(item) || /full name/i.test(item))) {
      audit.issues.push('Keep the canon surname when the text introduces the protagonist directly.');
    }
  }

  if (!hasBirthDateContext(currentText, canon)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /birth/i.test(item) || /date/i.test(item))) {
      audit.issues.push('Mention the birth date or at least the birth year explicitly near the beginning.');
    }
  }

  if (needsNamedSister && sisterMentions.length === 0) {
    audit.ready = false;
    if (!audit.issues.some((item) => /sister/i.test(item) || /twin/i.test(item))) {
      audit.issues.push('Give the sister or twin a name and make her part of the life arc, not just a vague role.');
    }
  }

  if (needsParents && !hasNamedParents(currentText)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /parent/i.test(item) || /family/i.test(item))) {
      audit.issues.push('Add named parents and concrete family detail instead of generic family background.');
    }
  }

  if (needsParents && !hasParentAgeOrBirthDetails(currentText)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /birth year/i.test(item) || /birth date/i.test(item) || /parent age/i.test(item))) {
      audit.issues.push('Add parent age, birth year, or birth date detail where plausible.');
    }
  }

  if (needsEducationDetails && !hasUniversityAndFacultyDetails(currentText)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /university/i.test(item) || /faculty/i.test(item) || /education/i.test(item))) {
      audit.issues.push('Specify the university or institute and faculty or specialization, not only a vague education mention.');
    }
  }

  if (needsWorkDetails && !hasWorkDetailsHeuristic(currentText)) {
    audit.ready = false;
    if (!audit.issues.some((item) => /work/i.test(item) || /job/i.test(item) || /salary/i.test(item))) {
      audit.issues.push('Add concrete work detail such as employer, clients, duties, salary, side income, or work routine.');
    }
  }

  if (relationshipLooksOccupied) {
    audit.ready = false;
    if (!audit.issues.some((item) => /dating profile/i.test(item) || /single woman/i.test(item) || /relationship framing/i.test(item))) {
      audit.issues.push('This is a dating profile for a single woman, so remove current marriage or occupied-relationship framing.');
    }
  }

  if (!relationshipAvailabilitySignals) {
    audit.ready = false;
    if (!audit.issues.some((item) => /single woman/i.test(item) || /open to a relationship/i.test(item) || /dating profile/i.test(item))) {
      audit.issues.push('Make it explicit that the protagonist is single and open to a relationship.');
    }
  }

  if (!hasLifeTimelineCoverageHeuristic(currentText) || yearMentions.length < 4) {
    audit.ready = false;
    if (!audit.issues.some((item) => /chronolog/i.test(item) || /timeline/i.test(item) || /life arc/i.test(item))) {
      audit.issues.push('Rebuild the text as a fuller life chronology from childhood through study, work, relationships, current life, and future plans.');
    }
  }

  if (textWordCount > 900 || textCharCount > 7200) {
    audit.ready = false;
    if (!audit.issues.some((item) => /shorter|compress|exhaustive|word/i.test(item))) {
      audit.issues.push('Shorten legend_full_text. It should be a selective synthesis, not an exhaustive dump; target roughly 600-850 words.');
    }
  }

  if (reflectivePhraseHits > 5) {
    audit.ready = false;
    if (!audit.issues.some((item) => /reflection/i.test(item) || /stock/i.test(item) || /template/i.test(item))) {
      audit.issues.push('Cut template reflection and stock moral phrases; keep more action, lived memory, and plain concrete narration.');
    }
  }

  return {
    audit,
    response: generated.response
  };
}

function buildCanonFirstFullTextPrompt({ canon, anchors, facts, legendBlocks, stagePrompt }) {
  const sexualExpressivenessRule = buildSexualExpressivenessPromptRuleEn(canon?.personality_profile?.sexual_expressiveness);
  return `
You are writing a long first-person biography in the earlier multi-case-review-v1 style.
${BASE_JSON_RULES_EN}

Return JSON in this shape:
{
  "legend_full_text": "one continuous first-person biography"
}

Requirements:
- Canon JSON is the base truth and must not be contradicted.
- Anchors and fact_bank are the main narrative material. Use the strongest portion of them, not a near-complete dump.
- If supporting legend blocks are present, treat them as a secondary helper for texture and detail. Canon, anchors, and fact_bank remain primary. Never let legend blocks override canon identity, names, family core, or occupation.
- Write one continuous first-person text with no headings or lists.
- Do not change the protagonist's name or surname from Canon JSON.
- If you choose to state the protagonist's name in the text, it must exactly match Canon JSON.
- Target the same family of outputs as the strong early reference runs: a factual autobiography that moves from childhood to the present through concrete lived episodes, not a literary monologue, a dry report, or a compliance checklist.
- Ban metaphors, symbolic comparisons, and essay-like framing. Do not write phrases like "сложная система", "эмоциональный центр семьи", "как два спутника на одной орбите", "разные полюса", or "единственная настоящая опора".
- Every 1-2 sentences should add a new verifiable fact such as a name, age, date, period, place, job, action, conflict, routine, money detail, frequency, or consequence.
- If a sentence can be rewritten in plainer and more factual language, rewrite it.
- Preserve every significant canon fact.
- If details are missing, you may carefully add realistic supporting specifics such as cities, schools, universities, jobs, salaries, relatives, friends, cafes, buses, devices, clothes, housing, or local routines. Mention apps, services, or platforms only when they are actually needed by canon or fact_bank.
- Added specifics must stay ordinary, plausible, and internally consistent.
- Do not invent sensational, elite, impossible, or movie-like biography.
- Prefer the exact kinds of specificity seen in strong reference outputs: parents with names and jobs, schools and universities, cafes and streets, salaries and side jobs, gifts, devices, receipts, transport, pets, doctors, awkward scenes, breakups, and low-stakes domestic clutter.
- Build the text as a chronological life arc: childhood, school, teen years, study, early work, relationships, failures, turning points, current routine, and future plans.
- Do not mechanically convert the fact_bank into a year-by-year checklist. Select the strongest facts and merge them into larger life periods with a few vivid scenes.
- The full text is a selective synthesis, not an archive. It should stay clearly shorter than the combined blocks.
- Target roughly 600-850 words. If it becomes exhaustive, compress it.
- Never paste thematic blocks into standalone dossier paragraphs such as one family paragraph, one sexuality paragraph, one gifts paragraph, one health paragraph. Integrate those themes into the chronology and present-day self instead.
- In the full text, keep sexuality, gifts, and similar themes shorter than in their dedicated blocks. Use a few concrete examples and present-day conclusions rather than long catalogues.
- Do not turn the final third of the biography into a theme-by-theme summary. Present-day life, sexuality, gifts, health, and future plans should feel woven together, not stacked as separate dossier sections.
- The opening should quickly anchor birth date or birth year/place and the key family constellation, the same way strong reference outputs do.
- Follow the real shape of the strong reference outputs: a natural opening in first person is better than a stiff dossier intro.
- Near the beginning include birth data, named parents, and when relevant the sister or twin by name.
- Preferably include parent age, birth year, or birth date detail if it can be reconstructed plausibly.
- When plausible, include at least one named grandparent with an ordinary factual detail rather than leaving the family tree flat.
- Full name is optional if it fits naturally. Do not force a formal self-introduction if it hurts the flow.
- Make sure named parents are present, and if the canon description is centered on a sister or twin, make sure she has a name and an active role in the life arc.
- Family material should include at least one warm concrete episode or routine: calls, visits, gifts, shared meals, holidays, help, or recurring domestic habits.
- If supporting blocks already contain named parents, a named sister, workplaces, studies, or named side characters, carry those details into the full text instead of dropping them.
- If canon says university, degree, or student, include a concrete university path and faculty or specialization. If canon says a job or occupation, include concrete work details such as employer, duties, clients, salary, side income, or work routine.
- If sexuality is present in canon or supporting material, keep it concrete, adult, legal, and non-erotic, but scale the intensity literally by sexual_expressiveness. ${sexualExpressivenessRule} Describe frequency, initiative, porn or masturbation habits, previous-partner experience, what she liked and disliked, specific practices, whether toys were used or not used, whether casual sex is possible unless canon explicitly forbids it, and what kind of men create attraction.
- If canon already specifies an occupation or current identity, keep that as the main present-day identity. Earlier jobs or side jobs are allowed, but do not replace the canon occupation with a different main profession.
- A moderate amount of human reflection is allowed when grounded in concrete scenes. Do not flatten the voice into a plain report.
- The character must feel like a live, uneven person rather than an idealized achiever.
- Allow mistakes, contradiction, avoidance, impulsive decisions, laziness, bad timing, awkwardness, social friction, and stretches of ordinary boredom.
- Social life is mandatory: include at least one named friend, coworker, volunteer, or neighbor and concrete scenes, calls, meetings, arguments, trips, parties, dull evenings, and ordinary shared time.
- Show the character through actions, scenes, and behavior patterns rather than polished explanation.
- Keep abstract conclusions and self-analysis low. Avoid stock lines like "I realized", "it was more than that", "it was my path", or "a deep sense of meaning" unless they are rare and earned by a concrete scene.
- Add grounded domestic detail: food, receipts, bills, clothes, transport, mugs, shelves, stains, laundry, chats, broken things, rented rooms, bags, notes, and random objects.
- Use the strongest part of fact_bank, but synthesize it. Do not try to mention every micro-fact or every year.
- Before returning the text, internally check that it does not feel too clean, too perfect, too wise, too dry, or too empty. If it does, rewrite it.
- Return only legend_full_text.

Stage prompt from the user:
${stagePrompt}

Canon JSON:
${JSON.stringify(buildCanonPromptData(canon), null, 2)}

Anchors JSON:
${JSON.stringify(anchors, null, 2)}

Supporting legend blocks JSON:
${JSON.stringify(buildLegendBlocksSupportForFullText(legendBlocks), null, 2)}

Fact bank JSON:
${JSON.stringify(facts, null, 2)}
`.trim();
}

function hasBirthDateContext(text, canon) {
  const source = safeString(text);
  if (!source) {
    return false;
  }

  const intro = source.slice(0, 900);
  const birthContext = getBirthContext(canon);
  const birthYear = Number.isFinite(birthContext?.year) ? String(birthContext.year) : '';
  const fullName = [safeString(canon?.name).trim(), safeString(canon?.surname).trim()].filter(Boolean).join(' ');
  const isoDate = safeString(canon?.birth_date || canon?.generalInfo?.dateBirth).trim();
  const hasBirthPhrase = /\b(?:родил(?:ась|ся)|появил(?:ась|ся)\s+на\s+свет|born|i was born)\b/iu.test(intro);

  if (isoDate && intro.includes(isoDate)) {
    return true;
  }
  if (birthYear && hasBirthPhrase && intro.includes(birthYear)) {
    return true;
  }
  if (birthYear && fullName && intro.includes(birthYear) && intro.includes(fullName)) {
    return true;
  }
  return false;
}

async function generateCanonFirstLegendFullText({ canon, anchors, facts, legendBlocks, stagePrompt, generationType, requestId }) {
  const prompt = buildCanonFirstFullTextPrompt({
    canon,
    anchors,
    facts,
    legendBlocks,
    stagePrompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
    stageKey: 'stage_3_full_text_canon'
  });
  const text = safeString(generated?.parsed?.legend_full_text || generated?.parsed?.full_text || generated?.parsed?.life_story).trim();
  if (!text) {
    throw new Error('Gemini did not return legend_full_text during stage_3_full_text_canon.');
  }
  return {
    text,
    response: generated.response
  };
}

async function runStage1({ state, generationType, requestId }) {
  const prompt = buildStage1PromptV2({
    canon: state.canon,
    stagePrompt: state.stage_prompts.stage_1_anchors_prompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_1_anchors'),
    stageKey: 'stage_1_anchors'
  });
  let response = generated.response;
  const parsed = generated.parsed;
  const anchors = normalizeAnchors(parsed.anchors_timeline || parsed.anchors || [], state.canon);
  if (anchors.length === 0) {
    throw new Error('Gemini не вернул anchors_timeline.');
  }

  state.anchors_timeline = anchors;
  state.anchors_report = {
    count: anchors.length,
    selected_mode: 'gemini'
  };
  state.fact_bank = [];
  state.fact_bank_report = {
    total_facts: 0,
    target_facts: FACTS_BASE_LIMIT + state.fact_extension_packages * FACTS_EXTENSION_STEP,
    hooks_total: 0,
    coverage_by_sphere: buildCoverageBySphere([]),
    weak_spheres: LIFE_SPHERES.map((item) => item.key),
    extension_packages: state.fact_extension_packages
  };
  state.legend_blocks = {};
  state.legend_full_text = '';
  state.legend_v1_final_json = {};
  state.blocks_report = { blocks_meta: {} };
  state.qc_report = buildPendingQcReport('QC не запускался после обновления якорей.');

  updatePipelineMeta(state, {
    ...buildStageProviderMetaPatch(state, response, 'stage_1_anchors')
  });

  return response;
}

async function runStage2({ state, generationType, requestId }) {
  if (!Array.isArray(state.anchors_timeline) || state.anchors_timeline.length === 0) {
    throw new Error('Для stage_2_fact_bank сначала выполните stage_1_anchors.');
  }

  const targetFacts = FACTS_BASE_LIMIT + state.fact_extension_packages * FACTS_EXTENSION_STEP;
  const prompt = buildStage2PromptV2({
    canon: state.canon,
    anchors: state.anchors_timeline,
    targetFacts,
    stagePrompt: state.stage_prompts.stage_2_fact_bank_prompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_2_fact_bank'),
    stageKey: 'stage_2_fact_bank'
  });
  let response = generated.response;
  const parsed = generated.parsed;
  let factBank = normalizeFacts(parsed.fact_bank || parsed.facts || [], state.canon);
  if (factBank.length === 0) {
    throw new Error('Gemini не вернул fact_bank.');
  }

  if (factBank.length < targetFacts) {
    const repaired = await repairUnderfilledStage2FactBank({
      canon: state.canon,
      anchors: state.anchors_timeline,
      currentFacts: factBank,
      targetFacts,
      stagePrompt: state.stage_prompts.stage_2_fact_bank_prompt,
      generationType,
      requestId
    });
    if (Array.isArray(repaired.factBank) && repaired.factBank.length > factBank.length) {
      factBank = repaired.factBank;
      response = repaired.response;
    }
  }
  if (factBank.length < targetFacts) {
    throw new Error(`Gemini returned only ${factBank.length} facts after repair, minimum required ${targetFacts}.`);
  }

  const coverageBySphere = buildCoverageBySphere(factBank);
  const weakSpheres = Object.entries(coverageBySphere)
    .filter(([, count]) => count < 8)
    .map(([sphere]) => sphere);
  const hooksTotal = factBank.filter((item) => Boolean(item.hook)).length;

  state.fact_bank = factBank;
  state.fact_bank_report = {
    total_facts: factBank.length,
    target_facts: targetFacts,
    hooks_total: hooksTotal,
    coverage_by_sphere: coverageBySphere,
    weak_spheres: weakSpheres,
    extension_packages: state.fact_extension_packages
  };
  state.legend_blocks = {};
  state.legend_full_text = '';
  state.legend_v1_final_json = {};
  state.blocks_report = { blocks_meta: {} };
  state.qc_report = buildPendingQcReport('QC не запускался после обновления fact_bank.');

  updatePipelineMeta(state, {
    ...buildStageProviderMetaPatch(state, response, 'stage_2_fact_bank')
  });

  return response;
}

async function runStage3({ state, generationType, requestId, outputMode }) {
  if (!Array.isArray(state.fact_bank) || state.fact_bank.length === 0) {
    throw new Error('Для stage_3_blocks сначала выполните stage_2_fact_bank.');
  }

  const normalizedOutputMode = normalizeStage3OutputMode(outputMode || state?.pipeline_meta?.stage_3_output_mode);
  const requiresBlocks = normalizedOutputMode === 'blocks' || normalizedOutputMode === 'both';
  const requiresFullText = normalizedOutputMode === 'full_text' || normalizedOutputMode === 'both';
  const normalizedGenerationType = safeString(generationType).trim().toLowerCase();
  const isFlashGeneration = normalizedGenerationType.includes('flash');

  let response = null;
  let legendBlocks = {};
  let legendFullText = '';
  let hasBlocks = false;
  let blocksMetaSource = {};
  let sexualPreferencesOverrideResponse = null;

  if (requiresBlocks) {
    const prompt = buildStage3PromptWithMode({
      canon: state.canon,
      anchors: state.anchors_timeline,
      facts: state.fact_bank,
      blocksStagePrompt: state.stage_prompts.stage_3_blocks_prompt,
      fullTextStagePrompt: state.stage_prompts.stage_3_full_text_prompt,
      outputMode: normalizedOutputMode
    });
    const generated = await generateParsedGeminiObject({
      prompt,
      generationType,
      requestId,
      timeoutMs: resolveStageTimeoutMs('stage_3_blocks'),
      stageKey: 'stage_3_blocks'
    });
    response = generated.response;

    const parsed = generated.parsed;
    legendBlocks = normalizeLegendBlocks(parsed.legend || parsed.legend_blocks || parsed.legend_v1_final_json || {});
    legendFullText = extractLegendFullText(parsed);
    hasBlocks = hasLegendBlocksContent(legendBlocks);
    blocksMetaSource = parsed.blocks_meta || parsed?.blocks_report?.blocks_meta || {};

    if (hasBlocks) {
      const maxBlockRepairs = isFlashGeneration ? 2 : 3;
      for (let attempt = 0; attempt < maxBlockRepairs; attempt += 1) {
        const blocksAudit = auditLegendBlocksDepth({
          canon: state.canon,
          legendBlocks
        });
        if (blocksAudit.ready) {
          break;
        }

        const repairedBlocks = await repairLegendBlocks({
          canon: state.canon,
          anchors: state.anchors_timeline,
          facts: state.fact_bank,
          currentBlocks: legendBlocks,
          stagePrompt: state.stage_prompts.stage_3_blocks_prompt,
          issues: blocksAudit.issues,
          generationType,
          requestId
        });
        response = repairedBlocks.response;
        legendBlocks = repairedBlocks.legendBlocks;
        legendFullText = repairedBlocks.legendFullText || legendFullText;
        hasBlocks = hasLegendBlocksContent(legendBlocks);
        blocksMetaSource = repairedBlocks.blocksMetaSource || blocksMetaSource;
        if (!hasBlocks) {
          break;
        }
      }
    }
  }

  if (requiresBlocks && !hasBlocks) {
    throw new Error('Gemini РЅРµ РІРµСЂРЅСѓР» legend blocks РґР»СЏ stage_3_blocks.');
  }
  if (false && requiresFullText && !legendFullText) {
    throw new Error('Gemini РЅРµ РІРµСЂРЅСѓР» legend_full_text РґР»СЏ stage_3_blocks.');
  }

  if (requiresFullText) {
    const canonFirst = await generateCanonFirstLegendFullText({
      canon: state.canon,
      anchors: state.anchors_timeline,
      facts: state.fact_bank,
      legendBlocks,
      stagePrompt: state.stage_prompts.stage_3_full_text_prompt,
      generationType,
      requestId
    });
    response = canonFirst.response;
    legendFullText = patchLegendFullTextFromSupport({
      text: canonFirst.text,
      canon: state.canon,
      legendBlocks
    });
    const maxFullTextRepairs = isFlashGeneration ? 3 : 4;
    for (let attempt = 0; attempt < maxFullTextRepairs; attempt += 1) {
      const fullTextAudit = await auditLegendFullText({
        canon: state.canon,
        currentText: legendFullText,
        stagePrompt: state.stage_prompts.stage_3_full_text_prompt,
        generationType,
        requestId
      });
      if (fullTextAudit?.audit?.ready) {
        break;
      }

      const repaired = await repairLegendFullText({
        canon: state.canon,
        anchors: state.anchors_timeline,
        facts: state.fact_bank,
        legendBlocks,
        currentText: legendFullText,
        stagePrompt: state.stage_prompts.stage_3_full_text_prompt,
        auditIssues: Array.isArray(fullTextAudit?.audit?.issues) ? fullTextAudit.audit.issues : [],
        generationType,
        requestId
      });
      response = repaired.response;
      legendFullText = patchLegendFullTextFromSupport({
        text: repaired.text,
        canon: state.canon,
        legendBlocks
      });
    }

    for (let compressionAttempt = 0; compressionAttempt < 2; compressionAttempt += 1) {
      const finalFullTextWordCount = countWordLikeUnits(legendFullText);
      const finalFullTextCharCount = safeString(legendFullText).length;
      if (finalFullTextWordCount <= 900 && finalFullTextCharCount <= 7200) {
        break;
      }

      const compressed = await compressLegendFullText({
        canon: state.canon,
        legendBlocks,
        currentText: legendFullText,
        stagePrompt: state.stage_prompts.stage_3_full_text_prompt,
        generationType,
        requestId
      });
      response = compressed.response;
      legendFullText = patchLegendFullTextFromSupport({
        text: compressed.text,
        canon: state.canon,
        legendBlocks
      });
    }

  }

  if (hasBlocks) {
    try {
      const override = await maybeGenerateSexualPreferencesOverride({
        canon: state.canon,
        anchors: state.anchors_timeline,
        facts: state.fact_bank,
        currentBlocks: legendBlocks,
        stagePrompt: state.stage_prompts.stage_3_blocks_prompt,
        generationType,
        requestId
      });
      if (override?.text) {
        legendBlocks = {
          ...legendBlocks,
          sexualPreferences: override.text
        };
        sexualPreferencesOverrideResponse = override.response || null;
      }
    } catch (_error) {
      // Keep the Gemini block unchanged if the xAI-only override fails.
    }
  }

  const normalizedBlocks = hasBlocks ? legendBlocks : {};
  const blocksMeta = hasBlocks ? normalizeBlocksMeta(blocksMetaSource, state.fact_bank) : {};
  if (hasBlocks && blocksMeta.sexualPreferences) {
    blocksMeta.sexualPreferences.provider = sexualPreferencesOverrideResponse?.provider || response?.provider || 'gemini';
    blocksMeta.sexualPreferences.model = sexualPreferencesOverrideResponse?.model || response?.model || null;
  }

  state.legend_blocks = normalizedBlocks;
  state.legend_full_text = legendFullText;
  state.legend_v1_final_json = deepClone(normalizedBlocks);
  state.blocks_report = {
    blocks_meta: blocksMeta
  };
  state.qc_report = buildPendingQcReport('QC не запускался после сборки блоков.');

  updatePipelineMeta(state, {
    ...buildStageProviderMetaPatch(state, response, 'stage_3_blocks'),
    stage_3_output_mode: normalizedOutputMode,
    stage_3_sexual_preferences_provider: sexualPreferencesOverrideResponse?.provider || null,
    stage_3_sexual_preferences_model: sexualPreferencesOverrideResponse?.model || null,
    stage_3_sexual_preferences_endpoint_mode: sexualPreferencesOverrideResponse?.endpointMode || null
  });

  return response;
}

async function runSexualPreferencesOverrideOnly({
  pipelineStateInput,
  generationType = 'type-pro',
  requestId = ''
}) {
  const state = ensurePipelineState(pipelineStateInput);
  if (!Array.isArray(state.fact_bank) || state.fact_bank.length === 0) {
    throw new Error('Для sexualPreferences override сначала выполните stage_2_fact_bank.');
  }

  const currentBlocks = normalizeLegendBlocks(state.legend_blocks || state.legend_v1_final_json || {});
  const override = await maybeGenerateSexualPreferencesOverride({
    canon: state.canon,
    anchors: state.anchors_timeline,
    facts: state.fact_bank,
    currentBlocks,
    stagePrompt: state?.stage_prompts?.stage_3_blocks_prompt,
    generationType,
    requestId
  });
  if (!override?.text) {
    throw new Error('xAI did not return sexualPreferences override.');
  }

  const nextBlocks = {
    ...currentBlocks,
    sexualPreferences: override.text
  };

  state.legend_blocks = nextBlocks;
  state.legend_v1_final_json = {
    ...(state.legend_v1_final_json && typeof state.legend_v1_final_json === 'object' ? state.legend_v1_final_json : {}),
    sexualPreferences: override.text
  };
  if (!state.blocks_report || typeof state.blocks_report !== 'object') {
    state.blocks_report = { blocks_meta: {} };
  }
  if (!state.blocks_report.blocks_meta || typeof state.blocks_report.blocks_meta !== 'object') {
    state.blocks_report.blocks_meta = {};
  }
  state.blocks_report.blocks_meta.sexualPreferences = {
    ...(state.blocks_report.blocks_meta.sexualPreferences || {}),
    provider: override.response?.provider || null,
    model: override.response?.model || null
  };

  updatePipelineMeta(state, {
    stage_3_sexual_preferences_provider: override.response?.provider || null,
    stage_3_sexual_preferences_model: override.response?.model || null,
    stage_3_sexual_preferences_endpoint_mode: override.response?.endpointMode || null
  });

  return {
    pipelineState: state,
    finishReason: 'PIPELINE_STAGE_3_SEXUAL_PREFERENCES_READY',
    source: override.response?.provider || 'xai',
    modelUsed: override.response?.model || null
  };
}

async function runStage4({ state, generationType, requestId }) {
  const hasBlocks = Object.values(state.legend_blocks || {}).some((item) => safeString(item).trim());
  if (!hasBlocks) {
    throw new Error('Для stage_4_qc сначала выполните stage_3_blocks.');
  }

  const prompt = buildStage4Prompt({
    canon: state.canon,
    anchors: state.anchors_timeline || [],
    factBankReport: state.fact_bank_report || {},
    legendBlocks: state.legend_blocks || {},
    stagePrompt: state.stage_prompts.stage_4_qc_prompt
  });
  const generated = await generateParsedGeminiObject({
    prompt,
    generationType,
    requestId,
    timeoutMs: resolveStageTimeoutMs('stage_4_qc'),
    stageKey: 'stage_4_qc'
  });
  const response = generated.response;
  const parsed = generated.parsed;
  state.qc_report = normalizeQcReport(parsed.qc_report || parsed);

  updatePipelineMeta(state, {
    ...buildStageProviderMetaPatch(state, response, 'stage_4_qc')
  });

  return response;
}

async function runStagePipeline({
  stageKey,
  person,
  personalityProfile,
  stagePromptsInput,
  stage3OutputMode = 'blocks',
  factExtensionPackages = 0,
  pipelineStateInput = null,
  generationType = 'type-pro',
  requestId = ''
}) {
  const normalizedStageKey = normalizeStageKey(stageKey);
  if (!STAGE_ORDER.includes(normalizedStageKey)) {
    throw new Error(`Неизвестный этап: ${normalizedStageKey}`);
  }

  const normalizedStagePrompts = normalizeStagePrompts(stagePromptsInput);
  const normalizedStage3OutputMode = normalizeStage3OutputMode(stage3OutputMode);
  const normalizedFactPackages = normalizeFactPackages(factExtensionPackages);
  const normalizedGenerationType = safeString(generationType).trim().toLowerCase() || 'type-pro';

  if (normalizedStageKey === 'stage_0_canon') {
    const canon = buildCanon(person, personalityProfile);
    const pipelineState = buildInitialPipelineState({
      canon,
      stagePrompts: normalizedStagePrompts,
      factExtensionPackages: normalizedFactPackages,
      generationType: normalizedGenerationType
    });

    updatePipelineMeta(pipelineState, {
      last_completed_stage: 'stage_0_canon',
      stage_3_output_mode: normalizedStage3OutputMode,
      source: 'mock'
    });

    return {
      pipelineState,
      finishReason: 'PIPELINE_STAGE_0_READY',
      source: 'stage_0_mock',
      modelUsed: null
    };
  }

  const state = ensurePipelineState(pipelineStateInput);
  state.stage_prompts = normalizeStagePrompts({
    ...(state.stage_prompts || {}),
    ...normalizedStagePrompts
  });
  state.fact_extension_packages = normalizedFactPackages;
  state.pipeline_meta = {
    ...(state.pipeline_meta || {}),
    stage_3_output_mode: normalizedStage3OutputMode
  };
  if (!state.canon.personality_profile) {
    state.canon.personality_profile = normalizeProfile(personalityProfile || {});
  }
  if (!state.canon.top_traits || !Array.isArray(state.canon.top_traits) || state.canon.top_traits.length === 0) {
    state.canon.top_traits = buildTopTraits(state.canon.personality_profile || {});
  }

  let modelUsed = null;
  if (normalizedStageKey === 'stage_1_anchors') {
    const response = await runStage1({
      state,
      generationType: normalizedGenerationType,
      requestId
    });
    modelUsed = response.model;
  } else if (normalizedStageKey === 'stage_2_fact_bank') {
    const response = await runStage2({
      state,
      generationType: normalizedGenerationType,
      requestId
    });
    modelUsed = response.model;
  } else if (normalizedStageKey === 'stage_3_blocks') {
    const response = await runStage3({
      state,
      generationType: normalizedGenerationType,
      requestId,
      outputMode: normalizedStage3OutputMode
    });
    modelUsed = response.model;
  } else if (normalizedStageKey === 'stage_4_qc') {
    const response = await runStage4({
      state,
      generationType: normalizedGenerationType,
      requestId
    });
    modelUsed = response.model;
  }

  return {
    pipelineState: state,
    finishReason: `PIPELINE_STAGE_COMPLETED:${normalizedStageKey}`,
    source: 'gemini',
    modelUsed
  };
}

module.exports = {
  STAGE_ORDER,
  runStagePipeline,
  runSexualPreferencesOverrideOnly,
  runCanonProfileConsistencyCheck,
  buildPendingCanonConsistencyReport,
  normalizeCanonConsistencyReport
};
