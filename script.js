/***********************
 * CONFIGURACIÓN DEL JUEGO
 ***********************/
let gameDirection = "counterclockwise"; // Valores: "clockwise" o "counterclockwise" (por defecto: counterclockwise)
let deckVariant = 40; // Valores: 40 o 48 (por defecto: 40)

/***********************
 * VARIABLES Y ESTADO DEL JUEGO
 ***********************/
const rounds = [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 2, 1];
let currentRoundIndex = 0;
let handSize = rounds[currentRoundIndex];
const suitOrder = { "oros": 0, "bastos": 1, "copas": 2, "espadas": 3 };
let players = [
  { id: 0, name: "AI North", type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "north" },
  { id: 1, name: "AI East", type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "east" },
  { id: 2, name: "Tú", type: "human", hand: [], bid: null, tricks: 0, score: 0, position: "south" },
  { id: 3, name: "AI West", type: "ai", hand: [], bid: null, tricks: 0, score: 0, position: "west" }
];
let deck = [];
let trump = null;
let trumpSuit = null;
let dealer = null;
let biddingOrder = [];
let biddingIndex = 0;
let currentPhase = "bidding"; // "bidding", "playing", "roundOver"
let currentTrick = [];
let currentPlayer = null;
let scoreData = [];
let logClosed = false;

/***********************
 * FUNCIONES UTILITARIAS
 ***********************/
function assignAINames() {
  const aiNames = ["Newton", "Curie", "Tesla", "Hawkin", "Galilei", "Fermi", "Bohr", "Dirac", "Planck"];
  // Mezclamos los nombres
  for (let i = aiNames.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [aiNames[i], aiNames[j]] = [aiNames[j], aiNames[i]];
  }
  let count = 0;
  players.forEach(p => {
    if (p.type === "ai") {
      p.name = aiNames[count];
      count++;
    }
  });
}

function createDeck() {
  const suits = ["espadas", "oros", "copas", "bastos"];
  // Si se juega con 40 cartas se eliminan los 8 y 9
  let ranks = (deckVariant === 40)
    ? ["1", "2", "3", "4", "5", "6", "7", "S", "C", "R"]
    : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "C", "R"];
  let deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getRankValue(rank) {
  const rankOrder = { "1": 12, "3": 11, "R": 10, "C": 9, "S": 8, "9": 7, "8": 6, "7": 5, "6": 4, "5": 3, "4": 2, "2": 1 };
  return rankOrder[rank] || 0;
}

function getSuitSymbol(suit) {
  switch (suit) {
    case "espadas": return "E";
    case "oros":    return "O";
    case "copas":   return "C";
    case "bastos":  return "B";
    default: return "";
  }
}

function createCardElement(card, faceUp = true) {
  let img = document.createElement("img");
  img.classList.add("card");
  img.width = 94;
  img.height = 140;
  if (!faceUp) {
    img.src = "img/reverso-hd.png";
  } else {
    let num = (card.rank === "S") ? "10" : (card.rank === "C") ? "11" : (card.rank === "R") ? "12" : card.rank;
    let suitInitial = (card.suit === "oros") ? "o" :
                      (card.suit === "bastos") ? "b" :
                      (card.suit === "copas") ? "c" :
                      (card.suit === "espadas") ? "e" : "";
    img.src = "img/" + num + suitInitial + "-hd.png";
  }
  return img;
}

function getCardImageSrc(card) {
  let num = (card.rank === "S") ? "10" : (card.rank === "C") ? "11" : (card.rank === "R") ? "12" : card.rank;
  let suitInitial = (card.suit === "oros") ? "o" :
                    (card.suit === "bastos") ? "b" :
                    (card.suit === "copas") ? "c" :
                    (card.suit === "espadas") ? "e" : "";
  return "img/" + num + suitInitial + "-hd.png";
}

function cardToText(card) {
  let rankText = card.rank;
  if (card.rank === "1") rankText = "As";
  else if (card.rank === "S") rankText = "Sota";
  else if (card.rank === "C") rankText = "Caballo";
  else if (card.rank === "R") rankText = "Rey";
  let suitText = "";
  if (card.suit === "oros") suitText = "de Oros";
  else if (card.suit === "espadas") suitText = "de Espadas";
  else if (card.suit === "copas") suitText = "de Copas";
  else if (card.suit === "bastos") suitText = "de Bastos";
  return rankText + " " + suitText;
}

