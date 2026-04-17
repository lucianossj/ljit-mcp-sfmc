# ljit-mcp-sfmc

[![npm version](https://img.shields.io/npm/v/ljit-mcp-sfmc)](https://www.npmjs.com/package/ljit-mcp-sfmc)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/lucianossj/ljit-mcp-sfmc/pulls)
[![GitHub Stars](https://img.shields.io/github/stars/lucianossj/ljit-mcp-sfmc?style=social)](https://github.com/lucianossj/ljit-mcp-sfmc)

MCP server para o **Salesforce Marketing Cloud (SFMC)**. Expõe **35 ferramentas** que permitem que agentes de IA (Claude, Cursor, VS Code, Windsurf, etc.) gerenciem Data Extensions, assets do Content Builder, jornadas do Journey Builder e enviem mensagens transacionais — tudo via linguagem natural, sem abrir a interface do SFMC.

> 🌐 **Projeto open-source** — código disponível em [github.com/lucianossj/ljit-mcp-sfmc](https://github.com/lucianossj/ljit-mcp-sfmc). Contribuições, sugestões e Pull Requests são muito bem-vindos!

---

## Como funciona

Este projeto implementa o protocolo [MCP (Model Context Protocol)](https://modelcontextprotocol.io) sobre **stdio**. Quando configurado em um cliente compatível (Claude Desktop, Claude Code CLI, Cursor, etc.), o agente de IA pode invocar as ferramentas diretamente durante uma conversa.

A autenticação com o SFMC é feita via **OAuth 2.0 Client Credentials**. O token é obtido automaticamente na primeira chamada e renovado em background **60 segundos antes de expirar**, garantindo zero interrupções em sessões longas.

```
Cliente MCP (Claude, Cursor…)
        │  stdio (JSON-RPC)
        ▼
  ljit-mcp-sfmc  ──── OAuth2 ────▶  SFMC Auth API
        │                            (token cache)
        └──── REST ──────────────▶  SFMC REST APIs
                  (DE / CB / Journeys / Txn)
```

---

## Ferramentas disponíveis

### Data Extensions (`de_*`)

| Ferramenta | O que faz |
|---|---|
| `de_list` | Lista Data Extensions pelo nome (prefixo/trecho); suporta paginação |
| `de_list_rows` | Recupera linhas de uma DE com paginação e filtros OData |
| `de_upsert_rows` | Insere ou atualiza linhas (upsert por chave primária) |
| `de_get_info` | Retorna metadados e schema completo de uma DE |
| `de_create` | Cria uma nova DE com campos, tipos e configurações de envio |

### Content Builder (`cb_*`)

| Ferramenta | O que faz |
|---|---|
| `cb_list_assets` | Lista assets com filtro por tipo ou busca por nome |
| `cb_get_asset` | Retorna conteúdo completo e metadados de um asset pelo ID |
| `cb_create_asset` | Cria um asset (email HTML, bloco, template, imagem, etc.) |
| `cb_update_asset` | Atualiza conteúdo, nome, pasta ou metadados de um asset |
| `cb_delete_asset` | Remove um asset pelo ID |
| `cb_list_folders` | Lista pastas/categorias (opcionalmente filtradas por pasta pai) |
| `cb_create_folder` | Cria uma nova pasta no Content Builder |

### Journeys (`jrn_*`)

| Ferramenta | O que faz |
|---|---|
| `jrn_list` | Lista jornadas do Journey Builder com filtros por nome/descrição, status e suporte a varredura completa com `fetchAll` |
| `jrn_get` | Retorna os detalhes de uma jornada pelo ID, com opção de informar uma versão específica |
| `jrn_get_event_definition_by_key` | Retorna uma Event Definition do Journey Builder pela chave |
| `jrn_get_event_definition_by_id` | Retorna uma Event Definition do Journey Builder pelo ID |
| `jrn_resolve_entry_de` | Resolve a Data Extension de entrada de uma jornada usando a trigger e, se necessário, a Event Definition |

### Transactional Messaging (`txn_*`)

#### Gerenciamento de Definitions

| Ferramenta | O que faz |
|---|---|
| `txn_list_definitions` | Lista definitions de um canal (email, sms ou push); suporta filtro por nome, status e `fetchAll` para varredura completa |
| `txn_get_definition` | Retorna uma definition pelo canal e chave |
| `txn_create_email_definition` | Cria uma definition de e-mail transacional |
| `txn_create_sms_definition` | Cria uma definition de SMS transacional |
| `txn_create_push_definition` | Cria uma definition de push notification |
| `txn_update_definition` | Atualiza campos de uma definition existente |
| `txn_delete_definition` | Remove uma definition |

#### Validação & Inspeção (Pré-envio)

| Ferramenta | O que faz |
|---|---|
| `txn_inspect_email_definition` | Inspeciona uma definition de e-mail: busca o asset no Content Builder, resolve recursivamente `CONTENTBLOCKBYID()` e `CONTENTBLOCKBYNAME()`, extrai o schema de atributos via análise AMPscript (incluindo `RaiseError` guards e paths JSON dinâmicos), e retorna os campos da DE vinculada |
| `txn_validate_email_attributes` | Valida e normaliza os nomes dos atributos contra o schema da DE vinculada à definition — corrige divergências de capitalização e alerta campos não encontrados |
| `txn_preflight_email` | Executa um dry-run completo **sem enviar**: valida status da definition, existência do asset, resolução de content blocks, atributos obrigatórios AMPscript, guards `RaiseError()` e normalização de nomes. Retorna `passed`, `errors[]`, `warnings[]` e `normalizedAttributes` |

#### Envio de Mensagens

| Ferramenta | O que faz |
|---|---|
| `txn_send_email` | Envia e-mail transacional para um destinatário com **pre-flight automático** integrado; se houver erros bloqueantes, o envio é abortado e o relatório é retornado. `messageKey` é gerado automaticamente se omitido. Use `skipPreflight=true` para envios em produção já validados |
| `txn_send_email_and_check` | Envia e-mail e aguarda o status de entrega final via polling automático (~8s). Executa o mesmo pre-flight do `txn_send_email`. Ideal para testes e validação de fluxo completo |
| `txn_send_email_batch` | Envia e-mails para até 50 destinatários em uma única chamada de API |
| `txn_send_sms` | Envia SMS transacional para um destinatário (formato E.164) |
| `txn_send_sms_batch` | Envia SMS para até 50 destinatários em uma única chamada |
| `txn_send_push` | Envia push notification transacional para um contato |
| `txn_get_message_status` | Consulta o status de entrega de uma mensagem enviada anteriormente |

---

## Pré-requisitos

- **Node.js 18** ou superior
- Uma **installed package** no SFMC com as seguintes permissões de API:
  - Data Extensions: leitura e escrita
  - Content Builder: leitura e escrita
  - Journey Builder / Interactions: leitura
  - Transactional Messaging: leitura, escrita e envio

---

## Instalação

```bash
npm install -g ljit-mcp-sfmc
```

---

## Configuração

O servidor lê as credenciais via variáveis de ambiente. Crie um arquivo `.env` ou configure as variáveis diretamente no seu cliente MCP:

```env
SFMC_CLIENT_ID=seu_client_id
SFMC_CLIENT_SECRET=seu_client_secret
SFMC_SUBDOMAIN=seu_subdomain          # ex: mcXXXXXXX (sem .auth.marketingcloudapis.com)
SFMC_ACCOUNT_ID=123456789             # opcional — necessário para acesso a child BUs
SFMC_REQUEST_TIMEOUT_MS=30000         # opcional — timeout de cada requisição HTTP em ms (padrão: 30000)
```

> O `SFMC_SUBDOMAIN` é o prefixo da URL de autenticação da sua BU. Você encontra nas configurações da installed package, no campo **Authentication Base URI**: `https://<subdomain>.auth.marketingcloudapis.com`.

---

## Uso nos clientes MCP

### Claude Desktop

Adicione ao seu `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "ljit-mcp-sfmc",
      "env": {
        "SFMC_CLIENT_ID": "seu_client_id",
        "SFMC_CLIENT_SECRET": "seu_client_secret",
        "SFMC_SUBDOMAIN": "seu_subdomain",
        "SFMC_ACCOUNT_ID": "123456789"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add sfmc ljit-mcp-sfmc \
  -e SFMC_CLIENT_ID=seu_client_id \
  -e SFMC_CLIENT_SECRET=seu_client_secret \
  -e SFMC_SUBDOMAIN=seu_subdomain \
  -e SFMC_ACCOUNT_ID=123456789
```

### VS Code (GitHub Copilot)

Adicione ao seu `settings.json` (ou `.vscode/mcp.json` no workspace):

```json
{
  "mcp": {
    "servers": {
      "sfmc": {
        "type": "stdio",
        "command": "ljit-mcp-sfmc",
        "env": {
          "SFMC_CLIENT_ID": "seu_client_id",
          "SFMC_CLIENT_SECRET": "seu_client_secret",
          "SFMC_SUBDOMAIN": "seu_subdomain"
        }
      }
    }
  }
}
```

### Cursor

Adicione ao `.cursor/mcp.json` no diretório raiz do seu projeto:

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "ljit-mcp-sfmc",
      "env": {
        "SFMC_CLIENT_ID": "seu_client_id",
        "SFMC_CLIENT_SECRET": "seu_client_secret",
        "SFMC_SUBDOMAIN": "seu_subdomain"
      }
    }
  }
}
```

### Windsurf

Adicione ao `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "ljit-mcp-sfmc",
      "env": {
        "SFMC_CLIENT_ID": "seu_client_id",
        "SFMC_CLIENT_SECRET": "seu_client_secret",
        "SFMC_SUBDOMAIN": "seu_subdomain"
      }
    }
  }
}
```

---

## Exemplos de uso

Uma vez configurado, você pode interagir com o SFMC em linguagem natural:

**Data Extensions**

- *"Liste todas as DEs com o prefixo `Leads_`."*
- *"Mostre o schema da DE `Clientes_Ativos` — quais campos ela tem?"*
- *"Crie uma Data Extension chamada `Opt-Outs_Q2` com os campos Email (EmailAddress, PK), DataSaida (Date) e Motivo (Text, 255)."*
- *"Insira esses 3 registros na DE `Pedidos_2024`."*

**Content Builder**

- *"Liste todos os emails HTML na pasta de templates de boas-vindas."*
- *"Mostre o conteúdo completo do asset com ID 98765."*
- *"Atualize o subject do email `Confirmacao-Pedido-v3` para 'Seu pedido foi confirmado 🎉'."*

**Transactional Messaging — Fluxo de envio seguro**

- *"Inspecione a definition `boas-vindas-pro` e me diga quais atributos são obrigatórios para o envio."*
- *"Faça um preflight do envio para <joao@empresa.com> usando a definition `boas-vindas-pro` com os atributos Nome='João' e Plano='Pro'. Não envie ainda."*
- *"O preflight passou? Então envia."*
- *"Envie o e-mail `boas-vindas-pro` para <joao@empresa.com> e me mostre o status de entrega assim que chegar."*

**Transactional Messaging — Outros canais**

- *"Envie um SMS pela definition `alerta-fraude` para +5511999990000 com o atributo Valor='R$ 350,00'."*
- *"Qual o status de entrega da mensagem com chave `msg-abc-123`?"*

**Journey Builder**

- *"Liste as jornadas com status Running e nome contendo 'Welcome'."*
- *"Mostre os detalhes da jornada `5f7b4d1e-1234-5678-9abc-def012345678`."*
- *"Resolva a Data Extension de entrada da jornada `5f7b4d1e-1234-5678-9abc-def012345678`."*
- *"Busque a Event Definition com chave `APIEvent-LeadEntry`."*

---

## Desenvolvimento local

Esta seção é para quem deseja contribuir com o projeto ou executá-lo a partir do código-fonte.

### Requisitos

- Node.js 18+
- npm 9+
- Credenciais de uma installed package no SFMC (para testes manuais)

### Setup

```bash
git clone https://github.com/lucianossj/ljit-mcp-sfmc.git
cd ljit-mcp-sfmc
npm install
cp .env.example .env
# Preencha as variáveis no .env com suas credenciais SFMC
```

### Comandos

```bash
npm run dev          # Executa sem compilar (SWC via @swc-node/register)
npm test             # Roda todos os testes (Jest)
npm run test:watch   # Testes em modo watch
npm run typecheck    # Verificação de tipos (tsc --noEmit)
npm run lint         # ESLint
npm run build        # Compila com SWC → dist/src/
```

> **Importante:** nunca use `tsc` para compilar — ele estoura a memória neste projeto. Apenas `npm run build` (SWC) é suportado.

### Estrutura do projeto

```
src/
  main.ts                  — bootstrap (NestJS ApplicationContext → McpService.start())
  app.module.ts            — módulo raiz
  auth/                    — OAuth2 Client Credentials com cache de token em memória
  sfmc/                    — SfmcHttpService: wrapper axios que injeta o Bearer token
  sfmc/sfmc-api.error.ts   — SfmcApiError + parseSfmcError
  mcp/mcp.service.ts       — registra todos os tool-services no McpServer e inicia o transporte
  mcp/tool-handler.ts      — wrapper toolCall() usado por todos os handlers
  data-extensions/         — de.service.ts + de.tools.ts
  content-builder/         — cb.service.ts + cb.tools.ts
  journeys/                — journeys.service.ts + journeys.tools.ts
  transactional/           — transactional.service.ts + transactional.tools.ts + ampscript-parser.ts
