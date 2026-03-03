# COMP 4601 Assignment 1 - Demo Video Script (~12 minutes)

## Setup Before Recording

1. Make sure MongoDB is running
2. Make sure both datasets are crawled (fruitsA: 100 pages, personal: 1000 pages)
3. Start the server: `npm start`
4. Open browser to `http://localhost:3000`
5. Have a terminal open for showing curl commands
6. Have your code editor open with the project files

---

## PART 1: Introduction (~30 seconds)

**[SHOW: Browser with your search engine UI]**

> Hey, I'm [YOUR NAME], and this is my submission for Assignment 1. So basically I built a search engine — it crawls websites, indexes everything using TF-IDF, ranks pages with PageRank, and then you can search through it all with a web interface. I've got two datasets: the fruitsA site with 100 pages, and then for my personal site I crawled the Monster Hunter Wiki, which gave me about 1000 pages.

---

## PART 2: Crawler Design (~2.5 minutes)

**[SHOW: Open crawler.js in your editor]**

> So let me walk through how the crawler works. It's basically a BFS — I start with some seed URLs, throw them in a queue, and then process them in batches.

**[SHOW: The crawl method, lines ~57-134]**

> For each URL, I fetch the page, parse the HTML with Cheerio, and then I grab two things: the links on the page and the actual text content. One thing that tripped me up was the order I do this in — I have to grab the links FIRST, before I extract the content. The reason is that my content extractor strips out all the anchor tags to get cleaner text, so if I did content first, by the time I go to find links they'd all be gone.

**[SHOW: Lines 90-108 where links are extracted before content]**

> For the links, I just resolve them to absolute URLs, strip out any fragment identifiers, and then run them through a filter function that decides if they're worth following.

**[SHOW: The fetch method, lines ~21-54]**

> The fetcher also handles redirects and has retry logic for when the server rate limits you — like if you get a 429 back, it'll wait a bit and try again up to 3 times. That ended up being really important for the wiki crawl.

> Once I've got all the data — title, content, outgoing links — it all goes into MongoDB. Incoming links I actually compute later when the server loads, just by looking at everyone's outgoing links in reverse.

---

## PART 3: Personal Site - Monster Hunter Wiki (~2 minutes)

**[SHOW: Open crawl-personal.js in your editor]**

> So for my personal site I went with the Monster Hunter Wiki. I'm a pretty big fan of the series, and I figured it'd be a good pick because it's got tons of interconnected pages — monsters, weapons, armor, quests, locations — so the link graph is actually pretty interesting for PageRank.

**[SHOW: The seed URLs and shouldFollow function]**

> I gave it 10 seed URLs across different parts of the wiki — monster list, weapons, armor, that kind of thing — just so it doesn't get stuck in one corner. And then I've got this filter function that skips all the non-article stuff like Talk pages, User pages, Templates, Special pages, and so on. I also filter out language subpages and anything with query parameters since those aren't real articles.

> The biggest challenge was definitely rate limiting. The wiki gives you 429s if you hit it too fast, so I had to dial the concurrency down to 1 — just one request at a time — and add a 1 second delay between requests. It's slow, but it works. Ended up getting 1000 pages with barely any failures.

> For pulling out the actual content, I wrote a wiki-specific extractor. MediaWiki puts article content inside a `.mw-parser-output` div, so I target that, strip out all the navboxes and infoboxes and tables, and then just grab the text from paragraphs and list items. Way cleaner than trying to parse the whole page.

---

## PART 4: Search Scoring - TF-IDF (~2 minutes)

**[SHOW: Open search.js in your editor]**

> Alright, so for the actual searching I'm using TF-IDF with cosine similarity.

> When the server boots up, it builds an index from all the documents. Basically it goes through every page, splits the content into words, and figures out document frequency — like how many pages contain each word. Then the IDF is just log base 2 of N over 1 plus the DF. So words that show up everywhere get a really low weight, and rare words get a high weight.

**[SHOW: The search function, lines ~27-105]**

> When you actually search for something, I build a TF-IDF vector for the query and for each document. The TF part uses a log scale — log2 of 1 plus the term frequency — so that a document that mentions a word 100 times doesn't just dominate everything.

> Then I compute cosine similarity between the query vector and each doc vector. Cosine similarity is nice because it doesn't care about the length of the document — it's just measuring the angle between the vectors. Score of 1 means they match perfectly, 0 means no overlap at all.

> If you turn on the boost option, I multiply the score by the page's PageRank. So pages that are both relevant AND well-connected in the link graph get pushed up higher.

