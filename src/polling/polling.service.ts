import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

// Threads API: media_type is TEXT_POST | IMAGE | VIDEO | CAROUSEL_ALBUM | AUDIO | REPOST_FACADE
// Text content is in "text" field (not caption)
interface ThreadsPost {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink?: string;
  children?: {
    data: Array<{
      id: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
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
    const syncStartDate = user.syncStartDate;
    const processedPostIds = new Set(user.processedPosts.map((p: any) => p.threadsPostId));

    if (!accessToken || !syncStartDate) {
      return;
    }

    try {
      const posts = await this.fetchUserThreads(accessToken, syncStartDate);

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

  /**
   * Fetches threads for the token owner using GET /me/threads.
   * Uses since to only get posts from syncStartDate onward.
   */
  private async fetchUserThreads(
    accessToken: string,
    sinceDate: Date,
  ): Promise<ThreadsPost[]> {
    const since = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const fields = [
      'id',
      'text',
      'media_type',
      'media_url',
      'thumbnail_url',
      'timestamp',
      'permalink',
      'children{id,media_type,media_url,thumbnail_url}',
    ].join(',');
    const url = `https://graph.threads.net/v1.0/me/threads?access_token=${encodeURIComponent(accessToken)}&fields=${encodeURIComponent(fields)}&since=${since}&limit=25`;

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch threads: ${error}`);
    }

    const data = await response.json();
    const posts: ThreadsPost[] = data.data || [];

    // Sort by timestamp ascending so we repost in chronological order
    posts.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return posts;
  }

  private async processPost(user: any, post: ThreadsPost) {
    try {
      const caption = post.text || '';
      const media: ThreadsMedia[] = [];

      // Threads media_type: TEXT_POST, IMAGE, VIDEO, CAROUSEL_ALBUM, AUDIO, REPOST_FACADE
      const isVideo = (t?: string) => t === 'VIDEO';
      const isPhoto = (t?: string) => !t || ['TEXT_POST', 'IMAGE', 'CAROUSEL_ALBUM', 'AUDIO', 'REPOST_FACADE'].includes(t);

      if (post.media_url) {
        media.push({
          type: isVideo(post.media_type) ? 'video' : 'photo',
          media: post.media_url,
        });
      } else if (post.thumbnail_url) {
        media.push({ type: 'photo', media: post.thumbnail_url });
      }

      if (post.children?.data) {
        for (const child of post.children.data) {
          if (child.media_url) {
            media.push({
              type: isVideo(child.media_type) ? 'video' : 'photo',
              media: child.media_url,
            });
          } else if (child.thumbnail_url) {
            media.push({ type: 'photo', media: child.thumbnail_url });
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
