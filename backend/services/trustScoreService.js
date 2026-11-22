/**
 * MRV TrustScore (MTS) - original, deterministic, dependency-free algorithm.
 * Produces a bounded [0,1] trust/risk score for a book listing + owner context.
 *
 * This module is the Node/JS reference implementation. Python parity impl:
 *   scripts/trust_score.py
 *
 * Formula (all sub-scores clamped to [0,1]):
 *   R = w_r*R_rep + w_c*R_comp + w_t*R_tx + w_f*R_fresh
 *   where R_rep = 1 - overdueRate
 *         R_comp = completeness score from metadata fields
 *         R_tx   = 1 - exp(-k * completedTransactions) (diminishing returns)
 *         R_fresh = exp(-lambda * ageDays/365)
 *   Risk = 1 - R (bounded [0,1])
 *
 * Fingerprint: FNV-1a 64-bit inspired non-reversible hash over canonical string,
 * returned as hex (not the raw secret inputs). Used for audit/dedup, not security.
 */

const WEIGHTS = { rep: 0.35, comp: 0.25, tx: 0.25, fresh: 0.15 };
const K_TX = 0.35;
const LAMBDA_FRESH = 0.7;

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function fnv1aHex(str) {
  // 64-bit FNV-1a simulated with BigInt for determinism across platforms
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function canonicalFingerprintInput(input) {
  // Canonical non-reversible fingerprint: only derived/stable features, no raw secrets.
  const parts = [
    `v1`,
    `ownerAge:${Math.floor(Number(input.ownerAccountAgeDays || 0))}`,
    `tx:${Number(input.completedTransactions || 0)}`,
    `overdue:${Number(input.overdueTransactions || 0)}`,
    `listings:${Number(input.ownerListingCount || 0)}`,
    `cond:${String(input.condition || 'unknown').toLowerCase()}`,
    `img:${input.hasImage ? 1 : 0}`,
    `isbn:${input.hasIsbn ? 1 : 0}`,
  ];
  return parts.join('|');
}

function completenessScore(input) {
  let score = 0;
  let total = 5;
  if (input.hasImage) score += 1;
  if (input.hasIsbn) score += 1;
  if ((input.descriptionLength || 0) >= 30) score += 1;
  if ((input.descriptionLength || 0) >= 100) score += 0.5;
  const cond = String(input.condition || '').toLowerCase();
  if (['new', 'like new', 'good', 'fair', 'poor'].includes(cond)) score += 1;
  if ((input.listingAgeDays || 0) >= 0) score += 0.5; // always present
  return clamp01(score / total);
}

function computeBookTrustScore(input = {}) {
  const completed = Math.max(0, Number(input.completedTransactions || 0));
  const overdue = Math.max(0, Number(input.overdueTransactions || 0));
  const totalTx = completed + overdue;
  const overdueRate = totalTx > 0 ? overdue / totalTx : 0;
  const R_rep = clamp01(1 - overdueRate);
  const R_comp = completenessScore(input);
  const R_tx = clamp01(1 - Math.exp(-K_TX * completed));
  const ageDays = Math.max(0, Number(input.listingAgeDays || 0));
  const R_fresh = clamp01(Math.exp(-LAMBDA_FRESH * (ageDays / 365)));

  const trust = clamp01(
    WEIGHTS.rep * R_rep +
    WEIGHTS.comp * R_comp +
    WEIGHTS.tx * R_tx +
    WEIGHTS.fresh * R_fresh
  );
  const risk = clamp01(1 - trust);
  const fingerprint = fnv1aHex(canonicalFingerprintInput(input));

  return {
    algorithm: 'MRV-TrustScore-v1',
    version: '1.0.0',
    trust_score: round6(trust),
    risk_score: round6(risk),
    components: {
      reputation: round6(R_rep),
      completeness: round6(R_comp),
      transaction_confidence: round6(R_tx),
      freshness: round6(R_fresh),
    },
    weights: { ...WEIGHTS },
    fingerprint,
    explanation: explain({ trust, risk, R_rep, R_comp, R_tx, R_fresh, overdueRate, completed }),
  };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

function explain({ trust, risk, R_rep, R_comp, R_tx, R_fresh, overdueRate, completed }) {
  const level = trust >= 0.75 ? 'high' : trust >= 0.5 ? 'moderate' : 'low';
  return `Trust is ${level} (${round6(trust)}). ` +
    `Reputation ${round6(R_rep)} (overdue rate ${round6(overdueRate)}), ` +
    `completeness ${round6(R_comp)}, ` +
    `transaction confidence ${round6(R_tx)} from ${completed} completed tx, ` +
    `freshness ${round6(R_fresh)}. Risk score ${round6(risk)}.`;
}

module.exports = { computeBookTrustScore, fnv1aHex, canonicalFingerprintInput, WEIGHTS, K_TX, LAMBDA_FRESH };
