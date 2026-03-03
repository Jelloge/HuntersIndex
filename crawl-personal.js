const { MongoClient } = require('mongodb');
const { Crawler, wikiExtractContent } = require('./crawler');

const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'crawler-lab';

// only follow actual wiki article pages on the Monster Hunter Wiki
function shouldFollowWiki(url) {
  if (!url.startsWith('https://monsterhunterwiki.org/wiki/')) return false;

  // skip non-article pages
  const path = url.replace('https://monsterhunterwiki.org/wiki/', '');
  const skipPrefixes = [
    'Special:', 'Talk:', 'User:', 'User_talk:',
    'File:', 'File_talk:', 'Template:', 'Template_talk:',
    'Category:', 'Category_talk:', 'Help:', 'Help_talk:',
    'Module:', 'Module_talk:', 'MediaWiki:',
    'Monster_Hunter_Wiki:', 'MHWiki:',
  ];
  for (const prefix of skipPrefixes) {
    if (path.startsWith(prefix) || path.includes('?' + prefix)) return false;
  }

  // skip edit/history/diff/redirect urls
  if (url.includes('action=') || url.includes('oldid=') || url.includes('diff=')) return false;
  if (url.includes('redirect=')) return false;
  if (url.includes('/wiki/index.php')) return false;

  // skip language-specific subpages (e.g., Page/es, Page/de, Page/yue, Page/zh-hans)
  if (/\/[a-z]{2,4}(-[a-z]{2,4})?$/.test(path) && path.includes('/')) return false;

  // skip any URL with query parameters (they're usually not article pages)
  if (url.includes('?')) return false;

  return true;
}

async function main() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);

  // check if already crawled
  const existing = await db.collection('personal_pages').countDocuments();
  if (existing > 0) {
    console.log(`personal already has ${existing} pages in DB. Skipping crawl.`);
    console.log('Drop the collection first if you want to recrawl:');
    console.log('  mongosh crawler-lab --eval "db.personal_pages.drop()"');
    await client.close();
    return;
  }

  const crawler = new Crawler({
    maxPages: 1000,
    concurrency: 1, // one at a time to avoid rate-limiting
    delay: 1000,     // 1s between requests to be polite
    shouldFollow: shouldFollowWiki,
    extractContent: wikiExtractContent,
  });

  // use multiple seed pages to ensure broad coverage (500+ pages)
  const seeds = [
    'https://monsterhunterwiki.org/wiki/Main_Page',
    'https://monsterhunterwiki.org/wiki/Monster_List',
    'https://monsterhunterwiki.org/wiki/Weapons',
    'https://monsterhunterwiki.org/wiki/Armor',
    'https://monsterhunterwiki.org/wiki/Games',
    'https://monsterhunterwiki.org/wiki/Skills',
    'https://monsterhunterwiki.org/wiki/Items',
    'https://monsterhunterwiki.org/wiki/Locations',
    'https://monsterhunterwiki.org/wiki/Quests',
    'https://monsterhunterwiki.org/wiki/Characters',
  ];

  console.log('Crawling Monster Hunter Wiki...');
  const { pages, outgoingLinks } = await crawler.crawl(seeds, 'personal');

  // compute incoming links
  const incomingLinks = new Map();
  for (const [from, links] of outgoingLinks) {
    for (const to of links) {
      if (!incomingLinks.has(to)) incomingLinks.set(to, []);
      incomingLinks.get(to).push(from);
    }
  }

  // save to mongodb
  const docs = [];
  for (const [url, data] of pages) {
    docs.push({
      url,
      title: data.title,
      content: data.content,
      outgoingLinks: outgoingLinks.get(url) || [],
      incomingLinks: incomingLinks.get(url) || [],
      incomingLinksCount: (incomingLinks.get(url) || []).length,
    });
  }

  if (docs.length > 0) {
    await db.collection('personal_pages').insertMany(docs);
    console.log(`Saved ${docs.length} pages to personal_pages.`);
  }

  await client.close();
}

main().catch(console.error);
