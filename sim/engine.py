"""La Podrida — game engine for bidding-strategy experiments.

Faithful Python port of the rules implemented in ../script.js:

  * 40-card deck (Spanish): suits espadas/oros/copas/bastos,
    ranks 1, 2, 3, 4, 5, 6, 7, S (sota), C (caballo), R (rey).
  * Rank strength (high → low): 1, 3, R, C, S, 7, 6, 5, 4, 2.
  * 16 rounds with hand sizes: 1,2,3,4,5,5,5,5,5,5,5,5,4,3,2,1.
  * After dealing, the next card off the deck becomes the trump.
  * Bidding goes counter-clockwise from the dealer's right.
    NO "podrida" restriction: the last bidder is free to bid any value
    (home-rule variant — the dealer/last bidder may close sum == handSize).
  * Play is counter-clockwise; must follow suit, then must trump, else free.
  * Scoring: +10 + 3·tricks if bid == tricks, else −3·|tricks − bid|.

The engine takes a list of four BidStrategy instances (one per seat) and a
CardStrategy (shared by all seats unless you want to vary that too). Each
strategy is a pure object with seat-independent methods; positions don't
matter except for turn order.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable, Sequence


# ──────────────────────────────────────────────────────────────────────────────
#  Cards
# ──────────────────────────────────────────────────────────────────────────────

SUITS = ("espadas", "oros", "copas", "bastos")
RANKS = ("1", "2", "3", "4", "5", "6", "7", "S", "C", "R")
RANK_VALUE = {"1": 12, "3": 11, "R": 10, "C": 9, "S": 8,
              "7": 5, "6": 4, "5": 3, "4": 2, "2": 1}
# Note: script.js has the same values; "7":5 then gap to "8":6,"9":7 for 48-card variant.

ROUNDS = (1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 2, 1)
NUM_PLAYERS = 4


@dataclass(frozen=True)
class Card:
    suit: str
    rank: str

    def __repr__(self) -> str:
        return f"{self.rank}{self.suit[0]}"


def new_deck() -> list[Card]:
    return [Card(s, r) for s in SUITS for r in RANKS]


def rank_value(card: Card) -> int:
    return RANK_VALUE[card.rank]


def card_strength(card: Card, trump_suit: str) -> int:
    """Trump-aware strength used for comparisons in heuristics."""
    return (100 if card.suit == trump_suit else 0) + rank_value(card)


def legal_cards(hand: Sequence[Card], trick: Sequence[Card], trump_suit: str) -> list[Card]:
    """Follow-suit rule then trump rule (same as getLegalCardsForSimulation)."""
    if not trick:
        return list(hand)
    led = trick[0].suit
    in_led = [c for c in hand if c.suit == led]
    if in_led:
        return in_led
    in_trump = [c for c in hand if c.suit == trump_suit]
    if in_trump:
        return in_trump
    return list(hand)


def trick_winner_index(trick: Sequence[Card], trump_suit: str) -> int:
    """Return the index inside `trick` of the winning card.

    Winner = highest trump if any, else highest card of the suit led.
    """
    led = trick[0].suit
    trumps = [(i, c) for i, c in enumerate(trick) if c.suit == trump_suit]
    if trumps:
        best = max(trumps, key=lambda t: rank_value(t[1]))
        return best[0]
    led_cards = [(i, c) for i, c in enumerate(trick) if c.suit == led]
    best = max(led_cards, key=lambda t: rank_value(t[1]))
    return best[0]


# ──────────────────────────────────────────────────────────────────────────────
#  Strategy protocols
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class RoundContext:
    """State snapshot passed to strategies for the current round."""

    hand: tuple[Card, ...]
    hand_size: int
    trump: Card
    trump_suit: str
    bids_so_far: tuple[int, ...]    # bids already announced this round (in bidding order)
    seat_index_in_bidding: int      # 0..3, where 3 means "last to bid"
    round_index: int                # 0..15


class BidStrategy:
    name: str = "base"

    def bid(self, ctx: RoundContext, rng: random.Random) -> int:
        raise NotImplementedError


@dataclass
class PlayContext:
    hand: tuple[Card, ...]
    trick: tuple[Card, ...]          # cards played so far in the current trick
    trump_suit: str
    own_bid: int
    own_tricks_won: int              # in this round so far
    hand_size: int
    remaining_tricks: int            # plays left this round (incl. current)
    round_index: int


class CardStrategy:
    name: str = "base"

    def pick(self, ctx: PlayContext, rng: random.Random) -> Card:
        raise NotImplementedError


# ──────────────────────────────────────────────────────────────────────────────
#  Game loop
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class RoundResult:
    round_index: int
    hand_size: int
    bids: tuple[int, ...]            # indexed by seat
    tricks: tuple[int, ...]          # indexed by seat
    points: tuple[int, ...]          # indexed by seat (delta this round)


@dataclass
class GameResult:
    rounds: list[RoundResult]
    final_scores: tuple[int, ...]    # cumulative, indexed by seat
    hit_count: tuple[int, ...]       # number of rounds each seat bid correctly


def _score_round(bid: int, tricks: int) -> int:
    return (10 + 3 * tricks) if bid == tricks else -3 * abs(bid - tricks)


def play_round(
    round_index: int,
    dealer: int,
    bid_strategies: Sequence[BidStrategy],
    card_strategies: Sequence[CardStrategy],
    rng: random.Random,
) -> RoundResult:
    hand_size = ROUNDS[round_index]

    # Deal
    deck = new_deck()
    rng.shuffle(deck)
    hands: list[list[Card]] = [[] for _ in range(NUM_PLAYERS)]
    for _ in range(hand_size):
        for p in range(NUM_PLAYERS):
            hands[p].append(deck.pop())
    trump = deck.pop()
    trump_suit = trump.suit

    # Bidding order: counter-clockwise starting at dealer's right (dealer - 1)
    bidding_order = [((dealer - i) % NUM_PLAYERS) for i in range(1, NUM_PLAYERS + 1)]
    bids: list[int | None] = [None] * NUM_PLAYERS
    bids_so_far: list[int] = []
    for seat_slot, seat in enumerate(bidding_order):
        ctx = RoundContext(
            hand=tuple(hands[seat]),
            hand_size=hand_size,
            trump=trump,
            trump_suit=trump_suit,
            bids_so_far=tuple(bids_so_far),
            seat_index_in_bidding=seat_slot,
            round_index=round_index,
        )
        b = bid_strategies[seat].bid(ctx, rng)
        # Clamp defensively
        b = max(0, min(hand_size, int(b)))
        bids[seat] = b
        bids_so_far.append(b)

    # Play `hand_size` tricks. Leader of first trick = first bidder.
    tricks_won = [0] * NUM_PLAYERS
    leader = bidding_order[0]
    for t in range(hand_size):
        # Turn order for this trick, counter-clockwise starting at leader
        order = [((leader - i) % NUM_PLAYERS) for i in range(NUM_PLAYERS)]
        # Actually CCW from leader means leader, leader-1, leader-2, leader-3
        # which matches gameDirection="counterclockwise" in script.js.
        order = [leader]
        for k in range(1, NUM_PLAYERS):
            order.append((leader - k) % NUM_PLAYERS)

        trick_cards: list[Card] = []
        for play_idx, seat in enumerate(order):
            ctx = PlayContext(
                hand=tuple(hands[seat]),
                trick=tuple(trick_cards),
                trump_suit=trump_suit,
                own_bid=bids[seat],  # type: ignore[arg-type]
                own_tricks_won=tricks_won[seat],
                hand_size=hand_size,
                remaining_tricks=hand_size - t,
                round_index=round_index,
            )
            card = card_strategies[seat].pick(ctx, rng)
            # Safety: verify legality
            legal = legal_cards(hands[seat], trick_cards, trump_suit)
            if card not in legal:
                card = legal[0]
            hands[seat].remove(card)
            trick_cards.append(card)
        win_idx = trick_winner_index(trick_cards, trump_suit)
        winner_seat = order[win_idx]
        tricks_won[winner_seat] += 1
        leader = winner_seat

    points = tuple(_score_round(bids[p], tricks_won[p]) for p in range(NUM_PLAYERS))  # type: ignore[arg-type]
    return RoundResult(
        round_index=round_index,
        hand_size=hand_size,
        bids=tuple(bids),  # type: ignore[arg-type]
        tricks=tuple(tricks_won),
        points=points,
    )


def play_game(
    bid_strategies: Sequence[BidStrategy],
    card_strategies: Sequence[CardStrategy],
    rng: random.Random | None = None,
    start_dealer: int | None = None,
) -> GameResult:
    assert len(bid_strategies) == NUM_PLAYERS
    assert len(card_strategies) == NUM_PLAYERS
    rng = rng or random.Random()
    dealer = rng.randrange(NUM_PLAYERS) if start_dealer is None else start_dealer

    rounds: list[RoundResult] = []
    scores = [0] * NUM_PLAYERS
    hits = [0] * NUM_PLAYERS
    for r_idx in range(len(ROUNDS)):
        res = play_round(r_idx, dealer, bid_strategies, card_strategies, rng)
        rounds.append(res)
        for p in range(NUM_PLAYERS):
            scores[p] += res.points[p]
            if res.bids[p] == res.tricks[p]:
                hits[p] += 1
        # Pass the deal counter-clockwise (same as script.js)
        dealer = (dealer - 1) % NUM_PLAYERS

    return GameResult(rounds=rounds, final_scores=tuple(scores), hit_count=tuple(hits))
