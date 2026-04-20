import { Module } from '@nestjs/common';
import { SfmcModule } from '../sfmc/sfmc.module';
import { JourneysService } from './journeys.service';
import { JourneysToolsService } from './journeys.tools';

@Module({
    imports: [SfmcModule],
    providers: [JourneysService, JourneysToolsService],
    exports: [JourneysToolsService],
})
export class JourneysModule { }
