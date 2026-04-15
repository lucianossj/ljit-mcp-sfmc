import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TransactionalService } from './transactional.service';
import { toolCall } from '../mcp/tool-handler';

const recipientSchema = z.object({
  contactKey: z.string().describe('Chave única do subscriber/contato'),
  to: z.string().describe('Endereço de e-mail ou número de telefone'),
  attributes: z.record(z.unknown()).optional().describe('Atributos de personalização (pares chave-valor)'),
});

function generateMessageKey(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `msg-${ts}-${rand}`;
}

@Injectable()
export class TransactionalToolsService {
  constructor(private readonly svc: TransactionalService) {}

  register(server: McpServer): void {
    // ─── List / Get Definitions ──────────────────────────────────────────────

    server.tool(
      'txn_list_definitions',
      'Lista definições de Transactional Messaging para um canal específico (email, sms ou push). ' +
      'Ao usar fetchAll=true, resultados de todas as BUs são retornados e deduplicados por definitionKey.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(50),
        status: z.enum(['Active', 'Inactive']).optional().describe('Filtrar por status'),
        nameFilter: z.string().optional().describe('Filtrar por prefixo do nome da definição (ex: "CMP_EMM")'),
        fetchAll: z.boolean().optional().default(false).describe('Varrer todas as páginas automaticamente e retornar resultados consolidados e deduplicados por definitionKey'),
      },
      toolCall(({ channel, page, pageSize, status, nameFilter, fetchAll }) =>
        this.svc.listDefinitions(channel, { page, pageSize, status, nameFilter, fetchAll }),
      ),
    );

