"""Find the best bidding strategy per hand size.

Tournament of many candidates played with all 4 seats using the same strategy
(so we measure the strategy's absolute performance, not head-to-head vs a
specific baseline). For each hand size we pick the strategy with the highest
mean points per round.

The winners are then printed as a JS-friendly lookup table that can be
transplanted into script.js.
"""

from __future__ import annotations

import argparse
import itertools
import random
import statistics
import sys
import time
from dataclasses import dataclass, field

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from engine import (
    NUM_PLAYERS, ROUNDS, Card, play_game, trick_winner_index,
    legal_cards, rank_value, card_strength,
)
from strategies import (
    BidStrategy, HeuristicCardPlayer, ModeBid, MeanBid, EVBid,
    simulate_tricks_for_hand, _greedy_play, _heuristic_sim_play,
    _deal_random_opponents,
)


# ──────────────────────────────────────────────────────────────────────────────
#  Extra strategies
# ──────────────────────────────────────────────────────────────────────────────

def _deterministic_heuristic_play(hand, trick, ts):
    """Deterministic version of heuristicSimSelect — no random-coin for noise.

    Used inside bid simulations so the empirical distribution is cleaner.
    """
    legal = legal_cards(hand, trick, ts)
    if len(legal) <= 1:
        return legal[0]
    if not trick:
        return max(legal, key=lambda c: card_strength(c, ts))
    led = trick[0].suit
    best = trick[0]
    for c in trick[1:]:
        if c.suit == ts:
            if best.suit != ts or rank_value(c) > rank_value(best):
                best = c
        elif best.suit != ts and c.suit == led:
            if rank_value(c) > rank_value(best):
                best = c

    def beats(card):
        if card.suit == ts and best.suit != ts: return True
        if card.suit == ts and best.suit == ts:
            return rank_value(card) > rank_value(best)
        if card.suit == led and best.suit != ts:
            return rank_value(card) > rank_value(best)
        return False

    winners = [c for c in legal if beats(c)]
    if winners:
        # Cheapest winner
        return min(winners, key=lambda c: card_strength(c, ts))
    # Can't win: dump lowest
    return min(legal, key=lambda c: card_strength(c, ts))


def simulate_tricks_full_smart(my_hand, trump, hand_size, sims, rng) -> list[int]:
    """Both bidder and opponents play the deterministic heuristic."""
    ts = trump.suit
    results = []
    for _ in range(sims):
        opp_hands = _deal_random_opponents(my_hand, trump, hand_size, rng)
        hands = [list(my_hand)] + opp_hands
        leader = 0
        my_tricks = 0
        for _t in range(hand_size):
            order = [leader] + [(leader - k) % NUM_PLAYERS for k in range(1, NUM_PLAYERS)]
            trick: list[Card] = []
            for seat in order:
                card = _deterministic_heuristic_play(hands[seat], trick, ts)
                hands[seat].remove(card)
                trick.append(card)
            win_idx = trick_winner_index(trick, ts)
            leader = order[win_idx]
            if leader == 0:
                my_tricks += 1
        results.append(my_tricks)
    return results


@dataclass
class FullSmartEVBid(BidStrategy):
    """EV-maximiser where both bidder and opponents play deterministic heuristic."""
    sims: int = 600
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"ev_fullsmart_det[n={self.sims}]"

    def bid(self, ctx, rng):
        samples = simulate_tricks_full_smart(
            ctx.hand, ctx.trump, ctx.hand_size, self.sims, rng,
        )
        freq: dict[int, int] = {}
        for s in samples:
            freq[s] = freq.get(s, 0) + 1
        total = len(samples)
        best_b, best_ev = 0, -1e18
        for b in range(ctx.hand_size + 1):
            ev = 0.0
            for tricks, count in freq.items():
                p = count / total
                score = (10 + 3 * tricks) if b == tricks else -3 * abs(b - tricks)
                ev += p * score
            if ev > best_ev:
                best_ev = ev; best_b = b
        return best_b


@dataclass
class ModeBidFullSmart(BidStrategy):
    sims: int = 600
    name: str = field(init=False)
    def __post_init__(self):
        self.name = f"mode_fullsmart_det[n={self.sims}]"
    def bid(self, ctx, rng):
        samples = simulate_tricks_full_smart(ctx.hand, ctx.trump, ctx.hand_size, self.sims, rng)
        freq = {}
        for s in samples: freq[s] = freq.get(s, 0) + 1
        return max(freq.items(), key=lambda kv: kv[1])[0]


# ──────────────────────────────────────────────────────────────────────────────
#  Tournament: all seats same strategy
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Bucket:
    points: list[int] = field(default_factory=list)
    bids: list[int] = field(default_factory=list)
    tricks: list[int] = field(default_factory=list)

    @property
    def mean_pts(self): return statistics.mean(self.points) if self.points else 0.0
    @property
    def hit_rate(self):
        if not self.bids: return 0.0
        return sum(1 for b, t in zip(self.bids, self.tricks) if b == t) / len(self.bids)
    @property
    def under_rate(self):
        if not self.bids: return 0.0
        return sum(1 for b, t in zip(self.bids, self.tricks) if b < t) / len(self.bids)
    @property
    def bid_mean(self): return statistics.mean(self.bids) if self.bids else 0.0
    @property
    def tricks_mean(self): return statistics.mean(self.tricks) if self.tricks else 0.0


