# Changelog: mallette

## 0.2.1 (2 November 2026)

- **Java's logarithm.** mallette carries fdlibm's `log`, which Java's `StrictMath.log` is and its `Math.log` gives (checked on 800 values with Java 27 on arm64), in place of JavaScript's `Math.log`. JavaScript's differs from it in the last bit for about one value in two thousand, and from one engine to another (node 22 and Chrome 152 differ), so a model trained in a browser and the same model trained in node could part on a long run, and either could part from MALLET. The tests made with 0.2.0 matched MALLET because none of them met such a value; with 0.2.1 the same model comes out of every engine, as MALLET's. `mallette.log` is the function.
- The Worker takes the diagnostics over MALLET's 20 top words (`diagnosticsWords`), however many words of each topic it sends back (`numWords`): coherence and exclusivity depend on the number.
- `highestOneBit` without `Math.log2`.
- `npm test`: 25 checks (Java's log on values where engines differ).

## 0.2.0 (2 November 2026)

- **Diagnostics**, as MALLET's `--diagnostics-file` (`TopicModelDiagnostics`): `model.diagnostics(n)` gives, for each topic, its tokens, document entropy, word length, coherence, distance from uniform and from the corpus, effective number of words, token–document difference, rank-1 documents, allocation ratio and count, and exclusivity, and for each of its top words the measures defined word by word; `model.diagnosticsXML(n)` writes MALLET's file. The same file, byte for byte, on every corpus and setting checked.
- **Inference** for new documents (`TopicInferencer`, `infer-topics`): `model.inferencer(seed).infer(docs, { iterations, thinning, burnin })`, and `docTopics(r)` for MALLET's output. The documents are imported as the model's were; words the model does not hold are passed over. The same proportions as MALLET's for the same seed, on MALLET's sample and on 500 documents of Webster's 1913 the model was not trained on.
- **Documents as tokens**: `importDocs` takes `{ name, tokens }` as well as text, for a bench that makes its own tokens (lower-cased and stopwords removed as text's are).
- **A model as data**: `model.toJSON()` and `mallette.inferencerFrom(data, seed)`.
- **A Web Worker**: `mallette.trainInWorker(docs, k, o)`, with progress and cancel, loading `src/mallette-worker.js`; it returns the result, the model as data, the topic keys and the diagnostics.
- **A test suite**, `npm test`, with no Java: MALLET's own outputs for its sample (`test/expected/`) compared byte for byte, and the rest checked; `test/worker.html` for the Worker. `test/compare.js` now compares the diagnostics file and inferred topics too (`--infer` for other documents), and refuses a seed that MALLET's command line cannot take (a negative one is read as missing).
- The README's count of word types in MALLET's sample corrected: 893, not 891.

## 0.1.0 (2 November 2026)

- MALLET 2.1.1's topic model (`ParallelTopicModel` on one thread, with hyperparameter optimisation) in JavaScript, the same topic for every token as MALLET for the same documents and seed; MALLET's import (token pattern, lower-casing, English stoplist); estimation straight through or in steps; MALLET's topic keys, document topics and state.
