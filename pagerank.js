// computes pagerank for a set of pages using power iteration
// alpha = 0.1, converge when euclidean distance < 0.0001

function computePageRank(pages, outgoingLinks) {
  const alpha = 0.1;
  const threshold = 0.0001;

  // build url-to-index mapping
  const urls = [...pages.keys()];
  const N = urls.length;
  const urlIndex = new Map();
  urls.forEach((url, i) => urlIndex.set(url, i));

  // build adjacency matrix
  // adj[i][j] = probability of going from page i to page j
  const adj = Array.from({ length: N }, () => new Float64Array(N));

  for (let i = 0; i < N; i++) {
    const url = urls[i];
    const links = outgoingLinks.get(url) || [];

    // only count links to pages we actually crawled
    const validLinks = links.filter(l => urlIndex.has(l));

    if (validLinks.length > 0) {
      const weight = 1 / validLinks.length;
      for (const link of validLinks) {
        const j = urlIndex.get(link);
        adj[i][j] = weight;
      }
    }
  }

  // build transition matrix: M = (1-alpha)*adj + (alpha/N) for all entries
  const M = Array.from({ length: N }, () => new Float64Array(N));
  const alphaOverN = alpha / N;
  const oneMinusAlpha = 1 - alpha;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      M[i][j] = oneMinusAlpha * adj[i][j] + alphaOverN;
    }
  }

  // power iteration
  // x(t+1)[j] = sum over i of M[i][j] * x(t)[i]
  let x = new Float64Array(N).fill(1 / N);

  for (let iter = 0; iter < 1000; iter++) {
    const xNew = new Float64Array(N);

    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += M[i][j] * x[i];
      }
      xNew[j] = sum;
    }

    // euclidean distance
    let dist = 0;
    for (let i = 0; i < N; i++) {
      const diff = xNew[i] - x[i];
      dist += diff * diff;
    }
    dist = Math.sqrt(dist);

    x = xNew;

    if (dist < threshold) {
      console.log(`    Converged after ${iter + 1} iterations (dist=${dist.toExponential(4)})`);
      break;
    }
  }

  // build result map: url -> pagerank value
  const result = new Map();
  for (let i = 0; i < N; i++) {
    result.set(urls[i], x[i]);
  }

  return result;
}

module.exports = { computePageRank };
