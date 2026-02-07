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
      const startParam = (ctx.match as string)?.trim() || '';

      // Ensure user record exists (so adding bot to channel later can link to this user)
      await this.prisma.user.upsert({
        where: { telegramId },
        update: {},
        create: { telegramId },
      });

      // Handle auth callbacks
      if (startParam === 'auth_success') {
        await ctx.reply(
          '✅ Successfully authenticated with Threads!\n\n' +
            'Next: set your sync start date with /setsyncdate (e.g. 2024-01-01), then add this bot as an admin to your Telegram channel. New Threads posts will be reposted there automatically.',
        );
        return;
      }

      if (startParam === 'auth_error') {
        await ctx.reply(
          '❌ Authentication failed. Please try again with /auth.',
        );
        return;
      }

      const user = await this.threadsAuthService.getUserByTelegramId(telegramId);

      if (!user || !user.threadsLongLivedToken) {
        await ctx.reply(
          '👋 Welcome! This bot reposts your Threads posts to your Telegram channel.\n\n' +
            '1️⃣ Use /auth to connect your Threads account.\n' +
            '2️⃣ Use /setsyncdate to set from which date to sync (YYYY-MM-DD).\n' +
            '3️⃣ Add this bot as an admin to your Telegram channel.\n\n' +
            'Start with /auth.',
        );
        return;
      }

      if (!user.syncStartDate) {
        await ctx.reply(
          '✅ Threads connected.\n\n' +
            'Set sync start date with /setsyncdate (e.g. 2024-01-01), then add this bot as an admin to your Telegram channel.',
        );
        return;
      }

      const channelCount = await this.prisma.channel.count({ where: { ownerId: user.id } });
      await ctx.reply(
        '✅ You\'re set up.\n\n' +
          `📅 Sync from: ${user.syncStartDate.toISOString().split('T')[0]}\n` +
          `📢 Channels: ${channelCount}\n\n` +
          'Commands: /help | /status | /setsyncdate | /auth',
      );
    });

    // Help command
    this.bot.command('help', async (ctx: Context) => {
      await ctx.reply(
        '📖 **Threads → Telegram Reposter**\n\n' +
          'Reposts your Threads posts to Telegram channels where this bot is admin.\n\n' +
          '**Commands:**\n' +
          '/start – Check status\n' +
          '/auth – Connect Threads account\n' +
          '/setsyncdate – Set date to sync from (YYYY-MM-DD)\n' +
          '/status – View config & channels\n' +
          '/help – This message\n\n' +
          '**Setup:**\n' +
          '1. /auth and open the link to connect Threads\n' +
          '2. /setsyncdate and enter a date\n' +
          '3. Add this bot as admin to your channel\n' +
          '4. New posts are reposted every minute.',
        { parse_mode: 'Markdown' },
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

        // Ensure user exists (they may have added bot to channel before /start)
        let user = await this.threadsAuthService.getUserByTelegramId(telegramId);
        if (!user) {
          await this.prisma.user.upsert({
            where: { telegramId },
            update: {},
            create: { telegramId },
          });
          user = await this.threadsAuthService.getUserByTelegramId(telegramId);
        }

        if (!user) {
          await ctx.reply('❌ Something went wrong. Try /start first.');
          return;
        }

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

  /** Escape text for Telegram HTML parse_mode so < > & don't break the message */
  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async sendToChannels(telegramId: bigint, message: string, media?: Array<{ type: 'photo' | 'video'; media: string }>) {
    const user = await this.threadsAuthService.getUserByTelegramId(telegramId);
    if (!user) return;

    const channels = await this.prisma.channel.findMany({
      where: { ownerId: user.id },
    });

    const safeCaption = this.escapeHtml(message);

    for (const channel of channels) {
      try {
        if (media && media.length > 0) {
          const telegramMedia = media.map((m, index) => ({
            type: m.type,
            media: m.media,
            caption: index === 0 ? safeCaption : undefined,
            parse_mode: index === 0 ? ('HTML' as const) : undefined,
          }));

          await this.bot.api.sendMediaGroup(channel.channelId, telegramMedia);
        } else {
          await this.bot.api.sendMessage(channel.channelId, safeCaption || '(no text)', {
            parse_mode: 'HTML',
          });
        }
      } catch (error) {
        this.logger.error(`Error sending to channel ${channel.channelId}: ${error.message}`);
      }
    }
  }
}
