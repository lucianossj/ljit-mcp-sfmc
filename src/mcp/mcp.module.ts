import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { DataExtensionsModule } from '../data-extensions/de.module';
import { ContentBuilderModule } from '../content-builder/cb.module';
import { TransactionalModule } from '../transactional/transactional.module';

@Module({
  imports: [DataExtensionsModule, ContentBuilderModule, TransactionalModule],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
