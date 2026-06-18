import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SfmcModule } from './sfmc/sfmc.module';
import { McpModule } from './mcp/mcp.module';
import { DataExtensionsModule } from './data-extensions/de.module';
import { ContentBuilderModule } from './content-builder/cb.module';
import { TransactionalModule } from './transactional/transactional.module';
import { JourneysModule } from './journeys/journeys.module';
import { PersonalizationModule } from './personalization/personalization.module';

@Module({
  imports: [
    AuthModule,
    SfmcModule,
    DataExtensionsModule,
    ContentBuilderModule,
    TransactionalModule,
    JourneysModule,
    PersonalizationModule,
    McpModule,
  ],
})
export class AppModule { }
