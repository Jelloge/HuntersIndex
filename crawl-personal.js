const { MongoClient } = require('mongodb');
const { Crawler, wikiExtractContent } = require('./crawler');

const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'crawler-lab';

// only follow actual wiki article pages
function shouldFollowWiki(url) {
  if (!url.startsWith('https://terraria.wiki.gg/wiki/')) return false;

  // skip non-article pages
  const path = url.replace('https://terraria.wiki.gg/wiki/', '');
  const skipPrefixes = [
    'Special:', 'Talk:', 'User:', 'User_talk:',
    'File:', 'File_talk:', 'Template:', 'Template_talk:',
    'Category:', 'Category_talk:', 'Help:', 'Help_talk:',
    'Module:', 'Module_talk:', 'MediaWiki:', 'Terraria_Wiki:',
    'Legacy:', 'action=', 'oldid=',
  ];
  for (const prefix of skipPrefixes) {
    if (path.startsWith(prefix) || path.includes('?' + prefix)) return false;
  }

  // skip edit/history/diff urls
  if (url.includes('action=') || url.includes('oldid=') || url.includes('diff=')) return false;
  if (url.includes('/wiki/index.php')) return false;

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
    concurrency: 3, // being polite to wiki servers
    shouldFollow: shouldFollowWiki,
    extractContent: wikiExtractContent,
  });

  console.log('Crawling Terraria Wiki...');
  const { pages, outgoingLinks } = await crawler.crawl(
    'https://terraria.wiki.gg/wiki/Terraria_Wiki',
    'personal'
  );

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
