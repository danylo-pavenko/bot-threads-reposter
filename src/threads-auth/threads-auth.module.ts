import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThreadsAuthController } from './threads-auth.controller';
import { ThreadsAuthService } from './threads-auth.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ThreadsAuthController],
  providers: [ThreadsAuthService],
  exports: [ThreadsAuthService],
})
export class ThreadsAuthModule {}
