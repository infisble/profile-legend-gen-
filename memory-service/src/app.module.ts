import { Module } from "@nestjs/common";

import { ApiController } from "./api.controller";
import { ApiService } from "./api.service";
import { MemoryService } from "./memory.service";
import { SupabaseService } from "./supabase.service";

@Module({
  controllers: [ApiController],
  providers: [ApiService, MemoryService, SupabaseService]
})
export class AppModule {}
