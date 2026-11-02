/*
 * mallette: MALLET's topic model, LDA with hyperparameter optimisation, in the browser and in node.
 *
 * A translation into JavaScript of parts of MALLET 2.1.1, the MAchine Learning for LanguagE Toolkit
 * (https://github.com/mimno/Mallet): Copyright (C) 2002, 2003 University of Massachusetts Amherst,
 * Department of Computer Science, licensed under the Apache License, Version 2.0. Translated from
 * cc.mallet.topics.ParallelTopicModel and WorkerCallable (one thread), TopicModelDiagnostics and
 * TopicInferencer, cc.mallet.types.Dirichlet,
 * cc.mallet.util.Randoms (and java.util.Random beneath it), cc.mallet.classify.tui.Csv2Vectors
 * (its default tokens and lower-casing) and cc.mallet.pipe.TokenSequenceRemoveStopwords (its
 * built-in English list), and changed for JavaScript: one thread only; documents given as text
 * rather than read from files; asynchronous estimation in steps, with progress and a way to stop;
 * the outputs as values as well as MALLET's text formats; a model as plain data; a Web Worker
 * (mallette-worker.js). With the same documents and seed it means to make the same assignments as
 * `mallet train-topics --num-threads 1`, the same diagnostics file, and the same topics for new
 * documents as `infer-topics` (test/compare.js and test/run.js check).
 * mallette is licensed under the Apache License, Version 2.0 (LICENSE; NOTICE).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.mallette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var M = { VERSION: '0.2.0' };
  // MALLET's built-in English stoplist, as TokenSequenceRemoveStopwords holds it (524 entries; its commented-out
  // words for paper abstracts left out, as Java leaves them)
  var STOPLIST_EN = ['a','able','about','above','according','accordingly','across','actually','after','afterwards','again','against','all','allow','allows','almost','alone','along','already','also','although','always','am','among','amongst','an','and','another','any','anybody','anyhow','anyone','anything','anyway','anyways','anywhere','apart','appear','appreciate','appropriate','are','around','as','aside','ask','asking','associated','at','available','away','awfully','b','be','became','because','become','becomes','becoming','been','before','beforehand','behind','being','believe','below','beside','besides','best','better','between','beyond','both','brief','but','by','c','came','can','cannot','cant','cause','causes','certain','certainly','changes','clearly','co','com','come','comes','concerning','consequently','consider','considering','contain','containing','contains','corresponding','could','course','currently','d','definitely','described','despite','did','different','do','does','doing','done','down','downwards','during','e','each','edu','eg','eight','either','else','elsewhere','enough','entirely','especially','et','etc','even','ever','every','everybody','everyone','everything','everywhere','ex','exactly','example','except','f','far','few','fifth','first','five','followed','following','follows','for','former','formerly','forth','four','from','further','furthermore','g','get','gets','getting','given','gives','go','goes','going','gone','got','gotten','greetings','h','had','happens','hardly','has','have','having','he','hello','help','hence','her','here','hereafter','hereby','herein','hereupon','hers','herself','hi','him','himself','his','hither','hopefully','how','howbeit','however','i','ie','if','ignored','immediate','in','inasmuch','inc','indeed','indicate','indicated','indicates','inner','insofar','instead','into','inward','is','it','its','itself','j','just','k','keep','keeps','kept','know','knows','known','l','last','lately','later','latter','latterly','least','less','lest','let','like','liked','likely','little','look','looking','looks','ltd','m','mainly','many','may','maybe','me','mean','meanwhile','merely','might','more','moreover','most','mostly','much','must','my','myself','n','name','namely','nd','near','nearly','necessary','need','needs','neither','never','nevertheless','new','next','nine','no','nobody','non','none','noone','nor','normally','not','nothing','novel','now','nowhere','o','obviously','of','off','often','oh','ok','okay','old','on','once','one','ones','only','onto','or','other','others','otherwise','ought','our','ours','ourselves','out','outside','over','overall','own','p','particular','particularly','per','perhaps','placed','please','plus','possible','presumably','probably','provides','q','que','quite','qv','r','rather','rd','re','really','reasonably','regarding','regardless','regards','relatively','respectively','right','s','said','same','saw','say','saying','says','second','secondly','see','seeing','seem','seemed','seeming','seems','seen','self','selves','sensible','sent','serious','seriously','seven','several','shall','she','should','since','six','so','some','somebody','somehow','someone','something','sometime','sometimes','somewhat','somewhere','soon','sorry','specified','specify','specifying','still','sub','such','sup','sure','t','take','taken','tell','tends','th','than','thank','thanks','thanx','that','thats','the','their','theirs','them','themselves','then','thence','there','thereafter','thereby','therefore','therein','theres','thereupon','these','they','think','third','this','thorough','thoroughly','those','though','three','through','throughout','thru','thus','to','together','too','took','toward','towards','tried','tries','truly','try','trying','twice','two','u','un','under','unfortunately','unless','unlikely','until','unto','up','upon','us','use','used','useful','uses','using','usually','uucp','v','value','various','very','via','viz','vs','w','want','wants','was','way','we','welcome','well','went','were','what','whatever','when','whence','whenever','where','whereafter','whereas','whereby','wherein','whereupon','wherever','whether','which','while','whither','who','whoever','whole','whom','whose','why','will','willing','wish','with','within','without','wonder','would','would','x','y','yes','yet','you','your','yours','yourself','yourselves','z','zero'];

  // ---------- java.util.Random, and MALLET's Randoms on it ----------
  // A 48-bit linear congruential generator (multiplier 0x5DEECE66D, addend 0xB), its state held as
  // two 24-bit halves so that every product is exact in a double.
  var T24 = 16777216, MULT_HI = 0x5DE, MULT_LO = 0xECE66D;
  function JavaRandom(seed) {
    // new Random(long seed): (seed ^ 0x5DEECE66D) & (2^48 - 1); an int seed is sign-extended
    var s = (BigInt(seed) ^ 0x5DEECE66Dn) & 0xFFFFFFFFFFFFn;
    this.hi = Number(s >> 24n); this.lo = Number(s & 0xFFFFFFn);
  }
  // next(bits), as java.util.Random: the state times the multiplier, plus the addend, mod 2^48
  JavaRandom.prototype.next = function (bits) {
    var lo = this.lo, hi = this.hi;
    var p = lo * MULT_LO + 0xB, carry = Math.floor(p / T24);
    this.lo = p - carry * T24;
    this.hi = (hi * MULT_LO + lo * MULT_HI + carry) % T24;
    return Math.floor((this.hi * T24 + this.lo) / Math.pow(2, 48 - bits)) | 0;
  };
  // Random.nextInt(int bound)
  JavaRandom.prototype.nextInt = function (bound) {
    var r = this.next(31), m = bound - 1;
    if ((bound & m) === 0) return Math.floor(bound * r / 2147483648) | 0;
    for (var u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31)) { /* again */ }
    return r;
  };
  // Randoms.nextUniform(): ((long) next(26) << 27) + next(27), over 2^53
  JavaRandom.prototype.nextUniform = function () { return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992; };
  M.JavaRandom = JavaRandom;

  // ---------- documents into token sequences, as `mallet import-file --keep-sequence` ----------
  // MALLET's built-in English stoplist (TokenSequenceRemoveStopwords), used by --remove-stopwords
  M.STOPLIST = STOPLIST_EN;
  // the default token: a letter, then letters and punctuation, ending in a letter (Csv2Vectors)
  M.TOKEN = /\p{L}[\p{L}\p{P}]+\p{L}/gu;
  // An alphabet: each word an index, in the order first met
  function Alphabet() { this.map = new Map(); this.words = []; }
  Alphabet.prototype.lookup = function (w) { var i = this.map.get(w); if (i === undefined) { i = this.words.length; this.map.set(w, i); this.words.push(w); } return i; };
  Alphabet.prototype.size = function () { return this.words.length; };
  // the same alphabet, not grown: a word it does not hold is -1 (as MALLET gives a new word an index
  // past the model's types, which inference passes over)
  Alphabet.prototype.fixed = function () { var map = this.map; return { words: this.words, size: function () { return map.size; }, lookup: function (w) { var i = map.get(w); return i === undefined ? -1 : i; } }; };
  M.Alphabet = Alphabet;
  // docs: [{ name, text }] or [text], or [{ name, tokens }] with tokens made already; o.stopwords (a list; true for MALLET's, false for none: true by
  // default), o.extraStopwords, o.preserveCase, o.token (a RegExp with the g and u flags)
  M.importDocs = function (docs, o) {
    o = o || {};
    var alphabet = o.alphabet || new Alphabet(), stop = new Set();
    var list = o.stopwords === false ? [] : Array.isArray(o.stopwords) ? o.stopwords : M.STOPLIST;
    list.concat(o.extraStopwords || []).forEach(function (w) { stop.add(String(w).toLowerCase()); });
    var re = o.token || M.TOKEN;
    return {
      alphabet: alphabet, options: { stopwords: o.stopwords, extraStopwords: o.extraStopwords, preserveCase: o.preserveCase, token: o.token },
      docs: docs.map(function (d, i) {
        var text = typeof d === 'string' ? d : d.text || '', name = typeof d === 'string' ? 'doc' + i : (d.name != null ? String(d.name) : 'doc' + i);
        if (!o.preserveCase) text = text.toLowerCase();
        var out = [];
        // a document's own tokens (d.tokens), where a bench has made them, in place of the token pattern
        var toks = typeof d === 'object' && Array.isArray(d.tokens) ? d.tokens.map(function (t) { return o.preserveCase ? String(t) : String(t).toLowerCase(); }) : (text.match(new RegExp(re.source, re.flags)) || []);
        toks.forEach(function (t) { if (!stop.has(o.preserveCase ? t.toLowerCase() : t)) out.push(alphabet.lookup(t)); });
        return { name: name, tokens: Int32Array.from(out), meta: typeof d === 'object' ? d.meta : undefined };
      })
    };
  };

  // ---------- cc.mallet.types.Dirichlet, the parts LDA uses ----------
  var EULER_MASCHERONI = -0.5772156649015328606065121, HALF_LOG_TWO_PI = Math.log(2 * Math.PI) / 2;
  var DIGAMMA_SMALL = 0.000001, DIGAMMA_LARGE = 9.5;
  // MALLET's digamma. Its series coefficients are written 1/12, 1/120 … in Java's integer arithmetic,
  // so each is 0, and the series reduces to log(z) - 1/(2z); kept so, to make the same numbers.
  function digamma(z) {
    var psi = 0;
    if (z < DIGAMMA_SMALL) return EULER_MASCHERONI - (1 / z);
    while (z < DIGAMMA_LARGE) { psi -= 1 / z; z++; }
    var invZ = 1 / z;
    psi += Math.log(z) - 0.5 * invZ;
    return psi;
  }
  function logGammaStirling(z) {
    var shift = 0;
    while (z < 2) { z++; shift++; }
    var result = HALF_LOG_TWO_PI + (z - 0.5) * Math.log(z) - z + 1 / (12 * z) - 1 / (360 * z * z * z) + 1 / (1260 * z * z * z * z * z);
    while (shift > 0) { shift--; z--; result -= Math.log(z); }
    return result;
  }
  function learnSymmetricConcentration(countHistogram, observationLengths, numDimensions, currentValue) {
    var currentDigamma, largestNonZeroCount = 0, nonZeroLengthIndex = new Int32Array(observationLengths.length), index;
    for (index = 0; index < countHistogram.length; index++) if (countHistogram[index] > 0) largestNonZeroCount = index;
    var denseIndex = 0;
    for (index = 0; index < observationLengths.length; index++) if (observationLengths[index] > 0) nonZeroLengthIndex[denseIndex++] = index;
    var denseIndexSize = denseIndex;
    for (var iteration = 1; iteration <= 200; iteration++) {
      var currentParameter = currentValue / numDimensions;
      currentDigamma = 0;
      var numerator = 0;
      for (index = 1; index <= largestNonZeroCount; index++) {
        currentDigamma += 1.0 / (currentParameter + index - 1);
        numerator += countHistogram[index] * currentDigamma;
      }
      currentDigamma = 0;
      var denominator = 0, previousLength = 0, cachedDigamma = digamma(currentValue);
      for (denseIndex = 0; denseIndex < denseIndexSize; denseIndex++) {
        var length = nonZeroLengthIndex[denseIndex];
        if (length - previousLength > 20) currentDigamma = digamma(currentValue + length) - cachedDigamma;
        else for (index = previousLength; index < length; index++) currentDigamma += 1.0 / (currentValue + index);
        denominator += currentDigamma * observationLengths[length];
      }
      currentValue = currentParameter * numerator / denominator;
    }
    return currentValue;
  }
  function learnParameters(parameters, observations, observationLengths, shape, scale, numIterations) {
    var i, k, parametersSum = 0, oldParametersK, currentDigamma, denominator, nonZeroLimit, histogram;
    for (k = 0; k < parameters.length; k++) parametersSum += parameters[k];
    var nonZeroLimits = new Int32Array(observations.length).fill(-1);
    for (i = 0; i < observations.length; i++) {
      histogram = observations[i];
      for (k = 0; k < histogram.length; k++) if (histogram[k] > 0) nonZeroLimits[i] = k;
    }
    for (var iteration = 0; iteration < numIterations; iteration++) {
      denominator = 0; currentDigamma = 0;
      for (i = 1; i < observationLengths.length; i++) {
        currentDigamma += 1 / (parametersSum + i - 1);
        denominator += observationLengths[i] * currentDigamma;
      }
      denominator -= 1 / scale;
      parametersSum = 0;
      for (k = 0; k < parameters.length; k++) {
        nonZeroLimit = nonZeroLimits[k];
        oldParametersK = parameters[k];
        parameters[k] = 0;
        currentDigamma = 0;
        histogram = observations[k];
        for (i = 1; i <= nonZeroLimit; i++) {
          currentDigamma += 1 / (oldParametersK + i - 1);
          parameters[k] += histogram[i] * currentDigamma;
        }
        parameters[k] = oldParametersK * (parameters[k] + shape) / denominator;
        parametersSum += parameters[k];
      }
    }
    if (parametersSum < 0.0) throw new Error('sum: ' + parametersSum);
    return parametersSum;
  }
  M.dirichlet = { digamma: digamma, logGammaStirling: logGammaStirling, learnSymmetricConcentration: learnSymmetricConcentration, learnParameters: learnParameters };

  // ---------- cc.mallet.topics.ParallelTopicModel, with one WorkerCallable ----------
  // o: alphaSum (5), beta (0.01), seed (an int; MALLET's --random-seed; 0 or none: a seed drawn
  // here, as MALLET draws one), iterations (1000), optimizeInterval (0: none), burnin (200),
  // symmetricAlpha (false). As TopicTrainer: --alpha is the sum over topics.
  function TopicModel(numTopics, o) {
    o = o || {};
    this.alphaSum = o.alphaSum != null ? o.alphaSum : 5.0;
    this.beta = o.beta != null ? o.beta : 0.01;
    this.seed = o.seed ? o.seed | 0 : (Math.random() * 2147483647) | 0;
    this.numIterations = o.iterations != null ? o.iterations : 1000;
    this.burninPeriod = o.burnin != null ? o.burnin : 200;
    this.saveSampleInterval = 10;
    this.optimizeInterval = 0;
    this.setOptimizeInterval(o.optimizeInterval || 0);
    this.usingSymmetricAlpha = !!o.symmetricAlpha;
    this.setNumTopics(numTopics);
    this.iteration = 0;
  }
  TopicModel.prototype.setNumTopics = function (numTopics) {
    this.numTopics = numTopics;
    if (popcount(numTopics) === 1) { this.topicMask = numTopics - 1; this.topicBits = popcount(this.topicMask); }
    else { this.topicMask = highestOneBit(numTopics) * 2 - 1; this.topicBits = popcount(this.topicMask); }
    this.alpha = new Float64Array(numTopics).fill(this.alphaSum / numTopics);
    this.tokensPerTopic = new Int32Array(numTopics);
  };
  TopicModel.prototype.setOptimizeInterval = function (interval) {
    this.optimizeInterval = interval;
    if (this.saveSampleInterval > this.optimizeInterval) this.saveSampleInterval = this.optimizeInterval;
  };
  function popcount(n) { var c = 0; while (n) { c += n & 1; n >>>= 1; } return c; }
  function highestOneBit(n) { return n ? Math.pow(2, Math.floor(Math.log2(n))) : 0; }

  // corpus: from importDocs
  TopicModel.prototype.addInstances = function (corpus) {
    this.alphabet = corpus.alphabet;
    this.importOptions = corpus.options || {};
    this.numTypes = corpus.alphabet.size();
    this.betaSum = this.beta * this.numTypes;
    var random = new JavaRandom(this.seed), K = this.numTopics;
    this.data = corpus.docs.map(function (d) {
      var topics = new Int32Array(d.tokens.length);
      for (var p = 0; p < d.tokens.length; p++) topics[p] = random.nextInt(K);
      return { name: d.name, tokens: d.tokens, topics: topics, meta: d.meta };
    });
    this.buildInitialTypeTopicCounts();
    this.initializeHistograms();
  };
  // typeTopicCounts[type]: the topic in the low topicBits, the count above it, sorted by value, high first
  TopicModel.prototype.buildInitialTypeTopicCounts = function () {
    var numTypes = this.numTypes, K = this.numTopics, mask = this.topicMask, bits = this.topicBits, d, p;
    var typeTotals = this.typeTotals = new Int32Array(numTypes);
    this.tokensPerTopic = new Int32Array(K);
    for (d = 0; d < this.data.length; d++) { var tk = this.data[d].tokens; for (p = 0; p < tk.length; p++) typeTotals[tk[p]]++; }
    this.maxTypeCount = 0;
    var ttc = this.typeTopicCounts = new Array(numTypes);
    for (var type = 0; type < numTypes; type++) {
      if (typeTotals[type] > this.maxTypeCount) this.maxTypeCount = typeTotals[type];
      ttc[type] = new Int32Array(Math.min(K, typeTotals[type]));
    }
    for (d = 0; d < this.data.length; d++) {
      var tokens = this.data[d].tokens, topics = this.data[d].topics;
      for (p = 0; p < tokens.length; p++) {
        var topic = topics[p];
        this.tokensPerTopic[topic]++;
        var cur = ttc[tokens[p]], index = 0, currentTopic = cur[index] & mask;
        while (cur[index] > 0 && currentTopic !== topic) { index++; currentTopic = cur[index] & mask; }
        var currentValue = cur[index] >> bits;
        if (currentValue === 0) cur[index] = (1 << bits) + topic;
        else {
          var updated = ((currentValue + 1) << bits) + topic;
          while (index > 0 && updated > cur[index - 1]) { cur[index] = cur[index - 1]; index--; }
          cur[index] = updated;
        }
      }
    }
  };
  TopicModel.prototype.initializeHistograms = function () {
    var maxTokens = 0, total = 0;
    this.data.forEach(function (d) { if (d.tokens.length > maxTokens) maxTokens = d.tokens.length; total += d.tokens.length; });
    this.totalTokens = total;
    this.docLengthCounts = new Int32Array(maxTokens + 1);
    this.topicDocCounts = []; for (var t = 0; t < this.numTopics; t++) this.topicDocCounts.push(new Int32Array(maxTokens + 1));
  };

  // ---------- the worker (WorkerCallable, as the only thread) ----------
  TopicModel.prototype.startWorker = function () {
    var K = this.numTopics, len = this.docLengthCounts.length;
    this.w = {
      random: new JavaRandom(this.seed),   // a fresh generator from the same seed, as estimate() makes
      beta: this.beta, betaSum: this.beta * this.typeTopicCounts.length,
      cachedCoefficients: new Float64Array(K), localTopicCounts: new Int32Array(K), localTopicIndex: new Int32Array(K),
      topicTermScores: new Float64Array(K), shouldSaveState: false,
      docLengthCounts: new Int32Array(len), topicDocCounts: []
    };
    for (var t = 0; t < K; t++) this.w.topicDocCounts.push(new Int32Array(len));
  };
  TopicModel.prototype.sweep = function () {
    var w = this.w, alpha = this.alpha, tokensPerTopic = this.tokensPerTopic, K = this.numTopics;
    w.smoothingOnlyMass = 0;
    for (var topic = 0; topic < K; topic++) {
      w.smoothingOnlyMass += alpha[topic] * w.beta / (tokensPerTopic[topic] + w.betaSum);
      w.cachedCoefficients[topic] = alpha[topic] / (tokensPerTopic[topic] + w.betaSum);
    }
    var changed = 0;
    for (var doc = 0; doc < this.data.length; doc++) changed += this.sampleTopicsForOneDoc(this.data[doc]);
    return changed;
  };
  TopicModel.prototype.sampleTopicsForOneDoc = function (doc) {
    var x = this.w, K = this.numTopics, mask = this.topicMask, bits = this.topicBits;
    var alpha = this.alpha, tokensPerTopic = this.tokensPerTopic, typeTopicCounts = this.typeTopicCounts;
    var beta = x.beta, betaSum = x.betaSum, cachedCoefficients = x.cachedCoefficients;
    var localTopicCounts = x.localTopicCounts, localTopicIndex = x.localTopicIndex, topicTermScores = x.topicTermScores, random = x.random;
    var oneDocTopics = doc.topics, tokens = doc.tokens, docLength = tokens.length;
    var currentTypeTopicCounts, type, oldTopic, newTopic, position, topic, denseIndex;
    localTopicCounts.fill(0);
    for (position = 0; position < docLength; position++) localTopicCounts[oneDocTopics[position]]++;
    denseIndex = 0;
    for (topic = 0; topic < K; topic++) if (localTopicCounts[topic] !== 0) { localTopicIndex[denseIndex] = topic; denseIndex++; }
    var nonZeroTopics = denseIndex, topicBetaMass = 0.0;
    for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) {
      topic = localTopicIndex[denseIndex];
      var n = localTopicCounts[topic];
      topicBetaMass += beta * n / (tokensPerTopic[topic] + betaSum);
      cachedCoefficients[topic] = (alpha[topic] + n) / (tokensPerTopic[topic] + betaSum);
    }
    var topicTermMass = 0.0, i, score, changed = 0, index, currentTopic, currentValue, updatedCount;
    for (position = 0; position < docLength; position++) {
      type = tokens[position];
      oldTopic = oneDocTopics[position];
      currentTypeTopicCounts = typeTopicCounts[type];
      // remove this token from all counts
      x.smoothingOnlyMass -= alpha[oldTopic] * beta / (tokensPerTopic[oldTopic] + betaSum);
      topicBetaMass -= beta * localTopicCounts[oldTopic] / (tokensPerTopic[oldTopic] + betaSum);
      localTopicCounts[oldTopic]--;
      if (localTopicCounts[oldTopic] === 0) {
        denseIndex = 0;
        while (localTopicIndex[denseIndex] !== oldTopic) denseIndex++;
        while (denseIndex < nonZeroTopics) {
          if (denseIndex < localTopicIndex.length - 1) localTopicIndex[denseIndex] = localTopicIndex[denseIndex + 1];
          denseIndex++;
        }
        nonZeroTopics--;
      }
      tokensPerTopic[oldTopic]--;
      x.smoothingOnlyMass += alpha[oldTopic] * beta / (tokensPerTopic[oldTopic] + betaSum);
      topicBetaMass += beta * localTopicCounts[oldTopic] / (tokensPerTopic[oldTopic] + betaSum);
      cachedCoefficients[oldTopic] = (alpha[oldTopic] + localTopicCounts[oldTopic]) / (tokensPerTopic[oldTopic] + betaSum);
      // the type/topic counts: decrement the old topic, and score every topic
      index = 0;
      var alreadyDecremented = false;
      topicTermMass = 0.0;
      while (index < currentTypeTopicCounts.length && currentTypeTopicCounts[index] > 0) {
        currentTopic = currentTypeTopicCounts[index] & mask;
        currentValue = currentTypeTopicCounts[index] >> bits;
        if (!alreadyDecremented && currentTopic === oldTopic) {
          currentValue--;
          updatedCount = currentValue === 0 ? 0 : (currentValue << bits) + oldTopic;
          var subIndex = index;
          while (subIndex < currentTypeTopicCounts.length - 1 && updatedCount < currentTypeTopicCounts[subIndex + 1]) {
            currentTypeTopicCounts[subIndex] = currentTypeTopicCounts[subIndex + 1];
            subIndex++;
          }
          currentTypeTopicCounts[subIndex] = updatedCount;
          alreadyDecremented = true;
        } else {
          score = cachedCoefficients[currentTopic] * currentValue;
          topicTermMass += score;
          topicTermScores[index] = score;
          index++;
        }
      }
      var sample = random.nextUniform() * (x.smoothingOnlyMass + topicBetaMass + topicTermMass);
      newTopic = -1;
      if (sample < topicTermMass) {
        i = -1;
        while (sample > 0) { i++; sample -= topicTermScores[i]; }
        newTopic = currentTypeTopicCounts[i] & mask;
        currentValue = currentTypeTopicCounts[i] >> bits;
        updatedCount = ((currentValue + 1) << bits) + newTopic;
        while (i > 0 && updatedCount > currentTypeTopicCounts[i - 1]) { currentTypeTopicCounts[i] = currentTypeTopicCounts[i - 1]; i--; }
        currentTypeTopicCounts[i] = updatedCount;
      } else {
        sample -= topicTermMass;
        if (sample < topicBetaMass) {
          sample /= beta;
          for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) {
            topic = localTopicIndex[denseIndex];
            sample -= localTopicCounts[topic] / (tokensPerTopic[topic] + betaSum);
            if (sample <= 0.0) { newTopic = topic; break; }
          }
        } else {
          sample -= topicBetaMass;
          sample /= beta;
          newTopic = 0;
          sample -= alpha[newTopic] / (tokensPerTopic[newTopic] + betaSum);
          while (sample > 0.0) { newTopic++; sample -= alpha[newTopic] / (tokensPerTopic[newTopic] + betaSum); }
        }
        index = 0;
        while (currentTypeTopicCounts[index] > 0 && (currentTypeTopicCounts[index] & mask) !== newTopic) index++;
        if (currentTypeTopicCounts[index] === 0) currentTypeTopicCounts[index] = (1 << bits) + newTopic;
        else {
          currentValue = currentTypeTopicCounts[index] >> bits;
          updatedCount = ((currentValue + 1) << bits) + newTopic;
          while (index > 0 && updatedCount > currentTypeTopicCounts[index - 1]) { currentTypeTopicCounts[index] = currentTypeTopicCounts[index - 1]; index--; }
          currentTypeTopicCounts[index] = updatedCount;
        }
      }
      if (newTopic === -1) newTopic = K - 1;   // as MALLET, after its sampling-error message
      oneDocTopics[position] = newTopic;
      x.smoothingOnlyMass -= alpha[newTopic] * beta / (tokensPerTopic[newTopic] + betaSum);
      topicBetaMass -= beta * localTopicCounts[newTopic] / (tokensPerTopic[newTopic] + betaSum);
      localTopicCounts[newTopic]++;
      if (localTopicCounts[newTopic] === 1) {
        denseIndex = nonZeroTopics;
        while (denseIndex > 0 && localTopicIndex[denseIndex - 1] > newTopic) { localTopicIndex[denseIndex] = localTopicIndex[denseIndex - 1]; denseIndex--; }
        localTopicIndex[denseIndex] = newTopic;
        nonZeroTopics++;
      }
      tokensPerTopic[newTopic]++;
      cachedCoefficients[newTopic] = (alpha[newTopic] + localTopicCounts[newTopic]) / (tokensPerTopic[newTopic] + betaSum);
      x.smoothingOnlyMass += alpha[newTopic] * beta / (tokensPerTopic[newTopic] + betaSum);
      topicBetaMass += beta * localTopicCounts[newTopic] / (tokensPerTopic[newTopic] + betaSum);
      if (newTopic !== oldTopic) changed++;
    }
    if (x.shouldSaveState) {
      x.docLengthCounts[docLength]++;
      for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) { topic = localTopicIndex[denseIndex]; x.topicDocCounts[topic][localTopicCounts[topic]]++; }
    }
    for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) { topic = localTopicIndex[denseIndex]; cachedCoefficients[topic] = alpha[topic] / (tokensPerTopic[topic] + betaSum); }
    return changed;
  };

  // ---------- hyperparameters ----------
  TopicModel.prototype.optimizeAlpha = function () {
    var K = this.numTopics, x = this.w, t, c;
    this.docLengthCounts.fill(0);
    for (t = 0; t < this.topicDocCounts.length; t++) this.topicDocCounts[t].fill(0);
    for (c = 0; c < x.docLengthCounts.length; c++) if (x.docLengthCounts[c] > 0) { this.docLengthCounts[c] += x.docLengthCounts[c]; x.docLengthCounts[c] = 0; }
    for (t = 0; t < K; t++) {
      var into = this.usingSymmetricAlpha ? this.topicDocCounts[0] : this.topicDocCounts[t], src = x.topicDocCounts[t];
      for (c = 0; c < src.length; c++) if (src[c] > 0) { into[c] += src[c]; src[c] = 0; }
    }
    if (this.usingSymmetricAlpha) {
      this.alphaSum = learnSymmetricConcentration(this.topicDocCounts[0], this.docLengthCounts, K, this.alphaSum);
      for (t = 0; t < K; t++) this.alpha[t] = this.alphaSum / K;
    } else {
      try { this.alphaSum = learnParameters(this.alpha, this.topicDocCounts, this.docLengthCounts, 1.001, 1.0, 1); }
      catch (e) { this.alphaSum = K; for (t = 0; t < K; t++) this.alpha[t] = 1.0; }   // unstable on a very small corpus
    }
  };
  TopicModel.prototype.optimizeBeta = function () {
    var countHistogram = new Int32Array(this.maxTypeCount + 1), bits = this.topicBits, type, index;
    for (type = 0; type < this.numTypes; type++) {
      var counts = this.typeTopicCounts[type];
      index = 0;
      while (index < counts.length && counts[index] > 0) { countHistogram[counts[index] >> bits]++; index++; }
    }
    var maxTopicSize = 0, t;
    for (t = 0; t < this.numTopics; t++) if (this.tokensPerTopic[t] > maxTopicSize) maxTopicSize = this.tokensPerTopic[t];
    var topicSizeHistogram = new Int32Array(maxTopicSize + 1);
    for (t = 0; t < this.numTopics; t++) topicSizeHistogram[this.tokensPerTopic[t]]++;
    this.betaSum = learnSymmetricConcentration(countHistogram, topicSizeHistogram, this.numTypes, this.betaSum);
    this.beta = this.betaSum / this.numTypes;
    this.w.beta = this.beta; this.w.betaSum = this.betaSum;
  };

  // ---------- estimation ----------
  // one iteration of estimate()'s loop, single-threaded
  TopicModel.prototype.step = function () {
    if (!this.w) this.startWorker();
    var it = ++this.iteration;
    if (it > this.burninPeriod && this.optimizeInterval !== 0 && it % this.saveSampleInterval === 0) this.w.shouldSaveState = true;
    var changed = this.sweep();
    if (it > this.burninPeriod && this.optimizeInterval !== 0 && it % this.optimizeInterval === 0) { this.optimizeAlpha(); this.optimizeBeta(); }
    return changed;
  };
  TopicModel.prototype.estimate = function () { while (this.iteration < this.numIterations) this.step(); return this; };
  // in steps of about o.ms (40) milliseconds, between which the page goes on; o.progress(iteration,
  // of, logLikelihoodPerToken every tenth iteration), o.done(model); returns { cancel }
  TopicModel.prototype.estimateAsync = function (o) {
    o = o || {};
    var self = this, stopped = false, ms = o.ms || 40, later = typeof setTimeout === 'function' ? setTimeout : function (f) { f(); };
    (function run() {
      if (stopped) return;
      var t0 = Date.now();
      while (self.iteration < self.numIterations && Date.now() - t0 < ms) {
        self.step();
        if (o.progress && self.iteration % 10 === 0) o.progress(self.iteration, self.numIterations, self.modelLogLikelihood() / self.totalTokens);
      }
      if (self.iteration < self.numIterations) later(run, 0);
      else if (o.done) o.done(self);
    })();
    return { cancel: function () { stopped = true; } };
  };

  TopicModel.prototype.modelLogLikelihood = function () {
    var ll = 0.0, K = this.numTopics, alpha = this.alpha, topicCounts = new Int32Array(K), topicLogGammas = new Float64Array(K), t, d;
    for (t = 0; t < K; t++) topicLogGammas[t] = logGammaStirling(alpha[t]);
    for (d = 0; d < this.data.length; d++) {
      var docTopics = this.data[d].topics;
      for (var p = 0; p < docTopics.length; p++) topicCounts[docTopics[p]]++;
      for (t = 0; t < K; t++) if (topicCounts[t] > 0) ll += logGammaStirling(alpha[t] + topicCounts[t]) - topicLogGammas[t];
      ll -= logGammaStirling(this.alphaSum + docTopics.length);
      topicCounts.fill(0);
    }
    ll += this.data.length * logGammaStirling(this.alphaSum);
    var nonZeroTypeTopics = 0, bits = this.topicBits;
    for (var type = 0; type < this.numTypes; type++) {
      var tc = this.typeTopicCounts[type], index = 0;
      while (index < tc.length && tc[index] > 0) {
        nonZeroTypeTopics++;
        ll += logGammaStirling(this.beta + (tc[index] >> bits));
        if (!isFinite(ll)) return 0;
        index++;
      }
    }
    for (t = 0; t < K; t++) { ll -= logGammaStirling((this.beta * this.numTypes) + this.tokensPerTopic[t]); if (!isFinite(ll)) return 0; }
    ll += logGammaStirling(this.beta * this.numTypes) * K;
    ll -= logGammaStirling(this.beta) * nonZeroTypeTopics;
    return isFinite(ll) ? ll : 0;
  };

  // ---------- results ----------
  // each topic's words, by count, high first (ties: the later word first, as MALLET's IDSorter)
  TopicModel.prototype.sortedWords = function () {
    var out = [], K = this.numTopics, mask = this.topicMask, bits = this.topicBits, t;
    for (t = 0; t < K; t++) out.push([]);
    for (var type = 0; type < this.numTypes; type++) {
      var tc = this.typeTopicCounts[type], index = 0;
      while (index < tc.length && tc[index] > 0) { out[tc[index] & mask].push([type, tc[index] >> bits]); index++; }
    }
    out.forEach(function (l) { l.sort(function (a, b) { return b[1] - a[1] || b[0] - a[0]; }); });
    return out;
  };
  // { topics: [{ k, alpha, tokens, words: [[word, count]] }], theta: [[p]], docs: [{ name, meta }], alpha, beta, alphaSum, settings }
  TopicModel.prototype.result = function (numWords) {
    var self = this, n = numWords || 20, sw = this.sortedWords(), K = this.numTopics;
    var theta = this.data.map(function (d) {
      var c = new Int32Array(K), row = [];
      for (var p = 0; p < d.topics.length; p++) c[d.topics[p]]++;
      for (var t = 0; t < K; t++) row.push((self.alpha[t] + c[t]) / (d.topics.length + self.alphaSum));
      return row;
    });
    return {
      topics: sw.map(function (l, k) { return { k: k, alpha: self.alpha[k], tokens: self.tokensPerTopic[k], words: l.slice(0, n).map(function (x) { return [self.alphabet.words[x[0]], x[1]]; }) }; }),
      theta: theta,
      docs: this.data.map(function (d) { return { name: d.name, meta: d.meta, length: d.tokens.length }; }),
      alpha: Array.from(this.alpha), alphaSum: this.alphaSum, beta: this.beta,
      settings: { topics: K, seed: this.seed, iterations: this.iteration, optimizeInterval: this.optimizeInterval, burnin: this.burninPeriod, symmetricAlpha: this.usingSymmetricAlpha },
      logLikelihoodPerToken: this.modelLogLikelihood() / this.totalTokens
    };
  };

  // ---------- MALLET's text formats ----------
  // java.text.NumberFormat.getInstance() with at most 5 fraction digits (en: grouping commas, half-even)
  function numberFormat(x) {
    var s = roundHalfEven(x, 5).toFixed(5).replace(/\.?0+$/, '');
    var parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  function roundHalfEven(x, d) { var m = Math.pow(10, d), y = x * m, f = Math.floor(y), r = y - f; if (Math.abs(r - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / m; return Math.round(y) / m; }
  // Java's Double.toString, for the state file's alpha and beta, and doc-topics
  function javaDouble(x) {
    if (x === Math.floor(x) && Math.abs(x) < 1e7) return x.toFixed(1);
    var a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(x);
    var e = x.toExponential(), m = /^(-?[\d.]+)e([+-]\d+)$/.exec(e), mant = m[1].indexOf('.') < 0 ? m[1] + '.0' : m[1];
    return mant + 'E' + (+m[2]);
  }
  M.javaDouble = javaDouble;
  // --output-topic-keys
  TopicModel.prototype.topicKeys = function (numWords) {
    var self = this, sw = this.sortedWords(), n = numWords || 20;
    return sw.map(function (l, k) { return k + '\t' + numberFormat(self.alpha[k]) + '\t' + l.slice(0, n).map(function (x) { return self.alphabet.words[x[0]] + ' '; }).join('') + '\n'; }).join('');
  };
  // --output-doc-topics (MALLET's dense form)
  TopicModel.prototype.docTopics = function () {
    var self = this, K = this.numTopics;
    return this.data.map(function (d, i) {
      var c = new Int32Array(K), s = i + '\t' + (d.name != null ? d.name : 'no-name');
      for (var p = 0; p < d.topics.length; p++) c[d.topics[p]]++;
      for (var t = 0; t < K; t++) s += '\t' + javaDouble((self.alpha[t] + c[t]) / (d.topics.length + self.alphaSum));
      return s + '\n';
    }).join('');
  };
  // --output-state (before gzip)
  TopicModel.prototype.state = function () {
    var self = this, out = ['#doc source pos typeindex type topic\n#alpha : ' + Array.from(this.alpha).map(function (a) { return javaDouble(a) + ' '; }).join('') + '\n#beta : ' + javaDouble(this.beta) + '\n'];
    this.data.forEach(function (d, i) {
      var s = '';
      for (var p = 0; p < d.tokens.length; p++) s += i + ' NA ' + p + ' ' + d.tokens[p] + ' ' + self.alphabet.words[d.tokens[p]] + ' ' + d.topics[p] + '\n';
      out.push(s);
    });
    return out.join('');
  };


  // ---------- java.util.Formatter's %.nf (Locale.US) ----------
  // Java formats the double's shortest decimal digits, rounded half up at the place asked for
  function javaFixed(x, d) {
    if (x !== x) return 'NaN';
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    var neg = x < 0 || (x === 0 && 1 / x < 0), m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(Math.abs(x).toExponential());
    var digs = m[1] + (m[2] || ''), shift = +m[3] - (digs.length - 1) + d, n;
    if (shift >= 0) n = BigInt(digs) * (BigInt(10) ** BigInt(shift));
    else {
      var cut = digs.length + shift;
      if (cut < 0) n = BigInt(0);
      else { n = BigInt(digs.slice(0, cut) || '0'); if (digs.charAt(cut) >= '5') n += BigInt(1); }
    }
    var t = n.toString();
    while (t.length < d + 1) t = '0' + t;
    return (neg ? '-' : '') + (d ? t.slice(0, t.length - d) + '.' + t.slice(t.length - d) : t);
  }
  M.javaFixed = javaFixed;

  // ---------- cc.mallet.topics.TopicModelDiagnostics ----------
  // MALLET's --diagnostics-file: for each topic, the measures below, and for each of its top words
  // those that are defined word by word. numTopWords as --num-top-words (20).
  var DOC_PROPORTIONS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5], TWO_PERCENT_INDEX = 1, FIFTY_PERCENT_INDEX = 6;
  TopicModel.prototype.diagnostics = function (numTopWords) {
    var N = numTopWords || 20, K = this.numTopics, self = this, words = this.alphabet.words, sw = this.sortedWords();
    var tpt = this.tokensPerTopic, numTypes = this.numTypes, t, i, j;
    var topWords = sw.map(function (l) { var a = []; for (var x = 0; x < N; x++) a.push(x < l.length ? words[l[x][0]] : null); return a; });
    // collectDocumentStatistics
    var co = [], rank1 = new Int32Array(K), nonZero = new Int32Array(K), atProps = [], sumCLC = new Float64Array(K);
    var wordTypeCounts = new Int32Array(numTypes), numTokens = 0, topIdx = [], inOrder = [], docSets = [];
    for (t = 0; t < K; t++) {
      co.push(new Int32Array(N * N)); atProps.push(new Int32Array(DOC_PROPORTIONS.length));
      var set = new Set(), ord = new Int32Array(N);   // a missing word's index is Java's default, 0
      for (i = 0; i < N; i++) if (topWords[t][i] != null) { var ty = this.alphabet.map.get(topWords[t][i]); ord[i] = ty; set.add(ty); }
      topIdx.push(set); inOrder.push(ord); docSets.push(new Set());
    }
    var topicCounts = new Int32Array(K);
    this.data.forEach(function (doc) {
      var tokens = doc.tokens, topics = doc.topics, p;
      for (p = 0; p < tokens.length; p++) {
        var type = tokens[p], topic = topics[p];
        numTokens++; wordTypeCounts[type]++; topicCounts[topic]++;
        if (topIdx[topic].has(type)) docSets[topic].add(type);
      }
      var docLength = tokens.length;
      if (docLength > 0) {
        var maxTopic = -1, maxCount = -1;
        for (var topic2 = 0; topic2 < K; topic2++) {
          if (topicCounts[topic2] > 0) {
            nonZero[topic2]++;
            if (topicCounts[topic2] > maxCount) { maxTopic = topic2; maxCount = topicCounts[topic2]; }
            sumCLC[topic2] += topicCounts[topic2] * Math.log(topicCounts[topic2]);
            var proportion = (self.alpha[topic2] + topicCounts[topic2]) / (self.alphaSum + docLength);
            for (var q = 0; q < DOC_PROPORTIONS.length; q++) { if (proportion < DOC_PROPORTIONS[q]) break; atProps[topic2][q]++; }
            var supported = docSets[topic2], ix = inOrder[topic2], M2 = co[topic2];
            for (var a = 0; a < N; a++) {
              if (supported.has(ix[a])) {
                for (var b = a; b < N; b++) {
                  if (a === b) M2[a * N + a]++;
                  else if (supported.has(ix[b])) { M2[a * N + b]++; M2[b * N + a]++; }
                }
              }
            }
            docSets[topic2].clear(); topicCounts[topic2] = 0;
          }
        }
        if (maxTopic > -1) rank1[maxTopic]++;
      }
    });
    // the measures, in MALLET's order; words: a score for each of the top words where it is defined
    function S(name) { var w = []; for (var x = 0; x < K; x++) w.push(new Float64Array(N)); return { name: name, scores: new Float64Array(K), words: w, wordScores: false }; }
    var list = [];
    var tok = S('tokens'); for (t = 0; t < K; t++) tok.scores[t] = tpt[t]; list.push(tok);
    var ent = S('document_entropy'); for (t = 0; t < K; t++) ent.scores[t] = -sumCLC[t] / tpt[t] + Math.log(tpt[t]); list.push(ent);
    var wl = S('word-length'); wl.wordScores = true;
    for (t = 0; t < K; t++) { var total = 0; for (i = 0; i < N; i++) { if (topWords[t][i] == null) break; total += topWords[t][i].length; wl.words[t][i] = topWords[t][i].length; } wl.scores[t] = total / N; }
    list.push(wl);
    var coh = S('coherence'); coh.wordScores = true;
    for (t = 0; t < K; t++) {
      var mx = co[t], ts = 0;
      for (var row = 0; row < N; row++) {
        var rs = 0, mn = 0;
        for (var col = 0; col < row; col++) { var sc = Math.log((mx[row * N + col] + self.beta) / (mx[col * N + col] + self.beta)); rs += sc; if (sc < mn) mn = sc; }
        ts += rs; coh.words[t][row] = mn;
      }
      coh.scores[t] = ts;
    }
    list.push(coh);
    var uni = S('uniform_dist'); uni.wordScores = true;
    for (t = 0; t < K; t++) { var u = 0; sw[t].forEach(function (x, pos) { var c = x[1], sc2 = (c / tpt[t]) * Math.log((c * numTypes) / tpt[t]); if (pos < N) uni.words[t][pos] = sc2; u += sc2; }); uni.scores[t] = u; }
    list.push(uni);
    var cor = S('corpus_dist'); cor.wordScores = true;
    for (t = 0; t < K; t++) { var coef = numTokens / tpt[t], cs = 0; sw[t].forEach(function (x, pos) { var c = x[1], sc3 = (c / tpt[t]) * Math.log(coef * c / wordTypeCounts[x[0]]); if (pos < N) cor.words[t][pos] = sc3; cs += sc3; }); cor.scores[t] = cs; }
    list.push(cor);
    var eff = S('eff_num_words');
    for (t = 0; t < K; t++) { var ss = 0; sw[t].forEach(function (x) { var pr = x[1] / tpt[t]; ss += pr * pr; }); eff.scores[t] = 1.0 / ss; }
    list.push(eff);
    var tdd = S('token-doc-diff'); tdd.wordScores = true;
    for (t = 0; t < K; t++) {
      var wd = new Float64Array(N), dd = new Float64Array(N), wsum = 0, dsum = 0, pos2 = 0, tsc = 0;
      while (pos2 < sw[t].length && pos2 < N) { wd[pos2] = sw[t][pos2][1]; dd[pos2] = co[t][pos2 * N + pos2]; wsum += wd[pos2]; dsum += dd[pos2]; pos2++; }
      for (pos2 = 0; pos2 < N; pos2++) {
        var pp = wd[pos2] / wsum, qq = dd[pos2] / dsum, mean = 0.5 * (pp + qq), sc4 = 0.0;
        if (pp > 0) sc4 += 0.5 * pp * Math.log(pp / mean);
        if (qq > 0) sc4 += 0.5 * qq * Math.log(qq / mean);
        tdd.words[t][pos2] = sc4; tsc += sc4;
      }
      tdd.scores[t] = tsc;
    }
    list.push(tdd);
    var r1 = S('rank_1_docs'); for (t = 0; t < K; t++) r1.scores[t] = rank1[t] / nonZero[t]; list.push(r1);
    var ar = S('allocation_ratio'); for (t = 0; t < K; t++) ar.scores[t] = atProps[t][FIFTY_PERCENT_INDEX] / atProps[t][TWO_PERCENT_INDEX]; list.push(ar);
    var ac = S('allocation_count'); for (t = 0; t < K; t++) ac.scores[t] = atProps[t][5] / nonZero[t]; list.push(ac);
    var ex = S('exclusivity'); ex.wordScores = true;
    var sumDefault = 0.0; for (t = 0; t < K; t++) sumDefault += self.beta / (self.betaSum + tpt[t]);
    for (t = 0; t < K; t++) {
      var xs = 0, pos3 = 0;
      for (j = 0; j < sw[t].length; j++) {
        var type3 = sw[t][j][0], cnt = sw[t][j][1], sumType = sumDefault, tc = self.typeTopicCounts[type3], k3 = 0;
        while (k3 < tc.length && tc[k3] > 0) { sumType += (tc[k3] >> self.topicBits) / (self.betaSum + tpt[tc[k3] & self.topicMask]); k3++; }
        var sc5 = ((self.beta + cnt) / (self.betaSum + tpt[t])) / sumType;
        ex.words[t][pos3] = sc5; xs += sc5; pos3++;
        if (pos3 === N) break;
      }
      ex.scores[t] = xs / N;
    }
    list.push(ex);
    return {
      numTopWords: N, measures: list, numTokens: numTokens,
      topics: sw.map(function (l, topic) {
        var out = { topic: topic, scores: {}, words: [] }, cum = 0;
        list.forEach(function (m) { out.scores[m.name] = m.scores[topic]; });
        for (var r = 0; r < Math.min(N, l.length); r++) {
          var prob = l[r][1] / tpt[topic], w = { rank: r + 1, word: words[l[r][0]], count: l[r][1], prob: prob, cumulative: (cum += prob), docs: co[topic][r * N + r], scores: {} };
          list.forEach(function (m) { if (m.wordScores) w.scores[m.name] = m.words[topic][r]; });
          out.words.push(w);
        }
        return out;
      })
    };
  };
  // the --diagnostics-file, as MALLET writes it (TopicTrainer prints toXML() with println)
  TopicModel.prototype.diagnosticsXML = function (numTopWords) {
    var D = this.diagnostics(numTopWords), out = ['<?xml version="1.0" encoding="UTF-8"?>\n<model>\n'];
    D.topics.forEach(function (T) {
      var s = "<topic id='" + T.topic + "'";
      D.measures.forEach(function (m) { s += ' ' + m.name + "='" + javaFixed(T.scores[m.name], 4) + "'"; });
      s += '>\n';
      T.words.forEach(function (w) {
        s += "<word rank='" + w.rank + "' count='" + javaFixed(w.count, 0) + "' prob='" + javaFixed(w.prob, 5) + "' cumulative='" + javaFixed(w.cumulative, 5) + "' docs='" + w.docs + "'";
        D.measures.forEach(function (m) { if (m.wordScores) s += ' ' + m.name + "='" + javaFixed(w.scores[m.name], 4) + "'"; });
        s += '>' + w.word.replace(/&/g, '&amp;').replace(/</g, '&gt;') + '</word>\n';   // MALLET's own escape, < as &gt;
      });
      out.push(s + '</topic>\n');
    });
    return out.join('') + '</model>\n\n';
  };

  // ---------- cc.mallet.topics.TopicInferencer ----------
  // A trained model applied to new documents: their topic proportions, the model's word-topic
  // counts held fixed (MALLET's infer-topics). The model's counts are copied, so the model can
  // go on being used. seed as infer-topics' --random-seed (none: one drawn here).
  function Inferencer(model, seed) {
    var K = this.numTopics = model.numTopics;
    this.topicMask = model.topicMask; this.topicBits = model.topicBits;
    this.typeTopicCounts = model.typeTopicCounts.map(function (a) { return Int32Array.from(a); });
    this.numTypes = this.typeTopicCounts.length;
    this.tokensPerTopic = Int32Array.from(model.tokensPerTopic);
    this.alpha = Float64Array.from(model.alpha); this.beta = model.beta; this.betaSum = model.betaSum;
    this.alphabet = model.alphabet; this.importOptions = model.importOptions || {};
    this.smoothingOnlyMass = 0.0; this.cachedCoefficients = new Float64Array(K);
    for (var topic = 0; topic < K; topic++) {
      this.smoothingOnlyMass += this.alpha[topic] * this.beta / (this.tokensPerTopic[topic] + this.betaSum);
      this.cachedCoefficients[topic] = this.alpha[topic] / (this.tokensPerTopic[topic] + this.betaSum);
    }
    this.setRandomSeed(seed);
  }
  Inferencer.prototype.setRandomSeed = function (seed) { this.random = new JavaRandom(seed ? seed | 0 : (Math.random() * 2147483647) | 0); };
  // getSampledDistribution: tokens (the model's type indices; -1 for a word it does not hold)
  Inferencer.prototype.sampledDistribution = function (tokens, numIterations, thinning, burnIn) {
    var K = this.numTopics, mask = this.topicMask, bits = this.topicBits, numTypes = this.numTypes, ttc = this.typeTopicCounts;
    var alpha = this.alpha, beta = this.beta, betaSum = this.betaSum, tpt = this.tokensPerTopic, cc = this.cachedCoefficients, random = this.random;
    var docLength = tokens.length, topics = new Int32Array(docLength), local = new Int32Array(K), localIndex = new Int32Array(K);
    var type, position, topic, cur, denseIndex, i;
    function known(t) { return t >= 0 && t < numTypes && ttc[t].length !== 0; }
    for (position = 0; position < docLength; position++) {
      type = tokens[position];
      if (known(type)) { topics[position] = ttc[type][0] & mask; local[topics[position]]++; }
    }
    denseIndex = 0;
    for (topic = 0; topic < K; topic++) if (local[topic] !== 0) { localIndex[denseIndex] = topic; denseIndex++; }
    var nonZeroTopics = denseIndex, topicBetaMass = 0.0;
    for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) {
      topic = localIndex[denseIndex];
      var n = local[topic];
      topicBetaMass += beta * n / (tpt[topic] + betaSum);
      cc[topic] = (alpha[topic] + n) / (tpt[topic] + betaSum);
    }
    var topicTermScores = new Float64Array(K), result = new Float64Array(K), sum = 0.0;
    for (var iteration = 1; iteration <= numIterations; iteration++) {
      for (position = 0; position < docLength; position++) {
        type = tokens[position];
        if (!known(type)) continue;
        var oldTopic = topics[position];
        cur = ttc[type];
        topicBetaMass -= beta * local[oldTopic] / (tpt[oldTopic] + betaSum);
        local[oldTopic]--;
        if (local[oldTopic] === 0) {
          denseIndex = 0;
          while (localIndex[denseIndex] !== oldTopic) denseIndex++;
          while (denseIndex < nonZeroTopics) { if (denseIndex < localIndex.length - 1) localIndex[denseIndex] = localIndex[denseIndex + 1]; denseIndex++; }
          nonZeroTopics--;
        }
        topicBetaMass += beta * local[oldTopic] / (tpt[oldTopic] + betaSum);
        cc[oldTopic] = (alpha[oldTopic] + local[oldTopic]) / (tpt[oldTopic] + betaSum);
        var index = 0, topicTermMass = 0.0, score;
        while (index < cur.length && cur[index] > 0) {
          score = cc[cur[index] & mask] * (cur[index] >> bits);
          topicTermMass += score; topicTermScores[index] = score; index++;
        }
        var sample = random.nextUniform() * (this.smoothingOnlyMass + topicBetaMass + topicTermMass), newTopic = -1;
        if (sample < topicTermMass) {
          i = -1;
          while (sample > 0) { i++; sample -= topicTermScores[i]; }
          newTopic = cur[i] & mask;
        } else {
          sample -= topicTermMass;
          if (sample < topicBetaMass) {
            sample /= beta;
            for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) {
              topic = localIndex[denseIndex];
              sample -= local[topic] / (tpt[topic] + betaSum);
              if (sample <= 0.0) { newTopic = topic; break; }
            }
          } else {
            sample -= topicBetaMass;
            sample /= beta;
            newTopic = 0;
            sample -= alpha[newTopic] / (tpt[newTopic] + betaSum);
            while (sample > 0.0) { newTopic++; sample -= alpha[newTopic] / (tpt[newTopic] + betaSum); }
          }
        }
        topics[position] = newTopic;
        topicBetaMass -= beta * local[newTopic] / (tpt[newTopic] + betaSum);
        local[newTopic]++;
        if (local[newTopic] === 1) {
          denseIndex = nonZeroTopics;
          while (denseIndex > 0 && localIndex[denseIndex - 1] > newTopic) { localIndex[denseIndex] = localIndex[denseIndex - 1]; denseIndex--; }
          localIndex[denseIndex] = newTopic;
          nonZeroTopics++;
        }
        cc[newTopic] = (alpha[newTopic] + local[newTopic]) / (tpt[newTopic] + betaSum);
        topicBetaMass += beta * local[newTopic] / (tpt[newTopic] + betaSum);
      }
      if (iteration > burnIn && (iteration - burnIn) % thinning === 0) {
        for (topic = 0; topic < K; topic++) { result[topic] += alpha[topic] + local[topic]; sum += alpha[topic] + local[topic]; }
      }
    }
    for (denseIndex = 0; denseIndex < nonZeroTopics; denseIndex++) { topic = localIndex[denseIndex]; cc[topic] = alpha[topic] / (tpt[topic] + betaSum); }
    if (sum === 0.0) for (topic = 0; topic < K; topic++) { result[topic] = alpha[topic] + local[topic]; sum += result[topic]; }
    for (topic = 0; topic < K; topic++) result[topic] /= sum;
    return result;
  };
  // docs: [{ name, text }] or [text], imported as the model's were and read with its words only; or a
  // corpus from importDocs. o: iterations (100), thinning (MALLET's --sample-interval, 10), burnin (10).
  // { docs: [{ name, meta, length, known }], theta: [[p]] }
  Inferencer.prototype.infer = function (docs, o) {
    o = o || {};
    var corpus = docs && docs.docs ? docs : M.importDocs(docs, Object.assign({}, this.importOptions, { alphabet: this.alphabet.fixed() }));
    var self = this, it = o.iterations != null ? o.iterations : 100, th = o.thinning != null ? o.thinning : 10, bi = o.burnin != null ? o.burnin : 10;
    return {
      docs: corpus.docs.map(function (d) { var k = 0; for (var p = 0; p < d.tokens.length; p++) if (d.tokens[p] >= 0) k++; return { name: d.name, meta: d.meta, length: d.tokens.length, known: k }; }),
      theta: corpus.docs.map(function (d) { return Array.from(self.sampledDistribution(d.tokens, it, th, bi)); })
    };
  };
  // infer-topics' --output-doc-topics (dense, as with --doc-topics-threshold 0)
  Inferencer.prototype.docTopics = function (r) {
    return '#doc name topic proportion ...\n' + r.theta.map(function (row, i) { return i + '\t' + (r.docs[i].name != null ? r.docs[i].name : 'no-name') + row.map(function (x) { return '\t' + javaDouble(x); }).join('') + '\n'; }).join('');
  };
  TopicModel.prototype.inferencer = function (seed) { return new Inferencer(this, seed); };
  M.Inferencer = Inferencer;


  // ---------- a trained model as data, and the inferencer from it ----------
  // What inference needs, as plain values (for a model file, or to cross from a Worker):
  // { kind: 'mallette-model', version, numTopics, alpha, alphaSum, beta, betaSum, words,
  //   typeTopicCounts (packed, as MALLET holds them), tokensPerTopic, importOptions }
  TopicModel.prototype.toJSON = function () {
    var io = this.importOptions || {};
    return {
      kind: 'mallette-model', version: M.VERSION, numTopics: this.numTopics,
      alpha: Array.from(this.alpha), alphaSum: this.alphaSum, beta: this.beta, betaSum: this.betaSum,
      words: this.alphabet.words.slice(), typeTopicCounts: this.typeTopicCounts.map(function (a) { return Array.from(a); }),
      tokensPerTopic: Array.from(this.tokensPerTopic),
      importOptions: { stopwords: io.stopwords, extraStopwords: io.extraStopwords, preserveCase: io.preserveCase, token: io.token ? { source: io.token.source, flags: io.token.flags } : undefined }
    };
  };
  // an inferencer from a model's data (toJSON's)
  M.inferencerFrom = function (m, seed) {
    var alphabet = new Alphabet(); m.words.forEach(function (w) { alphabet.lookup(w); });
    var io = Object.assign({}, m.importOptions || {}); if (io.token && io.token.source) io.token = new RegExp(io.token.source, io.token.flags);
    var shell = { numTopics: m.numTopics, alpha: m.alpha, beta: m.beta, betaSum: m.betaSum, alphabet: alphabet, importOptions: io,
      typeTopicCounts: m.typeTopicCounts, tokensPerTopic: m.tokensPerTopic };
    var mask, bits, K = m.numTopics;
    if (popcount(K) === 1) { mask = K - 1; bits = popcount(mask); } else { mask = highestOneBit(K) * 2 - 1; bits = popcount(mask); }
    shell.topicMask = mask; shell.topicBits = bits;
    return new Inferencer(shell, seed);
  };

  // ---------- in a Web Worker ----------
  // M.trainInWorker(docs, numTopics, o): the model estimated in a Worker (mallette-worker.js, beside
  // this file, or o.workerURL), so that a long run leaves the page free. o as train()'s, and
  // numWords (20), progress(iteration, of), diagnostics (true: the diagnostics too). Returns
  // { promise, cancel }: the promise gives { result, model (toJSON's), topicKeys, diagnostics }.
  var HERE = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  M.trainInWorker = function (docs, numTopics, o) {
    o = o || {};
    var url = o.workerURL || (HERE ? HERE.replace(/mallette(\.min)?\.js(\?.*)?$/, 'mallette-worker.js') : 'mallette-worker.js');
    var w = new Worker(url), done = false, opts = {};
    for (var k in o) if (typeof o[k] !== 'function' && k !== 'workerURL') opts[k] = o[k];
    if (opts.token) opts.token = { source: opts.token.source, flags: opts.token.flags };
    var promise = new Promise(function (res, rej) {
      w.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'progress') { if (o.progress) o.progress(m.iteration, m.of); }
        else if (m.type === 'done') { done = true; w.terminate(); res(m); }
        else if (m.type === 'error') { done = true; w.terminate(); rej(new Error(m.message)); }
      };
      w.onerror = function (e) { if (!done) { done = true; w.terminate(); rej(new Error(e.message || 'the worker failed')); } };
    });
    w.postMessage({ type: 'train', docs: docs, numTopics: numTopics, o: opts });
    return { promise: promise, cancel: function () { if (!done) { done = true; w.terminate(); } } };
  };

  M.TopicModel = TopicModel;
  // one call: documents in, a model estimated (synchronously); o as TopicModel's and importDocs'
  M.train = function (docs, numTopics, o) {
    o = o || {};
    var model = new TopicModel(numTopics, o);
    model.addInstances(M.importDocs(docs, o));
    return model.estimate();
  };
  return M;
});
