import { Module } from '@nestjs/common';
import { PollingService } from './polling.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [PrismaModule, TelegramBotModule],
  providers: [PollingService],
})
export class PollingModule {}