    server.tool(
      'txn_get_definition',
      'Obtém uma definição de Transactional Messaging pelo canal e chave da definição.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        definitionKey: z.string().describe('Chave da definição (identificador único)'),
      },
      toolCall(({ channel, definitionKey }) =>
        this.svc.getDefinition(channel, definitionKey),
      ),
    );

    // ─── Create Definitions ──────────────────────────────────────────────────

    server.tool(
      'txn_create_email_definition',
      'Cria uma nova definição de E-mail Transacional no SFMC.',
      {
        definitionKey: z.string().describe('Chave única para a definição'),
        name: z.string().describe('Nome legível da definição'),
        description: z.string().optional(),
        customerKey: z.string().describe('Customer key do asset de e-mail no Content Builder'),
        dataExtension: z.string().optional().describe('Chave externa da Data Extension para dados do subscriber'),
        fromEmail: z.string().optional().describe('Endereço de e-mail do remetente'),
        fromName: z.string().optional().describe('Nome de exibição do remetente'),
        subject: z.string().optional().describe('Assunto do e-mail'),
        status: z.enum(['Active', 'Inactive']).optional().default('Active'),
      },
      toolCall(({ definitionKey, name, description, customerKey, dataExtension, fromEmail, fromName, subject, status }) =>
        this.svc.createEmailDefinition({
          definitionKey,
          name,
          status,
          content: { customerKey },
          subscriptions: {
            ...(dataExtension && { dataExtension }),
            autoAddSubscriber: true,
            updateSubscriber: true,
          },
          ...(description && { description }),
          ...(fromEmail && { fromEmail }),
          ...(fromName && { fromName }),
          ...(subject && { subject }),
        }),
      ),
    );

    server.tool(
      'txn_create_sms_definition',
      'Cria uma nova definição de SMS Transacional no SFMC.',
      {
        definitionKey: z.string().describe('Chave única para a definição'),
        name: z.string().describe('Nome legível da definição'),
        description: z.string().optional(),
        message: z.string().describe('Corpo da mensagem SMS (suporta substituição AMPscript)'),
        shortCode: z.string().describe('Short code ou long code de envio'),
        countryCode: z.string().describe('Código do país (ex: "US", "BR")'),
        keyword: z.string().optional().describe('Palavra-chave associada ao short code'),
        dataExtension: z.string().optional().describe('Chave externa da Data Extension'),
        status: z.enum(['Active', 'Inactive']).optional().default('Active'),
      },
      toolCall(({ definitionKey, name, description, message, shortCode, countryCode, keyword, dataExtension, status }) =>
        this.svc.createSmsDefinition({
          definitionKey,
          name,
          status,
          content: { message },
          subscriptions: {
            shortCode,
            countryCode,
            ...(keyword && { keyword }),
            ...(dataExtension && { dataExtension }),
            autoAddSubscriber: true,
            updateSubscriber: true,
          },
          ...(description && { description }),
        }),
      ),
    );

    server.tool(
      'txn_create_push_definition',
      'Cria uma nova definição de Push Notification Transacional no SFMC.',
      {
        definitionKey: z.string().describe('Chave única para a definição'),
        name: z.string().describe('Nome legível da definição'),
        description: z.string().optional(),
        title: z.string().describe('Título da notificação push'),
        message: z.string().describe('Corpo da mensagem da notificação push'),
        customKeys: z
          .record(z.string())
          .optional()
          .describe('Pares chave-valor customizados para o payload push'),
        mediaUrl: z.string().optional().describe('URL de mídia a anexar (rich push)'),
        dataExtension: z.string().optional().describe('Chave externa da Data Extension'),
        status: z.enum(['Active', 'Inactive']).optional().default('Active'),
      },
      toolCall(({ definitionKey, name, description, title, message, customKeys, mediaUrl, dataExtension, status }) =>
        this.svc.createPushDefinition({
          definitionKey,
          name,
          status,
          content: {
            title,
            message,
            ...(customKeys && { customKeys }),
            ...(mediaUrl && { media: { url: mediaUrl } }),
          },
          ...(description && { description }),
          ...(dataExtension && { subscriptions: { dataExtension } }),
        }),
      ),
    );

    // ─── Update / Delete ─────────────────────────────────────────────────────

    server.tool(
      'txn_update_definition',
      'Atualiza campos de uma definição de Transactional Messaging existente.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        definitionKey: z.string().describe('Chave da definição a ser atualizada'),
        updates: z.record(z.unknown()).describe('Campos a atualizar como objeto JSON'),
      },
      toolCall(({ channel, definitionKey, updates }) =>
        this.svc.updateDefinition(channel, definitionKey, updates),
      ),
    );

    server.tool(
      'txn_delete_definition',
      'Remove uma definição de Transactional Messaging.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        definitionKey: z.string().describe('Chave da definição a ser removida'),
      },
      toolCall(async ({ channel, definitionKey }) => {
        await this.svc.deleteDefinition(channel, definitionKey);
        return { content: [{ type: 'text' as const, text: `Definição "${definitionKey}" removida.` }] };
      }),
    );

    // ─── Send ────────────────────────────────────────────────────────────────

    server.tool(
      'txn_inspect_email_definition',
      'Inspeciona uma definição de e-mail transacional: busca a definition, o asset vinculado no Content Builder, ' +
      'resolve recursivamente CONTENTBLOCKBYID() e CONTENTBLOCKBYNAME() referenciados, ' +
      'extrai o schema de atributos necessários via análise AMPscript (incluindo guards RaiseError e paths dinâmicos), ' +
      'e retorna os campos da DE vinculada para validação. ' +
      'Use esta tool antes de enviar um e-mail de teste para entender o payload completo exigido.',
      {
        definitionKey: z.string().describe('Chave da definição de e-mail a inspecionar'),
      },
      toolCall(({ definitionKey }) =>
        this.svc.inspectEmailDefinition(definitionKey),
      ),
    );

    server.tool(
      'txn_validate_email_attributes',
      'Valida e normaliza os nomes dos atributos de um envio de e-mail contra o schema da Data Extension vinculada à definition. ' +
      'Retorna os atributos com nomes corrigidos (case matching) e alertas para campos não encontrados. ' +
      'Use antes de txn_send_email para evitar erros MissingRequiredFields (código 19).',
      {
        definitionKey: z.string().describe('Chave da definição de e-mail'),
        attributes: z.record(z.unknown()).describe('Atributos a serem validados e normalizados'),
      },
      toolCall(({ definitionKey, attributes }) =>
        this.svc.validateAndNormalizeAttributes(definitionKey, attributes),
      ),
    );

    server.tool(
      'txn_preflight_email',
      'Valida completamente um envio de e-mail transacional SEM enviá-lo (dry run). ' +
      'Verifica: status da definition (Active/Inactive), existência do asset no Content Builder, ' +
      'resolução recursiva de content blocks, atributos obrigatórios via análise AMPscript, ' +
      'guards RaiseError() que bloqueiam o envio, e normalização de nomes de atributos contra o schema da DE. ' +
      'Retorna passed=true/false, errors[] (bloqueantes), warnings[] (não-bloqueantes), ' +
      'normalizedAttributes (atributos com nomes corrigidos prontos para uso) e requiredAttributes. ' +
      'Use antes de txn_send_email para garantir que o payload está correto.',
      {
        definitionKey: z.string().describe('Chave da definição de e-mail a inspecionar'),
        attributes: z.record(z.unknown()).optional().default({}).describe(
          'Atributos que serão usados no envio — serão validados e normalizados contra o schema da DE',
        ),
      },
      toolCall(({ definitionKey, attributes }) =>
        this.svc.preflightEmailSend(definitionKey, attributes as Record<string, unknown>),
      ),
    );

    server.tool(
      'txn_send_email',
      'Envia um e-mail transacional para um único destinatário. ' +
      'Por padrão executa um pre-flight automático antes do envio: valida a definition, o asset do Content Builder, ' +
      'os content blocks referenciados, os atributos obrigatórios (campos isRequired da DE + AMPscript + RaiseError guards) e normaliza os ' +
      'nomes de atributos contra o schema da DE. Se houver erros bloqueantes, o e-mail NÃO é enviado e o relatório ' +
      'de pre-flight é retornado com sent=false e a lista de correções necessárias. ' +
      'Use skipPreflight=true apenas para envios de produção onde a validação já foi feita. ' +
      'O messageKey é opcional e será gerado automaticamente se não informado. ' +
      'IMPORTANTE: Para envios de teste onde é necessário confirmar a entrega real, use txn_send_test_email, ' +
      'que além do pre-flight completo aguarda a confirmação de status do SFMC antes de reportar sucesso.',
      {
        messageKey: z.string().optional().describe('Chave única para rastreamento (gerada automaticamente se omitida)'),
        definitionKey: z.string().describe('Chave da definição de e-mail a ser usada'),
        recipient: recipientSchema,
        skipPreflight: z.boolean().optional().default(false).describe(
          'Pula o pre-flight e envia diretamente. Use apenas quando já validou com txn_preflight_email.',
        ),
      },
      toolCall(({ messageKey, definitionKey, recipient, skipPreflight }) =>
        this.svc.sendEmailWithPreflight(
          messageKey ?? generateMessageKey(),
          definitionKey,
          recipient,
          { skipPreflight },
        ),
      ),
    );

    server.tool(
      'txn_send_email_and_check',
      'Envia um e-mail transacional e aguarda o status de entrega final (polling automático por até ~10s). ' +
      'Executa pre-flight automático antes do envio: ' +
      'valida definition, asset, content blocks, campos isRequired da DE, atributos AMPscript, RaiseError guards e normaliza nomes contra a DE. ' +
      'Se houver erros bloqueantes, retorna sent=false com o relatório de pre-flight sem enviar. ' +
      'Retorna preflight + resultado do envio + status consolidado em uma única chamada. ' +
      'O messageKey é opcional e será gerado automaticamente se não informado.',
      {
        messageKey: z.string().optional().describe('Chave única para rastreamento (gerada automaticamente se omitida)'),
        definitionKey: z.string().describe('Chave da definição de e-mail a ser usada'),
        recipient: recipientSchema,
        skipPreflight: z.boolean().optional().default(false).describe(
          'Pula o pre-flight e envia diretamente. Use apenas quando já validou com txn_preflight_email.',
        ),
      },
      toolCall(({ messageKey, definitionKey, recipient, skipPreflight }) =>
        this.svc.sendEmailAndCheckWithPreflight(
          messageKey ?? generateMessageKey(),
          definitionKey,
          recipient,
          { skipPreflight },
        ),
      ),
    );

    server.tool(
      'txn_send_test_email',
      'Fluxo completo e confiável para envio de e-mail de teste. ' +
      'SEMPRE use esta tool quando o usuário pedir um envio de teste — ela garante transparência total do resultado. ' +
      'Executa: (1) pre-flight completo (definition, asset, campos isRequired da DE, AMPscript, RaiseError guards, normalização de atributos); ' +
      '(2) se o pre-flight falhar, retorna a lista exata de campos obrigatórios ausentes e NÃO envia; ' +
      '(3) se passar, envia com atributos normalizados; ' +
      '(4) aguarda status real do SFMC com polling automático (até ~10s); ' +
      '(5) retorna success=true APENAS se o SFMC confirmar a entrega (EmailSent). ' +
      'Campos "attributes" devem conter todos os campos obrigatórios da DE e do template AMPscript. ' +
      'O messageKey é opcional e será gerado automaticamente se não informado.',
      {
        messageKey: z.string().optional().describe('Chave única para rastreamento (gerada automaticamente se omitida)'),
        definitionKey: z.string().describe('Chave da definição de e-mail a ser usada'),
        recipient: recipientSchema,
      },
      toolCall(({ messageKey, definitionKey, recipient }) =>
        this.svc.sendTestEmail(
          messageKey ?? generateMessageKey(),
          definitionKey,
          recipient,
        ),
      ),
    );

    server.tool(
      'txn_send_email_batch',
      'Envia e-mails transacionais para múltiplos destinatários em uma única chamada de API (até 50 destinatários).',
      {
        definitionKey: z.string().describe('Chave da definição de e-mail a ser usada'),
        recipients: z.array(recipientSchema).max(50).describe('Lista de destinatários (máx 50)'),
      },
      toolCall(({ definitionKey, recipients }) =>
        this.svc.sendEmailBatch(definitionKey, recipients),
      ),
    );

    server.tool(
      'txn_send_sms',
      'Envia um SMS transacional para um único destinatário usando uma definição.',
      {
        messageKey: z.string().describe('Chave única para esta mensagem'),
        definitionKey: z.string().describe('Chave da definição de SMS a ser usada'),
        recipient: recipientSchema.describe('Destinatário onde "to" é o número de telefone no formato E.164 (ex: +5511999999999)'),
      },
      toolCall(({ messageKey, definitionKey, recipient }) =>
        this.svc.sendSms(messageKey, definitionKey, recipient),
      ),
    );

    server.tool(
      'txn_send_sms_batch',
      'Envia SMS transacionais para múltiplos destinatários em uma única chamada de API (até 50 destinatários).',
      {
        definitionKey: z.string().describe('Chave da definição de SMS a ser usada'),
        recipients: z.array(recipientSchema).max(50).describe('Lista de destinatários (máx 50)'),
      },
      toolCall(({ definitionKey, recipients }) =>
        this.svc.sendSmsBatch(definitionKey, recipients),
      ),
    );

    server.tool(
      'txn_send_push',
      'Envia uma notificação push transacional para um contato usando uma definição.',
      {
        messageKey: z.string().describe('Chave única para esta mensagem'),
        definitionKey: z.string().describe('Chave da definição de push a ser usada'),
        contactKey: z.string().describe('Chave do contato destinatário'),
        attributes: z.record(z.unknown()).optional().describe('Atributos de personalização'),
      },
      toolCall(({ messageKey, definitionKey, contactKey, attributes }) =>
        this.svc.sendPush(messageKey, definitionKey, { contactKey, attributes }),
      ),
    );

    server.tool(
      'txn_get_message_status',
      'Verifica o status de entrega de uma mensagem transacional enviada anteriormente.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        messageKey: z.string().describe('Chave da mensagem utilizada no envio'),
      },
      toolCall(({ channel, messageKey }) =>
        this.svc.getMessageStatus(channel, messageKey),
      ),
    );
  }
}
