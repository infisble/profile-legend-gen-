import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { config } from "./config";

function resolveCorsOrigins(originConfig: string): string[] | true {
  if (originConfig === "*") {
    return true;
  }

  return originConfig
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = resolveCorsOrigins(config.corsOrigin);

  app.enableCors({
    allowedHeaders: ["content-type", "authorization"],
    credentials: false,
    maxAge: 86400,
    methods: ["GET", "POST", "OPTIONS"],
    origin:
      allowedOrigins === true
        ? true
        : (origin: string | undefined, callback: (error: Error | null, origin?: boolean | string) => void) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
              return;
            }

            callback(null, allowedOrigins[0] ?? false);
          }
  });

  await app.listen(config.port);
}

void bootstrap();
