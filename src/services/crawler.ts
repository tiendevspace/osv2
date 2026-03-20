import { CheerioCrawler, Configuration, EnqueueStrategy } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';
import type { RawPage } from '../types/domains.js';

const BODY_TEXT = ['p', 'li', 'span', 'div', 'h4', 'h5', 'h6'];
const BODY_NOISE = [
    'script', 'style', 'noscript', 'header', 'footer', 'nav', 'aside', 
    '.breadcrumb', '.breadcrumbs', '.cookie-consent', '.cookie-consent-banner', 
    '.cookie-consent-notice', '.cookie-consent-popup', '.cookie-consent-message', 
    '.cookie-consent-container'];

export async function crawlUrl(startUrl: string): Promise<RawPage[]> {
  const results: RawPage[] = [];

  const config = new Configuration({ storageClient: new MemoryStorage() });

  const crawler = new CheerioCrawler(
    {
      maxCrawlDepth: 2,
      async requestHandler({ request, $, enqueueLinks }) {
        const title = $('title').text().trim();

        /**
         * This is important
         */
        const body = $(BODY_TEXT.join(','))
          .not(BODY_NOISE.join(','))
          .toArray()
          .map((el) => $(el).text().trim())
          .filter((text) => text.length > 0)
          .join(' ');

        function attr(selector: string, attribute: string): string | undefined {
          const val = $(selector).attr(attribute)?.trim();
          return val !== '' ? val : undefined;
        }

        const description =
          attr('meta[name=description]', 'content') ??
          attr('meta[property=og:description]', 'content');

        const lang = ($('html').attr('lang') ?? '').trim() || undefined;

        const canonical_url = attr('link[rel=canonical]', 'href');

        const author = attr('meta[name=author]', 'content');

        const published_at =
          attr('meta[property=article:published_time]', 'content') ??
          attr('meta[name=date]', 'content');

        const modified_at =
          attr('meta[property=article:modified_time]', 'content') ??
          attr('meta[name=last-modified]', 'content');

        const og_image = attr('meta[property=og:image]', 'content');

        const og_type = attr('meta[property=og:type]', 'content');

        const keywordsRaw = attr('meta[name=keywords]', 'content');
        const keywords = keywordsRaw
          ?.split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0);

        const headings = $('h1, h2, h3')
          .toArray()
          .map((el) => $(el).text().trim())
          .filter((t) => t.length > 0);

        const meta = {
          ...(description   !== undefined && { description }),
          ...(lang          !== undefined && { lang }),
          ...(canonical_url !== undefined && { canonical_url }),
          ...(author        !== undefined && { author }),
          ...(published_at  !== undefined && { published_at }),
          ...(modified_at   !== undefined && { modified_at }),
          ...(og_image      !== undefined && { og_image }),
          ...(og_type       !== undefined && { og_type }),
          ...(keywords      !== undefined && keywords.length > 0 && { keywords }),
          ...(headings.length > 0 && { headings }),
        };

        results.push({
          url: request.url,
          title,
          body,
          crawled_at: new Date().toISOString(),
          ...(Object.keys(meta).length > 0 && { metadata: meta }),
        });

        await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });
      },
    },
    config,
  );

  await crawler.run([startUrl]);
  return results;
}
