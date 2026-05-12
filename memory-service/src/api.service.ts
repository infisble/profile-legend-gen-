import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";

import { config } from "./config";
import { HttpError } from "./errors";
import { MemoryService } from "./memory.service";
import { AssistantService } from "./services/assistant-service";
import { fetchFullDialogInfo } from "./services/dialog-info-service";
import { SupabaseService } from "./supabase.service";
import { prepareInputs } from "./utils/payload-utils";

interface ParsedBody {
  conversationPayload: unknown;
  draftLanguage: string;
  instruction: string;
  messageType: string;
  messageTypeGuidance: string;
  operatorLanguage: string;
  photoUrl: string | null;
  profilePayload: unknown;
  tone: string;
}

@Injectable()
export class ApiService {
  private readonly assistantService = new AssistantService();

  constructor(
    private readonly memoryService: MemoryService,
    private readonly supabaseService: SupabaseService
  ) {}

  getHealth() {
    return {
      configuredProvider: config.modelProvider,
      endpointMode: config.geminiEndpointMode,
      geminiModel: config.geminiModel,
      provider: config.modelProvider,
      supabaseConfigured: this.supabaseService.isConfigured(),
      xaiModel: config.xaiModel,
      ok: true
    };
  }

  async getSupabaseHealth() {
    try {
      return await this.supabaseService.checkHealth();
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async getMemoryStatus() {
    try {
      return await this.memoryService.status();
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async ingestMemory(body: Record<string, unknown>) {
    try {
      return await this.memoryService.ingest(body);
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async searchMemory(body: Record<string, unknown>) {
    try {
      return await this.memoryService.search(body);
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async getFullDialogInfo(body: Record<string, unknown>) {
    try {
      const bonusesFrom = this.parseOptionalNumber(body.bonusesFrom, "bonusesFrom");
      const bonusesTo = this.parseOptionalNumber(body.bonusesTo, "bonusesTo");

      if (
        typeof bonusesFrom === "number" &&
        typeof bonusesTo === "number" &&
        bonusesFrom > bonusesTo
      ) {
        throw new HttpError(400, "bonusesFrom cannot be greater than bonusesTo.");
      }

      const result = await fetchFullDialogInfo({
        bonusesFrom,
        bonusesTo
      });
      const memorySync = await this.syncDialogMemory(result);

      return {
        ...result,
        memorySync
      };
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  private async syncDialogMemory(result: Awaited<ReturnType<typeof fetchFullDialogInfo>>) {
    try {
      const sync = await this.memoryService.ingest({
        composeMode: "both",
        conversationJson: result.conversationJson,
        photoUrl: result.photoUrl ?? "",
        profileJson: result.profileJson
      });

      return {
        dialogKey: sync.dialogKey,
        inserted: sync.inserted,
        ok: true,
        sources: sync.sources,
        totalChunks: sync.totalChunks
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown memory sync error.",
        ok: false
      };
    }
  }

  async analyzePhoto(body: Record<string, unknown>) {
    try {
      const parsedBody = this.parseBody(body);
      const prepared = prepareInputs({
        conversationPayload: parsedBody.conversationPayload,
        photoUrl: parsedBody.photoUrl,
        profilePayload: parsedBody.profilePayload
      });
      const modelRouting = this.assistantService.createModelRouting(prepared, {
        operatorLanguage: parsedBody.operatorLanguage
      });
      const analysis = await this.assistantService.analyzePhoto(
        prepared,
        {
          operatorLanguage: parsedBody.operatorLanguage
        },
        modelRouting
      );

      return {
        analysis,
        inputOverview: prepared.inputOverview,
        modelRouting
      };
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async analyzeContext(body: Record<string, unknown>) {
    try {
      const parsedBody = this.parseBody(body);
      const prepared = prepareInputs({
        conversationPayload: parsedBody.conversationPayload,
        photoUrl: parsedBody.photoUrl,
        profilePayload: parsedBody.profilePayload
      });
      const preparedWithMemory = await this.memoryService.enrichPreparedMemory(
        prepared,
        this.memorySearchRequestFromBody(body),
        this.composeModeFromMessageType(parsedBody.messageType)
      );
      const modelRouting = this.assistantService.createModelRouting(prepared, {
        draftLanguage: parsedBody.draftLanguage,
        instruction: parsedBody.instruction,
        messageType: parsedBody.messageType,
        messageTypeGuidance: parsedBody.messageTypeGuidance,
        operatorLanguage: parsedBody.operatorLanguage,
        tone: parsedBody.tone
      });
      const analysis = await this.assistantService.analyzeContext(
        preparedWithMemory,
        {
          draftLanguage: parsedBody.draftLanguage,
          instruction: parsedBody.instruction,
          messageType: parsedBody.messageType,
          messageTypeGuidance: parsedBody.messageTypeGuidance,
          operatorLanguage: parsedBody.operatorLanguage,
          tone: parsedBody.tone
        },
        modelRouting
      );

      return {
        analysis,
        inputOverview: preparedWithMemory.inputOverview,
        modelRouting
      };
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  async runWorkflow(body: Record<string, unknown>) {
    try {
      const parsedBody = this.parseBody(body);
      const prepared = prepareInputs({
        conversationPayload: parsedBody.conversationPayload,
        photoUrl: parsedBody.photoUrl,
        profilePayload: parsedBody.profilePayload
      });
      const preparedWithMemory = await this.memoryService.enrichPreparedMemory(
        prepared,
        this.memorySearchRequestFromBody(body),
        this.composeModeFromMessageType(parsedBody.messageType)
      );

      return this.assistantService.runWorkflow(preparedWithMemory, {
        draftLanguage: parsedBody.draftLanguage,
        instruction: parsedBody.instruction,
        messageType: parsedBody.messageType,
        messageTypeGuidance: parsedBody.messageTypeGuidance,
        operatorLanguage: parsedBody.operatorLanguage,
        photoUrl: parsedBody.photoUrl,
        tone: parsedBody.tone
      });
    } catch (error) {
      this.throwHttpException(error);
    }
  }

  private asNonEmptyString(value: unknown, fallback: string): string {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    return fallback;
  }

  private parsePossibleJson(value: unknown, fieldName: string): unknown {
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

  private parseOptionalNumber(value: unknown, fieldName: string): number | undefined {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }

    const parsed = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(parsed)) {
      throw new HttpError(400, `${fieldName} must be a number.`);
    }

    return parsed;
  }

  private parseBody(body: Record<string, unknown>): ParsedBody {
    return {
      conversationPayload: this.parsePossibleJson(body.conversationJson, "conversationJson"),
      draftLanguage: this.asNonEmptyString(body.draftLanguage, "English"),
      instruction: this.asNonEmptyString(
        body.instruction,
        "Write the next reply so it feels natural, flirt-forward, emotionally engaging, and specific to this client."
      ),
      messageType: this.asNonEmptyString(body.messageType, "compliment"),
      messageTypeGuidance: this.asNonEmptyString(
        body.messageTypeGuidance,
        "Match the selected message type while still sounding natural and believable."
      ),
      operatorLanguage: this.asNonEmptyString(body.operatorLanguage, "Russian"),
      photoUrl:
        typeof body.photoUrl === "string" && body.photoUrl.trim()
          ? body.photoUrl.trim()
          : null,
      profilePayload: this.parsePossibleJson(body.profileJson, "profileJson"),
      tone: this.asNonEmptyString(body.tone, "warm, natural, concise")
    };
  }

  private composeModeFromMessageType(messageType: string): "reply" | "letter" {
    return messageType.startsWith("letter:") ? "letter" : "reply";
  }

  private memorySearchRequestFromBody(body: Record<string, unknown>) {
    return {
      clientId: typeof body.clientId === "string" ? body.clientId : undefined,
      conversationJson:
        typeof body.conversationJson === "string" ? body.conversationJson : undefined,
      dialogKey: typeof body.dialogKey === "string" ? body.dialogKey : undefined,
      favoriteId: typeof body.favoriteId === "string" ? body.favoriteId : undefined,
      limit: 12,
      photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : undefined,
      profileJson: typeof body.profileJson === "string" ? body.profileJson : undefined,
      womanId: typeof body.womanId === "string" ? body.womanId : undefined
    };
  }

  private throwHttpException(error: unknown): never {
    if (error instanceof HttpError) {
      throw new HttpException({ message: error.message }, error.statusCode);
    }

    if (error instanceof Error) {
      throw new InternalServerErrorException({ message: error.message });
    }

    throw new InternalServerErrorException({ message: "Unexpected backend error." });
  }
}
