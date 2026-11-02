#!/usr/bin/env node
/*
 * test/compare.js: mallette against MALLET itself, on the same documents with the same seed.
 * MALLET's `import-file --keep-sequence --remove-stopwords` and `train-topics --num-threads 1`, then
 * mallette on the same file; the two compared word by word (the alphabet), token by token (the
 * topic assigned at the end), in alpha, beta and the topic keys, in the diagnostics file, and in
 * the topics inferred for new documents (infer-topics, with the same seed).
 *
 *   node test/compare.js <corpus.txt> [--topics 10] [--iterations 200] [--seed 7] [--optimize 20]
 *     [--infer new.txt] [--mallet ~/Projects/tools/mallet/bin/mallet]
 * --infer: the documents to infer topics for (the corpus itself by default).
 * corpus.txt: one document a line, as MALLET reads it: name, label, then the text.
 * Needs Java on the PATH (on macOS with Homebrew: /opt/homebrew/opt/openjdk/bin).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const M = require('../src/mallette.js');
const args = process.argv.slice(2);
function opt(k, d) { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }
const corpus = args[0];
if (!corpus) { console.error('node test/compare.js <corpus.txt> [--topics K] [--iterations N] [--seed S] [--optimize I]'); process.exit(1); }
const K = +opt('--topics', 10), N = +opt('--iterations', 200), S = +opt('--seed', 7), OPT = +opt('--optimize', 20), INFER = opt('--infer', corpus);
const IS = S;
// MALLET's command line reads a negative seed as a missing argument, and 0 as none (a seed drawn at random)
if (!(S > 0)) { console.error('--seed must be a positive integer: MALLET\'s command line takes no other'); process.exit(1); }
const MALLET = opt('--mallet', path.join(os.homedir(), 'Projects/tools/mallet/bin/mallet'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mallette-'));

// MALLET
function run(a) { cp.execFileSync(MALLET, a, { stdio: ['ignore', 'ignore', 'pipe'] }); }
const t0 = Date.now();
run(['import-file', '--input', corpus, '--output', path.join(tmp, 'c.mallet'), '--keep-sequence', '--remove-stopwords']);
run(['train-topics', '--input', path.join(tmp, 'c.mallet'), '--num-topics', String(K), '--num-iterations', String(N), '--random-seed', String(S),
  '--optimize-interval', String(OPT), '--num-threads', '1', '--output-state', path.join(tmp, 'state.gz'), '--output-topic-keys', path.join(tmp, 'keys.txt'),
  '--diagnostics-file', path.join(tmp, 'diag.xml'), '--inferencer-filename', path.join(tmp, 'inf.mallet')]);
const tMallet = Date.now() - t0;
run(['import-file', '--input', INFER, '--output', path.join(tmp, 'new.mallet'), '--use-pipe-from', path.join(tmp, 'c.mallet')]);
run(['infer-topics', '--inferencer', path.join(tmp, 'inf.mallet'), '--input', path.join(tmp, 'new.mallet'), '--output-doc-topics', path.join(tmp, 'inferred.txt'), '--random-seed', String(IS)]);
const malletDiag = fs.readFileSync(path.join(tmp, 'diag.xml'), 'utf8'), malletInferred = fs.readFileSync(path.join(tmp, 'inferred.txt'), 'utf8');
const state = zlib.gunzipSync(fs.readFileSync(path.join(tmp, 'state.gz'))).toString('utf8').split('\n');
const malletKeys = fs.readFileSync(path.join(tmp, 'keys.txt'), 'utf8');

// mallette, on the same lines: MALLET's line regex gives the name, the label and the text
const LINE = /^(\S*)[\s,]*(\S*)[\s,]*(.*)$/;
const docs = fs.readFileSync(corpus, 'utf8').split(/\r?\n/).filter(l => l.length).map(l => { const m = LINE.exec(l); return { name: m[1], text: m[3] }; });
const t1 = Date.now();
const model = new M.TopicModel(K, { seed: S, iterations: N, optimizeInterval: OPT });
model.addInstances(M.importDocs(docs));
model.estimate();
const tMallette = Date.now() - t1;

// compare
const alphaLine = state[1].replace('#alpha : ', '').trim().split(' ').map(Number), betaM = +state[2].replace('#beta : ', '');
let tokens = 0, same = 0, words = 0, firstDiff = null;
const mine = [];
model.data.forEach((d, di) => { for (let p = 0; p < d.tokens.length; p++) mine.push([di, p, d.tokens[p], model.alphabet.words[d.tokens[p]], d.topics[p]]); });
const theirs = state.slice(3).filter(Boolean).map(l => l.split(' ')).map(f => [+f[0], +f[2], +f[3], f[4], +f[5]]);
for (let i = 0; i < Math.max(mine.length, theirs.length); i++) {
  const a = mine[i], b = theirs[i];
  if (!a || !b) { if (!firstDiff) firstDiff = { i, mine: a, mallet: b }; continue; }
  tokens++;
  if (a[2] === b[2] && a[3] === b[3]) words++;
  if (a[4] === b[4]) same++; else if (!firstDiff) firstDiff = { i, mine: a, mallet: b };
}
const maxAlpha = Math.max(...alphaLine.map((a, k) => Math.abs(a - model.alpha[k])));
// the diagnostics and inference, line by line
function firstLineDiff(a, b) { const x = a.split('\n'), y = b.split('\n'); for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return { line: i + 1, mallet: x[i], mallette: y[i] }; return null; }
const myDiag = model.diagnosticsXML(20);
const newDocs = fs.readFileSync(INFER, 'utf8').split(/\r?\n/).filter(l => l.length).map(l => { const m = LINE.exec(l); return { name: m[1], text: m[3] }; });
const inf = model.inferencer(IS), myInferred = inf.docTopics(inf.infer(newDocs));
const report = {
  corpus: path.basename(corpus), documents: docs.length, types: model.numTypes, tokens: { mallet: theirs.length, mallette: mine.length },
  settings: { topics: K, iterations: N, seed: S, optimizeInterval: OPT },
  alphabetSame: words === tokens && mine.length === theirs.length,
  topicsSame: same + ' of ' + tokens + (same === tokens ? ' (all)' : ''),
  alphaMaxDifference: maxAlpha, beta: { mallet: betaM, mallette: model.beta },
  topicKeysSame: malletKeys.trim() === model.topicKeys(20).trim(),
  diagnosticsSame: myDiag === malletDiag, diagnosticsFirstDifference: firstLineDiff(malletDiag, myDiag),
  inferredSame: myInferred === malletInferred, inferredDocuments: newDocs.length, inferredFirstDifference: firstLineDiff(malletInferred, myInferred),
  firstDifference: firstDiff,
  ms: { mallet: tMallet, mallette: tMallette }
};
console.log(JSON.stringify(report, null, 1));
if (!report.topicKeysSame) { console.log('--- MALLET\n' + malletKeys.split('\n').slice(0, 3).join('\n') + '\n--- mallette\n' + model.topicKeys(20).split('\n').slice(0, 3).join('\n')); }
process.exit(report.alphabetSame && same === tokens && report.diagnosticsSame && report.inferredSame ? 0 : 1);
