import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface ThreadsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ThreadsUserResponse {
  id: string;
  username: string;
}

@Injectable()
export class ThreadsAuthService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly baseUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.appId = this.configService.get<string>('THREADS_APP_ID');
    this.appSecret = this.configService.get<string>('THREADS_APP_SECRET');
    this.redirectUri = this.configService.get<string>('THREADS_REDIRECT_URI');
    this.baseUrl = this.configService.get<string>('BASE_URL');
  }

  getAuthUrl(state: string): string {
    const scopes = ['threads_basic', 'threads_content_publish'];
    const scopeString = scopes.join(',');
    
    return `https://www.threads.net/oauth/authorize?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scopeString}&response_type=code&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<ThreadsTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code,
    });

    const response = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Failed to exchange code for token: ${error}`);
    }

    return response.json();
  }

  async exchangeShortLivedForLongLived(shortLivedToken: string): Promise<ThreadsTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: shortLivedToken,
    });

    const response = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Failed to exchange for long-lived token: ${error}`);
    }

    return response.json();
  }

  async getUserInfo(accessToken: string): Promise<ThreadsUserResponse> {
    const response = await fetch(
      `https://graph.threads.net/v1.0/me?access_token=${accessToken}&fields=id,username`,
    );

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Failed to get user info: ${error}`);
    }

    return response.json();
  }

  async saveUserTokens(
    telegramId: bigint,
    shortLivedToken: string,
    longLivedToken: string,
    expiresIn: number,
    userId: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        threadsAccessToken: shortLivedToken,
        threadsLongLivedToken: longLivedToken,
        tokenExpiresAt: expiresAt,
        threadsUserId: userId,
        isActive: true,
      },
      create: {
        telegramId,
        threadsAccessToken: shortLivedToken,
        threadsLongLivedToken: longLivedToken,
        tokenExpiresAt: expiresAt,
        threadsUserId: userId,
        isActive: true,
      },
    });
  }

  async getUserByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }
}
