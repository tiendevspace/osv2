import { CheerioCrawler, Configuration, EnqueueStrategy } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';
import type { RawPage } from '../types/domains.js';

export async function crawlUrl(startUrl: string): Promise<RawPage[]> {
  const results: RawPage[] = [];

  const config = new Configuration({ storageClient: new MemoryStorage() });

  const crawler = new CheerioCrawler(
    {
      maxCrawlDepth: 2,
      async requestHandler({ request, $, enqueueLinks }) {
        const title = $('title').text().trim();
        const body = $('p')
          .toArray()
          .map((el) => $(el).text().trim())
          .filter((text) => text.length > 0)
          .join(' ');

        results.push({
          url: request.url,
          title,
          body,
          crawled_at: new Date().toISOString(),
        });

        await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });
      },
    },
    config,
  );

  await crawler.run([startUrl]);
  return results;
}
