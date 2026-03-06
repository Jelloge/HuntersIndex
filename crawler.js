const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { URL } = require('url');

class Crawler {
  constructor(options = {}) {
    this.shouldFollow = options.shouldFollow || (() => true);
    this.maxPages = options.maxPages || 40000;
    this.concurrency = options.concurrency || 5;
    this.extractContent = options.extractContent || defaultExtractContent;
    this.delay = options.delay || 0; // ms between batches

    this.visited = new Set();
    this.pages = new Map();
    this.outgoingLinks = new Map();
  }

  // fetches html from a url, retries on 429
  fetch(url, retries = 3) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COMP4601-Crawler/1.0)' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return this.fetch(redirectUrl, retries).then(resolve).catch(reject);
        }
        if (res.statusCode === 429 && retries > 0) {
          // rate limited, back off and retry
          const retryAfter = parseInt(res.headers['retry-after']) || (10 * (4 - retries));
          const waitMs = retryAfter * 1000;
          console.log(`    429 rate-limited, waiting ${retryAfter}s before retry... (${retries} left)`);
          res.resume();
          return setTimeout(() => {
            this.fetch(url, retries - 1).then(resolve).catch(reject);
          }, waitMs);
        }
        if (res.statusCode !== 200) {
          res.resume();
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

  // bfs crawl starting from seed url(s)
  async crawl(seedUrl, label) {
    this.visited.clear();
    this.pages.clear();
    this.outgoingLinks.clear();

    const seeds = Array.isArray(seedUrl) ? seedUrl : [seedUrl];
    const queue = [...seeds];
    let processed = 0;
    let failed = 0;

    while (queue.length > 0 && processed < this.maxPages) {
      const batch = [];
      while (queue.length > 0 && batch.length < this.concurrency && (processed + batch.length) < this.maxPages) {
        const url = queue.shift();
        if (this.visited.has(url)) continue;
        this.visited.add(url);
        batch.push(url);
      }
      if (batch.length === 0) continue;

      // wait between batches so we dont get rate limited
      if (processed > 0 && this.delay > 0) {
        await new Promise(r => setTimeout(r, this.delay));
      }

      await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const html = await this.fetch(url);
            const $ = cheerio.load(html);
            const title = $('title').text().trim() || '';

            // have to grab links BEFORE extractContent because it mutates the dom
            // spent way too long debugging this lol
            const allLinks = [];
            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              if (!href) return;
              try {
                const abs = new URL(href, url).href.split('#')[0];
                if (this.shouldFollow(abs)) {
                  allLinks.push(abs);
                }
              } catch (e) {}
            });

            const uniqueLinks = [...new Set(allLinks)];

            // now extract content (this removes <a> tags and stuff)
            const content = this.extractContent($, url);

            this.pages.set(url, { title, content });
            this.outgoingLinks.set(url, uniqueLinks);

            // add new links to the queue
            for (const link of uniqueLinks) {
              if (!this.visited.has(link)) {
                queue.push(link);
              }
            }

            processed++;
            if (processed % 20 === 0) {
              console.log(`  [${label}] Crawled ${processed} pages, queue: ${queue.length}, failed: ${failed}`);
            }
          } catch (err) {
            failed++;
            console.error(`  [${label}] Failed: ${url} - ${err.message}`);
          }
        })
      );
    }

    console.log(`  [${label}] Crawl complete. ${processed} pages crawled, ${failed} failed.`);
    return { pages: this.pages, outgoingLinks: this.outgoingLinks };
  }
}

// default content extractor — just grabs text from <p> tags
function defaultExtractContent($, url) {
  const $copy = cheerio.load($.html());
  $copy('a').remove();
  let text = '';
  $copy('p').each((_, el) => { text += ' ' + $copy(el).text(); });
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// wiki-specific extractor — targets .mw-parser-output and strips out navboxes etc
function wikiExtractContent($, url) {
  const $content = $('.mw-parser-output');
  if ($content.length === 0) return defaultExtractContent($, url);

  // get rid of all the wiki junk we dont want indexed
  $content.find('.navbox, .infobox, table, .mw-editsection, .reflist, .reference, .toc, script, style').remove();
  $content.find('a').remove();

  let text = '';
  $content.find('p, li, dd').each((_, el) => { text += ' ' + $(el).text(); });
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { Crawler, defaultExtractContent, wikiExtractContent };