/***********************
 * FUNCIONES DE SIMULACIÓN PARA LA IA (BIDDING Y SELECCIÓN DE CARTA)
 ***********************/
// Devuelve las cartas legales (según la regla de seguir palo o tirar triunfo) para la simulación
function getLegalCardsForSimulation(hand, trick, trumpSuit) {
  if (trick.length === 0) return hand.slice();
  let ledSuit = trick[0].card.suit;
  if (hand.some(card => card.suit === ledSuit))
    return hand.filter(card => card.suit === ledSuit);
  else if (hand.some(card => card.suit === trumpSuit))
    return hand.filter(card => card.suit === trumpSuit);
  else
    return hand.slice();
}

// Devuelve el ganador de un truco simulado
function determineTrickWinnerSim(trick, trumpSuit) {
  let ledSuit = trick[0].card.suit;
  let winning = trick[0];
  trick.forEach(play => {
    if (play.card.suit === trumpSuit) {
      if (winning.card.suit !== trumpSuit || getRankValue(play.card.rank) > getRankValue(winning.card.rank))
        winning = play;
    } else if (winning.card.suit !== trumpSuit && play.card.suit === ledSuit) {
      if (getRankValue(play.card.rank) > getRankValue(winning.card.rank))
        winning = play;
    }
  });
  return winning.playerId;
}

// Simula una ronda completa (para bidding) con la mano actual de la IA
function simulateRoundForBid(player) {
  let deckSim = createDeck().filter(card => !(card.suit === trump.suit && card.rank === trump.rank));
  // Quitar de deckSim las cartas que ya tiene la IA
  player.hand.forEach(card => {
    deckSim = deckSim.filter(c => !(c.suit === card.suit && c.rank === card.rank));
  });
  let simHands = {};
  simHands[player.id] = player.hand.slice();
  players.forEach(p => {
    if (p.id !== player.id) {
      simHands[p.id] = [];
      for (let i = 0; i < handSize; i++) {
        let index = Math.floor(Math.random() * deckSim.length);
        simHands[p.id].push(deckSim[index]);
        deckSim.splice(index, 1);
      }
    }
  });
  // Usamos biddingOrder ya calculado
  let simOrder = biddingOrder.slice();
  let simHandsCopy = JSON.parse(JSON.stringify(simHands));
  let tricksWon = 0;
  for (let t = 0; t < handSize; t++) {
    let trick = [];
    simOrder.forEach(pid => {
      let hand = simHandsCopy[pid];
      let legal = getLegalCardsForSimulation(hand, trick, trump.suit);
      // Estrategia simple: elige la carta de mayor valor
      let chosen = legal[0];
      legal.forEach(card => {
        if (getRankValue(card.rank) > getRankValue(chosen.rank))
          chosen = card;
      });
      let idx = hand.findIndex(c => c.suit === chosen.suit && c.rank === chosen.rank);
      if (idx >= 0) hand.splice(idx, 1);
      trick.push({ playerId: pid, card: chosen });
    });
    let trickWinner = determineTrickWinnerSim(trick, trump.suit);
    if (trickWinner === player.id) tricksWon++;
    // Recalcular el orden de juego: se rota para que el ganador lidere
    let winnerIndex = simOrder.indexOf(trickWinner);
    simOrder = simOrder.slice(winnerIndex).concat(simOrder.slice(0, winnerIndex));
  }
  return tricksWon;
}

// Realiza 1000 simulaciones y devuelve la moda (el número que más se repite)
function simulateBid(player) {
  let sims = 10000;
  let freq = {};
  for (let i = 0; i < sims; i++) {
    let tricks = simulateRoundForBid(player);
    freq[tricks] = (freq[tricks] || 0) + 1;
  }
  let mode = null;
  let maxCount = 0;
  for (let key in freq) {
    if (freq[key] > maxCount) {
      maxCount = freq[key];
      mode = parseInt(key);
    }
  }
  let distributionParts = [];
  for (let i = 0; i <= handSize; i++) {
    distributionParts.push((freq[i] || 0) + " de " + i);
  }
  let distributionText = distributionParts.slice(0, distributionParts.length - 1).join(", ") +
                          " y " + distributionParts[distributionParts.length - 1];
  let msg = player.name + ": Ronda " + (currentRoundIndex + 1) + ", " + handSize + " cartas, " + distributionText;
  updateSimLog(msg);
  return mode;
}

