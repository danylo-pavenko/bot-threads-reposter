import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { ThreadsAuthModule } from './threads-auth/threads-auth.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { PollingModule } from './polling/polling.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
        },
      }),
    }),
    PrismaModule,
    ThreadsAuthModule,
    TelegramBotModule,
    PollingModule,
  ],
})
export class AppModule {}
