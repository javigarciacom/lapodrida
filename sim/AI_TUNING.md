# Ajuste de la IA de La Podrida — simulaciones y decisiones

Este documento explica, en castellano llano, qué ha hecho el proceso de ajuste
de la inteligencia artificial del modo **Difícil**, qué estrategias he probado,
qué significa cada una, dónde se aplica y qué resultados he obtenido. Está
escrito para que cualquiera pueda entender por qué el modo hard ahora juega
como juega.

---

## 1. Qué decisiones toma la IA durante una partida

En cada ronda, la IA tiene que tomar **dos tipos de decisiones**:

### A) La apuesta (bid)

Al principio de cada ronda, después del reparto, cada jugador mira sus cartas
y tiene que **decir cuántas bazas cree que va a ganar esa ronda**. Es una
adivinanza informada. Si acierta, +10 puntos y +3 por baza. Si falla, -3
puntos por cada baza de diferencia (por encima o por debajo).

Ejemplo: si apuesto 3 y gano 3 → +19. Si apuesto 3 y gano 2 → -3. Si apuesto
3 y gano 5 → -6.

### B) Qué carta echar en cada baza

Ya empezada la ronda, en cada baza la IA elige qué carta soltar de entre las
legales (hay que seguir el palo de salida, y si no tienes, hay que matar con
triunfo si tienes). Aquí el objetivo ya no es adivinar: es **hacer que las
bazas ganadas coincidan exactamente con lo que aposté**.

---

## 2. Cómo funcionan las simulaciones

La idea general: **si no sé qué va a pasar, lanzo el dado muchas veces**.

Para cada decisión (apostar, o elegir carta), la IA:

1. **Reparte mentalmente** las cartas que no ve entre los otros 3 jugadores,
   al azar. Varias veces (cientos o miles).
2. **Juega la ronda** a toda velocidad, como un ensayo simulado.
3. **Anota el resultado** de cada ensayo (cuántas bazas gano).
4. Con esa colección de resultados, **elige**.

Dos cosas pueden variar entre estrategias:

- **Cómo juegan los oponentes en la simulación.** ¿"Tontos" (siempre la carta
  más alta) o "inteligentes" (igual que jugaría un humano bueno)?
- **Qué regla usas para escoger.** Si simulo 1000 veces y sale una
  distribución como "gané 0 bazas 300 veces, 1 baza 500 veces, 2 bazas 180
  veces, 3 bazas 20 veces" → ¿apuesto 0, 1, 2, o 3? ¿Y qué carta elijo?

---

## 3. Glosario: políticas de oponente y reglas de decisión

### Políticas de juego de cartas (para los rivales dentro de la simulación)

| Nombre | Qué hace | Analogía |
|---|---|---|
| **Greedy (voraz)** | Siempre tira la carta más fuerte legal. Si tiene el As de triunfo, lo suelta a la primera. | Un niño jugando: la carta más grande, siempre. |
| **Heurístico** | Si puede ganar la baza con una carta barata, la gana. Si no puede ganar, tira la más baja. Si lidera una baza, tira la mejor 85% de las veces (el 15% mete ruido aleatorio para no ser demasiado predecible). | Un jugador decente de media tarde. |
| **Heurístico determinista** | Igual que el anterior pero sin el 15% de ruido aleatorio. Siempre la mejor jugada. | Un jugador serio que no improvisa. |

### Reglas para elegir la apuesta (a partir de una distribución de resultados)

| Nombre | Qué hace | Analogía |
|---|---|---|
| **Moda** | Elige el valor que aparece más veces en la simulación. "Lo más probable." | Lo que suele pasar. |
| **Media (redondeada)** | Suma todos los resultados, divide, redondea. | El promedio de toda la vida. |
| **Mediana** | El valor central de los resultados ordenados. | El que está justo en medio. |
| **EV (maximiza el valor esperado)** | Para cada apuesta posible (0, 1, 2, ...), calcula cuántos puntos esperaría ganar en promedio con *esa* apuesta, y escoge la que dé más puntos esperados. | El matemático: "¿qué me conviene más si juego muchas veces?" |
| **Hand-strength** | No simula. Cuenta cartas buenas (Ases, triunfos altos) y apuesta directamente una cifra basada en eso. | La intuición pura de un veterano. |

### Reglas para elegir la carta a jugar

