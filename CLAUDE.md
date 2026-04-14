# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs via SWC without compiling to disk)
npm run dev

# Build (SWC → dist/src/, then adds shebang + chmod +x)
npm run build

# Run built artifact
npm start

# Tests
npm test
npm run test:watch
jest --testPathPattern=auth        # run a single spec file by path/name pattern

# Type checking (tsc --noEmit only — never use tsc to build)
npm run typecheck
```

## Architecture

This is a **NestJS application context** (no HTTP server) that exposes an MCP server over stdio. It integrates with Salesforce Marketing Cloud REST APIs.

### Module layout

```
src/
  main.ts                  — bootstrap: NestFactory.createApplicationContext → McpService.start()
  app.module.ts            — root module wiring
  auth/                    — OAuth2 client credentials; in-memory token cache with 60s early refresh
  sfmc/                    — SfmcHttpService: thin axios wrapper that injects the Bearer token on every request
  sfmc/sfmc-api.error.ts   — SfmcApiError + parseSfmcError (maps SFMC HTTP responses to typed errors)
  mcp/                     — McpService registers all tools onto McpServer and starts StdioServerTransport
  mcp/tool-handler.ts      — toolCall() wrapper: serialises results to MCP content, catches errors
  data-extensions/         — de.service.ts (REST calls) + de.tools.ts (MCP tool registration)
  content-builder/         — cb.service.ts + cb.tools.ts
  transactional/           — transactional.service.ts + transactional.tools.ts
```

### Adding a new domain / tool

1. Create `src/<domain>/<domain>.service.ts` — inject `SfmcHttpService`, implement REST methods.
2. Create `src/<domain>/<domain>.tools.ts` — inject the service, expose a `register(server: McpServer)` method that calls `server.tool(name, description, zodSchema, toolCall(...))`.
3. Create `src/<domain>/<domain>.module.ts` — wire service + tools as providers, export them.
4. Import the module in `AppModule` and inject `<Domain>ToolsService` into `McpService`.

### Key patterns

- **toolCall()** (`src/mcp/tool-handler.ts`) is the standard handler wrapper — always use it. It handles JSON serialisation and converts `SfmcApiError` / generic errors into MCP `isError: true` responses.
- All tool descriptions and field descriptions are written in **Portuguese** (pt-BR) — maintain that convention.
- Zod schemas are defined inline inside the `.tools.ts` file, not shared across domains.

### Build notes

- **Never use `tsc` to build** — it OOMs on this project. SWC (`@swc/cli`) is the only build tool.
- SWC outputs to `dist/src/` (not `dist/`). Package entry point is `dist/src/main.js`.
- `scripts/postbuild.mjs` adds the `#!/usr/bin/env node` shebang and sets `chmod +x` after each build.

### Environment variables

Required at runtime (see `.env.example`):
- `SFMC_CLIENT_ID`
- `SFMC_CLIENT_SECRET`
- `SFMC_SUBDOMAIN` — the subdomain prefix from `https://<SUBDOMAIN>.auth.marketingcloudapis.com`
- `SFMC_ACCOUNT_ID` — optional, targets a child Business Unit MID
