import { Module } from '@nestjs/common';
import { TransactionalService } from './transactional.service';
import { TransactionalToolsService } from './transactional.tools';
import { SfmcModule } from '../sfmc/sfmc.module';

@Module({
  imports: [SfmcModule],
  providers: [TransactionalService, TransactionalToolsService],
  exports: [TransactionalToolsService],
})
export class TransactionalModule {}
