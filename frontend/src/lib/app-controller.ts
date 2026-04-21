export type CriterionDefinition = {
  key: string;
  label: string;
  minLabel: string;
  maxLabel: string;
};

export type AnchorItem = {
  id?: string;
  year?: number | null;
  month?: number | null;
  age?: number | null;
  sphere?: string;
  location?: string;
  event?: string;
  worldview_shift?: string;
  outcome?: string;
  hook?: boolean;
};

export type FactItem = {
  id?: string;
  text?: string;
  sphere?: string;
  year?: number | null;
  age?: number | null;
  hook?: boolean;
  source?: string | null;
  source_anchor_id?: string | null;
};

export type LegendBlock = {
  key: string;
  label: string;
  text: string;
  factsUsed: number;
  hooksUsed: number;
};

type LegendBlockDefinition = {
  key: string;
  label: string;
  spheres: string[];
};

export type QcCheck = {
  key: string;
  title: string;
  passed: boolean;
  issues: string[];
};

type CanonConsistencyIssueResolution = {
  issue: string;
  trait_key: string;
  trait_label: string;
  current_value: number;
  suggested_value: number;
  delta: number;
  direction: 'increase' | 'decrease' | string;
  action_label?: string | null;
  reason?: string | null;
  source_field?: string | null;
};

type CanonConsistencyReport = {
  status?: 'not_checked' | 'passed' | 'failed' | string;
  passed?: boolean | null;
  summary?: string;
  issues?: string[];
  heuristic_issues?: string[];
  issue_resolutions?: CanonConsistencyIssueResolution[];
  checked_at?: string | null;
  source?: string | null;
  model?: string | null;
  endpoint_mode?: string | null;
  warning?: string | null;
};

export type DatingSiteTexts = {
  profile_description?: string;
  looking_for_partner?: string;
};

type ParsedLegendResponse = {
  short_summary?: string;
  legend_full_text?: string;
  dating_site_texts?: DatingSiteTexts;
  legend?: Record<string, string>;
  legend_blocks?: Record<string, string>;
  legend_v1_final_json?: Record<string, string>;
  anchors?: Array<Record<string, unknown>>;
  blocks_report?: {
    blocks_meta?: Record<string, { facts_used?: number; hooks_used?: number }>;
  };
  qc_report?: {
    checks?: QcCheck[];
    summary?: {
      passed_checks?: number;
      total_checks?: number;
      ready?: boolean;
    };
  };
  pipeline_state?: Record<string, unknown>;
};

type ApiResponse = {
  ok?: boolean;
  result?: {
    rawText?: string;
    parsedJson?: ParsedLegendResponse;
    consistencyReport?: CanonConsistencyReport;
    finishReason?: string;
    pipeline?: Record<string, unknown>;
  };
  warning?: string | null;
  error?: string;
  details?: unknown;
};

type TranslateApiResponse = {
  ok?: boolean;
  result?: {
    mode?: string;
    translated_text?: string;
    translated_facts?: unknown[];
    translated_anchors?: unknown[];
    translated_blocks?: Record<string, string>;
    target_language?: string;
  };
  error?: string;
  details?: unknown;
};

type PreviewCard = {
  label: string;
  value: string;
};

export type StageKey = 'stage_0_canon' | 'stage_1_anchors' | 'stage_2_fact_bank' | 'stage_3_blocks' | 'stage_4_qc';
type Stage3OutputMode = 'blocks' | 'full_text' | 'both';
type StageVisualState = 'locked' | 'ready' | 'review' | 'done' | 'loading';
export type StageDefinition = {
  key: StageKey;
  navLabel: string;
  title: string;
  actionLabel: string;
  description: string;
};

export type GeneralInfoField = {
  key: string;
  label: string;
  path: string;
  fallbackPaths?: string[];
  placeholder?: string;
  type?: 'text' | 'date' | 'number';
  suffix?: string;
};

const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    key: 'stage_0_canon',
    navLabel: '1st step: Fill in the info',
    title: 'Fill in the info',
    actionLabel: 'Update',
    description: 'Edit general info, tune the scales, add extra context, then refresh canon.'
  },
  {
    key: 'stage_1_anchors',
    navLabel: '2nd step: Anchors',
    title: 'Anchors',
    actionLabel: 'Regenerate anchors',
    description: 'Build the turning points that shape the life arc.'
  },
  {
    key: 'stage_2_fact_bank',
    navLabel: '3rd step: Fact banks',
    title: 'Fact bank',
    actionLabel: 'Regenerate facts',
    description: 'Expand anchors into a dense fact bank with hooks and coverage.'
  },
  {
    key: 'stage_3_blocks',
    navLabel: '4th step: Legend blocks',
    title: 'Legend blocks',
    actionLabel: 'Regenerate legend',
    description: 'Assemble the full narrative, section blocks, and dating-site copy.'
  },
  {
    key: 'stage_4_qc',
    navLabel: '5th step: Quality control',
    title: 'Quality control',
    actionLabel: 'Run QC',
    description: 'Validate consistency, trait manifestation, style, and readiness.'
  }
];

const GENERAL_INFO_FIELDS: GeneralInfoField[] = [
  { key: 'name', label: 'Name*', path: 'name', placeholder: 'Anna' },
  { key: 'birth_date', label: 'Date of birth*', path: 'birth_date', placeholder: '1976-10-17', type: 'date' },
  { key: 'country', label: 'Country*', path: 'current_location.country', fallbackPaths: ['country'], placeholder: 'Ukraine' },
  { key: 'height', label: 'Height', path: 'height_weight.height_cm', type: 'number', suffix: 'cm', placeholder: '167' },
  { key: 'weight', label: 'Weight', path: 'height_weight.weight_kg', type: 'number', suffix: 'kg', placeholder: '57' },
  { key: 'eye_color', label: 'Color of eyes', path: 'eye_color', placeholder: 'Blue' },
  { key: 'hair_color', label: 'Color of hair', path: 'hair_color', placeholder: 'Blonde' },
  { key: 'education', label: 'Education', path: 'education.degree', placeholder: 'Master of Laws' },
  { key: 'occupation', label: 'Occupation', path: 'job.title', fallbackPaths: ['occupation'], placeholder: 'Advocate' },
  { key: 'relationship_status', label: 'Marital status', path: 'relationship_status', placeholder: 'Divorced' }
];

const CHARACTERISTIC_LAYOUT: string[][] = [
  ['responsibility', 'discipline', 'emotional_stability', 'empathy', 'independence', 'confidence', 'social_connection', 'sexual_expressiveness'],
  ['openness_to_change', 'partner_seek_drive', 'mission_level', 'wealth', 'achievement_drive', 'health', 'creativity', 'dominance_level']
];

const CRITERION_UI_LABELS: Record<string, string> = {
  responsibility: 'Responsibility',
  discipline: 'Self-discipline',
  emotional_stability: 'Emotional stability',
  empathy: 'Empathy',
  independence: 'Independence',
  confidence: 'Confidence',
  social_connection: 'Sociality',
  sexual_expressiveness: 'Sexual expressiveness',
  openness_to_change: 'Openness to change',
  partner_seek_drive: 'Partner-seeking drive',
  mission_level: 'Mission',
  wealth: 'Financial level',
  achievement_drive: 'Achievement drive',
  health: 'Health',
  creativity: 'Creativity',
  dominance_level: 'Dominance'
};

const CRITERIA: CriterionDefinition[] = [
  { key: 'responsibility', label: 'Responsibility', minLabel: 'avoids duties', maxLabel: 'keeps commitments' },
  { key: 'achievement_drive', label: 'Achievement Drive', minLabel: 'low ambition', maxLabel: 'result-focused' },
  { key: 'empathy', label: 'Empathy', minLabel: 'emotionally distant', maxLabel: 'highly sensitive' },
  { key: 'discipline', label: 'Self-Discipline', minLabel: 'chaotic', maxLabel: 'structured and disciplined' },
  { key: 'independence', label: 'Independence', minLabel: 'approval-dependent', maxLabel: 'self-directed' },
  { key: 'emotional_stability', label: 'Emotional Stability', minLabel: 'reactive', maxLabel: 'stress-resilient' },
  { key: 'confidence', label: 'Confidence', minLabel: 'reserved', maxLabel: 'strong self-presentation' },
  { key: 'openness_to_change', label: 'Openness to Change', minLabel: 'clings to the familiar', maxLabel: 'adapts to change' },
  { key: 'creativity', label: 'Creativity', minLabel: 'conventional', maxLabel: 'unconventional solutions' },
  { key: 'sexual_expressiveness', label: 'Sexual Expressiveness', minLabel: 'closed model', maxLabel: 'initiating model' },
  { key: 'dominance_level', label: 'Dominance', minLabel: 'avoids leading', maxLabel: 'sets the frame' },
  { key: 'wealth', label: 'Financial Level', minLabel: 'limited resources', maxLabel: 'high resources' },
  { key: 'health', label: 'Health', minLabel: 'unstable', maxLabel: 'strong health resource' },
  { key: 'social_connection', label: 'Social Connection', minLabel: 'narrow circle', maxLabel: 'wide network' },
  { key: 'mission_level', label: 'Mission', minLabel: 'no clear vector', maxLabel: 'strong long-term vector' },
  { key: 'partner_seek_drive', label: 'Partner-Seeking Drive', minLabel: 'avoids closeness', maxLabel: 'oriented to long union' }
];

const PRIMARY_CRITERIA_KEYS = [
  'responsibility',
  'empathy',
  'discipline',
  'independence',
  'confidence',
  'emotional_stability',
  'sexual_expressiveness',
  'social_connection'
];

const LEGEND_BLOCK_DEFINITIONS: LegendBlockDefinition[] = [
  { key: 'lifestyle', label: 'Lifestyle', spheres: ['habits', 'social', 'finance'] },
  { key: 'character', label: 'Character and Inner Patterns', spheres: ['values', 'mission', 'crisis', 'education'] },
  { key: 'family', label: 'Family', spheres: ['family'] },
  { key: 'friendsAndPets', label: 'Friends and Pets', spheres: ['social', 'family'] },
  { key: 'hobby', label: 'Hobbies and Interests', spheres: ['habits', 'mission', 'childhood', 'education'] },
  { key: 'job', label: 'Work', spheres: ['career', 'finance', 'education'] },
  { key: 'exRelationships', label: 'Past Relationships', spheres: ['relationships', 'crisis'] },
  { key: 'lifePlans', label: 'Life Plans', spheres: ['future', 'mission', 'finance', 'values'] },
  { key: 'health', label: 'Health', spheres: ['health', 'habits'] },
  { key: 'childhoodMemories', label: 'Childhood Memories', spheres: ['childhood', 'family', 'education'] },
  { key: 'travelStories', label: 'Travel and Relocations', spheres: ['social', 'future', 'education', 'career'] },
  { key: 'languageSkills', label: 'Languages and Communication', spheres: ['education', 'social'] },
  { key: 'cooking', label: 'Cooking and Domestic Habits', spheres: ['habits', 'family'] },
  { key: 'car', label: 'Car and Mobility Style', spheres: ['finance', 'habits'] },
  { key: 'preference', label: 'Preferences and Everyday Taste', spheres: ['values', 'habits', 'social'] },
  { key: 'appearance', label: 'Appearance and Self-Presentation', spheres: ['social', 'values'] },
  { key: 'sexualPreferences', label: 'Sexual Preferences', spheres: ['sexuality', 'relationships'] },
  { key: 'gifts', label: 'Gifts', spheres: ['relationships', 'family', 'finance', 'values', 'future'] }
];

const LIFE_SPHERE_LABELS: Record<string, string> = {
  childhood: 'Childhood',
  family: 'Family',
  education: 'Education',
  career: 'Career',
  finance: 'Finance',
  relationships: 'Relationships',
  sexuality: 'Sexuality',
  health: 'Health',
  habits: 'Habits',
  social: 'Social',
  values: 'Values',
  crisis: 'Crises',
  mission: 'Mission',
  future: 'Future'
};

const STAGE_ORDER: StageKey[] = ['stage_0_canon', 'stage_1_anchors', 'stage_2_fact_bank', 'stage_3_blocks', 'stage_4_qc'];

const DEFAULT_REQUEST_TIMEOUT_MS = 360000;
const CANON_CONSISTENCY_REQUEST_TIMEOUT_MS = 240000;
const STAGE_REQUEST_TIMEOUTS_MS: Record<string, number> = {
  stage_1_anchors: 450000,
  stage_2_fact_bank: 450000,
  stage_3_blocks: 900000,
  stage_4_qc: 300000
};
const FACTS_BASE_LIMIT = 160;
const FACTS_EXTENSION_STEP = 60;
const MIN_FACTS_REQUIRED = 150;
const MAX_FACTS_ALLOWED = 220;
const MIN_ANCHORS_REQUIRED = 8;
const MAX_ANCHORS_ALLOWED = 12;
const ANCHOR_STAGE_PROMPT_BASE = [
  'Generate 8-12 turning-point anchor events that did not merely affect the life of the person, but noticeably or completely changed the way that person saw the world: after them, the person began to perceive themselves, other people, intimacy, money, risk, responsibility, freedom, success, or safety differently and started making decisions differently.',
  'For each anchor, give maximum specificity in this format: when (month+year), where (city/country/context), what happened (one precise fact), how the worldview changed, result (a concrete outcome within a timeframe).',
  'Use simple everyday English. Prefer short direct sentences and ordinary words.',
  'Avoid literary wording, inflated psychology language, and dramatic phrasing.',
  'Do not use abstractions or generic wording like "became stronger" or "reconsidered their views."',
  'An anchor is not a formal biographical milestone but a real break point: failure, victory, relocation, illness, betrayal, an unexpected stroke of luck, a meeting, a crisis, or an external event.',
  'Anchors must match the canon, age, and timeline logic, must not contradict already selected events, must be distributed across different life spheres, and must explain why the person became who they are.',
  'Add concrete specifics wherever plausible: names of people, cities, companies, educational institutions, sums of money, time spans, device models, and names of courses or job titles.'
].join(' ');
const FACT_STAGE_PROMPT_BASE = [
  'Generate a dense fact bank made of atomic, observable life facts that stay fully consistent with the canon and anchors.',
  'One fact = one concrete event, decision, routine, conflict, consequence, or episode. Do not merge several episodes into one fact.',
  'Use simple everyday English. Avoid literary phrasing, vague abstractions, and generic personality statements.',
  'Facts must stay realistic, cover multiple life spheres, and use year or age whenever possible.',
  'Keep ids stable when possible and preserve already good facts unless the task explicitly asks to change them.'
].join(' ');

