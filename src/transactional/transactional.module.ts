import { Module } from '@nestjs/common';
import { TransactionalService } from './transactional.service';
import { TransactionalToolsService } from './transactional.tools';
import { SfmcModule } from '../sfmc/sfmc.module';
import { ContentBuilderModule } from '../content-builder/cb.module';

@Module({
  imports: [SfmcModule, ContentBuilderModule],
  providers: [TransactionalService, TransactionalToolsService],
  exports: [TransactionalToolsService],
})
export class TransactionalModule {}
