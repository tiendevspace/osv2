import 'dotenv/config';
import { crawlUrl } from './services/crawler.js';
import { getAllTenants } from './config/tenants.js';

(async () => {
  const tenants = getAllTenants();
  console.log(JSON.stringify(tenants, null, 2));
})();


//const pages = await crawlUrl('https://squiz.net');
//console.log(JSON.stringify(pages, null, 2));
