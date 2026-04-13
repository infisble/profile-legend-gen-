// @ts-nocheck
const {
  PERSONALITY_CRITERIA,
  LEGEND_BLOCKS,
  LIFE_SPHERES,
  FACT_LIMITS,
  STAGE_PROMPT_DEFAULTS,
  REGENERATABLE_STAGES
} = require('./constants');
const { clampInt, safeString, normalizeText, deepClone, deepFreeze, hashString, generateNgrams } = require('./utils');

const STAGE_ORDER = ['stage_0_canon', 'stage_1_anchors', 'stage_2_fact_bank', 'stage_3_blocks', 'stage_4_qc'];
const TEMPLATE_MARKERS = ['в целом', 'как правило', 'на самом деле', 'можно сказать', 'стоит отметить'];
const MONTH_LABELS = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MIN_PERSON_AGE = 0;
const MAX_PERSON_AGE = 120;
const DATING_TARGET_GENDER = 'женщина';
const DATING_RELATIONSHIP_STATUS = 'не замужем, свободна, открыта к отношениям с мужчиной';

const SPHERE_TO_TRAITS = {
  childhood: ['confidence', 'emotional_stability'],
  family: ['empathy', 'partner_seek_drive'],
  education: ['discipline', 'openness_to_change'],
  career: ['achievement_drive', 'responsibility', 'confidence'],
  finance: ['wealth', 'discipline'],
  relationships: ['empathy', 'partner_seek_drive', 'independence'],
  sexuality: ['sexual_expressiveness', 'confidence'],
  health: ['health', 'discipline'],
  habits: ['discipline', 'health'],
  social: ['social_connection', 'confidence'],
  values: ['mission_level', 'responsibility'],
  crisis: ['emotional_stability', 'independence'],
  mission: ['mission_level', 'achievement_drive'],
  future: ['mission_level', 'openness_to_change']
};

const ANCHOR_SPHERES = ['childhood', 'family', 'education', 'career', 'relationships', 'finance', 'crisis', 'health', 'social', 'mission', 'future'];
const FACT_SOURCE_TYPES = Object.freeze({
  anchor: 'anchor',
  canon: 'canon',
  periodLogic: 'period_logic'
});
const LIFE_PERIODS = Object.freeze([
  { key: 'early', minAge: 8, maxAge: 13 },
  { key: 'teen', minAge: 14, maxAge: 19 },
  { key: 'young_adult', minAge: 20, maxAge: 27 },
  { key: 'adult_build', minAge: 28, maxAge: 36 },
  { key: 'mature', minAge: 37, maxAge: 95 }
]);

const TRAIT_CANON_TEMPLATES = Object.freeze({
  responsibility: {
    sphere: 'career',
    high: ['зафиксировала личную ответственность за дедлайн ключевого проекта'],
    low: ['ввела персональный чек-лист контроля сроков']
  },
  achievement_drive: {
    sphere: 'career',
    high: ['поставила измеримую цель повышения в роли'],
    low: ['пересобрала карьерные KPI после срыва цели']
  },
  empathy: {
    sphere: 'relationships',
    high: ['провела сложный разговор с партнером без эскалации конфликта'],
    low: ['начала фиксировать эмоции собеседника перед ответом']
  },
  discipline: {
    sphere: 'habits',
    high: ['перешла на недельное планирование с фиксированными слотами'],
    low: ['поставила ежедневный таймер завершения задач']
  },
  independence: {
    sphere: 'values',
    high: ['отказалась от внешнего согласования личного решения'],
    low: ['сформулировала личные критерии принятия решений']
  },
  emotional_stability: {
    sphere: 'crisis',
    high: ['сохранила рабочий ритм в кризисный месяц'],
    low: ['обратилась к психотерапии после эмоционального перегруза']
  },
  confidence: {
    sphere: 'social',
    high: ['выступила с публичной презентацией перед руководством'],
    low: ['записалась на курс публичных выступлений']
  },
  openness_to_change: {
    sphere: 'future',
    high: ['перешла в новый формат работы без периода отката'],
    low: ['согласилась на пилотный проект в новой роли']
  },
  creativity: {
    sphere: 'mission',
    high: ['предложила нестандартный формат запуска продукта'],
    low: ['ввела еженедельную сессию идей по работе']
  },
  sexual_expressiveness: {
    sphere: 'sexuality',
    high: ['открыто обозначила личные предпочтения в близости'],
    low: ['обозначила минимальные границы комфорта в близости']
  },
  dominance_level: {
    sphere: 'career',
    high: ['взяла роль ведущей на сложных переговорах'],
    low: ['начала фиксировать позицию до обсуждения']
  },
  wealth: {
    sphere: 'finance',
    high: ['увеличила ежемесячный инвестиционный взнос'],
    low: ['создала резервный фонд на три месяца расходов']
  },
  health: {
    sphere: 'health',
    high: ['прошла профилактический чекап без пропусков'],
    low: ['начала регулярное лечение по назначению врача']
  },
  social_connection: {
    sphere: 'social',
    high: ['вступила в профессиональное сообщество по своей роли'],
    low: ['восстановила контакт с тремя ключевыми людьми']
  },
  mission_level: {
    sphere: 'mission',
    high: ['сформулировала личную миссию на пять лет'],
    low: ['описала базовые критерии долгой цели']
  },
  partner_seek_drive: {
    sphere: 'relationships',
    high: ['инициировала обсуждение формата долгого союза'],
    low: ['зафиксировала личные правила безопасной близости']
  }
});

const DEFAULT_PERSON_TEMPLATE = {
  gender: DATING_TARGET_GENDER,
  name: 'Алина',
  birth_date: '1994-08-17',
  birth_place: 'Россия, Казань',
  current_location: { country: 'Польша', city: 'Варшава', since: '2022' },
  relationship_status: DATING_RELATIONSHIP_STATUS,
  education: { degree: 'магистр', specialization: 'экономика', institution: 'КФУ', graduation_year: '2016' },
  job: {
    title: 'Product Manager',
    company: 'B2B SaaS',
    location: 'Warsaw',
    income_level: 'выше среднего',
    since: '2022',
    duties: 'развитие продукта'
  },
  children: []
};

const PERSONALITY_CRITERIA_BY_KEY = Object.freeze(
  PERSONALITY_CRITERIA.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {})
);

const CANON_PROFILE_KEYWORD_RULES = Object.freeze([
  {
    traitKey: 'responsibility',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'core_values', 'first_impression', 'temperament', 'job.duties'],
    keywords: ['ответствен', 'обязатель', 'надежн', 'пунктуаль', 'собран', 'самоконтрол']
  },
  {
    traitKey: 'discipline',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'core_values', 'first_impression', 'temperament', 'job.duties', 'bad_habits'],
    keywords: ['дисциплин', 'структур', 'режим', 'порядок', 'собран', 'самоконтрол', 'планир']
  },
  {
    traitKey: 'independence',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'core_values', 'first_impression', 'core_fear'],
    keywords: ['самостоятель', 'независим', 'автоном']
  },
  {
    traitKey: 'emotional_stability',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'first_impression', 'temperament', 'distinctive_features'],
    keywords: ['спокойн', 'уравновеш', 'стрессоуст', 'сдержан', 'самоконтрол']
  },
  {
    traitKey: 'achievement_drive',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'dream', 'life_plans.desired_changes', 'job.title', 'job.duties'],
    keywords: ['амбици', 'результат', 'цель', 'повышен', 'рост', 'карьер', 'kpi']
  },
  {
    traitKey: 'confidence',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'first_impression', 'distinctive_features'],
    keywords: ['уверенн', 'смел', 'прям', 'требователь', 'сильн']
  },
  {
    traitKey: 'empathy',
    direction: 'high',
    scoreThreshold: 3,
    fieldPaths: ['character_traits', 'core_values', 'first_impression'],
    keywords: ['эмпат', 'забот', 'чутк', 'поддерж', 'вниматель']
  },
  {
    traitKey: 'discipline',
    direction: 'low',
    scoreThreshold: 8,
    fieldPaths: ['bad_habits', 'character_traits', 'first_impression', 'temperament'],
    keywords: ['хаотич', 'прокрастин', 'опаздыв', 'беспоряд', 'импульсив']
  },
  {
    traitKey: 'responsibility',
    direction: 'low',
    scoreThreshold: 8,
    fieldPaths: ['bad_habits', 'character_traits', 'first_impression'],
    keywords: ['безответствен', 'ненадеж', 'срывает сроки']
  },
  {
    traitKey: 'emotional_stability',
    direction: 'low',
    scoreThreshold: 8,
    fieldPaths: ['bad_habits', 'character_traits', 'temperament', 'first_impression'],
    keywords: ['тревожн', 'вспыльч', 'реактив', 'неустойчив', 'перегруз']
  },
  {
    traitKey: 'confidence',
    direction: 'low',
    scoreThreshold: 8,
    fieldPaths: ['character_traits', 'first_impression'],
    keywords: ['неуверенн', 'зажат', 'избегает внимани']
  }
]);

function normalizeStagePrompts(stagePromptsInput) {
  const normalized = { ...STAGE_PROMPT_DEFAULTS };
  if (!stagePromptsInput || typeof stagePromptsInput !== 'object') {
    return normalized;
  }

  for (const [key, fallback] of Object.entries(STAGE_PROMPT_DEFAULTS)) {
    const candidate = safeString(stagePromptsInput[key]).trim();
    normalized[key] = candidate || fallback;
  }

  return normalized;
}