Se usa el mismo tipo de simulación, pero ahora por cada carta posible de tu
mano. Simulas 40-150 veces jugando cada carta candidata, y anotas cuántas
bazas acabas ganando.

| Nombre | Qué hace |
|---|---|
| **Max-exacto** | Elige la carta que hace que salgas con tu apuesta clavada más veces. Ignora los "casi". |
| **Pesos a mano** | Da peso 1.0 a salir clavado, 0.4 a fallar por 1, 0.15 a fallar por 2, 0.05 a fallar por 3+. Elige la carta con mejor suma de pesos. Era lo que había antes. |
| **EV (valor esperado)** | Igual que en la apuesta: aplica la fórmula real del juego. Acertar vale +10+3·apuesta; fallar por 1 vale −3; fallar por 2 vale −6; etc. Elige la carta que da más puntos en promedio. |

---

## 4. Qué había antes de todo esto (estado inicial del modo hard)

| Decisión | Oponentes en simulación | Regla de elección |
|---|---|---|
| Apuesta | Greedy | Moda |
| Carta | Heurístico | Pesos a mano (1.0 / 0.4 / 0.15 / 0.05) |

Ya era mejor que fácil/medio (8000 simulaciones en vez de 300, y la heurística
bid-aware para cartas últimas en la baza), pero tenía dos problemas:

1. **Los rivales en la simulación de la apuesta eran "tontos"** (greedy). Esto
   hacía que el bidder se imaginara ganando más o menos bazas de las
   realistas.
2. **Los pesos de elección de carta eran arbitrarios**. No se correspondían
   con los puntos reales del juego.

El síntoma reportado por el usuario: *"la IA pide muy pocas bazas aunque
tenga cartas buenas, es muy conservadora"*.

---

## 5. Qué he probado — las estrategias candidatas

Monté un simulador en Python (`sim/engine.py`) que juega partidas completas
(16 rondas, 4 jugadores, mismas reglas que el JS) miles de veces. Sobre eso,
probé **seis estrategias de apuesta** distintas:

1. **`mode[greedy]`** — la del JS original (moda + rivales tontos).
2. **`mode[heuristic]`** — moda, pero los rivales en la simulación ya juegan
   como jugadores decentes.
3. **`mean[heuristic]`** — media redondeada, rivales heurísticos.
4. **`ev[heuristic]`** — valor esperado, rivales heurísticos.
5. **`ev_fullsmart_det`** — valor esperado, rivales Y bidder juegan
   determinista heurístico.
6. **`mode_fullsmart_det`** — moda, rivales Y bidder juegan determinista.

### Cómo corrí las pruebas

- **Simulador pareado:** cada estrategia juega 60 partidas de 16 rondas, con
  las **mismas cartas que han recibido las otras** (mismo "semilla" RNG por
  partida). Así descarto la suerte como variable y comparo estrategias,
  no repartos.
- **Medí por tamaño de ronda (hand size):** las rondas de 1 carta y las de 5
  cartas son juegos casi distintos, así que no basta con la media global.
  Saqué puntos por ronda, % aciertos, apuesta media, bazas reales medias, y
  sesgo (apuesta − bazas reales) **para cada tamaño de mano**.

---

## 6. Qué ha salido — los números que decidieron

**Puntos por ronda, según tamaño de mano** (cuanto más alto, mejor):

| hand size | mode[greedy] (original) | ev[heuristic] | **mean[heuristic] (ganadora)** |
|:-:|:-:|:-:|:-:|
| 1 | +8.56 | +8.54 | **+8.70** |
| 2 | +6.20 | **+6.60** | +6.53 |
| 3 | +5.04 | +5.42 | **+5.80** |
| 4 | +4.86 | +5.32 | **+5.92** |
| 5 | +3.67 | +4.81 | **+5.35** |

**Observación clave:** en las rondas grandes (4 y 5 cartas), la media
redondeada gana por más de medio punto por ronda. Y como hay **8 rondas de
5 cartas por partida**, eso son +8×0.5 = **+4 puntos gratis por partida**,
solo del cambio en rondas de 5.

**Apuesta media vs bazas reales** (cuánto se infravalora la mano):

| hand size | Bazas reales medias | Apuesta original | Apuesta con `mean` |
|:-:|:-:|:-:|:-:|
| 4 | 1.00 | 0.73 (sesgo −0.27) | 0.83 (sesgo −0.17) |
| 5 | 1.25 | 1.00 (sesgo −0.25) | 1.05 (sesgo −0.20) |

