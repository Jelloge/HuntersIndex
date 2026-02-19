const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const { buildIndex, search } = require('./search');
const { computePageRank } = require('./pagerank');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'crawler-lab';
const SERVER_NAME = process.env.SERVER_NAME || 'FrodoBilberry9534';

let db = null;

// in-memory data after loading from db
const datasetDocs = {};    // datasetName -> [{url, title, content, outgoingLinks, incomingLinks}]
const searchIndexes = {};  // datasetName -> index
const pageRanks = new Map(); // url -> pagerank value
const wordFreqs = {};      // datasetName -> { url -> { word: count } }

// serve static files for browser ui
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

//  Info endpoint (grading server)
app.get('/info', (req, res) => {
  res.json({ name: SERVER_NAME });
});

//  PageRank endpoint (lab 5 + A1)
app.get('/pageranks', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url parameter');
  const rank = pageRanks.get(url);
  if (rank === undefined) return res.status(404).send('URL not found');
  res.type('text/plain').send(rank.toString());
});

// Search endpoints
function handleSearch(datasetName) {
  return (req, res) => {
    try {
      const docs = datasetDocs[datasetName];
      const index = searchIndexes[datasetName];
      if (!docs || !index) {
        return res.status(404).json({ error: 'Dataset not found or not loaded yet' });
      }

      const q = req.query.q || req.query.phrase || '';
      const boost = req.query.boost === 'true';
      let limit = parseInt(req.query.limit) || 10;
      limit = Math.max(1, Math.min(50, limit));

      const results = search(q, index, docs, pageRanks, { boost, limit });

      // check if client wants json or html
      const wantsJSON = (req.headers.accept && req.headers.accept.includes('application/json'))
        || req.query.format === 'json'
        || !req.headers.accept
        || req.headers.accept === '*/*';

      if (wantsJSON) {
        return res.json({
          result: results.map(r => ({
            url: r.url,
            score: r.score,
            title: r.title,
            pr: r.pr,
          })),
        });
      }

      // html response for browser
      const resultsHtml = results.map((r, i) => `
        <div class="result">
          <h3>${i + 1}. <a href="${r.url}" target="_blank">${escapeHtml(r.title || r.url)}</a></h3>
          <p class="url">${escapeHtml(r.url)}</p>
          <p>Score: ${r.score.toFixed(6)} | PageRank: ${r.pr.toFixed(8)}</p>
          <p><a href="/${datasetName}/page/${encodeURIComponent(r.url)}">View page data</a></p>
        </div>
      `).join('');

      res.send(`
        <html><head><title>Search Results - ${datasetName}</title>
        <style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}
        .result{border-bottom:1px solid #ddd;padding:10px 0}.url{color:green;font-size:0.9em}</style>
        </head><body>
        <h1>Search: "${escapeHtml(q)}" in ${datasetName}</h1>
        <p>Boost: ${boost} | Limit: ${limit} | Results: ${results.length}</p>
        ${resultsHtml}
        <p><a href="/">Back to search</a></p>
        </body></html>
      `);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Search failed' });
    }
  };
}

app.get('/fruitsA', handleSearch('fruitsA'));
app.get('/personal', handleSearch('personal'));

// keep lab 3/4/5 compatibility
app.get('/tinyfruits', handleSearch('tinyfruits'));
app.get('/fruits100', handleSearch('fruits100'));

//  Page detail endpoints 
function handlePageDetail(datasetName) {
  return (req, res) => {
    try {
      const url = decodeURIComponent(req.params.encodedUrl);
      const docs = datasetDocs[datasetName];
      if (!docs) return res.status(404).json({ error: 'Dataset not found' });

      const doc = docs.find(d => d.url === url);
      if (!doc) return res.status(404).json({ error: 'Page not found' });

      const pr = pageRanks.get(url) || 0;
      const freqs = (wordFreqs[datasetName] && wordFreqs[datasetName][url]) || {};

      // sort word frequencies descending
      const sortedFreqs = Object.entries(freqs).sort((a, b) => b[1] - a[1]);

      const wantsJSON = (req.headers.accept && req.headers.accept.includes('application/json'))
        || req.query.format === 'json';

      if (wantsJSON) {
        return res.json({
          url: doc.url,
          title: doc.title,
          incomingLinks: doc.incomingLinks || [],
          outgoingLinks: doc.outgoingLinks || [],
          wordFrequencies: freqs,
          pageRank: pr,
        });
      }

      // html response
      const inHtml = (doc.incomingLinks || []).map(l => `<li><a href="/${datasetName}/page/${encodeURIComponent(l)}">${escapeHtml(l)}</a></li>`).join('');
      const outHtml = (doc.outgoingLinks || []).map(l => `<li><a href="/${datasetName}/page/${encodeURIComponent(l)}">${escapeHtml(l)}</a></li>`).join('');
      const freqHtml = sortedFreqs.slice(0, 50).map(([w, c]) => `<tr><td>${escapeHtml(w)}</td><td>${c}</td></tr>`).join('');

      res.send(`
        <html><head><title>${escapeHtml(doc.title)} - Page Data</title>
        <style>body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:20px}
        table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style>
        </head><body>
        <h1>${escapeHtml(doc.title)}</h1>
        <p><strong>URL:</strong> <a href="${doc.url}" target="_blank">${escapeHtml(doc.url)}</a></p>
        <p><strong>PageRank:</strong> ${pr.toFixed(8)}</p>
        <h2>Incoming Links (${(doc.incomingLinks || []).length})</h2>
        <ul>${inHtml || '<li>None</li>'}</ul>
        <h2>Outgoing Links (${(doc.outgoingLinks || []).length})</h2>
        <ul>${outHtml || '<li>None</li>'}</ul>
        <h2>Word Frequencies (top 50)</h2>
        <table><tr><th>Word</th><th>Count</th></tr>${freqHtml}</table>
        <p><a href="/">Back to search</a></p>
        </body></html>
      `);
    } catch (err) {
      console.error('Page detail error:', err);
      res.status(500).json({ error: 'Failed to load page data' });
    }
  };
}

