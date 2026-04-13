import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

type CriterionDefinition = {
  key: string;
  label: string;
  minLabel: string;
  maxLabel: string;
};

type AnchorItem = {
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

type FactItem = {
  id?: string;
  text?: string;
  sphere?: string;
  year?: number | null;
  age?: number | null;
  hook?: boolean;
};

type LegendBlock = {
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

type QcCheck = {
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

type ParsedLegendResponse = {
  short_summary?: string;
  legend_full_text?: string;
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

type PreviewCard = {
  label: string;
  value: string;
};

type StageKey = 'stage_0_canon' | 'stage_1_anchors' | 'stage_2_fact_bank' | 'stage_3_blocks' | 'stage_4_qc';
type Stage3OutputMode = 'blocks' | 'full_text' | 'both';

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

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly cdr = inject(ChangeDetectorRef);

  readonly apiUrl = this.resolveApiUrl();
  readonly canonConsistencyApiUrl = this.resolveCanonConsistencyApiUrl();
  readonly flashModelLabel = 'Gemini Flash';
  readonly criteria = CRITERIA;
  readonly primaryCriteria = CRITERIA.filter((criterion) => PRIMARY_CRITERIA_KEYS.includes(criterion.key));
  readonly secondaryCriteria = CRITERIA.filter((criterion) => !PRIMARY_CRITERIA_KEYS.includes(criterion.key));

  personJson = JSON.stringify(DEFAULT_PERSON_TEMPLATE, null, 2);
  additionalContext = '';
  profile: Record<string, number> = CRITERIA.reduce((acc, criterion) => {
    acc[criterion.key] = 5;
    return acc;
  }, {} as Record<string, number>);

  loading = false;
  seedInputsDirty = true;
  showFactsPanel = false;
  showCanonConsistencyCard = false;
  selectedBlockKey = '';

  errorMessage = '';
  noticeMessage = '';
  summary = '';
  legendFullText = '';
  anchors: AnchorItem[] = [];
  factBank: FactItem[] = [];
  legendBlocks: LegendBlock[] = [];
  qcChecks: QcCheck[] = [];
  qcSummary = '';
  canonConsistencyReport: CanonConsistencyReport | null = null;

  editableAnchorsJson = '';
  editableFactsJson = '';
  manualEditsDirty = false;
  manualEditStatus = '';

  private pipelineState: Record<string, unknown> | null = null;
  private canonIssueResolutionMap: Record<string, CanonConsistencyIssueResolution> = {};
  private parsedPersonCacheSource = '';
  private parsedPersonCacheValue: Record<string, unknown> | null = null;
  private parsedPersonCacheError = '';

  get personParseError(): string {
    return this.getPersonParseError();
  }

  get inputSummaryCards(): PreviewCard[] {
    const person = this.safeParsePersonJson();
    if (!person) {
      return [];
    }

    const cards: PreviewCard[] = [];
    const fullName = [this.safeText(person['name']), this.safeText(person['surname'])].filter(Boolean).join(' ');
    const birthBits = [this.safeText(person['birth_date'] || person['birth_year']), this.resolveAgeLabel(person)].filter(Boolean).join(' • ');
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
    if (this.loading) {
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
      return anchors.length > 0;
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
  }

  async runAnchors(): Promise<void> {
    await this.runStage('stage_1_anchors');
  }

  async runFacts(): Promise<void> {
    await this.runStage('stage_2_fact_bank');
  }

  async runNarrative(): Promise<void> {
    await this.runStage('stage_3_blocks', { stage3OutputMode: 'both' });
  }

  async runQc(): Promise<void> {
    await this.runStage('stage_4_qc');
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
      this.cdr.detectChanges();
    }
  }

  canCheckCanonConsistency(): boolean {
    return !this.loading && Boolean(this.pipelineState) && !this.seedInputsDirty;
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

    return parts.join(' • ');
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

    if (anchor.hook) {
      parts.push('hook');
    }

    return parts.join(' • ');
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
      if (anchors.length === 0) {
        this.errorMessage = 'Run step 2 first to generate anchors.';
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

  private buildBasePayload(stage3OutputMode: Stage3OutputMode): Record<string, unknown> {
    return {
      person: this.buildPersonPayload(),
      personality_profile: this.profile,
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
      return `${label} • since ${since}`;
    }
    return label || fallback;
  }

  private resolveJobLabel(person: Record<string, unknown>): string {
    const job = person['job'] && typeof person['job'] === 'object' && !Array.isArray(person['job']) ? (person['job'] as Record<string, unknown>) : null;
    const title = this.safeText(job?.['title'] || person['occupation']).trim();
    const company = this.safeText(job?.['company']).trim();
    const location = this.safeText(job?.['location']).trim();
    return [title, company, location].filter(Boolean).join(' • ');
  }

  private resolveEducationLabel(person: Record<string, unknown>): string {
    const education =
      person['education'] && typeof person['education'] === 'object' && !Array.isArray(person['education'])
        ? (person['education'] as Record<string, unknown>)
        : null;
    const degree = this.safeText(education?.['degree']).trim();
    const specialization = this.safeText(education?.['specialization']).trim();
    const institution = this.safeText(education?.['institution']).trim();
    return [degree, specialization, institution].filter(Boolean).join(' • ');
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

      const normalizedAnchors = anchors.filter((item) => item && typeof item === 'object');
      const normalizedFacts = facts.filter((item) => item && typeof item === 'object') as FactItem[];

      const coverage: Record<string, number> = {};
      for (const fact of normalizedFacts) {
        const sphere = this.safeText(fact.sphere).trim();
        if (!sphere) {
          continue;
        }
        coverage[sphere] = (coverage[sphere] || 0) + 1;
      }

      const hooksTotal = normalizedFacts.filter((fact) => Boolean(fact.hook)).length;
      const mutableState = this.pipelineState as Record<string, unknown>;
      mutableState['anchors_timeline'] = normalizedAnchors;
      mutableState['fact_bank'] = normalizedFacts;
      this.anchors = normalizedAnchors as AnchorItem[];
      this.factBank = normalizedFacts;
      mutableState['anchors_report'] = {
        ...(mutableState['anchors_report'] as Record<string, unknown> | undefined),
        count: normalizedAnchors.length,
        selected_mode: 'manual_edit'
      };
      mutableState['fact_bank_report'] = {
        ...(mutableState['fact_bank_report'] as Record<string, unknown> | undefined),
        total_facts: normalizedFacts.length,
        hooks_total: hooksTotal,
        coverage_by_sphere: coverage,
        weak_spheres: Object.entries(coverage)
          .filter(([, count]) => count < 8)
          .map(([sphere]) => sphere)
      };

      this.pipelineState = mutableState;
      this.manualEditsDirty = false;
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
    this.selectedBlockKey = '';
    this.qcChecks = [];
    this.qcSummary = '';
    this.editableAnchorsJson = '';
    this.editableFactsJson = '';
    this.manualEditsDirty = false;
    this.manualEditStatus = '';
    this.canonConsistencyReport = null;
    this.canonIssueResolutionMap = {};
    this.showCanonConsistencyCard = false;
    this.showFactsPanel = false;
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
    this.loading = true;
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

      this.consumeBackendResponse(data);
      if (this.safeText(payload['run_stage']).trim().toLowerCase() === 'stage_0_canon' && this.pipelineState) {
        this.seedInputsDirty = false;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.errorMessage = `Request timeout (${Math.round(timeoutMs / 1000)} seconds).`;
      } else {
        this.errorMessage = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private consumeBackendResponse(data: ApiResponse): void {
    const result = data.result;
    const parsed = result?.parsedJson;

    this.noticeMessage = data.warning ? this.safeText(data.warning) : '';
    this.summary = parsed?.short_summary || '';
    this.legendFullText = parsed?.legend_full_text || '';
    this.anchors = Array.isArray(parsed?.anchors) ? (parsed?.anchors as AnchorItem[]) : [];

    const legendMap = parsed?.legend || parsed?.legend_blocks || parsed?.legend_v1_final_json || {};
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

    const pipelineStateCandidate = parsed?.pipeline_state || result?.pipeline || null;
    if (pipelineStateCandidate && typeof pipelineStateCandidate === 'object') {
      this.pipelineState = pipelineStateCandidate;
      this.factBank = Array.isArray((pipelineStateCandidate as Record<string, unknown>)['fact_bank'])
        ? ((pipelineStateCandidate as Record<string, unknown>)['fact_bank'] as FactItem[])
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
  }

  private resolveSuccessMessage(state: Record<string, unknown>): string {
    const pipelineMeta =
      state['pipeline_meta'] && typeof state['pipeline_meta'] === 'object' ? (state['pipeline_meta'] as Record<string, unknown>) : null;
    const lastCompletedStage = this.safeText(pipelineMeta?.['last_completed_stage']).trim().toLowerCase();

    if (lastCompletedStage === 'stage_0_canon') return 'Step 1 completed. Canon is ready.';
    if (lastCompletedStage === 'stage_1_anchors') return 'Step 2 completed. Anchors are ready.';
    if (lastCompletedStage === 'stage_2_fact_bank') return 'Step 3 completed. Fact bank is ready.';
    if (lastCompletedStage === 'stage_3_blocks') return 'Step 4b completed. Full profile text is ready.';
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
}
