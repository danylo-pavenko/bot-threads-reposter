import { Module, Global } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ThreadsAuthModule } from '../threads-auth/threads-auth.module';

@Global()
@Module({
  imports: [PrismaModule, ThreadsAuthModule],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
