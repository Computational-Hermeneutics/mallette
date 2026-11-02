# mallette

**Author:** David M. Berry  
**Version:** 0.2.0  
**Date:** 2 November 2026  
**Licence:** Apache License 2.0 (see `LICENSE` and `NOTICE`)

MALLET's topic model, LDA with hyperparameter optimisation, translated into JavaScript so that it runs in a web browser (and in node) with no Java, no server and no installation. Given the same documents and the same random seed, mallette makes the same topic assignment for every token as MALLET 2.1.1 run with one thread, and so gives the same topics, the same hyperparameters and the same output files. It also writes MALLET's diagnostics of each topic, and infers the topics of new documents from a trained model as MALLET's `infer-topics` does, with the same results for the same seed.

It was written for [bench-kit](https://github.com/critical-code-studies/bench-kit), the shared modules of the critical code studies and digital humanities research benches (the [Melville](https://github.com/vector-humanities/melville) bench among them), where readers model the texts they are reading in the browser, beside the text, and a topic leads back to the passages it is drawn from.

## Why "mallette"

A *mallette* is French for a small case, a briefcase or attaché case: something made to be carried. The name says what the project is, MALLET packed so it can go where Java cannot, into a reader's web page. The French diminutive *-ette* also makes it a little mallet, the same tool at a smaller size, without MALLET's classifiers, sequence taggers and command line. And it keeps MALLET's name in plain view, so that anyone who finds mallette finds MALLET, the work it rests on, as well.

## Status

Checked against MALLET 2.1.1 (`import-file --keep-sequence --remove-stopwords`, then `train-topics --num-threads 1 --diagnostics-file`, and `infer-topics` on documents imported with `--use-pipe-from`) with `test/compare.js`:

| Corpus | Documents | Word types | Tokens | Topics | Iterations | Optimise every | Same topic assignments | Alpha, beta, topic keys | Diagnostics file | Inferred topics |
|---|---|---|---|---|---|---|---|---|---|---|
| MALLET's sample (web/en) | 12 | 893 | 1,245 | 3, 5, 8, 16, 20 | 50 to 1,000 | none, 10, 20 | all | identical | identical (0.2.0) | identical, the 12 documents (0.2.0) |
| Webster's 1913, in 40-line documents | 2,000 | 59,237 | 274,486 | 20 | 400 | 20 | all 274,486 | identical | | |
| Webster's 1913: 1,500 documents trained, 500 others inferred | 1,500 | 48,357 | 202,276 | 20 | 400 | 20 | all 202,276 | identical | identical (0.2.0) | identical, the 500 new documents (0.2.0) |

MALLET's command line takes only a positive `--random-seed`: a negative one is read as a missing argument, and nothing is written.

On the larger corpus, MALLET took 7.6 seconds (with Java's start-up and the import) and mallette 14.0 seconds in node.

## Use

In a page:

```html
<script src="mallette.js"></script>
<script>
  const model = new mallette.TopicModel(20, { seed: 7, iterations: 1000, optimizeInterval: 20 });
  model.addInstances(mallette.importDocs([{ name: 'ch1', text: '…' }, { name: 'ch2', text: '…' }]));
  const job = model.estimateAsync({
    progress: (i, of, llPerToken) => console.log(i, of, llPerToken),
    done: m => console.log(m.result(20))
  });
  // job.cancel() stops it between steps
</script>
```

In node: `const mallette = require('./src/mallette.js')`, then the same calls, or `model.estimate()` to run to the end at once. `mallette.train(docs, k, options)` does the import and the estimation in one call.

Options, as MALLET's `train-topics`: `alphaSum` (`--alpha`, 5.0), `beta` (`--beta`, 0.01), `seed` (`--random-seed`; none for a seed drawn at random), `iterations` (`--num-iterations`, 1000), `optimizeInterval` (`--optimize-interval`, 0), `burnin` (`--optimize-burn-in`, 200), `symmetricAlpha` (`--use-symmetric-alpha`). A document may be given as its own tokens (`{ name, tokens: [...] }`), where they have been made already; they are lower-cased and the stopwords taken out as text's are. The import's options, as `import-file`: `stopwords` (MALLET's built-in English list by default; a list of your own; or `false`), `extraStopwords`, `preserveCase`, `token` (a regular expression; MALLET's default `\p{L}[\p{L}\p{P}]+\p{L}`).

What comes back:
- `model.result(n)`: the topics (each with its alpha, its number of tokens and its top `n` words with their counts), each document's topic proportions, the documents' names and anything carried with them (`meta`), the hyperparameters, the settings and the log-likelihood per token.
- MALLET's own text formats: `model.topicKeys(n)` (`--output-topic-keys`), `model.docTopics()` (`--output-doc-topics`), and `model.state()` (`--output-state`, before it is gzipped).
- The diagnostics: `model.diagnostics(n)` as values (twelve measures for each topic, among them coherence, exclusivity, the effective number of words and document entropy, and for each of its top `n` words those defined word by word), and `model.diagnosticsXML(n)`, the `--diagnostics-file`.

Topics for new documents, from a trained model:

```js
const inf = model.inferencer(7);                     // the seed, as infer-topics' --random-seed
const r = inf.infer([{ name: 'new', text: '…' }]);   // imported as the model's documents were; words it does not hold are passed over
r.theta;                                             // each document's topic proportions
inf.docTopics(r);                                    // infer-topics' --output-doc-topics
```

Options, as `infer-topics`: `iterations` (`--num-iterations`, 100), `thinning` (`--sample-interval`, 10), `burnin` (`--burn-in`, 10). The model's counts are copied, so inference leaves the model as it was.

A model as data: `model.toJSON()` gives what inference needs as plain values (the words, the packed word–topic counts, the tokens in each topic, alpha and beta), for a file or to pass between threads; `mallette.inferencerFrom(data, seed)` makes an inferencer from it.

In a Web Worker, so that a long run leaves the page free:

```js
const job = mallette.trainInWorker(docs, 20, { seed: 7, optimizeInterval: 20, diagnostics: true, progress: (i, of) => {} });
job.promise.then(({ result, model, topicKeys, diagnostics }) => { /* model is toJSON()'s */ });
// job.cancel() stops it
```

It loads `mallette-worker.js` from beside `mallette.js` (or `workerURL`).

## Porting decisions

- **One thread.** MALLET's `ParallelTopicModel` divides the documents among threads and merges their counts after each iteration; with more than one thread its result depends on how the threads interleave. mallette follows the one-thread path (`WorkerCallable` as the only worker), which is the one that can be repeated exactly.
- **Java's random numbers.** MALLET draws from `cc.mallet.util.Randoms`, a subclass of `java.util.Random`. mallette reproduces Java's 48-bit linear congruential generator exactly: its seeding, `next(bits)`, `nextInt(bound)` with its rejection loop, and MALLET's `nextUniform()`. The 48-bit state is held as two 24-bit halves, so every product is exact in a JavaScript number. As in MALLET, the initial topics are drawn from one generator and the sampling from a second made from the same seed.
- **MALLET's data structures as they are.** Each word's topic counts are packed into integers (the topic in the low bits, the count above it) and kept in descending order. The order in which the sampler walks these arrays decides which topic a random number selects, so the packing, the bit masks and the bubbling of counts up and down are kept line for line, in typed arrays.
- **MALLET's arithmetic, including its quirks.** The series coefficients in MALLET's `digamma` are written `1/12`, `1/120` and so on, which Java evaluates as integer division, so each is zero and the function reduces to `log(z) - 1/(2z)` after its recurrence. mallette keeps this, since the hyperparameters, and every later assignment, depend on it. The flag that starts collecting statistics for hyperparameter optimisation is never turned off once set, as in MALLET.
- **The import.** MALLET's default token pattern, its lower-casing, and its built-in English stoplist (the 524 words of `TokenSequenceRemoveStopwords`, without the words for paper abstracts that are commented out in its source) are reproduced. Words enter the alphabet in the order first met. Documents are given as text rather than read from files; `test/compare.js` applies MALLET's line pattern (name, label, text) when it reads MALLET's input files.
- **Diagnostics and inference as MALLET has them.** `TopicModelDiagnostics` and `TopicInferencer` are translated line for line, quirks included: the diagnostics file escapes `<` as `&gt;`; a top word missing from a short topic is counted as word 0 in the co-document counts, as Java's default 0; inference starts each token at its word's most frequent topic and passes over words the model does not hold. Java's `%.4f` (the shortest decimal digits, rounded half up) is imitated, so the file matches byte for byte.
- **Steps that yield.** In a browser a long run must not stop the page. `estimateAsync` runs as many iterations as fit in about 40 milliseconds, then lets the page go on, reports progress and can be cancelled. The sequence of random numbers is the same as a run straight through.
- **Output formats.** Java's `NumberFormat` (at most five decimal places, grouping commas) for the topic keys and Java's `Double.toString` for the state file and the document–topic table are imitated, so the files can be read by tools that read MALLET's.
- **Left out.** Everything in MALLET that is not this topic model: classifiers, sequence models, other topic models (hierarchical LDA, PAM, the polylingual model), the command line and the binary formats. These are in MALLET, and mallette does not try to replace it.

## Plans

- **Evaluation** (`evaluate-topics`), the held-out likelihood of new documents.
- **States in and out**: reading a MALLET state file (`--input-state`) to continue or inspect a model trained with MALLET, and writing the gzipped state.
- **Iterated conditional modes** (`--num-icm-iterations`), the topic–document listing (`--output-topic-docs`), word–topic counts and topic–word weights.
- **Speed**, without changing a single assignment.
- **More in the test suite**: a larger public-domain corpus kept with its MALLET outputs, and the edge cases (empty documents, one-word documents).
- **bench-kit's topics module**, which uses mallette: documents defined by each bench (leaves, chapters, stages), models saved and published so that "topic 7" means the same thing to every reader, and views that lead from a topic back to its passages.
- **An npm package**, once the API has settled.

## Testing

`npm test` (`node test/run.js`) needs no Java: it compares mallette's state, topic keys, document topics, diagnostics and inferred topics with MALLET's own files for its sample (`test/expected/`), byte for byte, and checks the rest (the model as data, inference leaving the model as it was, estimation in steps). `test/worker.html`, opened from a local server, checks `trainInWorker` against a run in the page.

`test/compare.js` runs MALLET itself beside mallette, on any corpus and settings:

```bash
node test/compare.js test/corpora/mallet-web-en.txt --topics 5 --iterations 400 --seed 7 --optimize 20
node test/compare.js train.txt --topics 20 --seed 7 --optimize 20 --infer new.txt
```

It needs MALLET (by default at `~/Projects/tools/mallet/bin/mallet`, or `--mallet <path>`) and Java on the `PATH`. It reports whether the two agree on the alphabet, on every token's topic, on alpha, beta and the topic keys, on the diagnostics file and on the topics inferred (for the corpus itself, or for `--infer`), with the first difference if there is one, and exits with 1 if they do not agree.

## Credits

MALLET is the work of Andrew McCallum and many others at the University of Massachusetts Amherst; its `ParallelTopicModel`, the sparse sampler mallette translates, and its hyperparameter optimisation (after Hanna Wallach's methods) are David Mimno's. Cite MALLET as: McCallum, Andrew Kachites. "MALLET: A Machine Learning for Language Toolkit." 2002. <https://mimno.github.io/Mallet/>.

The Programming Historian's lesson, "Getting Started with Topic Modeling and MALLET", and Maria Antoniak's [little-mallet-wrapper](https://github.com/maria-antoniak/little-mallet-wrapper) shaped how mallette is meant to be used.