function normalizeDatingRelationshipStatus() {
  return DATING_RELATIONSHIP_STATUS;
}

function normalizeProfile(profileInput = {}) {
  const out = {};
  for (const criterion of PERSONALITY_CRITERIA) {
    const raw = Number(profileInput?.[criterion.key]);
    out[criterion.key] = clampInt(Number.isFinite(raw) ? raw : 5, 1, 10);
  }
  return out;
}

function rankTraits(profile) {
  return PERSONALITY_CRITERIA.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    value: profile[criterion.key]
  })).sort((a, b) => b.value - a.value);
}

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

function resolveBirthYear(person, currentYear) {
  return parseYear(person?.birth_date) || parseYear(person?.birth_year) || (Number(person?.age) ? currentYear - Number(person.age) : null);
}

function resolveAge(person, birthYear, currentYear) {
  const ageRaw = Number(person?.age);
  if (Number.isFinite(ageRaw) && ageRaw >= MIN_PERSON_AGE && ageRaw <= MAX_PERSON_AGE) {
    return Math.round(ageRaw);
  }

  if (Number.isFinite(birthYear)) {
    const birthDate = parseDateParts(person?.birth_date);
    let age = currentYear - birthYear;
    const now = new Date();
    if (currentYear === now.getUTCFullYear() && Number.isFinite(birthDate.month)) {
      const currentMonth = now.getUTCMonth() + 1;
      const currentDay = now.getUTCDate();
      const birthDay = Number.isFinite(birthDate.day) ? birthDate.day : 1;
      if (currentMonth < birthDate.month || (currentMonth === birthDate.month && currentDay < birthDay)) {
        age -= 1;
      }
    }
    return clampInt(age, MIN_PERSON_AGE, MAX_PERSON_AGE);
  }

  return null;
}

function makeRng(seed) {
  let state = hashString(seed || `${Date.now()}`) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(rng, min, max) {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(rng() * (max - min + 1));
}

function randomItem(rng, list, fallback = '') {
  if (!Array.isArray(list) || list.length === 0) {
    return fallback;
  }
  return list[randomInt(rng, 0, list.length - 1)] || fallback;
}

function ensurePeriod(text) {
  const source = safeString(text).trim();
  if (!source) {
    return '';
  }
  return /[.!?]$/.test(source) ? source : `${source}.`;
}

function resolveVariationSeed(options = {}, pipelineState = null) {
  const direct = safeString(options.variation_seed || options.variationSeed || options.regeneration_nonce || options.regenerationNonce).trim();
  if (direct) {
    return direct;
  }

  const fromState = safeString(pipelineState?.pipeline_meta?.variation_seed).trim();
  if (fromState) {
    return fromState;
  }

  return `${Date.now()}`;
}

function resolveFactExtensionPackages(options = {}, pipelineState = null) {
  const direct = Number(options.fact_extension_packages);
  if (Number.isFinite(direct)) {
    return clampInt(direct, 0, FACT_LIMITS.maxPackages);
  }

  const fromState = Number(pipelineState?.fact_bank_report?.extension_packages);
  if (Number.isFinite(fromState)) {
    return clampInt(fromState, 0, FACT_LIMITS.maxPackages);
  }

  return 0;
}

function buildStage0Input(input, options = {}) {
  const currentYear = Number(options.current_year) || new Date().getUTCFullYear();
  const personSource = input?.person && typeof input.person === 'object' ? deepClone(input.person) : deepClone(DEFAULT_PERSON_TEMPLATE);
  const person = {
    ...personSource,
    gender: DATING_TARGET_GENDER,
    relationship_status: normalizeDatingRelationshipStatus(personSource?.relationship_status)
  };
  const profile = normalizeProfile(input?.personality_profile || {});
  const birthYear = resolveBirthYear(person, currentYear);
  const age = resolveAge(person, birthYear, currentYear);
  const topTraits = rankTraits(profile).slice(0, 3);
  const vulnerableTraits = [...rankTraits(profile)].reverse().slice(0, 3);

  return {
    seed_profile: { person: deepClone(person), personality_profile: deepClone(profile) },
    canon: deepFreeze({
      name: safeString(person?.name || 'Персонаж').trim() || 'Персонаж',
      surname: safeString(person?.surname).trim() || null,
      birth_year: birthYear,
      age,
      current_year: currentYear,
      birth_place: safeString(person?.birth_place).trim() || null,
      current_location: {
        country: safeString(person?.current_location?.country).trim() || safeString(person?.country).trim() || null,
        city: safeString(person?.current_location?.city).trim() || safeString(person?.city).trim() || null,
        since: parseYear(person?.current_location?.since)
      },
      gender: DATING_TARGET_GENDER,
      relationship_status: safeString(person?.relationship_status).trim() || DATING_RELATIONSHIP_STATUS,
      children_count: Array.isArray(person?.children) ? person.children.length : 0,
      personality_profile: deepClone(profile),
      top_traits: deepClone(topTraits),
      vulnerable_traits: deepClone(vulnerableTraits),
      person_raw: deepClone(person)
    })
  };
}

function buildAnchorTimePrefix(year, age, month = null) {
  if (Number.isFinite(year)) {
    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      return `В ${MONTH_LABELS[month - 1]} ${year} года`;
    }
    return `В ${year} году`;
  }
  if (Number.isFinite(age)) {
    return `В ${age} лет`;
  }
  return 'В один из переломных периодов';
}

function buildAnchorScenarioPool(canon) {
  const person = canon?.person_raw || {};
  const currentCity = safeString(canon?.current_location?.city || person?.city || 'текущем городе').trim() || 'текущем городе';
  const birthCity = safeString(canon?.birth_place || 'родном городе').trim() || 'родном городе';
  const currentCountry = safeString(canon?.current_location?.country || person?.country || 'текущей стране проживания').trim() || 'текущей стране проживания';
  const jobTitle = safeString(person?.job?.title || 'руководитель отдела').trim() || 'руководитель отдела';
  const company = safeString(person?.job?.company || 'компания без публичного бренда').trim() || 'компания без публичного бренда';
  const specialization = safeString(person?.education?.specialization || 'основная специальность').trim() || 'основная специальность';
  const institution = safeString(person?.education?.institution || 'университет').trim() || 'университет';
  const cityLabel = `в городе ${currentCity}`;
  const birthCityLabel = `в городе ${birthCity}`;
  const countryLabel = `в стране ${currentCountry}`;
  const institutionLabel = `в ${institution}`;

  return {
    childhood: [
      {
        where: birthCityLabel,
        event: 'после переезда в другой район меня перевели в новую школу, и в первой четверти я получила три двойки по математике',
        result: 'за шесть месяцев я начала занятия с репетитором и закрыла учебный год без двоек',
        tone: -1
      },
      {
        where: birthCityLabel,
        event: 'после конфликта с классом я две недели не ходила на занятия и пропустила школьную олимпиаду',
        result: 'я восстановила учебный график и в следующем семестре вошла в тройку по успеваемости в классе',
        tone: -1
      }
    ],
    family: [
      {
        where: cityLabel,
        event: 'после конфликта с отцом я съехала из родительского дома в съемную комнату',
        result: 'за три месяца я выстроила отдельный бюджет и больше не зависела от семейных переводов',
        tone: -1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'после развода родителей я взяла на себя оплату коммунальных счетов и закупку продуктов для семьи',
        result: 'я закрепила ежемесячный финансовый план и закрывала обязательные расходы без просрочек',
        tone: -1
      }
    ],
    education: [
      {
        where: institutionLabel,
        event: `я провалила государственный экзамен по специализации «${specialization}» с первой попытки`,
        result: 'через восемь месяцев я пересдала экзамен и получила допуск к защите диплома',
        tone: -1
      },
      {
        where: institutionLabel,
        event: 'на третьем курсе я перевелась с теоретического направления на прикладное',
        result: 'за следующий учебный год я собрала портфолио из трех практических проектов',
        tone: 1
      }
    ],
    career: [
      {
        where: cityLabel,
        event: `я потеряла работу на позиции «${jobTitle}» в компании «${company}» после двухмесячного больничного из-за нервного срыва`,
        result: 'за четыре месяца я прошла лечение, закрыла срочные долги и вышла на новую работу с меньшей нагрузкой',
        tone: -1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'меня сняли с управления проектом после провала квартального KPI на 32%',
        result: 'я внедрила еженедельный контроль метрик и через полгода вернула себе руководящую роль',
        tone: -1,
        hook: true
      }
    ],
    relationships: [
      {
        where: cityLabel,
        event: 'я разорвала помолвку за месяц до регистрации брака после подтвержденной измены партнера',
        result: 'через полгода я сформулировала жесткие правила входа в отношения и не возвращалась к прежнему сценарию',
        tone: -1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'после повторяющихся скандалов я завершила отношения и в тот же месяц переехала в отдельное жилье',
        result: 'я восстановила личные границы и начала обсуждать ожидания до совместного быта',
        tone: -1,
        hook: true
      }
    ],
    finance: [
      {
        where: cityLabel,
        event: 'я допустила просрочку по кредиту на 45 дней после кассового разрыва в личном бюджете',
        result: 'за четыре месяца я закрыла просрочку и сформировала резерв на три платежа вперед',
        tone: -1
      },
      {
        where: cityLabel,
        event: 'я закрыла ФОП после штрафа за несданную налоговую отчетность',
        result: 'я перешла на официальную работу по найму и больше не допускала штрафов по документам',
        tone: -1
      }
    ],
    crisis: [
      {
        where: countryLabel,
        event: 'в течение одного квартала я одновременно потеряла работу и получила новость о тяжелой болезни матери',
        result: 'я собрала антикризисный план на 90 дней и стабилизировала обязательные расходы семьи',
        tone: -1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'после публичного конфликта с ключевым клиентом годовой контракт был расторгнут в одностороннем порядке',
        result: 'за два месяца я восстановила репутацию через три успешно закрытых коротких проекта',
        tone: -1,
        hook: true
      }
    ],
    health: [
      {
        where: cityLabel,
        event: 'мне сделали операцию после острого воспаления, и я выбыла из работы на шесть недель',
        result: 'я перестроила график восстановления и вернулась в работу без ночных смен',
        tone: -1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'после серии панических атак мне диагностировали тревожное расстройство',
        result: 'я начала терапию, снизила нагрузку и через три месяца вернула стабильный режим сна',
        tone: -1,
        hook: true
      }
    ],
    social: [
      {
        where: cityLabel,
        event: 'я прекратила партнерство с близким другом после срыва договоренностей по совместному проекту',
        result: 'я ввела письменные договоренности для всех рабочих партнерств и больше не работала на устных обещаниях',
        tone: -1
      },
      {
        where: cityLabel,
        event: 'меня исключили из профессионального сообщества после внутреннего конфликта на публичном мероприятии',
        result: 'я собрала новую сеть контактов через две отраслевые конференции и вернула поток входящих предложений',
        tone: 1
      }
    ],
    mission: [
      {
        where: cityLabel,
        event: 'я отказалась от повышения с ростом зарплаты, потому что роль не совпадала с моим долгим вектором',
        result: 'я сфокусировалась на одной экспертизе и за год получила профильные проекты в этой нише',
        tone: 1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'я закрыла коммерческий проект с высокой маржой, который противоречил моим ценностям',
        result: 'я собрала портфель клиентов только из этичных для меня направлений и сохранила доход',
        tone: 1,
        hook: true
      }
    ],
    future: [
      {
        where: countryLabel,
        event: `я подписала контракт на релокацию в ${currentCountry} в течение 14 дней после оффера`,
        result: 'я за три месяца подготовила документы, жилье и финансовую подушку под переезд',
        tone: 1,
        hook: true
      },
      {
        where: cityLabel,
        event: 'я отказалась от стабильной роли и запустила собственный проект с фиксированным бюджетом на 12 месяцев',
        result: 'я закрепила план развития по кварталам и оставила только измеримые цели по выручке',
        tone: 1,
        hook: true
      }
    ]
  };
}

