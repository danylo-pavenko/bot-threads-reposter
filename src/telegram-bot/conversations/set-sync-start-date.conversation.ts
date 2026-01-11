import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

export function createSetSyncStartDateConversation(prisma: PrismaService) {
  return async function setSyncStartDate(
    conversation: MyConversation,
    ctx: MyContext,
  ) {
    await ctx.reply(
      '📅 Please enter your sync start date in YYYY-MM-DD format.\n\n' +
        'Example: 2024-01-01\n\n' +
        'Posts created on or after this date will be synced to your Telegram channels.',
    );

    const dateCtx = await conversation.waitFor('message:text');

    const dateString = dateCtx.message.text.trim();
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(dateString)) {
      await ctx.reply(
        '❌ Invalid date format. Please use YYYY-MM-DD format (e.g., 2024-01-01).\n\n' +
          'Try again or use /cancel to cancel.',
      );
      return;
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const syncStartDate = new Date(year, month - 1, day);

    // Validate date
    if (
      syncStartDate.getFullYear() !== year ||
      syncStartDate.getMonth() !== month - 1 ||
      syncStartDate.getDate() !== day
    ) {
      await ctx.reply(
        '❌ Invalid date. Please enter a valid date in YYYY-MM-DD format.\n\n' +
          'Try again or use /cancel to cancel.',
      );
      return;
    }

    // Check if date is in the future
    if (syncStartDate > new Date()) {
      await ctx.reply(
        '❌ Sync start date cannot be in the future. Please enter a past or current date.\n\n' +
          'Try again or use /cancel to cancel.',
      );
      return;
    }

    // Save sync start date
    const telegramId = BigInt(ctx.from.id);

    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      await ctx.reply('❌ User not found. Please use /start to get started.');
      return;
    }

    await prisma.user.update({
      where: { telegramId },
      data: {
        syncStartDate,
        isActive: true,
      },
    });

    await ctx.reply(
      `✅ Sync start date has been set to ${dateString}!\n\n` +
        'Your Threads posts will now be automatically synced to your Telegram channels.',
    );
  };
}
