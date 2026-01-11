import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

interface ThreadsPost {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  children?: {
    data: ThreadsPost[];
  };
}

interface ThreadsMedia {
  type: 'photo' | 'video';
  media: string;
}

@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name);

  constructor(
    private prisma: PrismaService,
    private telegramBotService: TelegramBotService,
  ) {}

  @Cron('*/60 * * * * *') // Every 60 seconds
  async handlePolling() {
    this.logger.debug('Starting polling cycle...');

    // Get all active users with valid tokens
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        threadsLongLivedToken: { not: null },
        syncStartDate: { not: null },
        tokenExpiresAt: { gt: new Date() },
      },
      include: {
        channels: true,
        processedPosts: {
          select: { threadsPostId: true },
        },
      },
    });

    for (const user of users) {
      if (!user.channels || user.channels.length === 0) {
        continue; // Skip users without channels
      }

      try {
        await this.processUserPosts(user);
      } catch (error) {
        this.logger.error(`Error processing posts for user ${user.telegramId}: ${error.message}`, error.stack);
      }
    }

    this.logger.debug('Polling cycle completed');
  }

  private async processUserPosts(user: any) {
    const accessToken = user.threadsLongLivedToken;
    const userId = user.threadsUserId;
    const syncStartDate = user.syncStartDate;
    const processedPostIds = new Set(user.processedPosts.map((p: any) => p.threadsPostId));

    if (!accessToken || !userId) {
      return;
    }

    try {
      // Fetch user's threads posts
      const posts = await this.fetchUserThreads(userId, accessToken);

      for (const post of posts) {
        const postId = post.id;
        const postTimestamp = new Date(post.timestamp);

        // Skip if already processed
        if (processedPostIds.has(postId)) {
          continue;
        }

        // Skip if post is before sync start date
        if (postTimestamp < syncStartDate) {
          continue;
        }

        // Process the post
        await this.processPost(user, post);
      }
    } catch (error) {
      this.logger.error(`Error fetching posts for user ${user.telegramId}: ${error.message}`);
    }
  }

  private async fetchUserThreads(userId: string, accessToken: string): Promise<ThreadsPost[]> {
    const url = `https://graph.threads.net/v1.0/${userId}/threads?access_token=${accessToken}&fields=id,caption,media_type,media_url,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}`;

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch threads: ${error}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  private async processPost(user: any, post: ThreadsPost) {
    try {
      const caption = post.caption || '';
      const media: ThreadsMedia[] = [];

      // Handle main post media
      if (post.media_url) {
        media.push({
          type: post.media_type === 'VIDEO' ? 'video' : 'photo',
          media: post.media_url,
        });
      } else if (post.thumbnail_url) {
        media.push({
          type: 'photo',
          media: post.thumbnail_url,
        });
      }

      // Handle children (carousel posts)
      if (post.children && post.children.data) {
        for (const child of post.children.data) {
          if (child.media_url) {
            media.push({
              type: child.media_type === 'VIDEO' ? 'video' : 'photo',
              media: child.media_url,
            });
          } else if (child.thumbnail_url) {
            media.push({
              type: 'photo',
              media: child.thumbnail_url,
            });
          }
        }
      }

      // Prepare Telegram media group
      const telegramMedia = media.map((m) => ({
        type: m.type,
        media: m.media,
      }));

      // Send to channels
      if (telegramMedia.length > 0) {
        await this.telegramBotService.sendToChannels(BigInt(user.telegramId), caption, telegramMedia);
      } else {
        await this.telegramBotService.sendToChannels(BigInt(user.telegramId), caption);
      }

      // Mark as processed
      await this.prisma.processedPost.create({
        data: {
          threadsPostId: post.id,
          userId: user.id,
        },
      });

      this.logger.log(`Processed post ${post.id} for user ${user.telegramId}`);
    } catch (error) {
      this.logger.error(`Error processing post ${post.id}: ${error.message}`, error.stack);
    }
  }
}