function updateSimLog(message) {
  let simLogDiv = document.getElementById("sim-log");
  let p = document.createElement("p");
  p.textContent = message;
  simLogDiv.appendChild(p);
}

function aiComputeBid(pid) {
  let p = players.find(p => p.id === pid);
  return simulateBid(p);
}

/**
 * Simula el resto de la ronda suponiendo que el AI juega la carta candidata (índice candidateIndex).
 * En la simulación, el AI conoce su propia mano (menos la carta que se va a jugar),
 * la carta de triunfo y las cartas ya jugadas (currentTrick). Para los oponentes,
 * se genera su mano desconocida a partir del mazo completo, eliminando:
 *   - La carta de triunfo.
 *   - Las cartas conocidas por el AI (su mano completa, incluida la carta candidata).
 *   - Las cartas que ya se han jugado en el truco actual (currentTrick).
 *
 * Luego se simula el resto de la ronda siguiendo jugadas aleatorias (respetando las reglas legales)
 * y se retorna el número total de bazas que ganaría el AI en esa simulación.
 */
function simulateRemainingRoundForCard(aiPlayer, candidateIndex) {
  // 1. Clonar el currentTrick (las cartas ya jugadas en el truco actual)
  let simTrick = currentTrick.slice();
  
  // 2. Clonar la mano del AI y quitar la carta candidata
  let aiHandSim = aiPlayer.hand.slice();
  let candidateCard = aiHandSim[candidateIndex];
  for (let i = 0; i < aiHandSim.length; i++) {
    if (aiHandSim[i].suit === candidateCard.suit && aiHandSim[i].rank === candidateCard.rank) {
      aiHandSim.splice(i, 1);
      break;
    }
  }
  
  // 3. Construir el mazo de cartas desconocidas para los oponentes.
  // Comenzamos con la baraja completa (según la variante de 40 o 48 cartas).
  let fullDeck = createDeck();
  // Eliminar la carta de triunfo
  fullDeck = fullDeck.filter(card => !(card.suit === trump.suit && card.rank === trump.rank));
  // Eliminar todas las cartas que el AI conoce: su mano real (incluida la carta candidata)
  players.find(p => p.id === aiPlayer.id).hand.forEach(card => {
    fullDeck = fullDeck.filter(c => !(c.suit === card.suit && c.rank === card.rank));
  });
  // Eliminar las cartas ya jugadas en el truco actual
  currentTrick.forEach(played => {
    fullDeck = fullDeck.filter(card => !(card.suit === played.card.suit && card.rank === played.card.rank));
  });
  
  // 4. Para cada oponente, repartir una mano simulada aleatoria.
  // El tamaño de la mano simulada se toma como el número de cartas actuales que tiene el oponente.
  let simOpponentsHands = {};
  players.forEach(p => {
    if (p.id !== aiPlayer.id) {
      let handSizeOpponent = p.hand.length;
      simOpponentsHands[p.id] = [];
      for (let i = 0; i < handSizeOpponent; i++) {
        if (fullDeck.length === 0) break;
        let idx = Math.floor(Math.random() * fullDeck.length);
        simOpponentsHands[p.id].push(fullDeck[idx]);
        fullDeck.splice(idx, 1);
      }
    }
  });
  
  // 5. Completar el truco actual para los jugadores que aún no han jugado.
  let playersInTrick = simTrick.map(item => item.playerId);
  let remainingInTrick = players.filter(p => !playersInTrick.includes(p.id));
  
  remainingInTrick.forEach(p => {
    let simHand;
    if (p.id === aiPlayer.id) {
      simHand = aiHandSim;
    } else {
      simHand = simOpponentsHands[p.id] || [];
    }
    let legal = getLegalCardsForSimulation(simHand, simTrick, trump.suit);
    if (legal.length === 0) legal = simHand.slice();
    let chosen = legal[Math.floor(Math.random() * legal.length)];
    // Quitar la carta elegida de la mano simulada
    for (let i = 0; i < simHand.length; i++) {
      if (simHand[i].suit === chosen.suit && simHand[i].rank === chosen.rank) {
        simHand.splice(i, 1);
        break;
      }
    }
    simTrick.push({ playerId: p.id, card: chosen });
  });
  
  // 6. Determinar el ganador del truco actual simulado
  let winner = determineTrickWinnerSim(simTrick, trump.suit);
  let tricksWon = (winner === aiPlayer.id) ? 1 : 0;
  
  // 7. Simular el resto de la ronda.
  // Para el AI usamos aiHandSim; para cada oponente, usamos su mano desconocida simulada (simOpponentsHands).
  // Primero, definir el orden de turno a partir del ganador, según gameDirection.
  let turnOrder = [];
  let startIndex = players.findIndex(p => p.id === winner);
  if (gameDirection === "clockwise") {
    for (let i = 0; i < players.length; i++) {
      turnOrder.push(players[(startIndex + i) % players.length].id);
    }
  } else { // counterclockwise
    for (let i = 0; i < players.length; i++) {
      turnOrder.push(((startIndex - i) % players.length + players.length) % players.length);
    }
  }
  
  // Mientras algún jugador tenga cartas en su mano simulada, simular cada truco
  while (players.some(p => {
    if (p.id === aiPlayer.id) return aiHandSim.length > 0;
    else return (simOpponentsHands[p.id] && simOpponentsHands[p.id].length > 0);
  })) {
    let trick = [];
    for (let pid of turnOrder) {
      let simHand;
      if (pid === aiPlayer.id) {
        simHand = aiHandSim;
      } else {
        simHand = simOpponentsHands[pid] || [];
      }
      if (simHand.length === 0) continue;
      let legal = getLegalCardsForSimulation(simHand, trick, trump.suit);
      if (legal.length === 0) legal = simHand.slice();
      let chosen = legal[Math.floor(Math.random() * legal.length)];
      for (let i = 0; i < simHand.length; i++) {
        if (simHand[i].suit === chosen.suit && simHand[i].rank === chosen.rank) {
          simHand.splice(i, 1);
          break;
        }
      }
      trick.push({ playerId: pid, card: chosen });
    }
    if (trick.length === 0) break;
    let trickWinner = determineTrickWinnerSim(trick, trump.suit);
    if (trickWinner === aiPlayer.id) tricksWon++;
    let winnerIndex = turnOrder.indexOf(trickWinner);
    turnOrder = turnOrder.slice(winnerIndex).concat(turnOrder.slice(0, winnerIndex));
  }
  
  return tricksWon;
}

