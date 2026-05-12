import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";

import { ApiService } from "./api.service";

@Controller("api")
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get("health")
  getHealth() {
    return this.apiService.getHealth();
  }

  @Get("supabase/health")
  getSupabaseHealth() {
    return this.apiService.getSupabaseHealth();
  }

  @Get("memory/status")
  getMemoryStatus() {
    return this.apiService.getMemoryStatus();
  }

  @Post("dialog/full-info")
  @HttpCode(200)
  getFullDialogInfo(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.getFullDialogInfo(body);
  }

  @Post("memory/ingest")
  @HttpCode(200)
  ingestMemory(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.ingestMemory(body);
  }

  @Post("memory/search")
  @HttpCode(200)
  searchMemory(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.searchMemory(body);
  }

  @Post("analyze/photo")
  @HttpCode(200)
  analyzePhoto(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.analyzePhoto(body);
  }

  @Post("analyze/context")
  @HttpCode(200)
  analyzeContext(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.analyzeContext(body);
  }

  @Post("assistant/workflow")
  @HttpCode(200)
  runWorkflow(@Body() body: Record<string, unknown> = {}) {
    return this.apiService.runWorkflow(body);
  }
}
