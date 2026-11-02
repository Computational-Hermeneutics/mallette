/*
 * mallette: MALLET's topic model, LDA with hyperparameter optimisation, in the browser and in node.
 *
 * A translation into JavaScript of parts of MALLET 2.1.1, the MAchine Learning for LanguagE Toolkit
 * (https://github.com/mimno/Mallet): Copyright (C) 2002, 2003 University of Massachusetts Amherst,
 * Department of Computer Science, licensed under the Apache License, Version 2.0. Translated from
 * cc.mallet.topics.ParallelTopicModel and WorkerCallable (one thread), cc.mallet.types.Dirichlet,
 * cc.mallet.util.Randoms (and java.util.Random beneath it), cc.mallet.classify.tui.Csv2Vectors
 * (its default tokens and lower-casing) and cc.mallet.pipe.TokenSequenceRemoveStopwords (its
 * built-in English list), and changed for JavaScript: one thread only; documents given as text
 * rather than read from files; asynchronous estimation in steps, with progress and a way to stop;
 * the outputs as values as well as MALLET's text formats. With the same documents and seed it means
 * to make the same assignments as `mallet train-topics --num-threads 1` (test/compare.js checks).
 * mallette is licensed under the Apache License, Version 2.0 (LICENSE; NOTICE).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.mallette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var M = {};
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
  M.Alphabet = Alphabet;
  // docs: [{ name, text }] or [text]; o.stopwords (a list; true for MALLET's, false for none: true by
  // default), o.extraStopwords, o.preserveCase, o.token (a RegExp with the g and u flags)
  M.importDocs = function (docs, o) {
    o = o || {};
    var alphabet = o.alphabet || new Alphabet(), stop = new Set();
    var list = o.stopwords === false ? [] : Array.isArray(o.stopwords) ? o.stopwords : M.STOPLIST;
    list.concat(o.extraStopwords || []).forEach(function (w) { stop.add(String(w).toLowerCase()); });
    var re = o.token || M.TOKEN;
    return {
      alphabet: alphabet,
      docs: docs.map(function (d, i) {
        var text = typeof d === 'string' ? d : d.text || '', name = typeof d === 'string' ? 'doc' + i : (d.name != null ? String(d.name) : 'doc' + i);
        if (!o.preserveCase) text = text.toLowerCase();
        var out = [];
        (text.match(new RegExp(re.source, re.flags)) || []).forEach(function (t) { if (!stop.has(o.preserveCase ? t.toLowerCase() : t)) out.push(alphabet.lookup(t)); });
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
