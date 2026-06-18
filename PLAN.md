# Plano — Módulo Marketing Cloud Personalization (MCP / ex-Interaction Studio)

> Integração nova no `mcp-sfmc`. **Produto separado** do SFMC core: auth e base URL diferentes.
> Auth: `Authorization: Basic base64(apiKeyId:apiKeySecret)` (token estático, sem refresh).
> Base URL: `https://<accountName>.<instance>.evergage.com`

## Endpoints confirmados

| Op | Método | Path | Auth | Modelo |
|---|---|---|---|---|
| Evento | POST | `/api2/event/<dataset>` | nenhum | sync |
| Server-side campaign / recs | POST | `/api2/authevent/<dataset>` | Basic | sync |
| User export | GET | `/api/dataset/<datasetId>/users.json` | Basic | sync paginado |
| Account export | GET | `/api/dataset/<datasetId>/accounts.json` | Basic | sync paginado |
| User look-up | GET | `/api/dataset/{dataset}/user/{userId}` | Basic | sync |
| User delete | POST | `/api/dataset/{dataset}/users/delete` | Basic | async/queued, multipart CSV, max 30k |
| Audit log | GET | `/api/audit/list` | Basic | sync paginado |

- Export params: `filter`(segment), `start`/`end`(epoch ms), `segmentationId`, `segmentId`, `pageSize`, `page`(zero-index).
- Audit params: `page`, `pageSize`(max 2000), `startDate`/`endDate`(ISO-8601, range max **50 dias**). Exige permissão "Can access Audit logs" no token.

## Fora de escopo (sem API pública)

CRUD de Campaign Templates, Einstein Recipes, Einstein Decisions, definição de Segments, estrutura de Datasets. UI-only. Catalog bulk REST não existe — só SFTP Feed (fase futura opcional).

---

## Fase 0 — Fundação (pré-requisito)

Auth + http + module compartilhados. Sem isso nenhuma tool roda.

**Arquivos**
```
src/personalization/pers-auth.service.ts      # header Basic from env, valida env no bootstrap
src/personalization/pers-http.service.ts       # axios wrapper, baseURL evergage, injeta Basic
src/personalization/pers-api.error.ts          # PersApiError + parsePersError (formato Evergage)
src/personalization/personalization.module.ts  # wire providers
```

**Env novos** (`.env.example` + doc no `CLAUDE.md`)
```
MCP_PERS_ACCOUNT
MCP_PERS_INSTANCE
MCP_PERS_DATASET
MCP_PERS_API_KEY_ID
MCP_PERS_API_SECRET
```

**Riscos**
- URL pattern varia por região/conta consolidada — validar host real da org.
- Não logar secret.

**TODO**
- [ ] Confirmar host real da org
- [ ] `pers-auth.service.ts`: header Basic + validação env
- [ ] `pers-http.service.ts`: axios instance + baseURL + interceptor + timeout
- [ ] `pers-api.error.ts`: PersApiError + parsePersError
- [ ] `personalization.module.ts`: providers
- [ ] `AppModule`: import módulo; `McpService`: inject `PersonalizationToolsService`
- [ ] `.env.example` + doc `CLAUDE.md`
- [ ] Smoke test: 1 chamada autenticada real (user export pageSize=1) → 200

---

## Fase 1 — Eventos + Recomendações (maior valor)

> Catalog NÃO tem REST upsert. Atributos de item vão embutidos no evento (`pers_send_event`). Bulk catalog = SFTP Feed (fase futura).

**Tools**
```
pers_send_event            # POST /api2/event — payload {action,user,itemAction?,item attrs}
pers_trigger_campaign      # POST /api2/authevent — dispara server-side campaign
pers_get_recommendations   # authevent action "Get Recommendation", parse recs
```

**Arquivos**
```
src/personalization/personalization.service.ts   # sendEvent / authEvent / getRecommendations
src/personalization/personalization.tools.ts      # register(server), zod inline pt-BR, toolCall()
```

**Riscos**
- `getRecommendations` depende de campaign existir na UI (server-side, action Get Recommendation). Tool NÃO cria campaign — documentar na description.
- Schema item varia por org (item types custom até 25, 35 attrs) → zod flexível (`z.record`).
- CORS warning é browser-only; server-side OK.

**TODO**
- [ ] `service.sendEvent(dataset, body)` → POST /api2/event
- [ ] `service.authEvent(dataset, body)` → POST /api2/authevent (Basic)
- [ ] `service.getRecommendations(campaign, user, opts)` wrapper sobre authEvent
- [ ] `tools.ts`: zod pt-BR p/ 3 tools
- [ ] `toolCall()` wrapper em todas
- [ ] Description: campaign/recipe/decision precisam existir na UI
- [ ] Teste real: send_event confirma na UI; get_recommendations contra campaign teste
- [ ] Build SWC + typecheck + bump version

---

## Fase 2 — Export (Users / Accounts)

Sync paginado (zero-index), não job async.

**Tools**
```
pers_export_users      # GET users.json — filtro segment/time, includeGeo, paginação
pers_export_accounts   # GET accounts.json — idem
```
`pers_list_segments`: sem endpoint dedicado → derivar de `segmentId`/`filter`, ou dropar.

**Riscos**
- Export grande = duplicatas (último registro = mais atual) → dedup por id opcional.
- Volume → cap de páginas + warning explícito se truncar (nunca truncar silencioso).

**TODO**
- [ ] `service.exportUsers(datasetId, {pageSize,page,filter,start,end,segmentId,includeGeo})`
- [ ] `service.exportAccounts(...)` análogo
- [ ] Helper paginação: itera `page` até vazio, cap configurável, dedup por id
- [ ] `tools.ts`: 2 tools, zod pt-BR, `toolCall()`
- [ ] Warning explícito ao atingir cap
- [ ] Teste real: pageSize pequeno, valida shape + paginação
- [ ] Build + typecheck + bump

---

## Fase 3 — GDPR + Audit (compliance)

**Tools**
```
pers_user_lookup    # GET /api/dataset/{ds}/user/{id}
pers_user_delete    # POST /api/dataset/{ds}/users/delete — multipart CSV, async, DESTRUTIVO
pers_audit_log      # GET /api/audit/list — range max 50d, pageSize max 2000
```

**Riscos / segurança**
- `pers_user_delete` destrutivo e irreversível. Input exige userId + flag confirmação. Description marca DESTRUTIVO. Monta CSV em memória → multipart upload.
- Audit: range obrigatório (max 50d) + paginação. Token precisa permissão "Can access Audit logs".

**TODO**
- [ ] `service.userLookup(ds, id)` → GET
- [ ] `service.userDelete(ds, ids[])` → monta CSV multipart, POST
- [ ] `service.auditLog({page,pageSize,startDate,endDate})` → GET
- [ ] `pers_user_delete`: input com flag confirmação obrigatória; description DESTRUTIVO
- [ ] `tools.ts`: 3 tools, zod pt-BR, `toolCall()`
- [ ] Audit: valida range max 50d + paginação
- [ ] Teste: lookup user teste; delete só em sandbox
- [ ] Build + typecheck + bump

---

## Fase futura (opcional) — Catalog bulk via SFTP Feed

Se precisar upsert de catálogo em volume. Requer lib SFTP + credencial SFTP separada + geração CSV com prefixos de atributo. Escopo maior, não-REST. Avaliar só se demanda real.