def run_all_same(strategies: list[BidStrategy], games: int, seed: int, save_path: str | None = None):
    """Play each strategy with all 4 seats using it. Cheap but measures absolute perf."""
    card_players = [HeuristicCardPlayer() for _ in range(NUM_PLAYERS)]
    master = random.Random(seed)
    data: dict[tuple[str, int], Bucket] = {}

    for s in strategies:
        for hs in set(ROUNDS):
            data[(s.name, hs)] = Bucket()

    # Use the same seed sequence across strategies so deals are paired.
    shared_seeds = [master.randrange(1 << 32) for _ in range(games)]

    for strat_idx, strat in enumerate(strategies):
        t0 = time.time()
        seats = [strat] * NUM_PLAYERS
        for g_seed in shared_seeds:
            rng = random.Random(g_seed)
            result = play_game(seats, card_players, rng=rng, start_dealer=0)
            for rr in result.rounds:
                for seat in range(NUM_PLAYERS):
                    b = data[(strat.name, rr.hand_size)]
                    b.points.append(rr.points[seat])
                    b.bids.append(rr.bids[seat])
                    b.tricks.append(rr.tricks[seat])
        print(f"  [{strat_idx+1}/{len(strategies)}] {strat.name}: {time.time()-t0:.1f}s", flush=True)
        if save_path:
            _persist(data, save_path)
    return data


def _persist(data: dict[tuple[str, int], Bucket], path: str):
    import json
    obj = {}
    for (name, hs), b in data.items():
        obj.setdefault(name, {})[str(hs)] = {
            "points": b.points, "bids": b.bids, "tricks": b.tricks,
        }
    with open(path, "w") as f:
        json.dump(obj, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=60)
    ap.add_argument("--sims", type=int, default=500)
    ap.add_argument("--seed", type=int, default=0xF00D)
    args = ap.parse_args()

    strategies: list[BidStrategy] = [
        ModeBid(sims=args.sims, opp_policy="greedy"),                # legacy JS hard
        ModeBid(sims=args.sims, opp_policy="heuristic"),
        EVBid(sims=args.sims, opp_policy="heuristic"),               # current JS hard
        MeanBid(sims=args.sims, opp_policy="heuristic"),
        FullSmartEVBid(sims=args.sims),                              # both sides smart (det)
        ModeBidFullSmart(sims=args.sims),                            # mode + full smart
    ]

    print(f"evaluating {len(strategies)} strategies × {args.games} games × 16 rounds")
    print(f"sims/decision={args.sims}\n")

    t0 = time.time()
    save_path = "/tmp/best_per_size_data.json"
    data = run_all_same(strategies, args.games, args.seed, save_path=save_path)
    print(f"elapsed: {time.time()-t0:.1f}s\n")
    print(f"raw data persisted to {save_path}\n")

    sizes = sorted(set(ROUNDS))
    names = [s.name for s in strategies]

    # Per-strategy tables
    for name in names:
        print(f"==== {name} ====")
        print(f"{'hs':>3}  {'pts':>6}  {'hit%':>6}  {'bid':>5}  {'trk':>5}  {'bias':>5}  {'under%':>6}  {'n':>5}")
        for hs in sizes:
            b = data[(name, hs)]
            print(f"{hs:>3}  {b.mean_pts:>+6.2f}  {b.hit_rate*100:>5.1f}%  "
                  f"{b.bid_mean:>5.2f}  {b.tricks_mean:>5.2f}  "
                  f"{b.bid_mean - b.tricks_mean:>+5.2f}  "
                  f"{b.under_rate*100:>5.1f}%  {len(b.points):>5}")
        print()

    # Best per size
    print("==== WINNERS PER HAND SIZE ====")
    print(f"{'hs':>3}  {'strategy':<34}  {'pts':>6}  {'hit%':>6}  {'bid':>5}")
    winners: dict[int, tuple[str, float]] = {}
    for hs in sizes:
        ranked = sorted(
            ((name, data[(name, hs)].mean_pts, data[(name, hs)].hit_rate, data[(name, hs)].bid_mean) for name in names),
            key=lambda t: t[1], reverse=True,
        )
        top = ranked[0]
        winners[hs] = (top[0], top[1])
        print(f"{hs:>3}  {top[0]:<34}  {top[1]:>+6.2f}  {top[2]*100:>5.1f}%  {top[3]:>5.2f}")
        # Show runner-up
        for rn in ranked[1:3]:
            print(f"{'':>3}  {'  ' + rn[0]:<34}  {rn[1]:>+6.2f}  {rn[2]*100:>5.1f}%  {rn[3]:>5.2f}")

    # JS snippet
    print("\n==== suggested JS routing ====")
    print("// inside simulateBid or aiComputeBid, route by handSize:")
    print("// handSize -> chosen strategy")
    for hs in sizes:
        print(f"//   {hs}: {winners[hs][0]}")


if __name__ == "__main__":
    main()
