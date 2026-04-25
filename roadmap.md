# Roadmap de analítica con Google Analytics 4

## Objetivo

Medir cómo se usa el juego sin registrar datos personales ni convertir cada
movimiento en ruido. La analítica debe responder preguntas prácticas:

- ¿Cuánta gente empieza una partida?
- ¿Qué dificultad elige?
- ¿Cuántas partidas se terminan?
- ¿Dónde abandona la gente?
- ¿Se consulta la puntuación?
- ¿El modo difícil y los cambios de IA mejoran retención o finalización?
- ¿Hay señales de errores de flujo, como rondas bloqueadas o estados anómalos?

## Instalación GA4

Measurement ID actual:

```txt
G-Q4KEKCL8BP
```

Implementado en `index.html`:

1. Insertar el script oficial de `gtag.js` dentro de `<head>`.
2. Configurar GA4 con el measurement ID `G-Q4KEKCL8BP`.
3. Crear helper JS seguro que no rompa el juego si GA4 está bloqueado:

```js
function trackEvent(event, data) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", event, data || {});
}
```

4. No enviar nombres de jugadores IA, cartas exactas ni datos identificables.
5. Antes de medir usuarios UE en producción, implementar el aviso de cookies/consentimiento o documentar que la medición queda dentro de la exención de medición de audiencia de la AEPD.

## Cookies y consentimiento

GA4 puede escribir o leer cookies/identificadores para analítica. Para usuarios
UE, hay que resolver el consentimiento antes de enviar medición completa, salvo
que se documente una configuración exenta y validada.

Tarea previa a producción:

1. Añadir banner de cookies con acciones al mismo nivel: aceptar, rechazar y configurar.
2. Activar Google Consent Mode v2 con analytics denegado por defecto en la UE.
3. Cargar GA4/analytics solo tras consentimiento, salvo que se documente una configuración exenta.
4. Incluir política de cookies/privacidad con finalidad, proveedor, duración y retirada del consentimiento.
5. Guardar la preferencia del usuario sin romper la partida ni bloquear el juego si rechaza analytics.
6. Verificar en GA4 DebugView y navegador que antes de aceptar no se crean cookies analíticas ni se envían eventos completos.

Nota legal de implementación:
La AEPD contempla una posible exención para cookies de medición de audiencia,
pero exige finalidad limitada a estadísticas anónimas del editor, sin cruce con
otros tratamientos, sin transmisión a terceros para finalidades propias y con
garantías de duración/conservación. Si se usa GA4 estándar, tratarlo
como no exento salvo validación específica.

## Eventos Prioritarios

### 1. `game_start`

Cuándo:
Cuando el usuario selecciona dificultad y empieza/reinicia partida.

Dónde:
Handler de `.dm-btn`, antes o después de `initGame()`.

Propiedades:

```js
{
  difficulty,
  deck_variant: deckVariant,
  game_direction: gameDirection,
  source: "initial_modal" | "new_game_modal"
}
```

Uso:
Medir starts por dificultad y cuántas veces se reinicia.

### 2. `round_start`

Cuándo:
Al inicio de cada ronda, después de repartir y definir triunfo.

Dónde:
Final de `startRound()`.

Propiedades:

```js
{
  round_index: currentRoundIndex + 1,
  hand_size: handSize,
  difficulty,
  dealer_position: players.find(p => p.id === dealer).position,
  trump_suit: trump.suit
}
```

Uso:
Detectar abandono por ronda/tamaño de mano. `trump_suit` es opcional; no es sensible, pero puede omitirse si queremos menos cardinalidad.

### 3. `round_end`

Cuándo:
Al cerrar una ronda.

Dónde:
`endRound()`, después de calcular puntuaciones.

Propiedades:

```js
{
  round_index: currentRoundIndex + 1,
  hand_size: handSize,
  difficulty,
  human_bid: players[2].bid,
  human_tricks: players[2].tricks,
  human_round_points: pts,
  human_total_score: players[2].score,
  total_bids,
  completed: true
}
```

Uso:
Medir progreso, dificultad percibida y abandono posterior a rondas malas.

Nota:
Enviar solo métricas del humano y agregados; no enviar detalle completo de manos/cartas.

### 4. `game_end`

Cuándo:
Al terminar la ronda 16.

Dónde:
`endRound()`, rama de partida terminada.

Propiedades:

```js
{
  difficulty,
  final_score_human,
  human_rank,
  rounds_completed: rounds.length,
  duration_ms,
  hit_rate_human
}
```

Uso:
Evento principal de conversión: partida completada.

Pendiente:
Guardar `gameStartTime` en `initGame()`.

### 5. `human_bid`

Cuándo:
Cuando el usuario pulsa una apuesta.

Dónde:
Listener creado en `displayBidOptions()`.

Propiedades:

