import { Module } from '@nestjs/common';
import { SfmcHttpService } from './sfmc-http.service';
import { SfmcSoapService } from './sfmc-soap.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [SfmcHttpService, SfmcSoapService],
  exports: [SfmcHttpService, SfmcSoapService],
})
export class SfmcModule {}