function resolveAnchorAgeRange(sphere, canonAge) {
  const limits = {
    childhood: { min: 8, max: 14 },
    family: { min: 16, max: 55 },
    education: { min: 18, max: 30 },
    career: { min: 20, max: 65 },
    relationships: { min: 18, max: 65 },
    finance: { min: 20, max: 65 },
    crisis: { min: 16, max: 65 },
    health: { min: 14, max: 65 },
    social: { min: 15, max: 65 },
    mission: { min: 24, max: 75 },
    future: { min: 24, max: 75 }
  };
  const base = limits[sphere] || { min: 16, max: 60 };
  const canonMax = Number.isFinite(canonAge) ? canonAge + 2 : base.max;
  const max = Math.min(base.max, Math.max(base.min, canonMax));
  return { min: base.min, max };
}

function buildStage1Anchors(stage0, options = {}) {
  const canon = stage0.canon;
  const variationSeed = resolveVariationSeed(options);
  const rng = makeRng(`${variationSeed}:anchors:${canon.name}`);
  const count = clampInt(10 + randomInt(rng, -2, 2), 8, 12);
  const scenarioPool = buildAnchorScenarioPool(canon);

  const anchors = [];
  const fallbackCity = safeString(canon?.current_location?.city || canon?.birth_place || 'текущем городе').trim() || 'текущем городе';
  for (let i = 0; i < count; i += 1) {
    const sphere = ANCHOR_SPHERES[i % ANCHOR_SPHERES.length];
    const ageRange = resolveAnchorAgeRange(sphere, canon.age);
    const ageCandidate = Number.isFinite(canon.age)
      ? 8 + i * 3 + randomInt(rng, -1, 1)
      : 12 + i * 2 + randomInt(rng, -1, 1);
    const age = clampInt(ageCandidate, ageRange.min, ageRange.max);
    const year = Number.isFinite(canon.birth_year) ? canon.birth_year + age : null;
    const month = randomInt(rng, 1, 12);
    const scenarios = scenarioPool[sphere] || [];
    const scenario = randomItem(rng, scenarios, null) || {
      where: `в городе ${fallbackCity}`,
      event: 'я потеряла контроль над ключевым направлением и была вынуждена остановить текущий проект',
      result: 'за три месяца я пересобрала план действий и вернула стабильный рабочий ритм',
      tone: 0
    };
    const where = safeString(scenario.where).trim() || `в городе ${fallbackCity}`;
    const eventCore = safeString(scenario.event).trim() || 'произошло резкое событие в жизненном контуре';
    const resultCore = safeString(scenario.result || scenario.impact).trim() || 'я пересмотрела модель решений и зафиксировала новые правила действий';
    const eventText = `${buildAnchorTimePrefix(year, age, month)} ${where} ${eventCore}`.replace(/\s+/g, ' ').trim();

    anchors.push({
      id: `anchor_${String(i + 1).padStart(2, '0')}`,
      sphere,
      age,
      year,
      month,
      where,
      event: ensurePeriod(eventText),
      impact: ensurePeriod(`Результат: ${resultCore}`),
      result: ensurePeriod(resultCore),
      hook_potential: scenario.hook !== undefined ? Boolean(scenario.hook) : ['career', 'relationships', 'sexuality', 'crisis', 'mission'].includes(sphere),
      tone:
        Number.isFinite(scenario.tone)
          ? scenario.tone
          : ['crisis', 'health'].includes(sphere)
            ? -1
            : ['career', 'mission', 'future'].includes(sphere)
              ? 1
              : 0,
      trait_focus: SPHERE_TO_TRAITS[sphere] || ['responsibility']
    });
  }

  const coverage = {};
  for (const sphere of LIFE_SPHERES.map((item) => item.key)) {
    coverage[sphere] = anchors.filter((anchor) => anchor.sphere === sphere).length;
  }

  return {
    anchors_timeline: anchors,
    anchors_report: {
      count: anchors.length,
      desired_range: '8-12',
      coverage_by_sphere: coverage,
      selected_mode: 'turning_points_v3_concrete',
      variation_seed: variationSeed
    }
  };
}
function normalizeFactTimeline({ canon, year, age }) {
  let normalizedYear = Number.isFinite(year) ? Math.round(year) : null;
  let normalizedAge = Number.isFinite(age) ? Math.round(age) : null;

  if (!Number.isFinite(normalizedYear) && Number.isFinite(normalizedAge) && Number.isFinite(canon?.birth_year)) {
    normalizedYear = canon.birth_year + normalizedAge;
  }
  if (!Number.isFinite(normalizedAge) && Number.isFinite(normalizedYear) && Number.isFinite(canon?.birth_year)) {
    normalizedAge = normalizedYear - canon.birth_year;
  }

  if (Number.isFinite(canon?.birth_year) && Number.isFinite(normalizedYear)) {
    normalizedYear = Math.max(canon.birth_year + 5, normalizedYear);
  }
  if (Number.isFinite(canon?.current_year) && Number.isFinite(normalizedYear)) {
    normalizedYear = Math.min(canon.current_year + 5, normalizedYear);
  }

  if (Number.isFinite(canon?.birth_year) && Number.isFinite(normalizedYear)) {
    normalizedAge = normalizedYear - canon.birth_year;
  }
  if (Number.isFinite(normalizedAge)) {
    normalizedAge = clampInt(normalizedAge, 8, 95);
  }

  return {
    year: Number.isFinite(normalizedYear) ? normalizedYear : null,
    age: Number.isFinite(normalizedAge) ? normalizedAge : null
  };
}

function pickLifePeriodByAge(age) {
  if (!Number.isFinite(age)) {
    return null;
  }
  return LIFE_PERIODS.find((period) => age >= period.minAge && age <= period.maxAge)?.key || LIFE_PERIODS[LIFE_PERIODS.length - 1].key;
}

function buildCoverageByPeriod(facts, canon) {
  const coverage = {};
  for (const period of LIFE_PERIODS) {
    coverage[period.key] = 0;
  }

  for (const fact of facts || []) {
    const resolvedAge = Number.isFinite(fact.age)
      ? fact.age
      : Number.isFinite(fact.year) && Number.isFinite(canon?.birth_year)
        ? fact.year - canon.birth_year
        : null;
    const periodKey = pickLifePeriodByAge(resolvedAge);
    if (periodKey) {
      coverage[periodKey] += 1;
    }
  }

  return coverage;
}

function pickWeakestCoverageKey(coverage, fallbackKey) {
  const ordered = Object.entries(coverage || {}).sort((a, b) => a[1] - b[1]);
  return ordered[0]?.[0] || fallbackKey;
}

