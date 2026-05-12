import { config } from "../config";
import { HttpError } from "../errors";

type UnknownRecord = Record<string, unknown>;

export interface DialogInfoRequest {
  bonusesFrom?: number;
  bonusesTo?: number;
}

export interface DialogInfoResult {
  aiNotesCount: number;
  conversationJson: string;
  dialogPayload: unknown;
  memorySync?: {
    dialogKey?: string;
    error?: string;
    inserted?: number;
    ok: boolean;
    sources?: Record<string, number>;
    totalChunks?: number;
  };
  messageCount: number;
  photoUrl: string | null;
  profileJson: string;
  profit: number | null;
  warnings: string[];
}

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

function cleanString(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanString(value);
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
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

function extractPhotoUrl(profilePayload: unknown): string | null {
  if (!isObject(profilePayload)) {
    return null;
  }

  const photoKeys = [
    "big_url",
    "profile_url",
    "photo_url",
    "original_url",
    "preview_url",
    "url",
    "src"
  ];
  const mainPhoto = firstDefined(profilePayload, [
    ["main_photo"],
    ["mainPhoto"],
    ["profile_photo"],
    ["profilePhoto"]
  ]);
  const mainPhotoUrl = readUrlByKeys(mainPhoto, photoKeys);

  if (mainPhotoUrl) {
    return mainPhotoUrl;
  }

  const photos = Array.isArray(profilePayload.photos) ? profilePayload.photos : [];

  for (const photo of photos) {
    const directUrl = readUrlByKeys(photo, photoKeys);

    if (directUrl) {
      return directUrl;
    }

    const nestedUrl = firstDefined(photo, [
      ["image"],
      ["photo"],
      ["file"],
      ["urls"]
    ]);
    const nestedPhotoUrl = readUrlByKeys(nestedUrl, photoKeys);

    if (nestedPhotoUrl) {
      return nestedPhotoUrl;
    }
  }

  return readUrlByKeys(profilePayload, photoKeys);
}

function extractMessages(payload: unknown): unknown[] {
  const candidate = firstDefined(payload, [
    ["data", "favorite", "allMessages"],
    ["favorite", "allMessages"],
    ["data", "allMessages"],
    ["allMessages"]
  ]);

  return Array.isArray(candidate) ? candidate : [];
}

function extractProfile(payload: unknown): unknown {
  return firstDefined(payload, [
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

function extractProfit(payload: unknown): number | null {
  return toNumberValue(
    firstDefined(payload, [
      ["data", "favorite", "profit"],
      ["favorite", "profit"],
      ["data", "profit"],
      ["profit"]
    ])
  );
}

function extractAiNotes(payload: unknown): unknown[] {
  const candidate = firstDefined(payload, [
    ["data", "favorite", "aiNotes"],
    ["favorite", "aiNotes"],
    ["data", "aiNotes"],
    ["aiNotes"]
  ]);

  return Array.isArray(candidate) ? candidate : [];
}

function buildRequestBody(request: DialogInfoRequest): Record<string, number> | null {
  const body: Record<string, number> = {};

  if (typeof request.bonusesFrom === "number") {
    body.bonusesFrom = request.bonusesFrom;
  }

  if (typeof request.bonusesTo === "number") {
    body.bonusesTo = request.bonusesTo;
  }

  return Object.keys(body).length > 0 ? body : null;
}

export async function fetchFullDialogInfo(
  request: DialogInfoRequest
): Promise<DialogInfoResult> {
  const requestBody = buildRequestBody(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response: Response;

  try {
    response = await fetch(config.dialogInfoApiUrl, {
      body: requestBody ? JSON.stringify(requestBody) : undefined,
      headers: requestBody ? { "content-type": "application/json" } : undefined,
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Dialog API request timed out."
        : error instanceof Error
          ? error.message
          : "Unknown network error.";

    throw new HttpError(502, `Dialog API request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();

  if (!response.ok) {
    throw new HttpError(
      502,
      `Dialog API returned ${response.status}: ${rawText.slice(0, 300)}`
    );
  }

  let dialogPayload: unknown;

  try {
    dialogPayload = JSON.parse(rawText);
  } catch {
    throw new HttpError(502, "Dialog API returned a non-JSON response.");
  }

  if (isObject(dialogPayload) && dialogPayload.success === false) {
    const message = toStringValue(dialogPayload.message) ?? "Dialog API returned success=false.";
    throw new HttpError(502, message);
  }

  const messages = extractMessages(dialogPayload);
  const profilePayload = extractProfile(dialogPayload);
  const photoUrl = extractPhotoUrl(profilePayload);
  const aiNotes = extractAiNotes(dialogPayload);
  const warnings: string[] = [];

  if (messages.length === 0) {
    warnings.push("Dialog API response did not include allMessages.");
  }

  if (!profilePayload) {
    warnings.push("Dialog API response did not include profile data.");
  }

  if (!photoUrl) {
    warnings.push("Dialog API profile did not include a photo URL.");
  }

  if (aiNotes.length === 0) {
    warnings.push("Dialog API response did not include aiNotes.");
  }

  return {
    aiNotesCount: aiNotes.length,
    conversationJson: JSON.stringify(dialogPayload, null, 2),
    dialogPayload,
    messageCount: messages.length,
    photoUrl,
    profileJson: JSON.stringify(profilePayload ?? null, null, 2),
    profit: extractProfit(dialogPayload),
    warnings
  };
}
