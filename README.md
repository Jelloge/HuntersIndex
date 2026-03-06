# HuntersIndex

Search engine for the Monster Hunter Wiki. Crawls, indexes, and ranks wiki pages using TF-IDF and PageRank, providing relevance-ranked search across monsters, weapons, armor, items, and more.

## Setup

### Prerequisites

- Node.js 18+
- MongoDB running locally on port 27017

### Installation

```bash
cd HuntersIndex
npm install
```

### Crawling

Crawl data must be stored in MongoDB before the server can start. Each script only crawls once — if data already exists it skips. Drop the collection to recrawl.

```bash
# Crawl the fruitsA test dataset (100 pages from Carleton)
node crawl-fruits.js

# Crawl the Monster Hunter Wiki (personal dataset)
node crawl-personal.js
```

To recrawl a dataset:
```bash
mongosh crawler-lab --eval "db.fruitsA_pages.drop()"
node crawl-fruits.js

mongosh crawler-lab --eval "db.personal_pages.drop()"
node crawl-personal.js
```

### Running the Server

```bash
node server.js
```

Server starts on `http://localhost:3000`. Open in a browser to use the search UI.

On startup the server loads all crawled pages from MongoDB into memory, builds TF-IDF indexes, computes word frequencies, computes PageRank, and persists PageRank values back to the database. This can take a moment for large datasets.

## Architecture

```
HuntersIndex/
  server.js           Express server, API endpoints, data loading
  search.js           TF-IDF index building and search with cosine similarity
  pagerank.js         PageRank computation via power iteration
  crawler.js          BFS web crawler with rate-limiting and retry logic
  crawl-fruits.js     Crawl script for fruitsA dataset
  crawl-personal.js   Crawl script for Monster Hunter Wiki
  public/
    index.html        Browser search UI
    bg.jpg            Background image
    fonts/            Custom fonts
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /info` | Server name (for grading server) |
| `GET /fruitsA?q=...&boost=true\|false&limit=N` | Search the fruitsA dataset |
| `GET /personal?q=...&boost=true\|false&limit=N` | Search the Monster Hunter Wiki |
| `GET /pageranks?url=...` | Get PageRank value for a URL |
| `GET /:dataset/page/:encodedUrl` | View page detail (links, word frequencies, PageRank) |
| `GET /:dataset/popular` | Top 10 pages by incoming link count |

All search endpoints return JSON when the `Accept: application/json` header is set or `format=json` query param is used, and HTML otherwise.

### Example

```bash
# JSON response
curl "http://localhost:3000/personal?q=rathalos&boost=true&limit=5" -H "Accept: application/json"

# Or use format param (works in any shell)
curl "http://localhost:3000/personal?q=rathalos&boost=true&limit=5&format=json"
```

## Algorithms

### Crawler (crawler.js)

- **BFS traversal** starting from one or more seed URLs
- Configurable `maxPages`, `concurrency`, and `delay` between batches
- Follows only URLs matching a `shouldFollow` filter (e.g., same domain, article pages only)
- Handles redirects, 429 rate-limiting with exponential backoff, and timeouts
- Extracts links before content extraction (content extraction mutates the DOM)
- Two content extractors: `defaultExtractContent` (generic) and `wikiExtractContent` (MediaWiki-aware)

### TF-IDF Search (search.js)

- **Term Frequency:** `TF(w,d) = count(w in d) / total_words(d)`
- **Inverse Document Frequency:** `IDF(w) = log2(N / (1 + df(w)))`, bounded >= 0
- **TF-IDF Weight:** `log2(1 + TF) x IDF` (log-smoothed TF to reduce the impact of very high raw counts)
- **Scoring:** Cosine similarity between query and document TF-IDF vectors, scaled by the document vector magnitude to preserve term-frequency signal
- **PageRank Boost:** When enabled, score is multiplied by `(1 + ln(1 + PR * N))`, which log-scales the normalized PageRank so that popular pages get a moderate boost without overwhelming TF-IDF relevance

### PageRank (pagerank.js)

Uses the standard power iteration method:

```
M = (1 - a) x A + (a / N) x J
```

Where `A` is the row-stochastic adjacency matrix (each row sums to 1 for non-dangling nodes), `a = 0.1` is the teleportation probability (10% chance of random jump), and `J` is the all-ones matrix. Iterates until the Euclidean distance between successive rank vectors falls below `0.0001`, or 1000 iterations max.

Only links to pages within the crawled dataset are included in the adjacency matrix (external links are filtered out).

## Datasets

### fruitsA
- **Source:** `https://people.scs.carleton.ca/~avamckenney/fruitsA/`
- **Max pages:** 200
- **Concurrency:** 5 parallel requests

### personal (Monster Hunter Wiki)
- **Source:** `https://monsterhunterwiki.org/wiki/`
- **Max pages:** 30,000
- **Concurrency:** 1 (sequential, with 1s delay to avoid rate-limiting)
- **Seed pages:** Main Page, Monster List, Weapons, Armor, Games, Skills, Items, Locations, Quests, Characters
- **Filters:** Only follows `/wiki/` article pages, skips Special/Talk/User/File/Template/Category pages, skips edit/history/diff URLs

## Dependencies

- **express** - Web server and routing
- **mongodb** - Database client for storing crawled pages
- **cheerio** - HTML parsing and DOM manipulation for the crawler
