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
      'Lista definições de Transactional Messaging de um canal (email, sms ou push). ' +
      'Por padrão exclui definitions com status "Deleted". Use fetchAll=true para varrer todas as páginas ' +
      '(deduplicadas por definitionKey) — recomendado quando há muitas definitions. ' +
      'O filtro de nome é "contains" case-insensitive e procura tanto no name quanto no definitionKey.',
      {
        channel: z.enum(['email', 'sms', 'push']).describe('Canal de envio'),
        page: z.number().optional().default(1).describe('Página (1-indexed); ignorado quando fetchAll=true'),
        pageSize: z.number().optional().default(50).describe('Itens por página (máx: 50)'),
        status: z.enum(['Active', 'Inactive', 'New']).optional().describe('Filtra por status (client-side; a API ignora o filtro via querystring)'),
        nameFilter: z.string().optional().describe('Trecho a procurar no name ou no definitionKey (contains, case-insensitive)'),
        includeDeleted: z.boolean().optional().default(false).describe('Quando true, inclui também definitions com status "Deleted"'),
        fetchAll: z.boolean().optional().default(false).describe('Varre todas as páginas automaticamente e consolida (deduplicado por definitionKey)'),
      },
      toolCall(({ channel, page, pageSize, status, nameFilter, includeDeleted, fetchAll }) =>
        this.svc.listDefinitions(channel, { page, pageSize, status, nameFilter, includeDeleted, fetchAll }),
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
        classification: z.string().optional().describe('Customer key da Send Classification'),
        dataExtension: z.string().optional().describe('Chave externa da Data Extension para dados do subscriber'),
        list: z.string().optional().describe('Nome da lista de assinantes (ex: "All Subscribers")'),
        fromEmail: z.string().optional().describe('Endereço de e-mail do remetente'),
        fromName: z.string().optional().describe('Nome de exibição do remetente'),
        subject: z.string().optional().describe('Assunto do e-mail'),
        status: z.enum(['Active', 'Inactive']).optional().default('Active'),
        createJourney: z.boolean().optional().describe('Cria Journey automaticamente para a definition'),
      },
      toolCall(({ definitionKey, name, description, customerKey, classification, dataExtension, list, fromEmail, fromName, subject, status, createJourney }) =>
        this.svc.createEmailDefinition({
          definitionKey,
          name,
          status,
          content: { customerKey },
          subscriptions: {
            ...(dataExtension && { dataExtension }),
            ...(list && { list }),
            autoAddSubscriber: true,
            updateSubscriber: true,
          },
          ...(description && { description }),
          ...(classification && { classification }),
          ...(fromEmail && { fromEmail }),
          ...(fromName && { fromName }),
          ...(subject && { subject }),
          ...(createJourney !== undefined && { options: { createJourney } }),
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
        isLinkShorteningEnabled: z.boolean().optional().describe('Habilita encurtamento de URLs na mensagem'),
        isSubscriberTrackingEnabled: z.boolean().optional().describe('Habilita rastreamento de cliques por assinante'),
        urlShortenerType: z.string().optional().describe('Tipo de encurtador de URL (ex: "SFMC")'),
      },
      toolCall(({ definitionKey, name, description, message, shortCode, countryCode, keyword, dataExtension, status, isLinkShorteningEnabled, isSubscriberTrackingEnabled, urlShortenerType }) => {
        const hasUrlShortenerOption =
          isLinkShorteningEnabled !== undefined ||
          isSubscriberTrackingEnabled !== undefined ||
          !!urlShortenerType;
        return this.svc.createSmsDefinition({
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
          ...(hasUrlShortenerOption && {
            options: {
              urlShortenerOptions: {
                ...(isLinkShorteningEnabled !== undefined && { isLinkShorteningEnabled }),
                ...(isSubscriberTrackingEnabled !== undefined && { isSubscriberTrackingEnabled }),
                ...(urlShortenerType && { shortenerType: urlShortenerType }),
              },
            },
          }),
        });
      }),
    );

    server.tool(
      'txn_create_push_definition',
      'Cria uma nova definição de Push Notification Transacional no SFMC. O conteúdo pode ser definido via customerKey (asset existente) ou inline (title+message).',
      {
        definitionKey: z.string().describe('Chave única para a definição'),
        name: z.string().describe('Nome legível da definição'),
        description: z.string().optional(),
        applicationId: z.string().describe('ID do aplicativo mobile registrado no MobilePush do SFMC'),
        status: z.enum(['Active', 'Inactive']).optional().default('Active'),
        customerKey: z
          .string()
          .optional()
          .describe('Chave do asset de conteúdo push (use isto OU title+message)'),
        title: z.string().optional().describe('Título inline da notificação (use isto OU customerKey)'),
        message: z.string().optional().describe('Corpo inline da notificação (use isto OU customerKey)'),
        customKeys: z
          .record(z.string())
          .optional()
          .describe('Pares chave-valor customizados para o payload push (modo inline)'),
        mediaUrl: z.string().optional().describe('URL de mídia a anexar (rich push, modo inline)'),
        dataExtension: z.string().optional().describe('Chave externa da Data Extension'),
      },
      toolCall(({ definitionKey, name, description, applicationId, customerKey, title, message, customKeys, mediaUrl, dataExtension, status }) => {
        if (!customerKey && (!title || !message)) {
          throw new Error('Forneça customerKey OU title+message para definir o conteúdo push.');
        }
        const content = customerKey
          ? { customerKey }
          : {
              title: title!,
              message: message!,
              ...(customKeys && { customKeys }),
              ...(mediaUrl && { media: { url: mediaUrl } }),
            };
        return this.svc.createPushDefinition({
          definitionKey,
          name,
          applicationId,
          status,
          content,
          ...(description && { description }),
          ...(dataExtension && { subscriptions: { dataExtension } }),
        });
      }),
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
      'Use antes de txn_send_email para garantir que o payload está correto. ' +
      'Quando generateMock=true, gera automaticamente um payload de teste sintético em mockPayload — ' +
      'usa row-sample da DE apenas para inferir tipos de campo, sem copiar valores reais.',
      {
        definitionKey: z.string().describe('Chave da definição de e-mail a inspecionar'),
        attributes: z.record(z.unknown()).optional().default({}).describe(
          'Atributos que serão usados no envio — serão validados e normalizados contra o schema da DE',
        ),
        generateMock: z.boolean().optional().default(false).describe(
          'Quando true, gera um payload mock sintético completo em mockPayload, ' +
          'pronto para uso em txn_send_test_email. Usa row-sample da DE apenas para inferir tipos, ' +
          'sem reutilizar valores reais de outros registros.',
        ),
      },
      toolCall(({ definitionKey, attributes, generateMock }) =>
        this.svc.preflightEmailSend(
          definitionKey,
          attributes as Record<string, unknown>,
          generateMock,
        ),
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
        content: z
          .object({
            title: z.string().optional().describe('Título da notificação push'),
            message: z.string().optional().describe('Corpo da mensagem'),
            url: z.string().optional().describe('URL de deep link ou web'),
          })
          .optional()
          .describe('Conteúdo inline a sobrescrever o definido na definition'),
      },
      toolCall(({ messageKey, definitionKey, contactKey, attributes, content }) =>
        this.svc.sendPush(messageKey, definitionKey, { contactKey, attributes }, content),
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
