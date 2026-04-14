import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DeToolsService } from '../data-extensions/de.tools';
import { CbToolsService } from '../content-builder/cb.tools';
import { TransactionalToolsService } from '../transactional/transactional.tools';

@Injectable()
export class McpService {
  private readonly server: McpServer;

  constructor(
    private readonly deTools: DeToolsService,
    private readonly cbTools: CbToolsService,
    private readonly transactionalTools: TransactionalToolsService,
  ) {
    this.server = new McpServer({
      name: 'mcp-sfmc',
      version: '1.0.0',
    });
  }

  async start(): Promise<void> {
    this.deTools.register(this.server);
    this.cbTools.register(this.server);
    this.transactionalTools.register(this.server);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
