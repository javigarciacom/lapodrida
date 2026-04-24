"""Test whether having the bidder also play heuristically (instead of greedy-max)
inside their own simulation fixes the under-bidding bias on large hands.
"""

from __future__ import annotations

import argparse
import itertools
import random
import sys
import time
from dataclasses import dataclass, field

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from engine import NUM_PLAYERS, ROUNDS, play_game
from strategies import (
    BidStrategy, HeuristicCardPlayer, ModeBid, EVBid,
    simulate_tricks_for_hand,
    _heuristic_sim_play, _greedy_play, _deal_random_opponents,
)
from engine import Card, trick_winner_index, legal_cards, card_strength, rank_value


def simulate_tricks_selfsmart(my_hand, trump, hand_size, sims, rng) -> list[int]:
    """Like simulate_tricks_for_hand but the bidder also plays heuristically."""
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
                card = _heuristic_sim_play(hands[seat], trick, ts, rng)
                hands[seat].remove(card)
                trick.append(card)
            win_idx = trick_winner_index(trick, ts)
            leader = order[win_idx]
            if leader == 0:
                my_tricks += 1
        results.append(my_tricks)
    return results


@dataclass
class SelfSmartEV(BidStrategy):
    sims: int = 600
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"ev_selfsmart[n={self.sims}]"

    def bid(self, ctx, rng):
        samples = simulate_tricks_selfsmart(ctx.hand, ctx.trump, ctx.hand_size, self.sims, rng)
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
                best_ev = ev
                best_b = b
        return best_b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=4)
    ap.add_argument("--sims", type=int, default=600)
    args = ap.parse_args()

    a = EVBid(sims=args.sims, opp_policy="heuristic")     # current (just pushed)
    b = SelfSmartEV(sims=args.sims)                       # bidder also plays smart
    strategies: list[BidStrategy] = [a, a, b, b]
    card_players = [HeuristicCardPlayer() for _ in range(NUM_PLAYERS)]

    unique = []
    seen = set()
    for perm in itertools.permutations(range(NUM_PLAYERS)):
        names = tuple(strategies[perm[s]].name for s in range(NUM_PLAYERS))
        if names not in seen:
            seen.add(names); unique.append(perm)

    per_size: dict[tuple[str, int], list[int]] = {}
    bid_hits: dict[tuple[str, int], list[tuple[int, int]]] = {}
    for s in (a, b):
        for hs in set(ROUNDS):
            per_size[(s.name, hs)] = []
            bid_hits[(s.name, hs)] = []

    master = random.Random(0xFADE)
    t0 = time.time()
    for _ in range(args.games):
        seed = master.randrange(1 << 32)
        for perm in unique:
            seats = [strategies[perm[s]] for s in range(NUM_PLAYERS)]
            rng = random.Random(seed)
            result = play_game(seats, card_players, rng=rng, start_dealer=0)
            for rr in result.rounds:
                for seat in range(NUM_PLAYERS):
                    nm = strategies[perm[seat]].name
                    per_size[(nm, rr.hand_size)].append(rr.points[seat])
                    bid_hits[(nm, rr.hand_size)].append((rr.bids[seat], rr.tricks[seat]))
    print(f"elapsed: {time.time()-t0:.1f}s")

    import statistics as st
    sizes = sorted(set(ROUNDS))
    names = [a.name, b.name]
    for nm in names:
        print(f"\n==== {nm} ====")
        print(f"{'hs':>3}  {'pts':>6}  {'hit%':>6}  {'bidMean':>7}  {'trickMean':>9}  {'bias':>6}  {'under%':>6}  {'n':>5}")
        for hs in sizes:
            pts = per_size[(nm, hs)]
            bh = bid_hits[(nm, hs)]
            bids = [x[0] for x in bh]
            tricks = [x[1] for x in bh]
            hit = sum(1 for bb, tt in bh if bb == tt) / len(bh)
            under = sum(1 for bb, tt in bh if bb < tt) / len(bh)
            print(f"{hs:>3}  {st.mean(pts):>+6.2f}  {hit*100:>5.1f}%  "
                  f"{st.mean(bids):>7.2f}  {st.mean(tricks):>9.2f}  "
                  f"{(st.mean(bids)-st.mean(tricks)):>+6.2f}  {under*100:>5.1f}%  {len(pts):>5}")

    print(f"\n==== delta (selfsmart - current) ====")
    print(f"{'hs':>3}  {'Δpts':>6}  {'Δhit%':>6}  {'Δbid':>6}")
    for hs in sizes:
        pa = st.mean(per_size[(a.name, hs)])
        pb = st.mean(per_size[(b.name, hs)])
        bh_a = bid_hits[(a.name, hs)]
        bh_b = bid_hits[(b.name, hs)]
        ha = sum(1 for bb, tt in bh_a if bb == tt) / len(bh_a)
        hb = sum(1 for bb, tt in bh_b if bb == tt) / len(bh_b)
        ba = st.mean(x[0] for x in bh_a)
        bb = st.mean(x[0] for x in bh_b)
        print(f"{hs:>3}  {pb-pa:>+6.2f}  {(hb-ha)*100:>+5.1f}%  {bb-ba:>+6.2f}")


if __name__ == "__main__":
    main()
