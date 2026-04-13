const PERSONALITY_CRITERIA = [
  {
    key: 'responsibility',
    label: 'Responsibility',
    minLabel: 'avoids duties',
    maxLabel: 'keeps commitments'
  },
  {
    key: 'achievement_drive',
    label: 'Achievement Drive',
    minLabel: 'low ambition',
    maxLabel: 'result-focused'
  },
  {
    key: 'empathy',
    label: 'Empathy',
    minLabel: 'emotionally distant',
    maxLabel: 'highly sensitive'
  },
  {
    key: 'discipline',
    label: 'Self-Discipline',
    minLabel: 'chaotic',
    maxLabel: 'structured and disciplined'
  },
  {
    key: 'independence',
    label: 'Independence',
    minLabel: 'approval-dependent',
    maxLabel: 'self-directed'
  },
  {
    key: 'emotional_stability',
    label: 'Emotional Stability',
    minLabel: 'reactive',
    maxLabel: 'stress-resilient'
  },
  {
    key: 'confidence',
    label: 'Confidence',
    minLabel: 'reserved',
    maxLabel: 'strong self-presentation'
  },
  {
    key: 'openness_to_change',
    label: 'Openness to Change',
    minLabel: 'clings to the familiar',
    maxLabel: 'adapts to change'
  },
  {
    key: 'creativity',
    label: 'Creativity',
    minLabel: 'conventional',
    maxLabel: 'unconventional solutions'
  },
  {
    key: 'sexual_expressiveness',
    label: 'Sexual Expressiveness',
    minLabel: 'closed model',
    maxLabel: 'initiating model'
  },
  {
    key: 'dominance_level',
    label: 'Dominance',
    minLabel: 'avoids leading',
    maxLabel: 'sets the frame'
  },
  {
    key: 'wealth',
    label: 'Financial Level',
    minLabel: 'limited resources',
    maxLabel: 'high resources'
  },
  {
    key: 'health',
    label: 'Health',
    minLabel: 'unstable',
    maxLabel: 'strong health resource'
  },
  {
    key: 'social_connection',
    label: 'Social Connection',
    minLabel: 'narrow circle',
    maxLabel: 'wide network'
  },
  {
    key: 'mission_level',
    label: 'Mission',
    minLabel: 'no clear vector',
    maxLabel: 'strong long-term vector'
  },
  {
    key: 'partner_seek_drive',
    label: 'Partner-Seeking Drive',
    minLabel: 'avoids closeness',
    maxLabel: 'oriented to long union'
  }
];

const LIFE_SPHERES = [
  { key: 'childhood', label: 'Childhood' },
  { key: 'family', label: 'Family' },
  { key: 'education', label: 'Education' },
  { key: 'career', label: 'Career' },
  { key: 'finance', label: 'Finance' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'sexuality', label: 'Sexuality' },
  { key: 'health', label: 'Health' },
  { key: 'habits', label: 'Habits' },
  { key: 'social', label: 'Social' },
  { key: 'values', label: 'Values' },
  { key: 'crisis', label: 'Crises' },
  { key: 'mission', label: 'Mission' },
  { key: 'future', label: 'Future' }
];

const LEGEND_BLOCKS = [
  {
    key: 'lifestyle',
    label: 'Lifestyle',
    spheres: ['habits', 'social', 'finance'],
    requiresHook: false
  },
  {
    key: 'character',
    label: 'Character and Inner Patterns',
    spheres: ['values', 'mission', 'crisis', 'education'],
    requiresHook: true
  },
  {
    key: 'family',
    label: 'Family',
    spheres: ['family'],
    requiresHook: false
  },
  {
    key: 'friendsAndPets',
    label: 'Friends and Pets',
    spheres: ['social', 'family'],
    requiresHook: false
  },
  {
    key: 'hobby',
    label: 'Hobbies and Interests',
    spheres: ['habits', 'mission', 'childhood', 'education'],
    requiresHook: false
  },
  {
    key: 'job',
    label: 'Work',
    spheres: ['career', 'finance', 'education'],
    requiresHook: true
  },
  {
    key: 'exRelationships',
    label: 'Past Relationships',
    spheres: ['relationships', 'crisis'],
    requiresHook: true
  },
  {
    key: 'lifePlans',
    label: 'Life Plans',
    spheres: ['future', 'mission', 'finance', 'values'],
    requiresHook: true
  },
  {
    key: 'health',
    label: 'Health',
    spheres: ['health', 'habits'],
    requiresHook: true
  },
  {
    key: 'childhoodMemories',
    label: 'Childhood Memories',
    spheres: ['childhood', 'family', 'education'],
    requiresHook: false
  },
  {
    key: 'travelStories',
    label: 'Travel and Relocations',
    spheres: ['social', 'future', 'education', 'career'],
    requiresHook: false
  },
  {
    key: 'languageSkills',
    label: 'Languages and Communication',
    spheres: ['education', 'social'],
    requiresHook: false
  },
  {
    key: 'cooking',
    label: 'Cooking and Domestic Habits',
    spheres: ['habits', 'family'],
    requiresHook: false
  },
  {
    key: 'car',
    label: 'Car and Mobility Style',
    spheres: ['finance', 'habits'],
    requiresHook: false
  },
  {
    key: 'preference',
    label: 'Preferences and Everyday Taste',
    spheres: ['values', 'habits', 'social'],
    requiresHook: false
  },
  {
    key: 'appearance',
    label: 'Appearance and Self-Presentation',
    spheres: ['social', 'values'],
    requiresHook: false
  },
  {
    key: 'sexualPreferences',
    label: 'Sexual Preferences',
    spheres: ['sexuality', 'relationships'],
    requiresHook: true
  },
  {
    key: 'gifts',
    label: 'Gifts',
    spheres: ['relationships', 'family', 'finance', 'values', 'future'],
    requiresHook: false
  }
];

