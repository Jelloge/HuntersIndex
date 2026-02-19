const { MongoClient } = require('mongodb');
const { Crawler, defaultExtractContent } = require('./crawler');

const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'crawler-lab';

async function main() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);

  // check if already crawled
  const existing = await db.collection('fruitsA_pages').countDocuments();
  if (existing > 0) {
    console.log(`fruitsA already has ${existing} pages in DB. Skipping crawl.`);
    console.log('Drop the collection first if you want to recrawl:');
    console.log('  mongosh crawler-lab --eval "db.fruitsA_pages.drop()"');
    await client.close();
    return;
  }

  const crawler = new Crawler({
    maxPages: 200,
    concurrency: 5,
    shouldFollow: (url) => url.startsWith('https://people.scs.carleton.ca/~avamckenney/'),
    extractContent: defaultExtractContent,
  });

  console.log('Crawling fruitsA...');
  const { pages, outgoingLinks } = await crawler.crawl(
    'https://people.scs.carleton.ca/~avamckenney/fruitsA/N-0.html',
    'fruitsA'
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
    await db.collection('fruitsA_pages').insertMany(docs);
    console.log(`Saved ${docs.length} pages to fruitsA_pages.`);
  }

  await client.close();
}

main().catch(console.error);
