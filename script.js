/***********************
 * LA PODRIDA — JUEGO DE CARTAS (RESPONSIVE + DIFICULTAD)
 ***********************/

const IMG_BASE = 'img/';

/***********************
 * CONFIGURACION DE DIFICULTAD
 ***********************/
const DIFF_CONFIG = {
  easy:   { bidSims: 300,  cardSims: 10,  bidNoise: 0.35, randomPlay: 0.30, smartSim: false },
  medium: { bidSims: 2000, cardSims: 40,  bidNoise: 0,    randomPlay: 0,    smartSim: false },
  hard:   { bidSims: 8000, cardSims: 150, bidNoise: 0,    randomPlay: 0,    smartSim: true  }
};
let difficulty = 'medium';
let diffCfg = DIFF_CONFIG.medium;

/***********************
 * CONFIGURACION DEL JUEGO
 ***********************/
let gameDirection = "counterclockwise";
let deckVariant = 40;

/***********************
 * VARIABLES Y ESTADO DEL JUEGO
 ***********************/
const rounds = [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 2, 1];
let currentRoundIndex = 0;
let handSize = rounds[currentRoundIndex];
const suitOrder = { "oros": 0, "bastos": 1, "copas": 2, "espadas": 3 };
let players = [
  { id: 0, name: "AI North", type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "north" },
  { id: 1, name: "AI East",  type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "east"  },
  { id: 2, name: "Tú",       type: "human", hand: [], bid: null, tricks: 0, score: 0, position: "south" },
  { id: 3, name: "AI West",  type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "west"  }
];
let deck = [];
let trump = null;
let trumpSuit = null;
let dealer = null;
let biddingOrder = [];
let biddingIndex = 0;
let currentPhase = "bidding";
let currentTrick = [];
let currentPlayer = null;
let scoreData = [];
let playedCardsThisRound = [];

/***********************
 * FUNCIONES UTILITARIAS
 ***********************/
function assignAINames() {
  const names = ["Newton", "Curie", "Tesla", "Hawkin", "Galilei", "Fermi", "Bohr", "Dirac", "Planck"];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  let c = 0;
  players.forEach(p => { if (p.type === "ai") { p.name = names[c++]; } });
}

function createDeck() {
  const suits = ["espadas", "oros", "copas", "bastos"];
  const ranks = deckVariant === 40
    ? ["1", "2", "3", "4", "5", "6", "7", "S", "C", "R"]
    : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "C", "R"];
  const d = [];
  for (const suit of suits) for (const rank of ranks) d.push({ suit, rank });
  return d;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getRankValue(rank) {
  const v = { "1":12, "3":11, "R":10, "C":9, "S":8, "9":7, "8":6, "7":5, "6":4, "5":3, "4":2, "2":1 };
  return v[rank] || 0;
}

function getSuitName(suit) {
  const n = { espadas: "Espadas", oros: "Oros", copas: "Copas", bastos: "Bastos" };
  return n[suit] || suit;
}

function getCardImageSrc(card) {
  const num = card.rank === "S" ? "10" : card.rank === "C" ? "11" : card.rank === "R" ? "12" : card.rank;
  const s = card.suit === "oros" ? "o" : card.suit === "bastos" ? "b" : card.suit === "copas" ? "c" : "e";
  return IMG_BASE + num + s + "-hd.png";
}

function createCardElement(card, faceUp) {
  const img = document.createElement("img");
  img.classList.add("card");
  img.draggable = false;
  img.width = 94; img.height = 140; // natural size; CSS overrides display size
  img.src = faceUp ? getCardImageSrc(card) : IMG_BASE + "reverso-hd.png";
  return img;
}

function cardToText(card) {
  const r = card.rank === "1" ? "As" : card.rank === "S" ? "Sota" : card.rank === "C" ? "Caballo" : card.rank === "R" ? "Rey" : card.rank;
  const s = { oros: "de Oros", espadas: "de Espadas", copas: "de Copas", bastos: "de Bastos" };
  return r + " " + (s[card.suit] || "");
}

/***********************
 * FUNCIONES DE SIMULACION PARA LA IA
 ***********************/
function getLegalCardsForSimulation(hand, trick, ts) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card.suit;
  if (hand.some(c => c.suit === led)) return hand.filter(c => c.suit === led);
  if (hand.some(c => c.suit === ts))  return hand.filter(c => c.suit === ts);
  return hand.slice();
}

// Trump-aware strength: trumps dominate any non-trump card
function cardStrength(card, ts) {
  return (card.suit === ts ? 100 : 0) + getRankValue(card.rank);
}

