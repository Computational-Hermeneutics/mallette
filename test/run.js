#!/usr/bin/env node
/*
 * test/run.js: mallette's tests, with no Java needed. MALLET 2.1.1's own outputs on its sample
 * (test/expected/, made with --num-threads 1 --random-seed 7 --num-topics 5 --num-iterations 400
 * --optimize-interval 20, and infer-topics --random-seed 7 on the same documents) are compared
 * with mallette's, byte for byte; then the parts of mallette that MALLET does not write.
 *   node test/run.js        (npm test)
 * test/compare.js runs MALLET itself, on any corpus and settings.
 */
'use strict';
const fs = require('fs'), path = require('path');
const M = require('../src/mallette.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('✗ ' + name + '\n    got:  ' + JSON.stringify(got).slice(0, 300) + '\n    want: ' + JSON.stringify(want).slice(0, 300)); }
}
function same(name, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  const a = want.split('\n'), b = got.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log('✗ ' + name + ', line ' + (i + 1) + '\n    MALLET:   ' + a[i] + '\n    mallette: ' + b[i]); return; }
}
const ex = (f) => fs.readFileSync(path.join(__dirname, 'expected', f), 'utf8');
const LINE = /^(\S*)[\s,]*(\S*)[\s,]*(.*)$/;
const docs = fs.readFileSync(path.join(__dirname, 'corpora/mallet-web-en.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { const m = LINE.exec(l); return { name: m[1], text: m[3] }; });

// as MALLET 2.1.1 writes them
const model = M.train(docs, 5, { seed: 7, iterations: 400, optimizeInterval: 20 });
same('the state (every token\'s topic, alpha and beta)', model.state(), ex('web-en-k5-s7-state.txt'));
same('the topic keys', model.topicKeys(20), ex('web-en-k5-s7-keys.txt'));
same('the document topics', model.docTopics(), ex('web-en-k5-s7-doc-topics.txt'));
same('the diagnostics', model.diagnosticsXML(20), ex('web-en-k5-s7-diagnostics.xml'));
const inf = model.inferencer(7);
same('the topics inferred', inf.docTopics(inf.infer(docs)), ex('web-en-k5-s7-inferred.txt'));

// Java's %.nf
eq('%.4f, half up on the shortest digits', [M.javaFixed(0.00005, 4), M.javaFixed(1.00005, 4), M.javaFixed(2.5, 0), M.javaFixed(-0.00004, 4)], ['0.0001', '1.0001', '3', '-0.0000']);
eq('%.4f of NaN and infinity', [M.javaFixed(NaN, 4), M.javaFixed(Infinity, 4), M.javaFixed(-Infinity, 4)], ['NaN', 'Infinity', '-Infinity']);
eq('%.0f of a count', M.javaFixed(1234, 0), '1234');
eq('%.5f of a small number', M.javaFixed(1.234e-7, 5), '0.00000');

// what MALLET does not write
const r = model.result(10);
eq('the result: a row of proportions for each document, each summing to 1', r.theta.every((row) => Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-12), true);
eq('the result: ten words to a topic', r.topics.map((t) => t.words.length), [10, 10, 10, 10, 10]);
const D = model.diagnostics(20);
eq('the diagnostics as values: twelve measures, in MALLET\'s order', D.measures.map((m) => m.name), ['tokens', 'document_entropy', 'word-length', 'coherence', 'uniform_dist', 'corpus_dist', 'eff_num_words', 'token-doc-diff', 'rank_1_docs', 'allocation_ratio', 'allocation_count', 'exclusivity']);
eq('the diagnostics as values: every token counted', D.numTokens, model.totalTokens);
const again = M.train(docs, 5, { seed: 7, iterations: 400, optimizeInterval: 20 });
eq('the same seed, the same model', again.state() === model.state(), true);
const json = JSON.parse(JSON.stringify(model.toJSON()));
const inf2 = M.inferencerFrom(json, 7), inf3 = model.inferencer(7);
eq('the model as data: the same inference', inf2.docTopics(inf2.infer(docs)), inf3.docTopics(inf3.infer(docs)));
eq('the model as data: its kind and version', [json.kind, json.version], ['mallette-model', M.VERSION]);
const byTokens = M.importDocs([{ name: 'a', tokens: ['Whale', 'the', 'sea', 'whale'] }]);
eq('a document given as tokens: lower-cased, stopwords out, in order', byTokens.docs[0].tokens.length + ':' + byTokens.alphabet.words.join(' '), '3:whale sea');
const unseen = model.inferencer(3).infer([{ name: 'new', text: 'zyzzyva quokka xylophone' }]);
eq('a document of words the model does not hold: its tokens known, none', [unseen.docs[0].length, unseen.docs[0].known], [3, 0]);
eq('and its proportions the prior (alpha over its sum)', unseen.theta[0].map((x) => +x.toFixed(10)), Array.from(model.alpha).map((a) => +(a / model.alphaSum).toFixed(10)));
const before = model.typeTopicCounts.map((a) => Array.from(a)).join('|');
model.inferencer(5).infer(docs);
eq('inference leaves the model as it was', model.typeTopicCounts.map((a) => Array.from(a)).join('|'), before);
let steps = 0, finished = null;
const m2 = new M.TopicModel(5, { seed: 7, iterations: 400, optimizeInterval: 20 });
m2.addInstances(M.importDocs(docs));
const job = m2.estimateAsync({ ms: 5, progress: () => steps++, done: (m) => { finished = m; } });
const wait = setInterval(() => {
  if (!finished) return;
  clearInterval(wait);
  eq('in steps: the same model as straight through', finished.state() === model.state(), true);
  eq('in steps: progress reported', steps > 1, true);
  eq('cancel is there to call', typeof job.cancel, 'function');
  console.log((fail ? fail + ' of ' + (pass + fail) + ' failed' : 'All ' + pass + ' passed'));
  process.exit(fail ? 1 : 0);
}, 20);
