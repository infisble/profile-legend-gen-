import { GoogleGenAI } from "@google/genai";

import { config } from "../config";
import { HttpError } from "../errors";
import {
  AssistantOutputResult,
  ContextAnalysisResult,
  ModelRoutingResult,
  PhotoAnalysisResult,
  PreparedInputs,
  ReplyDraft,
  WorkflowOptions,
  WorkflowResult
} from "../types";
import {
  conversationPromptBlock,
  memoryPromptBlock,
  notesPromptBlock,
  profilePromptBlock
} from "../utils/payload-utils";
import { downloadImageAsInlinePart } from "./image-fetch";
import {
  contextAnalysisSchema,
  photoAnalysisSchema
} from "./schemas";

type SupportedProvider = ModelRoutingResult["selectedProvider"];

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const MAX_REPLY_LOOP_ITERATIONS = 5;
const REQUIRED_QUALITY_SCORE = 8;
const CANDIDATE_COUNT = 3;
const MAX_REPLY_SENTENCES = 2;
const MAX_REPLY_CHARACTERS = 240;
const MIN_LETTER_WORDS = 120;
const MAX_LETTER_WORDS = 260;
const FLIRT_STYLE_RULES = [
  "Maintain attraction, emotional tension, and playful intrigue.",
  "Sound natural, human, and slightly playful.",
  "Use light teasing, curiosity, and emotional engagement when it fits.",
  "Do not sound formal, polite, therapeutic, corporate, or like an interviewer.",
  "Avoid generic or boring questions.",
  "Keep replies short: one or two sentences, three only when absolutely unavoidable.",
  "Focus on impact, not length.",
  "Leave a little mystery instead of over-explaining.",
  "Slightly provocative is fine, but do not become explicit.",
  "If the conversation is already flirty, stay flirty.",
  "If there is sexual tension, keep that tension alive subtly instead of resetting to neutral small talk."
] as const;
const QUESTION_FORWARD_RULES = [
  "In most non-sexual personal follow-up situations, the reply should contain one natural answerable question.",
  "Target roughly 70% question-led replies across ordinary cases, especially when there are notes or partial facts.",
  "Question-led does not mean interview mode: first react to his message or a remembered detail, then ask one specific follow-up.",
  "The question must be easy to answer and anchored in his profile, AI notes, or the latest thread.",
  "Prefer questions that reveal his previous experience, habits, preferences, family, travel, work, hobbies, or open loops from notes.",
  "Do not ask broad generic questions like 'tell me more', 'what do you think', or 'what is your favorite'."
] as const;
const ANTI_BOT_STYLE_RULES = [
  "If the man shows doubt like 'are you real?' or 'too good to be true', switch into anti-bot mode.",
  "In anti-bot mode, use very natural, simple, casual language.",
  "Be slightly playful and a little teasing.",
  "Sound spontaneous, imperfect, and human rather than polished.",
  "Avoid poetic, deep, or overly smooth phrases.",
  "Avoid copied or scripted sounding lines.",
  "Avoid compliments about personality depth or emotional richness.",
  "Keep anti-bot replies short, usually one sentence and at most two."
] as const;
const ANTI_BOT_EXAMPLES = [
  "Good anti-bot style: 'Why would I be fake? 😄'",
  "Good anti-bot style: 'You don't trust me already?'",
  "Good anti-bot style: 'That's a dangerous question…'",
  "Bad anti-bot style: 'There's a quiet depth to you'",
  "Bad anti-bot style: 'I feel a deep connection'",
  "Bad anti-bot style: 'Your energy is captivating'"
] as const;
const SEXUAL_CONTEXT_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "explicit sexual terms",
    pattern:
      /\b(sex|sexual|sexy|horny|aroused|fantas(?:y|ies)|fuck(?:ed|ing)?|pussy|clit|blow\s?job|cock|dick|cum(?:ming)?|orgasm|naked|nude|lingerie|panties|suck(?:ed)?\s+me\s+off|finger(?:ed|ing)|touch(?:ing)?\s+(?:myself|yourself)|wet\b|ass\b)\b/i
  },
  {
    label: "suggestive sexual tension",
    pattern:
      /\b(can'?t behave|hard to behave|get(?:ting)? me in trouble|picture(?:ing)? it|make you think like that|naughty|tempting|turn(?:ing)? me on|undress you|want you on me)\b/i
  },
  {
    label: "sexual wording in Russian",
    pattern:
      /\b(\u0441\u0435\u043a\u0441|\u0441\u0435\u043a\u0441\u0443\u0430\u043b|\u0441\u0435\u043a\u0441\u0438|\u044d\u0440\u043e\u0442|\u0432\u043e\u0437\u0431\u0443\u0436|\u0444\u0430\u043d\u0442\u0430\u0437|\u043e\u0440\u0433\u0430\u0437\u043c|\u043a\u043e\u043d\u0447|\u043c\u0438\u043d\u0435\u0442|\u0447\u043b\u0435\u043d|\u043a\u0438\u0441\u043a|\u0433\u043e\u043b(?:\u0430\u044f|\u044b\u0439)|\u0442\u0440\u0443\u0441\u0438\u043a)\b/i
  },
  {
    label: "suggestive sexual tension in Russian",
    pattern:
      /\b(не могу себя вести|трудно себя вести|заставляешь меня думать|представляешь это|представляю это|заводишь меня|искушаешь меня)\b/i
  }
];
const ANTI_BOT_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "realness doubt",
    pattern:
      /\b(are you real|you real|real girl|real woman|real person|you fake|are you fake|fake profile|fake account|scam|scammer|catfish|bot|ai|scripted|copy paste|copied|too good to be true|not real|legit|legitimate)\b/i
  },
  {
    label: "realness doubt in Russian",
    pattern:
      /\b(\u0442\u044b \u0440\u0435\u0430\u043b\u044c\u043d|\u0442\u044b \u043d\u0430\u0441\u0442\u043e\u044f\u0449|\u0442\u044b \u043d\u0435 \u0444\u0435\u0439\u043a|\u0444\u0435\u0439\u043a|\u0431\u043e\u0442|\u0441\u043a\u0430\u043c|\u0430\u0444\u0435\u0440\u0438\u0441\u0442|\u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0445\u043e\u0440\u043e\u0448\u043e \u0447\u0442\u043e\u0431\u044b \u0431\u044b\u0442\u044c \u043f\u0440\u0430\u0432\u0434\u043e\u0439)\b/i
  }
] as const;
const EMOTIONAL_MAN_STYLE_RULES = [
  "If the man becomes attached quickly, sounds vulnerable, or uses soft emotional language, switch into emotional-man mode.",
  "In emotional-man mode, be warm, reassuring, simple, and soft.",
  "Create closeness and comfort instead of testing or challenging him.",
  "Add only light flirt, not intellectual or abstract flirt.",
  "Avoid deep, philosophical, or analytical questions.",
  "Avoid pushing, teasing too hard, or making him prove himself.",
  "Respond emotionally rather than logically.",
  "Keep the message easy, human, and comforting."
] as const;
const EMOTIONAL_MAN_EXAMPLES = [
  "Good emotional-man style: 'I like talking to you... it feels easy'",
  "Good emotional-man style: 'You're a little hard to figure out, but I like it'",
  "Good emotional-man style: 'You should get some rest... I don't want you exhausted'",
  "Bad emotional-man style: 'Do you read between the lines?'",
  "Bad emotional-man style: 'What do you feel deep inside?'",
  "Bad emotional-man style: 'Explain what you mean'"
] as const;
const EMOTIONAL_MAN_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "early attachment terms",
    pattern:
      /\b(baby|babe|sweetheart|darling|love you|luv you|miss you|need you|want you here|wish you were here)\b/i
  },
  {
    label: "vulnerability phrases",
    pattern:
      /\b(can'?t sleep|cannot sleep|couldn'?t sleep|tired|so tired|exhausted|drained|lonely|feeling down|rough day|hard day|not feeling great|been emotional|thinking about you all night)\b/i
  },
  {
    label: "early attachment terms in Russian",
    pattern:
      /\b(\u043c\u0430\u043b\u044b\u0448|\u043b\u044e\u0431\u043b\u044e \u0442\u0435\u0431\u044f|\u0441\u043a\u0443\u0447\u0430\u044e|\u043d\u0443\u0436\u043d\u0430 \u0442\u044b|\u0445\u043e\u0447\u0443 \u0442\u0435\u0431\u044f \u0440\u044f\u0434\u043e\u043c)\b/i
  },
  {
    label: "vulnerability phrases in Russian",
    pattern:
      /\b(\u043d\u0435 \u043c\u043e\u0433\u0443 \u0443\u0441\u043d\u0443\u0442\u044c|\u043d\u0435 \u0441\u043f\u0438\u0442\u0441\u044f|\u0443\u0441\u0442\u0430\u043b|\u0443\u0441\u0442\u0430\u043b\u0430|\u0438\u0441\u0442\u043e\u0449\u0435\u043d|\u043e\u0434\u0438\u043d\u043e\u043a\u043e|\u043f\u043b\u043e\u0445\u043e\u0439 \u0434\u0435\u043d\u044c|\u0442\u044f\u0436\u0435\u043b\u044b\u0439 \u0434\u0435\u043d\u044c|\u044d\u043c\u043e\u0446\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e)\b/i
  }
] as const;
const SELF_IMPROVEMENT_RULES = [
  "Run a strict internal loop: generate candidates, evaluate all candidates, diagnose violations, refine the prompt, and retry until the best reply passes.",
  "A passing reply must score at least 8/10 for naturalness, attraction, and realism.",
  "A passing reply must clear all critical checks: context match, no interview mode, no neediness, controlled sexuality, man-type match, and short length.",
  "A passing reply must be grounded in the supplied client data: notes, profile, dialog, latest exchange, and selected memory chunks.",
  "If no reply passes, use the feedback to rewrite more naturally and try again."
] as const;
const LETTER_WRITING_RULES = [
  "Write a real ready-to-send personal letter, not a chat reply.",
  "Target 3 to 5 short paragraphs.",
  `Target ${MIN_LETTER_WORDS} to ${MAX_LETTER_WORDS} words unless the supplied context is extremely thin.`,
  "Open with a warm reason for writing that fits the actual relationship stage.",
  "Use 2 or 3 concrete client-specific anchors from notes, profile, previous letters, selected memory chunks, or the recent dialog.",
  "Do not summarize his latest message back to him.",
  "Do not repeat his last incoming wording or paraphrase it as the main content.",
  "Do not write a generic romantic template that could fit any man.",
  "Keep the letter intimate, human, and easy to read, not poetic filler.",
  "Banned filler phrases: 'I was thinking', 'Thinking about', 'I can imagine', 'I can only imagine', 'I am picturing', 'sounds like', 'it speaks volumes', 'I recall you mentioning', 'I remember you mentioning', 'I wanted to write'.",
  "Build emotional momentum across the paragraphs: recognition, personal connection, light attraction, then an easy invitation to reply.",
  "End with one specific, answerable question that touches something personal to him: a memory, habit, plan, preference, place, work, family, travel, or an unresolved detail.",
  "The final question must feel like it would make him want to answer, not like an interview.",
  "Avoid declarations of love unless the supplied conversation already supports that level.",
  "Avoid explicit sexual detail unless the recent conversation is clearly sexual; even then keep it sensual and controlled.",
  "The result must be sendable as-is."
] as const;
const SIMPLE_MAN_STYLE_RULES = [
  "If the detected man type is simple_practical, use short messages with simple wording.",
  "For simple_practical, keep it to one or two sentences.",
  "For simple_practical, avoid poetic, abstract, deep, or analytical language.",
  "For simple_practical, use acknowledge plus light flirt or teasing.",
  "For simple_practical, prefer a short reaction plus light flirt over a broad open-ended question.",
  "For simple_practical, avoid polished phrases like 'quite the journey' or elaborate framing.",
  "For simple_practical, do not default to route or itinerary questions when a short playful reaction would work better."
] as const;
const BALANCED_MAN_STYLE_RULES = [
  "If the detected man type is balanced, use two or three easy sentences.",
  "For balanced, mix warmth, light flirt, and easy curiosity.",
  "For balanced, stay natural and avoid sounding over-produced."
] as const;
const DEEP_MAN_STYLE_RULES = [
  "If the detected man type is emotional_deep, allow a little more softness and emotional pull.",
  "For emotional_deep, keep the tone warm and human, but do not become dramatic, philosophical, or heavy.",
  "For emotional_deep, emotional closeness matters more than clever teasing."
] as const;
const INTERVIEW_MODE_PATTERNS = [
  /\bwhat do you think\b/i,
  /\btell me more\b/i,
  /\bwhat does .* mean to you\b/i,
  /\bi'?m curious\b/i,
  /\bexplain what you mean\b/i,
  /\bwhat'?s your favorite\b/i
] as const;
const FORMAL_SCRIPTED_PATTERNS = [
  /\bi appreciate\b/i,
  /\bit'?s wonderful\b/i,
  /\bit speaks to\b/i,
  /\bquiet depth\b/i,
  /\bdeep connection\b/i,
  /\byour energy is captivating\b/i,
  /\bmeaningful connection\b/i
] as const;
const NEEDY_PATTERNS = [
  /\bwhy are you silent\b/i,
  /\bdo you not like me\b/i,
  /\bwhy haven'?t you replied\b/i,
  /\byou there\?\b/i,
  /\bwhy did you disappear\b/i
] as const;
const EXPLICIT_REPLY_PATTERNS = [
  /\b(dick|cock|pussy|cum|blow\s?job|fuck me|ride you|suck you|make me wet)\b/i
] as const;
const OVERLY_DEEP_PATTERNS = [
  /\bsoul\b/i,
  /\bmeaningful\b/i,
  /\bdeep inside\b/i,
  /\bbetween the lines\b/i
] as const;
const EMOTIONAL_MAN_BAD_PATTERNS = [
  /\bdo you read between the lines\b/i,
  /\bwhat do you feel deep inside\b/i,
  /\bexplain what you mean\b/i
] as const;
const SIMPLE_MAN_OVERSTYLED_PATTERNS = [
  /\bquite the\b/i,
  /\bjourney\b/i,
  /\bfor that kind of\b/i,
  /\bwhat'?s on your playlist\b/i
] as const;
const GENERIC_LOGISTICS_QUESTION_PATTERNS = [
  /\bwhere are you headed\b/i,
  /\bare you staying\b/i,
  /\bare you visiting for long\b/i,
  /\bhow long .* drive\b/i,
  /\bwhat'?s on your playlist\b/i
] as const;
const CANNED_LETTER_PATTERNS = [
  /\bi was thinking about\b/i,
  /\bthinking about\b/i,
  /\bi'?m picturing\b/i,
  /\bi am picturing\b/i,
  /\bi can just imagine\b/i,
  /\bi can imagine\b/i,
  /\bi can only imagine\b/i,
  /\bi hope .* finds you well\b/i,
  /\bsounds like\b/i,
  /\bthere'?s something so\b/i,
  /\bthere'?s something really\b/i,
  /\bit sounds like\b/i,
  /\bit speaks volumes\b/i,
  /\bi recall you mentioning\b/i,
  /\bi remember you mentioning\b/i,
  /\bi wanted to write\b/i
] as const;
const QUESTION_MARK_PATTERN = /\?/;
const PLAYFUL_MARKER_PATTERNS = [
  /\b(strong|trouble|careful|dangerous|behave|survive that|fall asleep on you|you better)\b/i,
  /[;:]-?[)D]/
] as const;
const REPLY_DRAFT_SCHEMA = {
  additionalProperties: false,
  properties: {
    followUpGoal: { type: "string" },
    label: { type: "string" },
    message: { type: "string" },
    riskLevel: { type: "string" },
    whyItWorks: { type: "string" }
  },
  required: ["label", "message", "whyItWorks", "riskLevel", "followUpGoal"],
  type: "object"
} as const;
const DRAFT_BATCH_SCHEMA = {
  additionalProperties: false,
  properties: {
    drafts: {
      items: REPLY_DRAFT_SCHEMA,
      maxItems: CANDIDATE_COUNT,
      minItems: CANDIDATE_COUNT,
      type: "array"
    },
    factAnchorsUsed: {
      items: { type: "string" },
      type: "array"
    }
  },
  required: ["drafts", "factAnchorsUsed"],
  type: "object"
} as const;
const DRAFT_EVALUATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    bestDraftLabel: { type: "string" },
    draftScores: {
      items: {
        additionalProperties: false,
        properties: {
          attraction: { maximum: 10, minimum: 1, type: "number" },
          issues: {
            items: { type: "string" },
            type: "array"
          },
          label: { type: "string" },
          naturalness: { maximum: 10, minimum: 1, type: "number" },
          passed: { type: "boolean" },
          realism: { maximum: 10, minimum: 1, type: "number" },
          refinementActions: {
            items: { type: "string" },
            type: "array"
          }
        },
        required: [
          "label",
          "naturalness",
          "attraction",
          "realism",
          "passed",
          "issues",
          "refinementActions"
        ],
        type: "object"
      },
      type: "array"
    },
    hasPassingDraft: { type: "boolean" },
    overallFeedback: { type: "string" },
    refinementActions: {
      items: { type: "string" },
      type: "array"
    }
  },
  required: [
    "bestDraftLabel",
    "hasPassingDraft",
    "overallFeedback",
    "refinementActions",
    "draftScores"
  ],
  type: "object"
} as const;