```

### Adicionando um novo domínio

Cada domínio segue o mesmo padrão:

1. `src/<domain>/<domain>.service.ts` — injete `SfmcHttpService`, implemente as chamadas REST
2. `src/<domain>/<domain>.tools.ts` — injete o service, exponha `register(server: McpServer)` com `server.tool(...)`
3. `src/<domain>/<domain>.module.ts` — declare service + tools como providers
4. Importe o módulo em `AppModule` e injete o `<Domain>ToolsService` no `McpService`

---

## Contribuindo

Este projeto é **100% open-source** (MIT) e vive da comunidade. O repositório está em:

**🔗 [github.com/lucianossj/ljit-mcp-sfmc](https://github.com/lucianossj/ljit-mcp-sfmc)**

Contribuições são bem-vindas e encorajadas — desde correções de bugs até novas ferramentas que ampliem o suporte às APIs do Salesforce Marketing Cloud. Se você usa SFMC com IA e tem uma ideia ou melhoria, **abra um PR**! Cada contribuição ajuda a tornar a ferramenta mais robusta para toda a comunidade.

### Como contribuir

1. **Abra uma Issue** antes de implementar — descreva o bug, a feature ou a melhoria que deseja propor. Isso evita trabalho duplicado e permite alinhar expectativas.  
   👉 [github.com/lucianossj/ljit-mcp-sfmc/issues/new](https://github.com/lucianossj/ljit-mcp-sfmc/issues/new)
2. **Fork** o repositório e crie uma branch descritiva:

   ```
   feat/cb-duplicate-asset
   fix/auth-token-refresh-race-condition
   docs/add-cursor-configuration-example
   ```

3. **Implemente** seguindo as convenções do projeto (descritas abaixo)
4. **Escreva testes** — cada `<domain>.service.ts` deve ter um `<domain>.service.spec.ts` cobrindo os novos comportamentos, usando `axios-mock-adapter` para mockar as chamadas HTTP
5. Certifique-se de que `npm test`, `npm run typecheck` e `npm run lint` passam sem erros
6. **Abra um Pull Request** com uma descrição clara do que muda, por quê e como testar

### Convenções de código

| Aspecto | Convenção |
|---|---|
| Idioma das descrições | Descrições de ferramentas e campos em **português (pt-BR)** |
| Handler de tool | Sempre usar `toolCall()` como wrapper (`src/mcp/tool-handler.ts`) |
| Schemas Zod | Definidos inline em `<domain>.tools.ts` — não compartilhar entre domínios |
| Build | Nunca usar `tsc` — apenas `npm run build` (SWC) |
| Commits | Inglês, estilo [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `test:` |
| Erros de API | Usar `SfmcApiError` + `parseSfmcError` de `src/sfmc/sfmc-api.error.ts` |

### Ideias de contribuição

Se você quer contribuir mas não sabe por onde começar, aqui estão algumas sugestões:

- 🚀 **Novos domínios SFMC:** Automation Studio, Contact Builder, Push Notifications (MobilePush)
- 🔍 **Melhorias em DE:** suporte a `de_delete_rows`, listagem de todas as DEs sem filtro obrigatório
- 📧 **Melhorias em Transactional:** suporte a `cc`/`bcc` em e-mails, envio push batch
- 🧪 **Cobertura de testes:** aumentar a cobertura nos módulos `content-builder` e `transactional`
- 🌐 **Documentação em inglês:** tradução do README e descrições de tools para ampliar o alcance da comunidade
- 🛠️ **Developer Experience:** exemplos de configuração para outros clientes MCP, scripts de setup

---

## Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">
  Feito com ☕ para a comunidade de desenvolvedores SFMC<br>
  <a href="https://github.com/lucianossj/ljit-mcp-sfmc">⭐ github.com/lucianossj/ljit-mcp-sfmc</a>
</div>