> And then I sort by score and return exactly however many results were requested — even if some have zero scores, since the spec says we have to return exactly that many.

---

## PART 5: PageRank (~1.5 minutes)

**[SHOW: Open pagerank.js in your editor]**

> For PageRank I used power iteration, which is pretty standard. The damping factor is 0.1 and it converges when the distance between iterations drops below 0.0001.

> The way it works is I build a transition matrix where each entry is the probability of going from one page to another. If a page has, say, 5 outgoing links, each one gets a 1/5 probability. Then I mix in the random surfer part — there's always a small alpha/N chance of jumping to any page at random, which handles dead ends and keeps things from getting stuck.

> Then I just iterate — start with every page having equal rank, multiply by the matrix, repeat until it stabilizes. Pages that have lots of incoming links from other important pages end up with higher ranks.

> After computing, I save the PageRank values back to MongoDB so they stick around between restarts.

---

## PART 6: RESTful Design (~1 minute)

**[SHOW: Open server.js in your editor]**

> For the server, I tried to keep it RESTful. You've got `/fruitsA` and `/personal` for searching, and then `/{dataset}/page/{url}` for looking at individual page data. The cool thing is it does content negotiation — if you send an Accept header asking for JSON, you get JSON back. Otherwise it gives you a nice HTML page. So the same endpoint works for both the browser UI and the grading server.

> There's also an `/info` endpoint that returns the server name for the distributed search service. And I added crash guards — uncaught exception handlers and Express error middleware — so even if something weird happens, the server doesn't just die.

---

## PART 7: Live Demo (~2 minutes)

**[SHOW: Browser at localhost:3000]**

### Demo 1: fruitsA search

> Alright, let me actually show it working. I'll start with fruitsA and search for "apple".

**[TYPE "apple" in search box, select fruitsA, click Hunt]**

> So we get 10 results, sorted by score. You can see the URL, the title, the TF-IDF score, and the PageRank for each one. Let me click "View page data" on the top result.

**[CLICK "View page data" on the first result]**

> This shows everything my search engine knows about this page — the incoming links, outgoing links, and word frequencies. You can see which words come up the most.

**[GO BACK, enable boost checkbox]**

> Now if I turn on PageRank boosting and search again...

**[SEARCH "apple" again with boost enabled]**

> You can see the scores changed. Some results might have reordered because now it's factoring in how well-connected each page is, not just how relevant the text is.

### Demo 2: Personal site search

> Let me switch over to the Monster Hunter Wiki and try "rathalos".

**[SELECT personal dataset, TYPE "rathalos", Search]**

> Nice, so we get results about Rathalos — the King of the Skies, basically one of the most iconic monsters in the franchise. You can see pages about the monster itself, its variants, weapons and armor crafted from it. Let me try a broader search like "elder dragon" with the limit set to 5.

**[CLEAR search, TYPE "elder dragon", CHANGE limit to 5, Search]**

> And we get exactly 5 results. Let me also show what the API looks like from the terminal.

**[SHOW: In terminal, run:]**
```
curl "http://localhost:3000/personal?q=rathalos&boost=true&limit=5" -H "Accept: application/json"
```

> This is the raw JSON that the distributed search service would get back. You can see the result array with url, score, title, and pr for each page — exactly matching the spec.

---

## PART 8: Critique (~1 minute)

> So to wrap up — what works well: the TF-IDF scoring gives pretty relevant results, PageRank boost is a nice touch for surfacing important pages, and the crawler handles real-world stuff like rate limiting and redirects without falling over.

> The main weakness is scalability. Right now I load everything into memory when the server starts, which is fine for 1000 pages, but if you had millions of pages you'd want an inverted index on disk, maybe something like Elasticsearch. The PageRank matrix is also dense, so it's O(N squared) in memory — a sparse representation would be way better for bigger graphs.

> If I had more time, I'd probably add stemming so that like "hunting" and "hunt" get treated as the same word. Phrase matching for multi-word queries would also be nice. And an inverted index would make lookups way faster instead of scanning every document.

> Anyway, that's my search engine. Thanks for watching.

---

## Recording Tips

1. Use OBS Studio or the Kaltura Personal Capture tool from Carleton
2. Share your screen and optionally show your webcam in a corner
3. Speak at a natural pace - don't rush
4. If you make a mistake, just keep going - it doesn't need to be perfect
5. Make sure the text on screen is readable (zoom in if needed)
6. Test that your audio is working before recording the full thing
7. Upload to Kaltura MediaSpace and set to "Unlisted"
