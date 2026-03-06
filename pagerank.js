// computes pagerank for a set of pages using power iteration
// alpha = 0.1, converge when euclidean distance < 0.0001

// there's a problem where pagerank doesn't properly compute the relevancy of the links, make sure to double check why

function computePageRank(pages, outgoingLinks) {
  const alpha = 0.1;
  const threshold = 0.0001;
  const urls = [...pages.keys()];
  const N = urls.length;
  const urlIndex = new Map();
  urls.forEach((url, i) => urlIndex.set(url, i));

  // adj[i][j] = probability of going from page i to page j
  // rows should sum to 1
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
    } else {
      // dangling node — no outgoing links so we spread rank to everyone equally
      // without this the row is all zeros and rank just disappears which messes everything up
      const weight = 1 / N;
      for (let j = 0; j < N; j++) {
        adj[i][j] = weight;
      }
    }
  }

  // power iteration
  // instead of building the full transition matrix M we just compute it inline
  // M[i][j] = (1 - alpha) * adj[i][j] + alpha / N
  // saves memory since we dont need two NxN matrices anymore
  const alphaOverN = alpha / N;
  const oneMinusAlpha = 1 - alpha;
  let x = new Float64Array(N).fill(1 / N);

  for (let iter = 0; iter < 1000; iter++) {
    const xNew = new Float64Array(N);

    // not 100% sure why this has to be [j][i] and not [i][j] but
    // it works because we want the sum of all pages that link TO page j
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += (oneMinusAlpha * adj[i][j] + alphaOverN) * x[i];
      }
      xNew[j] = sum;
    }

    // check if we've converged
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

  const result = new Map();
  for (let i = 0; i < N; i++) {
    result.set(urls[i], x[i]);
  }

  return result;
}

module.exports = { computePageRank };
