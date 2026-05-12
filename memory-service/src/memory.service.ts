import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { HttpError } from "./errors";
import { config } from "./config";
import { SupabaseService } from "./supabase.service";
import { MemoryChunk, PreparedInputs, PreparedMemoryContext } from "./types";
import {
  buildMemoryChunks,
  prepareInputs,
  vectorizeText
} from "./utils/payload-utils";

type UnknownRecord = Record<string, unknown>;

interface MemoryIngestRequest {
  clientId?: string;
  composeMode?: "reply" | "letter" | "both";
  conversationJson?: string;
  dialogKey?: string;
  favoriteId?: string;
  photoUrl?: string;
  profileJson?: string;
  womanId?: string;
}

interface MemorySearchRequest extends MemoryIngestRequest {
  limit?: number;
  query?: string;
}

interface MemoryRow {
  client_id: string | null;
  compose_mode: "reply" | "letter" | "both";
  content_hash: string;
  dialog_key: string;
  direction: "incoming" | "outgoing" | null;
  embedding: string;
  embedding_model: string;
  favorite_id: string;
  language: string | null;
  metadata: UnknownRecord;
  note_date: string | null;
  sent_at: string | null;
  source: MemoryChunk["source"];
  source_id: string | null;
  tags: string[];
  text: string;
  woman_id: string | null;
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

function firstString(source: unknown, paths: Array<Array<string | number>>): string | null {
  for (const path of paths) {
    const value = readPath(source, path);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function parsePossibleJson(value: unknown, fieldName: string): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new HttpError(400, `${fieldName} is not valid JSON.`);
    }
  }

  return value;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function clampLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.max(1, Math.min(24, Math.trunc(parsed)));
}

@Injectable()
export class MemoryService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async status() {
    const { count, error } = await this.supabaseService
      .getClient()
      .from("client_memory_chunks")
      .select("id", {
        count: "exact",
        head: true
      });

    if (error) {
      return {
        ready: false,
        table: "client_memory_chunks",
        error: error.message,
        needsMigration: /Could not find the table|schema cache/i.test(error.message)
      };
    }

