"""Analyse bidding quality by hand size (round size).

Uses the same round-robin setup as experiment.py but records per-round data
so we can see whether a strategy is biased (over/under-bidding) on specific
hand sizes (1, 2, 3, 4 or 5 cards).

Reports, for each (strategy, hand_size):
  - mean points per round
  - hit rate (bid == tricks)
  - mean bid vs mean actual tricks (bias indicator)
  - % over / under / exact
"""

from __future__ import annotations

import argparse
import itertools
import random
import statistics
import sys
import time
from collections import defaultdict
from dataclasses import dataclass

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from engine import NUM_PLAYERS, ROUNDS, play_game
from strategies import (
    BidStrategy,
    HeuristicCardPlayer,
    ModeBid,
    EVBid,
)


@dataclass
class SizeStats:
    name: str
    hand_size: int
    points: list[int]          # points gained per round
    bids: list[int]
    tricks: list[int]

    @property
    def pts_mean(self) -> float:
        return statistics.mean(self.points)

    @property
    def hit(self) -> float:
        return sum(1 for b, t in zip(self.bids, self.tricks) if b == t) / len(self.bids)

    @property
    def bid_mean(self) -> float:
        return statistics.mean(self.bids)

    @property
    def tricks_mean(self) -> float:
        return statistics.mean(self.tricks)

    @property
    def bias(self) -> float:
        """Positive = overbids, negative = underbids."""
        return self.bid_mean - self.tricks_mean

    @property
    def over(self) -> float:
        return sum(1 for b, t in zip(self.bids, self.tricks) if b > t) / len(self.bids)

    @property
    def under(self) -> float:
        return sum(1 for b, t in zip(self.bids, self.tricks) if b < t) / len(self.bids)


def run(games_per_rotation: int, sims: int, seed: int) -> dict[tuple[str, int], SizeStats]:
    baseline = ModeBid(sims=sims, opp_policy="greedy")
    improved = EVBid(sims=sims, opp_policy="heuristic")
    strategies: list[BidStrategy] = [baseline, baseline, improved, improved]

    card_players = [HeuristicCardPlayer() for _ in range(NUM_PLAYERS)]
    master = random.Random(seed)

    stats: dict[tuple[str, int], SizeStats] = {}
    for s in (baseline, improved):
        for hs in set(ROUNDS):
            stats[(s.name, hs)] = SizeStats(s.name, hs, [], [], [])

    unique_arrangements = []
    seen_names = set()
    for perm in itertools.permutations(range(NUM_PLAYERS)):
        names = tuple(strategies[perm[s]].name for s in range(NUM_PLAYERS))
        if names not in seen_names:
            seen_names.add(names)
            unique_arrangements.append(perm)

    t0 = time.time()
    for _ in range(games_per_rotation):
        seed32 = master.randrange(1 << 32)
        for perm in unique_arrangements:
            seat_strats = [strategies[perm[s]] for s in range(NUM_PLAYERS)]
            rng = random.Random(seed32)
            result = play_game(seat_strats, card_players, rng=rng, start_dealer=0)
            for rr in result.rounds:
                for seat in range(NUM_PLAYERS):
                    sname = strategies[perm[seat]].name
                    st = stats[(sname, rr.hand_size)]
                    st.points.append(rr.points[seat])
                    st.bids.append(rr.bids[seat])
                    st.tricks.append(rr.tricks[seat])

    elapsed = time.time() - t0
    print(f"elapsed: {elapsed:.1f}s")
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=6)
    ap.add_argument("--sims", type=int, default=600)
    ap.add_argument("--seed", type=int, default=0xCAFE1A2)
    args = ap.parse_args()

    stats = run(args.games, args.sims, args.seed)

    names = sorted({k[0] for k in stats.keys()})
    sizes = sorted({k[1] for k in stats.keys()})

    for name in names:
        print(f"\n==== {name} ====")
        print(f"{'handSz':>6}  {'ptsMean':>8}  {'hit%':>6}  {'bidMean':>7}  {'trickMean':>9}  {'bias':>6}  {'over%':>6}  {'under%':>6}  {'n':>5}")
        for hs in sizes:
            st = stats[(name, hs)]
            print(f"{hs:>6}  {st.pts_mean:>8.2f}  {st.hit*100:>5.1f}%  "
                  f"{st.bid_mean:>7.2f}  {st.tricks_mean:>9.2f}  {st.bias:>+6.2f}  "
                  f"{st.over*100:>5.1f}%  {st.under*100:>5.1f}%  {len(st.points):>5}")

    # Difference table
    print(f"\n==== pts/round delta (EV_heuristic - mode_greedy) ====")
    print(f"{'handSz':>6}  {'delta':>7}  {'hitΔ':>5}")
    for hs in sizes:
        a = stats[(names[0], hs)]
        b = stats[(names[1], hs)]
        print(f"{hs:>6}  {b.pts_mean - a.pts_mean:>+7.2f}  {(b.hit-a.hit)*100:>+5.1f}%")


if __name__ == "__main__":
    main()
