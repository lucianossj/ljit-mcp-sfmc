# mcp-sfmc

MCP server para o **Salesforce Marketing Cloud (SFMC)**. Expõe 24 ferramentas que permitem que agentes de IA (Claude, Cursor, etc.) gerenciem Data Extensions, assets do Content Builder e enviem mensagens transacionais — tudo via linguagem natural.

---

## Ferramentas disponíveis

### Data Extensions (`de_*`)

| Ferramenta | O que faz |
|---|---|
| `de_list_rows` | Lista linhas de uma DE com paginação e filtros OData |
| `de_upsert_rows` | Insere ou atualiza linhas (upsert por chave primária) |
| `de_get_info` | Retorna metadados e schema de uma DE |
| `de_create` | Cria uma nova DE com campos e configurações |

### Content Builder (`cb_*`)

| Ferramenta | O que faz |
|---|---|
| `cb_list_assets` | Lista assets com filtro por tipo ou busca por nome |
| `cb_get_asset` | Retorna conteúdo completo e metadados de um asset |
| `cb_create_asset` | Cria um asset (email HTML, bloco, template, imagem, etc.) |
| `cb_update_asset` | Atualiza conteúdo, nome, pasta ou metadados de um asset |
| `cb_delete_asset` | Remove um asset pelo ID |
| `cb_list_folders` | Lista pastas/categorias (opcionalmente por pasta pai) |
| `cb_create_folder` | Cria uma nova pasta |

### Transactional Messaging (`txn_*`)

| Ferramenta | O que faz |
|---|---|
| `txn_list_definitions` | Lista definições de um canal (email, sms, push) |
| `txn_get_definition` | Retorna uma definição pelo canal e chave |
| `txn_create_email_definition` | Cria uma definição de e-mail transacional |
| `txn_create_sms_definition` | Cria uma definição de SMS transacional |
| `txn_create_push_definition` | Cria uma definição de push notification transacional |
| `txn_update_definition` | Atualiza campos de uma definição existente |
| `txn_delete_definition` | Remove uma definição |
| `txn_send_email` | Envia e-mail para um destinatário |
| `txn_send_email_batch` | Envia e-mail para até 50 destinatários em uma chamada |
| `txn_send_sms` | Envia SMS para um destinatário |
| `txn_send_sms_batch` | Envia SMS para até 50 destinatários em uma chamada |
| `txn_send_push` | Envia push notification para um contato |
| `txn_get_message_status` | Consulta o status de entrega de uma mensagem enviada |

---

## Pré-requisitos

- Node.js 18 ou superior
- Uma **installed package** no SFMC com as seguintes permissões de API:
  - Data Extensions: leitura e escrita
  - Content Builder: leitura e escrita
  - Transactional Messaging: leitura, escrita e envio

---

## Instalação

```bash
npm install -g mcp-sfmc
```

---

## Configuração

O servidor lê as credenciais via variáveis de ambiente. Crie um arquivo `.env` (ou configure as variáveis no seu sistema/cliente MCP):

```env
SFMC_CLIENT_ID=seu_client_id
SFMC_CLIENT_SECRET=seu_client_secret
SFMC_SUBDOMAIN=seu_subdomain          # ex: mcXXXXXXX (sem .auth.marketingcloudapis.com)
SFMC_ACCOUNT_ID=123456789             # opcional — necessário para acesso a child BUs
```

> O `SFMC_SUBDOMAIN` é o prefixo da URL de autenticação da sua BU. Você encontra nas configurações da installed package, no campo **Authentication Base URI**: `https://<subdomain>.auth.marketingcloudapis.com`.

A autenticação é feita via **OAuth 2.0 Client Credentials** e o token é renovado automaticamente 60 segundos antes de expirar.

---

## Uso no Claude Desktop

Adicione ao seu `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "mcp-sfmc",
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

## Uso no Claude Code (CLI)

```bash
claude mcp add sfmc mcp-sfmc \
  -e SFMC_CLIENT_ID=seu_client_id \
  -e SFMC_CLIENT_SECRET=seu_client_secret \
  -e SFMC_SUBDOMAIN=seu_subdomain \
  -e SFMC_ACCOUNT_ID=123456789
```

---

## Exemplos de uso

Uma vez configurado, você pode interagir com o SFMC em linguagem natural:

- *"Liste as últimas 100 linhas da DE `Leads_2024` onde o campo Status é igual a 'Pendente'."*
- *"Crie uma Data Extension chamada `Opt-Outs_Q2` com os campos Email, DataSaida e Motivo."*
- *"Mostre o conteúdo do email com ID 12345 no Content Builder."*
- *"Envie o e-mail transacional `boas-vindas-v2` para fulano@empresa.com com os atributos Nome='Fulano' e Plano='Pro'."*
- *"Qual o status de entrega da mensagem com chave `msg-abc-123`?"*