function pickAgeForLifePeriod(periodKey, canon, rng) {
  const period = LIFE_PERIODS.find((item) => item.key === periodKey) || LIFE_PERIODS[2];
  const maxAgeFromCanon = Number.isFinite(canon?.age) ? canon.age + 2 : 60;
  const minAge = Math.max(8, period.minAge);
  const maxAge = Math.min(maxAgeFromCanon, period.maxAge);

  if (maxAge < minAge) {
    return randomInt(rng, 8, Math.max(18, maxAgeFromCanon));
  }
  return randomInt(rng, minAge, maxAge);
}

function buildCanonProfileFacts(canon) {
  const person = canon?.person_raw || {};
  const city = safeString(canon?.current_location?.city || person?.city).trim();
  const relationshipStatus = safeString(canon?.relationship_status).trim();
  const facts = [];

  const educationYear = parseYear(person?.education?.graduation_year);
  const educationDegree = safeString(person?.education?.degree).trim();
  const educationSpec = safeString(person?.education?.specialization).trim();
  if (Number.isFinite(educationYear)) {
    const educationDetail = educationSpec
      ? `по специальности «${educationSpec}»`
      : 'по базовой программе';
    const degreeLabel = educationDegree ? `квалификацию «${educationDegree}»` : 'диплом';
    facts.push({
      sphere: 'education',
      year: educationYear,
      age: null,
      action: `получила ${degreeLabel} ${educationDetail}`,
      tone: 1,
      trait_tags: ['discipline', 'achievement_drive'],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: false
    });
  }

  const relocationYear = parseYear(canon?.current_location?.since);
  if (Number.isFinite(relocationYear) && city) {
    facts.push({
      sphere: 'social',
      year: relocationYear,
      age: null,
      action: `переехала в город ${city}`,
      tone: 0,
      trait_tags: ['openness_to_change', 'social_connection'],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: false
    });
  }

  const jobSince = parseYear(person?.job?.since);
  const jobTitle = safeString(person?.job?.title).trim();
  const jobCompany = safeString(person?.job?.company).trim();
  if (Number.isFinite(jobSince) && jobTitle) {
    const companyPart = jobCompany ? ` в ${jobCompany}` : '';
    facts.push({
      sphere: 'career',
      year: jobSince,
      age: null,
      action: `приняла позицию «${jobTitle}»${companyPart}`,
      tone: 1,
      trait_tags: ['responsibility', 'achievement_drive'],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: false
    });
  }

  if (relationshipStatus) {
    facts.push({
      sphere: 'relationships',
      year: Number.isFinite(canon?.current_year) ? canon.current_year - 1 : null,
      age: null,
      action: `обозначила формат отношений как «${relationshipStatus}»`,
      tone: 0,
      trait_tags: ['partner_seek_drive', 'empathy'],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: false
    });
  }

  const childrenCount = Number(canon?.children_count);
  if (Number.isFinite(childrenCount) && childrenCount > 0) {
    const childrenLabel = childrenCount === 1 ? 'ребенка' : 'детей';
    facts.push({
      sphere: 'family',
      year: Number.isFinite(canon?.current_year) ? canon.current_year - 2 : null,
      age: null,
      action: `зафиксировала недельный график семьи вокруг ${childrenCount} ${childrenLabel}`,
      tone: 0,
      trait_tags: ['responsibility', 'empathy'],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: false
    });
  }

  return facts;
}

function buildCanonTraitFacts(canon, rng) {
  const result = [];
  const seen = new Set();
  const selectedTraits = [...(canon?.top_traits || []), ...(canon?.vulnerable_traits || [])];

  for (let index = 0; index < selectedTraits.length; index += 1) {
    const trait = selectedTraits[index];
    if (!trait?.key || seen.has(trait.key)) {
      continue;
    }
    seen.add(trait.key);

    const template = TRAIT_CANON_TEMPLATES[trait.key];
    if (!template) {
      continue;
    }

    const value = Number(trait.value);
    const highSignal = Number.isFinite(value) && value >= 6;
    const actionPool = highSignal ? template.high : template.low;
    const action = randomItem(rng, actionPool, actionPool[0]);
    const yearOffset = 1 + index * 2 + randomInt(rng, 0, 1);
    const year = Number.isFinite(canon?.current_year) ? canon.current_year - yearOffset : null;
    const baseTags = SPHERE_TO_TRAITS[template.sphere] || ['responsibility'];

    result.push({
      sphere: template.sphere,
      year,
      age: null,
      action,
      tone: highSignal ? 1 : -1,
      trait_tags: [...new Set([trait.key, ...baseTags.slice(0, 2)])],
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.canon,
      hook_candidate: template.sphere === 'crisis' || template.sphere === 'mission'
    });
  }

  return result;
}

function buildCanonFacts(stage0, rng) {
  const canon = stage0?.canon || {};
  return [...buildCanonProfileFacts(canon), ...buildCanonTraitFacts(canon, rng)];
}

function sphereActionPool(sphere, canon, sourceType = FACT_SOURCE_TYPES.periodLogic) {
  const city = safeString(canon?.current_location?.city || canon?.birth_place || 'городе').trim() || 'городе';
  const anchorPool = {
    childhood: ['сменила школу после переезда', 'подала заявление на перевод в другой класс'],
    family: ['съехала из родительского дома', 'прервала регулярное общение с родственником после конфликта'],
    education: ['пересдала ключевой экзамен на повторной сессии', 'перевелась на прикладное направление обучения'],
    career: ['закрыла проект с просроченным бюджетом', 'приняла ответственность за кризисный релиз'],
    finance: ['реструктурировала личные долги', 'открыла отдельный счет финансовой подушки'],
    relationships: ['завершила отношения после нарушения договоренностей', 'ввела правило еженедельного разговора о конфликте'],
    sexuality: ['обозначила границы близости в диалоге с партнером', 'отказалась от небезопасного сценария интимности'],
    health: ['прошла операцию по медицинским показаниям', 'завершила курс реабилитации после травмы'],
    habits: ['прекратила ночной рабочий режим', 'убрала ежедневное переутомление из графика'],
    social: ['вышла из токсичного окружения', `вступила в профессиональное сообщество в ${city}`],
    values: ['отказалась от решения против личных ценностей', 'зафиксировала личные правила сложных решений'],
    crisis: ['пережила период без дохода без новых долгов', 'закрыла судебный спор мировым соглашением'],
    mission: ['сформулировала долгий вектор профессиональной миссии', 'приняла решение развивать экспертность в одной нише'],
    future: ['собрала дорожную карту на три года', 'выделила резерв под план переезда']
  };
  const periodLogicPool = {
    childhood: ['начала заниматься в секции по устойчивому расписанию', 'взяла на себя домашние обязанности по графику'],
    family: ['установила отдельный день для семейных задач', 'закрепила бюджетные правила внутри семьи'],
    education: ['закрыла модульный курс с итоговой аттестацией', 'сдала профильный экзамен без пересдачи'],
    career: ['вела еженедельный трек задач в проекте', 'закрыла квартальный план по рабочим метрикам'],
    finance: ['зафиксировала лимит необязательных расходов', 'настроила автопополнение сберегательного счета'],
    relationships: ['обсудила ожидания от отношений в структурном разговоре', 'перешла на регулярные ретроспективы в паре'],
    sexuality: ['проговорила комфортный темп близости в отношениях', 'обновила личные правила безопасности в близости'],
    health: ['прошла плановый осмотр у профильного врача', 'добавила регулярную физическую нагрузку три раза в неделю'],
    habits: ['ввела фиксированное время сна по будням', 'закрепила утренний ритуал подготовки к дню'],
    social: ['расширила круг профессиональных контактов на новом рынке', 'завела рабочие связи через отраслевое событие'],
    values: ['сверила рабочие цели с личными ценностями', 'пересмотрела приоритеты после внутреннего конфликта'],
    crisis: ['перекрыла кассовый разрыв за счет резервного фонда', 'перестроила режим после периода выгорания'],
    mission: ['обновила долгосрочную цель через годовой план', 'связала карьерный выбор с личной миссией'],
    future: ['собрала сценарный план на случай смены работы', 'пересчитала риски по плану переезда']
  };

  if (sourceType === FACT_SOURCE_TYPES.anchor) {
    return anchorPool[sphere] || anchorPool.career;
  }
  return periodLogicPool[sphere] || periodLogicPool.career;
}

function buildFactText({ year, age, action, sourceTag }) {
  const timePart = Number.isFinite(year) ? `В ${year} году` : Number.isFinite(age) ? `В ${age} лет` : 'В этот период';
  return ensurePeriod(`${timePart} я ${action}; источник: ${sourceTag}`);
}

function pickFactTraits(sphere, rng) {
  const base = SPHERE_TO_TRAITS[sphere] || ['responsibility', 'confidence'];
  const first = randomItem(rng, base, base[0]);
  const second = randomItem(rng, base, base[0]);
  return [...new Set([first, second])];
}

function buildCoverageBySphere(facts) {
  const coverage = {};
  for (const sphere of LIFE_SPHERES.map((item) => item.key)) {
    coverage[sphere] = facts.filter((fact) => fact.sphere === sphere).length;
  }
  return coverage;
}

