#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { computeBookTrustScore } = require('../backend/services/trustScoreService');

const vectorsPath = path.join(__dirname, 'trust_vectors.json');
const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
const jsOut = vectors.map((v) => computeBookTrustScore(v));

const py = spawnSync('python3', [path.join(__dirname, 'trust_score.py'), vectorsPath], { encoding: 'utf8' });
if (py.status !== 0) {
  console.error('Python parity run failed:', py.stderr || py.stdout);
  process.exit(1);
}
const pyOut = JSON.parse(py.stdout);

const diffs = [];
for (let i = 0; i < jsOut.length; i++) {
  const a = jsOut[i]; const b = pyOut[i];
  const keys = ['trust_score','risk_score','fingerprint','algorithm','version'];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push({ index: i, key: k, js: a[k], py: b[k] });
  }
  for (const ck of Object.keys(a.components)) {
    if (a.components[ck] !== b.components[ck]) diffs.push({ index: i, key: `components.${ck}`, js: a.components[ck], py: b.components[ck] });
  }
}

if (diffs.length) {
  console.error('PARITY FAIL', JSON.stringify(diffs, null, 2));
  process.exit(1);
}
console.log(`PARITY OK - ${vectors.length} vectors matched (JS vs Python)`);
