/*
 * mallette-worker.js: mallette in a Web Worker, for mallette.trainInWorker(). Loads mallette.js from
 * beside it, estimates the model in steps (so that it can report its progress), and posts back the
 * result, the model as data (for inference in the page), the topic keys and, if asked, the
 * diagnostics. Part of mallette (Apache License 2.0; see LICENSE and NOTICE).
 */
/* global importScripts, mallette */
importScripts('mallette.js');
self.onmessage = function (e) {
  var m = e.data;
  if (m.type !== 'train') return;
  try {
    var o = m.o || {};
    if (o.token && o.token.source) o.token = new RegExp(o.token.source, o.token.flags);
    var model = new mallette.TopicModel(m.numTopics, o);
    model.addInstances(mallette.importDocs(m.docs, o));
    var of = model.numIterations, last = 0;
    while (model.iteration < of) {
      model.step();
      var now = Date.now();
      if (now - last > 100 || model.iteration === of) { last = now; self.postMessage({ type: 'progress', iteration: model.iteration, of: of }); }
    }
    var n = o.numWords || 20;
    self.postMessage({ type: 'done', result: model.result(n), model: model.toJSON(), topicKeys: model.topicKeys(n), diagnostics: o.diagnostics ? model.diagnostics(n) : null });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
