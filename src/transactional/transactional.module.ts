import { Module } from '@nestjs/common';
import { TransactionalService } from './transactional.service';
import { TransactionalToolsService } from './transactional.tools';
import { SfmcModule } from '../sfmc/sfmc.module';
import { ContentBuilderModule } from '../content-builder/cb.module';
import { DataExtensionsModule } from '../data-extensions/de.module';

@Module({
  imports: [SfmcModule, ContentBuilderModule, DataExtensionsModule],
  providers: [TransactionalService, TransactionalToolsService],
  exports: [TransactionalToolsService],
})
export class TransactionalModule {}
