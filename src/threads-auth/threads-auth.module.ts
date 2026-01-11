import { Module } from '@nestjs/common';
import { ThreadsAuthController } from './threads-auth.controller';
import { ThreadsAuthService } from './threads-auth.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ThreadsAuthController],
  providers: [ThreadsAuthService],
  exports: [ThreadsAuthService],
})
export class ThreadsAuthModule {}
