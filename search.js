// builds a search index from an array of {url, content, title} documents
function buildIndex(docs) {
  const N = docs.length;
  const docWords = new Map(); // url -> [words]
  const df = new Map(); // word -> number of docs containing it

  for (const doc of docs) {
    const words = (doc.content || '').split(/\s+/).filter(w => w.length > 0);
    docWords.set(doc.url, words);

    const unique = new Set(words);
    for (const w of unique) {
      df.set(w, (df.get(w) || 0) + 1);
    }
  }

  // idf = log2(N / (1 + df)), bounded >= 0
  const idf = new Map();
  for (const [word, count] of df) {
    idf.set(word, Math.max(0, Math.log2(N / (1 + count))));
  }

  return { N, docWords, df, idf };
}

// search query, returns ranked results
function search(query, index, docs, pageRanks, options = {}) {
  const { boost = false, limit = 10 } = options;
  const { N, docWords, df, idf } = index;

  const allQueryWords = (query || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const totalQueryWords = allQueryWords.length;

  if (totalQueryWords === 0) {
    // no query so just return limit results with score 0
    return docs.slice(0, limit).map(d => ({
      url: d.url, score: 0, title: d.title, pr: pageRanks.get(d.url) || 0,
    }));
  }

  // filter out words not in any document, deduplicate
  const seen = new Set();
  const queryWords = [];
  for (const w of allQueryWords) {
    if (!seen.has(w) && df.has(w) && df.get(w) > 0) {
      seen.add(w);
      queryWords.push(w);
    }
  }

  if (queryWords.length === 0) {
    return docs.slice(0, limit).map(d => ({
      url: d.url, score: 0, title: d.title, pr: pageRanks.get(d.url) || 0,
    }));
  }

  // build query tfidf vector
  const queryVector = queryWords.map(qw => {
    let count = 0;
    for (const w of allQueryWords) { if (w === qw) count++; }
    const tf = count / totalQueryWords;
    return Math.log2(1 + tf) * (idf.get(qw) || 0);
  });

  // score each document
  const results = docs.map(d => {
    const words = docWords.get(d.url) || [];
    const totalWords = words.length || 1;

    // count how many times each query word appears in this doc
    const counts = new Map();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

    const docVector = queryWords.map(qw => {
      const c = counts.get(qw) || 0;
      if (c === 0) return 0;
      const tf = c / totalWords;
      return Math.log2(1 + tf) * (idf.get(qw) || 0);
    });

    // cosine similarity * magD
    // we multiply by magD because pure cosine gives 1.0 for every doc on single word queries
    // which doesnt really help rank anything. magD keeps the tf-idf weight in the score
    let dot = 0, magQ = 0, magD = 0;
    for (let i = 0; i < queryWords.length; i++) {
      dot += queryVector[i] * docVector[i];
      magQ += queryVector[i] * queryVector[i];
      magD += docVector[i] * docVector[i];
    }
    magQ = Math.sqrt(magQ);
    magD = Math.sqrt(magD);
    const cosine = (magQ === 0 || magD === 0) ? 0 : dot / (magQ * magD);
    let score = cosine * magD;

    // pagerank boost — log scale so high-pr pages dont just dominate everything
    // pr * N normalizes it so an average page is around 1, then log compresses the range
    const pr = pageRanks.get(d.url) || 0;
    if (boost && pr > 0) {
      score = score * (1 + Math.log(1 + pr * N));
    }

    return { url: d.url, score, title: d.title, pr };
  });

  // sort by score descending
  results.sort((a, b) => b.score - a.score);

  // return exactly limit results even if some have score 0
  return results.slice(0, limit);
}

module.exports = { buildIndex, search };