// Heuristic card selection for smarter simulation opponents (hard mode)
function heuristicSimSelect(hand, trick, ts) {
  const legal = getLegalCardsForSimulation(hand, trick, ts);
  if (legal.length <= 1) return legal[0];

  if (trick.length === 0) {
    // Leading: prefer strongest card (trump-aware). Small noise to avoid determinism.
    if (Math.random() < 0.85) {
      return legal.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
    }
    return legal[Math.floor(Math.random() * legal.length)];
  }

  // Following: determine the current winning card
  const ledSuit = trick[0].card.suit;
  let bestCard = trick[0].card;
  trick.forEach(play => {
    if (play.card.suit === ts) {
      if (bestCard.suit !== ts || getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    } else if (bestCard.suit !== ts && play.card.suit === ledSuit) {
      if (getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    }
  });

  // Find legal cards that can beat the current winner
  const winners = legal.filter(c => {
    if (c.suit === ts && bestCard.suit !== ts) return true;
    if (c.suit === ts && bestCard.suit === ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    if (c.suit === ledSuit && bestCard.suit !== ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    return false;
  });

  if (winners.length > 0 && Math.random() < 0.85) {
    // Play cheapest winner (economize strong cards)
    return winners.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
  }

  // Can't win or choosing not to: dump weakest card
  if (Math.random() < 0.85) {
    return legal.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
  }
  return legal[Math.floor(Math.random() * legal.length)];
}

// Bid-aware deterministic play for hard-mode bid simulation. The bidder
// assumes a specific target and plays tactically to hit it exactly.
// Matches the `bid_aware_play` policy validated in sim/target_aware_experiment.py.
/***********************
 * FAST POLICY (iteración 8)
 *
 * Deterministic feature-based card-selection policy shared between bid
 * simulation and (eventually) card play. The key benefit over bidAwarePlay
 * is that it uses visible cards to estimate the probability of winning
 * the current trick, so the bidder's simulation models what the player
 * will actually be able to execute.
 *
 * Validated in sim/benchmark_latency_matched.py: BF_B (FastPolicy-based
 * bid + existing aiSelectCard for play) gives +6 pts/game over V3 while
 * halving bid latency on hs=5 (106ms → 52ms in browser).
 ***********************/

// Cards that could still be in opponents' hands. Excludes own hand,
// trump card, played_this_round, and the current trick.
function fpUnseenCards(myHand, trumpCard, playedThisRound, trickSoFar) {
  const seen = new Set();
  const key = c => c.suit + "|" + c.rank;
  myHand.forEach(c => seen.add(key(c)));
  if (trumpCard) seen.add(key(trumpCard));
  playedThisRound.forEach(c => seen.add(key(c)));
  trickSoFar.forEach(c => seen.add(key(c)));
  const deck = createDeck();
  return deck.filter(c => !seen.has(key(c)));
}

// Current winning card in the trick (null if trick empty)
function fpCurrentWinningCard(trickSoFar, ts) {
  if (trickSoFar.length === 0) return null;
  const led = trickSoFar[0].suit;
  let best = trickSoFar[0];
  for (let i = 1; i < trickSoFar.length; i++) {
    const c = trickSoFar[i];
    if (c.suit === ts) {
      if (best.suit !== ts || getRankValue(c.rank) > getRankValue(best.rank)) best = c;
    } else if (best.suit !== ts && c.suit === led) {
      if (getRankValue(c.rank) > getRankValue(best.rank)) best = c;
    }
  }
  return best;
}

// Probability estimate that `candidate` wins the trick if played now,
// given unseen cards and how many opponents still have to play.
function fpEstimatePWin(candidate, trickSoFar, ts, remainingAfterMe, unseenCards) {
  // Determine what becomes the "card to beat" after my play
  const ledSuit = trickSoFar.length > 0 ? trickSoFar[0].suit : candidate.suit;
  const currentWinner = fpCurrentWinningCard(trickSoFar, ts);
  let targetCard, targetSuit;
  if (candidate.suit === ts && (!currentWinner || currentWinner.suit !== ts)) {
    targetCard = candidate; targetSuit = ts;
  } else if (!currentWinner) {
    targetCard = candidate; targetSuit = candidate.suit;
  } else if (currentWinner.suit === ts && candidate.suit === ts &&
             getRankValue(candidate.rank) > getRankValue(currentWinner.rank)) {
    targetCard = candidate; targetSuit = ts;
  } else if (currentWinner.suit !== ts && candidate.suit === ledSuit &&
             getRankValue(candidate.rank) > getRankValue(currentWinner.rank)) {
    targetCard = candidate; targetSuit = ledSuit;
  } else {
    return 0.0;
  }

  if (remainingAfterMe <= 0) return 1.0;

  // Count threats
  let threats = 0;
  for (const c of unseenCards) {
    if (targetSuit === ts) {
      if (c.suit === ts && getRankValue(c.rank) > getRankValue(targetCard.rank)) threats++;
    } else {
      if (c.suit === ts) threats++;
      else if (c.suit === targetSuit && getRankValue(c.rank) > getRankValue(targetCard.rank)) threats++;
    }
  }
  if (unseenCards.length === 0) return 1.0;
  const pThreat = Math.min(1.0, remainingAfterMe / Math.max(1, players.length - 1));
  return Math.pow(1.0 - pThreat, threats);
}

// FastPolicy: deterministic feature-based pick. Weights chosen manually (v0)
function fastPolicyPick(hand, trickSoFar, ts, myBid, myTricksWon, tricksRemaining,
                       trumpCard, playedThisRound) {
  const legal = getLegalCardsForSimulation(hand, trickSoFar, ts);
  if (legal.length === 1) return legal[0];

  const tricksNeeded = myBid - myTricksWon;
  const needWin = tricksNeeded > 0;
  const avoidWin = tricksNeeded <= 0;
  const mustWinAll = tricksNeeded >= tricksRemaining;
  const slack = tricksRemaining - tricksNeeded;
  const remainingAfterMe = (players.length - 1) - trickSoFar.length;
  const unseen = fpUnseenCards(hand, trumpCard, playedThisRound, trickSoFar);

  // Precompute "we hold a sure winner somewhere in our hand"
  let weHaveSureWinner = false;
  for (const c of hand) {
    if (c.suit === ts && getRankValue(c.rank) >= 11) { weHaveSureWinner = true; break; }
  }

  // Hand-tuned feature weights (FastPolicy v0)
  const W = {
    alignNeed: 10.0, alignAvoid: 10.0,
    wasteTrump: 3.0, shedDanger: 2.0,
    saveSureWinner: 8.0, savePreserve: 2.0,
    cheapWinner: 1.5,
  };

  let bestCard = null, bestScore = -Infinity;
  for (const c of legal) {
    let score = 0;
    const pWin = fpEstimatePWin(c, trickSoFar, ts, remainingAfterMe, unseen);

    if (mustWinAll) {
      score += W.alignNeed * (1.5 * pWin) + 0.01 * cardStrength(c, ts);
    } else if (needWin) {
      score += W.alignNeed * pWin;
      score -= W.cheapWinner * (cardStrength(c, ts) / 112.0) * pWin;
    } else if (avoidWin) {
      score -= W.alignAvoid * pWin;
      if (trickSoFar.length === 0 && c.suit !== ts && getRankValue(c.rank) >= 10) {
        score += W.shedDanger;
      }
      if (c.suit === ts) score -= W.wasteTrump * (getRankValue(c.rank) / 12.0);
    } else {
      score -= 0.5 * pWin;
    }

    const sureWinnerHere = c.suit === ts && getRankValue(c.rank) >= 11;
    if (sureWinnerHere && slack >= 1 && !mustWinAll) {
      score -= W.saveSureWinner;
    }
    if (!sureWinnerHere && weHaveSureWinner && slack >= 1 && !mustWinAll) {
      score += W.savePreserve;
    }

    if (score > bestScore) { bestScore = score; bestCard = c; }
  }
  return bestCard || legal[0];
}

/***********************
 * BID SIMULATION USING FASTPOLICY (iteración 8)
 *
 * One rollout of a full round where every seat (including the bidder)
 * plays with fastPolicyPick. The bidder uses target=target; opponents
 * use their real bid if already declared, or a rough guess otherwise.
 * Returns tricks won by the bidder in this rollout.
 ***********************/
function simulateRoundForBidBF(player, target) {
  // Build random hands for opponents from unseen deck
  const excluded = new Set();
  const key = c => c.suit + "|" + c.rank;
  excluded.add(key(trump));
  player.hand.forEach(c => excluded.add(key(c)));
  const deckPool = createDeck().filter(c => !excluded.has(key(c)));
  // Shuffle
  for (let i = deckPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deckPool[i], deckPool[j]] = [deckPool[j], deckPool[i]];
  }

  const simHands = {};
  simHands[player.id] = player.hand.slice();
  let idx = 0;
  for (const p of players) {
    if (p.id === player.id) continue;
    simHands[p.id] = deckPool.slice(idx, idx + handSize);
    idx += handSize;
  }

  // Figure out which opponent bids are known (those that already bid this round)
  const oppBidKnown = {};
  for (let i = 0; i < biddingIndex; i++) {
    const pid = biddingOrder[i];
    if (pid !== player.id) {
      const p = players.find(pp => pp.id === pid);
      if (p && p.bid !== null) oppBidKnown[pid] = p.bid;
    }
  }
  const defaultOppBid = Math.max(0, Math.floor(handSize / players.length));
  const oppBid = (pid) => oppBidKnown.hasOwnProperty(pid) ? oppBidKnown[pid] : defaultOppBid;

  // Play the full round
  const tricksWon = {};
  players.forEach(p => tricksWon[p.id] = 0);
  // Start leader is the first in biddingOrder (same as simulateRoundForBidWithTarget)
  let simOrder = biddingOrder.slice();
  const simPlayed = [];

  for (let t = 0; t < handSize; t++) {
    const tricksRemaining = handSize - t;
    const trickCards = [];
    for (const pid of simOrder) {
      const hand = simHands[pid];
      if (hand.length === 0) continue;
      const bid = (pid === player.id) ? target : oppBid(pid);
      const chosen = fastPolicyPick(
        hand, trickCards, trump.suit,
        bid, tricksWon[pid], tricksRemaining,
        trump, simPlayed,
      );
      const ix = hand.findIndex(c => c.suit === chosen.suit && c.rank === chosen.rank);
      if (ix >= 0) hand.splice(ix, 1);
      trickCards.push(chosen);
    }
    // Wrap trickCards into {playerId, card} for determineTrickWinnerSim
    const trick = trickCards.map((c, i) => ({ playerId: simOrder[i], card: c }));
    const winner = determineTrickWinnerSim(trick, trump.suit);
    tricksWon[winner]++;
    // Record plays this round (for FastPolicy unseen-cards context next trick)
    trickCards.forEach(c => simPlayed.push(c));
    // Rotate simOrder so winner leads next
    const wi = simOrder.indexOf(winner);
    simOrder = simOrder.slice(wi).concat(simOrder.slice(0, wi));
  }
  return tricksWon[player.id];
}

function bidAwarePlay(hand, trick, ts, target, tricksWon, tricksRemaining) {
  const legal = getLegalCardsForSimulation(hand, trick, ts);
  if (legal.length <= 1) return legal[0];
  const tricksNeeded = target - tricksWon;
  const slack = tricksRemaining - tricksNeeded;

  if (trick.length === 0) {
    // Leading
    if (tricksNeeded >= tricksRemaining) {
      // Must win every remaining trick: lead strongest (arrastrar triunfo)
      return legal.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
    }
    if (tricksNeeded <= 0) {
      // Don't want any more tricks: shed highest non-trump first
      const nonTrump = legal.filter(c => c.suit !== ts);
      if (nonTrump.length > 0) {
        return nonTrump.reduce((a, b) => getRankValue(a.rank) >= getRankValue(b.rank) ? a : b);
      }
      return legal.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
    }
    // In between: if I hold a near-sure winner (1 or 3 of trump) and have
    // slack, burn a high non-trump first and save the sure winner for later.
    const sureWinner = legal.some(c => c.suit === ts && getRankValue(c.rank) >= 11);
    const nonTrump = legal.filter(c => c.suit !== ts);
    if (sureWinner && slack >= 1 && nonTrump.length > 0) {
      return nonTrump.reduce((a, b) => getRankValue(a.rank) >= getRankValue(b.rank) ? a : b);
    }
    return legal.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
  }

  // Following: determine who is currently winning
  const ledSuit = trick[0].card.suit;
  let bestCard = trick[0].card;
  trick.forEach(play => {
    if (play.card.suit === ts) {
      if (bestCard.suit !== ts || getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    } else if (bestCard.suit !== ts && play.card.suit === ledSuit) {
      if (getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    }
  });
  const beats = c => {
    if (c.suit === ts && bestCard.suit !== ts) return true;
    if (c.suit === ts && bestCard.suit === ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    if (c.suit === ledSuit && bestCard.suit !== ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    return false;
  };
  const winners = legal.filter(beats);
  const losers = legal.filter(c => !beats(c));

  if (tricksNeeded > 0) {
    if (winners.length > 0) {
      return winners.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
    }
    return losers.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
  }
  // No more tricks wanted: dump highest loser while we can
  if (losers.length > 0) {
    return losers.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
  }
  return winners.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
}

function determineTrickWinnerSim(trick, ts) {
  const led = trick[0].card.suit;
  let winning = trick[0];
  trick.forEach(play => {
    if (play.card.suit === ts) {
      if (winning.card.suit !== ts || getRankValue(play.card.rank) > getRankValue(winning.card.rank))
        winning = play;
    } else if (winning.card.suit !== ts && play.card.suit === led) {
      if (getRankValue(play.card.rank) > getRankValue(winning.card.rank))
        winning = play;
    }
  });
  return winning.playerId;
}

function simulateRoundForBid(player) {
  let deckSim = createDeck().filter(c => !(c.suit === trump.suit && c.rank === trump.rank));
  player.hand.forEach(c => { deckSim = deckSim.filter(d => !(d.suit === c.suit && d.rank === c.rank)); });
  const simHands = {};
  simHands[player.id] = player.hand.slice();
  players.forEach(p => {
    if (p.id !== player.id) {
      simHands[p.id] = [];
      for (let i = 0; i < handSize; i++) {
        const idx = Math.floor(Math.random() * deckSim.length);
        simHands[p.id].push(deckSim[idx]);
        deckSim.splice(idx, 1);
      }
    }
  });
  const simOrder = biddingOrder.slice();
  const copy = JSON.parse(JSON.stringify(simHands));
  let tricksWon = 0;
  for (let t = 0; t < handSize; t++) {
    const trick = [];
    simOrder.forEach(pid => {
      const hand = copy[pid];
      let chosen;
      if (diffCfg.smartSim && pid !== player.id) {
        // Hard mode: opponents play like real heuristic players, not max-card bots.
        // Bidder still plays greedy-max so results reflect "bidder's best case".
        chosen = heuristicSimSelect(hand, trick, trump.suit);
      } else {
        const legal = getLegalCardsForSimulation(hand, trick, trump.suit);
        chosen = legal[0];
        legal.forEach(c => { if (getRankValue(c.rank) > getRankValue(chosen.rank)) chosen = c; });
      }
      const idx = hand.findIndex(c => c.suit === chosen.suit && c.rank === chosen.rank);
      if (idx >= 0) hand.splice(idx, 1);
      trick.push({ playerId: pid, card: chosen });
    });
    const winner = determineTrickWinnerSim(trick, trump.suit);
    if (winner === player.id) tricksWon++;
    const wi = simOrder.indexOf(winner);
    const rotated = simOrder.slice(wi).concat(simOrder.slice(0, wi));
    simOrder.length = 0; rotated.forEach(x => simOrder.push(x));
  }
  return tricksWon;
}

// Hard-mode bid simulation with a specific target: the bidder plays
// bid-aware for that target, opponents play the usual heuristic.
// Returns how many tricks the bidder actually ended up with.
function simulateRoundForBidWithTarget(player, target) {
  let deckSim = createDeck().filter(c => !(c.suit === trump.suit && c.rank === trump.rank));
  player.hand.forEach(c => { deckSim = deckSim.filter(d => !(d.suit === c.suit && d.rank === c.rank)); });
  const simHands = {};
  simHands[player.id] = player.hand.slice();
  players.forEach(p => {
    if (p.id !== player.id) {
      simHands[p.id] = [];
      for (let i = 0; i < handSize; i++) {
        const idx = Math.floor(Math.random() * deckSim.length);
        simHands[p.id].push(deckSim[idx]);
        deckSim.splice(idx, 1);
      }
    }
  });
  const simOrder = biddingOrder.slice();
  const copy = JSON.parse(JSON.stringify(simHands));
  let tricksWon = 0;
  for (let t = 0; t < handSize; t++) {
    const trick = [];
    const tricksRemaining = handSize - t;
    simOrder.forEach(pid => {
      const hand = copy[pid];
      let chosen;
      if (pid === player.id) {
        chosen = bidAwarePlay(hand, trick, trump.suit, target, tricksWon, tricksRemaining);
      } else {
        chosen = heuristicSimSelect(hand, trick, trump.suit);
      }
      const idx = hand.findIndex(c => c.suit === chosen.suit && c.rank === chosen.rank);
      if (idx >= 0) hand.splice(idx, 1);
      trick.push({ playerId: pid, card: chosen });
    });
    const winner = determineTrickWinnerSim(trick, trump.suit);
    if (winner === player.id) tricksWon++;
    const wi = simOrder.indexOf(winner);
    const rotated = simOrder.slice(wi).concat(simOrder.slice(0, wi));
    simOrder.length = 0; rotated.forEach(x => simOrder.push(x));
  }
  return tricksWon;
}

function simulateBid(player) {
  const totalSims = diffCfg.bidSims;

  if (diffCfg.smartSim) {
    // BeliefFast target-aware bidding (iteración 8): for each candidate bid
    // b in [0..handSize], run simsPerTarget rollouts using FastPolicy for
    // every seat (bidder with target=b, opponents with their known bid).
    // Pick the b with the highest expected score (hits as tiebreak).
    //
    // simsPerTarget = 30 matches the winning point in
    // sim/benchmark_latency_matched.py (BF_B total_sims=60 → per_b=30),
    // which validated at +6 pts/game over V3 and halved bid latency
    // (106ms → 52ms p95 on hs=5 in Chrome).
    const simsPerTarget = 30;
    let bestBid = 0, bestEV = -Infinity, bestHits = -1;
    const logParts = [];
    for (let b = 0; b <= handSize; b++) {
      let hits = 0;
      let ev = 0;
      for (let i = 0; i < simsPerTarget; i++) {
        const result = simulateRoundForBidBF(player, b);
        if (result === b) hits++;
        ev += (result === b) ? (10 + 3 * b) : (-3 * Math.abs(b - result));
      }
      ev /= simsPerTarget;
      const hitPct = Math.round(hits * 100 / simsPerTarget);
      logParts.push(b + "→EV" + ev.toFixed(1) + "/" + hitPct + "%");
      if (ev > bestEV || (ev === bestEV && hits > bestHits)) {
        bestEV = ev; bestHits = hits; bestBid = b;
      }
    }
    updateSimLog(player.name + ": R" + (currentRoundIndex + 1) + ", " + handSize +
                 " cartas, BF target-aware: " + logParts.join(" ") + " → " + bestBid);
    return bestBid;
  }

  // Easy/medium: legacy mode — greedy opponents, pick distribution mode.
  const freq = {};
  for (let i = 0; i < totalSims; i++) {
    const tricks = simulateRoundForBid(player);
    freq[tricks] = (freq[tricks] || 0) + 1;
  }
  let mode = 0, maxCount = 0;
  for (const key in freq) {
    if (freq[key] > maxCount) { maxCount = freq[key]; mode = parseInt(key); }
  }
  let chosenBid = mode;
  const parts = [];
  for (let i = 0; i <= handSize; i++) parts.push((freq[i] || 0) + " de " + i);
  updateSimLog(player.name + ": R" + (currentRoundIndex + 1) + ", " + handSize + " cartas, " + parts.join(", "));
  if (diffCfg.bidNoise > 0 && Math.random() < diffCfg.bidNoise) {
    const delta = Math.random() < 0.5 ? 1 : -1;
    chosenBid = Math.max(0, Math.min(handSize, chosenBid + delta));
  }
  return chosenBid;
}

// AI latency instrumentation. Enable by running `window.AI_LATENCY = []` in
// the browser console before a game. Each decision pushes
// {kind, handSize, ms} and you can inspect percentiles afterwards with
// e.g. `AI_LATENCY.filter(x => x.kind === "bid").map(x => x.ms).sort()`.
function aiComputeBid(pid) {
  const t0 = (typeof window !== "undefined" && window.AI_LATENCY) ? performance.now() : null;
  const result = simulateBid(players.find(p => p.id === pid));
  if (t0 !== null) {
    window.AI_LATENCY.push({ kind: "bid", handSize, ms: performance.now() - t0 });
  }
  return result;
}

// Bid-aware deterministic play for the AI's own future turns inside a simulation.
// tricksNeeded = aiPlayer.bid - (tricks already won in real game + tricks won in this simulation)
function aiOwnSimSelect(hand, trick, ts, tricksNeeded, tricksRemaining) {
  const legal = getLegalCardsForSimulation(hand, trick, ts);
  if (legal.length <= 1) return legal[0];

  if (trick.length === 0) {
    // Leading: need all remaining -> strongest; don't want more -> weakest; mid -> mid (cheap winner)
    if (tricksNeeded >= tricksRemaining) {
      return legal.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
    }
    if (tricksNeeded <= 0) {
      return legal.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
    }
    // Neutral lead: strong card to try to take a trick
    return legal.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
  }

  // Following: compute current winner and partition legal cards
  const ledSuit = trick[0].card.suit;
  let bestCard = trick[0].card;
  trick.forEach(play => {
    if (play.card.suit === ts) {
      if (bestCard.suit !== ts || getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    } else if (bestCard.suit !== ts && play.card.suit === ledSuit) {
      if (getRankValue(play.card.rank) > getRankValue(bestCard.rank))
        bestCard = play.card;
    }
  });
  const winners = legal.filter(c => {
    if (c.suit === ts && bestCard.suit !== ts) return true;
    if (c.suit === ts && bestCard.suit === ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    if (c.suit === ledSuit && bestCard.suit !== ts) return getRankValue(c.rank) > getRankValue(bestCard.rank);
    return false;
  });
  const losers = legal.filter(c => !winners.includes(c));

  if (tricksNeeded > 0 && winners.length > 0) {
    // Want this trick: use cheapest winner
    return winners.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
  }
  if (tricksNeeded <= 0 && losers.length > 0) {
    // Don't want this trick: dump highest loser (preserve small cards for later loses)
    return losers.reduce((a, b) => cardStrength(a, ts) >= cardStrength(b, ts) ? a : b);
  }
  // Forced: either can't avoid winning or can't win; play weakest legal card
  return legal.reduce((a, b) => cardStrength(a, ts) <= cardStrength(b, ts) ? a : b);
}

function simulateRemainingRoundForCard(aiPlayer, candidateIndex) {
  let simTrick = currentTrick.slice();
  const aiHandSim = aiPlayer.hand.slice();
  const candidateCard = aiHandSim[candidateIndex];
  for (let i = 0; i < aiHandSim.length; i++) {
    if (aiHandSim[i].suit === candidateCard.suit && aiHandSim[i].rank === candidateCard.rank) {
      aiHandSim.splice(i, 1); break;
    }
  }
  let fullDeck = createDeck();
  fullDeck = fullDeck.filter(c => !(c.suit === trump.suit && c.rank === trump.rank));
  players.find(p => p.id === aiPlayer.id).hand.forEach(c => {
    fullDeck = fullDeck.filter(d => !(d.suit === c.suit && d.rank === c.rank));
  });
  currentTrick.forEach(played => {
    fullDeck = fullDeck.filter(c => !(c.suit === played.card.suit && c.rank === played.card.rank));
  });
  playedCardsThisRound.forEach(played => {
    fullDeck = fullDeck.filter(c => !(c.suit === played.suit && c.rank === played.rank));
  });

  const simOppHands = {};
  players.forEach(p => {
    if (p.id !== aiPlayer.id) {
      simOppHands[p.id] = [];
      for (let i = 0; i < p.hand.length; i++) {
        if (fullDeck.length === 0) break;
        const idx = Math.floor(Math.random() * fullDeck.length);
        simOppHands[p.id].push(fullDeck[idx]);
        fullDeck.splice(idx, 1);
      }
    }
  });

  // Complete current trick: the candidate card is the AI's play this trick.
  // Figure out the real turn order starting from the leader of currentTrick
  // and going counter-clockwise (matches gameDirection). Skip players who
  // already played, play candidateCard when it's the AI's turn, and fill in
  // the remaining opponents from there.
  const leaderId = simTrick.length > 0 ? simTrick[0].playerId : aiPlayer.id;
  const leaderIdx = players.findIndex(p => p.id === leaderId);
  const turnOrderTrick = [];
  if (gameDirection === "clockwise") {
    for (let i = 0; i < players.length; i++) turnOrderTrick.push(players[(leaderIdx + i) % players.length].id);
  } else {
    for (let i = 0; i < players.length; i++) turnOrderTrick.push(((leaderIdx - i) % players.length + players.length) % players.length);
  }
  const alreadyPlayed = new Set(simTrick.map(item => item.playerId));
  // Running count of tricks won by each opponent during this single simulation,
  // so we can feed bid-aware opponents their live tricksWon (they know their
  // own bids and play to cook them). Seed from the real game state.
  const oppSimTricks = {};
  players.forEach(p => { if (p.id !== aiPlayer.id) oppSimTricks[p.id] = p.tricks; });

  const pickOppCard = (pid, simHand, currentTrickCards) => {
    if (diffCfg.smartSim) {
      // Hard mode: opponents play bid-aware with their known bid and their
      // simulated tricksWon so far. Much more realistic than anonymous
      // heuristic. Validated (+4.6 pts/game) in sim/benchmark_reviewer.py.
      //
      // tricksRemaining = plays this opponent has left in the round,
      // including the current one. simHand.length already counts the
      // about-to-be-played card (card is removed *after* pickOppCard
      // returns), so no +1 adjustment is needed regardless of whether
      // the trick has already been opened.
      const opp = players.find(pp => pp.id === pid);
      return bidAwarePlay(simHand, currentTrickCards, trump.suit,
                          opp.bid, oppSimTricks[pid], simHand.length);
    }
    let legal = getLegalCardsForSimulation(simHand, currentTrickCards, trump.suit);
    if (legal.length === 0) legal = simHand.slice();
    if (legal.length === 0) return null;
    return legal[Math.floor(Math.random() * legal.length)];
  };

  for (const pid of turnOrderTrick) {
    if (alreadyPlayed.has(pid)) continue;
    if (pid === aiPlayer.id) {
      // This is the whole point of the simulation: play the candidate.
      simTrick.push({ playerId: pid, card: candidateCard });
      continue;
    }
    const simHand = simOppHands[pid] || [];
    if (simHand.length === 0) continue;
    const chosen = pickOppCard(pid, simHand, simTrick);
    if (!chosen) continue;
    for (let i = 0; i < simHand.length; i++) {
      if (simHand[i].suit === chosen.suit && simHand[i].rank === chosen.rank) { simHand.splice(i, 1); break; }
    }
    simTrick.push({ playerId: pid, card: chosen });
  }

  if (simTrick.length === 0) return 0;
  let winner = determineTrickWinnerSim(simTrick, trump.suit);
  let tricksWon = (winner === aiPlayer.id) ? 1 : 0;
  if (winner !== aiPlayer.id && oppSimTricks[winner] !== undefined) oppSimTricks[winner]++;

  let turnOrder = [];
  const si = players.findIndex(p => p.id === winner);
  if (gameDirection === "clockwise") {
    for (let i = 0; i < players.length; i++) turnOrder.push(players[(si + i) % players.length].id);
  } else {
    for (let i = 0; i < players.length; i++) turnOrder.push(((si - i) % players.length + players.length) % players.length);
  }

  while (players.some(p => {
    if (p.id === aiPlayer.id) return aiHandSim.length > 0;
    return (simOppHands[p.id] && simOppHands[p.id].length > 0);
  })) {
    const trick = [];
    for (const pid of turnOrder) {
      const simHand = pid === aiPlayer.id ? aiHandSim : (simOppHands[pid] || []);
      if (simHand.length === 0) continue;
      let chosen;
      if (pid === aiPlayer.id) {
        const needed = aiPlayer.bid - aiPlayer.tricks - tricksWon;
        chosen = aiOwnSimSelect(simHand, trick, trump.suit, needed, simHand.length);
      } else {
        chosen = pickOppCard(pid, simHand, trick);
      }
      if (!chosen) continue;
      for (let i = 0; i < simHand.length; i++) {
        if (simHand[i].suit === chosen.suit && simHand[i].rank === chosen.rank) { simHand.splice(i, 1); break; }
      }
      trick.push({ playerId: pid, card: chosen });
    }
    if (trick.length === 0) break;
    const tw = determineTrickWinnerSim(trick, trump.suit);
    if (tw === aiPlayer.id) tricksWon++;
    else if (oppSimTricks[tw] !== undefined) oppSimTricks[tw]++;
    const wi = turnOrder.indexOf(tw);
    turnOrder = turnOrder.slice(wi).concat(turnOrder.slice(0, wi));
  }
  return tricksWon;
}

/***********************
 * FUNCIONES DE SELECCION DE CARTA (IA)
 ***********************/
function aiSelectCard(player) {
  let legalIndices = [];
  for (let i = 0; i < player.hand.length; i++) {
    if (isLegalPlay(player, player.hand[i])) legalIndices.push(i);
  }
  if (legalIndices.length === 0) legalIndices = player.hand.map((_, i) => i);
  if (legalIndices.length === 1) return legalIndices[0];

  // Difficulty: random play chance
  if (diffCfg.randomPlay > 0 && Math.random() < diffCfg.randomPlay) {
    return legalIndices[Math.floor(Math.random() * legalIndices.length)];
  }

  // Hard mode: deterministic shortcut when leading a trick and the situation is extreme
  if (diffCfg.smartSim && currentTrick.length === 0) {
    const tricksNeeded = player.bid - player.tricks;
    const tricksRemaining = player.hand.length;
    const legalCards = legalIndices.map(i => ({ idx: i, card: player.hand[i] }));
    if (tricksNeeded >= tricksRemaining) {
      // Must win every remaining trick: lead the strongest card to pull out rivals' top cards
      return legalCards.reduce((a, b) =>
        cardStrength(a.card, trump.suit) >= cardStrength(b.card, trump.suit) ? a : b
      ).idx;
    }
    if (tricksNeeded <= 0) {
      // Already at or above target: lead the weakest card to minimize chance of winning
      return legalCards.reduce((a, b) =>
        cardStrength(a.card, trump.suit) <= cardStrength(b.card, trump.suit) ? a : b
      ).idx;
    }
  }

  // Hard mode: deterministic play when last in trick (full information)
  if (diffCfg.smartSim && currentTrick.length === players.length - 1) {
    const tricksNeeded = player.bid - player.tricks;
    const ledSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
    // Find current winning card in the trick
    let bestCard = currentTrick[0] ? currentTrick[0].card : null;
    if (bestCard) {
      currentTrick.forEach(play => {
        if (play.card.suit === trump.suit) {
          if (bestCard.suit !== trump.suit || getRankValue(play.card.rank) > getRankValue(bestCard.rank))
            bestCard = play.card;
        } else if (bestCard.suit !== trump.suit && play.card.suit === ledSuit) {
          if (getRankValue(play.card.rank) > getRankValue(bestCard.rank))
            bestCard = play.card;
        }
      });
    }
    const legalCards = legalIndices.map(i => ({ idx: i, card: player.hand[i] }));
    // Determine which legal cards would win
    const winners = legalCards.filter(lc => {
      if (!bestCard) return true;
      if (lc.card.suit === trump.suit && bestCard.suit !== trump.suit) return true;
      if (lc.card.suit === trump.suit && bestCard.suit === trump.suit) return getRankValue(lc.card.rank) > getRankValue(bestCard.rank);
      if (lc.card.suit === ledSuit && bestCard.suit !== trump.suit) return getRankValue(lc.card.rank) > getRankValue(bestCard.rank);
      return false;
    });
    const losers = legalCards.filter(lc => !winners.some(w => w.idx === lc.idx));

    if (tricksNeeded > 0) {
      // Need more tricks: win with cheapest winner
      if (winners.length > 0) {
        return winners.reduce((a, b) => getRankValue(a.card.rank) <= getRankValue(b.card.rank) ? a : b).idx;
      }
      // Can't win: dump lowest card
      return losers.reduce((a, b) => getRankValue(a.card.rank) <= getRankValue(b.card.rank) ? a : b).idx;
    } else {
      // Already at or above target: lose with highest loser (save low cards)
      if (losers.length > 0) {
        return losers.reduce((a, b) => getRankValue(a.card.rank) >= getRankValue(b.card.rank) ? a : b).idx;
      }
      // Must win: use cheapest winner reluctantly
      return winners.reduce((a, b) => getRankValue(a.card.rank) <= getRankValue(b.card.rank) ? a : b).idx;
    }
  }

  const simsPerCandidate = diffCfg.cardSims;
  const target = player.bid;
  const candidateResults = [];

  legalIndices.forEach(ci => {
    const freq = {};
    for (let i = 0; i <= handSize; i++) freq[i] = 0;
    for (let sim = 0; sim < simsPerCandidate; sim++) {
      freq[simulateRemainingRoundForCard(player, ci)] += 1;
    }
    candidateResults.push({ candidate: ci, freq });
    const cardText = cardToText(player.hand[ci]);
    const parts = [];
    for (let i = 0; i <= handSize; i++) parts.push(freq[i] + " de " + i);
    updateSimLog(player.name + ", R" + (currentRoundIndex + 1) + ", " + cardText + ", " + parts.join(", "));
  });

  // Tiebreaker strength preference: if AI still needs tricks -> prefer stronger card,
  // otherwise (already at/over target) -> prefer weaker card. Epsilon keeps ties decidable.
  const tricksStillNeeded = target - player.tricks;
  const preferStrong = tricksStillNeeded > 0;
  const strengthScore = ci => {
    const s = cardStrength(player.hand[ci], trump.suit);
    return preferStrong ? s : -s;
  };

  // Hard mode: pick the card that maximises expected score, using the real
  // scoring function (+10+3·target if hit, −3·|diff| otherwise) as the weight.
  // Previously this used hand-tuned weights (1.0 / 0.4 / 0.15 / 0.05) which
  // underestimated how costly a miss-by-1 is relative to an exact hit.
  if (diffCfg.smartSim) {
    let bestCandidate = null, bestEV = -Infinity;
    const hitScore = 10 + 3 * target;
    candidateResults.forEach(r => {
      let ev = 0;
      const total = simsPerCandidate;
      for (let i = 0; i <= handSize; i++) {
        const p = r.freq[i] / total;
        const score = (i === target) ? hitScore : (-3 * Math.abs(i - target));
        ev += p * score;
      }
      // Tiebreaker: tiny nudge by strength preference (doesn't override real EV diffs)
      ev += strengthScore(r.candidate) * 1e-4;
      if (ev > bestEV) { bestEV = ev; bestCandidate = r.candidate; }
    });
    if (bestCandidate !== null) return bestCandidate;
  }

  // Normal mode: most simulations hitting target exactly (with strength tiebreaker)
  let best = null, bestKey = -Infinity;
  candidateResults.forEach(r => {
    const key = r.freq[target] + strengthScore(r.candidate) * 1e-4;
    if (key > bestKey) { bestKey = key; best = r.candidate; }
  });
  if (best !== null && candidateResults.some(r => r.freq[target] > 0)) return best;

  // Fallback: closest to target
  let bestClose = null, bestCloseKey = -Infinity;
  candidateResults.forEach(r => {
    const close = Math.max(r.freq[target + 1] || 0, r.freq[target - 1] || 0);
    const key = close + strengthScore(r.candidate) * 1e-4;
    if (key > bestCloseKey) { bestCloseKey = key; bestClose = r.candidate; }
  });
  if (bestClose !== null) return bestClose;

  return legalIndices[Math.floor(Math.random() * legalIndices.length)];
}

/***********************
 * LOG DE SIMULACIONES
 ***********************/
function updateSimLog(message) {
  const body = document.getElementById("sim-log-body");
  const p = document.createElement("p");
  p.textContent = message;
  body.appendChild(p);
  body.scrollTop = body.scrollHeight;
}

/***********************
 * FUNCIONES DEL JUEGO — UI
 ***********************/
function updateRoundInfo() {
  updateGameInfoBox();
  const tc = document.getElementById("trump-card");
  tc.style.backgroundImage = "url(" + getCardImageSrc(trump) + ")";
  tc.classList.remove("hidden");
  positionTrumpCardOnDealer();
}

function updateGameInfoBox() {
  const box = document.getElementById("game-info-box");
  if (!box) return;
  const totalBids = players.reduce((sum, p) => sum + (p.bid !== null ? p.bid : 0), 0);
  const suitKey = trump ? trump.suit : null;
  const suitName = trump ? getSuitName(trump.suit) : "-";
  box.querySelector(".gi-tricks").textContent = handSize + "/" + totalBids;
  box.querySelector(".gi-round").textContent  = (currentRoundIndex + 1) + "/" + rounds.length;
  const trumpRow = box.querySelector(".gi-trump");
  trumpRow.textContent = suitName;
  trumpRow.className = "gi-trump" + (suitKey ? " suit-" + suitKey : "");
}

function positionTrumpCardOnDealer() {
  const tc = document.getElementById("trump-card");
  if (!tc || dealer === null) return;
  const dealerPlayer = players.find(p => p.id === dealer);
  if (!dealerPlayer) return;
  const dealerBox = document.getElementById(
    dealerPlayer.type === "human" ? "info-south" :
    dealerPlayer.position === "north" ? "info-north" :
    dealerPlayer.position === "east"  ? "info-east"  : "info-west"
  );
  if (!dealerBox) return;
  const game = document.getElementById("game");
  const gameRect = game.getBoundingClientRect();
  const boxRect = dealerBox.getBoundingClientRect();
  const trumpH = tc.offsetHeight || boxRect.height * 0.55;
  const trumpW = tc.offsetWidth || boxRect.width * 0.55;
  // 2/3 of the card sticks above the box
  const top = boxRect.top - gameRect.top - (trumpH * 2 / 3);
  const left = boxRect.left - gameRect.left + (boxRect.width - trumpW) / 2;
  tc.style.top = top + "px";
  tc.style.left = left + "px";
  tc.style.right = "auto";
  tc.style.bottom = "auto";
}

window.addEventListener("resize", positionTrumpCardOnDealer);

function updatePlayerInfo() {
  players.forEach(p => {
    const infoDiv = document.getElementById(
      p.type === "human" ? "info-south" :
      p.position === "north" ? "info-north" :
      p.position === "east"  ? "info-east"  : "info-west"
    );
    if (!infoDiv) return;
    infoDiv.classList.toggle("is-dealer", p.id === dealer);
    infoDiv.innerHTML =
      '<div class="player-name">' + p.name + '</div>' +
      '<div class="player-score">' + p.score + '</div>' +
      '<div class="player-stats">' +
        '<div class="player-bid">' + (p.bid !== null ? p.bid : '-') + '</div>' +
        '<div class="player-tricks">' + p.tricks + '</div>' +
      '</div>';
  });
  updateGameInfoBox();
  positionTrumpCardOnDealer();
  highlightActivePlayer();
}

function highlightActivePlayer() {
  let activeId = null;
  if (currentPhase === "bidding" && biddingIndex < biddingOrder.length)
    activeId = biddingOrder[biddingIndex];
  else if (currentPhase === "playing")
    activeId = currentPlayer;

  players.forEach(p => {
    const div = document.getElementById(
      p.type === "human" ? "info-south" :
      p.position === "north" ? "info-north" :
      p.position === "east"  ? "info-east"  : "info-west"
    );
    if (div) {
      div.classList.toggle("active", p.id === activeId);
    }
  });
}

function showMessage(text) {
  document.getElementById("message").textContent = text;
}

function clearBidArea() { document.getElementById("bid-area").innerHTML = ""; }
function clearTrickArea() { document.getElementById("trick-area").innerHTML = ""; }

function updateHandsDisplay(animate) {
  const handDiv = document.getElementById("player-hand");
  handDiv.innerHTML = "";
  const human = players.find(p => p.type === "human");
  human.hand.sort((a, b) =>
    (suitOrder[a.suit] - suitOrder[b.suit]) || (getRankValue(b.rank) - getRankValue(a.rank))
  );
  for (let i = 0; i < human.hand.length; i++) {
    const card = human.hand[i];
    const el = createCardElement(card, true);
    el.dataset.index = i;
    if (currentPhase === "playing" && human.id === currentPlayer && isLegalPlay(human, card))
      el.classList.add("valid");
    if (human.id === currentPlayer && currentPhase === "playing")
      el.addEventListener("click", onHumanCardClick);
    if (animate) el.classList.add("deal-enter");
    handDiv.appendChild(el);
  }
  if (animate) {
    requestAnimationFrame(() => {
      const cards = handDiv.querySelectorAll(".card.deal-enter");
      cards.forEach((el, i) => {
        setTimeout(() => {
          el.classList.remove("deal-enter");
          el.classList.add("deal-active");
        }, i * 80);
      });
    });
  }
}

/***********************
 * FUNCIONES DEL JUEGO — LOGICA
 ***********************/
function playCard(playerId, cardIndex, fromElement) {
  const player = players.find(p => p.id === playerId);
  const card = player.hand.splice(cardIndex, 1)[0];
  const ANIM_DURATION = 500;

  // Create the final played-card element in the trick area (hidden initially)
  const el = createCardElement(card, true);
  el.classList.add("played-card");
  el.dataset.pos = player.position;
  el.style.visibility = "hidden";
  document.getElementById("trick-area").appendChild(el);
  currentTrick.push({ playerId, card, element: el });

  if (fromElement && player.type === "human") {
    // --- Flying clone approach for human cards ---
    const fromRect = fromElement.getBoundingClientRect();

    // Hide the hand card immediately (keep space)
    fromElement.style.opacity = "0";
    fromElement.style.pointerEvents = "none";

    // Force layout so the trick-area card has its final position
    requestAnimationFrame(() => {
      const toRect = el.getBoundingClientRect();

      // Create a fixed-position clone at the hand card's screen position
      const clone = createCardElement(card, true);
      clone.style.position = "fixed";
      clone.style.left = fromRect.left + "px";
      clone.style.top = fromRect.top + "px";
      clone.style.width = fromRect.width + "px";
      clone.style.height = fromRect.height + "px";
      clone.style.zIndex = "200";
      clone.style.transition = "left " + ANIM_DURATION + "ms cubic-bezier(0.2,0.8,0.3,1), " +
                               "top " + ANIM_DURATION + "ms cubic-bezier(0.2,0.8,0.3,1), " +
                               "width " + ANIM_DURATION + "ms ease, " +
                               "height " + ANIM_DURATION + "ms ease";
      clone.style.borderRadius = "5px";
      clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.5)";
      document.body.appendChild(clone);

      // Trigger animation to the trick area slot
      requestAnimationFrame(() => {
        clone.style.left = toRect.left + "px";
        clone.style.top = toRect.top + "px";
        clone.style.width = toRect.width + "px";
        clone.style.height = toRect.height + "px";
      });

      // After animation: remove clone, show real card, update hand
      setTimeout(() => {
        clone.remove();
        el.style.visibility = "visible";
        updateHandsDisplay();
        updateWinningCardHighlight();
      }, ANIM_DURATION);
    });
  } else {
    // --- AI cards: use entering class animation ---
    el.classList.add("entering");
    el.style.visibility = "visible";
    updateHandsDisplay();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove("entering");
      });
    });

    setTimeout(() => {
      updateWinningCardHighlight();
    }, ANIM_DURATION);
  }

  if (currentTrick.length === players.length) {
    setTimeout(determineTrickWinner, ANIM_DURATION + 600);
  } else {
    if (gameDirection === "clockwise") {
      currentPlayer = (playerId + 1) % players.length;
    } else {
      currentPlayer = ((playerId - 1) % players.length + players.length) % players.length;
    }
    setTimeout(playTurn, ANIM_DURATION + 200);
  }
}

function playTurn() {
  updatePlayerInfo();
  const p = players.find(p => p.id === currentPlayer);
  if (p.type === "ai") {
    showMessage(p.name + " está jugando...");
    setTimeout(() => {
      const t0 = (typeof window !== "undefined" && window.AI_LATENCY) ? performance.now() : null;
      const chosen = aiSelectCard(p);
      if (t0 !== null) {
        window.AI_LATENCY.push({ kind: "card", handSize, ms: performance.now() - t0 });
      }
      playCard(currentPlayer, chosen);
    }, 800);
  } else {
    showMessage("Tu turno — toca una carta resaltada.");
    document.getElementById("player-hand").style.pointerEvents = "";
    updateHandsDisplay();
  }
}

function determineTrickWinner() {
  const ledSuit = currentTrick[0].card.suit;
  let winningCard = null;
  const trumps = currentTrick.filter(t => t.card.suit === trump.suit);
  if (trumps.length > 0) {
    winningCard = trumps.reduce((prev, cur) =>
      getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
    );
  } else {
    const ledCards = currentTrick.filter(t => t.card.suit === ledSuit);
    winningCard = ledCards.reduce((prev, cur) =>
      getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
    );
  }
  const winner = winningCard.playerId;
  players.find(p => p.id === winner).tricks++;
  updatePlayerInfo();
  showMessage(players.find(p => p.id === winner).name + " gana la baza.");
  animateTrickCards(winner);
}

function updateWinningCardHighlight() {
  if (currentTrick.length === 0) return;
  const led = currentTrick[0].card.suit;
  let winningItem = null;
  const trumpItems = currentTrick.filter(i => i.card.suit === trump.suit);
  if (trumpItems.length > 0) {
    winningItem = trumpItems.reduce((p, c) => getRankValue(c.card.rank) > getRankValue(p.card.rank) ? c : p);
  } else {
    const ledItems = currentTrick.filter(i => i.card.suit === led);
    if (ledItems.length > 0)
      winningItem = ledItems.reduce((p, c) => getRankValue(c.card.rank) > getRankValue(p.card.rank) ? c : p);
  }
  currentTrick.forEach(i => i.element.classList.remove("winning-card"));
  if (winningItem) winningItem.element.classList.add("winning-card");
}

function animateTrickCards(winner) {
  const pos = players.find(p => p.id === winner).position;
  // Each card flies toward the winner's direction
  currentTrick.forEach(item => {
    const el = item.element;
    // Override the CSS data-pos transform with an inline one toward the winner
    let flyTo;
    if (pos === "north") flyTo = "translate(-50%, -180%)";
    else if (pos === "south") flyTo = "translate(-50%, 180%)";
    else if (pos === "east") flyTo = "translate(180%, -50%)";
    else flyTo = "translate(-180%, -50%)";
    el.style.transform = flyTo;
    el.style.opacity = "0";
  });
  setTimeout(() => {
    currentTrick.forEach(item => playedCardsThisRound.push(item.card));
    clearTrickArea();
    currentTrick = [];
    currentPlayer = winner;
    if (players.find(p => p.id === 0).hand.length > 0) {
      setTimeout(playTurn, 500);
    } else {
      endRound();
    }
  }, 600);
}

function endRound() {
  players.forEach(p => {
    if (p.bid === p.tricks) p.score += (10 + 3 * p.tricks);
    else p.score -= 3 * Math.abs(p.tricks - p.bid);
  });
  const roundResult = { round: currentRoundIndex + 1, handSize, results: [] };
  players.forEach(p => {
    const pts = p.bid === p.tricks ? (10 + 3 * p.tricks) : (-3 * Math.abs(p.tricks - p.bid));
    roundResult.results.push({ roundPoints: pts, total: p.score });
  });
  scoreData.push(roundResult);
  updatePlayerInfo();
  let summary = "Ronda " + (currentRoundIndex + 1) + " terminada. ";
  players.forEach(p => {
    summary += p.name + ": " + p.bid + "→" + p.tricks + " ";
  });
  showMessage(summary);
  if (currentRoundIndex < rounds.length - 1) {
    currentRoundIndex++;
    setTimeout(startRound, 2500);
  } else {
    showMessage("¡Partida terminada! Pulsa Puntuación para ver los resultados.");
    showScoreboard();
  }
}

function isLegalPlay(player, card) {
  if (currentTrick.length === 0) return true;
  const led = currentTrick[0].card.suit;
  if (player.hand.some(c => c.suit === led)) return card.suit === led;
  if (player.hand.some(c => c.suit === trump.suit)) return card.suit === trump.suit;
  return true;
}

/***********************
 * SCOREBOARD
 ***********************/
function showScoreboard() {
  const content = document.getElementById("scoreboard-content");
  content.innerHTML = "";
  const table = document.createElement("table");
  table.id = "scoreboard-table";
  const order = [
    players.find(p => p.position === "west"),
    players.find(p => p.position === "north"),
    players.find(p => p.position === "east"),
    players.find(p => p.type === "human")
  ];

  // Header row 1
  const thead = document.createElement("thead");
  const hr1 = document.createElement("tr");
  const thR = document.createElement("th"); thR.colSpan = 2; thR.textContent = "Ronda"; thR.classList.add("main-column");
  hr1.appendChild(thR);
  order.forEach((p, idx) => {
    const th = document.createElement("th"); th.colSpan = 2; th.textContent = p.name;
    if (idx < order.length - 1) th.classList.add("main-column");
    if (p.type === "human") th.classList.add("human-col");
    hr1.appendChild(th);
  });
  thead.appendChild(hr1);

  // Header row 2
  const hr2 = document.createElement("tr");
  ["#", "B"].forEach(t => { const th = document.createElement("th"); th.textContent = t; hr2.appendChild(th); });
  order.forEach(p => {
    ["Pts", "Tot"].forEach(t => {
      const th = document.createElement("th"); th.textContent = t;
      if (p.type === "human") th.classList.add("human-col");
      hr2.appendChild(th);
    });
  });
  thead.appendChild(hr2);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (let i = 1; i <= 16; i++) {
    const tr = document.createElement("tr");
    if (i === 4 || i === 12) tr.classList.add("separator");
    const tdR = document.createElement("td"); tdR.textContent = i; tr.appendChild(tdR);
    const tdH = document.createElement("td"); tdH.textContent = scoreData[i - 1] ? scoreData[i - 1].handSize : ""; tr.appendChild(tdH);
    order.forEach(p => {
      const tdPts = document.createElement("td");
      const tdTot = document.createElement("td");
      if (p.type === "human") { tdPts.classList.add("human-col"); tdTot.classList.add("human-col"); }
      if (scoreData[i - 1]) {
        const pIdx = players.indexOf(p);
        const res = scoreData[i - 1].results[pIdx];
        tdPts.textContent = res.roundPoints;
        tdTot.textContent = res.total;
        tdPts.classList.add(res.roundPoints < 0 ? "score-neg" : "score-pos");
        tdTot.classList.add(res.total < 0 ? "score-neg" : "score-pos");
      }
      tr.appendChild(tdPts); tr.appendChild(tdTot);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Footer row: final standings. Uses current cumulative score (works both
  // mid-game and after the 16th round). Ties share the same rank.
  if (scoreData.length > 0) {
    const tfoot = document.createElement("tfoot");
    const tr = document.createElement("tr");
    tr.id = "scoreboard-rank-row";
    const tdLabel = document.createElement("td");
    tdLabel.colSpan = 2; tdLabel.textContent = "Pos.";
    tr.appendChild(tdLabel);

    const lastIdx = scoreData.length - 1;
    const currentScores = order.map(p => {
      const pIdx = players.indexOf(p);
      return { player: p, total: scoreData[lastIdx].results[pIdx].total };
    });
    // Rank: highest total = 1st. Equal totals share a rank (1,1,3,4 — "standard competition" ranking).
    const sorted = currentScores.slice().sort((a, b) => b.total - a.total);
    const rankByPlayer = new Map();
    sorted.forEach((row, i) => {
      const tiedWithPrev = i > 0 && sorted[i - 1].total === row.total;
      const rank = tiedWithPrev ? rankByPlayer.get(sorted[i - 1].player.id) : i + 1;
      rankByPlayer.set(row.player.id, rank);
    });

    order.forEach(p => {
      const td = document.createElement("td");
      td.colSpan = 2;
      const rank = rankByPlayer.get(p.id);
      td.textContent = rank + (rank === 1 ? "º 🏆" : "º");
      td.classList.add("rank-cell");
      if (rank === 1) td.classList.add("rank-first");
      if (p.type === "human") td.classList.add("human-col");
      tr.appendChild(td);
    });
    tfoot.appendChild(tr);
    table.appendChild(tfoot);
  }

  content.appendChild(table);
  document.getElementById("scoreboard-overlay").classList.add("show");
}

function hideScoreboard() {
  document.getElementById("scoreboard-overlay").classList.remove("show");
}

/***********************
 * EVENTOS
 ***********************/
// Difficulty modal — selecting a difficulty always starts a fresh game
document.querySelectorAll(".dm-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.diff;
    diffCfg = DIFF_CONFIG[difficulty];
    document.getElementById("difficulty-modal").classList.add("hidden");
    document.getElementById("game").style.display = "block";
    initGame();
  });
});

// Nueva Partida button: open the difficulty modal over the current game.
// Unlike the initial launch, the modal here is dismissible (X closes it
// without starting a new game, so the player can resume the current one).
function openNewGameModal() {
  const modal = document.getElementById("difficulty-modal");
  modal.classList.add("dismissible");
  modal.classList.remove("hidden");
}
function closeNewGameModal() {
  const modal = document.getElementById("difficulty-modal");
  modal.classList.add("hidden");
  modal.classList.remove("dismissible");
}
document.getElementById("new-game").addEventListener("click", openNewGameModal);
document.getElementById("difficulty-close").addEventListener("click", closeNewGameModal);

// Scoreboard
document.getElementById("scoreboard-button").addEventListener("click", showScoreboard);
document.getElementById("scoreboard-close").addEventListener("click", hideScoreboard);

// Sim log close (log kept but inaccessible — no toggle button)
document.getElementById("sim-log-close").addEventListener("click", () => {
  document.getElementById("sim-log").classList.remove("show");
});

/***********************
 * KEYBOARD SHORTCUTS
 ***********************
 *   0..5  → bid (during bidding phase, if it's the human's turn)
 *   1..5  → play the Nth card from the left (during play phase)
 *   n     → open "Nueva Partida" modal
 *   p     → open scoreboard
 *   x / Esc → close any open modal
 *
 * 0..5 and 1..5 overlap: we disambiguate by current game phase (bidding
 * vs playing). 0 never triggers a card play.
 */
function anyModalOpen() {
  const diff = document.getElementById("difficulty-modal");
  const score = document.getElementById("scoreboard-overlay");
  return (diff && !diff.classList.contains("hidden")) ||
         (score && score.classList.contains("show"));
}
function closeAllModals() {
  const diff = document.getElementById("difficulty-modal");
  if (diff && !diff.classList.contains("hidden") && diff.classList.contains("dismissible")) {
    closeNewGameModal();
  }
  hideScoreboard();
}
function triggerHumanBid(n) {
  const btns = document.querySelectorAll("#bid-area .bid-button");
  if (n < 0 || n >= btns.length) return;
  btns[n].click();
}
function triggerHumanPlay(cardIndex) {
  // cardIndex is 0-based; .valid cards are the playable ones
  const cards = document.querySelectorAll("#player-hand .card");
  if (cardIndex < 0 || cardIndex >= cards.length) return;
  const card = cards[cardIndex];
  if (!card.classList.contains("valid")) return;
  card.click();
}

document.addEventListener("keydown", (e) => {
  // Ignore if the user is typing in an input
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
  // Ignore modifier combos (let browser shortcuts pass through)
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key;

  // Close shortcuts first — they work regardless of game state
  if (key === "Escape" || key === "x" || key === "X") {
    if (anyModalOpen()) { closeAllModals(); e.preventDefault(); }
    return;
  }
  // If any modal is open, swallow other shortcuts (don't bid/play behind it)
  if (anyModalOpen()) return;

  if (key === "n" || key === "N") { openNewGameModal(); e.preventDefault(); return; }
  if (key === "p" || key === "P") { showScoreboard(); e.preventDefault(); return; }

  // Numeric keys: bid (0..N) or play card (1..N) depending on phase
  if (key >= "0" && key <= "9") {
    const n = parseInt(key, 10);
    const human = players.find(p => p.type === "human");
    if (!human) return;
    if (currentPhase === "bidding"
        && biddingIndex < biddingOrder.length
        && biddingOrder[biddingIndex] === human.id) {
      triggerHumanBid(n);  // 0-based index into bid buttons (0..handSize)
      e.preventDefault();
    } else if (currentPhase === "playing" && currentPlayer === human.id && n >= 1) {
      triggerHumanPlay(n - 1);  // 1..5 → index 0..4
      e.preventDefault();
    }
  }
});

// Human card click
function onHumanCardClick(event) {
  const clickedEl = event.currentTarget;
  const index = parseInt(clickedEl.dataset.index);
  const human = players.find(p => p.type === "human");
  const card = human.hand[index];
  if (!isLegalPlay(human, card)) {
    showMessage("¡Debes seguir el palo o tirar triunfo!");
    return;
  }
  // Lock the hand immediately so rapid clicks on other cards are ignored
  document.getElementById("player-hand").style.pointerEvents = "none";
  playCard(2, index, clickedEl);
}

/***********************
 * CICLO DEL JUEGO
 ***********************/
function initGame() {
  currentRoundIndex = 0;
  players.forEach(p => p.score = 0);
  scoreData = [];
  document.getElementById("sim-log-body").innerHTML = "";
  assignAINames();
  startRound();
}

function startRound() {
  if (currentRoundIndex === 0) {
    dealer = Math.floor(Math.random() * players.length);
  } else {
    if (gameDirection === "clockwise") dealer = (dealer + 1) % players.length;
    else dealer = ((dealer - 1) % players.length + players.length) % players.length;
  }
  currentPhase = "bidding";
  currentTrick = [];
  playedCardsThisRound = [];
  biddingIndex = 0;
  handSize = rounds[currentRoundIndex];
  players.forEach(p => { p.hand = []; p.bid = null; p.tricks = 0; });
  clearTrickArea();
  clearBidArea();
  deck = createDeck();
  shuffle(deck);
  for (let i = 0; i < handSize; i++) {
    players.forEach(p => p.hand.push(deck.pop()));
  }
  trump = deck.pop();
  trumpSuit = trump.suit;
  updateRoundInfo();

  biddingOrder = [];
  if (gameDirection === "clockwise") {
    for (let i = 1; i <= players.length; i++) biddingOrder.push((dealer + i) % players.length);
  } else {
    for (let i = 1; i <= players.length; i++) biddingOrder.push(((dealer - i) % players.length + players.length) % players.length);
  }
  updatePlayerInfo();
  updateHandsDisplay(true);
  showMessage("Triunfo: " + getSuitName(trump.suit) + " — " + cardToText(trump));
  setTimeout(processNextBid, 1000);
}

function processNextBid() {
  updatePlayerInfo();
  if (biddingIndex >= biddingOrder.length) {
    currentPhase = "playing";
    currentPlayer = biddingOrder[0];
    updatePlayerInfo();
    showMessage("Apuestas listas. " + players.find(p => p.id === currentPlayer).name + " empieza.");
    setTimeout(playTurn, 1000);
    return;
  }
  const pid = biddingOrder[biddingIndex];
  const p = players.find(p => p.id === pid);
  if (p.type === "ai") {
    showMessage(p.name + " piensa su apuesta...");
    setTimeout(() => {
      p.bid = aiComputeBid(pid);
      updatePlayerInfo();
      showMessage(p.name + " apuesta " + p.bid);
      biddingIndex++;
      setTimeout(processNextBid, 800);
    }, 400);
  } else {
    showMessage("Tu turno para apostar (0-" + handSize + ")");
    displayBidOptions();
  }
}

function displayBidOptions() {
  clearBidArea();
  updatePlayerInfo();
  const bidArea = document.getElementById("bid-area");
  for (let i = 0; i <= handSize; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.classList.add("bid-button");
    btn.addEventListener("click", () => {
      players.find(p => p.type === "human").bid = i;
      updatePlayerInfo();
      showMessage("Tu apuesta: " + i);
      clearBidArea();
      biddingIndex++;
      setTimeout(processNextBid, 500);
    });
    bidArea.appendChild(btn);
  }
}