function generateFactBank(stage0, stage1, options = {}) {
  const canon = stage0.canon;
  const extensionPackages = resolveFactExtensionPackages(options);
  const targetCount = FACT_LIMITS.base + extensionPackages * FACT_LIMITS.extensionPackage;
  const variationSeed = resolveVariationSeed(options);
  const rng = makeRng(`${variationSeed}:fact_bank:${canon.name}`);
  const facts = [];
  const seenTexts = new Set();

  const registerFact = (candidate) => {
    const sphere = safeString(candidate?.sphere).trim() || 'career';
    const action = safeString(candidate?.action).trim();
    if (!action) {
      return false;
    }

    const timeline = normalizeFactTimeline({
      canon,
      year: candidate?.year,
      age: candidate?.age
    });
    const sourceType = safeString(candidate?.source_type).trim() || FACT_SOURCE_TYPES.periodLogic;
    const text = buildFactText({
      year: timeline.year,
      age: timeline.age,
      action,
      sourceTag: sourceType
    });
    const fingerprint = normalizeText(text);
    if (!fingerprint || seenTexts.has(fingerprint)) {
      return false;
    }

    seenTexts.add(fingerprint);
    facts.push({
      sphere,
      year: timeline.year,
      age: timeline.age,
      text,
      source_anchor_id: candidate?.source_anchor_id || null,
      source_type: sourceType,
      tone: Number.isFinite(candidate?.tone) ? candidate.tone : 0,
      trait_tags: Array.isArray(candidate?.trait_tags) && candidate.trait_tags.length > 0 ? candidate.trait_tags : pickFactTraits(sphere, rng),
      hook_candidate: Boolean(candidate?.hook_candidate)
    });
    return true;
  };

  for (const anchor of stage1.anchors_timeline || []) {
    for (let step = 0; step < 6; step += 1) {
      const action = randomItem(rng, sphereActionPool(anchor.sphere, canon, FACT_SOURCE_TYPES.anchor));
      const year = Number.isFinite(anchor.year) ? anchor.year + randomInt(rng, 0, 1) : null;
      const age = Number.isFinite(anchor.age) ? anchor.age + randomInt(rng, 0, 1) : null;
      registerFact({
        sphere: anchor.sphere,
        year,
        age,
        action,
        source_anchor_id: anchor.id,
        source_type: FACT_SOURCE_TYPES.anchor,
        tone: anchor.tone,
        trait_tags: pickFactTraits(anchor.sphere, rng),
        hook_candidate: Boolean(anchor.hook_potential && randomInt(rng, 0, 1) === 1)
      });
    }
  }

  for (const canonFact of buildCanonFacts(stage0, rng)) {
    registerFact(canonFact);
  }

  const coverage = buildCoverageBySphere(facts);
  const periodCoverage = buildCoverageByPeriod(facts, canon);
  const generationLimit = Math.max(targetCount * 20, 1200);
  let guard = 0;

  while (facts.length < targetCount && guard < generationLimit) {
    guard += 1;
    const weakestSphere = pickWeakestCoverageKey(coverage, 'career');
    const weakestPeriod = pickWeakestCoverageKey(periodCoverage, LIFE_PERIODS[2].key);
    const age = pickAgeForLifePeriod(weakestPeriod, canon, rng);
    const year = Number.isFinite(canon.birth_year) ? canon.birth_year + age : null;
    const action = randomItem(rng, sphereActionPool(weakestSphere, canon, FACT_SOURCE_TYPES.periodLogic));
    const tone = ['crisis', 'health'].includes(weakestSphere) ? -1 : randomItem(rng, [-1, 0, 1]);
    const added = registerFact({
      sphere: weakestSphere,
      year,
      age,
      action,
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.periodLogic,
      tone,
      trait_tags: pickFactTraits(weakestSphere, rng),
      hook_candidate: weakestSphere === 'crisis' || randomInt(rng, 0, 10) === 0
    });
    if (added) {
      coverage[weakestSphere] = (coverage[weakestSphere] || 0) + 1;
      const resolvedPeriod = pickLifePeriodByAge(age);
      if (resolvedPeriod) {
        periodCoverage[resolvedPeriod] = (periodCoverage[resolvedPeriod] || 0) + 1;
      }
    }
  }

  while (facts.length < targetCount) {
    const fallbackSphere = LIFE_SPHERES[facts.length % LIFE_SPHERES.length]?.key || 'career';
    const fallbackAge = Number.isFinite(canon.age)
      ? clampInt(canon.age - 12 + (facts.length % 12), 8, canon.age + 2)
      : 18 + (facts.length % 24);
    const fallbackYear = Number.isFinite(canon.birth_year) ? canon.birth_year + fallbackAge : null;
    const fallbackAction = `зафиксировала промежуточный шаг в сфере «${fallbackSphere}» №${facts.length + 1}`;
    const added = registerFact({
      sphere: fallbackSphere,
      year: fallbackYear,
      age: fallbackAge,
      action: fallbackAction,
      source_anchor_id: null,
      source_type: FACT_SOURCE_TYPES.periodLogic,
      tone: 0,
      trait_tags: pickFactTraits(fallbackSphere, rng),
      hook_candidate: false
    });
    if (!added) {
      break;
    }
  }

  const hookTarget = clampInt(Math.round(targetCount * 0.14), FACT_LIMITS.hooksMin, FACT_LIMITS.hooksMax);
  const scored = facts
    .map((fact, index) => ({ index, score: (fact.hook_candidate ? 3 : 0) + (Math.abs(fact.tone) === 1 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const hookIndexes = new Set(scored.slice(0, hookTarget).map((item) => item.index));

  const requiredHookSpheres = ['career', 'relationships', 'sexuality', 'crisis', 'values', 'mission'];
  for (const sphere of requiredHookSpheres) {
    const alreadyExists = [...hookIndexes].some((index) => facts[index]?.sphere === sphere);
    if (alreadyExists) {
      continue;
    }

    const fallbackIndex = facts.findIndex((fact) => fact.sphere === sphere);
    if (fallbackIndex >= 0) {
      hookIndexes.add(fallbackIndex);
    }
  }

  const factBank = [];
  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index];
    factBank.push({
      id: `fact_${String(factBank.length + 1).padStart(4, '0')}`,
      text: fact.text,
      sphere: fact.sphere,
      year: Number.isFinite(fact.year) ? fact.year : null,
      age: Number.isFinite(fact.age) ? fact.age : null,
      source_anchor_id: fact.source_anchor_id,
      source_type: fact.source_type,
      tone: fact.tone,
      hook: hookIndexes.has(index),
      hook_reason: hookIndexes.has(index) ? 'выразительный факт с заметным последствием' : null,
      trait_tags: fact.trait_tags
    });

    if (factBank.length >= targetCount) {
      break;
    }
  }

  const finalCoverage = buildCoverageBySphere(factBank);
  const finalPeriodCoverage = buildCoverageByPeriod(factBank, canon);
  const sourceDistribution = factBank.reduce(
    (acc, fact) => {
      const sourceType = safeString(fact.source_type).trim() || FACT_SOURCE_TYPES.periodLogic;
      acc[sourceType] = (acc[sourceType] || 0) + 1;
      return acc;
    },
    {
      [FACT_SOURCE_TYPES.anchor]: 0,
      [FACT_SOURCE_TYPES.canon]: 0,
      [FACT_SOURCE_TYPES.periodLogic]: 0
    }
  );

  return {
    fact_bank: factBank,
    fact_bank_report: {
      total_facts: factBank.length,
      target_facts: targetCount,
      extension_packages: extensionPackages,
      hooks_total: factBank.filter((item) => item.hook).length,
      hooks_target: hookTarget,
      source_distribution: sourceDistribution,
      coverage_by_sphere: finalCoverage,
      coverage_by_period: finalPeriodCoverage,
      weak_spheres: Object.entries(finalCoverage).filter(([, count]) => count < 8).map(([key]) => key),
      weak_periods: Object.entries(finalPeriodCoverage).filter(([, count]) => count < 10).map(([key]) => key),
      generated_at: new Date().toISOString(),
      variation_seed: variationSeed
    }
  };
}

function buildParagraphFromFacts(facts, blockLabel) {
  if (!Array.isArray(facts) || facts.length === 0) {
    return `Я пока не накопила достаточно подтвержденных фактов для блока «${blockLabel}».`;
  }

  const lines = facts.map((fact) => ensurePeriod(safeString(fact.text).replace(/;\s*источник:\s*[a-z_]+\s*\.?$/i, '')));
  lines.push(ensurePeriod(`Это сформировало мой способ действий в сфере «${blockLabel.toLowerCase()}»`));
  return lines.join(' ');
}

function generateBlocks(stage0, stage1, stage2, options = {}) {
  const variationSeed = resolveVariationSeed(options);
  const rng = makeRng(`${variationSeed}:blocks:${stage0.canon.name}`);
  const legendBlocks = {};
  const blocksMeta = {};

  for (const block of LEGEND_BLOCKS) {
    const sourceFacts = (stage2.fact_bank || []).filter((fact) => block.spheres.includes(fact.sphere));
    const ordered = sourceFacts
      .slice()
      .sort((a, b) => (Number.isFinite(a.year) ? a.year : 9999) - (Number.isFinite(b.year) ? b.year : 9999));
    const selected = ordered.slice(0, randomInt(rng, 10, 16));

    if (block.requiresHook && selected.length > 0 && selected.every((fact) => !fact.hook)) {
      const hookFact = ordered.find((fact) => fact.hook);
      if (hookFact) {
        selected[selected.length - 1] = hookFact;
      }
    }

    const paragraphs = [];
    for (let i = 0; i < selected.length; i += 4) {
      paragraphs.push(buildParagraphFromFacts(selected.slice(i, i + 4), block.label));
    }

    legendBlocks[block.key] = paragraphs.join('\n\n');
    blocksMeta[block.key] = {
      facts_used: selected.length,
      hooks_used: selected.filter((fact) => fact.hook).length,
      fact_ids: selected.map((fact) => fact.id)
    };
  }

  return {
    legend_blocks: legendBlocks,
    legend_v1_final_json: deepClone(legendBlocks),
    blocks_report: {
      block_count: LEGEND_BLOCKS.length,
      key_blocks_without_hooks: LEGEND_BLOCKS.filter((block) => block.requiresHook)
        .filter((block) => Number(blocksMeta[block.key]?.hooks_used || 0) < 1)
        .map((block) => block.key),
      blocks_meta: blocksMeta,
      generated_at: new Date().toISOString(),
      variation_seed: variationSeed
    }
  };
}
function checkCanonConsistency(stage0, stage2, stage3) {
  const issues = [];
  const canon = stage0.canon;

  if (Number.isFinite(canon.birth_year) && Number.isFinite(canon.age)) {
    const expectedAge = canon.current_year - canon.birth_year;
    if (Math.abs(expectedAge - canon.age) > 1) {
      issues.push(`Возраст canon.age (${canon.age}) не совпадает с birth_year (${canon.birth_year}).`);
    }
  }

  for (const fact of stage2.fact_bank || []) {
    if (Number.isFinite(canon.birth_year) && Number.isFinite(fact.year) && fact.year < canon.birth_year + 5) {
      issues.push(`Факт ${fact.id} уходит в слишком ранний год (${fact.year}).`);
    }

    if (Number.isFinite(canon.current_year) && Number.isFinite(fact.year) && fact.year > canon.current_year + 5) {
      issues.push(`Факт ${fact.id} уходит слишком далеко в будущее (${fact.year}).`);
    }
  }

  if (Number(canon.children_count) > 0) {
    const familyText = normalizeText(stage3.legend_blocks?.family || '');
    if (!familyText.includes('реб')) {
      issues.push('В canon есть дети, но блок семьи это не отражает.');
    }
  }

  return { passed: issues.length === 0, issues };
}

function checkTimelineConsistency(stage0, stage1) {
  const issues = [];
  const canon = stage0.canon;

  for (const anchor of stage1.anchors_timeline || []) {
    if (!Number.isFinite(anchor.age) || !Number.isFinite(anchor.year) || !Number.isFinite(canon.birth_year)) {
      continue;
    }

    const computed = anchor.year - canon.birth_year;
    if (Math.abs(computed - anchor.age) > 1) {
      issues.push(`Якорь ${anchor.id} конфликтует по year/age.`);
    }
  }

  return { passed: issues.length === 0, issues };
}

function checkCrossBlockConsistency(stage2, stage3) {
  const issues = [];
  const seenTexts = new Map();
  let duplicatesCount = 0;

  for (const fact of stage2.fact_bank || []) {
    const fingerprint = normalizeText(fact.text);
    if (!fingerprint) {
      continue;
    }

    if (seenTexts.has(fingerprint)) {
      duplicatesCount += 1;
    } else {
      seenTexts.set(fingerprint, fact.id);
    }
  }

  const factUsage = new Map();
  const meta = stage3.blocks_report?.blocks_meta || {};
  for (const [blockKey, blockMeta] of Object.entries(meta)) {
    for (const factId of blockMeta.fact_ids || []) {
      const list = factUsage.get(factId) || [];
      list.push(blockKey);
      factUsage.set(factId, list);
    }
  }

  for (const [factId, blocks] of factUsage.entries()) {
    if (blocks.length > 3) {
      issues.push(`Факт ${factId} слишком часто повторяется в блоках: ${blocks.join(', ')}`);
    }
  }

  const duplicatesLimit = Math.max(12, Math.round((stage2.fact_bank || []).length * 0.08));
  if (duplicatesCount > duplicatesLimit) {
    issues.push(`В банке фактов слишком много дублей: ${duplicatesCount} (лимит ${duplicatesLimit}).`);
  }

  return { passed: issues.length === 0, issues };
}

function checkTraitManifestation(stage0, stage2) {
  const issues = [];
  const counts = {};
  for (const criterion of PERSONALITY_CRITERIA) {
    counts[criterion.key] = 0;
  }

  for (const fact of stage2.fact_bank || []) {
    for (const tag of fact.trait_tags || []) {
      if (counts[tag] !== undefined) {
        counts[tag] += 1;
      }
    }
  }

  const ranked = rankTraits(stage0.canon.personality_profile);
  const target = [...ranked.slice(0, 3), ...ranked.slice(-3)];
  for (const trait of target) {
    const required = trait.value >= 8 || trait.value <= 3 ? 6 : 4;
    if ((counts[trait.key] || 0) < required) {
      issues.push(`Шкала ${trait.label} (${trait.value}/10) слабо проявлена.`);
    }
  }

  return { passed: issues.length === 0, issues };
}

function checkDramaBalance(stage2) {
  const facts = stage2.fact_bank || [];
  const total = Math.max(1, facts.length);
  const negativeRatio = facts.filter((fact) => fact.tone < 0).length / total;
  const positiveRatio = facts.filter((fact) => fact.tone > 0).length / total;
  const issues = [];

  if (negativeRatio > 0.65) {
    issues.push('Слишком много трагедий, есть риск сериализации.');
  }
  if (negativeRatio < 0.2) {
    issues.push('Слишком мало кризисов, легенда может быть плоской.');
  }
  if (positiveRatio < 0.15) {
    issues.push('Слишком мало достижений и сильных разворотов.');
  }

  return { passed: issues.length === 0, issues };
}

function checkHookDistribution(stage2, stage3) {
  const issues = [];
  const hooksTotal = (stage2.fact_bank || []).filter((fact) => fact.hook).length;
  if (hooksTotal < FACT_LIMITS.hooksMin || hooksTotal > FACT_LIMITS.hooksMax) {
    issues.push(`Количество хуков ${hooksTotal} вне диапазона ${FACT_LIMITS.hooksMin}-${FACT_LIMITS.hooksMax}.`);
  }

  for (const block of LEGEND_BLOCKS.filter((item) => item.requiresHook)) {
    if (Number(stage3.blocks_report?.blocks_meta?.[block.key]?.hooks_used || 0) < 1) {
      issues.push(`В ключевом блоке ${block.key} нет выразительного факта.`);
    }
  }

  return { passed: issues.length === 0, issues };
}

function checkAntiTemplate(stage3) {
  const allText = LEGEND_BLOCKS.map((block) => safeString(stage3.legend_blocks?.[block.key])).join(' ');
  const ngrams = generateNgrams(allText, 4);
  const map = new Map();
  for (const ngram of ngrams) {
    map.set(ngram, (map.get(ngram) || 0) + 1);
  }

  const duplicateMass = [...map.values()].filter((item) => item > 1).reduce((sum, item) => sum + (item - 1), 0);
  const ratio = ngrams.length > 0 ? duplicateMass / ngrams.length : 0;
  const hits = TEMPLATE_MARKERS.filter((marker) => normalizeText(allText).includes(normalizeText(marker)));

  const issues = [];
  if (ratio > 0.85) {
    issues.push('Высокая повторяемость фраз.');
  }
  if (hits.length > 0) {
    issues.push(`Обнаружены шаблонные связки: ${hits.join(', ')}`);
  }

  return { passed: issues.length === 0, issues };
}

function checkStylisticRules(stage3) {
  const merged = LEGEND_BLOCKS.map((block) => safeString(stage3.legend_blocks?.[block.key])).join('\n\n');
  const paragraphs = merged
    .split(/\n\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const firstPersonRatio = paragraphs.length > 0 ? paragraphs.filter((item) => /я/i.test(item)).length / paragraphs.length : 0;
  const issues = [];

  if (firstPersonRatio < 0.8) {
    issues.push('Недостаточно первого лица.');
  }

  return { passed: issues.length === 0, issues };
}

function buildStage4Qc(stage0, stage1, stage2, stage3) {
  const checks = [
    { key: 'canon_consistency', title: 'Соответствие Canon', ...checkCanonConsistency(stage0, stage2, stage3) },
    { key: 'timeline_consistency', title: 'Логика таймлайна', ...checkTimelineConsistency(stage0, stage1, stage2) },
    { key: 'cross_block_consistency', title: 'Непротиворечивость блоков', ...checkCrossBlockConsistency(stage2, stage3) },
    { key: 'trait_manifestation', title: 'Проявление личностных шкал', ...checkTraitManifestation(stage0, stage2) },
    { key: 'drama_balance', title: 'Баланс драматургии', ...checkDramaBalance(stage2) },
    { key: 'hook_distribution', title: 'Распределение хуков', ...checkHookDistribution(stage2, stage3) },
    { key: 'anti_template', title: 'Проверка шаблонности', ...checkAntiTemplate(stage3) },
    { key: 'stylistic_rules', title: 'Проверка стилистики', ...checkStylisticRules(stage3) }
  ];

  const passedChecks = checks.filter((item) => item.passed).length;
  return {
    qc_report: {
      checks,
      summary: {
        passed_checks: passedChecks,
        total_checks: checks.length,
        ready: passedChecks === checks.length
      },
      generated_at: new Date().toISOString()
    }
  };
}

function buildPipelineState({ stage0, stagePrompts, stage1, stage2, stage3, stage4, meta = {} }) {
  return {
    seed_profile: deepClone(stage0.seed_profile),
    canon: deepClone(stage0.canon),
    stage_prompts: deepClone(stagePrompts),
    anchors_timeline: deepClone(stage1.anchors_timeline),
    anchors_report: deepClone(stage1.anchors_report),
    fact_bank: deepClone(stage2.fact_bank),
    fact_bank_report: deepClone(stage2.fact_bank_report),
    legend_blocks: deepClone(stage3.legend_blocks),
    legend_full_text: safeString(stage3.legend_full_text).trim(),
    legend_v1_final_json: deepClone(stage3.legend_v1_final_json),
    blocks_report: deepClone(stage3.blocks_report),
    qc_report: deepClone(stage4.qc_report),
    pipeline_meta: {
      version: 'legend_tu_v2',
      stage_order: STAGE_ORDER,
      generated_at: new Date().toISOString(),
      ...meta
    }
  };
}
function runPipelineFromInput(input, options = {}) {
  const stagePrompts = normalizeStagePrompts(options.stage_prompts || options.stagePrompts);
  const variationSeed = resolveVariationSeed(options);
  const stage0 = buildStage0Input(input, options);
  const stage1 = buildStage1Anchors(stage0, { ...options, variation_seed: variationSeed });
  const stage2 = generateFactBank(stage0, stage1, { ...options, variation_seed: variationSeed });
  const stage3 = generateBlocks(stage0, stage1, stage2, { ...options, variation_seed: variationSeed });
  const stage4 = buildStage4Qc(stage0, stage1, stage2, stage3);

  return buildPipelineState({
    stage0,
    stagePrompts,
    stage1,
    stage2,
    stage3,
    stage4,
    meta: {
      variation_seed: variationSeed,
      fact_extension_packages: resolveFactExtensionPackages(options),
      stage_prompt_keys: Object.keys(stagePrompts)
    }
  });
}

function generateLegendPipeline(input, options = {}) {
  return runPipelineFromInput(input, options);
}

function buildStateFromPipelineState(pipelineState) {
  const state = deepClone(pipelineState || {});
  return {
    stage0: { seed_profile: deepClone(state.seed_profile || {}), canon: deepClone(state.canon || {}) },
    stage1: { anchors_timeline: deepClone(state.anchors_timeline || []), anchors_report: deepClone(state.anchors_report || {}) },
    stage2: { fact_bank: deepClone(state.fact_bank || []), fact_bank_report: deepClone(state.fact_bank_report || {}) },
    stage3: {
      legend_blocks: deepClone(state.legend_blocks || state.legend_v1_final_json || {}),
      legend_full_text: safeString(state.legend_full_text).trim(),
      legend_v1_final_json: deepClone(state.legend_v1_final_json || state.legend_blocks || {}),
      blocks_report: deepClone(state.blocks_report || {})
    },
    stage4: { qc_report: deepClone(state.qc_report || {}) },
    stagePrompts: normalizeStagePrompts(state.stage_prompts || {}),
    meta: deepClone(state.pipeline_meta || {})
  };
}

function regenerateLegendStage({ pipelineState, stageKey, options = {} }) {
  const normalizedStage = safeString(stageKey).trim().toLowerCase();
  if (!REGENERATABLE_STAGES.has(normalizedStage)) {
    throw new Error(`Unknown stage key for regeneration: ${normalizedStage}`);
  }

  if (!pipelineState || typeof pipelineState !== 'object') {
    throw new Error('pipeline_state is required for stage regeneration');
  }

  const variationSeed = resolveVariationSeed(options, pipelineState);
  const extensionPackages = resolveFactExtensionPackages(options, pipelineState);
  const parsed = buildStateFromPipelineState(pipelineState);
  const stagePrompts = normalizeStagePrompts(options.stage_prompts || parsed.stagePrompts);

  const stage0 = parsed.stage0;
  let stage1 = parsed.stage1;
  let stage2 = parsed.stage2;
  let stage3 = parsed.stage3;

  if (normalizedStage === 'stage_1_anchors') {
    stage1 = buildStage1Anchors(stage0, { variation_seed: variationSeed, stage_prompts: stagePrompts });
  }

  if (normalizedStage === 'stage_1_anchors' || normalizedStage === 'stage_2_fact_bank') {
    if (!Array.isArray(stage1.anchors_timeline) || stage1.anchors_timeline.length === 0) {
      stage1 = buildStage1Anchors(stage0, { variation_seed: variationSeed, stage_prompts: stagePrompts });
    }
    stage2 = generateFactBank(stage0, stage1, {
      variation_seed: variationSeed,
      fact_extension_packages: extensionPackages,
      stage_prompts: stagePrompts
    });
  }

  if (normalizedStage === 'stage_1_anchors' || normalizedStage === 'stage_2_fact_bank' || normalizedStage === 'stage_3_blocks') {
    if (!Array.isArray(stage2.fact_bank) || stage2.fact_bank.length === 0) {
      stage2 = generateFactBank(stage0, stage1, {
        variation_seed: variationSeed,
        fact_extension_packages: extensionPackages,
        stage_prompts: stagePrompts
      });
    }
    stage3 = generateBlocks(stage0, stage1, stage2, { variation_seed: variationSeed, stage_prompts: stagePrompts });
  }

  const stage4 = buildStage4Qc(stage0, stage1, stage2, stage3);
  return buildPipelineState({
    stage0,
    stagePrompts,
    stage1,
    stage2,
    stage3,
    stage4,
    meta: {
      ...parsed.meta,
      variation_seed: variationSeed,
      fact_extension_packages: extensionPackages,
      stage_prompt_keys: Object.keys(stagePrompts),
      last_regenerated_stage: normalizedStage,
      last_regenerated_at: new Date().toISOString()
    }
  });
}

function regenerateLegendBlock({ pipelineState, blockKey, options = {} }) {
  const normalizedBlockKey = safeString(blockKey).trim();
  if (!LEGEND_BLOCKS.some((item) => item.key === normalizedBlockKey)) {
    throw new Error(`Unknown block key for regeneration: ${normalizedBlockKey}`);
  }

  if (!pipelineState || typeof pipelineState !== 'object') {
    throw new Error('pipeline_state is required for block regeneration');
  }

  const variationSeed = resolveVariationSeed(options, pipelineState);
  const parsed = buildStateFromPipelineState(pipelineState);
  const rebuilt = generateBlocks(parsed.stage0, parsed.stage1, parsed.stage2, {
    variation_seed: variationSeed,
    stage_prompts: parsed.stagePrompts
  });

  parsed.stage3.legend_blocks[normalizedBlockKey] = rebuilt.legend_blocks[normalizedBlockKey];
  parsed.stage3.legend_v1_final_json = deepClone(parsed.stage3.legend_blocks);
  parsed.stage3.blocks_report.blocks_meta = {
    ...(parsed.stage3.blocks_report.blocks_meta || {}),
    [normalizedBlockKey]: deepClone(rebuilt.blocks_report.blocks_meta?.[normalizedBlockKey] || {})
  };

  const stage4 = buildStage4Qc(parsed.stage0, parsed.stage1, parsed.stage2, parsed.stage3);
  return buildPipelineState({
    stage0: parsed.stage0,
    stagePrompts: parsed.stagePrompts,
    stage1: parsed.stage1,
    stage2: parsed.stage2,
    stage3: parsed.stage3,
    stage4,
    meta: {
      ...parsed.meta,
      variation_seed: variationSeed,
      last_regenerated_block: normalizedBlockKey,
      last_regenerated_at: new Date().toISOString()
    }
  });
}

function buildShortSummary(pipelineState) {
  const canon = pipelineState.canon || {};
  const traits = (canon.top_traits || []).slice(0, 3).map((trait) => `${trait.label.toLowerCase()} ${trait.value}/10`);
  const ageLabel = Number.isFinite(canon.age) ? `${canon.age} лет` : 'возраст не зафиксирован';
  const city = safeString(canon.current_location?.city || canon.birth_place || 'география не зафиксирована').trim();

  return [
    `${canon.name || 'Персонаж'}, ${ageLabel}, текущий контекст: ${city}.`,
    traits.length > 0 ? `Доминирующие линии поведения: ${traits.join(', ')}.` : '',
    'Легенда собрана по этапам canon → anchors → fact bank → blocks → QC.'
  ]
    .filter(Boolean)
    .join(' ');
}

function buildLifeStory(legendBlocks) {
  return LEGEND_BLOCKS.map((block) => `### ${block.label}\n${safeString(legendBlocks?.[block.key])}`).join('\n\n');
}

function toLegendResponseJson(pipelineState) {
  const legendBlocks = deepClone(pipelineState.legend_blocks || pipelineState.legend_v1_final_json || {});
  const legendFullText = safeString(pipelineState.legend_full_text).trim();

  return {
    short_summary: buildShortSummary(pipelineState),
    life_story: legendFullText || buildLifeStory(legendBlocks),
    legend: deepClone(legendBlocks),
    legend_blocks: legendBlocks,
    legend_full_text: legendFullText,
    legend_v1_final_json: deepClone(legendBlocks),
    anchors: deepClone(pipelineState.anchors_timeline || []),
    fact_bank_stats: deepClone(pipelineState.fact_bank_report || {}),
    blocks_report: deepClone(pipelineState.blocks_report || {}),
    qc_report: deepClone(pipelineState.qc_report || {}),
    pipeline_state: deepClone(pipelineState)
  };
}

function buildCanonTextClues(personInput = {}) {
  const person = personInput && typeof personInput === 'object' && !Array.isArray(personInput) ? personInput : {};
  const clues = [];

  function push(path, value) {
    const text = safeString(value).trim();
    if (!text) {
      return;
    }
    clues.push({
      path,
      text,
      normalized: normalizeText(text)
    });
  }

  for (const item of Array.isArray(person.character_traits) ? person.character_traits : []) {
    push('character_traits', item);
  }
  for (const item of Array.isArray(person.core_values) ? person.core_values : []) {
    push('core_values', item);
  }
  for (const item of Array.isArray(person.bad_habits) ? person.bad_habits : []) {
    push('bad_habits', item);
  }

  push('first_impression', person.first_impression);
  push('temperament', person.temperament);
  push('distinctive_features', person.distinctive_features);
  push('dream', person.dream);
  push('core_fear', person.core_fear);
  push('relationship_status', person.relationship_status);
  push('job.title', person?.job?.title);
  push('job.duties', person?.job?.duties);
  push('job.income_level', person?.job?.income_level);
  push('life_plans.desired_changes', person?.life_plans?.desired_changes);
  push('life_plans.ideal_partner_traits', person?.life_plans?.ideal_partner_traits);

  return clues;
}

function previewCanonClue(text) {
  const trimmed = safeString(text).trim();
  if (trimmed.length <= 96) {
    return trimmed;
  }
  return `${trimmed.slice(0, 93).trimEnd()}...`;
}

function findCanonKeywordClue(clues, fieldPaths, keywords) {
  const normalizedKeywords = keywords.map((item) => normalizeText(item)).filter(Boolean);
  for (const clue of clues) {
    if (Array.isArray(fieldPaths) && fieldPaths.length > 0 && !fieldPaths.includes(clue.path)) {
      continue;
    }
    if (normalizedKeywords.some((keyword) => clue.normalized.includes(keyword))) {
      return clue;
    }
  }
  return null;
}

function buildCanonConflictResolution({ issue, traitKey, currentValue, suggestedValue, reason = '', sourceField = '' }) {
  const normalizedCurrent = clampInt(currentValue, 1, 10);
  const normalizedSuggested = clampInt(suggestedValue, 1, 10);
  if (normalizedCurrent === normalizedSuggested) {
    return null;
  }

  const trait = PERSONALITY_CRITERIA_BY_KEY[traitKey];
  const traitLabel = trait?.label || traitKey;
  const delta = normalizedSuggested - normalizedCurrent;
  const direction = delta > 0 ? 'increase' : 'decrease';

  return {
    issue,
    trait_key: traitKey,
    trait_label: traitLabel,
    current_value: normalizedCurrent,
    suggested_value: normalizedSuggested,
    delta,
    direction,
    action_label: `${delta > 0 ? 'Повысить' : 'Понизить'} «${traitLabel}» до ${normalizedSuggested}/10`,
    reason: safeString(reason).trim() || null,
    source_field: safeString(sourceField).trim() || null
  };
}

function validateCanonProfileConsistency(personInput, payloadProfile) {
  const person = personInput && typeof personInput === 'object' && !Array.isArray(personInput) ? personInput : {};
  const profile = normalizeProfile(payloadProfile || {});
  const clues = buildCanonTextClues(person);
  const issues = [];
  const issueResolutions = [];
  const seenMessages = new Set();
  const seenResolutionKeys = new Set();

  function pushIssue(message, resolution = null) {
    if (!message || seenMessages.has(message)) {
      return;
    }
    seenMessages.add(message);
    issues.push(message);
    if (!resolution) {
      return;
    }

    const resolutionKey = `${resolution.issue}::${resolution.trait_key}::${resolution.suggested_value}`;
    if (seenResolutionKeys.has(resolutionKey)) {
      return;
    }

    seenResolutionKeys.add(resolutionKey);
    issueResolutions.push(resolution);
  }

  for (const rule of CANON_PROFILE_KEYWORD_RULES) {
    const score = Number(profile[rule.traitKey]);
    const shouldCheck =
      (rule.direction === 'high' && Number.isFinite(score) && score <= rule.scoreThreshold) ||
      (rule.direction === 'low' && Number.isFinite(score) && score >= rule.scoreThreshold);

    if (!shouldCheck) {
      continue;
    }

    const match = findCanonKeywordClue(clues, rule.fieldPaths, rule.keywords);
    if (!match) {
      continue;
    }

    const traitLabel = PERSONALITY_CRITERIA_BY_KEY[rule.traitKey]?.label || rule.traitKey;
    const directionLabel = rule.direction === 'high' ? 'вверх' : 'вниз';
    const message = `Поле ${match.path} содержит «${previewCanonClue(match.text)}», что тянет шкалу «${traitLabel}» ${directionLabel}, но сейчас она = ${score}/10.`;
    pushIssue(
      message,
      buildCanonConflictResolution({
        issue: message,
        traitKey: rule.traitKey,
        currentValue: score,
        suggestedValue: rule.direction === 'high' ? rule.scoreThreshold + 1 : rule.scoreThreshold - 1,
        reason: `Сигнал найден в поле ${match.path}.`,
        sourceField: match.path
      })
    );
  }

  const jobTitle = normalizeText(person?.job?.title);
  const jobDuties = normalizeText(person?.job?.duties);
  const leadershipSignals = ['manager', 'менедж', 'руковод', 'lead', 'head', 'director', 'founder', 'ceo'];
  if (
    (leadershipSignals.some((signal) => jobTitle.includes(signal)) || leadershipSignals.some((signal) => jobDuties.includes(signal))) &&
    Number(profile.responsibility) <= 2
  ) {
    const message = `Поля job.title/job.duties указывают на управленческую или ведущую роль, но шкала «${PERSONALITY_CRITERIA_BY_KEY.responsibility.label}» = ${profile.responsibility}/10.`;
    pushIssue(
      message,
      buildCanonConflictResolution({
        issue: message,
        traitKey: 'responsibility',
        currentValue: profile.responsibility,
        suggestedValue: 4,
        reason: 'Роль в работе требует как минимум среднего уровня ответственности.',
        sourceField: 'job.title/job.duties'
      })
    );
  }

  const incomeLevel = normalizeText(person?.job?.income_level);
  if (
    ['выше среднего', 'высок', 'состоятель', 'обеспеч'].some((signal) => incomeLevel.includes(signal)) &&
    Number(profile.wealth) <= 2
  ) {
    const message = `Поле job.income_level = «${safeString(person?.job?.income_level).trim()}», но шкала «${PERSONALITY_CRITERIA_BY_KEY.wealth.label}» = ${profile.wealth}/10.`;
    pushIssue(
      message,
      buildCanonConflictResolution({
        issue: message,
        traitKey: 'wealth',
        currentValue: profile.wealth,
        suggestedValue: 4,
        reason: 'Уровень дохода в Canon требует хотя бы среднего финансового ресурса.',
        sourceField: 'job.income_level'
      })
    );
  }

  if (person?.sexual_preferences?.initiates_sex === true && Number(profile.sexual_expressiveness) <= 3) {
    const message = `Canon фиксирует sexual_preferences.initiates_sex=true, но шкала «${PERSONALITY_CRITERIA_BY_KEY.sexual_expressiveness.label}» = ${profile.sexual_expressiveness}/10.`;
    pushIssue(
      message,
      buildCanonConflictResolution({
        issue: message,
        traitKey: 'sexual_expressiveness',
        currentValue: profile.sexual_expressiveness,
        suggestedValue: 4,
        reason: 'Инициативность в близости требует хотя бы среднего уровня сексуальной выразительности.',
        sourceField: 'sexual_preferences.initiates_sex'
      })
    );
  }

  if (
    Array.isArray(person?.sexual_preferences?.fantasies) &&
    person.sexual_preferences.fantasies.length > 0 &&
    Number(profile.sexual_expressiveness) <= 2
  ) {
    const message = `В Canon заполнены sexual_preferences.fantasies, но шкала «${PERSONALITY_CRITERIA_BY_KEY.sexual_expressiveness.label}» = ${profile.sexual_expressiveness}/10.`;
    pushIssue(
      message,
      buildCanonConflictResolution({
        issue: message,
        traitKey: 'sexual_expressiveness',
        currentValue: profile.sexual_expressiveness,
        suggestedValue: 4,
        reason: 'Наличие фантазий в Canon тянет шкалу сексуальной выразительности вверх.',
        sourceField: 'sexual_preferences.fantasies'
      })
    );
  }

  return {
    passed: issues.length === 0,
    issues,
    issue_resolutions: issueResolutions
  };
}

function validateProfile(payloadProfile) {
  const profile = payloadProfile && typeof payloadProfile === 'object' ? payloadProfile : {};
  const errors = [];

  for (const criterion of PERSONALITY_CRITERIA) {
    const value = profile[criterion.key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      errors.push({ field: criterion.key, label: criterion.label, value });
    }
  }

  return errors;
}

module.exports = {
  generateLegendPipeline,
  regenerateLegendStage,
  regenerateLegendBlock,
  toLegendResponseJson,
  normalizeStagePrompts,
  validateProfile,
  validateCanonProfileConsistency,
  DEFAULT_PERSON_TEMPLATE,
  PERSONALITY_CRITERIA,
  STAGE_PROMPT_DEFAULTS,
  LEGEND_BLOCKS
};
// @ts-nocheck
