/***********************
 * LA PODRIDA — JUEGO DE CARTAS (RESPONSIVE + DIFICULTAD)
 ***********************/

const IMG_BASE = 'https://javigarcia.com/lapodrida/img/';

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

// Heuristic card selection for smarter simulation opponents (hard mode)
function heuristicSimSelect(hand, trick, ts) {
  const legal = getLegalCardsForSimulation(hand, trick, ts);
  if (legal.length <= 1) return legal[0];

  if (trick.length === 0) {
    // Leading: 60% play highest, 40% random
    if (Math.random() < 0.6) {
      return legal.reduce((a, b) => getRankValue(a.rank) >= getRankValue(b.rank) ? a : b);
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

  if (winners.length > 0 && Math.random() < 0.7) {
    // Play cheapest winner (economize strong cards)
    return winners.reduce((a, b) => getRankValue(a.rank) <= getRankValue(b.rank) ? a : b);
  }

  // Can't win or choosing not to: dump lowest card (70%) or random
  if (Math.random() < 0.7) {
    return legal.reduce((a, b) => getRankValue(a.rank) <= getRankValue(b.rank) ? a : b);
  }
  return legal[Math.floor(Math.random() * legal.length)];
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
      const legal = getLegalCardsForSimulation(hand, trick, trump.suit);
      let chosen = legal[0];
      legal.forEach(c => { if (getRankValue(c.rank) > getRankValue(chosen.rank)) chosen = c; });
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
  const sims = diffCfg.bidSims;
  const freq = {};
  for (let i = 0; i < sims; i++) {
    const tricks = simulateRoundForBid(player);
    freq[tricks] = (freq[tricks] || 0) + 1;
  }
  let mode = 0, maxCount = 0;
  for (const key in freq) {
    if (freq[key] > maxCount) { maxCount = freq[key]; mode = parseInt(key); }
  }
  // Log
  const parts = [];
  for (let i = 0; i <= handSize; i++) parts.push((freq[i] || 0) + " de " + i);
  updateSimLog(player.name + ": R" + (currentRoundIndex + 1) + ", " + handSize + " cartas, " + parts.join(", "));

  // Difficulty: bid noise
  if (diffCfg.bidNoise > 0 && Math.random() < diffCfg.bidNoise) {
    const delta = Math.random() < 0.5 ? 1 : -1;
    mode = Math.max(0, Math.min(handSize, mode + delta));
  }
  return mode;
}

function aiComputeBid(pid) {
  return simulateBid(players.find(p => p.id === pid));
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

  // Complete current trick for remaining players
  const played = simTrick.map(item => item.playerId);
  players.filter(p => !played.includes(p.id)).forEach(p => {
    const simHand = p.id === aiPlayer.id ? aiHandSim : (simOppHands[p.id] || []);
    if (simHand.length === 0) return;
    let chosen;
    if (diffCfg.smartSim) {
      chosen = heuristicSimSelect(simHand, simTrick, trump.suit);
    } else {
      let legal = getLegalCardsForSimulation(simHand, simTrick, trump.suit);
      if (legal.length === 0) legal = simHand.slice();
      if (legal.length === 0) return;
      chosen = legal[Math.floor(Math.random() * legal.length)];
    }
    for (let i = 0; i < simHand.length; i++) {
      if (simHand[i].suit === chosen.suit && simHand[i].rank === chosen.rank) { simHand.splice(i, 1); break; }
    }
    simTrick.push({ playerId: p.id, card: chosen });
  });

  if (simTrick.length === 0) return 0;
  let winner = determineTrickWinnerSim(simTrick, trump.suit);
  let tricksWon = (winner === aiPlayer.id) ? 1 : 0;

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
      if (diffCfg.smartSim) {
        chosen = heuristicSimSelect(simHand, trick, trump.suit);
      } else {
        let legal = getLegalCardsForSimulation(simHand, trick, trump.suit);
        if (legal.length === 0) legal = simHand.slice();
        if (legal.length === 0) continue;
        chosen = legal[Math.floor(Math.random() * legal.length)];
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

  // Hard mode: weighted proximity scoring (considers all outcomes, weighted by distance to target)
  if (diffCfg.smartSim) {
    let bestCandidate = null, bestScore = -Infinity;
    candidateResults.forEach(r => {
      let score = 0;
      const total = simsPerCandidate;
      for (let i = 0; i <= handSize; i++) {
        const dist = Math.abs(i - target);
        // Weight: exact hit = 1.0, off by 1 = 0.4, off by 2 = 0.15, off by 3+ = 0.05
        const weight = dist === 0 ? 1.0 : dist === 1 ? 0.4 : dist === 2 ? 0.15 : 0.05;
        score += (r.freq[i] / total) * weight;
      }
      if (score > bestScore) { bestScore = score; bestCandidate = r.candidate; }
    });
    if (bestCandidate !== null) return bestCandidate;
  }

  // Normal mode: most simulations hitting target exactly
  let best = null, maxExact = -1;
  candidateResults.forEach(r => { if (r.freq[target] > maxExact) { maxExact = r.freq[target]; best = r.candidate; } });
  if (maxExact > 0) return best;

  // Fallback: closest to target
  let bestClose = null, maxClose = -1;
  candidateResults.forEach(r => {
    const close = Math.max(r.freq[target + 1] || 0, r.freq[target - 1] || 0);
    if (close > maxClose) { maxClose = close; bestClose = r.candidate; }
  });
  if (maxClose > 0) return bestClose;

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
  const rt = document.getElementById("round-text");
  rt.innerHTML = "Ronda " + (currentRoundIndex + 1) + "/" + rounds.length + "<br>Bazas: " + handSize;
  const tc = document.getElementById("trump-card");
  tc.style.backgroundImage = "url(" + getCardImageSrc(trump) + ")";
}

function updatePlayerInfo() {
  players.forEach(p => {
    const infoDiv = document.getElementById(
      p.type === "human" ? "info-south" :
      p.position === "north" ? "info-north" :
      p.position === "east"  ? "info-east"  : "info-west"
    );
    if (!infoDiv) return;
    const dealerMark = p.id === dealer ? ' (R)' : '';
    infoDiv.innerHTML =
      '<div class="player-name">' + p.name + dealerMark + '</div>' +
      '<div class="player-score">' + p.score + '</div>' +
      '<div class="player-stats">' +
        '<div class="player-bid">' + (p.bid !== null ? p.bid : '-') + '</div>' +
        '<div class="player-tricks">' + p.tricks + '</div>' +
      '</div>';
  });
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
      playCard(currentPlayer, aiSelectCard(p));
    }, 800);
  } else {
    showMessage("Tu turno — toca una carta resaltada.");
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
  content.appendChild(table);
  document.getElementById("scoreboard-overlay").classList.add("show");
}

function hideScoreboard() {
  document.getElementById("scoreboard-overlay").classList.remove("show");
}

/***********************
 * EVENTOS
 ***********************/
// Difficulty modal
document.querySelectorAll(".dm-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.diff;
    diffCfg = DIFF_CONFIG[difficulty];
    document.getElementById("difficulty-modal").classList.add("hidden");
    document.getElementById("game").style.display = "block";
    initGame();
  });
});

// New game
document.getElementById("new-game").addEventListener("click", () => {
  document.getElementById("game").style.display = "none";
  document.getElementById("difficulty-modal").classList.remove("hidden");
});

// Scoreboard
document.getElementById("scoreboard-button").addEventListener("click", showScoreboard);
document.getElementById("scoreboard-close").addEventListener("click", hideScoreboard);

// Sim log close (log kept but inaccessible — no toggle button)
document.getElementById("sim-log-close").addEventListener("click", () => {
  document.getElementById("sim-log").classList.remove("show");
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
