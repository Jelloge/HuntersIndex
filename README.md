# PurifiedGel
distributed search engine for calamity mod. crawls, indexes, and ranks over 1000 pages using TF-IDF and PageRank, giving players fast, relevance-ranked search across items, bosses, biomes, etc.

for mobile networking.

## Setup

### Prerequisites

- Node.js 18+
- MongoDB running locally on port 27017

### Installation

```bash
cd PurifiedGel
npm install
```

### Crawling

```bash
# Crawl the fruitsA dataset (100 pages)
node crawl-fruits.js

# Crawl the Calamity Mod Wiki (1000 pages)
node crawl-personal.js
```

### Running

```bash
node server.js
```

Server starts on `http://localhost:3000`. Open in a browser to use the search UI.

## Algorithms

### TF-IDF

- **Term Frequency:** `TF(w,d) = count(w in d) / total_words(d)`
- **Inverse Document Frequency:** `IDF(w) = log₂(N / (1 + df(w)))`
- **TF-IDF Weight:** `log₂(1 + TF) × IDF`
- **Similarity:** Cosine similarity between query and document vectors

### PageRank

Uses the standard power iteration method:

```
M = (1 - α) × A + (α / N) × J
```

Where `A` is the column-stochastic adjacency matrix, `α = 0.1` is the damping factor, and `J` is the all-ones matrix. Iterates until the Euclidean distance between successive vectors is below `0.0001`.
