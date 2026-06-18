import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DeToolsService } from '../data-extensions/de.tools';
import { CbToolsService } from '../content-builder/cb.tools';
import { TransactionalToolsService } from '../transactional/transactional.tools';
import { JourneysToolsService } from '../journeys/journeys.tools';
import { PersonalizationToolsService } from '../personalization/personalization.tools';

/**
 * Resolve a versão do package.json. Tenta os dois níveis possíveis para
 * cobrir dev (src/mcp → raiz) e build/instalado (dist/src/mcp → raiz).
 */
function resolvePackageVersion(): string {
  for (const rel of ['../../package.json', '../../../package.json']) {
    try {
      return require(rel).version as string;
    } catch {
      // tenta o próximo nível
    }
  }
  return '0.0.0';
}

@Injectable()
export class McpService {
  private readonly server: McpServer;

  constructor(
    private readonly deTools: DeToolsService,
    private readonly cbTools: CbToolsService,
    private readonly transactionalTools: TransactionalToolsService,
    private readonly journeysTools: JourneysToolsService,
    private readonly personalizationTools: PersonalizationToolsService,
  ) {
    this.server = new McpServer({
      name: 'mcp-sfmc',
      version: resolvePackageVersion(),
    });
  }

  async start(): Promise<void> {
    this.deTools.register(this.server);
    this.cbTools.register(this.server);
    this.transactionalTools.register(this.server);
    this.journeysTools.register(this.server);
    this.personalizationTools.register(this.server);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
