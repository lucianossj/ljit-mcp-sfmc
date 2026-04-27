import { Module } from '@nestjs/common';
import { DeService } from './de.service';
import { DeSoapService } from './de-soap.service';
import { DeToolsService } from './de.tools';
import { SfmcModule } from '../sfmc/sfmc.module';

@Module({
  imports: [SfmcModule],
  providers: [DeService, DeSoapService, DeToolsService],
  exports: [DeService, DeSoapService, DeToolsService],
})
export class DataExtensionsModule {}
