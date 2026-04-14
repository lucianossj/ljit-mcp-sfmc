import { Module } from '@nestjs/common';
import { SfmcHttpService } from './sfmc-http.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [SfmcHttpService],
  exports: [SfmcHttpService],
})
export class SfmcModule {}
