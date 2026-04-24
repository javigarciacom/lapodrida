"""Bidding and card-play strategies for La Podrida experiments.

The card strategy is held constant across all seats in the experiments so
differences in score reflect the bidding strategy. The card strategy is a
tighter port of the JS `heuristicSimSelect` + bid-aware late-trick logic in
aiSelectCard (hard mode).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from statistics import mean, median
from typing import Sequence

from engine import (
    Card,
    BidStrategy,
    CardStrategy,
    PlayContext,
    RoundContext,
    NUM_PLAYERS,
    RANK_VALUE,
    SUITS,
    legal_cards,
    new_deck,
    rank_value,
    card_strength,
    trick_winner_index,
)


# ──────────────────────────────────────────────────────────────────────────────
#  Shared card-play strategy (bid-aware heuristic)
# ──────────────────────────────────────────────────────────────────────────────

class HeuristicCardPlayer(CardStrategy):
    name = "heuristic"

    def pick(self, ctx: PlayContext, rng: random.Random) -> Card:
        legal = legal_cards(ctx.hand, ctx.trick, ctx.trump_suit)
        if len(legal) == 1:
            return legal[0]

        ts = ctx.trump_suit
        tricks_needed = ctx.own_bid - ctx.own_tricks_won
        # `slack` = how many more of the remaining tricks we *don't* want to win
        slack = ctx.remaining_tricks - tricks_needed

        if not ctx.trick:
            # Leading
            if tricks_needed <= 0:
                # We want to avoid tricks. Lead our lowest non-trump if possible.
                non_trump = [c for c in legal if c.suit != ts]
                pool = non_trump or legal
                return min(pool, key=lambda c: card_strength(c, ts))
            # We want tricks. Lead our strongest.
            return max(legal, key=lambda c: card_strength(c, ts))

        # Following: figure out the current winning card
        led = ctx.trick[0].suit
        best = ctx.trick[0]
        for c in ctx.trick[1:]:
            if c.suit == ts:
                if best.suit != ts or rank_value(c) > rank_value(best):
                    best = c
            elif best.suit != ts and c.suit == led:
                if rank_value(c) > rank_value(best):
                    best = c

        def beats(card: Card) -> bool:
            if card.suit == ts and best.suit != ts:
                return True
            if card.suit == ts and best.suit == ts:
                return rank_value(card) > rank_value(best)
            if card.suit == led and best.suit != ts:
                return rank_value(card) > rank_value(best)
            return False

        winners = [c for c in legal if beats(c)]
        losers = [c for c in legal if not beats(c)]

        if tricks_needed > 0:
            if winners:
                # Cheapest winner (econ. strong cards for later)
                return min(winners, key=lambda c: card_strength(c, ts))
            # Can't win: dump lowest card
            return min(losers, key=lambda c: card_strength(c, ts))

        # Don't need more tricks
        if slack > 0 and losers:
            # Unload our highest loser (reduce danger in remaining tricks)
            return max(losers, key=lambda c: card_strength(c, ts))
        if winners:
            return min(winners, key=lambda c: card_strength(c, ts))
        return min(losers or legal, key=lambda c: card_strength(c, ts))


# ──────────────────────────────────────────────────────────────────────────────
#  Bid simulator helpers
# ──────────────────────────────────────────────────────────────────────────────

def _deal_random_opponents(
    my_hand: Sequence[Card], trump: Card, hand_size: int, rng: random.Random,
) -> list[list[Card]]:
    """Deal random hands to the three opponents from the unseen deck."""
    seen = set(my_hand)
    seen.add(trump)
    remaining = [c for c in new_deck() if c not in seen]
    rng.shuffle(remaining)
    hands = [[] for _ in range(NUM_PLAYERS - 1)]
    idx = 0
    for _ in range(hand_size):
        for h in hands:
            h.append(remaining[idx])
            idx += 1
    return hands


def _greedy_play(hand: list[Card], trick: list[Card], ts: str) -> Card:
    """Legal highest-strength play (used in JS simulateRoundForBid)."""
    legal = legal_cards(hand, trick, ts)
    return max(legal, key=lambda c: card_strength(c, ts))


def _heuristic_sim_play(hand: list[Card], trick: list[Card], ts: str, rng: random.Random) -> Card:
    """Mirror of heuristicSimSelect in script.js: play smart but not bid-aware."""
    legal = legal_cards(hand, trick, ts)
    if len(legal) == 1:
        return legal[0]
    if not trick:
        if rng.random() < 0.85:
            return max(legal, key=lambda c: card_strength(c, ts))
        return rng.choice(legal)
    led = trick[0].suit
    best = trick[0]
    for c in trick[1:]:
        if c.suit == ts:
            if best.suit != ts or rank_value(c) > rank_value(best):
                best = c
        elif best.suit != ts and c.suit == led:
            if rank_value(c) > rank_value(best):
                best = c

    def beats(card: Card) -> bool:
        if card.suit == ts and best.suit != ts:
            return True
        if card.suit == ts and best.suit == ts:
            return rank_value(card) > rank_value(best)
        if card.suit == led and best.suit != ts:
            return rank_value(card) > rank_value(best)
        return False

    winners = [c for c in legal if beats(c)]
    if winners and rng.random() < 0.7:
        return min(winners, key=lambda c: card_strength(c, ts))
    if rng.random() < 0.7:
        return min(legal, key=lambda c: card_strength(c, ts))
    return rng.choice(legal)


def simulate_tricks_for_hand(
    my_hand: Sequence[Card],
    trump: Card,
    hand_size: int,
    sims: int,
    opp_policy: str,  # "greedy" or "heuristic"
    rng: random.Random,
) -> list[int]:
    """Run `sims` simulations where I play greedy-high and opponents follow `opp_policy`.

    Returns a list of length `sims` with tricks I won in each. Matches the
    spirit of simulateRoundForBid in script.js (which is greedy-for-everyone).
    """
    results = []
    ts = trump.suit
    for _ in range(sims):
        opp_hands = _deal_random_opponents(my_hand, trump, hand_size, rng)
        my_h = list(my_hand)
        # Seats: 0 = me, 1,2,3 = opps. Lead rotates; start with me (matches what
        # the JS bid-sim does — it uses biddingOrder which starts at dealer's right).
        leader = 0
        hands = [my_h] + opp_hands
        my_tricks = 0
        for _ in range(hand_size):
            order = [(leader - k) % NUM_PLAYERS for k in range(NUM_PLAYERS)]
            order = [leader] + [(leader - k) % NUM_PLAYERS for k in range(1, NUM_PLAYERS)]
            trick: list[Card] = []
            for seat in order:
                if seat == 0:
                    card = _greedy_play(hands[seat], trick, ts)
                else:
                    if opp_policy == "greedy":
                        card = _greedy_play(hands[seat], trick, ts)
                    else:
                        card = _heuristic_sim_play(hands[seat], trick, ts, rng)
                hands[seat].remove(card)
                trick.append(card)
            win_idx = trick_winner_index(trick, ts)
            leader = order[win_idx]
            if leader == 0:
                my_tricks += 1
        results.append(my_tricks)
    return results


# ──────────────────────────────────────────────────────────────────────────────
#  Bidding strategies
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ModeBid(BidStrategy):
    """Current JS behaviour: pick the most frequent simulated trick count.

    Can pick greedy opponents (current JS) or heuristic opponents.
    """
    sims: int = 2000
    opp_policy: str = "greedy"
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"mode[{self.opp_policy},n={self.sims}]"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        samples = simulate_tricks_for_hand(
            ctx.hand, ctx.trump, ctx.hand_size, self.sims, self.opp_policy, rng,
        )
        freq: dict[int, int] = {}
        for s in samples:
            freq[s] = freq.get(s, 0) + 1
        return max(freq.items(), key=lambda kv: kv[1])[0]


@dataclass
class MeanBid(BidStrategy):
    sims: int = 2000
    opp_policy: str = "heuristic"
    round_offset: float = 0.0
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"mean[{self.opp_policy},n={self.sims},off={self.round_offset:+.1f}]"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        samples = simulate_tricks_for_hand(
            ctx.hand, ctx.trump, ctx.hand_size, self.sims, self.opp_policy, rng,
        )
        return max(0, min(ctx.hand_size, round(mean(samples) + self.round_offset)))


@dataclass
class MedianBid(BidStrategy):
    sims: int = 2000
    opp_policy: str = "heuristic"
    offset: int = 0
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"median[{self.opp_policy},n={self.sims},off={self.offset:+d}]"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        samples = simulate_tricks_for_hand(
            ctx.hand, ctx.trump, ctx.hand_size, self.sims, self.opp_policy, rng,
        )
        return max(0, min(ctx.hand_size, round(median(samples)) + self.offset))


@dataclass
class EVBid(BidStrategy):
    """Pick the bid that maximises expected score, given the empirical trick
    distribution. Directly optimises the scoring function instead of picking
    a point estimate.
    """
    sims: int = 2000
    opp_policy: str = "heuristic"
    name: str = field(init=False)

    def __post_init__(self):
        self.name = f"ev[{self.opp_policy},n={self.sims}]"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        samples = simulate_tricks_for_hand(
            ctx.hand, ctx.trump, ctx.hand_size, self.sims, self.opp_policy, rng,
        )
        # Build distribution
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


@dataclass
class HandStrengthBid(BidStrategy):
    """Analytical heuristic — no simulation. Estimates tricks from hand strength.

    Counts: sure-winners (As/3 of any suit, trump rank >= S), plus fractional
    credit for middling cards. Cheap and surprisingly hard to beat on short
    hands (1-3 cards).
    """
    name: str = "hand-strength"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        ts = ctx.trump_suit
        score = 0.0
        for c in ctx.hand:
            rv = rank_value(c)  # 1..12
            if c.suit == ts:
                # Trumps: any trump is meaningful in 40-card, small hands
                if rv >= 11:      # 1 or 3 of trumps
                    score += 1.0
                elif rv >= 9:     # R or C
                    score += 0.85
                elif rv >= 8:     # S
                    score += 0.7
                elif rv >= 5:     # 7
                    score += 0.5
                else:
                    score += 0.3
            else:
                if rv >= 11:      # As/3 of side suits
                    score += 0.75
                elif rv == 10:    # R
                    score += 0.5
                elif rv == 9:     # C
                    score += 0.25
                # Small side cards contribute ~0
        # Cap by hand size and clamp
        raw = round(score)
        return max(0, min(ctx.hand_size, raw))
