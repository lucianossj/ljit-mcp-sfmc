#!/usr/bin/env node
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpService } from './mcp/mcp.service';

async function bootstrap() {
  // Use ApplicationContext (no HTTP server) — required for stdio MCP
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const mcpService = app.get(McpService);
  await mcpService.start();
}

bootstrap().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
