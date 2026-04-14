import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CbService } from './cb.service';
import { toolCall } from '../mcp/tool-handler';

const ASSET_TYPE_IDS = {
  htmlemail: 208,
  templatebasedemail: 207,
  textonly: 209,
  webpage: 205,
  image: 28,
  document: 18,
  block: 195,
  template: 4,
} as const;

@Injectable()
export class CbToolsService {
  constructor(private readonly cbService: CbService) {}

  register(server: McpServer): void {
    server.tool(
      'cb_list_assets',
      'Lista assets do Content Builder do SFMC. Permite filtrar por tipo ou buscar por nome.',
      {
        page: z.number().optional().default(1).describe('Número da página'),
        pageSize: z.number().optional().default(50).describe('Itens por página'),
        assetType: z
          .enum(['htmlemail', 'templatebasedemail', 'textonly', 'webpage', 'image', 'document', 'block', 'template'])
          .optional()
          .describe('Filtrar por tipo de asset'),
        query: z.string().optional().describe('Buscar assets pelo nome'),
      },
      toolCall(({ page, pageSize, assetType, query }) =>
        this.cbService.listAssets({
          page,
          pageSize,
          assetTypeId: assetType ? ASSET_TYPE_IDS[assetType] : undefined,
          query,
        }),
      ),
    );

    server.tool(
      'cb_get_asset',
      'Obtém um asset específico do Content Builder do SFMC pelo ID, incluindo conteúdo completo e metadados.',
      {
        id: z.number().describe('ID do asset'),
      },
      toolCall(({ id }) => this.cbService.getAsset(id)),
    );

    server.tool(
      'cb_create_asset',
      'Cria um novo asset no Content Builder do SFMC (email, bloco, template, imagem, etc.).',
      {
        name: z.string().describe('Nome do asset'),
        assetTypeId: z
          .number()
          .describe('ID do tipo de asset (ex: 208 = HTML Email, 195 = Bloco, 4 = Template)'),
        content: z.string().optional().describe('Conteúdo HTML ou texto do asset'),
        description: z.string().optional().describe('Descrição do asset'),
        categoryId: z.number().optional().describe('ID da pasta/categoria onde o asset será criado'),
        meta: z.record(z.unknown()).optional().describe('Metadados adicionais (JSON)'),
        data: z.record(z.unknown()).optional().describe('Payload de dados do asset (JSON)'),
      },
      toolCall(({ name, assetTypeId, content, description, categoryId, meta, data }) =>
        this.cbService.createAsset({
          name,
          assetType: { id: assetTypeId },
          ...(content && { content }),
          ...(description && { description }),
          ...(categoryId && { category: { id: categoryId } }),
          ...(meta && { meta }),
          ...(data && { data }),
        }),
      ),
    );

    server.tool(
      'cb_update_asset',
      'Atualiza um asset existente no Content Builder do SFMC.',
      {
        id: z.number().describe('ID do asset a ser atualizado'),
        name: z.string().optional().describe('Novo nome'),
        content: z.string().optional().describe('Novo conteúdo HTML ou texto'),
        description: z.string().optional().describe('Nova descrição'),
        categoryId: z.number().optional().describe('Novo ID de pasta/categoria'),
        meta: z.record(z.unknown()).optional().describe('Metadados atualizados (JSON)'),
        data: z.record(z.unknown()).optional().describe('Payload de dados atualizado (JSON)'),
      },
      toolCall(({ id, name, content, description, categoryId, meta, data }) => {
        const body: Record<string, unknown> = {};
        if (name) body.name = name;
        if (content) body.content = content;
        if (description) body.description = description;
        if (categoryId) body.category = { id: categoryId };
        if (meta) body.meta = meta;
        if (data) body.data = data;
        return this.cbService.updateAsset(id, body);
      }),
    );

    server.tool(
      'cb_delete_asset',
      'Remove um asset do Content Builder do SFMC pelo ID.',
      {
        id: z.number().describe('ID do asset a ser removido'),
      },
      toolCall(async ({ id }) => {
        await this.cbService.deleteAsset(id);
        return { content: [{ type: 'text' as const, text: `Asset ${id} removido com sucesso.` }] };
      }),
    );

    server.tool(
      'cb_list_folders',
      'Lista pastas/categorias do Content Builder. Permite filtrar por pasta pai.',
      {
        parentId: z.number().optional().describe('ID da pasta pai (omitir para listar pastas raiz)'),
      },
      toolCall(({ parentId }) => this.cbService.listCategories(parentId)),
    );

    server.tool(
      'cb_create_folder',
      'Cria uma nova pasta no Content Builder do SFMC.',
      {
        name: z.string().describe('Nome da pasta'),
        parentId: z.number().optional().describe('ID da pasta pai (omitir para criar na raiz)'),
      },
      toolCall(({ name, parentId }) => this.cbService.createCategory(name, parentId)),
    );
  }
}
