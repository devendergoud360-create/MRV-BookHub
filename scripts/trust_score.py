#!/usr/bin/env python3
"""MRV TrustScore (MTS) v1 - Python parity implementation.
Deterministic, dependency-free. Must match backend/services/trustScoreService.js.
"""
from __future__ import annotations
import json, math, sys

WEIGHTS = {"rep": 0.35, "comp": 0.25, "tx": 0.25, "fresh": 0.15}
K_TX = 0.35
LAMBDA_FRESH = 0.7

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))

def fnv1a_hex(s: str) -> str:
    h = 0xcbf29ce484222325
    prime = 0x100000001b3
    mask = 0xffffffffffffffff
    for ch in s:
        h ^= ord(ch)
        h = (h * prime) & mask
    return format(h, '016x')

def canonical_fingerprint_input(inp: dict) -> str:
    parts = [
        'v1',
        f"ownerAge:{int(float(inp.get('ownerAccountAgeDays', 0) or 0))}",
        f"tx:{int(float(inp.get('completedTransactions', 0) or 0))}",
        f"overdue:{int(float(inp.get('overdueTransactions', 0) or 0))}",
        f"listings:{int(float(inp.get('ownerListingCount', 0) or 0))}",
        f"cond:{str(inp.get('condition', 'unknown') or 'unknown').lower()}",
        f"img:{1 if inp.get('hasImage') else 0}",
        f"isbn:{1 if inp.get('hasIsbn') else 0}",
    ]
    return '|'.join(parts)

def completeness_score(inp: dict) -> float:
    score = 0.0
    total = 5.0
    if inp.get('hasImage'): score += 1
    if inp.get('hasIsbn'): score += 1
    desc = int(float(inp.get('descriptionLength', 0) or 0))
    if desc >= 30: score += 1
    if desc >= 100: score += 0.5
    cond = str(inp.get('condition', '') or '').lower()
    if cond in ['new','like new','good','fair','poor']: score += 1
    if float(inp.get('listingAgeDays', 0) or 0) >= 0: score += 0.5
    return clamp01(score / total)

def round6(n: float) -> float:
    return round(float(n) + 1e-12, 6)

def compute_book_trust_score(inp: dict) -> dict:
    completed = max(0, int(float(inp.get('completedTransactions', 0) or 0)))
    overdue = max(0, int(float(inp.get('overdueTransactions', 0) or 0)))
    total_tx = completed + overdue
    overdue_rate = (overdue / total_tx) if total_tx > 0 else 0.0
    R_rep = clamp01(1 - overdue_rate)
    R_comp = completeness_score(inp)
    R_tx = clamp01(1 - math.exp(-K_TX * completed))
    age_days = max(0.0, float(inp.get('listingAgeDays', 0) or 0))
    R_fresh = clamp01(math.exp(-LAMBDA_FRESH * (age_days / 365.0)))
    trust = clamp01(WEIGHTS['rep']*R_rep + WEIGHTS['comp']*R_comp + WEIGHTS['tx']*R_tx + WEIGHTS['fresh']*R_fresh)
    risk = clamp01(1 - trust)
    fingerprint = fnv1a_hex(canonical_fingerprint_input(inp))
    level = 'high' if trust >= 0.75 else 'moderate' if trust >= 0.5 else 'low'
    explanation = (
        f"Trust is {level} ({round6(trust)}). "
        f"Reputation {round6(R_rep)} (overdue rate {round6(overdue_rate)}), "
        f"completeness {round6(R_comp)}, "
        f"transaction confidence {round6(R_tx)} from {completed} completed tx, "
        f"freshness {round6(R_fresh)}. Risk score {round6(risk)}."
    )
    return {
        'algorithm': 'MRV-TrustScore-v1',
        'version': '1.0.0',
        'trust_score': round6(trust),
        'risk_score': round6(risk),
        'components': {
            'reputation': round6(R_rep),
            'completeness': round6(R_comp),
            'transaction_confidence': round6(R_tx),
            'freshness': round6(R_fresh),
        },
        'weights': dict(WEIGHTS),
        'fingerprint': fingerprint,
        'explanation': explanation,
    }

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--json':
        inp = json.loads(sys.argv[2])
        print(json.dumps(compute_book_trust_score(inp), sort_keys=True))
        return
    # parity test vectors
    vectors = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
    out = [compute_book_trust_score(v) for v in vectors]
    print(json.dumps(out, sort_keys=True))

if __name__ == '__main__':
    main()