/***********************
 * FUNCIONES DEL JUEGO
 ***********************/
function updateRoundInfo() {
  let roundText = document.getElementById("round-text");
  roundText.innerHTML = "R: " + (currentRoundIndex + 1) + " de " + rounds.length + "<br>B: " + handSize;
  let trumpCard = document.getElementById("trump-card");
  trumpCard.style.backgroundImage = "url(" + getCardImageSrc(trump) + ")";
  let activeBox = null;
  if (dealer === 0) activeBox = document.getElementById("info-north");
  else if (dealer === 1) activeBox = document.getElementById("info-east");
  else if (dealer === 2) activeBox = document.getElementById("info-south");
  else if (dealer === 3) activeBox = document.getElementById("info-west");
  if (activeBox) {
    let boxRect = activeBox.getBoundingClientRect();
    let containerRect = document.getElementById("bg-container").getBoundingClientRect();
    let centerX = boxRect.left + boxRect.width / 2 - containerRect.left;
    let centerY = boxRect.top + boxRect.height / 2 - containerRect.top;
    trumpCard.style.left = (centerX - 47) + "px";
    trumpCard.style.top = (centerY - 150) + "px";
  }
}

function updatePlayerInfo() {
  players.forEach(p => {
    let infoDiv;
    if (p.type === "human") infoDiv = document.getElementById("info-south");
    else if (p.position === "north") infoDiv = document.getElementById("info-north");
    else if (p.position === "east") infoDiv = document.getElementById("info-east");
    else infoDiv = document.getElementById("info-west");
    if (infoDiv) {
      infoDiv.innerHTML = `
        <div class="player-name">${p.name}</div>
        <div class="player-score">${p.score}</div>
        <div class="player-stats">
          <div class="player-bid">${p.bid !== null ? p.bid : ""}</div>
          <div class="player-tricks">${p.tricks}</div>
        </div>
      `;
    }
  });
  highlightActivePlayer();
}

