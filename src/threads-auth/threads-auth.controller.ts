import { Controller, Get, Query, Res, BadRequestException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ThreadsAuthService } from './threads-auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth/threads')
export class ThreadsAuthController {
  private readonly logger = new Logger(ThreadsAuthController.name);

  constructor(
    private threadsAuthService: ThreadsAuthService,
    private prisma: PrismaService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.redirect(`https://t.me/your_bot_username?start=auth_error`);
    }

    try {
      // State should be in format: telegramId:randomString
      // For simplicity, we'll use telegramId as state
      const telegramId = BigInt(state);

      // Exchange code for short-lived token
      const tokenResponse = await this.threadsAuthService.exchangeCodeForToken(code);

      // Exchange short-lived token for long-lived token (60 days)
      const longLivedTokenResponse =
        await this.threadsAuthService.exchangeShortLivedForLongLived(
          tokenResponse.access_token,
        );

      // Get user info
      const userInfo = await this.threadsAuthService.getUserInfo(
        longLivedTokenResponse.access_token,
      );

      // Save tokens to database
      await this.threadsAuthService.saveUserTokens(
        telegramId,
        tokenResponse.access_token,
        longLivedTokenResponse.access_token,
        longLivedTokenResponse.expires_in,
        userInfo.id,
      );

      this.logger.log(`User ${telegramId} successfully authenticated with Threads`);

      // Redirect back to Telegram bot
      // Note: Replace 'your_bot_username' with your actual bot username or use env variable
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'your_bot_username';
      return res.redirect(`https://t.me/${botUsername}?start=auth_success`);
    } catch (error) {
      this.logger.error(`Authentication error: ${error.message}`, error.stack);
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'your_bot_username';
      return res.redirect(`https://t.me/${botUsername}?start=auth_error`);
    }
  }

  @Get('authorize')
  async authorize(@Query('telegramId') telegramId: string, @Res() res: Response) {
    if (!telegramId) {
      throw new BadRequestException('telegramId is required');
    }

    // Use telegramId as state (in production, add encryption/signing)
    const state = telegramId;
    const authUrl = this.threadsAuthService.getAuthUrl(state);

    return res.redirect(authUrl);
  }
}