const CRITERION_ISSUE_PATTERNS: Record<string, RegExp[]> = {
  responsibility: [/\bответствен\w*/i],
  achievement_drive: [/\bдостигаторств\w*/i, /\bамбици\w*/i],
  empathy: [/\bэмпат\w*/i, /\bчутк\w*/i],
  discipline: [/\bсамодисциплин\w*/i, /\bдисциплин\w*/i],
  independence: [/\bнезависим\w*/i, /\bсамостоят\w*/i, /\bавтоном\w*/i],
  emotional_stability: [/\bэмоциональн\w*\s+стабил\w*/i, /\bстабильност\w*/i],
  confidence: [/\bуверенн\w*/i],
  openness_to_change: [/\bоткрытост\w*\s+к\s+нов/iu],
  creativity: [/\bкреативн\w*/i, /\bтворческ\w*/i],
  sexual_expressiveness: [/\bсексуальн\w*\s+выразительн\w*/i, /\bвыразительност\w*/i],
  dominance_level: [/\bдоминирован\w*/i, /\bдоминант\w*/i],
  wealth: [/\bфинансов\w*\s+уров\w*/i, /\bдоход\w*/i, /\bwealth\b/i],
  health: [/\bздоров\w*/i],
  social_connection: [/\bсоциальн\w*\s+связ\w*/i, /\bсоциабельн\w*/i],
  mission_level: [/\bмисси\w*/i, /\bсмысл\w*/i, /\bдолгосрочн\w*\s+цел\w*/i],
  partner_seek_drive: [/\bпартнерств\w*/i, /\bблизост\w*/i]
};

const DEFAULT_PERSON_TEMPLATE = {
  gender: 'woman',
  name: 'Alina',
  surname: 'Ivanova',
  birth_date: '1994-08-17',
  birth_place: 'Russia, Kazan',
  current_location: {
    country: 'Poland',
    city: 'Warsaw',
    since: '2022'
  },
  citizenship: 'Russia',
  ethnicity: 'Tatar',
  religion: 'secular humanism',
  hair_color: 'dark blonde',
  eye_color: 'brown',
  height_weight: {
    height_cm: 170,
    weight_kg: 61
  },
  distinctive_features: 'clear diction, calm gestures',
  first_impression: 'composed, precise, demanding',
  temperament: 'sanguine with strong self-control',
  character_traits: ['rational', 'proactive', 'independent'],
  bad_habits: ['overworking during peak periods'],
  core_fear: 'losing professional autonomy',
  core_values: ['honesty', 'professional freedom', 'responsibility'],
  dream: 'build a strong international product team',
  education: {
    degree: 'Master',
    specialization: 'Applied Economics',
    institution: 'KFU',
    graduation_year: '2016'
  },
  job: {
    title: 'Product Manager',
    company: 'B2B SaaS',
    location: 'Warsaw',
    income_level: 'above average',
    since: '2022',
    duties: 'product development, analytics, priority management'
  },
  relationship_status: 'single, looking for a relationship',
  children: [],
  languages: [
    { language: 'Russian', proficiency: 'native', used_with: 'family', learning_method: 'native language' },
    { language: 'English', proficiency: 'fluent', used_with: 'work', learning_method: 'university and practice' }
  ],
  sexual_preferences: {
    initiates_sex: true,
    fantasies: ['control over the scenario', 'new roles in a trusted format']
  },
  life_plans: {
    desired_changes: 'move into a Head of Product role within two years',
    ideal_partner_traits: 'maturity, respect for boundaries, intellectual closeness'
  }
};

export class ProfileLegendController {
  private readonly view = { refresh: () => this.onChange() };

  constructor(private readonly onChange: () => void = () => {}) {}

  readonly apiUrl = this.resolveApiUrl();
  readonly canonConsistencyApiUrl = this.resolveCanonConsistencyApiUrl();
  readonly translateOutputApiUrl = this.resolveTranslateOutputApiUrl();
  readonly flashModelLabel = 'Gemini Flash';
  readonly stageDefinitions = STAGE_DEFINITIONS;
  readonly generalInfoFields = GENERAL_INFO_FIELDS;
  readonly criteria = CRITERIA;
  readonly primaryCriteria = CRITERIA.filter((criterion) => PRIMARY_CRITERIA_KEYS.includes(criterion.key));
  readonly secondaryCriteria = CRITERIA.filter((criterion) => !PRIMARY_CRITERIA_KEYS.includes(criterion.key));
  readonly characteristicColumns = CHARACTERISTIC_LAYOUT.map((column) =>
    column
      .map((key) => CRITERIA.find((criterion) => criterion.key === key) || null)
      .filter((criterion): criterion is CriterionDefinition => Boolean(criterion))
  );

  personJson = JSON.stringify(DEFAULT_PERSON_TEMPLATE, null, 2);
  additionalContext = '';
  profile: Record<string, number> = CRITERIA.reduce((acc, criterion) => {
    acc[criterion.key] = 5;
    return acc;
  }, {} as Record<string, number>);

  loading = false;
  translationLoading = false;
  seedInputsDirty = true;
  showFactsPanel = false;
  showCanonConsistencyCard = false;
  selectedBlockKey = '';
  selectedStageView: StageKey = 'stage_0_canon';

  errorMessage = '';
  noticeMessage = '';
  summary = '';
  legendFullText = '';
  datingSiteTexts: DatingSiteTexts = { profile_description: '', looking_for_partner: '' };
  anchors: AnchorItem[] = [];
  factBank: FactItem[] = [];
  legendBlocks: LegendBlock[] = [];
  qcChecks: QcCheck[] = [];
  qcSummary = '';
  canonConsistencyReport: CanonConsistencyReport | null = null;
  anchorRegenerationIndex: number | null = null;
  anchorRegenerationComment = '';
  translatedLegendBlocks: Record<string, string> = {};
  translatedAnchors: Record<string, AnchorItem> = {};
  translatedFacts: Record<string, FactItem> = {};
  translatedLegendFullText = '';
  translatedDatingSiteTexts: DatingSiteTexts = { profile_description: '', looking_for_partner: '' };
  factRegenerationIndex: number | null = null;
  factRegenerationComment = '';

  editableAnchorsJson = '';
  editableFactsJson = '';
  manualEditsDirty = false;
  manualEditStatus = '';

  private pipelineState: Record<string, unknown> | null = null;
  private runningStageKey: StageKey | null = null;
  private canonIssueResolutionMap: Record<string, CanonConsistencyIssueResolution> = {};
  private parsedPersonCacheSource = '';
  private parsedPersonCacheValue: Record<string, unknown> | null = null;
  private parsedPersonCacheError = '';

  get personParseError(): string {
    return this.getPersonParseError();
  }

  get hasDatingSiteTexts(): boolean {
    return Boolean(
      this.safeText(this.datingSiteTexts.profile_description).trim() || this.safeText(this.datingSiteTexts.looking_for_partner).trim()
    );
  }

  get isBusy(): boolean {
    return this.loading || this.translationLoading;
  }

  get anchorCount(): number {
    return this.anchors.length;
  }

  get factCount(): number {
    return this.factBank.length;
  }

  get hasMinimumAnchors(): boolean {
    return this.anchorCount >= MIN_ANCHORS_REQUIRED;
  }

  get hasValidAnchorCount(): boolean {
    return this.isAnchorCountValid(this.anchorCount);
  }

  get hasValidFactCount(): boolean {
    return this.isFactCountValid(this.factCount);
  }

  get canGenerateAdditionalAnchor(): boolean {
    return !this.isBusy && !this.seedInputsDirty && Boolean(this.pipelineState) && this.anchorCount > 0 && this.anchorCount < MAX_ANCHORS_ALLOWED;
  }

  get canTranslateAnchors(): boolean {
    return !this.isBusy && this.anchors.length > 0;
  }

  get hasTranslatedAnchors(): boolean {
    return Object.keys(this.translatedAnchors).length > 0;
  }

  get hasTranslatedLegendBlocks(): boolean {
    return Object.values(this.translatedLegendBlocks).some((value) => this.safeText(value).trim().length > 0);
  }

  get translatedActiveBlockText(): string {
    const key = this.activeBlock?.key || '';
    return key ? this.safeText(this.translatedLegendBlocks[key]).trim() : '';
  }

  get canTranslateLegendBlocks(): boolean {
    return !this.isBusy && this.legendBlocks.length > 0;
  }

  get canGenerateAdditionalFact(): boolean {
    return !this.isBusy && !this.seedInputsDirty && Boolean(this.pipelineState) && this.factBank.length > 0;
  }

  get canTranslateFacts(): boolean {
    return !this.isBusy && this.factBank.length > 0;
  }

  get hasTranslatedFacts(): boolean {
    return Object.keys(this.translatedFacts).length > 0;
  }

  get hasTranslatedLegendFullText(): boolean {
    return Boolean(this.translatedLegendFullText.trim());
  }

  get canTranslateLegendFullText(): boolean {
    return !this.isBusy && Boolean(this.legendFullText.trim());
  }

  get hasTranslatedDatingSiteTexts(): boolean {
    return Boolean(
      this.safeText(this.translatedDatingSiteTexts.profile_description).trim() ||
        this.safeText(this.translatedDatingSiteTexts.looking_for_partner).trim()
    );
  }

  get canTranslateDatingSiteTexts(): boolean {
    return !this.isBusy && this.hasDatingSiteTexts;
  }

  get inputSummaryCards(): PreviewCard[] {
    const person = this.safeParsePersonJson();
    if (!person) {
      return [];
    }

    const cards: PreviewCard[] = [];
    const fullName = [this.safeText(person['name']), this.safeText(person['surname'])].filter(Boolean).join(' ');
    const birthBits = [this.safeText(person['birth_date'] || person['birth_year']), this.resolveAgeLabel(person)].filter(Boolean).join(' | ');
    const location = this.resolveCurrentLocation(person);
    const job = this.resolveJobLabel(person);
    const education = this.resolveEducationLabel(person);
    const languages = this.resolveLanguagesLabel(person);
    const relationship = this.safeText(person['relationship_status']);
    const children = this.resolveChildrenLabel(person);
    const extra = this.additionalContext.trim();

    if (fullName) cards.push({ label: 'Name', value: fullName });
    if (birthBits) cards.push({ label: 'Birth', value: birthBits });
    if (location) cards.push({ label: 'Current base', value: location });
    if (job) cards.push({ label: 'Work', value: job });
    if (education) cards.push({ label: 'Education', value: education });
    if (languages) cards.push({ label: 'Languages', value: languages });
    if (relationship) cards.push({ label: 'Relationship', value: relationship });
    if (children) cards.push({ label: 'Family', value: children });
    if (extra) cards.push({ label: 'Extra text', value: this.truncateText(extra, 120) });

    return cards.slice(0, 8);
  }

  get previewTags(): string[] {
    const person = this.safeParsePersonJson();
    if (!person) {
      return [];
    }

    const out: string[] = [];
    const pushItems = (value: unknown): void => {
      for (const item of Array.isArray(value) ? value : []) {
        const normalized = this.safeText(item).trim();
        if (normalized && !out.includes(normalized)) {
          out.push(normalized);
        }
        if (out.length >= 10) {
          return;
        }
      }
    };

    pushItems(person['character_traits']);
    pushItems(person['core_values']);
    pushItems(person['bad_habits']);

    return out.slice(0, 10);
  }

  get topTraits(): Array<{ key: string; label: string; value: number }> {
    return this.buildTopTraitsFromProfile(this.profile).slice(0, 4);
  }

  get activeBlock(): LegendBlock | null {
    if (!this.selectedBlockKey) {
      return this.legendBlocks[0] || null;
    }
    return this.legendBlocks.find((block) => block.key === this.selectedBlockKey) || this.legendBlocks[0] || null;
  }

  get hookFactsCount(): number {
    return this.factBank.filter((fact) => Boolean(fact.hook)).length;
  }

  get sortedFactBank(): FactItem[] {
    return this.sortFactsChronologically(this.factBank);
  }

  get currentStageKey(): StageKey {
    return this.resolveCurrentStageKey();
  }

  get currentStageDefinition(): StageDefinition {
    return this.getStageDefinition(this.currentStageKey);
  }

  get activeStageDefinition(): StageDefinition {
    return this.getStageDefinition(this.selectedStageView);
  }

