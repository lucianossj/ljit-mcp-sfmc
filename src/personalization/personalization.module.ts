import { Module } from '@nestjs/common';
import { PersAuthService } from './pers-auth.service';
import { PersHttpService } from './pers-http.service';
import { PersonalizationService } from './personalization.service';
import { PersonalizationToolsService } from './personalization.tools';

@Module({
  providers: [
    PersAuthService,
    PersHttpService,
    PersonalizationService,
    PersonalizationToolsService,
  ],
  exports: [
    PersAuthService,
    PersHttpService,
    PersonalizationService,
    PersonalizationToolsService,
  ],
})
export class PersonalizationModule {}
