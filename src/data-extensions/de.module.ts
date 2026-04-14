import { Module } from '@nestjs/common';
import { DeService } from './de.service';
import { DeToolsService } from './de.tools';
import { SfmcModule } from '../sfmc/sfmc.module';

@Module({
  imports: [SfmcModule],
  providers: [DeService, DeToolsService],
  exports: [DeToolsService],
})
export class DataExtensionsModule {}