La IA **sigue** apostando un poco por debajo de las bazas que realmente va a
ganar, pero la mejora es notable. Esto confirma la intuición del usuario.

### Por qué gana la media y no la moda ni el EV

La distribución de bazas que la IA obtiene en las simulaciones tiene una
**cola a la derecha**: a veces te tocan repartos afortunados donde sacas 2 o
3 bazas con un triunfo potente, aunque normalmente saques 0 o 1.

- La **moda** ignora esa cola: se queda en el pico de la izquierda (lo más
  probable) y acaba apostando demasiado bajo.
- El **EV**, teóricamente, debería hacerlo bien, pero con pocas simulaciones
  (500-2000) la estimación de probabilidades es ruidosa, y ese ruido penaliza
  más los resultados "buenos pero improbables" que los "malos y frecuentes".
  Acaba siendo conservador también.
- La **media** integra toda la distribución sin penalizar la cola, y
  redondear a entero la hace robusta al ruido.

---

## 7. Qué he cambiado en el código final

### Cambio 1 — rivales más realistas en la simulación de apuesta

**Antes:** en la simulación del bidder, los otros jugadores siempre tiraban la
carta legal más alta (greedy). Subestimaba las bazas del bidder.

**Ahora:** en modo hard (flag `smartSim`), los rivales juegan la heurística
(ganan barato, tiran basura cuando pueden). La estimación es más realista.

Archivo: `script.js` → función `simulateRoundForBid`.

### Cambio 2 — apuesta por media redondeada

**Antes:** la IA hard escogía la apuesta más frecuente (la moda).

**Ahora:** la IA hard calcula la **media** de bazas ganadas en las
simulaciones y la redondea. Basado en los datos: gana en 4 de los 5 tamaños
de ronda, y empata en el otro (diferencia despreciable).

Archivo: `script.js` → función `simulateBid`.

### Cambio 3 — elección de carta por valor esperado real

**Antes:** la IA hard ponderaba cada resultado con pesos arbitrarios (1.0 /
0.4 / 0.15 / 0.05).

**Ahora:** usa la **función de puntuación real del juego**:
acertar vale +10+3·apuesta; fallar por N vale −3·N. Se corresponde
exactamente con cuántos puntos ganas o pierdes al final de la ronda.

Archivo: `script.js` → función `aiSelectCard`.

---

## 8. Lo que quedó fuera — y por qué

- **Estrategia distinta por tamaño de ronda.** Los datos mostraron que la
  media redondeada gana en casi todos los tamaños. Una regla distinta por
  tamaño añade complejidad sin ganancia real.
- **Bidder heurístico en su propia simulación.** Probado
  (`analysis_with_smart_self.py`): marginalmente mejor en algunos tamaños,
  peor en otros. No compensa la complejidad.
- **MCTS (Monte Carlo Tree Search) ligero para la elección de carta.** La
  mejora potencial es grande pero el coste en CPU (y tiempo de desarrollo)
  también. Queda como "próximo paso" si después de probar esto sigues
  notando que la IA elige mal las cartas.

---

## 9. Herramientas que quedan en el repo (carpeta `sim/`)

| Archivo | Para qué sirve |
|---|---|
| `engine.py` | Motor del juego en Python, réplica fiel de las reglas del JS. |
| `strategies.py` | Todas las estrategias de apuesta y la estrategia de carta compartida. |
| `experiment.py` | Torneo básico entre 4 estrategias. |
| `analysis_by_hand_size.py` | Análisis por tamaño de ronda: "¿dónde infrapuesta la IA?" |
| `analysis_with_smart_self.py` | Prueba: ¿ayuda que el bidder juegue también heurísticamente? |
| `find_best_per_size.py` | Torneo de 6 estrategias para elegir la mejor por tamaño. Guarda los datos en JSON. |
| `analyze_results.py` | Lee el JSON del anterior y genera la tabla de ganadores sin tener que volver a simular. |

Si algún día hay que afinar más la IA, el flujo sería:

1. Añadir una nueva estrategia en `strategies.py`.
2. Incluirla en el torneo de `find_best_per_size.py`.
3. Ejecutar `python3 find_best_per_size.py` (~13 min).
4. Mirar el output. Si alguna nueva estrategia gana en algún tamaño por
   margen grande y consistente, portarla al JS.
