"""Round-robin tournament between bidding strategies.

Each game seats 4 strategies. To neutralise seat/dealer bias, we rotate
strategy assignments across games and use paired RNG seeds across
strategy orderings so every strategy sees the same deals.

Usage:
    python3 experiment.py                   # default quick run (fast sims)
    python3 experiment.py --games 200
    python3 experiment.py --sims 4000 --games 100
"""

from __future__ import annotations

import argparse
import itertools
import random
import statistics
import sys
import time
from dataclasses import dataclass

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from engine import NUM_PLAYERS, play_game
from strategies import (
    BidStrategy,
    HeuristicCardPlayer,
    ModeBid,
    MeanBid,
    MedianBid,
    EVBid,
    HandStrengthBid,
)


@dataclass
class StratStats:
    name: str
    scores: list[int]
    hit_rates: list[float]
    bid_counts: list[int]       # avg bid magnitude, informative

    @property
    def score_mean(self) -> float:
        return statistics.mean(self.scores)

    @property
    def score_stdev(self) -> float:
        return statistics.stdev(self.scores) if len(self.scores) > 1 else 0.0

    @property
    def hit_rate(self) -> float:
        return statistics.mean(self.hit_rates)

    @property
    def bid_avg(self) -> float:
        return statistics.mean(self.bid_counts)


def run_tournament(
    strategies: list[BidStrategy],
    games_per_rotation: int = 10,
    rng_seed: int = 0xC0FFEE,
) -> dict[str, StratStats]:
    """Each rotation permutes the strategies across the 4 seats; each game uses
    a fresh RNG seed that's the same across permutations within a rotation,
    so all strategies see the same deals (just from different seats).
    """
    card_players = [HeuristicCardPlayer() for _ in range(NUM_PLAYERS)]
    by_name: dict[str, StratStats] = {
        s.name: StratStats(s.name, [], [], []) for s in strategies
    }

    # We need 4 players; if fewer/more than 4 strategies, we pad or sample.
    if len(strategies) != NUM_PLAYERS:
        raise ValueError("experiment expects exactly 4 strategies per run")

    permutations = list(itertools.permutations(range(NUM_PLAYERS)))
    master_rng = random.Random(rng_seed)

    for rotation in range(games_per_rotation):
        # One shared seed per rotation so deals are paired across permutations
        seed = master_rng.randrange(1 << 32)
        for perm in permutations:
            seat_strats = [strategies[perm[s]] for s in range(NUM_PLAYERS)]
            game_rng = random.Random(seed)
            result = play_game(seat_strats, card_players, rng=game_rng, start_dealer=0)

            # Record per-strategy stats (look up by perm)
            for seat in range(NUM_PLAYERS):
                strat = strategies[perm[seat]]
                stats = by_name[strat.name]
                stats.scores.append(result.final_scores[seat])
                stats.hit_rates.append(result.hit_count[seat] / len(result.rounds))
                total_bid = sum(r.bids[seat] for r in result.rounds)
                stats.bid_counts.append(total_bid / len(result.rounds))

    return by_name


def print_table(stats: dict[str, StratStats]) -> None:
    rows = sorted(stats.values(), key=lambda s: s.score_mean, reverse=True)
    header = f"{'strategy':<40}  {'mean':>8}  {'stdev':>7}  {'hit%':>6}  {'bidAvg':>6}  {'n':>4}"
    print(header)
    print("-" * len(header))
    for s in rows:
        print(f"{s.name:<40}  {s.score_mean:>8.1f}  {s.score_stdev:>7.1f}  "
              f"{s.hit_rate*100:>5.1f}%  {s.bid_avg:>6.2f}  {len(s.scores):>4}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=6,
                    help="Games per rotation (each rotation = 24 games, one per permutation)")
    ap.add_argument("--sims", type=int, default=800,
                    help="Simulations per bid decision")
    ap.add_argument("--seed", type=int, default=0xC0FFEE)
    args = ap.parse_args()

    # Candidate strategies. Must be exactly 4 per tournament.
    # We'll run a few head-to-heads:
    rounds_to_run = [
        ("baseline_vs_variants", [
            ModeBid(sims=args.sims, opp_policy="greedy"),         # current JS hard
            ModeBid(sims=args.sims, opp_policy="heuristic"),      # mode but smarter opps
            MeanBid(sims=args.sims, opp_policy="heuristic"),      # mean
            EVBid(sims=args.sims, opp_policy="heuristic"),        # EV-maximiser
        ]),
        ("ev_variants_vs_analytic", [
            EVBid(sims=args.sims, opp_policy="heuristic"),
            EVBid(sims=args.sims, opp_policy="greedy"),
            MedianBid(sims=args.sims, opp_policy="heuristic", offset=+1),
            HandStrengthBid(),
        ]),
    ]

    for label, strats in rounds_to_run:
        print(f"\n==== tournament: {label} ====")
        print(f"sims/decision={args.sims}  games/rotation={args.games}  "
              f"total games={args.games * 24}  (24 permutations each)")
        t0 = time.time()
        stats = run_tournament(strats, games_per_rotation=args.games, rng_seed=args.seed)
        dt = time.time() - t0
        print_table(stats)
        print(f"  elapsed: {dt:.1f}s")


if __name__ == "__main__":
    main()