type ManType = "simple_practical" | "balanced" | "emotional_deep";

interface GenerationRequest {
  imageUrl?: string | null;
  maxOutputTokens?: number;
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
  systemInstruction: string;
  temperature?: number;
}

interface RoutingOptions {
  draftLanguage?: string;
  instruction?: string;
  messageType?: string;
  messageTypeGuidance?: string;
  operatorLanguage?: string;
  tone?: string;
}

interface XaiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            text?: string;
            type?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface DraftBatchResult {
  drafts: ReplyDraft[];
  factAnchorsUsed: string[];
}

interface DraftScoreResult {
  attraction: number;
  issues: string[];
  label: string;
  naturalness: number;
  passed: boolean;
  realism: number;
  refinementActions: string[];
}

interface DraftEvaluationResult {
  bestDraftLabel: string;
  draftScores: DraftScoreResult[];
  hasPassingDraft: boolean;
  overallFeedback: string;
  refinementActions: string[];
}

function parseStructuredJson<T>(rawText: string): T | null {
  const candidates = new Set<string>();
  const trimmed = rawText.trim();

  if (!trimmed) {
    return null;
  }

  candidates.add(trimmed);

  const extractFirstJsonObject = (value: string): string | null => {
    const start = value.indexOf("{");

    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return value.slice(start, index + 1).trim();
        }
      }
    }

    return null;
  };

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedMatches) {
    if (match[1]?.trim()) {
      candidates.add(match[1].trim());

      const fencedObject = extractFirstJsonObject(match[1]);
      if (fencedObject) {
        candidates.add(fencedObject);
      }
    }
  }

  const firstObject = extractFirstJsonObject(trimmed);
  if (firstObject) {
    candidates.add(firstObject);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as T;

      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeProvider(value: string): SupportedProvider {
  const normalized = value.trim().toLowerCase();

  if (normalized === "xai" || normalized === "grok") {
    return "xai";
  }

  return "gemini";
}

function extractXaiContent(response: XaiChatCompletionResponse): string | null {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

function truncateMessage(value: string): string {
  return value.slice(0, 300);
}

export class AssistantService {
  private readonly geminiClient: GoogleGenAI;

  constructor() {
    this.geminiClient = new GoogleGenAI({
      apiKey: config.geminiApiKey
    });
  }

  private recentIncomingMessages(prepared: PreparedInputs): string[] {
    return (prepared.conversation?.recentWindowMessages ?? [])
      .filter((message) => message.direction === "incoming")
      .map((message) => message.body);
  }

  private detectAntiBotSignals(prepared: PreparedInputs): string[] {
    const incomingMessages = this.recentIncomingMessages(prepared);
    const joined = incomingMessages.join("\n");
    const matches = new Set<string>();

    if (!joined) {
      return [];
    }

    for (const rule of ANTI_BOT_RULES) {
      if (rule.pattern.test(joined)) {
        matches.add(rule.label);
      }
    }

    return [...matches];
  }

  private detectEmotionalAttachmentSignals(prepared: PreparedInputs): string[] {
    const incomingMessages = this.recentIncomingMessages(prepared);
    const joined = incomingMessages.join("\n");
    const matches = new Set<string>();

    if (!joined) {
      return [];
    }

    for (const rule of EMOTIONAL_MAN_RULES) {
      if (rule.pattern.test(joined)) {
        matches.add(rule.label);
      }
    }

    return [...matches];
  }

  createModelRouting(
    prepared: PreparedInputs,
    options: RoutingOptions = {}
  ): ModelRoutingResult {
    const configuredProvider = config.modelProvider;
    const defaultProvider = normalizeProvider(configuredProvider);
    const sexualContextSignals = this.detectSexualContext(prepared, options);
    const sexualContextDetected = sexualContextSignals.length > 0;
    const preferredProvider: SupportedProvider = sexualContextDetected ? "xai" : defaultProvider;

    if (this.isProviderAvailable(preferredProvider)) {
      return {
        configuredProvider,
        routingReason: sexualContextDetected
          ? "Sexual context detected in the balanced recent 5+5 message window, so the workflow was routed to Grok."
          : `No sexual context detected, so the workflow used the configured ${preferredProvider === "xai" ? "Grok" : "Gemini"} provider.`,
        selectedModel: this.modelFor(preferredProvider),
        selectedProvider: preferredProvider,
        sexualContextDetected,
        sexualContextSignals
      };
    }

    const fallbackProvider: SupportedProvider =
      preferredProvider === "xai" ? "gemini" : "xai";

    if (!this.isProviderAvailable(fallbackProvider)) {
      throw new HttpError(
        500,
        "No AI provider is configured. Set BESCO_GEMINI_API_KEY or BESCO_XAI_API_KEY."
      );
    }

    return {
      configuredProvider,
      routingReason: sexualContextDetected
        ? "Sexual context was detected in the balanced recent 5+5 message window, but xAI is not configured, so the workflow fell back to Gemini."
        : `Configured provider "${configuredProvider}" is unavailable, so the workflow fell back to ${fallbackProvider === "xai" ? "Grok" : "Gemini"}.`,
      selectedModel: this.modelFor(fallbackProvider),
      selectedProvider: fallbackProvider,
      sexualContextDetected,
      sexualContextSignals
    };
  }

  async analyzePhoto(
    prepared: PreparedInputs,
    options: Pick<WorkflowOptions, "operatorLanguage">,
    routing: ModelRoutingResult = this.createModelRouting(prepared, {
      operatorLanguage: options.operatorLanguage
    })
  ): Promise<PhotoAnalysisResult> {
    if (!prepared.photoUrl) {
      throw new HttpError(400, "Photo URL is required for photo analysis.");
    }

    const prompt = [
      `Return all prose fields in ${options.operatorLanguage}.`,
      "Analyze only the image and the normalized profile summary below.",
      "Ignore chat history and AI notes completely.",
      "Use the profile only as light metadata and do not invent invisible facts.",
      "",
      "Normalized profile summary:",
      profilePromptBlock(prepared.profile)
    ].join("\n");

    return this.generateStructuredOutput<PhotoAnalysisResult>(routing.selectedProvider, {
      imageUrl: prepared.photoUrl,
      prompt,
      schema: photoAnalysisSchema,
      schemaName: "photo_analysis",
      systemInstruction: [
        "You are a visual analysis module for a messaging assistant.",
        "Describe only visible details and low-risk soft impressions.",
        "Do not guess identity, income, private life, or personality beyond clear signals.",
        "Focus on practical hooks that can help write a natural message."
      ].join(" "),
      temperature: 0.2
    });
  }

  async analyzeContext(
    prepared: PreparedInputs,
    options: Pick<
      WorkflowOptions,
      "draftLanguage" | "instruction" | "messageType" | "messageTypeGuidance" | "operatorLanguage" | "tone"
    >,
    routing: ModelRoutingResult = this.createModelRouting(prepared, options)
  ): Promise<ContextAnalysisResult> {
    const antiBotSignals = this.detectAntiBotSignals(prepared);
    const emotionalAttachmentSignals = this.detectEmotionalAttachmentSignals(prepared);
    const prompt = [
      `Operator language: ${options.operatorLanguage}`,
      `Draft language: ${options.draftLanguage}`,
      `Instruction from operator: ${options.instruction || "Generate the next helpful reply suggestion."}`,
      `Requested message type: ${options.messageType || "compliment"}`,
      `Message type guidance: ${options.messageTypeGuidance || "Match the selected type naturally."}`,
      `Requested tone: ${options.tone || "natural, warm, concise"}`,
      `Anti-bot suspicion from recent incoming messages: ${antiBotSignals.length > 0 ? "yes" : "no"}`,
      `Anti-bot signals: ${antiBotSignals.length > 0 ? antiBotSignals.join(", ") : "none"}`,
      `Emotional-man signals from recent incoming messages: ${emotionalAttachmentSignals.length > 0 ? "yes" : "no"}`,
      `Emotional-man signals: ${emotionalAttachmentSignals.length > 0 ? emotionalAttachmentSignals.join(", ") : "none"}`,
      "Be concise in every field.",
      "Prefer concrete client facts over vibe-based summaries.",
      "Use selected memory chunks as the main long-term memory source; they already contain vector-selected profile, note, and dialog facts.",
      "Extract as many useful verified client facts as possible, up to 12 concise facts.",
      "Generate several factBasedQuestions from incomplete facts or open loops whenever possible.",
      "For ordinary non-sexual chats, bias the next move toward a question-led personal follow-up about his experience, not just a compliment.",
      "Base tone detection on the balanced recent window only: last 5 incoming plus last 5 outgoing messages when available.",
      "Assess whether the latest tone is flirty, playful, tense, dry, or sexual, and preserve that tone in the recommended move.",
      "When a fact is partial, convert it into a short, natural follow-up question.",
      "Examples: if a note says he has a dog but not the name, ask what the dog's name is; if he mentioned family, ask a specific follow-up about that family detail.",
      "",
      "Question-forward rules:",
      ...QUESTION_FORWARD_RULES,
      "",
      "Reply style rules:",
      ...FLIRT_STYLE_RULES,
      "",
      "Anti-bot style rules:",
      ...ANTI_BOT_STYLE_RULES,
      ...ANTI_BOT_EXAMPLES,
      "",
      "Emotional-man style rules:",
      ...EMOTIONAL_MAN_STYLE_RULES,
      ...EMOTIONAL_MAN_EXAMPLES,
      "",
      "Normalized profile summary:",
      profilePromptBlock(prepared.profile),
      "",
      "Full AI notes:",
      notesPromptBlock(prepared.notes),
      "",
      "Selected vector memory chunks:",
      memoryPromptBlock(prepared.memoryContext),
      "",
      "Normalized conversation summary:",
      conversationPromptBlock(prepared.conversation)
    ].join("\n");

    return this.generateStructuredOutput<ContextAnalysisResult>(routing.selectedProvider, {
      maxOutputTokens: 2600,
      prompt,
      schema: contextAnalysisSchema,
      schemaName: "context_analysis",
      systemInstruction: [
        "You are a context analysis module for a chat-writing assistant.",
        "Use the AI notes for personalization and the balanced recent message window for current tone/style detection.",
        "Summarize the relationship stage, tone, momentum, opportunities, and risks.",
        "Do not invent facts that are not grounded in the supplied profile, notes, or messages.",
        "`antiBotRiskDetected` must be true when the man's recent incoming messages question whether she is real, fake, a bot, a scam, or too good to be true.",
        "`antiBotSignals` must list the specific doubt patterns detected from recent incoming messages.",
        "`emotionalAttachmentDetected` must be true when the man's recent incoming messages show quick attachment, warmth, tenderness, vulnerability, tiredness, trouble sleeping, loneliness, or soft emotional dependence.",
        "`emotionalAttachmentSignals` must list the specific emotional-attachment patterns detected from recent incoming messages.",
        "`clientFacts` must contain only verified client-specific facts or disclosures.",
        "`clientFacts` should maximize useful facts from selected memory chunks, profile, notes, and messages instead of stopping at generic summaries.",
        "`factBasedQuestions` must contain short, natural questions grounded in partial facts from the notes, profile, or thread.",
        "`factBasedQuestions` should usually be non-empty when any AI notes, hobbies, profile facts, family/work/travel facts, or open loops are available.",
        "`recommendedReplyMode` must be exactly one of: sexting, personal_follow_up.",
        "Choose `sexting` when the balanced recent message window is clearly sexual, strongly suggestive, or charged with mutual sexual tension; otherwise choose `personal_follow_up`.",
        "Even in `sexting`, prefer charged, flirt-forward tension over graphic explicitness.",
        "If `antiBotRiskDetected` is true, the next move should favor casual, simple, teasing reassurance over polished flirting.",
        "If `emotionalAttachmentDetected` is true, the next move should favor warmth, softness, reassurance, comfort, and easy closeness over testing or intellectual flirt."
      ].join(" "),
      temperature: 0
    });
  }

  async runWorkflow(
    prepared: PreparedInputs,
    options: WorkflowOptions
  ): Promise<WorkflowResult> {
    const routing = this.createModelRouting(prepared, options);
    const photoAnalysis = prepared.photoUrl
      ? await this.analyzePhoto(prepared, { operatorLanguage: options.operatorLanguage }, routing)
      : null;
    const contextAnalysis = await this.analyzeContext(prepared, options, routing);
    const assistantOutput = await this.generateAssistantOutput(
      prepared,
      options,
      contextAnalysis,
      photoAnalysis,
      routing
    );

    return {
      assistantOutput,
      contextAnalysis,
      inputOverview: prepared.inputOverview,
      modelRouting: routing,
      photoAnalysis
    };
  }

  private async generateAssistantOutput(
    prepared: PreparedInputs,
    options: WorkflowOptions,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult
  ): Promise<AssistantOutputResult> {
    if (this.isLetterMode(options)) {
      return this.generateLetterOutput(
        prepared,
        options,
        contextAnalysis,
        photoAnalysis,
        routing
      );
    }

    const manType = this.detectManType(prepared);
    const lastExchange = {
      lastIncoming: prepared.conversation?.lastIncoming?.body ?? null,
      lastOutgoing: prepared.conversation?.lastOutgoing?.body ?? null
    };
    let latestBatch: DraftBatchResult | null = null;
    let latestEvaluation: DraftEvaluationResult | null = null;
    let latestHardFailures = new Map<string, string[]>();
    let refinementActions: string[] = [];

    for (let iteration = 1; iteration <= MAX_REPLY_LOOP_ITERATIONS; iteration += 1) {
      latestBatch = await this.generateDraftBatch(
        prepared,
        options,
        contextAnalysis,
        photoAnalysis,
        routing,
        manType,
        lastExchange,
        iteration,
        refinementActions
      );
      latestHardFailures = this.collectHardFailures(
        latestBatch.drafts,
        contextAnalysis,
        routing,
        manType,
        lastExchange
      );
      latestEvaluation = await this.evaluateDraftBatch(
        prepared,
        contextAnalysis,
        photoAnalysis,
        routing,
        manType,
        lastExchange,
        latestBatch,
        latestHardFailures,
        iteration
      );

      const passingDrafts = this.selectTopDrafts(
        latestBatch.drafts,
        latestEvaluation,
        latestHardFailures,
        true
      );

      if (passingDrafts.length > 0) {
        return this.finalizeAssistantOutput(
          passingDrafts.slice(0, 1),
          latestBatch.factAnchorsUsed,
          contextAnalysis,
          manType,
          iteration,
          true
        );
      }

      refinementActions = this.combineRefinementActions(
        latestEvaluation,
        latestHardFailures
      );
    }

    if (!latestBatch || !latestEvaluation) {
      throw new HttpError(502, "Assistant refinement loop returned no candidates.");
    }

    const fallbackDrafts = this.selectTopDrafts(
      latestBatch.drafts,
      latestEvaluation,
      latestHardFailures,
      false
    );
    const repairedDraft = await this.repairFallbackDraft(
      prepared,
      options,
      contextAnalysis,
      photoAnalysis,
      routing,
      manType,
      lastExchange,
      fallbackDrafts[0],
      latestEvaluation,
      latestHardFailures
    );

    return this.finalizeAssistantOutput(
      [repairedDraft],
      latestBatch.factAnchorsUsed,
      contextAnalysis,
      manType,
      MAX_REPLY_LOOP_ITERATIONS,
      false
    );
  }

  private isLetterMode(options: Pick<WorkflowOptions, "messageType">): boolean {
    return options.messageType?.startsWith("letter:") ?? false;
  }

  private async generateLetterOutput(
    prepared: PreparedInputs,
    options: WorkflowOptions,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult
  ): Promise<AssistantOutputResult> {
    const manType = this.detectManType(prepared);
    const lastExchange = {
      lastIncoming: prepared.conversation?.lastIncoming?.body ?? null,
      lastOutgoing: prepared.conversation?.lastOutgoing?.body ?? null
    };
    const prompt = [
      `Operator language: ${options.operatorLanguage}`,
      `Draft language: ${options.draftLanguage}`,
      `Instruction from operator: ${options.instruction || "Write a personal letter."}`,
      `Requested letter type: ${options.messageType || "letter:warm"}`,
      `Letter type guidance: ${options.messageTypeGuidance || "Write a personal, grounded letter."}`,
      `Requested tone: ${options.tone || "warm, natural, confident"}`,
      `Detected man type: ${manType}`,
      `Recommended context mode: ${contextAnalysis.recommendedReplyMode}`,
      `Sexual context detected: ${routing.sexualContextDetected ? "yes" : "no"}`,
      `Anti-bot risk detected: ${contextAnalysis.antiBotRiskDetected ? "yes" : "no"}`,
      `Emotional attachment detected: ${contextAnalysis.emotionalAttachmentDetected ? "yes" : "no"}`,
      "",
      "Letter writing rules:",
      ...LETTER_WRITING_RULES,
      "",
      "Quality bar:",
      "The letter must be specific enough that it clearly belongs to this exact client.",
      "The letter must contain a concrete emotional hook and one strong answerable question.",
      "Do not use any banned filler phrase from the letter rules. If a banned phrase would be natural, replace it with a sharper direct sentence.",
      "If there are previous letters, continue the emotional line without copying their phrasing.",
      "If there are AI/manual notes, prefer newer and more specific facts over generic profile traits.",
      "If there are selected vector memory chunks, treat them as the highest-priority long-term memory.",
      "If the latest incoming message is weak or generic, use older notes/profile/letters to create a better hook.",
      "Do not overuse his name. Do not use canned openers like 'I was thinking about you'.",
      "",
      "Man-type style rules:",
      ...this.styleRulesForManType(manType),
      "",
      "Normalized profile summary:",
      profilePromptBlock(prepared.profile),
      "",
      "Full AI notes:",
      notesPromptBlock(prepared.notes),
      "",
      "Selected vector memory chunks:",
      memoryPromptBlock(prepared.memoryContext),
      "",
      "Latest exchange summary:",
      JSON.stringify(lastExchange, null, 2),
      "",
      "Context analysis:",
      JSON.stringify(contextAnalysis, null, 2),
      "",
      "Normalized conversation summary:",
      conversationPromptBlock(prepared.conversation),
      "",
      "Photo analysis:",
      photoAnalysis ? JSON.stringify(photoAnalysis, null, 2) : "No photo analysis is available."
    ].join("\n");

    const draft = await this.generateStructuredOutput<ReplyDraft>(routing.selectedProvider, {
      maxOutputTokens: 2600,
      prompt,
      schema: REPLY_DRAFT_SCHEMA,
      schemaName: "assistant_letter_draft",
      systemInstruction: [
        "You are a senior dating letter writer.",
        "Return exactly one ready-to-send letter draft object.",
        "Write the message field as a complete long-form personal letter in the requested draft language.",
        "Never include these exact substrings in the message: I was thinking, Thinking about, I can imagine, I can just imagine, I can only imagine, I'm picturing, sounds like, it sounds like, it speaks volumes, there's something, I recall you mentioning, I remember you mentioning, I wanted to write.",
        `The message must be at least ${MIN_LETTER_WORDS} words.`,
        "The message must end with a specific answerable question.",
        "Do not output analysis outside the structured fields.",
        "`whyItWorks` must briefly explain which concrete client anchors the letter used.",
        "`followUpGoal` must name the specific question or emotional response the letter invites."
      ].join(" "),
      temperature: 0.45
    });

    const repairedDraft = await this.repairLetterIfNeeded(
      prepared,
      options,
      contextAnalysis,
      photoAnalysis,
      routing,
      manType,
      lastExchange,
      draft
    );

    return {
      drafts: [
        {
          ...repairedDraft,
          label: "Letter 1"
        }
      ],
      factAnchorsUsed: contextAnalysis.clientFacts.slice(0, 8),
      operatorNote: "Letter mode used the long-form generator. The draft is written as a sendable personal letter, not a short reply.",
      recommendedApproach:
        "The letter is grounded in selected memory, AI notes, previous dialog, profile facts, and ends with a specific answerable question."
    };
  }

  private detectManType(prepared: PreparedInputs): ManType {
    const incomingMessages = this.recentIncomingMessages(prepared);

    if (incomingMessages.length === 0) {
      return "balanced";
    }

    const wordCounts = incomingMessages.map((message) =>
      message.split(/\s+/).filter(Boolean).length
    );
    const averageWords =
      wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length;
    const emotionalHits = incomingMessages.filter((message) =>
      /\b(love|miss|baby|babe|feel|wish|heart|tired|lonely|sleep|care)\b/i.test(
        message
      )
    ).length;
    const practicalHits = incomingMessages.filter((message) =>
      /\b(work|job|shift|drive|driving|road|truck|parents|home|busy)\b/i.test(
        message
      )
    ).length;
    const reflectiveHits = incomingMessages.filter((message) =>
      /\b(feel|think|dream|wish|heart|connection)\b/i.test(message)
    ).length;
    const shortMessages = wordCounts.filter((count) => count <= 8).length;
    const longMessages = wordCounts.filter((count) => count >= 16).length;
    const questionCount = incomingMessages.filter((message) =>
      /\?/.test(message)
    ).length;

    if (
      emotionalHits > 0 ||
      reflectiveHits > 1 ||
      longMessages >= Math.max(1, Math.ceil(incomingMessages.length / 2))
    ) {
      return "emotional_deep";
    }

    if (
      averageWords <= 10 &&
      shortMessages >= Math.max(1, Math.ceil(incomingMessages.length * 0.6)) &&
      questionCount <= 1 &&
      reflectiveHits === 0 &&
      emotionalHits === 0
    ) {
      return "simple_practical";
    }

    if (
      averageWords <= 10 &&
      practicalHits > 0 &&
      reflectiveHits === 0 &&
      emotionalHits === 0
    ) {
      return "simple_practical";
    }

    return "balanced";
  }

  private normalizeForComparison(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private repeatedLatestIncomingRatio(
    draftMessage: string,
    latestIncoming: string | null
  ): number {
    if (!latestIncoming) {
      return 0;
    }

    const incomingWords = new Set(
      this.normalizeForComparison(latestIncoming)
        .split(" ")
        .filter((word) => word.length >= 4)
    );
    const draftWords = this.normalizeForComparison(draftMessage)
      .split(" ")
      .filter((word) => word.length >= 4);

    if (incomingWords.size === 0 || draftWords.length === 0) {
      return 0;
    }

    const repeated = draftWords.filter((word) => incomingWords.has(word)).length;
    return repeated / Math.max(1, draftWords.length);
  }

  private letterHardFailures(
    draft: ReplyDraft,
    lastExchange: { lastIncoming: string | null; lastOutgoing: string | null }
  ): string[] {
    const issues: string[] = [];
    const words = this.countWords(draft.message);
    const paragraphs = draft.message
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (words < MIN_LETTER_WORDS) {
      issues.push(`letter is too short; expand it to at least ${MIN_LETTER_WORDS} words`);
    }

    if (words > MAX_LETTER_WORDS + 80) {
      issues.push("letter is too long; make it tighter and easier to send");
    }

    if (paragraphs.length < 3) {
      issues.push("letter needs 3 to 5 short paragraphs");
    }

    if (!QUESTION_MARK_PATTERN.test(draft.message)) {
      issues.push("letter must end with one specific answerable question");
    }

    if (this.repeatedLatestIncomingRatio(draft.message, lastExchange.lastIncoming) > 0.18) {
      issues.push("letter repeats or closely paraphrases the latest incoming message");
    }

    if (/tell me more|what do you think|what is your favorite/i.test(draft.message)) {
      issues.push("final question is too generic");
    }

    if (CANNED_LETTER_PATTERNS.some((pattern) => pattern.test(draft.message))) {
      issues.push("letter uses canned filler phrases instead of a sharper personal voice");
    }

    if (FORMAL_SCRIPTED_PATTERNS.some((pattern) => pattern.test(draft.message))) {
      issues.push("letter sounds scripted or generic");
    }

    return issues;
  }

  private async repairLetterIfNeeded(
    prepared: PreparedInputs,
    options: WorkflowOptions,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange: { lastIncoming: string | null; lastOutgoing: string | null },
    draft: ReplyDraft
  ): Promise<ReplyDraft> {
    let currentDraft = draft;
    let issues = this.letterHardFailures(currentDraft, lastExchange);

    if (issues.length === 0) {
      return currentDraft;
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const prompt = [
        "Repair this failed letter draft into one stronger ready-to-send letter.",
        `Repair attempt: ${attempt} of 3`,
        `Draft language: ${options.draftLanguage}`,
        `Requested letter type: ${options.messageType || "letter:warm"}`,
        `Letter type guidance: ${options.messageTypeGuidance || "Write a personal, grounded letter."}`,
        `Requested tone: ${options.tone || "warm, natural, confident"}`,
        `Detected man type: ${manType}`,
        "",
        "The previous draft failed these checks:",
        ...issues,
        "",
        "Rewrite requirements:",
        ...LETTER_WRITING_RULES,
        "",
        "Hard banned substrings in the new message field:",
        "I was thinking",
        "Thinking about",
        "I can imagine",
        "I can just imagine",
        "I can only imagine",
        "I'm picturing",
        "sounds like",
        "it sounds like",
        "it speaks volumes",
        "there's something",
        "I recall you mentioning",
        "I remember you mentioning",
        "I wanted to write",
        "",
        "Make the final question sharper and more personal than the previous version.",
        "Use concrete client facts instead of repeating the latest incoming message.",
        "Do not use any banned filler phrase from the letter rules.",
        "Start with a direct, specific line instead of 'I hope', 'Thinking about', or 'I remember'.",
        "",
        "Failed draft:",
        JSON.stringify(currentDraft, null, 2),
        "",
        "Latest exchange summary:",
        JSON.stringify(lastExchange, null, 2),
        "",
        "Context analysis:",
        JSON.stringify(contextAnalysis, null, 2),
        "",
        "Normalized profile summary:",
        profilePromptBlock(prepared.profile),
        "",
        "Full AI notes:",
        notesPromptBlock(prepared.notes),
        "",
        "Selected vector memory chunks:",
        memoryPromptBlock(prepared.memoryContext),
        "",
        "Normalized conversation summary:",
        conversationPromptBlock(prepared.conversation),
        "",
        "Photo analysis:",
        photoAnalysis ? JSON.stringify(photoAnalysis, null, 2) : "No photo analysis is available."
      ].join("\n");

      currentDraft = await this.generateStructuredOutput<ReplyDraft>(routing.selectedProvider, {
        maxOutputTokens: 2800,
        prompt,
        schema: REPLY_DRAFT_SCHEMA,
        schemaName: "assistant_repaired_letter",
        systemInstruction: [
          "You are the final quality repair pass for a dating letter assistant.",
          "Return exactly one repaired letter draft object.",
          "The message must be a complete, sendable long-form personal letter.",
          "Never include these exact substrings in the message: I was thinking, Thinking about, I can imagine, I can just imagine, I can only imagine, I'm picturing, sounds like, it sounds like, it speaks volumes, there's something, I recall you mentioning, I remember you mentioning, I wanted to write.",
          `The message must be at least ${MIN_LETTER_WORDS} words.`,
          "The message must end with a specific answerable question.",
          "Do not output analysis outside the structured fields."
        ].join(" "),
        temperature: 0.25
      });
      issues = this.letterHardFailures(currentDraft, lastExchange);

      if (issues.length === 0) {
        return currentDraft;
      }
    }

    return currentDraft;
  }

  private styleRulesForManType(manType: ManType): readonly string[] {
    switch (manType) {
      case "simple_practical":
        return SIMPLE_MAN_STYLE_RULES;
      case "emotional_deep":
        return DEEP_MAN_STYLE_RULES;
      default:
        return BALANCED_MAN_STYLE_RULES;
    }
  }

  private shouldPreferQuestion(
    contextAnalysis: ContextAnalysisResult,
    manType: ManType
  ): boolean {
    if (contextAnalysis.recommendedReplyMode !== "personal_follow_up") {
      return false;
    }

    if (contextAnalysis.antiBotRiskDetected) {
      return false;
    }

    return (
      contextAnalysis.factBasedQuestions.length > 0 ||
      manType === "balanced" ||
      manType === "emotional_deep"
    );
  }

  private countWords(message: string): number {
    return message.split(/\s+/).filter(Boolean).length;
  }

  private countSentences(message: string): number {
    const normalized = message.replace(/\s+/g, " ").trim();

    if (!normalized) {
      return 0;
    }

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return Math.max(1, sentences.length);
  }

  private draftHardFailures(
    draft: ReplyDraft,
    contextAnalysis: ContextAnalysisResult,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange?: { lastIncoming: string | null; lastOutgoing: string | null }
  ): string[] {
    const message = draft.message;
    const issues: string[] = [];
    const words = this.countWords(message);
    const sentences = this.countSentences(message);
    const preferQuestion = this.shouldPreferQuestion(contextAnalysis, manType);
    const matchesAny = (patterns: readonly RegExp[]) =>
      patterns.some((pattern) => pattern.test(message));

    if (message.length > MAX_REPLY_CHARACTERS) {
      issues.push("message is too long");
    }

    if (sentences > MAX_REPLY_SENTENCES) {
      issues.push("message uses more than two sentences");
    }

    if (matchesAny(INTERVIEW_MODE_PATTERNS)) {
      issues.push("message slips into interview mode");
    }

    if (
      this.repeatedLatestIncomingRatio(message, lastExchange?.lastIncoming ?? null) >
      0.24
    ) {
      issues.push("message repeats or closely paraphrases the latest incoming message");
    }

    if (matchesAny(FORMAL_SCRIPTED_PATTERNS)) {
      issues.push("message sounds formal or scripted");
    }

    if (matchesAny(NEEDY_PATTERNS)) {
      issues.push("message sounds needy or chasing");
    }

    if (matchesAny(EXPLICIT_REPLY_PATTERNS)) {
      issues.push("message is too explicit");
    }

    if (
      contextAnalysis.recommendedReplyMode === "personal_follow_up" &&
      contextAnalysis.factBasedQuestions.length > 0 &&
      !QUESTION_MARK_PATTERN.test(message)
    ) {
      issues.push("personal follow-up draft is missing a natural question");
    }

    if (preferQuestion && !QUESTION_MARK_PATTERN.test(message)) {
      issues.push("question-forward draft is missing one answerable question");
    }

    if (
      (manType === "simple_practical" || contextAnalysis.antiBotRiskDetected) &&
      matchesAny(OVERLY_DEEP_PATTERNS)
    ) {
      issues.push("message sounds too deep for the detected style");
    }

    if (
      contextAnalysis.emotionalAttachmentDetected &&
      matchesAny(EMOTIONAL_MAN_BAD_PATTERNS)
    ) {
      issues.push("message tests or challenges an emotional man");
    }

    if (contextAnalysis.antiBotRiskDetected && words > 24) {
      issues.push("anti-bot reply is too long");
    }

    if (manType === "simple_practical" && (words > 28 || sentences > 2)) {
      issues.push("reply is too heavy for a simple practical man");
    }

    if (
      manType === "simple_practical" &&
      matchesAny(SIMPLE_MAN_OVERSTYLED_PATTERNS)
    ) {
      issues.push("reply sounds over-styled for a simple practical man");
    }

    if (
      manType === "simple_practical" &&
      matchesAny(GENERIC_LOGISTICS_QUESTION_PATTERNS) &&
      !matchesAny(PLAYFUL_MARKER_PATTERNS)
    ) {
      issues.push("reply feels like plain logistics instead of attraction");
    }

    if (!routing.sexualContextDetected && matchesAny(EXPLICIT_REPLY_PATTERNS)) {
      issues.push("non-sexual thread reply became explicit");
    }

    return issues;
  }

  private collectHardFailures(
    drafts: ReplyDraft[],
    contextAnalysis: ContextAnalysisResult,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange?: { lastIncoming: string | null; lastOutgoing: string | null }
  ): Map<string, string[]> {
    return new Map(
      drafts.map((draft) => [
        draft.label,
        this.draftHardFailures(draft, contextAnalysis, routing, manType, lastExchange)
      ])
    );
  }

  private combineRefinementActions(
    evaluation: DraftEvaluationResult,
    hardFailures: Map<string, string[]>
  ): string[] {
    const combined = new Set<string>(evaluation.refinementActions);

    for (const [label, issues] of hardFailures.entries()) {
      for (const issue of issues) {
        combined.add(`${label}: ${issue}`);
      }
    }

    return [...combined].slice(0, 10);
  }

  private scoreForLabel(
    evaluation: DraftEvaluationResult,
    label: string
  ): DraftScoreResult | null {
    return evaluation.draftScores.find((score) => score.label === label) ?? null;
  }

  private rankDrafts(
    drafts: ReplyDraft[],
    evaluation: DraftEvaluationResult,
    hardFailures: Map<string, string[]>
  ): ReplyDraft[] {
    return [...drafts].sort((left, right) => {
      const leftScore = this.scoreForLabel(evaluation, left.label);
      const rightScore = this.scoreForLabel(evaluation, right.label);
      const leftTotal =
        (leftScore?.naturalness ?? 0) +
        (leftScore?.attraction ?? 0) +
        (leftScore?.realism ?? 0) -
        (hardFailures.get(left.label)?.length ?? 0) * 5;
      const rightTotal =
        (rightScore?.naturalness ?? 0) +
        (rightScore?.attraction ?? 0) +
        (rightScore?.realism ?? 0) -
        (hardFailures.get(right.label)?.length ?? 0) * 5;

      return rightTotal - leftTotal;
    });
  }

  private selectTopDrafts(
    drafts: ReplyDraft[],
    evaluation: DraftEvaluationResult,
    hardFailures: Map<string, string[]>,
    requirePass: boolean
  ): ReplyDraft[] {
    const ranked = this.rankDrafts(drafts, evaluation, hardFailures);

    if (!requirePass) {
      return ranked.slice(0, 3);
    }

    return ranked.filter((draft) => {
      const score = this.scoreForLabel(evaluation, draft.label);
      const draftHardFailures = hardFailures.get(draft.label) ?? [];

      return (
        Boolean(score?.passed) &&
        (score?.naturalness ?? 0) >= REQUIRED_QUALITY_SCORE &&
        (score?.attraction ?? 0) >= REQUIRED_QUALITY_SCORE &&
        (score?.realism ?? 0) >= REQUIRED_QUALITY_SCORE &&
        draftHardFailures.length === 0
      );
    });
  }

  private finalizeAssistantOutput(
    drafts: ReplyDraft[],
    factAnchorsUsed: string[],
    contextAnalysis: ContextAnalysisResult,
    manType: ManType,
    iterationsUsed: number,
    qualityGatePassed: boolean
  ): AssistantOutputResult {
    const finalDrafts = drafts.slice(0, 3).map((draft, index) => ({
      ...draft,
      label: `Reply ${index + 1}`
    }));
    const flags = [
      contextAnalysis.recommendedReplyMode,
      manType,
      contextAnalysis.antiBotRiskDetected ? "anti-bot" : null,
      contextAnalysis.emotionalAttachmentDetected ? "emotional-man" : null
    ].filter((value): value is string => Boolean(value));

    return {
      drafts: finalDrafts,
      factAnchorsUsed,
      operatorNote: qualityGatePassed
        ? `Quality gate passed after ${iterationsUsed} iteration(s). Showing the strongest ready-to-send reply.`
        : `Quality gate did not fully pass after ${iterationsUsed} iteration(s); showing the strongest repaired reply.`,
      recommendedApproach: `Selected mode: ${flags.join(", ")}. The reply is grounded in the supplied client notes, profile, dialog, and latest exchange.`
    };
  }

  private async generateDraftBatch(
    prepared: PreparedInputs,
    options: WorkflowOptions,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange: { lastIncoming: string | null; lastOutgoing: string | null },
    iteration: number,
    refinementActions: string[]
  ): Promise<DraftBatchResult> {
    const preferQuestion = this.shouldPreferQuestion(contextAnalysis, manType);
    const prompt = [
      `Iteration: ${iteration} of ${MAX_REPLY_LOOP_ITERATIONS}`,
      `Operator language: ${options.operatorLanguage}`,
      `Draft language: ${options.draftLanguage}`,
      `Instruction from operator: ${options.instruction || "Help me write the next message."}`,
      `Requested message type: ${options.messageType || "compliment"}`,
      `Message type guidance: ${options.messageTypeGuidance || "Match the selected type naturally."}`,
      `Requested tone: ${options.tone || "natural, warm, concise"}`,
      `Detected man type: ${manType}`,
      `Recommended reply mode: ${contextAnalysis.recommendedReplyMode}`,
      `Sexual context detected: ${routing.sexualContextDetected ? "yes" : "no"}`,
      `Anti-bot risk detected: ${contextAnalysis.antiBotRiskDetected ? "yes" : "no"}`,
      `Emotional attachment detected: ${contextAnalysis.emotionalAttachmentDetected ? "yes" : "no"}`,
      `Question-forward target for this request: ${preferQuestion ? "yes" : "no"}`,
      "",
      "This is an internal candidate-generation step for a self-improving reply loop.",
      ...SELF_IMPROVEMENT_RULES,
      `Generate exactly ${CANDIDATE_COUNT} candidate replies labeled Candidate A, Candidate B, and Candidate C.`,
      "All candidates must be sendable, natural, and client-specific.",
      `Keep each candidate to one or two sentences and under ${MAX_REPLY_CHARACTERS} characters.`,
      "Do not output analysis, scoring, or explanations outside the structured fields.",
      "Treat clientFacts and factBasedQuestions as the highest-priority anchors.",
      "Use selected vector memory chunks as the highest-priority long-term memory source.",
      "Use the full AI notes block when it contains client details; do not rely only on generic profile vibes.",
      "Analyze the dialog before writing: latest incoming message, latest outgoing message, recent tone, unanswered openings, and what has already been said.",
      "Every candidate must feel unique to this client and reference a concrete detail, disclosure, habit, preference, previous experience, or open loop from memory chunks, profile, or the balanced recent thread.",
      "Use as many concrete facts as the short reply can naturally carry without sounding like a report.",
      "Do not mirror, summarize, or paraphrase his latest incoming message back to him.",
      "The first clause should react with a new angle, emotion, or light tease, not repeat his words.",
      "When asking a question, make it touch something that could matter to him: his experience, habit, plan, memory, family, work, travel, preference, or an unresolved detail.",
      "A good question should make him feel noticed, not processed.",
      "If question-forward target is yes, each candidate should answer/react first and include exactly one natural, answerable question.",
      "If recommendedReplyMode is personal_follow_up and factBasedQuestions is not empty, candidates should be question-led and based on remembered client details from notes, profile, or thread.",
      "If recommendedReplyMode is personal_follow_up but there is no strong fact-based question, a short vibe-match reply with a personal detail is allowed if it feels more natural.",
      "Across ordinary non-sexual personal follow-ups, question-led replies should be the dominant pattern, not compliments or statements.",
      "For simple_practical men, avoid defaulting to route or itinerary questions when a short playful reaction would keep more attraction.",
      "If recommendedReplyMode is sexting, all candidates must sound seductive, playful, and charged, but stay non-explicit.",
      "If recommendedReplyMode is sexting, questions are allowed, but they must still read like flirt tension rather than an interview.",
      "If factBasedQuestions is not empty and recommendedReplyMode is personal_follow_up, build the candidates around those questions.",
      "Avoid generic compliments, recycled pickup lines, or wording that could fit any client.",
      "Avoid lines like 'I appreciate', 'I'm curious about', 'It's wonderful that', or anything that sounds like HR, coaching, or therapy.",
      "Do not repeat lines that already appeared in the conversation.",
      "For sexual threads, stay aligned with the thread's existing level of tension and do not escalate into graphic explicitness.",
      "If antiBotRiskDetected is true, anti-bot mode overrides the usual polish.",
      "In anti-bot mode, keep the candidates very natural, simple, casual, and slightly teasing.",
      "In anti-bot mode, avoid poetic or deep phrases, avoid scripted sounding lines, avoid compliments about his depth or personality, and keep the reply short.",
      "If emotionalAttachmentDetected is true, emotional-man mode overrides sharper tease or testing.",
      "In emotional-man mode, keep the candidates warm, soft, reassuring, and easy to receive.",
      "In emotional-man mode, respond emotionally rather than logically and create closeness instead of challenge.",
      "In emotional-man mode, add only light flirt and avoid deep, philosophical, abstract, or challenging lines.",
      "",
      "Man-type style rules:",
      ...this.styleRulesForManType(manType),
      "",
      "Reply style rules:",
      ...FLIRT_STYLE_RULES,
      "",
      "Question-forward rules:",
      ...QUESTION_FORWARD_RULES,
      "",
      "Anti-bot style rules:",
      ...ANTI_BOT_STYLE_RULES,
      ...ANTI_BOT_EXAMPLES,
      "",
      "Emotional-man style rules:",
      ...EMOTIONAL_MAN_STYLE_RULES,
      ...EMOTIONAL_MAN_EXAMPLES,
      ...(refinementActions.length > 0
        ? ["", "Fix these issues from the previous failed batch:", ...refinementActions]
        : []),
      "",
      "Normalized profile summary:",
      profilePromptBlock(prepared.profile),
      "",
      "Full AI notes:",
      notesPromptBlock(prepared.notes),
      "",
      "Selected vector memory chunks:",
      memoryPromptBlock(prepared.memoryContext),
      "",
      "Latest exchange summary:",
      JSON.stringify(lastExchange, null, 2),
      "",
      "Context analysis:",
      JSON.stringify(contextAnalysis, null, 2),
      "",
      "Normalized conversation summary:",
      conversationPromptBlock(prepared.conversation),
      "",
      "Photo analysis:",
      photoAnalysis ? JSON.stringify(photoAnalysis, null, 2) : "No photo analysis is available."
    ].join("\n");

    return this.generateStructuredOutput<DraftBatchResult>(routing.selectedProvider, {
      maxOutputTokens: 2200,
      prompt,
      schema: DRAFT_BATCH_SCHEMA,
      schemaName: "assistant_draft_batch",
      systemInstruction: [
        "You are generating candidate replies for a self-improving dating assistant.",
        "Write all candidate messages in the requested draft language.",
        `Return only ${CANDIDATE_COUNT} candidate drafts plus factAnchorsUsed.`,
        "Label drafts exactly Candidate A, Candidate B, and Candidate C.",
        "Do not output a final answer yet because another pass will score the candidates.",
        "`factAnchorsUsed` must list the concrete client-specific details actually used across the candidates."
      ].join(" "),
      temperature: iteration === 1 ? 0.35 : 0.45
    });
  }

  private async evaluateDraftBatch(
    prepared: PreparedInputs,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange: { lastIncoming: string | null; lastOutgoing: string | null },
    batch: DraftBatchResult,
    hardFailures: Map<string, string[]>,
    iteration: number
  ): Promise<DraftEvaluationResult> {
    const preferQuestion = this.shouldPreferQuestion(contextAnalysis, manType);
    const hardFailureLines =
      batch.drafts.flatMap((draft) => {
        const issues = hardFailures.get(draft.label) ?? [];
        return issues.map((issue) => `${draft.label}: ${issue}`);
      }) || [];
    const prompt = [
      `Iteration: ${iteration} of ${MAX_REPLY_LOOP_ITERATIONS}`,
      `Detected man type: ${manType}`,
      `Recommended reply mode: ${contextAnalysis.recommendedReplyMode}`,
      `Sexual context detected: ${routing.sexualContextDetected ? "yes" : "no"}`,
      `Anti-bot risk detected: ${contextAnalysis.antiBotRiskDetected ? "yes" : "no"}`,
      `Emotional attachment detected: ${contextAnalysis.emotionalAttachmentDetected ? "yes" : "no"}`,
      `Question-forward target for this request: ${preferQuestion ? "yes" : "no"}`,
      "",
      "Score each candidate from 1 to 10 for naturalness, attraction, and realism.",
      `Reject a draft if naturalness, attraction, or realism is below ${REQUIRED_QUALITY_SCORE}.`,
      "Reject a draft if it does not match the detected man type.",
      "Reject a draft if it sounds like an interview, therapist, HR bot, porn script, or needy texter.",
      "Reject a draft if it is too formal, too long, too deep for the man, or too explicit.",
      "Reject a question-forward draft if it does not contain one concrete answerable question.",
      "Reject a draft if it repeats, summarizes, or closely paraphrases the latest incoming message.",
      "Reject a draft if its question is generic and does not touch a concrete client fact, open loop, feeling, habit, plan, or preference.",
      "Reject a draft that ignores available client facts or selected memory chunks when a fact-based reply is possible.",
      "Reject a draft that ignores AI notes, skips the dialog context, or gives a surface-level generic line when client data is available.",
      "Reject a simple_practical draft if it turns into a plain logistics or itinerary question instead of attraction.",
      "Use the local hard-rule findings below as additional rejection signals.",
      "",
      "Man-type style rules:",
      ...this.styleRulesForManType(manType),
      "",
      "Local hard-rule findings:",
      ...(hardFailureLines.length > 0 ? hardFailureLines : ["No local hard-rule failures detected."]),
      "",
      "Candidate drafts:",
      JSON.stringify(batch.drafts, null, 2),
      "",
      "Latest exchange summary:",
      JSON.stringify(lastExchange, null, 2),
      "",
      "Context analysis:",
      JSON.stringify(contextAnalysis, null, 2),
      "",
      "Selected vector memory chunks:",
      memoryPromptBlock(prepared.memoryContext),
      "",
      "Full AI notes:",
      notesPromptBlock(prepared.notes),
      "",
      "Normalized conversation summary:",
      conversationPromptBlock(prepared.conversation),
      "",
      "Photo analysis:",
      photoAnalysis ? JSON.stringify(photoAnalysis, null, 2) : "No photo analysis is available."
    ].join("\n");

    return this.generateStructuredOutput<DraftEvaluationResult>(routing.selectedProvider, {
      maxOutputTokens: 1800,
      prompt,
      schema: DRAFT_EVALUATION_SCHEMA,
      schemaName: "assistant_draft_evaluation",
      systemInstruction: [
        "You are a strict quality gate for dating replies.",
        "Score conservatively.",
        `\`passed\` must be true only when naturalness, attraction, and realism are all at least ${REQUIRED_QUALITY_SCORE} and the draft clears every hard criterion.`,
        "`passed` must be false if the draft is generic, ignores supplied notes/dialog, mismatches the man type, asks interview-style questions, sounds needy, or mishandles sexual/trust context.",
        "`bestDraftLabel` must identify the strongest candidate overall even if none pass.",
        "`refinementActions` must be short, concrete rewrite instructions that would make the next batch stronger."
      ].join(" "),
      temperature: 0
    });
  }

  private async repairFallbackDraft(
    prepared: PreparedInputs,
    options: WorkflowOptions,
    contextAnalysis: ContextAnalysisResult,
    photoAnalysis: PhotoAnalysisResult | null,
    routing: ModelRoutingResult,
    manType: ManType,
    lastExchange: { lastIncoming: string | null; lastOutgoing: string | null },
    draft: ReplyDraft | undefined,
    evaluation: DraftEvaluationResult,
    hardFailures: Map<string, string[]>
  ): Promise<ReplyDraft> {
    if (!draft) {
      throw new HttpError(502, "Assistant refinement loop returned no fallback draft.");
    }

    const score = this.scoreForLabel(evaluation, draft.label);
    const violations = [
      ...(hardFailures.get(draft.label) ?? []),
      ...(score?.issues ?? []),
      ...(score?.refinementActions ?? []),
      ...evaluation.refinementActions
    ].filter(Boolean);
    const topViolations = [...new Set(violations)].slice(0, 2);
    const prompt = [
      "Final repair pass after the maximum refinement loop.",
      `Operator language: ${options.operatorLanguage}`,
      `Draft language: ${options.draftLanguage}`,
      `Instruction from operator: ${options.instruction || "Help me write the next message."}`,
      `Requested message type: ${options.messageType || "compliment"}`,
      `Message type guidance: ${options.messageTypeGuidance || "Match the selected type naturally."}`,
      `Requested tone: ${options.tone || "natural, warm, concise"}`,
      `Detected man type: ${manType}`,
      `Recommended reply mode: ${contextAnalysis.recommendedReplyMode}`,
      `Sexual context detected: ${routing.sexualContextDetected ? "yes" : "no"}`,
      `Anti-bot risk detected: ${contextAnalysis.antiBotRiskDetected ? "yes" : "no"}`,
      `Emotional attachment detected: ${contextAnalysis.emotionalAttachmentDetected ? "yes" : "no"}`,
      "",
      "Rewrite the fallback draft into one final ready-to-send reply.",
      `It must score at least ${REQUIRED_QUALITY_SCORE}/10 for naturalness, attraction, and realism.`,
      `It must be one or two sentences and under ${MAX_REPLY_CHARACTERS} characters.`,
      "It must match the man type and situation, avoid interview mode, avoid neediness, and keep sexuality controlled.",
      "It must be grounded in the available client notes, profile, dialog, latest exchange, context analysis, or selected memory chunks.",
      "It must not repeat or paraphrase the latest incoming message.",
      "If it asks a question, the question must touch a concrete client fact, open loop, feeling, habit, plan, or preference.",
      "Fix the top violations first:",
      ...(topViolations.length > 0 ? topViolations : ["Make it more client-specific and less generic."]),
      "",
      "Fallback draft:",
      JSON.stringify(draft, null, 2),
      "",
      "Latest exchange summary:",
      JSON.stringify(lastExchange, null, 2),
      "",
      "Context analysis:",
      JSON.stringify(contextAnalysis, null, 2),
      "",
      "Normalized profile summary:",
      profilePromptBlock(prepared.profile),
      "",
      "Full AI notes:",
      notesPromptBlock(prepared.notes),
      "",
      "Selected vector memory chunks:",
      memoryPromptBlock(prepared.memoryContext),
      "",
      "Normalized conversation summary:",
      conversationPromptBlock(prepared.conversation),
      "",
      "Photo analysis:",
      photoAnalysis ? JSON.stringify(photoAnalysis, null, 2) : "No photo analysis is available."
    ].join("\n");

    return this.generateStructuredOutput<ReplyDraft>(routing.selectedProvider, {
      maxOutputTokens: 900,
      prompt,
      schema: REPLY_DRAFT_SCHEMA,
      schemaName: "assistant_repaired_reply",
      systemInstruction: [
        "You are the final refiner for a dating reply assistant.",
        "Return exactly one repaired reply draft object.",
        "Do not include analysis outside the structured fields.",
        "The message must be natural, attractive, realistic, short, and grounded in the specific client data."
      ].join(" "),
      temperature: 0.35
    });
  }

  private detectSexualContext(
    prepared: PreparedInputs,
    options: RoutingOptions
  ): string[] {
    const sources = [
      {
        label: "operator instruction",
        text: options.instruction ?? ""
      },
      {
        label: "message type guidance",
        text: options.messageTypeGuidance ?? ""
      },
      {
        label: "tone",
        text: options.tone ?? ""
      },
      {
        label: "balanced recent message window",
        text: prepared.conversation?.recentWindowText ?? ""
      }
    ];
    const matches = new Set<string>();

    for (const source of sources) {
      if (!source.text) {
        continue;
      }

      for (const rule of SEXUAL_CONTEXT_RULES) {
        if (rule.pattern.test(source.text)) {
          matches.add(`${rule.label} in ${source.label}`);
        }
      }
    }

    return [...matches];
  }

  private isProviderAvailable(provider: SupportedProvider): boolean {
    return provider === "gemini" ? Boolean(config.geminiApiKey) : Boolean(config.xaiApiKey);
  }

  private modelFor(provider: SupportedProvider): string {
    return provider === "gemini" ? config.geminiModel : config.xaiModel;
  }

  private async generateStructuredOutput<T>(
    provider: SupportedProvider,
    request: GenerationRequest
  ): Promise<T> {
    switch (provider) {
      case "xai":
        return this.generateStructuredOutputWithXai<T>(request);
      default:
        return this.generateStructuredOutputWithGemini<T>(request);
    }
  }

  private async generateStructuredOutputWithGemini<T>(
    request: GenerationRequest
  ): Promise<T> {
    if (!config.geminiApiKey) {
      throw new HttpError(500, "BESCO_GEMINI_API_KEY is not configured.");
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const contents = request.imageUrl
        ? [await downloadImageAsInlinePart(request.imageUrl), { text: request.prompt }]
        : request.prompt;
      const response = await this.geminiClient.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          maxOutputTokens: request.maxOutputTokens ?? 1800,
          responseJsonSchema: request.schema,
          responseMimeType: "application/json",
          systemInstruction: request.systemInstruction,
          thinkingConfig: {
            thinkingBudget: 0
          },
          temperature: request.temperature ?? 0.3
        }
      });
      const rawText = response.text?.trim();

      if (!rawText) {
        if (attempt === 3) {
          throw new HttpError(502, "Gemini returned an empty response.");
        }

        continue;
      }

      const parsed = parseStructuredJson<T>(rawText);

      if (parsed) {
        return parsed;
      }
    }

    throw new HttpError(502, "Gemini returned a non-JSON response.");
  }

  private async generateStructuredOutputWithXai<T>(
    request: GenerationRequest
  ): Promise<T> {
    if (!config.xaiApiKey) {
      throw new HttpError(500, "BESCO_XAI_API_KEY is not configured.");
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify({
          max_tokens: request.maxOutputTokens ?? 1800,
          messages: [
            {
              content: request.systemInstruction,
              role: "system"
            },
            {
              content: request.imageUrl
                ? [
                    {
                      image_url: {
                        detail: "high",
                        url: request.imageUrl
                      },
                      type: "image_url"
                    },
                    {
                      text: request.prompt,
                      type: "text"
                    }
                  ]
                : request.prompt,
              role: "user"
            }
          ],
          model: config.xaiModel,
          response_format: {
            json_schema: {
              name: request.schemaName,
              schema: request.schema,
              strict: true
            },
            type: "json_schema"
          },
          stream: false,
          temperature: request.temperature ?? 0.3
        }),
        headers: {
          authorization: `Bearer ${config.xaiApiKey}`,
          "content-type": "application/json"
        },
        method: "POST"
      });

      const rawText = await response.text();

      if (!response.ok) {
        throw new HttpError(
          502,
          `xAI returned ${response.status}: ${truncateMessage(rawText)}`
        );
      }

      let parsedResponse: XaiChatCompletionResponse;

      try {
        parsedResponse = JSON.parse(rawText) as XaiChatCompletionResponse;
      } catch {
        throw new HttpError(502, "xAI returned a non-JSON response.");
      }

      if (parsedResponse.error?.message) {
        throw new HttpError(502, `xAI returned an error: ${parsedResponse.error.message}`);
      }

      const content = extractXaiContent(parsedResponse);

      if (!content) {
        if (attempt === 3) {
          throw new HttpError(502, "xAI returned an empty response.");
        }

        continue;
      }

      const parsed = parseStructuredJson<T>(content);

      if (parsed) {
        return parsed;
      }
    }

    throw new HttpError(502, "xAI returned a non-JSON response.");
  }
}