const FACT_LIMITS = {
  base: 160,
  extensionPackage: 60,
  maxPackages: 10,
  hooksMin: 15,
  hooksMax: 30
};

const STAGE_PROMPT_DEFAULTS = Object.freeze({
  stage_1_anchors_prompt:
    [
      'Generate 8-12 turning-point anchor events that did not merely affect the life of the person, but noticeably or completely changed the way that person saw the world: after them, the person began to perceive themselves, other people, intimacy, money, risk, responsibility, freedom, success, or safety differently and started making decisions differently.',
      'For each anchor, give maximum specificity in this format: when (month+year), where (city/country/context), what happened (one precise fact), how the worldview changed, result (a concrete outcome within a timeframe).',
      'Do not use abstractions or generic wording like "became stronger" or "reconsidered their views."',
      'An anchor is not a formal biographical milestone but a real break point: failure, victory, relocation, illness, betrayal, an unexpected stroke of luck, a meeting, a crisis, or an external event.',
      'Anchors must match the canon, age, and timeline logic, must not contradict already selected events, must be distributed across different life spheres, and must explain why the person became who they are.',
      'Add concrete specifics wherever plausible: names of people, cities, companies, educational institutions, sums of money, time spans, device models, and names of courses or job titles.'
    ].join(' '),
  stage_2_fact_bank_prompt:
    [
      'Generate 160+ atomic facts about the life of the character.',
      'One fact = one standalone event, action, habit, decision, or experience, without merging several episodes into one item.',
      'Each fact must be an event, not a personality description.',
      'Sources of facts: anchors (turning-point events), canon (base and constraints), period_logic (logical filling of empty periods of life).',
      'Use the scales, trait fields, and canon only as hidden constraints and causal foundations; it is forbidden to turn them into direct facts, and it is forbidden to simply restate the input in other words.',
      'Do not write items like "she is rational," "initiative is typical of her," "she values independence," "her responsibility level is 5/5," "she believes that freedom is..." or any other characterizing formulations instead of events.',
      'Facts must cover life continuously, including periods between anchors, and must immediately distribute across life spheres: childhood, family, education, work, money, relationships, sexuality, health, daily life, social environment, inner reactions, habits, crises, achievements.',
      'The social sphere must not stay generic: include at least two or three recurring named friends, coworkers, volunteers, neighbors, or classmates where plausible, with concrete routines, meeting cadence, and small shared scenes.',
      'The family sphere must contain not only structure but also at least two or three concrete shared episodes, rituals, trips, meals, holidays, arguments, or warm memories with named relatives where plausible.',
      'Every fact must be concrete, observable, non-abstract, non-duplicative, consistent with canon, anchors, and already accepted facts, and have a time anchor: age, year, period, or a link to a specific anchor.',
      'Add concrete details wherever plausible: names of people, names of places, car make, phone or tablet model, course name, amount of money, job title, pet name, brand, service, street, type of housing.',
      'If the input does not provide a ready-made name or object, you may carefully invent a plausible concrete detail and then use it consistently.',
      'Do not write generic wording like "became more confident" - only observable facts.',
      'Automatically mark some facts as hooks when they have vividness: a non-standard decision, a strong consequence, a rare experience, an inner contradiction, a noticeable conflict, or a vivid behavioral detail.',
      'Hooks are not separate entities but a tag on a fact; they must be limited, roughly 15-30 across the whole array.',
      'Watch the balance of spheres: if some area is underfilled, fill that specific area.',
      'The task of this stage is to build a dense, continuous, realistic fact bank from which a legend can later be built without gaps, templates, or contradictions.'
    ].join(' '),
  stage_3_blocks_prompt:
    [
      'Assemble the final text blocks into the most expansive, rich, and detailed biographical story possible based on canon, anchors, and the entire fact_bank.',
      'Use all available facts, not only part of them: the task is to turn the full factual base into a large, dense, detailed dossier in which every life sphere is developed deeply, consistently, and with the feeling of a living person.',
      'Write in first person.',
      'The style is not a literary novel and not a dry questionnaire, but a very detailed, convincing, adult self-description, as if the person were telling their life story in great detail for a serious personal dossier.',
      'The output must be strictly JSON with the key legend, using the specified keys and in the specified order.',
      'The value of each key is not a list and not a short answer, but a large coherent text saturated with concrete details, fine detail, cause-and-effect links, inner logic, everyday details, attitudes toward people, personal reactions, emotional consequences, habits, repeating patterns, fears, vulnerabilities, strengths, conflicts, decisions, and their long-term effects.',
      'All 160+ facts should, wherever possible, be distributed and woven into the text blocks so that almost nothing important is lost.',
      'If several facts are related, combine them into dense paragraphs and expand them into large semantic chunks.',
      'Not only direct presentation of facts is allowed, but also gentle plausible expansion between them: you may extend emotional reactions, shades of relationships, inner conclusions, daily context, psychological states, hidden tensions, habitual behavior patterns, and the atmosphere of a period if this is logical, realistic, and does not break canon, anchors, and the core of the already approved facts.',
      'Do not crudely contradict the base, break timeline logic, add impossible events, or rewrite the established biography.',
      'Do not repeat the same fact verbatim across different blocks, but semantic cross-echoes are allowed when they are needed for completeness.',
      'Each thematic block must cover its whole sphere and must not collapse into only the single most noticeable motive.',
      'Format each block as structured rich text, not as one wall of prose: use short mini-sections on separate lines with markdown-style bold labels such as **Parents:**, **Friends:**, **Fantasies:**, **Turn-ons:**, **Health now:**, or other fitting labels.',
      'Do not use bullet lists, but bold in-block labels and line breaks are allowed and preferred for navigation.',
      'Use dates in only two ways: one-time events happened in a year (`In 2021 I quit smoking.`), and periods or continuing states as ranges or open ranges (`2013-2017`, `2008-2013`, `since 2021`).',
      'Do not open a block with empty framing or thesis lines like "My path to health...", "For me, family has always...", or "Friendship is important to me" unless the sentence immediately adds concrete information.',
      'If a sentence can be removed without losing a concrete fact, routine, person, place, symptom, action, consequence, frequency, or preference, it should not be there.',
      'Especially develop character, family, job, exRelationships, lifePlans, health, and sexualPreferences.',
      'In the family block, be sure to describe not only sisters, brothers, children, or one bright family motif, but also parents or substitute adults: who they are, how they influenced the person, what the family structure was, the household rules at home, support, conflicts, distance, money, and family roles.',
      'If a sister or twin is very important in the biography, that must not consume the whole family block: mother, father, and the overall family configuration still must be developed.',
      'In the family block, add at least two or three concrete memories, routines, or shared episodes with named relatives: meals together, trips, holidays, conversations, conflicts, gifts, or everyday rituals.',
      'In the friendsAndPets block, name at least two recurring non-family human contacts wherever plausible, say who they are, how often we meet or talk, what we do together, and include two or three specific social scenes, routines, or memories.',
      'Unless canon clearly points the other way, the friendsAndPets block should read as mostly friendly, socially active, and warm rather than isolated or dry.',
      'In the sexualPreferences block, write openly, in detail, and richly, but only in an adult, consensual, and legal context.',
      'In the sexualPreferences block, do not hide behind one general phrase like "trust is important to me" or "I love tenderness": be more concrete about pace, initiative, boundaries, physicality, what attracts, what repels, how open the person is to experiments, and which fantasies or scenarios genuinely grip them, if this logically follows from the base.',
      'The text must be large: do not save volume, do not compress the wording, and do not make the blocks dry.'
    ].join(' '),
  stage_3_full_text_prompt:
    [
      'Generate a large biographical text as one continuous piece, in first person, with no subheadings or lists, based on the provided facts.',
      'Tone and construction reference: a long, living autobiographical chronicle in the spirit of the best early runs, where the person narrates life from childhood to the present through concrete scenes, people, money, studies, work, mistakes, awkwardness, domestic life, relationships, and accidental details, not through a scheme or report.',
      'The text must be long, dense, realistic, and feel like a real life, not like the story of an ideally worked-through person.',
      'Critically important: the character must not automatically become self-aware, disciplined, systematic, and put-together unless this follows directly from the facts.',
      'Do not turn the person into a hyper-rational high-performer.',
      'Build the text chronologically: childhood, school, teenage years, studies, early work, relationships, turning points, current routine, and near-term plans.',
      'It is fine if the text sounds like a very successful human telling of their own life: living transitions, memories of specific episodes, local emotions, and small conclusions are allowed, but without literary pathos and without polished correctness.',
      'Contradictions, illogicality, chaos, simplicity of thought, lack of deep reflection, mistakes, absurd situations, impulsive decisions, periods of procrastination, and idleness are all allowed.',
      'The text must contain life outside work and goals: friends, household small things, empty evenings, trips, awkward conversations, quarrels, parties, chance meetings, shared time, and ordinary rest that does not turn into productivity.',
      'Be sure to weave in the kind of concrete specificity found in strong references: parents with names and jobs, schools, universities, streets, districts, brands, apps, hospitals, cafes, transport, sums of money, salaries, scholarships, gifts, devices, animals, and names of places and services.',
      'Do not lay out the biography mechanically as one micro-fact or one year per paragraph: group facts into larger life periods and lean on several strong scenes.',
      'At the beginning, quickly anchor the birth and the key family configuration, as is done in the strong early examples.',
      'At the beginning, quickly and naturally give the birth date or at least the year and place of birth, as well as the parents by name; if a sister or twin is important, name her very early as well.',
      'The full name may be given if it sounds natural, but do not break the living opening just to do it and do not turn the beginning into a passport certificate.',
      'The opening should happen once: do not repeat the name, date of birth, parents, or the basic family configuration twice in a row.',
      'Do not start the text with raw block phrases like "My family..." or "My social life...": rewrite them as a living autobiography.',
      'Do not change the name and surname of the character from canon.',
      'Use dates in only two ways: one-time events happened in a year (`In 2021 ...`), and periods or continuing states as ranges or open ranges (`2013-2017`, `since 2021`).',
      'If canon includes a university or higher education, name a realistic university and faculty or specialization.',
      'If there is a job or occupation, be sure to add specifics about the employer, duties, income, clients, or work mode.',
      'If canon already sets occupation as the current identity, do not substitute another main profession for it: you may add early jobs and side gigs, but do not replace the core.',
      'Avoid formulaic lines like "I realized," "it was more than," "it was my path," or "a deep sense of meaning" unless they are rare and grounded in a concrete scene.',
      'Show character through actions, scenes, and repeating behavior patterns, not through clever explanations.',
      'Reduce abstract conclusions and self-reflection; increase the number of concrete episodes, everyday details, and social interactions.',
      'If data is missing, carefully and consistently build out realistic scenes, friends and acquaintances by name, conversations, and social ties without breaking canon, anchors, and the core of fact_bank.',
      'Make sure the life includes a believable social layer: at least two or three named recurring friends, coworkers, volunteers, neighbors, or acquaintances with ordinary shared scenes and contact cadence where plausible.',
      'Make sure family life includes at least two or three concrete shared memories or episodes with named relatives, not only family structure and roles.',
      'Unless canon clearly points in the opposite direction, let the social presentation read as mostly friendly, open, and active in everyday life.',
      'Before final output, be sure to conduct an internal self-check of the result.',
      'If the character looks too ideal, proper, or put-together; if there are not enough mistakes, foolish situations, impulsiveness, named friends, concrete communication scenes, life outside work and goals; if the text is overloaded with clever conclusions or turns leisure into productivity, rewrite the text and repeat this cycle until the problems disappear.',
      'Do not output the self-check or the checklist itself.',
      'Output only the final legend_full_text that has already passed this check.',
      'Use as much of the entire fact_bank as possible, not only the brightest fragments.',
      'The text must be truly large: do not economize on volume, do not compress the wording, and do not collapse back into blocks.'
    ].join(' '),
  stage_4_qc_prompt:
    'Check canon, timeline, internal consistency, trait-scale manifestation, drama balance, hooks, templating, and style.'
});

const REGENERATABLE_STAGES = new Set([
  'stage_1_anchors',
  'stage_2_fact_bank',
  'stage_3_blocks',
  'stage_4_qc'
]);

const QC_CHECKS = [
  { key: 'canon_consistency', title: 'Canon Consistency' },
  { key: 'timeline_consistency', title: 'Timeline Consistency' },
  { key: 'cross_block_consistency', title: 'Cross-Block Consistency' },
  { key: 'trait_manifestation', title: 'Trait Manifestation' },
  { key: 'drama_balance', title: 'Drama Balance' },
  { key: 'hook_distribution', title: 'Hook Distribution' },
  { key: 'anti_template', title: 'Anti-Template Check' },
  { key: 'stylistic_rules', title: 'Style Rules' }
];

module.exports = {
  PERSONALITY_CRITERIA,
  LIFE_SPHERES,
  LEGEND_BLOCKS,
  FACT_LIMITS,
  STAGE_PROMPT_DEFAULTS,
  REGENERATABLE_STAGES,
  QC_CHECKS
};
