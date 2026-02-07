import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { ThreadsAuthModule } from './threads-auth/threads-auth.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { PollingModule } from './polling/polling.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    ThreadsAuthModule,
    TelegramBotModule,
    PollingModule,
  ],
})
export class AppModule {}
