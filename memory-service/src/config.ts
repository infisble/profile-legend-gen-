import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_PORT = 3001;
const DEFAULT_XAI_MODEL = "grok-4.20-reasoning";
const DEFAULT_DIALOG_INFO_API_URL =
  "https://test-api.besocial.tech/chathouse/favorites/getFullDialogInfo";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

export const config = {
  corsOrigin: firstNonEmpty(
    process.env.BESCO_CORS_ORIGINS,
    process.env.CORS_ORIGIN
  ) ?? "http://localhost:4200,http://localhost:5173",
  geminiApiKey: firstNonEmpty(
    process.env.BESCO_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY
  ) ?? "",
  geminiModel: firstNonEmpty(
    process.env.BESCO_GEMINI_MODEL,
    process.env.GEMINI_MODEL
  ) ?? DEFAULT_MODEL,
  geminiEndpointMode: firstNonEmpty(process.env.BESCO_GEMINI_ENDPOINT_MODE) ?? "gemini",
  dialogInfoApiUrl:
    firstNonEmpty(process.env.BESCO_DIALOG_INFO_API_URL) ?? DEFAULT_DIALOG_INFO_API_URL,
  modelProvider: firstNonEmpty(process.env.BESCO_MODEL_PROVIDER) ?? "gemini",
  port: parsePort(process.env.PORT),
  supabasePublishableKey: firstNonEmpty(
    process.env.BESCO_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY
  ) ?? "",
  supabaseServiceRoleKey: firstNonEmpty(
    process.env.BESCO_SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) ?? "",
  supabaseUrl: firstNonEmpty(
    process.env.BESCO_SUPABASE_URL,
    process.env.SUPABASE_URL
  ) ?? "",
  womanId: firstNonEmpty(
    process.env.BESCO_WOMAN_ID,
    process.env.BESCO_OPERATOR_ID
  ) ?? "default-operator",
  xaiApiKey: firstNonEmpty(process.env.BESCO_XAI_API_KEY) ?? "",
  xaiModel:
    firstNonEmpty(process.env.BESCO_XAI_MODEL, process.env.XAI_MODEL) ?? DEFAULT_XAI_MODEL
};
