const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { URL } = require('url');

class Crawler {
  constructor(options = {}) {
    this.shouldFollow = options.shouldFollow || (() => true);
    // max number of pages to crawl
    this.maxPages = options.maxPages || 1000;
    this.concurrency = options.concurrency || 5;
    this.extractContent = options.extractContent || defaultExtractContent;

    this.visited = new Set();
    this.pages = new Map();
    this.outgoingLinks = new Map();
  }

  // fetches the html content of a url
  fetch(url) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'COMP4601-Crawler/1.0' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return this.fetch(redirectUrl).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  // crawls starting from the seed url using bfs
  async crawl(seedUrl, label) {
    this.visited.clear();
    this.pages.clear();
    this.outgoingLinks.clear();

    const queue = [seedUrl];
    let processed = 0;

    while (queue.length > 0 && processed < this.maxPages) {
      const batch = [];
      while (queue.length > 0 && batch.length < this.concurrency && (processed + batch.length) < this.maxPages) {
        const url = queue.shift();
        if (this.visited.has(url)) continue;
        this.visited.add(url);
        batch.push(url);
      }
      if (batch.length === 0) continue;

      await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const html = await this.fetch(url);
            const $ = cheerio.load(html);
            const title = $('title').text().trim() || '';

            // extract content (paragraph text)
            const content = this.extractContent($, url);

            // get all links on the page
            const links = [];
            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              if (!href) return;
              try {
                const abs = new URL(href, url).href.split('#')[0]; // remove fragment
                if (this.shouldFollow(abs) && !this.visited.has(abs)) {
                  links.push(abs);
                }
              } catch (e) {}
            });

            // deduplicate outgoing links
            const uniqueLinks = [...new Set(links)];

            this.pages.set(url, { title, content });
            this.outgoingLinks.set(url, uniqueLinks);

            for (const link of uniqueLinks) {
              if (!this.visited.has(link)) {
                queue.push(link);
              }
            }

            processed++;
            if (processed % 20 === 0) {
              console.log(`  [${label}] Crawled ${processed} pages, queue: ${queue.length}`);
            }
          } catch (err) {
            // silently skip failed pages
          }
        })
      );
    }

    console.log(`  [${label}] Crawl complete. ${processed} pages.`);
    return { pages: this.pages, outgoingLinks: this.outgoingLinks };
  }
}

// default: extract text from <p> tags, remove links
function defaultExtractContent($, url) {
  const $copy = cheerio.load($.html());
  $copy('a').remove();
  let text = '';
  $copy('p').each((_, el) => { text += ' ' + $copy(el).text(); });
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// for wiki pages: extract from article body paragraphs only
function wikiExtractContent($, url) {
  // wiki content is usually inside .mw-parser-output
  const $content = $('.mw-parser-output');
  if ($content.length === 0) return defaultExtractContent($, url);

  // remove navboxes, infoboxes, tables, edit links, references
  $content.find('.navbox, .infobox, table, .mw-editsection, .reflist, .reference, .toc, script, style').remove();
  $content.find('a').remove();

  let text = '';
  $content.find('p, li, dd').each((_, el) => { text += ' ' + $(el).text(); });
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { Crawler, defaultExtractContent, wikiExtractContent };
