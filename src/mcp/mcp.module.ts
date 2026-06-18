import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { DataExtensionsModule } from '../data-extensions/de.module';
import { ContentBuilderModule } from '../content-builder/cb.module';
import { TransactionalModule } from '../transactional/transactional.module';
import { JourneysModule } from '../journeys/journeys.module';
import { PersonalizationModule } from '../personalization/personalization.module';

@Module({
  imports: [DataExtensionsModule, ContentBuilderModule, TransactionalModule, JourneysModule, PersonalizationModule],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule { }
