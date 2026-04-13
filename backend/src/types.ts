export type JsonRecord = Record<string, unknown>;

export type ExtendedError = Error & {
  code?: string;
  finishReason?: string | null;
  rawPayload?: unknown;
};

export type HttpHeaders = Record<string, string>;
