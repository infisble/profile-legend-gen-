import {
  InputOverview,
  MemoryChunk,
  MessageRecord,
  NoteRecord,
  NormalizedProfile,
  PreparedConversation,
  PreparedMemoryContext,
  PreparedInputs
} from "../types";

type UnknownRecord = Record<string, unknown>;

export const MEMORY_VECTOR_DIMENSIONS = 128;
const MEMORY_CHUNK_LIMIT = 12;
const memoryIndex = new Map<string, MemoryChunk[]>();

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(source: unknown, path: Array<string | number>): unknown {
  let current: unknown = source;

  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
      continue;
    }

    if (!isObject(current) || typeof segment !== "string") {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function firstDefined(source: unknown, paths: Array<Array<string | number>>): unknown {
  for (const path of paths) {
    const value = readPath(source, path);

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    return cleaned.length > 0 ? cleaned : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function tokenizeForVector(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function vectorizeText(value: string): number[] {
  const vector = Array.from({ length: MEMORY_VECTOR_DIMENSIONS }, () => 0);

  for (const token of tokenizeForVector(value)) {
    vector[hashToken(token) % MEMORY_VECTOR_DIMENSIONS] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, entry) => sum + entry * entry, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((entry) => Number((entry / magnitude).toFixed(6)));
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, entry, index) => sum + entry * (right[index] ?? 0), 0);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.map((entry) => toStringValue(entry)));
}

function readUrlByKeys(source: unknown, keys: string[]): string | null {
  if (!isObject(source)) {
    return null;
  }

  for (const key of keys) {
    const value = toStringValue(source[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function profilePhotoUrl(value: UnknownRecord): string | null {
  const photoKeys = [
    "big_url",
    "profile_url",
    "photo_url",
    "original_url",
    "preview_url",
    "url",
    "src"
  ];
  const mainPhoto =
    firstDefined(value, [
      ["main_photo"],
      ["mainPhoto"],
      ["profile_photo"],
      ["profilePhoto"]
    ]);
  const mainPhotoUrl = readUrlByKeys(mainPhoto, photoKeys);

  if (mainPhotoUrl) {
    return mainPhotoUrl;
  }

  const photos = Array.isArray(value.photos) ? value.photos : [];

  for (const photo of photos) {
    const directUrl = readUrlByKeys(photo, photoKeys);

    if (directUrl) {
      return directUrl;
    }

    const nestedPhoto = firstDefined(photo, [
      ["image"],
      ["photo"],
      ["file"],
      ["urls"]
    ]);
    const nestedUrl = readUrlByKeys(nestedPhoto, photoKeys);

    if (nestedUrl) {
      return nestedUrl;
    }
  }

  return readUrlByKeys(value, photoKeys);
}

function normalizeProfile(value: unknown): NormalizedProfile | null {
  if (!isObject(value)) {
    return null;
  }

  const details = isObject(value.details) ? value.details : {};
  const country = isObject(value.country) ? value.country : {};
  const city = isObject(value.city) ? value.city : {};
  const photoUrl = profilePhotoUrl(value);

  return {
    age: toNumberValue(value.age),
    bodyType: toStringValue(details.body_type),
    city: toStringValue(city.name) ?? toStringValue(value.city),
    country: toStringValue(country.name),
    goal: stringArray(details.goal),
    hobbies: stringArray(details.hobbies),
    maritalStatus: toStringValue(details.marital_status),
    name: toStringValue(value.name),
    occupation: toStringValue(details.occupation),
    personalityType: toStringValue(details.personality_type),
    photoCount: toNumberValue(value.photo_count),
    photoUrl,
    traits: stringArray(details.traits)
  };
}

function normalizeNote(value: unknown): NoteRecord | null {
  if (!isObject(value)) {
    return null;
  }

  const text =
    toStringValue(value.text) ??
    toStringValue(value.note) ??
    toStringValue(value.summary);

  if (!text) {
    return null;
  }

  return {
    date: toStringValue(value.date) ?? toStringValue(value.created_at),
    id: toStringValue(value.id),
    text: text.slice(0, 800)
  };
}

function mergeNotes(primary: NoteRecord[], fallback: NoteRecord[]): NoteRecord[] {
  const merged = new Map<string, NoteRecord>();

  for (const note of [...fallback, ...primary]) {
    const key = note.id ?? `${note.date ?? "no-date"}:${note.text}`;

    if (!merged.has(key)) {
      merged.set(key, note);
    }
  }

  return [...merged.values()];
}

function mergeProfiles(
  primary: NormalizedProfile | null,
  fallback: NormalizedProfile | null
): NormalizedProfile | null {
  if (!primary && !fallback) {
    return null;
  }

  const base = primary ?? fallback;

  if (!base) {
    return null;
  }

  return {
    age: primary?.age ?? fallback?.age ?? null,
    bodyType: primary?.bodyType ?? fallback?.bodyType ?? null,
    city: primary?.city ?? fallback?.city ?? null,
    country: primary?.country ?? fallback?.country ?? null,
    goal: uniqueStrings([...(primary?.goal ?? []), ...(fallback?.goal ?? [])]),
    hobbies: uniqueStrings([...(primary?.hobbies ?? []), ...(fallback?.hobbies ?? [])]),
    maritalStatus: primary?.maritalStatus ?? fallback?.maritalStatus ?? null,
    name: primary?.name ?? fallback?.name ?? null,
    occupation: primary?.occupation ?? fallback?.occupation ?? null,
    personalityType: primary?.personalityType ?? fallback?.personalityType ?? null,
    photoCount: primary?.photoCount ?? fallback?.photoCount ?? null,
    photoUrl: primary?.photoUrl ?? fallback?.photoUrl ?? null,
    traits: uniqueStrings([...(primary?.traits ?? []), ...(fallback?.traits ?? [])])
  };
}

function attachmentLabels(message: UnknownRecord): string[] {
  const labels: string[] = [];

  if (message.photo) {
    labels.push("[photo]");
  }

  if (message.video) {
    labels.push("[video]");
  }

  if (message.sticker) {
    labels.push("[sticker]");
  }

  if (message.gift) {
    labels.push("[gift]");
  }

  return labels;
}

function normalizeMessage(value: unknown): MessageRecord | null {
  if (!isObject(value)) {
    return null;
  }

  const body = toStringValue(value.body);
  const attachments = attachmentLabels(value);
  const combinedBody = cleanText([body, ...attachments].filter(Boolean).join(" "));

  if (!combinedBody) {
    return null;
  }

  const type = toNumberValue(value.type);
  const isSystem =
    type === 3 ||
    /is online now\.?|is waiting to chat/i.test(combinedBody);

  return {
    attachments,
    body: combinedBody.slice(0, 420),
    direction: value.is_incoming ? "incoming" : "outgoing",
    format: toNumberValue(value.format),
    id: toStringValue(value.id),
    isSystem,
    sentAt: toStringValue(value.sent_at),
    type
  };
}

function sortMessages(a: MessageRecord, b: MessageRecord): number {
  const left = a.sentAt ? Date.parse(a.sentAt) : 0;
  const right = b.sentAt ? Date.parse(b.sentAt) : 0;
  return left - right;
}

function formatMessage(message: MessageRecord): string {
  return `${message.sentAt ?? "unknown time"} | ${message.direction.toUpperCase()} | ${message.body}`;
}

function extractConversationArray(value: unknown): unknown[] {
  const candidate = firstDefined(value, [
    ["data", "favorite", "allMessages"],
    ["favorite", "allMessages"],
    ["data", "allMessages"],
    ["allMessages"],
    ["data", "favorite", "messages"],
    ["favorite", "messages"],
    ["data", "messages"],
    ["messages"]
  ]);

  if (Array.isArray(candidate)) {
    return candidate;
  }

  return Array.isArray(value) ? value : [];
}

function buildBalancedRecentWindow(
  messages: MessageRecord[],
  messagesPerDirection = 5
): MessageRecord[] {
  const incoming = messages
    .filter((message) => message.direction === "incoming")
    .slice(-messagesPerDirection);
  const outgoing = messages
    .filter((message) => message.direction === "outgoing")
    .slice(-messagesPerDirection);

  return [...incoming, ...outgoing]
    .sort(sortMessages)
    .filter((message, index, source) => {
      const key = `${message.id ?? "no-id"}:${message.sentAt ?? "no-time"}:${message.body}`;
      const existingIndex = source.findIndex((entry) => {
        return `${entry.id ?? "no-id"}:${entry.sentAt ?? "no-time"}:${entry.body}` === key;
      });
      return existingIndex === index;
    });
}

function normalizeConversation(value: unknown): PreparedConversation | null {
  const rawMessages = extractConversationArray(value);

  if (rawMessages.length === 0) {
    return null;
  }

  const normalized = rawMessages
    .map((entry) => normalizeMessage(entry))
    .filter((entry): entry is MessageRecord => Boolean(entry))
    .sort(sortMessages);

  const meaningful = normalized.filter((message) => !message.isSystem);

  if (meaningful.length === 0) {
    return null;
  }

  const messages = meaningful;
  const recentWindowMessages = buildBalancedRecentWindow(meaningful);
  const reverse = [...meaningful].reverse();
  const lastIncoming = reverse.find((message) => message.direction === "incoming") ?? null;
  const lastOutgoing = reverse.find((message) => message.direction === "outgoing") ?? null;

  return {
    conversationText: messages.map((message) => formatMessage(message)).join("\n"),
    keptMessages: messages.length,
    lastIncoming,
    lastOutgoing,
    messages,
    recentWindowMessages,
    recentWindowText: recentWindowMessages
      .map((message) => formatMessage(message))
      .join("\n"),
    totalMessages: meaningful.length
  };
}

function extractEmbeddedProfile(value: unknown): unknown {
  return firstDefined(value, [
    ["data", "favorite", "profileRu"],
    ["data", "favorite", "profileRU"],
    ["data", "favorite", "profile"],
    ["favorite", "profileRu"],
    ["favorite", "profileRU"],
    ["favorite", "profile"],
    ["data", "profileRu"],
    ["data", "profileRU"],
    ["data", "profile"],
    ["profileRu"],
    ["profileRU"],
    ["profile"]
  ]);
}

function extractEmbeddedNotes(value: unknown): unknown[] {
  const paths = [
    ["data", "favorite", "aiNotes"],
    ["favorite", "aiNotes"],
    ["data", "aiNotes"],
    ["aiNotes"],
    ["data", "favorite", "manualNotes"],
    ["favorite", "manualNotes"],
    ["data", "manualNotes"],
    ["manualNotes"],
    ["data", "favorite", "notes"],
    ["favorite", "notes"],
    ["data", "notes"],
    ["notes"]
  ];
  const notes = paths.flatMap((path) => {
    const candidate = readPath(value, path);
    return Array.isArray(candidate) ? candidate : [];
  });

  return notes;
}

function normalizeNotes(value: unknown): NoteRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeNote(entry))
    .filter((entry): entry is NoteRecord => Boolean(entry));
}

function resolvePhotoUrl(
  explicitPhotoUrl: string | null,
  explicitProfile: NormalizedProfile | null,
  embeddedProfile: NormalizedProfile | null
): string | null {
  return (
    toStringValue(explicitPhotoUrl) ??
    explicitProfile?.photoUrl ??
    embeddedProfile?.photoUrl ??
    null
  );
}

function profileMemoryLines(profile: NormalizedProfile | null): string[] {
  if (!profile) {
    return [];
  }

  const lines = [
    profile.name ? `Name: ${profile.name}` : null,
    profile.age ? `Age: ${profile.age}` : null,
    profile.city || profile.country
      ? `Location: ${[profile.city, profile.country].filter(Boolean).join(", ")}`
      : null,
    profile.occupation ? `Occupation: ${profile.occupation}` : null,
    profile.bodyType ? `Body type: ${profile.bodyType}` : null,
    profile.maritalStatus ? `Marital status: ${profile.maritalStatus}` : null,
    profile.personalityType ? `Personality type: ${profile.personalityType}` : null,
    profile.goal.length > 0 ? `Goals: ${profile.goal.join(", ")}` : null,
    profile.hobbies.length > 0 ? `Hobbies: ${profile.hobbies.join(", ")}` : null,
    profile.traits.length > 0 ? `Traits: ${profile.traits.join(", ")}` : null
  ];

  return lines.filter((line): line is string => Boolean(line));
}

function splitLongText(value: string, maxLength = 420): string[] {
  if (value.length <= maxLength) {
    return [value];
  }

  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;

    if (next.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [value.slice(0, maxLength)];
}

export function buildMemoryChunks(
  profile: NormalizedProfile | null,
  notes: NoteRecord[],
  conversation: PreparedConversation | null
): MemoryChunk[] {
  const rawChunks: Array<Omit<MemoryChunk, "score" | "vector">> = [];

  profileMemoryLines(profile).forEach((line, index) => {
    rawChunks.push({
      id: `profile:${index + 1}`,
      source: "profile",
      text: line
    });
  });

  notes.forEach((note, noteIndex) => {
    splitLongText(note.text).forEach((chunk, chunkIndex) => {
      rawChunks.push({
        id: `note:${note.id ?? noteIndex + 1}:${chunkIndex + 1}`,
        noteDate: note.date,
        source: "note",
        sourceId: note.id ?? String(noteIndex + 1),
        text: note.date ? `${note.date} | ${chunk}` : chunk
      });
    });
  });

  conversation?.messages.slice(-80).forEach((message) => {
    const isLetter =
      message.format === 5 ||
      message.type === 2 ||
      message.body.split(/\s+/).filter(Boolean).length >= 55;

    rawChunks.push({
      id: `conversation:${message.id ?? message.sentAt ?? rawChunks.length + 1}`,
      direction: message.direction,
      sentAt: message.sentAt,
      source: isLetter ? "letter" : "conversation",
      sourceId: message.id,
      text: `${message.direction}: ${message.body}`
    });
  });

  return rawChunks.map((chunk) => ({
    ...chunk,
    score: 0,
    vector: vectorizeText(chunk.text)
  }));
}

function memoryCacheKey(
  profile: NormalizedProfile | null,
  notes: NoteRecord[],
  conversation: PreparedConversation | null
): string {
  const stableParts = [
    profile?.name ?? "unknown",
    profile?.city ?? "",
    profile?.country ?? "",
    String(notes.length),
    notes.map((note) => note.id ?? note.text.slice(0, 40)).join("|"),
    String(conversation?.totalMessages ?? 0)
  ];

  return String(hashToken(stableParts.join("::")));
}

function buildMemoryQuery(
  profile: NormalizedProfile | null,
  notes: NoteRecord[],
  conversation: PreparedConversation | null
): string {
  const latestThread = conversation?.recentWindowMessages
    .slice(-8)
    .map((message) => message.body)
    .join(" ");
  const profileFacts = profileMemoryLines(profile).join(" ");
  const recentNotes = notes
    .slice(-6)
    .map((note) => note.text)
    .join(" ");

  return cleanText([latestThread, profileFacts, recentNotes].filter(Boolean).join(" "));
}

function buildMemoryContext(
  profile: NormalizedProfile | null,
  notes: NoteRecord[],
  conversation: PreparedConversation | null
): PreparedMemoryContext {
  const cacheKey = memoryCacheKey(profile, notes, conversation);
  const chunks = buildMemoryChunks(profile, notes, conversation);
  const query = buildMemoryQuery(profile, notes, conversation);
  const queryVector = vectorizeText(query);
  const scored = chunks
    .map((chunk) => ({
      ...chunk,
      score: Number(cosineSimilarity(chunk.vector, queryVector).toFixed(6))
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const sourceRank: Record<MemoryChunk["source"], number> = {
        conversation: 1,
        letter: 3,
        note: 4,
        profile: 2,
        summary: 3
      };
      return sourceRank[right.source] - sourceRank[left.source];
    });
  const selectedChunks = scored.slice(0, MEMORY_CHUNK_LIMIT);

  memoryIndex.set(cacheKey, chunks);

  return {
    cacheKey,
    query,
    selectedChunks,
    strategy:
      "Hashed lexical vectors over profile, AI-note, and recent-dialog chunks; top chunks are selected by cosine similarity and cached in memory for this backend process.",
    totalChunks: chunks.length,
    vectorDimensions: MEMORY_VECTOR_DIMENSIONS
  };
}

function buildInputOverview(
  conversation: PreparedConversation | null,
  notes: NoteRecord[],
  photoUrl: string | null,
  profile: NormalizedProfile | null,
  warnings: string[]
): InputOverview {
  return {
    hasConversation: Boolean(conversation),
    hasNotes: notes.length > 0,
    hasPhoto: Boolean(photoUrl),
    hasProfile: Boolean(profile),
    keptMessages: conversation?.keptMessages ?? 0,
    notesCount: notes.length,
    photoUrl,
    totalMessages: conversation?.totalMessages ?? 0,
    warnings
  };
}

export function prepareInputs(params: {
  conversationPayload: unknown;
  photoUrl: string | null;
  profilePayload: unknown;
}): PreparedInputs {
  const embeddedProfile = normalizeProfile(extractEmbeddedProfile(params.conversationPayload));
  const explicitProfile = normalizeProfile(params.profilePayload);
  const profile = mergeProfiles(explicitProfile, embeddedProfile);
  const embeddedNotes = normalizeNotes(extractEmbeddedNotes(params.conversationPayload));
  const explicitNotes = normalizeNotes(extractEmbeddedNotes(params.profilePayload));
  const notes = mergeNotes(explicitNotes, embeddedNotes);
  const conversation = normalizeConversation(params.conversationPayload);
  const photoUrl = resolvePhotoUrl(params.photoUrl, explicitProfile, embeddedProfile);
  const memoryContext = buildMemoryContext(profile, notes, conversation);
  const warnings: string[] = [];

  if (!profile) {
    warnings.push("Profile payload was not detected or could not be normalized.");
  }

  if (!conversation) {
    warnings.push("Conversation history was not detected or contained no meaningful messages.");
  }

  if (notes.length === 0) {
    warnings.push("AI notes were not detected from the payload.");
  }

  if (!photoUrl) {
    warnings.push("Photo URL was not detected from the payload.");
  }

  return {
    conversation,
    inputOverview: buildInputOverview(conversation, notes, photoUrl, profile, warnings),
    memoryContext,
    notes,
    photoUrl,
    profile
  };
}

export function profilePromptBlock(profile: NormalizedProfile | null): string {
  if (!profile) {
    return "No normalized profile is available.";
  }

  return JSON.stringify(profile, null, 2);
}

export function conversationPromptBlock(conversation: PreparedConversation | null): string {
  if (!conversation) {
    return "No normalized conversation history is available.";
  }

  const summary = {
    keptMessages: conversation.keptMessages,
    lastIncoming: conversation.lastIncoming?.body ?? null,
    lastOutgoing: conversation.lastOutgoing?.body ?? null,
    recentWindowMessages: conversation.recentWindowMessages.length,
    totalMessages: conversation.totalMessages
  };
  const recentTailText = conversation.messages
    .slice(-20)
    .map((message) => formatMessage(message))
    .join("\n");

  return [
    JSON.stringify(summary, null, 2),
    "",
    "Balanced recent window (last 5 incoming + last 5 outgoing when available):",
    conversation.recentWindowText || "No balanced recent window is available.",
    "",
    "Recent dialog tail (last 20 meaningful messages):",
    recentTailText || "No recent dialog tail is available."
  ].join("\n");
}

export function notesPromptBlock(notes: NoteRecord[]): string {
  if (notes.length === 0) {
    return "No AI notes are available.";
  }

  return notes
    .map((note, index) => {
      const prefix = note.date ? `${note.date} | ` : "";
      return `${index + 1}. ${prefix}${note.text}`;
    })
    .join("\n");
}

export function memoryPromptBlock(memoryContext: PreparedMemoryContext): string {
  if (memoryContext.selectedChunks.length === 0) {
    return "No memory chunks are available.";
  }

  const header = [
    `Cache key: ${memoryContext.cacheKey}`,
    `Vector dimensions: ${memoryContext.vectorDimensions}`,
    `Selected chunks: ${memoryContext.selectedChunks.length} of ${memoryContext.totalChunks}`,
    `Strategy: ${memoryContext.strategy}`
  ].join("\n");
  const chunks = memoryContext.selectedChunks
    .map((chunk, index) => {
      return `${index + 1}. [${chunk.source}; score=${chunk.score}] ${chunk.text}`;
    })
    .join("\n");

  return `${header}\n\n${chunks}`;
}