    return {
      ready: true,
      table: "client_memory_chunks",
      totalChunks: count ?? 0
    };
  }

  async ingest(request: MemoryIngestRequest) {
    const parsed = this.prepareRequest(request);
    const chunks = buildMemoryChunks(
      parsed.prepared.profile,
      parsed.prepared.notes,
      parsed.prepared.conversation
    );
    const rows = chunks.map((chunk) =>
      this.toMemoryRow(chunk, {
        clientId: parsed.clientId,
        composeMode: parsed.composeMode,
        dialogKey: parsed.dialogKey,
        favoriteId: parsed.favoriteId,
        womanId: parsed.womanId
      })
    );

    if (rows.length === 0) {
      return {
        favoriteId: parsed.favoriteId,
        inserted: 0,
        message: "No memory chunks were produced from the payload.",
        totalChunks: 0
      };
    }

    const { error } = await this.supabaseService
      .getClient()
      .from("client_memory_chunks")
      .upsert(rows, {
        onConflict: "dialog_key,content_hash"
      });

    if (error) {
      throw new HttpError(502, `Supabase memory upsert failed: ${error.message}`);
    }

    return {
      favoriteId: parsed.favoriteId,
      dialogKey: parsed.dialogKey,
      inserted: rows.length,
      sources: this.countSources(chunks),
      totalChunks: rows.length
    };
  }

  async search(request: MemorySearchRequest) {
    const parsed = this.prepareRequest(request);
    const query =
      typeof request.query === "string" && request.query.trim()
        ? request.query.trim()
        : parsed.prepared.memoryContext.query;
    const queryVector = vectorLiteral(vectorizeText(query));
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc("match_client_memory_chunks", {
        match_client_id: parsed.clientId,
        match_compose_mode: parsed.composeMode === "both" ? "reply" : parsed.composeMode,
        match_count: clampLimit(request.limit),
        match_dialog_key: parsed.dialogKey,
        query_embedding: queryVector
      });

    if (error) {
      throw new HttpError(502, `Supabase memory search failed: ${error.message}`);
    }

    return {
      favoriteId: parsed.favoriteId,
      dialogKey: parsed.dialogKey,
      query,
      results: data ?? []
    };
  }

  async enrichPreparedMemory(
    prepared: PreparedInputs,
    request: MemorySearchRequest,
    composeMode: "reply" | "letter" = "reply"
  ): Promise<PreparedInputs> {
    try {
      const query = this.buildGenerationQuery(prepared, request.query);
      const searchResult = await this.search({
        ...request,
        composeMode,
        limit: request.limit ?? 12,
        query
      });
      const rows = Array.isArray(searchResult.results) ? searchResult.results : [];

      if (rows.length === 0) {
        return prepared;
      }

      const selectedChunks: MemoryChunk[] = rows.map((row: UnknownRecord, index) => ({
        id: typeof row.id === "string" ? row.id : `supabase:${index + 1}`,
        score: typeof row.weighted_score === "number" ? row.weighted_score : 0,
        source: this.toMemorySource(row.source),
        text: this.formatRetrievedChunk(row),
        vector: []
      }));
      const memoryContext: PreparedMemoryContext = {
        cacheKey: searchResult.dialogKey,
        query,
        selectedChunks,
        strategy:
          "Supabase pgvector retrieval over persisted profile, note, conversation, and letter chunks. Results are filtered by dialog_key and reranked by source, compose mode, recency, and cosine similarity.",
        totalChunks: rows.length,
        vectorDimensions: 128
      };

      return {
        ...prepared,
        memoryContext
      };
    } catch {
      return prepared;
    }
  }

  private prepareRequest(request: MemoryIngestRequest) {
    const conversationPayload = parsePossibleJson(
      request.conversationJson,
      "conversationJson"
    );
    const profilePayload = parsePossibleJson(request.profileJson, "profileJson");
    const prepared = prepareInputs({
      conversationPayload,
      photoUrl: request.photoUrl ?? null,
      profilePayload
    });
    const favoriteId =
      request.favoriteId ??
      firstString(conversationPayload, [
        ["data", "favorite", "id"],
        ["favorite", "id"],
        ["favoriteId"],
        ["id"]
      ]) ??
      prepared.memoryContext.cacheKey;
    const clientId =
      request.clientId ??
      firstString(conversationPayload, [
        ["data", "favorite", "clientId"],
        ["favorite", "clientId"],
        ["data", "favorite", "profile", "id"],
        ["data", "favorite", "profile", "ulid_id"],
        ["favorite", "profile", "id"],
        ["favorite", "profile", "ulid_id"],
        ["data", "profile", "ulid_id"],
        ["profile", "id"],
        ["profile", "ulid_id"],
        ["ulid_id"],
        ["clientId"]
      ]);
    const womanId =
      request.womanId ??
      firstString(conversationPayload, [
        ["data", "operator", "id"],
        ["data", "girl", "id"],
        ["data", "profile", "girl_id"],
        ["favorite", "operatorId"],
        ["favorite", "girlId"],
        ["operatorId"],
        ["girlId"],
        ["womanId"]
      ]) ??
      config.womanId;
    const dialogKey =
      request.dialogKey ??
      hashValue(
        [
          "dialog",
          womanId ?? "unknown-woman",
          clientId ?? firstString(profilePayload, [["ulid_id"], ["id"]]) ?? "unknown-client"
        ].join(":")
      );
    const composeMode = request.composeMode ?? "both";

    return {
      clientId,
      composeMode,
      dialogKey,
      favoriteId,
      womanId,
      prepared
    };
  }

  private buildGenerationQuery(prepared: PreparedInputs, explicitQuery: unknown): string {
    if (typeof explicitQuery === "string" && explicitQuery.trim()) {
      return explicitQuery.trim();
    }

    const recentThread = prepared.conversation?.recentWindowMessages
      .slice(-10)
      .map((message) => `${message.direction}: ${message.body}`)
      .join("\n");
    const latestIncoming = prepared.conversation?.lastIncoming?.body
      ? `Latest incoming: ${prepared.conversation.lastIncoming.body}`
      : "";
    const latestOutgoing = prepared.conversation?.lastOutgoing?.body
      ? `Latest outgoing: ${prepared.conversation.lastOutgoing.body}`
      : "";
    const noteHints = prepared.notes
      .slice(-5)
      .map((note) => note.text)
      .join("\n");

    return [latestIncoming, latestOutgoing, recentThread, noteHints]
      .filter(Boolean)
      .join("\n");
  }

  private toMemorySource(value: unknown): MemoryChunk["source"] {
    switch (value) {
      case "profile":
      case "note":
      case "conversation":
      case "letter":
      case "summary":
        return value;
      default:
        return "conversation";
    }
  }

  private formatRetrievedChunk(row: UnknownRecord): string {
    const source = typeof row.source === "string" ? row.source : "memory";
    const score = typeof row.weighted_score === "number"
      ? `score=${row.weighted_score.toFixed(3)}`
      : "score=n/a";
    const date =
      typeof row.note_date === "string" && row.note_date
        ? row.note_date
        : typeof row.sent_at === "string" && row.sent_at
          ? row.sent_at
          : null;
    const direction = typeof row.direction === "string" ? `${row.direction} ` : "";
    const text = typeof row.text === "string" ? row.text : "";

    return `[${source}; ${score}${date ? `; ${date}` : ""}] ${direction}${text}`;
  }

  private toMemoryRow(
    chunk: MemoryChunk,
    params: {
      clientId: string | null;
      composeMode: "reply" | "letter" | "both";
      dialogKey: string;
      favoriteId: string;
      womanId: string | null;
    }
  ): MemoryRow {
    const sourceId = chunk.id.includes(":") ? chunk.id.split(":").slice(1).join(":") : chunk.id;
    const direction = chunk.text.startsWith("incoming:")
      ? "incoming"
      : chunk.text.startsWith("outgoing:")
        ? "outgoing"
        : null;
    const text = chunk.text.replace(/^(incoming|outgoing):\s*/i, "");

    return {
      client_id: params.clientId,
      compose_mode:
        chunk.source === "letter" ? "letter" : params.composeMode,
      content_hash: hashValue(`${params.dialogKey}:${chunk.source}:${sourceId}:${text}`),
      dialog_key: params.dialogKey,
      direction,
      embedding: vectorLiteral(chunk.vector),
      embedding_model: "lexical-hash-v1",
      favorite_id: params.favoriteId,
      language: null,
      metadata: {
        originalChunkId: chunk.id,
        scoreAtIngestion: chunk.score
      },
      note_date: chunk.noteDate ?? null,
      sent_at: chunk.sentAt ?? null,
      source: chunk.source,
      source_id: chunk.sourceId ?? sourceId,
      tags: this.tagsForChunk(chunk),
      text,
      woman_id: params.womanId
    };
  }

  private tagsForChunk(chunk: MemoryChunk): string[] {
    const tags = new Set<string>();
    const text = chunk.text.toLowerCase();

    tags.add(chunk.source);

    if (/\b(sex|sexual|horny|kiss|naked|cock|pussy|cum|orgasm|fantasy)\b/i.test(text)) {
      tags.add("sexual");
    }

    if (/\b(wife|married|trust|honest|jealous|serious|relationship)\b/i.test(text)) {
      tags.add("trust");
    }

    if (/\b(miss|love|feel|lonely|care|warm|soft|heart)\b/i.test(text)) {
      tags.add("emotional");
    }

    return [...tags];
  }

  private countSources(chunks: MemoryChunk[]): Record<string, number> {
    return chunks.reduce<Record<string, number>>((counts, chunk) => {
      counts[chunk.source] = (counts[chunk.source] ?? 0) + 1;
      return counts;
    }, {});
  }
}
