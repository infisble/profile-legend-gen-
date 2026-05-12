import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { config } from "./config";
import { HttpError } from "./errors";

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor() {
    const supabaseKey =
      config.supabaseServiceRoleKey || config.supabasePublishableKey;

    this.client =
      config.supabaseUrl && supabaseKey
        ? createClient(config.supabaseUrl, supabaseKey, {
            auth: {
              persistSession: false
            }
          })
        : null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new HttpError(503, "Supabase is not configured.");
    }

    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async checkHealth() {
    const supabaseKey =
      config.supabaseServiceRoleKey || config.supabasePublishableKey;

    if (!config.supabaseUrl || !supabaseKey) {
      throw new HttpError(503, "Supabase URL or key is missing.");
    }

    const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
      headers: {
        apikey: supabaseKey
      },
      method: "GET"
    });
    const body = (await response.json().catch(() => null)) as unknown;

    return {
      body,
      configured: true,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: config.supabaseUrl
    };
  }
}