```js
{
  round_index: currentRoundIndex + 1,
  hand_size: handSize,
  difficulty,
  bid: i,
  total_bids_so_far,
  is_last_bidder: biddingIndex === biddingOrder.length - 1
}
```

Uso:
Analizar si el usuario apuesta muy distinto según dificultad/tamaño de mano.

### 6. `human_card_play`

Cuándo:
Cada carta jugada por el humano.

Dónde:
`onHumanCardClick()` o `playCard()` filtrando `playerId === 2`.

Propiedades:

```js
{
  round_index: currentRoundIndex + 1,
  hand_size: handSize,
  difficulty,
  trick_size_before_play: currentTrick.length,
  legal_options_count,
  human_bid: human.bid,
  human_tricks: human.tricks
}
```

Uso:
Medir actividad real sin enviar la carta exacta. Puede ser bastante frecuente, así que si hay mucho tráfico se puede muestrear o desactivar.

## Eventos de UI

### `scoreboard_open`

Cuándo:
Al abrir la puntuación.

Propiedades:

```js
{
  phase: currentPhase,
  round_index: currentRoundIndex + 1,
  difficulty
}
```

Uso:
Saber si la tabla se usa y en qué momento.

### `new_game_open`

Cuándo:
Al pulsar "Nueva Partida".

Propiedades:

```js
{
  phase: currentPhase,
  round_index: currentRoundIndex + 1,
  difficulty
}
```

Uso:
Señal de abandono/reinicio.

### `new_game_cancel`

Cuándo:
Al cerrar el modal de nueva partida sin iniciar otra.

Uso:
Separar intención de reinicio de reinicio real.

## Eventos Técnicos / Calidad

### `ai_latency`

Cuándo:
No por defecto en producción. Activar solo con flag de debug o muestreo bajo.

Dónde:
Ya existe instrumentación parcial con `window.AI_LATENCY`.

Propiedades agregadas:

```js
{
  difficulty,
  hand_size,
  kind: "bid" | "card",
  p50_ms,
  p95_ms,
  sample_count
}
```

Uso:
Validar que cambios de IA no empeoran tablet/móvil.

### `game_state_anomaly`

Cuándo:
Cuando una guarda defensiva detecte estado imposible:

- jugador intenta jugar fuera de turno
- jugador intenta jugar dos veces en la misma baza
- índice de carta inexistente
- baza con más de 4 cartas
- ronda intenta continuar con algún jugador sin cartas mientras otros sí tienen

Propiedades:

```js
{
  anomaly_type,
  phase: currentPhase,
  round_index: currentRoundIndex + 1,
  hand_size: handSize,
  current_player: currentPlayer,
  trick_length: currentTrick.length
}
```

Uso:
Detectar bugs reales en GitHub Pages sin depender de reportes manuales.

Importante:
No enviar mano, carta exacta ni nombre del usuario.

## Métricas Derivadas Recomendadas

- `start_to_round_1_end_rate`
- `game_completion_rate`
- `completion_rate_by_difficulty`
- `avg_round_reached_by_difficulty`
- `scoreboard_open_rate`
- `new_game_restart_rate`
- `human_hit_rate_by_hand_size`
- `human_avg_score_by_difficulty`
- `anomaly_rate_per_100_games`
- `ai_bid_p95_ms_by_hand_size`

## Prioridad de Implementación

### Fase 1: Base

1. Instalar GA4 `gtag.js` en `index.html`.
2. Añadir aviso de cookies/consentimiento y Consent Mode si se activa GA4/analytics.
3. Añadir `trackEvent()`.
4. Enviar `game_start`, `round_start`, `round_end`, `game_end`.
5. Validar en GA4 Realtime y DebugView.

### Fase 2: UX

1. Añadir `scoreboard_open`.
2. Añadir `new_game_open` y `new_game_cancel`.
3. Añadir `human_bid`.

### Fase 3: Juego fino

1. Añadir `human_card_play` con propiedades agregadas.
2. Añadir `game_state_anomaly`.
3. Añadir agregación opcional de `ai_latency`.

### Fase 4: Limpieza

1. Revisar cardinalidad de parámetros.
2. Confirmar que no se envía PII.
3. Auditar que analytics no se dispara antes del consentimiento en la UE.

## Criterios de Aceptación

- GA4 `gtag.js` carga en GitHub Pages.
- `game_start` aparece una vez por partida iniciada.
- `game_end` aparece solo al terminar la partida.
- `round_start` y `round_end` aparecen 16 veces en una partida completa.
- No se registran cartas exactas ni nombres libres.
- Los eventos no rompen el juego si GA4 está bloqueado por adblocker.
- No hay eventos duplicados al abrir/cerrar modales o reiniciar partida.
- Antes de aceptar cookies, no se crean cookies analíticas ni se envían eventos completos de GA4.
- Rechazar cookies mantiene el juego usable y evita analytics no exento.