function highlightActivePlayer() {
  let activeId = null;
  if (currentPhase === "bidding") {
    if (biddingIndex < biddingOrder.length)
      activeId = biddingOrder[biddingIndex];
  } else if (currentPhase === "playing") {
    activeId = currentPlayer;
  }
  players.forEach(p => {
    let infoDiv;
    if (p.type === "human") infoDiv = document.getElementById("info-south");
    else if (p.position === "north") infoDiv = document.getElementById("info-north");
    else if (p.position === "east") infoDiv = document.getElementById("info-east");
    else infoDiv = document.getElementById("info-west");
    if (infoDiv)
      infoDiv.style.borderColor = (p.id === activeId) ? "yellow" : "#fff";
  });
}

function showMessage(text) {
  document.getElementById("message").textContent = text;
}

function clearBidArea() {
  document.getElementById("bid-area").innerHTML = "";
}

function clearTrickArea() {
  document.getElementById("trick-area").innerHTML = "";
}

function updateHandsDisplay() {
  let handDiv = document.getElementById("player-2-hand");
  handDiv.innerHTML = "";
  let human = players.find(p => p.type === "human");
  human.hand.sort((a, b) =>
    (suitOrder[a.suit] - suitOrder[b.suit]) ||
    (getRankValue(b.rank) - getRankValue(a.rank))
  );
  for (let i = 0; i < human.hand.length; i++) {
    let card = human.hand[i];
    let cardEl = createCardElement(card, true);
    cardEl.dataset.index = i;
    if (currentPhase === "playing" && human.id === currentPlayer && isLegalPlay(human, card))
      cardEl.classList.add("valid");
    if (human.id === currentPlayer && currentPhase === "playing")
      cardEl.addEventListener("click", onHumanCardClick);
    handDiv.appendChild(cardEl);
  }
}

function playCard(playerId, cardIndex) {
  let player = players.find(p => p.id === playerId);
  let card = player.hand.splice(cardIndex, 1)[0];
  let cardEl = createCardElement(card, true);
  cardEl.classList.add("played-card");
  let pos = "";
  switch (player.position) {
    case "north": pos = "top: 10px; left: 128px;"; break;
    case "south": pos = "bottom: 10px; left: 128px;"; break;
    case "east":  pos = "right: 10px; top: 105px;"; break;
    case "west":  pos = "left: 10px; top: 105px;"; break;
  }
  cardEl.style.cssText += pos;
  document.getElementById("trick-area").appendChild(cardEl);
  currentTrick.push({ playerId, card, element: cardEl });
  updateHandsDisplay();
  updateWinningCardHighlight();
  if (currentTrick.length === players.length) {
    setTimeout(determineTrickWinner, 1000);
  } else {
    // Calcular siguiente jugador según gameDirection
    if (gameDirection === "clockwise") {
      currentPlayer = (playerId + 1) % players.length;
      while (players.find(p => p.id === currentPlayer).hand.length === 0) {
        currentPlayer = (currentPlayer + 1) % players.length;
      }
    } else { // counterclockwise
      currentPlayer = ((playerId - 1) % players.length + players.length) % players.length;
      while (players.find(p => p.id === currentPlayer).hand.length === 0) {
        currentPlayer = ((currentPlayer - 1) % players.length + players.length) % players.length;
      }
    }
    setTimeout(playTurn, 500);
  }
}

function playTurn() {
  updatePlayerInfo();
  highlightActivePlayer();
  let p = players.find(p => p.id === currentPlayer);
  if (p.type === "ai") {
    showMessage(p.name + " está jugando...");
    setTimeout(() => {
      let choice = aiSelectCard(p);
      playCard(currentPlayer, choice);
    }, 1000);
  } else {
    showMessage("Tu turno. Haz clic en una carta resaltada.");
    updateHandsDisplay();
  }
}

function determineTrickWinner() {
  let ledSuit = currentTrick[0].card.suit;
  let winningCard = null;
  let winner = null;
  let trumps = currentTrick.filter(t => t.card.suit === trump.suit);
  if (trumps.length > 0) {
    winningCard = trumps.reduce((prev, cur) =>
      getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
    );
  } else {
    let ledCards = currentTrick.filter(t => t.card.suit === ledSuit);
    winningCard = ledCards.reduce((prev, cur) =>
      getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
    );
  }
  winner = winningCard.playerId;
  players.find(p => p.id === winner).tricks++;
  updatePlayerInfo();
  showMessage(players.find(p => p.id === winner).name + " gana la baza.");
  animateTrickCards(winner);
}

