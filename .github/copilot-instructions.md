# Copilot Instructions

## Commands

```bash
npm run dev          # run without compiling (SWC via @swc-node/register)
npm run build        # compile with SWC → dist/src/, then postbuild.mjs adds shebang + chmod +x
npm start            # run compiled artifact (dist/src/main.js)
npm test             # run all tests (Jest)
npm run test:watch   # watch mode
jest --testPathPattern=auth   # run a single spec file by path/name pattern
npm run typecheck    # tsc --noEmit (type checking only — never use tsc to build)
npm run lint         # eslint src --ext .ts
```

## Architecture

NestJS **ApplicationContext** (no HTTP server) that exposes an MCP server over **stdio**. The entry point bootstraps the NestJS app, gets `McpService`, and calls `mcpService.start()`, which registers all MCP tools and connects a `StdioServerTransport`.

```
src/
  main.ts                  — bootstrap
  app.module.ts            — root module
  auth/                    — OAuth2 client_credentials; in-memory token cache with 60s early refresh
  sfmc/                    — SfmcHttpService: axios wrapper that injects Bearer token on every request
  sfmc/sfmc-api.error.ts   — SfmcApiError + parseSfmcError
  mcp/mcp.service.ts       — registers all domain tool-services onto McpServer, starts transport
  mcp/tool-handler.ts      — toolCall() wrapper used by all tools
  data-extensions/         — de.service.ts + de.tools.ts
  content-builder/         — cb.service.ts + cb.tools.ts
  transactional/           — transactional.service.ts + transactional.tools.ts
```

Each domain follows the same structure: `<domain>.service.ts` → `<domain>.tools.ts` → `<domain>.module.ts`.

### Adding a new domain

1. `src/<domain>/<domain>.service.ts` — inject `SfmcHttpService`, implement REST calls.
2. `src/<domain>/<domain>.tools.ts` — inject the service, expose `register(server: McpServer)` that calls `server.tool(name, description, zodSchema, toolCall(...))`.
3. `src/<domain>/<domain>.module.ts` — wire service + tools as providers.
4. Import the module in `AppModule` and inject `<Domain>ToolsService` into `McpService`.

## Key Conventions

- **`toolCall()` is mandatory** for all tool handlers (`src/mcp/tool-handler.ts`). It serialises results to MCP content and maps `SfmcApiError` / generic errors to `isError: true` responses.
- **All tool and field descriptions are written in Portuguese (pt-BR).** This includes the `description` strings passed to `server.tool()` and Zod `.describe()` calls.
- **Zod schemas are defined inline** inside each `.tools.ts` file — not shared between domains.
- **Never use `tsc` to build** — it runs out of memory on this project. Only `npm run build` (SWC) is valid.
- **Build output is `dist/src/`**, not `dist/`. The package entry point is `dist/src/main.js`.
- **Path aliases** are configured in `tsconfig.json` (e.g., `@auth/*`, `@sfmc/*`, `@de/*`, etc.).
- Tests live alongside source files as `*.spec.ts` and use `axios-mock-adapter` for HTTP mocking.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SFMC_CLIENT_ID` | ✅ | SFMC installed package client ID |
| `SFMC_CLIENT_SECRET` | ✅ | SFMC installed package client secret |
| `SFMC_SUBDOMAIN` | ✅ | Subdomain prefix from `https://<SUBDOMAIN>.auth.marketingcloudapis.com` |
| `SFMC_ACCOUNT_ID` | ❌ | MID of a child Business Unit to target |
