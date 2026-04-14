import { Module } from '@nestjs/common';
import { CbService } from './cb.service';
import { CbToolsService } from './cb.tools';
import { SfmcModule } from '../sfmc/sfmc.module';

@Module({
  imports: [SfmcModule],
  providers: [CbService, CbToolsService],
  exports: [CbService, CbToolsService],
})
export class ContentBuilderModule {}