function updateWinningCardHighlight() {
  if (currentTrick.length === 0) return;
  let ledSuit = currentTrick[0].card.suit;
  let winningItem = null;
  let trumpItems = currentTrick.filter(item => item.card.suit === trump.suit);
  if (trumpItems.length > 0) {
    winningItem = trumpItems.reduce((prev, cur) =>
      getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
    );
  } else {
    let ledItems = currentTrick.filter(item => item.card.suit === ledSuit);
    if (ledItems.length > 0) {
      winningItem = ledItems.reduce((prev, cur) =>
        getRankValue(cur.card.rank) > getRankValue(prev.card.rank) ? cur : prev
      );
    }
  }
  currentTrick.forEach(item => item.element.classList.remove("winning-card"));
  if (winningItem) winningItem.element.classList.add("winning-card");
}

function animateTrickCards(winner) {
  let direction = "";
  let pos = players.find(p => p.id === winner).position;
  if (pos === "north") direction = "translateY(-100%)";
  else if (pos === "south") direction = "translateY(100%)";
  else if (pos === "east") direction = "translateX(100%)";
  else if (pos === "west") direction = "translateX(-100%)";
  currentTrick.forEach(item => {
    let el = item.element;
    el.style.transition = "all 0.5s ease-out";
    el.style.transform = direction;
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
    if (p.bid === p.tricks)
      p.score += (10 + 3 * p.tricks);
    else
      p.score -= 3 * Math.abs(p.tricks - p.bid);
  });
  let roundResult = { round: currentRoundIndex + 1, handSize: handSize, results: [] };
  players.forEach(p => {
    let roundPoints = (p.bid === p.tricks) ? (10 + 3 * p.tricks) : (-3 * Math.abs(p.tricks - p.bid));
    roundResult.results.push({ roundPoints: roundPoints, total: p.score });
  });
  scoreData.push(roundResult);
  updatePlayerInfo();
  let summary = "Ronda finalizada. ";
  players.forEach(p => {
    summary += p.name + " apostó " + p.bid + " y consiguió " + p.tricks + " baza" + (p.tricks !== 1 ? "s" : "") + ". ";
  });
  showMessage(summary);
  if (currentRoundIndex < rounds.length - 1) {
    currentRoundIndex++;
    setTimeout(startRound, 2000);
  } else {
    showScoreboard();
  }
}

function isLegalPlay(player, card) {
  if (currentTrick.length === 0) return true;
  let ledSuit = currentTrick[0].card.suit;
  let hasLedSuit = player.hand.some(c => c.suit === ledSuit);
  if (hasLedSuit) return card.suit === ledSuit;
  else {
    let hasTrump = player.hand.some(c => c.suit === trump.suit);
    return hasTrump ? card.suit === trump.suit : true;
  }
}

/***********************
 * FUNCIONES DE SELECCIÓN DE CARTA (IA CON SIMULACIÓN)
 ***********************/
function aiSelectCard(player) {
  let legalIndices = [];
  for (let i = 0; i < player.hand.length; i++) {
    if (isLegalPlay(player, player.hand[i])) {
      legalIndices.push(i);
    }
  }
  if (legalIndices.length === 0) legalIndices = player.hand.map((c, i) => i);
  if (legalIndices.length === 1) return legalIndices[0];
  let simsPerCandidate = 100; // Fijamos 100 simulaciones por candidato
  let target = player.bid;
  let candidateResults = [];
  legalIndices.forEach(candidateIndex => {
    let freq = {};
    for (let i = 0; i <= handSize; i++) { freq[i] = 0; }
    for (let sim = 0; sim < simsPerCandidate; sim++) {
      let tricksWon = simulateRemainingRoundForCard(player, candidateIndex);
      freq[tricksWon] += 1;
    }
    candidateResults.push({ candidate: candidateIndex, freq: freq });
    let candidateCard = player.hand[candidateIndex];
    let cardText = cardToText(candidateCard);
    let distributionParts = [];
    for (let i = 0; i <= handSize; i++) {
      distributionParts.push(freq[i] + " de " + i);
    }
    let distributionText = distributionParts.join(", ");
    let logMsg = player.name + ", Ronda " + (currentRoundIndex + 1) + ", " + handSize + " cartas, " + cardText + ", " + distributionText;
    updateSimLog(logMsg);
  });
  let bestCandidate = null;
  let maxExact = -1;
  candidateResults.forEach(result => {
    if (result.freq[target] > maxExact) {
      maxExact = result.freq[target];
      bestCandidate = result.candidate;
    }
  });
  if (maxExact > 0) return bestCandidate;
  let bestCandidateClose = null;
  let maxClose = -1;
  candidateResults.forEach(result => {
    let closeCount = Math.max(result.freq[target + 1] || 0, result.freq[target - 1] || 0);
    if (closeCount > maxClose) {
      maxClose = closeCount;
      bestCandidateClose = result.candidate;
    }
  });
  if (maxClose > 0) return bestCandidateClose;
  return legalIndices[Math.floor(Math.random() * legalIndices.length)];
}