  get editableChildren(): Array<{ name: string; birth_date: string }> {
    const person = this.safeParsePersonJson();
    const children = Array.isArray(person?.['children']) ? person['children'] : [];

    return children
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const child = item as Record<string, unknown>;
        return {
          name: this.safeText(child['name']).trim(),
          birth_date: this.safeText(child['birth_date'] ?? child['dateBirth']).trim()
        };
      })
      .filter((item): item is { name: string; birth_date: string } => Boolean(item));
  }

  onPersonJsonChange(): void {
    this.invalidateParsedPersonCache();
    this.markSeedInputsDirty();
  }

  onAdditionalContextChange(): void {
    this.markSeedInputsDirty();
  }

  onProfileInputChange(): void {
    this.markSeedInputsDirty();
  }

  normalizeProfileValue(key: string): void {
    const raw = Number(this.profile[key]);
    this.profile[key] = Number.isFinite(raw) ? Math.min(10, Math.max(1, Math.round(raw))) : 5;
    this.markSeedInputsDirty();
  }

  formatPersonJson(): void {
    try {
      this.personJson = JSON.stringify(this.parsePersonJson(), null, 2);
      this.invalidateParsedPersonCache();
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  openStage(stageKey: StageKey): void {
    if (!this.isStageAccessible(stageKey) || this.isBusy) {
      return;
    }
    this.selectedStageView = stageKey;
  }

  async handleStageTabClick(stageKey: StageKey): Promise<void> {
    if (this.isBusy) {
      return;
    }

    const state = this.getStageVisualState(stageKey);
    if (state === 'locked') {
      return;
    }

    if (state === 'ready') {
      await this.runStageByKey(stageKey);
      return;
    }

    this.selectedStageView = stageKey;
  }

  isStageCurrent(stageKey: StageKey): boolean {
    return this.currentStageKey === stageKey;
  }

  isStageCompleted(stageKey: StageKey): boolean {
    return this.hasCompletedStage(stageKey) && !this.isStageCurrent(stageKey);
  }

  isStageAccessible(stageKey: StageKey): boolean {
    return this.isStageCurrent(stageKey) || this.hasCompletedStage(stageKey) || this.canReachStage(stageKey);
  }

  getStageStateLabel(stageKey: StageKey): string {
    const state = this.getStageVisualState(stageKey);
    if (state === 'loading') return 'Generating';
    if (state === 'done') return 'Done';
    if (state === 'review') return 'Loaded';
    if (state === 'ready') return 'Generate';
    return 'Locked';
  }

  getStageVisualState(stageKey: StageKey): StageVisualState {
    if (!this.isStageAccessible(stageKey)) {
      return 'locked';
    }

    if (this.isBusy && this.runningStageKey === stageKey) {
      return 'loading';
    }

    if (this.selectedStageView === stageKey && this.hasStageOutput(stageKey)) {
      return 'review';
    }

    if (this.isStageCompleted(stageKey)) {
      return 'done';
    }

    if (this.canReachStage(stageKey)) {
      return 'ready';
    }

    if (this.selectedStageView === stageKey) {
      return 'ready';
    }

    return 'done';
  }

  getCriterionDisplayLabel(criterion: CriterionDefinition): string {
    return CRITERION_UI_LABELS[criterion.key] || criterion.label;
  }

  getGeneralInfoValue(field: GeneralInfoField): string {
    const person = this.safeParsePersonJson();
    if (!person) {
      return '';
    }

    const value = this.readFirstAvailableValue(person, [field.path, ...(field.fallbackPaths || [])]);
    return this.safeText(value).trim();
  }

  updateGeneralInfoField(field: GeneralInfoField, value: string): void {
    this.updatePersonJson((person) => {
      const normalizedValue = field.type === 'number' ? this.normalizeNumericInput(value) : value;
      this.writeNestedValue(person, field.path, normalizedValue);

      if (field.key === 'country' && !this.readNestedValue(person, 'country')) {
        person['country'] = normalizedValue;
      }

      if (field.key === 'occupation' && !this.readNestedValue(person, 'occupation')) {
        person['occupation'] = normalizedValue;
      }
    });
  }

  updateChildField(index: number, field: 'name' | 'birth_date', value: string): void {
    this.updatePersonJson((person) => {
      const children = Array.isArray(person['children']) ? [...person['children']] : [];
      while (children.length <= index) {
        children.push({ name: '', birth_date: '' });
      }

      const child =
        children[index] && typeof children[index] === 'object' && !Array.isArray(children[index])
          ? { ...(children[index] as Record<string, unknown>) }
          : { name: '', birth_date: '' };

      child[field] = value;
      children[index] = child;
      person['children'] = children;
    });
  }

  addChild(): void {
    this.updatePersonJson((person) => {
      const children = Array.isArray(person['children']) ? [...person['children']] : [];
      children.push({ name: '', birth_date: '' });
      person['children'] = children;
    });
  }

  removeChild(index: number): void {
    this.updatePersonJson((person) => {
      const children = Array.isArray(person['children']) ? [...person['children']] : [];
      if (index < 0 || index >= children.length) {
        return;
      }
      children.splice(index, 1);
      person['children'] = children;
    });
  }

  adjustProfileValue(key: string, delta: number): void {
    const currentValue = Number(this.profile[key]);
    const nextValue = Number.isFinite(currentValue) ? currentValue + delta : 5;
    this.profile[key] = Math.min(10, Math.max(1, Math.round(nextValue)));
    this.markSeedInputsDirty();
  }

  selectBlock(blockKey: string): void {
    this.selectedBlockKey = blockKey;
  }

  toggleFactsPanel(): void {
    if (this.factBank.length === 0 && this.anchors.length === 0) {
      return;
    }
    this.showFactsPanel = !this.showFactsPanel;
  }

  canRunStage(stageKey: StageKey): boolean {
    if (this.isBusy) {
      return false;
    }

    if (stageKey === 'stage_0_canon') {
      return !this.personParseError;
    }

    if (this.seedInputsDirty || !this.pipelineState) {
      return false;
    }

    if (stageKey === 'stage_2_fact_bank') {
      const anchors = Array.isArray(this.pipelineState['anchors_timeline']) ? this.pipelineState['anchors_timeline'] : [];
      return this.isAnchorCountValid(anchors.length);
    }

    if (stageKey === 'stage_3_blocks') {
      const facts = Array.isArray(this.pipelineState['fact_bank']) ? this.pipelineState['fact_bank'] : [];
      return facts.length > 0;
    }

    if (stageKey === 'stage_4_qc') {
      const blocks = this.pipelineState['legend_blocks'];
      return Boolean(blocks && typeof blocks === 'object' && Object.values(blocks as Record<string, unknown>).some((value) => this.safeText(value).trim()));
    }

    return true;
  }

  canReachStage(stageKey: StageKey): boolean {
    if (this.isBusy) {
      return false;
    }

    if (stageKey === 'stage_0_canon') {
      return !this.personParseError;
    }

    if (this.seedInputsDirty || !this.pipelineState) {
      return false;
    }

    const anchors = Array.isArray(this.pipelineState['anchors_timeline']) ? this.pipelineState['anchors_timeline'] : [];
    const facts = Array.isArray(this.pipelineState['fact_bank']) ? this.pipelineState['fact_bank'] : [];
    const blocks = this.pipelineState['legend_blocks'];
    const hasValidAnchors = this.isAnchorCountValid(anchors.length);
    const hasFacts = facts.length > 0;
    const hasBlocks = Boolean(
      blocks && typeof blocks === 'object' && Object.values(blocks as Record<string, unknown>).some((value) => this.safeText(value).trim())
    );

    if (stageKey === 'stage_1_anchors') {
      return true;
    }

    if (stageKey === 'stage_2_fact_bank') {
      return hasValidAnchors;
    }

    if (stageKey === 'stage_3_blocks') {
      return hasFacts || hasValidAnchors;
    }

    if (stageKey === 'stage_4_qc') {
      return hasBlocks || hasFacts || hasValidAnchors;
    }

    return false;
  }

  getStageBadge(stageKey: StageKey): string {
    if (stageKey === 'stage_0_canon' && this.seedInputsDirty && this.pipelineState) {
      return 'Needs rerun';
    }

    if (this.hasCompletedStage(stageKey) && !this.seedInputsDirty) {
      return 'Done';
    }

    return this.canRunStage(stageKey) ? 'Ready' : 'Locked';
  }

  getCanonCheckBadge(): string {
    if (!this.pipelineState) {
      return 'Locked';
    }
    if (this.seedInputsDirty) {
      return 'Needs rerun';
    }
    if (this.canonConsistencyReport?.status === 'passed') {
      return 'Passed';
    }
    if (this.canonConsistencyReport?.status === 'failed') {
      return 'Issues found';
    }
    return 'Optional';
  }

  async runCanon(): Promise<void> {
    await this.runStage('stage_0_canon');
    if (!this.errorMessage && this.pipelineState) {
      this.selectedStageView = 'stage_0_canon';
    }
  }

  async runAnchors(): Promise<void> {
    await this.runStage('stage_1_anchors');
    if (!this.errorMessage && this.anchors.length > 0) {
      this.selectedStageView = 'stage_1_anchors';
    }
  }

  async runFacts(): Promise<void> {
    await this.runStage('stage_2_fact_bank');
    if (!this.errorMessage && this.factBank.length > 0) {
      this.selectedStageView = 'stage_2_fact_bank';
    }
  }

  async runNarrative(): Promise<void> {
    await this.runStage('stage_3_blocks', { stage3OutputMode: 'both' });
    if (!this.errorMessage && (this.legendBlocks.length > 0 || this.legendFullText.trim())) {
      this.selectedStageView = 'stage_3_blocks';
    }
  }

  async runQc(): Promise<void> {
    await this.runStage('stage_4_qc');
    if (!this.errorMessage && this.qcChecks.length > 0) {
      this.selectedStageView = 'stage_4_qc';
    }
  }

  async runSelectedStageAction(): Promise<void> {
    await this.runStageByKey(this.selectedStageView);
  }

  getTranslatedAnchor(anchor: AnchorItem, index: number): AnchorItem | null {
    const key = this.resolveAnchorTranslationKey(anchor, index);
    return key ? this.translatedAnchors[key] || null : null;
  }

  getTranslatedFact(fact: FactItem, index: number): FactItem | null {
    const key = this.resolveFactTranslationKey(fact, index);
    return key ? this.translatedFacts[key] || null : null;
  }

  async translateAnchors(): Promise<void> {
    if (!this.canTranslateAnchors) {
      return;
    }

    const data = await this.executeTranslationRequest({
      mode: 'anchors',
      target_language: 'Russian',
      generation_type: 'type-flash',
      anchors: this.anchors
    });
    const translatedAnchors = this.normalizeAnchorItems(data?.result?.translated_anchors || []);
    if (!translatedAnchors.length) {
      this.errorMessage = 'Translator did not return translated anchors.';
      return;
    }

    this.translatedAnchors = translatedAnchors.reduce((acc, item, index) => {
      const key = this.resolveAnchorTranslationKey(item, index);
      if (key) {
        acc[key] = item;
      }
      return acc;
    }, {} as Record<string, AnchorItem>);
    this.noticeMessage = 'Russian translation for anchors is ready.';
  }

  async translateFacts(): Promise<void> {
    if (!this.canTranslateFacts) {
      return;
    }

    const data = await this.executeTranslationRequest({
      mode: 'facts',
      target_language: 'Russian',
      generation_type: 'type-flash',
      facts: this.factBank
    });
    const translatedFacts = this.normalizeFactItems(data?.result?.translated_facts || []);
    if (!translatedFacts.length) {
      this.errorMessage = 'Translator did not return translated facts.';
      return;
    }

    this.translatedFacts = translatedFacts.reduce((acc, item, index) => {
      const key = this.resolveFactTranslationKey(item, index);
      if (key) {
        acc[key] = item;
      }
      return acc;
    }, {} as Record<string, FactItem>);
    this.noticeMessage = 'Russian translation for facts is ready.';
  }

  async translateLegendFullText(): Promise<void> {
    if (!this.canTranslateLegendFullText) {
      return;
    }

    const data = await this.executeTranslationRequest({
      mode: 'full_text',
      target_language: 'Russian',
      generation_type: 'type-flash',
      text: this.legendFullText
    });
    const translatedText = this.safeText(data?.result?.translated_text).trim();
    if (!translatedText) {
      this.errorMessage = 'Translator did not return translated full text.';
      return;
    }

    this.translatedLegendFullText = translatedText;
    this.noticeMessage = 'Russian translation for the full legend text is ready.';
  }

  async translateDatingSiteTexts(): Promise<void> {
    if (!this.canTranslateDatingSiteTexts) {
      return;
    }

    this.translationLoading = true;
    this.errorMessage = '';
    this.noticeMessage = '';

    try {
      const nextTranslations: DatingSiteTexts = { profile_description: '', looking_for_partner: '' };
      const profileText = this.safeText(this.datingSiteTexts.profile_description).trim();
      const partnerText = this.safeText(this.datingSiteTexts.looking_for_partner).trim();

      if (profileText) {
        nextTranslations.profile_description = await this.translatePlainTextValue(profileText);
      }
      if (partnerText) {
        nextTranslations.looking_for_partner = await this.translatePlainTextValue(partnerText);
      }

      if (!nextTranslations.profile_description && !nextTranslations.looking_for_partner) {
        throw new Error('Translator did not return dating-site translations.');
      }

      this.translatedDatingSiteTexts = nextTranslations;
      this.noticeMessage = 'Russian translation for dating-site texts is ready.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.translationLoading = false;
      this.view.refresh();
    }
  }

  async translateAllLegendBlocks(): Promise<void> {
    if (!this.canTranslateLegendBlocks) {
      return;
    }

    const blocks = this.legendBlocks.reduce((acc, block) => {
      if (block.text.trim()) {
        acc[block.key] = block.text;
      }
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(blocks).length === 0) {
      return;
    }

    const data = await this.executeTranslationRequest({
      mode: 'blocks',
      target_language: 'Russian',
      generation_type: 'type-flash',
      blocks
    });
    const translatedBlocks = data?.result?.translated_blocks || {};
    if (!translatedBlocks || typeof translatedBlocks !== 'object' || Object.keys(translatedBlocks).length === 0) {
      this.errorMessage = 'Translator did not return translated blocks.';
      return;
    }

    this.translatedLegendBlocks = Object.entries(translatedBlocks).reduce((acc, [key, value]) => {
      const text = this.safeText(value).trim();
      if (text) {
        acc[key] = text;
      }
      return acc;
    }, {} as Record<string, string>);
    this.noticeMessage = 'Russian translation for legend blocks is ready.';
  }

  toggleAnchorRegeneration(index: number): void {
    if (this.isBusy) {
      return;
    }
    if (this.anchorRegenerationIndex === index) {
      this.cancelAnchorRegeneration();
      return;
    }

    this.anchorRegenerationIndex = index;
    this.anchorRegenerationComment = '';
    this.errorMessage = '';
  }

  cancelAnchorRegeneration(): void {
    this.anchorRegenerationIndex = null;
    this.anchorRegenerationComment = '';
  }

  toggleFactRegeneration(index: number): void {
    if (this.isBusy) {
      return;
    }
    if (this.factRegenerationIndex === index) {
      this.cancelFactRegeneration();
      return;
    }

    this.factRegenerationIndex = index;
    this.factRegenerationComment = '';
    this.errorMessage = '';
  }

  cancelFactRegeneration(): void {
    this.factRegenerationIndex = null;
    this.factRegenerationComment = '';
  }

  deleteAnchor(index: number): void {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (index < 0 || index >= this.anchors.length) {
      return;
    }

    const nextAnchors = this.anchors.filter((_anchor, anchorIndex) => anchorIndex !== index);
    this.commitAnchorTimeline(nextAnchors, 'manual_delete', `Anchor removed. Current total: ${nextAnchors.length}.`);
  }

  async regenerateAnchor(index: number): Promise<void> {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (index < 0 || index >= this.anchors.length) {
      return;
    }

    const comment = this.anchorRegenerationComment.trim();
    if (!comment) {
      this.errorMessage = 'Add a comment explaining what should be fixed before regenerating this anchor.';
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = {
        ...this.buildBasePayload('blocks'),
        run_stage: 'stage_1_anchors',
        generation_type: 'type-flash',
        pipeline_state: this.pipelineState,
        stage_prompts: {
          stage_1_anchors_prompt: this.buildSingleAnchorPrompt(this.anchors[index], index, comment)
        }
      };
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    const data = await this.executeApiRequest(payload, { mutateState: false });
    if (!data) {
      return;
    }

    const candidateAnchors = this.extractAnchorsFromApiResponse(data);
    const replacement = this.pickReplacementAnchor(candidateAnchors, index);
    if (!replacement) {
      this.errorMessage = 'Failed to derive a replacement anchor from the regenerated timeline.';
      return;
    }

    const nextAnchors = [...this.anchors];
    nextAnchors[index] = replacement;
    this.commitAnchorTimeline(nextAnchors, 'single_regeneration', `Anchor regenerated. Total anchors: ${nextAnchors.length}.`);
    this.cancelAnchorRegeneration();
  }

  async generateSingleAnchor(): Promise<void> {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (!this.canGenerateAdditionalAnchor) {
      this.errorMessage = `You can add anchors only while the total is below ${MAX_ANCHORS_ALLOWED}.`;
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = {
        ...this.buildBasePayload('blocks'),
        run_stage: 'stage_1_anchors',
        generation_type: 'type-flash',
        pipeline_state: this.pipelineState,
        stage_prompts: {
          stage_1_anchors_prompt: this.buildAdditionalAnchorPrompt()
        }
      };
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    const data = await this.executeApiRequest(payload, { mutateState: false });
    if (!data) {
      return;
    }

    const candidateAnchors = this.extractAnchorsFromApiResponse(data);
    const newAnchor = this.pickAdditionalAnchor(candidateAnchors);
    if (!newAnchor) {
      this.errorMessage = 'Failed to derive a new anchor from the regenerated timeline.';
      return;
    }

    const nextAnchors = [...this.anchors, newAnchor];
    this.commitAnchorTimeline(nextAnchors, 'single_append', `One anchor added. Current total: ${nextAnchors.length}.`);
  }

  deleteFact(index: number): void {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (index < 0 || index >= this.factBank.length) {
      return;
    }

    const nextFacts = this.factBank.filter((_fact, factIndex) => factIndex !== index);
    this.commitFactBank(nextFacts, 'manual_delete', `Fact removed. Current total: ${nextFacts.length}.`);
  }

  async regenerateFact(index: number): Promise<void> {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (index < 0 || index >= this.factBank.length) {
      return;
    }

    const comment = this.factRegenerationComment.trim();
    if (!comment) {
      this.errorMessage = 'Add a comment explaining what should be fixed before regenerating this fact.';
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = {
        ...this.buildBasePayload('blocks'),
        run_stage: 'stage_2_fact_bank',
        generation_type: 'type-flash',
        pipeline_state: this.pipelineState,
        stage_prompts: {
          stage_2_fact_bank_prompt: this.buildSingleFactPrompt(this.factBank[index], index, comment)
        }
      };
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    const data = await this.executeApiRequest(payload, { mutateState: false });
    if (!data) {
      return;
    }

    const candidateFacts = this.extractFactsFromApiResponse(data);
    const replacement = this.pickReplacementFact(candidateFacts, index);
    if (!replacement) {
      this.errorMessage = 'Failed to derive a replacement fact from the regenerated bank.';
      return;
    }

    const nextFacts = [...this.factBank];
    nextFacts[index] = replacement;
    this.commitFactBank(nextFacts, 'single_regeneration', `Fact regenerated. Total facts: ${nextFacts.length}.`);
    this.cancelFactRegeneration();
  }

  async generateSingleFact(): Promise<void> {
    if (this.isBusy) {
      return;
    }
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }
    if (!this.canGenerateAdditionalFact) {
      this.errorMessage = 'Add fact is available only after the fact bank already exists.';
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = {
        ...this.buildBasePayload('blocks'),
        run_stage: 'stage_2_fact_bank',
        generation_type: 'type-flash',
        pipeline_state: this.pipelineState,
        stage_prompts: {
          stage_2_fact_bank_prompt: this.buildAdditionalFactPrompt()
        }
      };
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    const data = await this.executeApiRequest(payload, { mutateState: false });
    if (!data) {
      return;
    }

    const candidateFacts = this.extractFactsFromApiResponse(data);
    const newFact = this.pickAdditionalFact(candidateFacts);
    if (!newFact) {
      this.errorMessage = 'Failed to derive a new fact from the regenerated bank.';
      return;
    }

    const nextFacts = [...this.factBank, newFact];
    this.commitFactBank(nextFacts, 'single_append', `One fact added. Current total: ${nextFacts.length}.`);
  }

  async checkCanonConsistency(): Promise<void> {
    if (!this.canCheckCanonConsistency()) {
      if (this.seedInputsDirty) {
        this.errorMessage = 'Source JSON or scales changed. Run step 1 again first.';
      } else if (!this.pipelineState) {
        this.errorMessage = 'Run step 1 first to get pipeline_state.';
      }
      return;
    }

    let personPayload: Record<string, unknown>;
    try {
      personPayload = this.buildPersonPayload();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.noticeMessage = '';
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), CANON_CONSISTENCY_REQUEST_TIMEOUT_MS);

      const response = await fetch(this.canonConsistencyApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person: personPayload,
          personality_profile: this.profile,
          generation_type: 'type-flash',
          pipeline_state: this.pipelineState
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      const data = this.tryParseApiJson(raw);
      if (!response.ok) {
        throw new Error(this.extractBackendError(data, raw) || `Backend error (HTTP ${response.status}).`);
      }
      if (!data) {
        throw new Error('Backend returned a non-JSON response.');
      }

      this.consumeCanonConsistencyResponse(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.errorMessage = `Request timeout (${Math.round(CANON_CONSISTENCY_REQUEST_TIMEOUT_MS / 1000)} seconds).`;
      } else {
        this.errorMessage = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.loading = false;
      this.view.refresh();
    }
  }

  canCheckCanonConsistency(): boolean {
    return !this.isBusy && Boolean(this.pipelineState) && !this.seedInputsDirty;
  }

  getCanonIssueResolution(issue: string): CanonConsistencyIssueResolution | null {
    const key = this.safeText(issue).trim();
    return key ? this.canonIssueResolutionMap[key] || null : null;
  }

  getCanonIssueResolutions(): CanonConsistencyIssueResolution[] {
    const issues = this.canonConsistencyReport?.issues || [];
    return issues
      .map((issue) => this.getCanonIssueResolution(issue))
      .filter((item): item is CanonConsistencyIssueResolution => Boolean(item));
  }

  dismissCanonConsistencyReport(): void {
    this.showCanonConsistencyCard = false;
  }

  canApplyAllCanonConflictResolutions(): boolean {
    return this.getCanonIssueResolutions().some((resolution) => !this.isConflictResolutionApplied(resolution));
  }

  isConflictResolutionApplied(resolution: CanonConsistencyIssueResolution): boolean {
    const traitKey = this.safeText(resolution?.trait_key).trim();
    if (!traitKey) {
      return true;
    }

    const currentValue = Number(this.profile[traitKey]);
    const suggestedValue = Number(resolution.suggested_value);
    const direction = this.safeText(resolution.direction).trim().toLowerCase();
    if (!Number.isFinite(currentValue) || !Number.isFinite(suggestedValue)) {
      return true;
    }

    return direction === 'decrease' ? currentValue <= suggestedValue : currentValue >= suggestedValue;
  }

  applyCanonConflictResolution(resolution: CanonConsistencyIssueResolution): void {
    const traitKey = this.safeText(resolution?.trait_key).trim();
    if (!traitKey || !Object.prototype.hasOwnProperty.call(this.profile, traitKey)) {
      this.errorMessage = 'Could not determine which scale should be changed.';
      return;
    }

    const previousValue = Number(this.profile[traitKey]);
    const nextValue = Math.min(10, Math.max(1, Math.round(Number(resolution.suggested_value))));
    if (!Number.isFinite(nextValue)) {
      this.errorMessage = 'Could not determine the new value for this scale.';
      return;
    }

    if (this.isConflictResolutionApplied(resolution)) {
      this.noticeMessage = `Scale "${resolution.trait_label}" was already adjusted locally. Run step 1 again if you want to refresh the check.`;
      this.errorMessage = '';
      return;
    }

    this.profile[traitKey] = nextValue;
    this.syncProfileIntoPipelineState();
    this.markSeedInputsDirty(true);
    this.noticeMessage = `Scale "${resolution.trait_label}" changed: ${previousValue}/10 -> ${nextValue}/10. Run step 1 again.`;
    this.errorMessage = '';
  }

  applyAllCanonConflictResolutions(): void {
    const groupedResolutions = new Map<string, CanonConsistencyIssueResolution>();

    for (const resolution of this.getCanonIssueResolutions()) {
      if (this.isConflictResolutionApplied(resolution)) {
        continue;
      }

      const existing = groupedResolutions.get(resolution.trait_key);
      if (!existing) {
        groupedResolutions.set(resolution.trait_key, resolution);
        continue;
      }

      if (resolution.direction === 'decrease' && resolution.suggested_value < existing.suggested_value) {
        groupedResolutions.set(resolution.trait_key, resolution);
        continue;
      }

      if (resolution.direction !== 'decrease' && resolution.suggested_value > existing.suggested_value) {
        groupedResolutions.set(resolution.trait_key, resolution);
      }
    }

    const changes: string[] = [];
    for (const resolution of groupedResolutions.values()) {
      const traitKey = this.safeText(resolution.trait_key).trim();
      if (!traitKey || !Object.prototype.hasOwnProperty.call(this.profile, traitKey)) {
        continue;
      }

      const previousValue = Number(this.profile[traitKey]);
      const nextValue = Math.min(10, Math.max(1, Math.round(Number(resolution.suggested_value))));
      if (!Number.isFinite(nextValue) || previousValue === nextValue) {
        continue;
      }

      this.profile[traitKey] = nextValue;
      changes.push(`"${resolution.trait_label}" ${previousValue}/10 -> ${nextValue}/10`);
    }

    if (changes.length === 0) {
      this.noticeMessage = 'All available fixes have already been applied locally.';
      this.errorMessage = '';
      return;
    }

    this.syncProfileIntoPipelineState();
    this.markSeedInputsDirty(true);
    this.noticeMessage = `Applied fixes: ${changes.join(', ')}. Run step 1 again to refresh canon.`;
    this.errorMessage = '';
  }

  formatSignedDelta(value: number): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      return '0';
    }
    return numeric > 0 ? `+${numeric}` : String(numeric);
  }

  onManualEditorChange(): void {
    this.manualEditsDirty = true;
    this.manualEditStatus = '';
  }

  formatAnchorsEditor(): void {
    try {
      const parsed = JSON.parse(this.editableAnchorsJson);
      if (!Array.isArray(parsed)) {
        throw new Error('Anchors must be a JSON array.');
      }
      this.editableAnchorsJson = JSON.stringify(parsed, null, 2);
      this.manualEditsDirty = true;
      this.manualEditStatus = '';
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  formatFactsEditor(): void {
    try {
      const parsed = JSON.parse(this.editableFactsJson);
      if (!Array.isArray(parsed)) {
        throw new Error('Fact bank must be a JSON array.');
      }
      this.editableFactsJson = JSON.stringify(parsed, null, 2);
      this.manualEditsDirty = true;
      this.manualEditStatus = '';
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  applyManualEdits(): void {
    this.applyManualEditsToPipelineState();
  }

  async rebuildNarrativeFromManualEdits(): Promise<void> {
    if (!this.assertStagePrerequisites('stage_3_blocks')) {
      return;
    }
    if (!this.applyManualEditsToPipelineState()) {
      return;
    }

    const payload = this.buildBasePayload('both');
    payload['run_stage'] = 'stage_3_blocks';
    payload['generation_type'] = 'type-flash';
    payload['pipeline_state'] = this.pipelineState;
    await this.sendRequest(payload);
  }

  async recalcQcFromManualEdits(): Promise<void> {
    if (!this.assertStagePrerequisites('stage_4_qc')) {
      return;
    }
    if (!this.applyManualEditsToPipelineState()) {
      return;
    }

    const payload = this.buildBasePayload('blocks');
    payload['run_stage'] = 'stage_4_qc';
    payload['generation_type'] = 'type-flash';
    payload['pipeline_state'] = this.pipelineState;
    await this.sendRequest(payload);
  }

  formatFactMeta(fact: FactItem): string {
    const parts: string[] = [];
    if (Number.isFinite(Number(fact.year))) {
      parts.push(String(Math.round(Number(fact.year))));
    } else if (Number.isFinite(Number(fact.age))) {
      parts.push(`${Math.round(Number(fact.age))} years old`);
    }

    const sphereKey = this.safeText(fact.sphere).trim();
    if (sphereKey) {
      parts.push(LIFE_SPHERE_LABELS[sphereKey] || this.humanizeBlockKey(sphereKey));
    }

    if (fact.hook) {
      parts.push('hook');
    }

    return parts.join(' | ');
  }

  formatAnchorMeta(anchor: AnchorItem): string {
    const parts: string[] = [];
    if (Number.isFinite(Number(anchor.year))) {
      const month = Number(anchor.month);
      parts.push(
        Number.isFinite(month) && month >= 1 && month <= 12
          ? `${Math.round(month).toString().padStart(2, '0')}/${Math.round(Number(anchor.year))}`
          : String(Math.round(Number(anchor.year)))
      );
    } else if (Number.isFinite(Number(anchor.age))) {
      parts.push(`${Math.round(Number(anchor.age))} years old`);
    }

    const sphereKey = this.safeText(anchor.sphere).trim();
    if (sphereKey) {
      parts.push(LIFE_SPHERE_LABELS[sphereKey] || this.humanizeBlockKey(sphereKey));
    }

    const location = this.safeText(anchor.location).trim();
    if (location) {
      parts.push(location);
    }

    return parts.join(' | ');
  }

  getBlockRelatedFactsCount(blockKey: string): number {
    const block = LEGEND_BLOCK_DEFINITIONS.find((item) => item.key === blockKey);
    if (!block) {
      return 0;
    }

    return this.factBank.filter((fact) => {
      const sphere = this.safeText(fact.sphere).trim();
      return sphere ? block.spheres.includes(sphere) : false;
    }).length;
  }

  getTextLength(text: unknown): number {
    return this.safeText(text).trim().length;
  }

  formatRichBlockText(text: unknown): string {
    const normalized = this.safeText(text)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    if (!normalized) {
      return '';
    }

    return normalized
      .split('\n')
      .map((line) => {
        const hasLabel = /^\*\*[^*\n]+?\*\*(?:\s|$)/.test(line);
        const className = hasLabel ? 'rich-block-line rich-block-line-labeled' : 'rich-block-line';
        return `<p class="${className}">${this.renderInlineMarkdownBold(line)}</p>`;
      })
      .join('');
  }

  private isAnchorCountValid(count: number): boolean {
    return count >= MIN_ANCHORS_REQUIRED && count <= MAX_ANCHORS_ALLOWED;
  }

  private isFactCountValid(count: number): boolean {
    return count >= MIN_FACTS_REQUIRED && count <= MAX_FACTS_ALLOWED;
  }

  private normalizeAnchorItems(items: unknown[]): AnchorItem[] {
    return items
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const source = item as Record<string, unknown>;
        const normalized: AnchorItem = {
          id: this.safeText(source['id']).trim() || `anchor_${String(index + 1).padStart(3, '0')}`,
          year: this.normalizeOptionalInteger(source['year']),
          month: this.normalizeOptionalInteger(source['month']),
          age: this.normalizeOptionalInteger(source['age']),
          sphere: this.safeText(source['sphere']).trim(),
          location: this.safeText(source['location']).trim(),
          event: this.safeText(source['event']).trim(),
          worldview_shift: this.safeText(source['worldview_shift'] ?? source['worldviewShift']).trim(),
          outcome: this.safeText(source['outcome']).trim(),
          hook: Boolean(source['hook'])
        };

        if (!normalized.event && !normalized.worldview_shift && !normalized.outcome) {
          return null;
        }

        return normalized;
      })
      .filter((item): item is AnchorItem => Boolean(item));
  }

  private normalizeFactItems(items: unknown[]): FactItem[] {
    return items
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const source = item as Record<string, unknown>;
        const normalized: FactItem = {
          id: this.safeText(source['id']).trim() || `fact_${String(index + 1).padStart(3, '0')}`,
          text: this.safeText(source['text']).trim(),
          sphere: this.safeText(source['sphere']).trim(),
          year: this.normalizeOptionalInteger(source['year']),
          age: this.normalizeOptionalInteger(source['age']),
          hook: Boolean(source['hook']),
          source: source['source'] !== undefined && source['source'] !== null ? this.safeText(source['source']).trim() || null : null,
          source_anchor_id: this.safeText(source['source_anchor_id'] ?? source['sourceAnchorId']).trim() || null
        };

        if (!normalized.text) {
          return null;
        }

        return normalized;
      })
      .filter((item): item is FactItem => Boolean(item));
  }

  private normalizeOptionalInteger(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }

  private sortAnchorsChronologically(anchors: AnchorItem[]): AnchorItem[] {
    return [...anchors].sort((left, right) => {
      const leftYear = Number(left.year);
      const rightYear = Number(right.year);
      if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) {
        return leftYear - rightYear;
      }

      const leftMonth = Number(left.month);
      const rightMonth = Number(right.month);
      if (Number.isFinite(leftMonth) && Number.isFinite(rightMonth) && leftMonth !== rightMonth) {
        return leftMonth - rightMonth;
      }

      const leftAge = Number(left.age);
      const rightAge = Number(right.age);
      if (Number.isFinite(leftAge) && Number.isFinite(rightAge) && leftAge !== rightAge) {
        return leftAge - rightAge;
      }

      return this.safeText(left.event).localeCompare(this.safeText(right.event), 'en');
    });
  }

  private reindexAnchors(anchors: AnchorItem[]): AnchorItem[] {
    return anchors.map((anchor, index) => ({
      ...anchor,
      id: `anchor_${String(index + 1).padStart(3, '0')}`
    }));
  }

  private buildAnchorFingerprint(anchor: AnchorItem): string {
    return [
      Number.isFinite(Number(anchor.year)) ? Math.round(Number(anchor.year)) : '',
      Number.isFinite(Number(anchor.month)) ? Math.round(Number(anchor.month)) : '',
      Number.isFinite(Number(anchor.age)) ? Math.round(Number(anchor.age)) : '',
      this.safeText(anchor.sphere).trim().toLowerCase(),
      this.safeText(anchor.location).trim().toLowerCase(),
      this.safeText(anchor.event).trim().toLowerCase(),
      this.safeText(anchor.worldview_shift).trim().toLowerCase(),
      this.safeText(anchor.outcome).trim().toLowerCase()
    ].join('|');
  }

  private buildFactFingerprint(fact: FactItem): string {
    return [
      Number.isFinite(Number(fact.year)) ? Math.round(Number(fact.year)) : '',
      Number.isFinite(Number(fact.age)) ? Math.round(Number(fact.age)) : '',
      this.safeText(fact.sphere).trim().toLowerCase(),
      this.safeText(fact.text).trim().toLowerCase(),
      this.safeText(fact.source_anchor_id).trim().toLowerCase(),
      fact.hook ? 'hook' : ''
    ].join('|');
  }

  private resolveAnchorTranslationKey(anchor: AnchorItem, index: number): string {
    return this.safeText(anchor.id).trim() || `anchor_${String(index + 1).padStart(3, '0')}`;
  }

  private resolveFactTranslationKey(fact: FactItem, index: number): string {
    return this.safeText(fact.id).trim() || `fact_${String(index + 1).padStart(3, '0')}`;
  }

  private buildAnchorCountTarget(preferredCount: number): number {
    return Math.min(MAX_ANCHORS_ALLOWED, Math.max(MIN_ANCHORS_REQUIRED, Math.round(preferredCount)));
  }

  private buildSingleAnchorPrompt(anchor: AnchorItem, index: number, comment: string): string {
    const targetCount = this.buildAnchorCountTarget(this.anchorCount);
    return [
      ANCHOR_STAGE_PROMPT_BASE,
      `Special task: keep the current draft timeline as stable as possible, but regenerate anchor #${index + 1}.`,
      `Return ${targetCount} anchors_timeline items in total.`,
      'Every non-target anchor should stay as close as possible to the current draft unless a tiny wording cleanup is needed for coherence.',
      'The regenerated target anchor must be materially different from the current one and must directly address the user correction below.',
      `Current target anchor JSON:\n${JSON.stringify(anchor, null, 2)}`,
      `Current draft anchors JSON:\n${JSON.stringify(this.anchors, null, 2)}`,
      `User correction for the target anchor:\n${comment}`,
      `Regeneration nonce: ${new Date().toISOString()}`
    ].join('\n\n');
  }

  private buildAdditionalAnchorPrompt(): string {
    const targetCount = this.buildAnchorCountTarget(this.anchorCount + 1);
    return [
      ANCHOR_STAGE_PROMPT_BASE,
      'Special task: preserve the current draft anchors as much as possible and add one new non-duplicate anchor.',
      `Return ${targetCount} anchors_timeline items in total.`,
      'The new anchor should fill a missing period, sphere, or causal gap, and it must not duplicate an existing event.',
      `Current draft anchors JSON:\n${JSON.stringify(this.anchors, null, 2)}`,
      `Regeneration nonce: ${new Date().toISOString()}`
    ].join('\n\n');
  }

  private buildFactCountTarget(preferredCount: number): number {
    return Math.max(1, Math.round(preferredCount || this.factBank.length || 1));
  }

  private buildSingleFactPrompt(fact: FactItem, index: number, comment: string): string {
    const targetCount = this.buildFactCountTarget(this.factBank.length);
    return [
      FACT_STAGE_PROMPT_BASE,
      `Special task: keep the current draft fact bank as stable as possible, but regenerate fact #${index + 1}.`,
      `Return exactly ${targetCount} fact_bank items in total.`,
      'Every non-target fact should stay as close as possible to the current draft unless a tiny wording cleanup is needed for coherence.',
      'The regenerated target fact must be materially different from the current one and must directly address the user correction below.',
      `Current target fact JSON:\n${JSON.stringify(fact, null, 2)}`,
      `Current draft fact_bank JSON:\n${JSON.stringify(this.factBank, null, 2)}`,
      `Anchors timeline JSON:\n${JSON.stringify(this.anchors, null, 2)}`,
      `User correction for the target fact:\n${comment}`,
      `Regeneration nonce: ${new Date().toISOString()}`
    ].join('\n\n');
  }

  private buildAdditionalFactPrompt(): string {
    const targetCount = this.buildFactCountTarget(this.factBank.length + 1);
    return [
      FACT_STAGE_PROMPT_BASE,
      'Special task: preserve the current draft fact bank as much as possible and add one new non-duplicate fact.',
      `Return exactly ${targetCount} fact_bank items in total.`,
      'The new fact should fill a missing period, sphere, routine, or causal consequence, and it must not duplicate an existing fact.',
      `Current draft fact_bank JSON:\n${JSON.stringify(this.factBank, null, 2)}`,
      `Anchors timeline JSON:\n${JSON.stringify(this.anchors, null, 2)}`,
      `Regeneration nonce: ${new Date().toISOString()}`
    ].join('\n\n');
  }

  private extractAnchorsFromApiResponse(data: ApiResponse): AnchorItem[] {
    const parsed = data.result?.parsedJson;
    if (Array.isArray(parsed?.anchors)) {
      return this.normalizeAnchorItems(parsed.anchors);
    }

    const pipelineStateCandidate = parsed?.pipeline_state || data.result?.pipeline || null;
    if (pipelineStateCandidate && typeof pipelineStateCandidate === 'object') {
      const anchors = Array.isArray((pipelineStateCandidate as Record<string, unknown>)['anchors_timeline'])
        ? ((pipelineStateCandidate as Record<string, unknown>)['anchors_timeline'] as unknown[])
        : [];
      return this.normalizeAnchorItems(anchors);
    }

    return [];
  }

  private extractFactsFromApiResponse(data: ApiResponse): FactItem[] {
    const parsed = data.result?.parsedJson;
    const pipelineStateCandidate = parsed?.pipeline_state || data.result?.pipeline || null;
    if (pipelineStateCandidate && typeof pipelineStateCandidate === 'object') {
      const facts = Array.isArray((pipelineStateCandidate as Record<string, unknown>)['fact_bank'])
        ? ((pipelineStateCandidate as Record<string, unknown>)['fact_bank'] as unknown[])
        : [];
      return this.normalizeFactItems(facts);
    }

    return [];
  }

  private pickReplacementAnchor(candidateAnchors: AnchorItem[], index: number): AnchorItem | null {
    const currentAnchor = this.anchors[index];
    if (!currentAnchor) {
      return null;
    }

    const currentFingerprint = this.buildAnchorFingerprint(currentAnchor);
    const excludedFingerprints = new Set(
      this.anchors.filter((_anchor, anchorIndex) => anchorIndex !== index).map((anchor) => this.buildAnchorFingerprint(anchor))
    );
    const sameIndexCandidate = candidateAnchors[index] || null;
    const pool = [sameIndexCandidate, ...candidateAnchors].filter((anchor): anchor is AnchorItem => Boolean(anchor));

    for (const candidate of pool) {
      const fingerprint = this.buildAnchorFingerprint(candidate);
      if (fingerprint && fingerprint !== currentFingerprint && !excludedFingerprints.has(fingerprint)) {
        return candidate;
      }
    }

    return pool.find((candidate) => this.buildAnchorFingerprint(candidate) !== currentFingerprint) || null;
  }

  private pickAdditionalAnchor(candidateAnchors: AnchorItem[]): AnchorItem | null {
    const existingFingerprints = new Set(this.anchors.map((anchor) => this.buildAnchorFingerprint(anchor)));
    const preferred = candidateAnchors.find(
      (candidate, index) => index >= this.anchorCount && !existingFingerprints.has(this.buildAnchorFingerprint(candidate))
    );
    if (preferred) {
      return preferred;
    }

    return candidateAnchors.find((candidate) => !existingFingerprints.has(this.buildAnchorFingerprint(candidate))) || null;
  }

  private pickReplacementFact(candidateFacts: FactItem[], index: number): FactItem | null {
    const currentFact = this.factBank[index];
    if (!currentFact) {
      return null;
    }

    const currentFingerprint = this.buildFactFingerprint(currentFact);
    const excludedFingerprints = new Set(
      this.factBank.filter((_fact, factIndex) => factIndex !== index).map((fact) => this.buildFactFingerprint(fact))
    );
    const sameIndexCandidate = candidateFacts[index] || null;
    const pool = [sameIndexCandidate, ...candidateFacts].filter((fact): fact is FactItem => Boolean(fact));

    for (const candidate of pool) {
      const fingerprint = this.buildFactFingerprint(candidate);
      if (fingerprint && fingerprint !== currentFingerprint && !excludedFingerprints.has(fingerprint)) {
        return candidate;
      }
    }

    return pool.find((candidate) => this.buildFactFingerprint(candidate) !== currentFingerprint) || null;
  }

  private pickAdditionalFact(candidateFacts: FactItem[]): FactItem | null {
    const existingFingerprints = new Set(this.factBank.map((fact) => this.buildFactFingerprint(fact)));
    const preferred = candidateFacts.find(
      (candidate, index) => index >= this.factBank.length && !existingFingerprints.has(this.buildFactFingerprint(candidate))
    );
    if (preferred) {
      return preferred;
    }

    return candidateFacts.find((candidate) => !existingFingerprints.has(this.buildFactFingerprint(candidate))) || null;
  }

  private buildFactCoverage(facts: FactItem[]): { coverage: Record<string, number>; hooksTotal: number } {
    const coverage = Object.keys(LIFE_SPHERE_LABELS).reduce<Record<string, number>>((acc, sphere) => {
      acc[sphere] = 0;
      return acc;
    }, {});

    for (const fact of facts) {
      const sphere = this.safeText(fact.sphere).trim();
      if (sphere) {
        coverage[sphere] = (coverage[sphere] || 0) + 1;
      }
    }

    return {
      coverage,
      hooksTotal: facts.filter((fact) => Boolean(fact.hook)).length
    };
  }

  private getFactTargetCount(): number {
    const normalizedPackages = Number((this.pipelineState as Record<string, unknown> | null)?.['fact_extension_packages']);
    const extensionPackages = Number.isFinite(normalizedPackages) ? Math.max(0, Math.round(normalizedPackages)) : 0;
    return FACTS_BASE_LIMIT + extensionPackages * FACTS_EXTENSION_STEP;
  }

  private getFactExtensionPackages(): number {
    const statePackages = Number((this.pipelineState as Record<string, unknown> | null)?.['fact_extension_packages']);
    if (Number.isFinite(statePackages)) {
      return Math.max(0, Math.round(statePackages));
    }

    const reportPackages = Number(
      ((this.pipelineState as Record<string, unknown> | null)?.['fact_bank_report'] as Record<string, unknown> | undefined)?.[
        'extension_packages'
      ]
    );
    return Number.isFinite(reportPackages) ? Math.max(0, Math.round(reportPackages)) : 0;
  }

  private resetNarrativeOutputs(state: Record<string, unknown>, message: string): void {
    state['legend_blocks'] = {};
    state['legend_full_text'] = '';
    state['legend_v1_final_json'] = {};
    state['blocks_report'] = { blocks_meta: {} };
    state['dating_site_texts'] = { profile_description: '', looking_for_partner: '' };
    state['qc_report'] = {
      checks: [],
      summary: { passed_checks: 0, total_checks: 0, ready: false },
      status: 'pending',
      message
    };
  }

  private commitAnchorTimeline(nextAnchors: AnchorItem[], mode: string, notice: string): void {
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }

    const normalizedAnchors = this.reindexAnchors(this.sortAnchorsChronologically(this.normalizeAnchorItems(nextAnchors)));
    const mutableState = this.pipelineState as Record<string, unknown>;
    mutableState['anchors_timeline'] = normalizedAnchors;
    mutableState['anchors_report'] = {
      ...(mutableState['anchors_report'] as Record<string, unknown> | undefined),
      count: normalizedAnchors.length,
      selected_mode: mode
    };
    mutableState['fact_bank'] = [];
    mutableState['fact_bank_report'] = {
      ...(mutableState['fact_bank_report'] as Record<string, unknown> | undefined),
      total_facts: 0,
      target_facts: this.getFactTargetCount(),
      hooks_total: 0,
      coverage_by_sphere: {},
      weak_spheres: Object.keys(LIFE_SPHERE_LABELS),
      extension_packages: Number((mutableState['fact_extension_packages'] as number | undefined) || 0)
    };
    this.resetNarrativeOutputs(mutableState, 'QC was reset after anchors were updated.');

    const pipelineMeta =
      mutableState['pipeline_meta'] && typeof mutableState['pipeline_meta'] === 'object'
        ? (mutableState['pipeline_meta'] as Record<string, unknown>)
        : {};
    pipelineMeta['last_completed_stage'] = this.isAnchorCountValid(normalizedAnchors.length) ? 'stage_1_anchors' : 'stage_0_canon';
    pipelineMeta['last_anchor_edit_at'] = new Date().toISOString();
    mutableState['pipeline_meta'] = pipelineMeta;

    this.pipelineState = mutableState;
    this.anchors = normalizedAnchors;
    this.factBank = [];
    this.legendBlocks = [];
    this.legendFullText = '';
    this.datingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.translatedAnchors = {};
    this.translatedFacts = {};
    this.translatedLegendBlocks = {};
    this.translatedLegendFullText = '';
    this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.qcChecks = [];
    this.qcSummary = '';
    this.selectedBlockKey = '';
    this.showFactsPanel = normalizedAnchors.length > 0;
    this.noticeMessage = notice;
    this.errorMessage = '';
    this.loadManualEditorsFromPipelineState(mutableState);
    this.selectedStageView = 'stage_1_anchors';
  }

  private commitFactBank(nextFacts: FactItem[], mode: string, notice: string): void {
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return;
    }

    const normalizedFacts = this.sortFactsChronologically(this.normalizeFactItems(nextFacts));
    const { coverage, hooksTotal } = this.buildFactCoverage(normalizedFacts);
    const mutableState = this.pipelineState as Record<string, unknown>;
    mutableState['fact_bank'] = normalizedFacts;
    mutableState['fact_bank_report'] = {
      ...(mutableState['fact_bank_report'] as Record<string, unknown> | undefined),
      total_facts: normalizedFacts.length,
      target_facts: this.getFactTargetCount(),
      hooks_total: hooksTotal,
      coverage_by_sphere: coverage,
      weak_spheres: Object.keys(LIFE_SPHERE_LABELS).filter((sphere) => (coverage[sphere] || 0) < 8),
      extension_packages: Number((mutableState['fact_extension_packages'] as number | undefined) || 0)
    };
    this.resetNarrativeOutputs(mutableState, 'QC was reset after facts were updated.');

    const pipelineMeta =
      mutableState['pipeline_meta'] && typeof mutableState['pipeline_meta'] === 'object'
        ? (mutableState['pipeline_meta'] as Record<string, unknown>)
        : {};
    pipelineMeta['last_completed_stage'] = normalizedFacts.length > 0 ? 'stage_2_fact_bank' : 'stage_1_anchors';
    pipelineMeta['last_fact_edit_at'] = new Date().toISOString();
    mutableState['pipeline_meta'] = pipelineMeta;

    this.pipelineState = mutableState;
    this.factBank = normalizedFacts;
    this.legendBlocks = [];
    this.legendFullText = '';
    this.datingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.translatedFacts = {};
    this.translatedLegendBlocks = {};
    this.translatedLegendFullText = '';
    this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.qcChecks = [];
    this.qcSummary = '';
    this.selectedBlockKey = '';
    this.showFactsPanel = this.factBank.length > 0 || this.anchors.length > 0;
    this.noticeMessage = notice;
    this.errorMessage = '';
    this.loadManualEditorsFromPipelineState(mutableState);
    this.selectedStageView = 'stage_2_fact_bank';
  }

  private normalizeDatingSiteTexts(candidate: unknown): DatingSiteTexts {
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? (candidate as Record<string, unknown>) : {};

    return {
      profile_description: this.safeText(source['profile_description'] ?? source['profileDescription']).trim(),
      looking_for_partner: this.safeText(source['looking_for_partner'] ?? source['lookingForPartner']).trim()
    };
  }

  private async runStageByKey(stageKey: StageKey): Promise<void> {
    if (stageKey === 'stage_0_canon') {
      await this.runCanon();
      return;
    }
    if (stageKey === 'stage_1_anchors') {
      await this.runAnchors();
      return;
    }
    if (stageKey === 'stage_2_fact_bank') {
      await this.runFacts();
      return;
    }
    if (stageKey === 'stage_3_blocks') {
      if (!this.canRunStage('stage_3_blocks') && this.canRunStage('stage_2_fact_bank')) {
        await this.runFacts();
      }
      await this.runNarrative();
      return;
    }
    if (!this.canRunStage('stage_4_qc') && !this.canRunStage('stage_3_blocks') && this.canRunStage('stage_2_fact_bank')) {
      await this.runFacts();
    }
    if (!this.canRunStage('stage_4_qc') && this.canRunStage('stage_3_blocks')) {
      await this.runNarrative();
    }
    await this.runQc();
  }

  private hasStageOutput(stageKey: StageKey): boolean {
    if (stageKey === 'stage_0_canon') {
      return Boolean(this.pipelineState) && !this.seedInputsDirty;
    }
    if (stageKey === 'stage_1_anchors') {
      return this.anchorCount > 0;
    }
    if (stageKey === 'stage_2_fact_bank') {
      return this.factBank.length > 0;
    }
    if (stageKey === 'stage_3_blocks') {
      return this.legendBlocks.length > 0 || Boolean(this.legendFullText.trim());
    }
    return this.qcChecks.length > 0 || Boolean(this.qcSummary.trim());
  }

  private async runStage(stageKey: StageKey, options: { stage3OutputMode?: Stage3OutputMode } = {}): Promise<void> {
    if (!this.canRunStage(stageKey)) {
      return;
    }
    if (!this.assertStagePrerequisites(stageKey)) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = {
        ...this.buildBasePayload(options.stage3OutputMode || 'blocks'),
        run_stage: stageKey,
        generation_type: 'type-flash'
      };
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    if (stageKey !== 'stage_0_canon') {
      payload['pipeline_state'] = this.pipelineState;
    }

    if (stageKey === 'stage_1_anchors') {
      payload['stage_prompts'] = {
        stage_1_anchors_prompt: ANCHOR_STAGE_PROMPT_BASE
      };
    }

    await this.sendRequest(payload);
  }

  private assertStagePrerequisites(stageKey: StageKey): boolean {
    if (stageKey === 'stage_0_canon') {
      if (this.personParseError) {
        this.errorMessage = this.personParseError;
        return false;
      }
      return true;
    }

    if (this.seedInputsDirty) {
      this.errorMessage = 'Source JSON or scales changed. Run step 1 again first.';
      return false;
    }

    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return false;
    }

    if (stageKey === 'stage_2_fact_bank') {
      const anchors = Array.isArray(this.pipelineState['anchors_timeline']) ? this.pipelineState['anchors_timeline'] : [];
      if (!this.isAnchorCountValid(anchors.length)) {
        this.errorMessage = `You need ${MIN_ANCHORS_REQUIRED}-${MAX_ANCHORS_ALLOWED} anchors before generating the fact bank. Current total: ${anchors.length}.`;
        return false;
      }
    }

    if (stageKey === 'stage_3_blocks') {
      const facts = Array.isArray(this.pipelineState['fact_bank']) ? this.pipelineState['fact_bank'] : [];
      if (facts.length === 0) {
        this.errorMessage = 'Run step 3 first to generate facts.';
        return false;
      }
    }

    if (stageKey === 'stage_4_qc') {
      const blocks = this.pipelineState['legend_blocks'];
      const hasBlocks = Boolean(blocks && typeof blocks === 'object' && Object.values(blocks as Record<string, unknown>).some((value) => this.safeText(value).trim()));
      if (!hasBlocks) {
        this.errorMessage = 'Run step 4b first to generate the final text.';
        return false;
      }
    }

    return true;
  }

  private hasCompletedStage(stageKey: StageKey): boolean {
    const pipelineMeta =
      this.pipelineState?.['pipeline_meta'] && typeof this.pipelineState['pipeline_meta'] === 'object'
        ? (this.pipelineState['pipeline_meta'] as Record<string, unknown>)
        : null;
    const lastCompletedStage = this.safeText(pipelineMeta?.['last_completed_stage']).trim() as StageKey;
    const currentIndex = STAGE_ORDER.indexOf(stageKey);
    const lastIndex = STAGE_ORDER.indexOf(lastCompletedStage);
    return currentIndex !== -1 && lastIndex !== -1 && lastIndex >= currentIndex;
  }

  private resolveCurrentStageKey(): StageKey {
    if (this.seedInputsDirty || !this.pipelineState) {
      return 'stage_0_canon';
    }

    const pipelineMeta =
      this.pipelineState['pipeline_meta'] && typeof this.pipelineState['pipeline_meta'] === 'object'
        ? (this.pipelineState['pipeline_meta'] as Record<string, unknown>)
        : null;
    const lastCompletedStage = this.safeText(pipelineMeta?.['last_completed_stage']).trim().toLowerCase() as StageKey;

    if (lastCompletedStage === 'stage_0_canon') return 'stage_1_anchors';
    if (lastCompletedStage === 'stage_1_anchors') return 'stage_2_fact_bank';
    if (lastCompletedStage === 'stage_2_fact_bank') return 'stage_3_blocks';
    if (lastCompletedStage === 'stage_3_blocks') return 'stage_4_qc';
    if (lastCompletedStage === 'stage_4_qc') return 'stage_4_qc';
    return 'stage_0_canon';
  }

  private getStageDefinition(stageKey: StageKey): StageDefinition {
    return this.stageDefinitions.find((stage) => stage.key === stageKey) || this.stageDefinitions[0];
  }

  private syncStageSelection(forceCurrent = false): void {
    const currentStage = this.resolveCurrentStageKey();
    if (forceCurrent || !this.isStageAccessible(this.selectedStageView)) {
      this.selectedStageView = currentStage;
    }
  }

  private buildBasePayload(stage3OutputMode: Stage3OutputMode): Record<string, unknown> {
    return {
      person: this.buildPersonPayload(),
      personality_profile: this.profile,
      fact_extension_packages: this.getFactExtensionPackages(),
      stage_3_output_mode: stage3OutputMode
    };
  }

  private buildPersonPayload(): Record<string, unknown> {
    const person = { ...this.parsePersonJson() };
    const extra = this.additionalContext.trim();
    if (extra) {
      const currentDescription = this.safeText(person['description']).trim();
      person['description'] = currentDescription ? `${currentDescription}\n\n${extra}` : extra;
    }
    return person;
  }

  private updatePersonJson(mutator: (person: Record<string, unknown>) => void): void {
    try {
      const person = JSON.parse(JSON.stringify(this.parsePersonJson())) as Record<string, unknown>;
      mutator(person);
      this.personJson = JSON.stringify(person, null, 2);
      this.invalidateParsedPersonCache();
      this.errorMessage = '';
      this.markSeedInputsDirty();
      this.selectedStageView = 'stage_0_canon';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  private readFirstAvailableValue(source: Record<string, unknown>, paths: string[]): unknown {
    for (const path of paths) {
      const value = this.readNestedValue(source, path);
      if (value !== undefined && value !== null && this.safeText(value).trim()) {
        return value;
      }
    }
    return '';
  }

  private readNestedValue(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object' || Array.isArray(acc)) {
        return undefined;
      }
      return (acc as Record<string, unknown>)[key];
    }, source);
  }

  private writeNestedValue(source: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cursor: Record<string, unknown> = source;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      const next =
        cursor[key] && typeof cursor[key] === 'object' && !Array.isArray(cursor[key]) ? (cursor[key] as Record<string, unknown>) : {};
      cursor[key] = next;
      cursor = next;
    }

    cursor[parts[parts.length - 1]] = value;
  }

  private normalizeNumericInput(value: string): number | '' {
    const trimmed = this.safeText(value).trim();
    if (!trimmed) {
      return '';
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? Math.round(numeric) : '';
  }

  private parsePersonJson(): Record<string, unknown> {
    this.inspectPersonJson();
    if (this.parsedPersonCacheError || !this.parsedPersonCacheValue) {
      throw new Error(this.parsedPersonCacheError || 'The source must be a JSON object.');
    }
    return this.parsedPersonCacheValue;
  }

  private safeParsePersonJson(): Record<string, unknown> | null {
    this.inspectPersonJson();
    return this.parsedPersonCacheValue;
  }

  private inspectPersonJson(): void {
    if (this.parsedPersonCacheSource === this.personJson) {
      return;
    }

    this.parsedPersonCacheSource = this.personJson;
    this.parsedPersonCacheValue = null;
    this.parsedPersonCacheError = '';

    try {
      const parsed = JSON.parse(this.personJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('The source must be a JSON object.');
      }
      this.parsedPersonCacheValue = parsed as Record<string, unknown>;
    } catch (error) {
      this.parsedPersonCacheError = error instanceof Error ? error.message : String(error);
    }
  }

  private invalidateParsedPersonCache(): void {
    this.parsedPersonCacheSource = '';
  }

  private getPersonParseError(): string {
    this.inspectPersonJson();
    return this.parsedPersonCacheError;
  }

  private markSeedInputsDirty(preserveConsistencyReport = false): void {
    this.seedInputsDirty = true;
    if (!preserveConsistencyReport) {
      this.canonConsistencyReport = null;
      this.canonIssueResolutionMap = {};
      this.showCanonConsistencyCard = false;
    }
    this.selectedStageView = 'stage_0_canon';
  }

  private resolveAgeLabel(person: Record<string, unknown>): string {
    const directAge = Number(person['age']);
    if (Number.isFinite(directAge) && directAge > 0) {
      return `${Math.round(directAge)} y.o.`;
    }

    const birthYear = this.parseYear(person['birth_year'] || person['birth_date']);
    if (birthYear === null || !Number.isFinite(birthYear)) {
      return '';
    }

    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;
    return age > 0 ? `${age} y.o.` : '';
  }

  private resolveCurrentLocation(person: Record<string, unknown>): string {
    const currentLocation =
      person['current_location'] && typeof person['current_location'] === 'object' && !Array.isArray(person['current_location'])
        ? (person['current_location'] as Record<string, unknown>)
        : null;

    const city = this.safeText(currentLocation?.['city'] || person['city']).trim();
    const country = this.safeText(currentLocation?.['country'] || person['country']).trim();
    const since = this.safeText(currentLocation?.['since']).trim();
    const fallback = this.safeText(person['birth_place']).trim();

    const label = [city, country].filter(Boolean).join(', ');
    if (label && since) {
      return `${label} | since ${since}`;
    }
    return label || fallback;
  }

  private resolveJobLabel(person: Record<string, unknown>): string {
    const job = person['job'] && typeof person['job'] === 'object' && !Array.isArray(person['job']) ? (person['job'] as Record<string, unknown>) : null;
    const title = this.safeText(job?.['title'] || person['occupation']).trim();
    const company = this.safeText(job?.['company']).trim();
    const location = this.safeText(job?.['location']).trim();
    return [title, company, location].filter(Boolean).join(' | ');
  }

  private resolveEducationLabel(person: Record<string, unknown>): string {
    const education =
      person['education'] && typeof person['education'] === 'object' && !Array.isArray(person['education'])
        ? (person['education'] as Record<string, unknown>)
        : null;
    const degree = this.safeText(education?.['degree']).trim();
    const specialization = this.safeText(education?.['specialization']).trim();
    const institution = this.safeText(education?.['institution']).trim();
    return [degree, specialization, institution].filter(Boolean).join(' | ');
  }

  private resolveLanguagesLabel(person: Record<string, unknown>): string {
    const languages = Array.isArray(person['languages']) ? person['languages'] : [];
    return languages
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return this.safeText(item).trim();
        }
        return this.safeText((item as Record<string, unknown>)['language']).trim();
      })
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
  }

  private resolveChildrenLabel(person: Record<string, unknown>): string {
    const children = Array.isArray(person['children']) ? person['children'] : [];
    if (children.length === 0) {
      return 'No children listed';
    }
    return `${children.length} child${children.length > 1 ? 'ren' : ''}`;
  }

  private truncateText(value: string, maxLength: number): string {
    const normalized = this.safeText(value).replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 1).trim()}...`;
  }

  private sortFactsChronologically(facts: FactItem[]): FactItem[] {
    return [...facts].sort((left, right) => {
      const leftYear = Number(left.year);
      const rightYear = Number(right.year);
      const leftAge = Number(left.age);
      const rightAge = Number(right.age);
      const leftTimeline = Number.isFinite(leftYear) ? leftYear : Number.isFinite(leftAge) ? leftAge : -1;
      const rightTimeline = Number.isFinite(rightYear) ? rightYear : Number.isFinite(rightAge) ? rightAge : -1;

      if (leftTimeline !== rightTimeline) {
        return rightTimeline - leftTimeline;
      }

      if (Boolean(left.hook) !== Boolean(right.hook)) {
        return left.hook ? -1 : 1;
      }

      return this.safeText(left.text).localeCompare(this.safeText(right.text), 'en');
    });
  }

  private buildTopTraitsFromProfile(profile: Record<string, number>): Array<{ key: string; label: string; value: number }> {
    return this.criteria
      .map((criterion) => ({
        key: criterion.key,
        label: criterion.label,
        value: Number(profile[criterion.key])
      }))
      .sort((left, right) => right.value - left.value);
  }

  private syncProfileIntoPipelineState(): void {
    if (!this.pipelineState) {
      return;
    }

    const normalizedProfile = this.criteria.reduce((acc, criterion) => {
      const value = Number(this.profile[criterion.key]);
      acc[criterion.key] = Number.isFinite(value) ? Math.min(10, Math.max(1, Math.round(value))) : 5;
      return acc;
    }, {} as Record<string, number>);

    const mutableState = this.pipelineState as Record<string, unknown>;
    const canon =
      mutableState['canon'] && typeof mutableState['canon'] === 'object' ? (mutableState['canon'] as Record<string, unknown>) : null;
    if (canon) {
      canon['personality_profile'] = normalizedProfile;
      canon['top_traits'] = this.buildTopTraitsFromProfile(normalizedProfile);
    }

    const pipelineMeta =
      mutableState['pipeline_meta'] && typeof mutableState['pipeline_meta'] === 'object'
        ? (mutableState['pipeline_meta'] as Record<string, unknown>)
        : {};
    const consistencyReport =
      pipelineMeta['canon_profile_consistency'] && typeof pipelineMeta['canon_profile_consistency'] === 'object'
        ? (pipelineMeta['canon_profile_consistency'] as Record<string, unknown>)
        : {};

    pipelineMeta['canon_profile_consistency'] = {
      ...consistencyReport,
      status: 'not_checked',
      passed: null,
      summary: 'Local scale values changed. Run the check again if needed.',
      checked_at: new Date().toISOString()
    };

    mutableState['pipeline_meta'] = pipelineMeta;
    this.pipelineState = mutableState;
  }

  private findCriterionForIssue(issue: string): CriterionDefinition | null {
    const normalizedIssue = this.safeText(issue).trim();
    if (!normalizedIssue) {
      return null;
    }

    const keyPrefixMatch = normalizedIssue.match(/^([a-z_]+)\s*:/i);
    const prefixedKey = this.safeText(keyPrefixMatch?.[1]).trim().toLowerCase();
    if (prefixedKey) {
      const byKey = this.criteria.find((criterion) => criterion.key === prefixedKey);
      if (byKey) {
        return byKey;
      }
    }

    const anyInlineKeyMatch = normalizedIssue.match(/\(([a-z_]+)\)/i);
    const inlineKey = this.safeText(anyInlineKeyMatch?.[1]).trim().toLowerCase();
    if (inlineKey) {
      const byInlineKey = this.criteria.find((criterion) => criterion.key === inlineKey);
      if (byInlineKey) {
        return byInlineKey;
      }
    }

    const quotedLabelMatch = normalizedIssue.match(/шкал[аыи]\s+[«'"]([^»'"]+)[»'"]/i);
    const quotedLabel = this.safeText(quotedLabelMatch?.[1]).trim().toLowerCase();
    if (quotedLabel) {
      const exactMatch = this.criteria.find((criterion) => criterion.label.toLowerCase() === quotedLabel);
      if (exactMatch) {
        return exactMatch;
      }

      const partialMatch = this.criteria.find(
        (criterion) => quotedLabel.includes(criterion.label.toLowerCase()) || criterion.label.toLowerCase().includes(quotedLabel)
      );
      if (partialMatch) {
        return partialMatch;
      }
    }

    const loweredIssue = normalizedIssue.toLowerCase();
    const directMatch = this.criteria.find((criterion) => loweredIssue.includes(criterion.label.toLowerCase()));
    if (directMatch) {
      return directMatch;
    }

    for (const criterion of this.criteria) {
      const patterns = CRITERION_ISSUE_PATTERNS[criterion.key] || [];
      if (patterns.some((pattern) => pattern.test(normalizedIssue))) {
        return criterion;
      }
    }

    return null;
  }

  private detectIssueDirection(issue: string, currentValue: number): 'increase' | 'decrease' | null {
    const loweredIssue = this.safeText(issue).trim().toLowerCase();
    if (!loweredIssue) {
      return null;
    }

    const hasHighSignal =
      /\bвысок\w*/i.test(loweredIssue) ||
      loweredIssue.includes('вверх') ||
      loweredIssue.includes('initiates_sex') ||
      loweredIssue.includes('fantasies') ||
      loweredIssue.includes('income_level') ||
      loweredIssue.includes('соответствует высокому') ||
      loweredIssue.includes('указывает на высокий') ||
      loweredIssue.includes('признак высокого');
    const hasLowSignal =
      /\bнизк\w*/i.test(loweredIssue) ||
      loweredIssue.includes('вниз') ||
      loweredIssue.includes('завыш') ||
      loweredIssue.includes('соответствует низкому') ||
      loweredIssue.includes('указывает на низкий');

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
    if (loweredIssue.includes('противоречит') && !hasLowSignal) {
      return 'increase';
    }
    return null;
  }

  private resolveSuggestedValue(issue: string, direction: 'increase' | 'decrease'): number {
    const normalizedIssue = this.safeText(issue).trim();
    const rangeMatch = normalizedIssue.match(/\((\d{1,2})\s*-\s*(\d{1,2})\)/);
    if (rangeMatch) {
      const rangeStart = Number(rangeMatch[1]);
      const rangeEnd = Number(rangeMatch[2]);
      if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
        const lower = Math.min(rangeStart, rangeEnd);
        const upper = Math.max(rangeStart, rangeEnd);
        return direction === 'increase' ? lower : upper;
      }
    }

    return direction === 'increase' ? 8 : 3;
  }

  private parseCanonIssueResolution(rawResolution: unknown): CanonConsistencyIssueResolution | null {
    if (!rawResolution || typeof rawResolution !== 'object' || Array.isArray(rawResolution)) {
      return null;
    }

    const source = rawResolution as Record<string, unknown>;
    const issue = this.safeText(source['issue']).trim();
    const traitKey = this.safeText(source['trait_key'] || source['traitKey']).trim();
    const currentValue = Number(source['current_value'] ?? source['currentValue']);
    const suggestedValue = Number(source['suggested_value'] ?? source['suggestedValue']);
    if (!issue || !traitKey || !Number.isFinite(currentValue) || !Number.isFinite(suggestedValue)) {
      return null;
    }

    const trait = this.criteria.find((criterion) => criterion.key === traitKey);
    const normalizedCurrent = Math.min(10, Math.max(1, Math.round(currentValue)));
    const normalizedSuggested = Math.min(10, Math.max(1, Math.round(suggestedValue)));
    if (normalizedCurrent === normalizedSuggested) {
      return null;
    }

    const delta = normalizedSuggested - normalizedCurrent;
    return {
      issue,
      trait_key: traitKey,
      trait_label: this.safeText(source['trait_label'] || source['traitLabel'] || trait?.label || traitKey).trim(),
      current_value: normalizedCurrent,
      suggested_value: normalizedSuggested,
      delta,
      direction: this.safeText(source['direction'] || (delta > 0 ? 'increase' : 'decrease')).trim().toLowerCase(),
      action_label:
        this.safeText(source['action_label'] || source['actionLabel']).trim() ||
        `${delta > 0 ? 'Increase' : 'Decrease'} "${this.safeText(source['trait_label'] || source['traitLabel'] || trait?.label || traitKey).trim()}" to ${normalizedSuggested}/10`,
      reason: this.safeText(source['reason']).trim() || null,
      source_field: this.safeText(source['source_field'] || source['sourceField']).trim() || null
    };
  }

  private buildFallbackCanonIssueResolution(issue: string): CanonConsistencyIssueResolution | null {
    const normalizedIssue = this.safeText(issue).trim();
    if (!normalizedIssue) {
      return null;
    }

    const criterion = this.findCriterionForIssue(normalizedIssue);
    if (!criterion) {
      return null;
    }

    const explicitScoreMatch = normalizedIssue.match(/=\s*(\d{1,2})\s*\/\s*10/);
    const mediumScoreMatch = normalizedIssue.match(/средн\w*\s+значени\w*\s*\((\d{1,2})\)/i);
    const currentValueRaw = Number.isFinite(Number(explicitScoreMatch?.[1]))
      ? Number(explicitScoreMatch?.[1])
      : Number.isFinite(Number(mediumScoreMatch?.[1]))
        ? Number(mediumScoreMatch?.[1])
        : Number(this.profile[criterion.key]);
    const currentValue = Math.min(10, Math.max(1, Math.round(currentValueRaw)));
    if (!Number.isFinite(currentValue)) {
      return null;
    }

    const direction = this.detectIssueDirection(normalizedIssue, currentValue);
    if (!direction) {
      return null;
    }

    const suggestedValue = this.resolveSuggestedValue(normalizedIssue, direction);
    if (currentValue === suggestedValue) {
      return null;
    }

    const delta = suggestedValue - currentValue;
    return {
      issue: normalizedIssue,
      trait_key: criterion.key,
      trait_label: criterion.label,
      current_value: currentValue,
      suggested_value: suggestedValue,
      delta,
      direction,
      action_label: `${direction === 'increase' ? 'Increase' : 'Decrease'} "${criterion.label}" to ${suggestedValue}/10`,
      reason: 'Suggestion inferred from the conflict text.',
      source_field: null
    };
  }

  private parseCanonConsistencyReport(rawReport: unknown): CanonConsistencyReport | null {
    if (!rawReport || typeof rawReport !== 'object' || Array.isArray(rawReport)) {
      this.canonIssueResolutionMap = {};
      return null;
    }

    const source = rawReport as Record<string, unknown>;
    const issues = Array.isArray(source['issues']) ? source['issues'].map((item) => this.safeText(item)).filter(Boolean) : [];
    const issueResolutionMap: Record<string, CanonConsistencyIssueResolution> = {};
    const rawResolutions = Array.isArray(source['issue_resolutions']) ? source['issue_resolutions'] : [];

    for (const rawResolution of rawResolutions) {
      const resolution = this.parseCanonIssueResolution(rawResolution);
      if (resolution) {
        issueResolutionMap[resolution.issue] = resolution;
      }
    }

    for (const issue of issues) {
      if (issueResolutionMap[issue]) {
        continue;
      }
      const fallbackResolution = this.buildFallbackCanonIssueResolution(issue);
      if (fallbackResolution) {
        issueResolutionMap[issue] = fallbackResolution;
      }
    }

    this.canonIssueResolutionMap = issueResolutionMap;
    return {
      status: this.safeText(source['status'] || 'not_checked'),
      passed: typeof source['passed'] === 'boolean' ? Boolean(source['passed']) : null,
      summary: this.safeText(source['summary']),
      issues,
      heuristic_issues: Array.isArray(source['heuristic_issues']) ? source['heuristic_issues'].map((item) => this.safeText(item)) : [],
      issue_resolutions: issues
        .map((issue) => issueResolutionMap[issue])
        .filter((item): item is CanonConsistencyIssueResolution => Boolean(item)),
      checked_at: source['checked_at'] ? this.safeText(source['checked_at']) : null,
      source: source['source'] ? this.safeText(source['source']) : null,
      model: source['model'] ? this.safeText(source['model']) : null,
      endpoint_mode: source['endpoint_mode'] ? this.safeText(source['endpoint_mode']) : null,
      warning: source['warning'] ? this.safeText(source['warning']) : null
    };
  }

  private loadCanonConsistencyFromPipelineState(state: Record<string, unknown>): void {
    const pipelineMeta =
      state['pipeline_meta'] && typeof state['pipeline_meta'] === 'object' ? (state['pipeline_meta'] as Record<string, unknown>) : null;
    const rawReport =
      pipelineMeta?.['canon_profile_consistency'] && typeof pipelineMeta['canon_profile_consistency'] === 'object'
        ? (pipelineMeta['canon_profile_consistency'] as Record<string, unknown>)
        : null;

    if (!rawReport) {
      this.canonConsistencyReport = null;
      this.canonIssueResolutionMap = {};
      this.showCanonConsistencyCard = false;
      return;
    }

    this.canonConsistencyReport = this.parseCanonConsistencyReport(rawReport);
  }

  private applyManualEditsToPipelineState(): boolean {
    if (!this.pipelineState) {
      this.errorMessage = 'Run step 1 first to get pipeline_state.';
      return false;
    }

    try {
      const anchors = JSON.parse(this.editableAnchorsJson);
      const facts = JSON.parse(this.editableFactsJson);

      if (!Array.isArray(anchors)) {
        throw new Error('Anchors editor must contain a JSON array.');
      }
      if (!Array.isArray(facts)) {
        throw new Error('Fact editor must contain a JSON array.');
      }

      const normalizedAnchors = this.normalizeAnchorItems(anchors);
      const normalizedFacts = this.sortFactsChronologically(this.normalizeFactItems(facts));
      const { coverage, hooksTotal } = this.buildFactCoverage(normalizedFacts);
      const mutableState = this.pipelineState as Record<string, unknown>;
      mutableState['anchors_timeline'] = normalizedAnchors;
      mutableState['fact_bank'] = normalizedFacts;
      this.anchors = normalizedAnchors;
      this.factBank = normalizedFacts;
      mutableState['anchors_report'] = {
        ...(mutableState['anchors_report'] as Record<string, unknown> | undefined),
        count: normalizedAnchors.length,
        selected_mode: 'manual_edit'
      };
      mutableState['fact_bank_report'] = {
        ...(mutableState['fact_bank_report'] as Record<string, unknown> | undefined),
        total_facts: normalizedFacts.length,
        target_facts: this.getFactTargetCount(),
        hooks_total: hooksTotal,
        coverage_by_sphere: coverage,
        weak_spheres: Object.entries(coverage)
          .filter(([, count]) => count < 8)
          .map(([sphere]) => sphere),
        extension_packages: this.getFactExtensionPackages()
      };

      this.pipelineState = mutableState;
      this.manualEditsDirty = false;
      this.translatedAnchors = {};
      this.translatedFacts = {};
      this.translatedLegendBlocks = {};
      this.translatedLegendFullText = '';
      this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
      this.manualEditStatus = `Edits applied: anchors=${normalizedAnchors.length}, facts=${normalizedFacts.length}, hooks=${hooksTotal}.`;
      this.errorMessage = '';
      return true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private loadManualEditorsFromPipelineState(state: Record<string, unknown>): void {
    const anchors = Array.isArray(state['anchors_timeline']) ? state['anchors_timeline'] : [];
    const facts = Array.isArray(state['fact_bank']) ? state['fact_bank'] : [];
    this.editableAnchorsJson = JSON.stringify(anchors, null, 2);
    this.editableFactsJson = JSON.stringify(facts, null, 2);
    this.manualEditsDirty = false;
    this.manualEditStatus = '';
  }

  private clearPipelineState(): void {
    this.pipelineState = null;
    this.anchors = [];
    this.factBank = [];
    this.legendBlocks = [];
    this.translationLoading = false;
    this.legendFullText = '';
    this.datingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.selectedBlockKey = '';
    this.qcChecks = [];
    this.qcSummary = '';
    this.anchorRegenerationIndex = null;
    this.anchorRegenerationComment = '';
    this.factRegenerationIndex = null;
    this.factRegenerationComment = '';
    this.editableAnchorsJson = '';
    this.editableFactsJson = '';
    this.manualEditsDirty = false;
    this.manualEditStatus = '';
    this.canonConsistencyReport = null;
    this.canonIssueResolutionMap = {};
    this.showCanonConsistencyCard = false;
    this.showFactsPanel = false;
    this.translatedAnchors = {};
    this.translatedFacts = {};
    this.translatedLegendBlocks = {};
    this.translatedLegendFullText = '';
    this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
    this.selectedStageView = 'stage_0_canon';
  }

  private resolveRequestTimeoutMs(payload: Record<string, unknown>): number {
    const stage = this.safeText(payload['run_stage']).trim().toLowerCase();
    const timeout = stage ? STAGE_REQUEST_TIMEOUTS_MS[stage] : undefined;
    if (Number.isFinite(timeout) && timeout && timeout > 0) {
      return timeout;
    }
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private async sendRequest(payload: Record<string, unknown>): Promise<void> {
    await this.executeApiRequest(payload, { mutateState: true });
  }

  private async executeApiRequest(payload: Record<string, unknown>, options: { mutateState?: boolean } = {}): Promise<ApiResponse | null> {
    const mutateState = options.mutateState !== false;
    const stageCandidate = this.safeText(payload['run_stage']).trim().toLowerCase();
    const requestedStageKey = STAGE_ORDER.includes(stageCandidate as StageKey) ? (stageCandidate as StageKey) : null;

    this.loading = true;
    this.runningStageKey = requestedStageKey;
    this.errorMessage = '';
    this.noticeMessage = '';

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutMs = this.resolveRequestTimeoutMs(payload);

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const raw = await response.text();
      const data = this.tryParseApiJson(raw);
      if (!response.ok) {
        throw new Error(this.extractBackendError(data, raw) || `Backend error (HTTP ${response.status}).`);
      }
      if (!data) {
        throw new Error('Backend returned a non-JSON response.');
      }

      if (mutateState) {
        this.consumeBackendResponse(data);
        if (requestedStageKey) {
          this.clearTranslationsForStage(requestedStageKey);
        }
      }
      if (mutateState && this.safeText(payload['run_stage']).trim().toLowerCase() === 'stage_0_canon' && this.pipelineState) {
        this.seedInputsDirty = false;
      }
      return data;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.errorMessage = `Request timeout (${Math.round(timeoutMs / 1000)} seconds).`;
      } else {
        this.errorMessage = error instanceof Error ? error.message : String(error);
      }
      return null;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.loading = false;
      this.runningStageKey = null;
      this.view.refresh();
    }
  }

  private consumeBackendResponse(data: ApiResponse): void {
    const result = data.result;
    const parsed = result?.parsedJson;
    const pipelineStateCandidate = parsed?.pipeline_state || result?.pipeline || null;
    const pipelineStateRecord =
      pipelineStateCandidate && typeof pipelineStateCandidate === 'object' ? (pipelineStateCandidate as Record<string, unknown>) : null;
    const anchorsSource = Array.isArray(parsed?.anchors)
      ? parsed.anchors
      : Array.isArray(pipelineStateRecord?.['anchors_timeline'])
        ? (pipelineStateRecord['anchors_timeline'] as unknown[])
        : [];

    this.noticeMessage = data.warning ? this.safeText(data.warning) : '';
    this.summary = parsed?.short_summary || '';
    this.legendFullText = this.safeText(parsed?.legend_full_text || pipelineStateRecord?.['legend_full_text']).trim();
    this.anchors = this.normalizeAnchorItems(anchorsSource);
    this.datingSiteTexts = this.normalizeDatingSiteTexts(
      parsed?.dating_site_texts || (pipelineStateRecord?.['dating_site_texts'] as DatingSiteTexts | undefined)
    );

    const legendMap =
      parsed?.legend ||
      parsed?.legend_blocks ||
      parsed?.legend_v1_final_json ||
      ((pipelineStateRecord?.['legend_blocks'] as Record<string, string> | undefined) || {}) ||
      ((pipelineStateRecord?.['legend_v1_final_json'] as Record<string, string> | undefined) || {});
    const blocksMeta = parsed?.blocks_report?.blocks_meta || {};
    this.legendBlocks = Object.entries(legendMap)
      .map(([key, text]) => ({
        key,
        label: LEGEND_BLOCK_DEFINITIONS.find((block) => block.key === key)?.label || this.humanizeBlockKey(key),
        text: this.safeText(text),
        factsUsed: Number(blocksMeta[key]?.facts_used || 0),
        hooksUsed: Number(blocksMeta[key]?.hooks_used || 0)
      }))
      .filter((block) => block.text.trim().length > 0);

    const qcSummary = parsed?.qc_report?.summary;
    this.qcChecks = Array.isArray(parsed?.qc_report?.checks) ? parsed?.qc_report?.checks || [] : [];
    this.qcSummary = qcSummary
      ? `${qcSummary.passed_checks || 0}/${qcSummary.total_checks || 0} checks passed. Ready: ${qcSummary.ready ? 'yes' : 'no'}`
      : '';

    if (pipelineStateCandidate && typeof pipelineStateCandidate === 'object') {
      this.pipelineState = pipelineStateCandidate;
      this.factBank = Array.isArray((pipelineStateCandidate as Record<string, unknown>)['fact_bank'])
        ? this.sortFactsChronologically(this.normalizeFactItems((pipelineStateCandidate as Record<string, unknown>)['fact_bank'] as unknown[]))
        : [];
      this.loadCanonConsistencyFromPipelineState(pipelineStateCandidate);
      this.loadManualEditorsFromPipelineState(pipelineStateCandidate);
      if (!this.noticeMessage) {
        this.noticeMessage = this.resolveSuccessMessage(pipelineStateCandidate);
      }
    } else {
      this.clearPipelineState();
    }

    if (!this.legendBlocks.some((block) => block.key === this.selectedBlockKey)) {
      this.selectedBlockKey = this.legendBlocks[0]?.key || '';
    }
    this.showFactsPanel = this.factBank.length > 0 || this.anchors.length > 0;
    this.syncStageSelection();
  }

  private consumeCanonConsistencyResponse(data: ApiResponse): void {
    const result = data.result;
    const report = result?.consistencyReport || null;
    const pipelineStateCandidate = result?.pipeline || null;

    if (pipelineStateCandidate && typeof pipelineStateCandidate === 'object') {
      this.pipelineState = pipelineStateCandidate;
      this.loadCanonConsistencyFromPipelineState(pipelineStateCandidate);
      this.loadManualEditorsFromPipelineState(pipelineStateCandidate);
    } else if (report) {
      this.canonConsistencyReport = this.parseCanonConsistencyReport(report);
    }

    this.showCanonConsistencyCard = Boolean(this.canonConsistencyReport);

    if (data.warning) {
      this.noticeMessage = this.safeText(data.warning);
      return;
    }

    if (this.canonConsistencyReport?.status === 'passed') {
      this.noticeMessage = 'Canon vs scales check passed.';
    } else if (this.canonConsistencyReport?.status === 'failed') {
      this.noticeMessage = 'Canon vs scales check finished with contradictions.';
    } else {
      this.noticeMessage = 'Canon vs scales check finished.';
    }

    this.selectedStageView = 'stage_0_canon';
  }

  private clearTranslationsForStage(stageKey: StageKey): void {
    if (stageKey === 'stage_0_canon') {
      this.translatedAnchors = {};
      this.translatedFacts = {};
      this.translatedLegendBlocks = {};
      this.translatedLegendFullText = '';
      this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
      return;
    }

    if (stageKey === 'stage_1_anchors') {
      this.translatedAnchors = {};
      this.translatedFacts = {};
      this.translatedLegendBlocks = {};
      this.translatedLegendFullText = '';
      this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
      return;
    }

    if (stageKey === 'stage_2_fact_bank') {
      this.translatedFacts = {};
      this.translatedLegendBlocks = {};
      this.translatedLegendFullText = '';
      this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
      return;
    }

    if (stageKey === 'stage_3_blocks') {
      this.translatedLegendBlocks = {};
      this.translatedLegendFullText = '';
      this.translatedDatingSiteTexts = { profile_description: '', looking_for_partner: '' };
    }
  }

  private async executeTranslationRequest(payload: Record<string, unknown>, options: { manageLoading?: boolean } = {}): Promise<TranslateApiResponse | null> {
    const manageLoading = options.manageLoading !== false;
    if (manageLoading) {
      if (this.isBusy) {
        return null;
      }
      this.translationLoading = true;
      this.errorMessage = '';
      this.noticeMessage = '';
    }

    try {
      const response = await fetch(this.translateOutputApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const raw = await response.text();
      const data = raw ? (JSON.parse(raw) as TranslateApiResponse) : null;
      if (!response.ok) {
        throw new Error(this.extractTranslationError(data, raw) || `Translation error (HTTP ${response.status}).`);
      }

      if (!data) {
        throw new Error('Translator returned a non-JSON response.');
      }

      return data;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      if (manageLoading) {
        this.translationLoading = false;
        this.view.refresh();
      }
    }
  }

  private async translatePlainTextValue(text: string): Promise<string> {
    const data = await this.executeTranslationRequest(
      {
        mode: 'text',
        target_language: 'Russian',
        generation_type: 'type-flash',
        text
      },
      { manageLoading: false }
    );
    const translatedText = this.safeText(data?.result?.translated_text).trim();
    if (!translatedText) {
      throw new Error('Translator did not return translated text.');
    }
    return translatedText;
  }

  private resolveSuccessMessage(state: Record<string, unknown>): string {
    const pipelineMeta =
      state['pipeline_meta'] && typeof state['pipeline_meta'] === 'object' ? (state['pipeline_meta'] as Record<string, unknown>) : null;
    const lastCompletedStage = this.safeText(pipelineMeta?.['last_completed_stage']).trim().toLowerCase();

    if (lastCompletedStage === 'stage_0_canon') return 'Step 1 completed. Canon is ready.';
    if (lastCompletedStage === 'stage_1_anchors') return 'Step 2 completed. Anchors are ready.';
    if (lastCompletedStage === 'stage_2_fact_bank') return 'Step 3 completed. Fact bank is ready.';
    if (lastCompletedStage === 'stage_3_blocks') return 'Step 4b completed. Full profile text and dating-site copy are ready.';
    if (lastCompletedStage === 'stage_4_qc') return 'Quality check refreshed.';
    return '';
  }

  private humanizeBlockKey(key: string): string {
    const knownLabel = LEGEND_BLOCK_DEFINITIONS.find((block) => block.key === key)?.label;
    if (knownLabel) {
      return knownLabel;
    }

    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[_\s]+/)
      .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
      .join(' ');
  }

  private safeText(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  private parseYear(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    const match = this.safeText(value).match(/(19|20)\d{2}/);
    return match ? Number(match[0]) : null;
  }

  private renderInlineMarkdownBold(text: string): string {
    const escaped = this.escapeHtml(text);
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private resolveApiUrl(): string {
    if (typeof window === 'undefined' || !window.location) {
      return 'http://localhost:3001/api/generate-profile';
    }

    const { protocol, hostname, origin, port } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const isDevHost = isLocalHost && (port === '4200' || port === '5173');

    if (protocol === 'http:' && isDevHost) {
      return 'http://localhost:3001/api/generate-profile';
    }

    return `${origin}/api/generate-profile`;
  }

  private resolveCanonConsistencyApiUrl(): string {
    return this.resolveApiUrl().replace('/api/generate-profile', '/api/check-canon-consistency');
  }

  private resolveTranslateOutputApiUrl(): string {
    return this.resolveApiUrl().replace('/api/generate-profile', '/api/translate-output');
  }

  private tryParseApiJson(raw: string): ApiResponse | null {
    try {
      return raw ? (JSON.parse(raw) as ApiResponse) : null;
    } catch {
      return null;
    }
  }

  private extractBackendError(data: ApiResponse | null, raw: string): string {
    const error = data?.error ? this.safeText(data.error) : '';
    const details = Array.isArray(data?.details)
      ? data.details.map((item) => this.safeText(item)).filter(Boolean).join(' | ')
      : data?.details
        ? this.safeText(data.details)
        : '';

    if (error && details) {
      return `${error}: ${details}`;
    }
    if (error) {
      return error;
    }
    return this.safeText(raw).trim().slice(0, 600);
  }

  private extractTranslationError(data: TranslateApiResponse | null, raw: string): string {
    const error = data?.error ? this.safeText(data.error) : '';
    const details =
      data?.details && typeof data.details === 'object'
        ? JSON.stringify(data.details)
        : data?.details
          ? this.safeText(data.details)
          : '';

    if (error && details) {
      return `${error}: ${details}`;
    }
    if (error) {
      return error;
    }
    if (details) {
      return details;
    }
    return this.safeText(raw).trim().slice(0, 600);
  }
}