app.get('/:datasetName/page/:encodedUrl', handlePageDetail);
// alternate route for lab 3 compat
app.get('/:datasetName/pages/:encodedUrl', handlePageDetail);

// Lab 3: popular pages 
app.get('/:datasetName/popular', (req, res) => {
  try {
    const docs = datasetDocs[req.params.datasetName];
    if (!docs) return res.status(404).json({ error: 'Dataset not found' });

    const sorted = [...docs]
      .sort((a, b) => (b.incomingLinks || []).length - (a.incomingLinks || []).length)
      .slice(0, 10);

    res.json({
      result: sorted.map(d => ({
        url: `/${req.params.datasetName}/page/${encodeURIComponent(d.url)}`,
        origUrl: d.url,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Helper 
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Data Loading
async function loadDataset(name) {
  const collection = db.collection(`${name}_pages`);
  const count = await collection.countDocuments();
  if (count === 0) {
    console.log(`[${name}] No data found in DB. Run the crawl script first.`);
    return;
  }

  console.log(`[${name}] Loading ${count} pages from DB...`);
  const docs = await collection.find({}).toArray();

  // compute incoming links from outgoing links if not already stored
  const incomingMap = new Map();
  for (const d of docs) {
    if (!incomingMap.has(d.url)) incomingMap.set(d.url, []);
    for (const target of (d.outgoingLinks || [])) {
      if (!incomingMap.has(target)) incomingMap.set(target, []);
      incomingMap.get(target).push(d.url);
    }
  }
  for (const d of docs) {
    if (!d.incomingLinks || d.incomingLinks.length === 0) {
      d.incomingLinks = incomingMap.get(d.url) || [];
    }
  }

  // store docs
  datasetDocs[name] = docs;

  // build search index
  console.log(`[${name}] Building search index...`);
  searchIndexes[name] = buildIndex(docs);

  // compute word frequencies for each page
  wordFreqs[name] = {};
  for (const d of docs) {
    const words = (d.content || '').split(/\s+/).filter(w => w.length > 0);
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    wordFreqs[name][d.url] = freq;
  }

  // compute pagerank
  console.log(`[${name}] Computing PageRank...`);
  const pages = new Map();
  const outgoing = new Map();
  for (const d of docs) {
    pages.set(d.url, { content: d.content, title: d.title });
    outgoing.set(d.url, d.outgoingLinks || []);
  }
  const pr = computePageRank(pages, outgoing);
  for (const [url, rank] of pr) {
    pageRanks.set(url, rank);
  }
  console.log(`[${name}] Ready. ${docs.length} pages indexed.`);
}

// Start 
async function main() {
  console.log('COMP 4601 Assignment 1 - Search Engine\n');

  const client = await MongoClient.connect(MONGO_URL);
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB.\n');

  // load all datasets
  const datasets = ['tinyfruits', 'fruits100', 'fruitsA', 'personal'];
  for (const name of datasets) {
    try {
      await loadDataset(name);
    } catch (err) {
      console.error(`[${name}] Error:`, err.message);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nServer listening on http://0.0.0.0:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET /info');
    console.log('  GET /fruitsA?q=...&boost=true|false&limit=N');
    console.log('  GET /personal?q=...&boost=true|false&limit=N');
    console.log('  GET /pageranks?url=...');
    console.log('  GET /:dataset/page/:url');
    console.log('  Browser UI: http://0.0.0.0:' + PORT + '/');
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
