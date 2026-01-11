import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { PrismaService } from '../prisma/prisma.service';
import { ThreadsAuthService } from '../threads-auth/threads-auth.service';
import { createSetSyncStartDateConversation } from './conversations/set-sync-start-date.conversation';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private threadsAuthService: ThreadsAuthService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }

    this.bot = new Bot(token);

    // Set up session middleware
    this.bot.use(
      session({
        initial: () => ({}),
      }),
    );

    // Set up conversations
    this.bot.use(conversations());

    // Register conversations with dependencies
    const setSyncStartDate = createSetSyncStartDateConversation(this.prisma);
    this.bot.use(createConversation(setSyncStartDate, 'setSyncStartDate'));

    this.setupHandlers();
  }

  async onModuleInit() {
    await this.bot.api.deleteWebhook({ drop_pending_updates: true });
    this.bot.start();
    this.logger.log('Telegram bot started');
  }

  private setupHandlers() {
    // Handle /start command
    this.bot.command('start', async (ctx: Context) => {
      const telegramId = BigInt(ctx.from.id);
      const startParam = ctx.match as string;

      // Handle auth callbacks
      if (startParam === 'auth_success') {
        await ctx.reply(
          '✅ Successfully authenticated with Threads!\n\n' +
            'Now, let\'s set your sync start date. Use /setsyncdate to configure when to start syncing posts.',
        );
        return;
      }

      if (startParam === 'auth_error') {
        await ctx.reply(
          '❌ Authentication failed. Please try again using /auth command.',
        );
        return;
      }

      // Check if user exists and is authenticated
      const user = await this.threadsAuthService.getUserByTelegramId(telegramId);

      if (!user || !user.threadsLongLivedToken) {
        await ctx.reply(
          '👋 Welcome to Threads-to-Telegram Reposter!\n\n' +
            'To get started, you need to authenticate with Threads.\n\n' +
            'Use /auth to begin the authentication process.',
        );
        return;
      }

      if (!user.syncStartDate) {
        await ctx.reply(
          '✅ You\'re authenticated with Threads!\n\n' +
            'Next step: Set your sync start date to specify when to start syncing posts.\n\n' +
            'Use /setsyncdate to configure this.',
        );
        return;
      }

      await ctx.reply(
        '✅ You\'re all set up!\n\n' +
          `Sync Start Date: ${user.syncStartDate.toISOString().split('T')[0]}\n` +
          `Status: ${user.isActive ? '🟢 Active' : '🔴 Inactive'}\n\n` +
          'Available commands:\n' +
          '/setsyncdate - Update sync start date\n' +
          '/status - Check your current status\n' +
          '/auth - Re-authenticate with Threads',
      );
    });

    // Handle /auth command
    this.bot.command('auth', async (ctx: Context) => {
      const telegramId = BigInt(ctx.from.id);
      const baseUrl = this.configService.get<string>('BASE_URL');
      const authUrl = `${baseUrl}/auth/threads/authorize?telegramId=${telegramId}`;

      await ctx.reply(
        '🔐 To authenticate with Threads, please click the link below:\n\n' +
          `<a href="${authUrl}">🔗 Authenticate with Threads</a>`,
        { parse_mode: 'HTML' },
      );
    });

    // Handle /setsyncdate command
    this.bot.command('setsyncdate', async (ctx: Context) => {
      await ctx.conversation.enter('setSyncStartDate');
    });

    // Handle /status command
    this.bot.command('status', async (ctx: Context) => {
      const telegramId = BigInt(ctx.from.id);
      const user = await this.threadsAuthService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('❌ You are not registered. Use /start to get started.');
        return;
      }

      const channels = await this.prisma.channel.findMany({
        where: { ownerId: user.id },
      });

      let statusText = '📊 Your Status:\n\n';
      statusText += `Threads User ID: ${user.threadsUserId || 'N/A'}\n`;
      statusText += `Sync Start Date: ${user.syncStartDate ? user.syncStartDate.toISOString().split('T')[0] : 'Not set'}\n`;
      statusText += `Status: ${user.isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
      statusText += `Channels: ${channels.length}\n`;

      if (channels.length > 0) {
        statusText += '\n📢 Your Channels:\n';
        channels.forEach((channel) => {
          statusText += `  • ${channel.channelId}\n`;
        });
      }

      await ctx.reply(statusText);
    });

    // Handle my_chat_member updates to track when bot is added as admin
    this.bot.on('my_chat_member', async (ctx: Context) => {
      const update = ctx.myChatMember;
      if (!update) return;

      const chat = update.chat;
      const newStatus = update.new_chat_member.status;
      const oldStatus = update.old_chat_member.status;

      // Check if bot was added as administrator
      if (newStatus === 'administrator' && oldStatus !== 'administrator') {
        const telegramId = BigInt(ctx.from.id);
        const user = await this.threadsAuthService.getUserByTelegramId(telegramId);

        if (!user) {
          await ctx.reply('❌ You are not registered. Use /start to get started.');
          return;
        }

        // Store channel information
        const channelId = chat.type === 'channel' ? String(chat.id) : chat.username ? `@${chat.username}` : String(chat.id);

        try {
          await this.prisma.channel.upsert({
            where: {
              channelId_ownerId: {
                channelId,
                ownerId: user.id,
              },
            },
            update: {},
            create: {
              channelId,
              ownerId: user.id,
            },
          });

          this.logger.log(`Channel ${channelId} added for user ${telegramId}`);
          await ctx.reply(`✅ Channel ${channelId} has been added! Posts will be synced to this channel.`);
        } catch (error) {
          this.logger.error(`Error adding channel: ${error.message}`);
          await ctx.reply('❌ Error adding channel. Please try again.');
        }
      }

      // Check if bot was removed as administrator
      if (newStatus !== 'administrator' && oldStatus === 'administrator') {
        const telegramId = BigInt(ctx.from.id);
        const user = await this.threadsAuthService.getUserByTelegramId(telegramId);

        if (user) {
          const channelId = chat.type === 'channel' ? String(chat.id) : chat.username ? `@${chat.username}` : String(chat.id);

          try {
            await this.prisma.channel.deleteMany({
              where: {
                channelId,
                ownerId: user.id,
              },
            });

            this.logger.log(`Channel ${channelId} removed for user ${telegramId}`);
            await ctx.reply(`ℹ️ Channel ${channelId} has been removed from syncing.`);
          } catch (error) {
            this.logger.error(`Error removing channel: ${error.message}`);
          }
        }
      }
    });
  }

  async sendToChannels(telegramId: bigint, message: string, media?: Array<{ type: 'photo' | 'video'; media: string }>) {
    const user = await this.threadsAuthService.getUserByTelegramId(telegramId);
    if (!user) return;

    const channels = await this.prisma.channel.findMany({
      where: { ownerId: user.id },
    });

    for (const channel of channels) {
      try {
        if (media && media.length > 0) {
          // Format media for Telegram API
          const telegramMedia = media.map((m, index) => ({
            type: m.type,
            media: m.media,
            caption: index === 0 ? message : undefined, // Only first media gets caption
            parse_mode: index === 0 ? 'HTML' as const : undefined,
          }));

          await this.bot.api.sendMediaGroup(channel.channelId, telegramMedia);
        } else {
          await this.bot.api.sendMessage(channel.channelId, message, {
            parse_mode: 'HTML',
          });
        }
      } catch (error) {
        this.logger.error(`Error sending to channel ${channel.channelId}: ${error.message}`);
      }
    }
  }
}
