import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeBookTrustScore, fnv1aHex } = require('../../backend/services/trustScoreService.js');

describe('MRV TrustScore', () => {
  it('is bounded [0,1]', () => {
    const cases = [
      {}, { completedTransactions: 1000, overdueTransactions: 0, hasImage: true, hasIsbn: true, descriptionLength: 200, condition: 'New', listingAgeDays: 0 },
      { completedTransactions: 0, overdueTransactions: 100, condition: 'Poor', listingAgeDays: 5000 }
    ];
    for (const c of cases) {
      const r = computeBookTrustScore(c);
      expect(r.trust_score).toBeGreaterThanOrEqual(0);
      expect(r.trust_score).toBeLessThanOrEqual(1);
      expect(r.risk_score).toBeGreaterThanOrEqual(0);
      expect(r.risk_score).toBeLessThanOrEqual(1);
      expect(Math.abs((r.trust_score + r.risk_score) - 1)).toBeLessThan(1e-6);
    }
  });

  it('is deterministic', () => {
    const input = { ownerAccountAgeDays: 200, completedTransactions: 5, overdueTransactions: 1, ownerListingCount: 2, condition: 'Good', hasImage: true, hasIsbn: true, descriptionLength: 80, listingAgeDays: 30 };
    const a = computeBookTrustScore(input);
    const b = computeBookTrustScore(input);
    expect(a).toEqual(b);
  });

  it('fingerprint is stable and hex', () => {
    const h = fnv1aHex('v1|ownerAge:1|tx:2|overdue:0|listings:1|cond:good|img:1|isbn:1');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1aHex('abc')).toEqual(fnv1aHex('abc'));
    expect(fnv1aHex('abc')).not.toEqual(fnv1aHex('abcd'));
  });

  it('penalizes overdue and rewards completeness', () => {
    const good = computeBookTrustScore({ completedTransactions: 5, overdueTransactions: 0, hasImage: true, hasIsbn: true, descriptionLength: 120, condition: 'Good', listingAgeDays: 1 });
    const bad = computeBookTrustScore({ completedTransactions: 0, overdueTransactions: 5, hasImage: false, hasIsbn: false, descriptionLength: 0, condition: 'unknown', listingAgeDays: 500 });
    expect(good.trust_score).toBeGreaterThan(bad.trust_score);
  });
});