/***********************
 * TABLA DE PUNTUACIÓN
 ***********************/
function showScoreboard() {
  let contentDiv = document.getElementById("scoreboard-content");
  contentDiv.innerHTML = "";
  let table = document.createElement("table");
  table.id = "scoreboard-table";
  table.style.borderCollapse = "collapse";
  let scoreboardOrder = [];
  scoreboardOrder.push(players.find(p => p.position === "west"));
  scoreboardOrder.push(players.find(p => p.position === "north"));
  scoreboardOrder.push(players.find(p => p.position === "east"));
  scoreboardOrder.push(players.find(p => p.type === "human"));
  let thead = document.createElement("thead");
  let headerRow1 = document.createElement("tr");
  let thRonda = document.createElement("th");
  thRonda.colSpan = 2;
  thRonda.textContent = "Ronda";
  thRonda.classList.add("main-column");
  headerRow1.appendChild(thRonda);
  scoreboardOrder.forEach((p, index) => {
    let thPlayer = document.createElement("th");
    thPlayer.colSpan = 2;
    thPlayer.textContent = p.name;
    if (index < scoreboardOrder.length - 1)
      thPlayer.classList.add("main-column");
    headerRow1.appendChild(thPlayer);
  });
  thead.appendChild(headerRow1);
  let headerRow2 = document.createElement("tr");
  let thRoundNum = document.createElement("th");
  thRoundNum.textContent = "Número";
  headerRow2.appendChild(thRoundNum);
  let thHand = document.createElement("th");
  thHand.textContent = "Cartas";
  headerRow2.appendChild(thHand);
  scoreboardOrder.forEach(() => {
    let thPoints = document.createElement("th");
    thPoints.textContent = "Puntos";
    headerRow2.appendChild(thPoints);
    let thTotal = document.createElement("th");
    thTotal.textContent = "Total";
    headerRow2.appendChild(thTotal);
  });
  thead.appendChild(headerRow2);
  table.appendChild(thead);
  let tbody = document.createElement("tbody");
  for (let i = 1; i <= 16; i++) {
    let tr = document.createElement("tr");
    if (i === 4 || i === 12) tr.classList.add("separator");
    let tdRound = document.createElement("td");
    tdRound.textContent = i;
    tr.appendChild(tdRound);
    let tdHand = document.createElement("td");
    tdHand.textContent = scoreData[i - 1] ? scoreData[i - 1].handSize : "";
    tr.appendChild(tdHand);
    scoreboardOrder.forEach((p) => {
      let tdPoints = document.createElement("td");
      let tdTotal = document.createElement("td");
      if (scoreData[i - 1]) {
        let playerIndex = players.indexOf(p);
        let res = scoreData[i - 1].results[playerIndex];
        tdPoints.textContent = res.roundPoints;
        tdTotal.textContent = res.total;
        if (res.roundPoints < 0) tdPoints.style.color = "red";
        if (res.total < 0) tdTotal.style.color = "red";
      } else {
        tdPoints.textContent = "";
        tdTotal.textContent = "";
      }
      tr.appendChild(tdPoints);
      tr.appendChild(tdTotal);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  contentDiv.innerHTML = "";
  contentDiv.appendChild(table);
  document.getElementById("scoreboard-overlay").style.display = "block";
}

function hideScoreboard() {
  document.getElementById("scoreboard-overlay").style.display = "none";
}

/***********************
 * EVENTOS DEL USUARIO Y DEL LOG (OVERLAY)
 ***********************/
document.addEventListener("mousemove", function(e) {
  if (e.clientX < 20 && !logClosed) {
    document.getElementById("sim-log").style.display = "block";
  } else if (e.clientX > 100) {
    logClosed = false;
  }
});
document.getElementById("sim-log").addEventListener("click", function(e) {
  if (e.target.id === "sim-log-close") {
    document.getElementById("sim-log").style.display = "none";
    logClosed = true;
  }
});
document.getElementById("new-game").addEventListener("click", function() {
  currentRoundIndex = 0;
  players.forEach(p => p.score = 0);
  scoreData = [];
  assignAINames();
  document.getElementById("sim-log").innerHTML = "";
  startRound();
});
document.getElementById("scoreboard-button").addEventListener("click", showScoreboard);
document.getElementById("scoreboard-close").addEventListener("click", hideScoreboard);

/***********************
 * EVENTOS DE CARTAS (HUMANO)
 ***********************/
document.getElementById("player-2-hand").addEventListener("click", function(e) {
  // Los eventos de clic se asignan en updateHandsDisplay.
});
function onHumanCardClick(event) {
  let index = parseInt(event.currentTarget.dataset.index);
  let human = players.find(p => p.type === "human");
  let card = human.hand[index];
  if (!isLegalPlay(human, card)) {
    showMessage("¡Debes seguir el palo o, si no lo tienes, tirar triunfo!");
    return;
  }
  playCard(2, index);
}


/***********************
 * CICLO DEL JUEGO – INICIO Y PROCESAMIENTO
 ***********************/

function startRound() {
  if (currentRoundIndex === 0) {
    dealer = Math.floor(Math.random() * players.length);
  } else {
    if (gameDirection === "clockwise") {
      dealer = (dealer + 1) % players.length;
    } else { // counterclockwise
      dealer = ((dealer - 1) % players.length + players.length) % players.length;
    }
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
    players.forEach(p => { p.hand.push(deck.pop()); });
  }
  trump = deck.pop();
  trumpSuit = trump.suit;
  updateRoundInfo();
  // Generar biddingOrder según gameDirection
  biddingOrder = [];
  if (gameDirection === "clockwise") {
    for (let i = 1; i <= players.length; i++) {
      biddingOrder.push((dealer + i) % players.length);
    }
  } else {
    for (let i = 1; i <= players.length; i++) {
      biddingOrder.push(((dealer - i) % players.length + players.length) % players.length);
    }
  }
  updatePlayerInfo();
  updateHandsDisplay();
  showMessage("Trump: " + getSuitSymbol(trump.suit) + " (" + trump.suit + ")");
  setTimeout(processNextBid, 1000);
}


function processNextBid() {
  updatePlayerInfo();
  if (biddingIndex >= biddingOrder.length) {
    currentPhase = "playing";
    currentPlayer = biddingOrder[0];
    updatePlayerInfo();
    showMessage("Apuestas completas. " + players.find(p => p.id === currentPlayer).name + " lidera.");
    setTimeout(playTurn, 1000);
    return;
  }
  let pid = biddingOrder[biddingIndex];
  let p = players.find(p => p.id === pid);
  if (p.type === "ai") {
    let bid = aiComputeBid(pid);
    p.bid = bid;
    updatePlayerInfo();
    showMessage(p.name + " apuesta " + bid);
    biddingIndex++;
    setTimeout(processNextBid, 1000);
  } else {
    updatePlayerInfo();
    showMessage("Tu turno para apostar. Ya se han realizado " + biddingIndex + " apuestas. Elige un número entre 0 y " + handSize + ".");
    displayBidOptions();
  }
}

function displayBidOptions() {
  clearBidArea();
  updatePlayerInfo();
  let bidArea = document.getElementById("bid-area");
  for (let i = 0; i <= handSize; i++) {
    let btn = document.createElement("button");
    btn.textContent = i;
    btn.classList.add("bid-button");
    btn.addEventListener("click", function() {
      players.find(p => p.type === "human").bid = i;
      updatePlayerInfo();
      showMessage("Apuestas: " + i);
      clearBidArea();
      biddingIndex++;
      setTimeout(processNextBid, 500);
    });
    bidArea.appendChild(btn);
  }
}

function startGameCycle() {
  startRound();
}



/***********************
 * CICLO DEL JUEGO – INICIO Y PROCESAMIENTO
 ***********************/
function clearPlayerAreas() {
  clearBidArea();
  clearTrickArea();
}

startRound();


