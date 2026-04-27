import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DeService } from './de.service';
import { DeSoapService } from './de-soap.service';
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

const soapFieldSchema = z.object({
  name: z.string().describe('Nome do campo'),
  fieldType: z
    .enum(['Text', 'Number', 'Date', 'Boolean', 'EmailAddress', 'Phone', 'Decimal', 'Locale'])
    .describe('Tipo de dado do campo'),
  maxLength: z.number().optional().describe('Tamanho máximo (campos Text)'),
  isPrimaryKey: z.boolean().optional().describe('Indica se é chave primária'),
  isRequired: z.boolean().optional().describe('Indica se é obrigatório'),
  defaultValue: z.string().optional().describe('Valor padrão'),
});

@Injectable()
export class DeToolsService {
  constructor(
    private readonly deService: DeService,
    private readonly deSoapService: DeSoapService,
  ) {}

  register(server: McpServer): void {
    server.tool(
      'de_list',
      'Lista Data Extensions do SFMC. O parâmetro nameFilter é obrigatório — informe um trecho do nome para busca (ex: "DEX_" para listar todas as DEs com esse prefixo). Suporta paginação.',
      {
        page: z.number().optional().default(1).describe('Número da página (padrão: 1)'),
        pageSize: z.number().optional().default(50).describe('Itens por página (padrão: 50, máx: 2500)'),
        nameFilter: z.string().describe('Filtrar por prefixo/trecho do nome da DE (obrigatório)'),
      },
      toolCall(({ page, pageSize, nameFilter }) =>
        this.deService.listDataExtensions({ page, pageSize, nameFilter }),
      ),
    );

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
      'de_list_folders_soap',
      'Lista pastas de Data Extension via SOAP. Retorna pastas com ContentType = "dataextension".',
      {
        parentId: z.number().optional().describe('Filtrar por pasta pai (opcional)'),
      },
      toolCall(({ parentId }) => this.deSoapService.listDataExtensionFolders(parentId)),
    );

    server.tool(
      'de_create_folder_soap',
      'Cria uma nova pasta de Data Extension via SOAP. ContentType fixo = "dataextension".',
      {
        name: z.string().describe('Nome da pasta'),
        parentId: z.number().optional().describe('ID da pasta pai (opcional)'),
        description: z.string().optional().describe('Descrição da pasta (opcional)'),
      },
      toolCall(({ name, parentId, description }) => this.deSoapService.createDataExtensionFolder({ name, parentId, description })),
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

    server.tool(
      'de_create_schema',
      'Cria uma nova Data Extension no SFMC via SOAP API com schema completo. Recomendado para DEs sendable, campos do tipo EmailAddress, ou quando a REST API não suportar o schema desejado.',
      {
        name: z.string().describe('Nome da Data Extension'),
        customerKey: z.string().describe('Chave externa (CustomerKey) da Data Extension'),
        description: z.string().optional().describe('Descrição da Data Extension'),
        isSendable: z.boolean().optional().describe('Indica se a DE é enviável'),
        sendableDataExtensionField: z
          .object({ name: z.string().describe('Nome do campo da DE usado para envio') })
          .optional()
          .describe('Campo da DE mapeado para envio (obrigatório se isSendable for true)'),
        sendableSubscriberField: z
          .object({ name: z.string().describe('Nome do campo de subscriber (ex: "Email Address")') })
          .optional()
          .describe('Campo de subscriber para mapear'),
        categoryId: z.number().optional().describe('ID da pasta onde a DE será criada'),
        fields: z.array(soapFieldSchema).describe('Lista de campos do schema da Data Extension'),
      },
      toolCall(({ name, customerKey, description, isSendable, sendableDataExtensionField, sendableSubscriberField, categoryId, fields }) =>
        this.deSoapService.createDataExtension({
          name,
          customerKey,
          fields,
          ...(description && { description }),
          ...(isSendable !== undefined && { isSendable }),
          ...(sendableDataExtensionField && { sendableDataExtensionField }),
          ...(sendableSubscriberField && { sendableSubscriberField }),
          ...(categoryId !== undefined && { categoryId }),
        }),
      ),
    );

    server.tool(
      'de_update_schema',
      'Atualiza metadados e/ou campos de uma Data Extension existente no SFMC via SOAP API.',
      {
        customerKey: z.string().describe('Chave externa (CustomerKey) da Data Extension a atualizar'),
        name: z.string().optional().describe('Novo nome da Data Extension'),
        description: z.string().optional().describe('Nova descrição'),
        isSendable: z.boolean().optional().describe('Altera se a DE é enviável'),
        fields: z.array(soapFieldSchema).optional().describe('Campos a adicionar ou atualizar'),
      },
      toolCall(({ customerKey, name, description, isSendable, fields }) =>
        this.deSoapService.updateDataExtension(customerKey, {
          ...(name && { name }),
          ...(description && { description }),
          ...(isSendable !== undefined && { isSendable }),
          ...(fields && { fields }),
        }),
      ),
    );

    server.tool(
      'de_delete_schema',
      'Remove uma Data Extension do SFMC via SOAP API pelo CustomerKey.',
      {
        customerKey: z.string().describe('Chave externa (CustomerKey) da Data Extension a remover'),
      },
      toolCall(({ customerKey }) =>
        this.deSoapService.deleteDataExtension(customerKey),
      ),
    );
  }
}
