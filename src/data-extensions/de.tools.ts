import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DeService } from './de.service';
import { toolCall } from '../mcp/tool-handler';

const fieldSchema = z.object({
  name: z.string().describe('Nome do campo'),
  fieldType: z
    .enum(['Text', 'Number', 'Date', 'Boolean', 'EmailAddress', 'Phone', 'Decimal', 'Locale'])
    .describe('Tipo de dado do campo'),
  maxLength: z.number().optional().describe('Tamanho máximo (campos do tipo Text)'),
  isPrimaryKey: z.boolean().optional().describe('Indica se este campo é chave primária'),
  isRequired: z.boolean().optional().describe('Indica se este campo é obrigatório'),
  defaultValue: z.string().optional().describe('Valor padrão'),
});

@Injectable()
export class DeToolsService {
  constructor(private readonly deService: DeService) {}

  register(server: McpServer): void {
    server.tool(
      'de_list_rows',
      'Recupera linhas de uma Data Extension do SFMC pela chave externa. Suporta paginação e filtros OData.',
      {
        externalKey: z.string().describe('Chave externa da Data Extension'),
        page: z.number().optional().default(1).describe('Número da página (padrão: 1)'),
        pageSize: z.number().optional().default(50).describe('Linhas por página (padrão: 50, máx: 2500)'),
        filter: z.string().optional().describe('Expressão de filtro OData (ex: "EmailAddress eq \'test@test.com\'"'),
      },
      toolCall(({ externalKey, page, pageSize, filter }) =>
        this.deService.listRows(externalKey, { page, pageSize, filter }),
      ),
    );

    server.tool(
      'de_upsert_rows',
      'Insere ou atualiza linhas em uma Data Extension do SFMC. Usa a chave primária para determinar se é inserção ou atualização.',
      {
        externalKey: z.string().describe('Chave externa da Data Extension'),
        items: z
          .array(z.record(z.unknown()))
          .describe('Array de objetos representando as linhas. Cada objeto deve incluir os campos de chave primária.'),
      },
      toolCall(({ externalKey, items }) =>
        this.deService.upsertRows(externalKey, items),
      ),
    );

    server.tool(
      'de_get_info',
      'Obtém metadados e informações de schema de uma Data Extension do SFMC.',
      {
        externalKey: z.string().describe('Chave externa da Data Extension'),
      },
      toolCall(({ externalKey }) =>
        this.deService.getDataExtension(externalKey),
      ),
    );

    server.tool(
      'de_create',
      'Cria uma nova Data Extension no SFMC com os campos e configurações especificados.',
      {
        name: z.string().describe('Nome da Data Extension'),
        externalKey: z.string().optional().describe('Chave externa (gerada automaticamente se omitida)'),
        description: z.string().optional().describe('Descrição da Data Extension'),
        isSendable: z.boolean().optional().default(false).describe('Indica se a DE é enviável'),
        sendableFieldName: z
          .string()
          .optional()
          .describe('Nome do campo usado para envio (obrigatório se isSendable for true)'),
        subscriberFieldName: z
          .string()
          .optional()
          .describe('Campo de subscriber para mapear (ex: "Subscriber Key")'),
        fields: z.array(fieldSchema).describe('Lista de campos a serem criados na DE'),
      },
      toolCall(({ name, externalKey, description, isSendable, sendableFieldName, subscriberFieldName, fields }) =>
        this.deService.createDataExtension({
          name,
          fields,
          ...(externalKey && { externalKey }),
          ...(description && { description }),
          ...(isSendable && { isSendable }),
          ...(sendableFieldName && { sendableDataExtensionField: { name: sendableFieldName } }),
          ...(subscriberFieldName && { sendableSubscriberField: { name: subscriberFieldName } }),
        }),
      ),
    );
  }
}
