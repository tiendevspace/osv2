import 'dotenv/config';
import { crawlUrl } from './services/crawler.js';

const pages = await crawlUrl('https://squiz.net');
console.log(JSON.stringify(pages, null, 2));
