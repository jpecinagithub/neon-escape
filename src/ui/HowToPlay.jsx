import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const CONTROLS = [
  ['W / ↑', 'Acelerar'],
  ['S / ↓', 'Frenar / marcha atrás'],
  ['A D / ← →', 'Girar'],
  ['ESPACIO', 'Freno de mano — ¡derrapa!'],
  ['R', 'Reiniciar coche'],
  ['C', 'Cambiar cámara'],
  ['ESC', 'Pausa'],
];

const PAD = [
  ['X / RT', 'Acelerar'],
  ['Cuadrado / LT', 'Frenar · marcha atrás'],
  ['Stick izquierdo', 'Girar'],
  ['Círculo', 'Freno de mano — ¡derrapa!'],
  ['Triángulo', 'Reiniciar coche'],
  ['R1', 'Cambiar cámara'],
  ['Options', 'Pausa'],
];

export function HowToPlay() {
  const setPhase = useGame((s) => s.setPhase);
  const replayTutorial = useGame((s) => s.replayTutorial);

  return (
    <div className="screen screen-dim">
      <div className="panel howto">
        <h2>CÓMO JUGAR</h2>
        <div className="howto-grid">
          {CONTROLS.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'contents' }}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <h3>MANDO</h3>
        <div className="howto-grid">
          {PAD.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'contents' }}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ opacity: 0.75 }}>
          Puedes enchufar un mando PlayStation en cualquier momento: gatillos
          analógicos, dirección y vibración en los choques funcionan junto al teclado.
        </p>
        <h3>LA IDEA DEL JUEGO</h3>
        <p>
          Eres un piloto en Neon City y cuatro tipos de perseguidores te dan caza.
          No hay meta: <b>sobrevive todo lo que puedas y haz la máxima puntuación</b>.
          La partida termina cuando tu chapa (HULL) llega a 0.
        </p>
        <p>
          <b>Puntos:</b> sobrevivir, derrapar, pasar rozando a toda velocidad
          (NEAR MISS, hasta 600 pts), destruir perseguidores y recoger potenciadores.
          Encadena acciones en menos de 4 segundos para subir el <b>combo hasta x5</b>.
        </p>
        <p>
          <b>Escapar es posible:</b> si te alejas más de 95 m de <i>todos</i> los
          perseguidores durante unos segundos, verás <b>BREAKING AWAY…</b> y al
          completarse <b>PURSUIT EVADED</b>: bonus gordo y 12 segundos de respiro.
          Huir tiene objetivo: ¡rompe la persecución!
        </p>
        <p>
          <b>Los choques se pueden evitar:</b> de cerca, los enemigos fijan su
          trayectoria al embestir — un quiebro brusco o un derrape a último momento
          los esquiva de verdad. Y si te embisten, ellos también se hacen daño:
          aguanta el intercambio y se romperán contra ti.
        </p>
        <p>
          <b>Potenciadores</b> (iconos de colores en el minimapa): <b>N</b> nitro
          (turbo de 5 s), <b>escudo</b> (8 s sin daño), <b>EMP</b> (fríe a los
          cercanos), <b>reparación</b> (+25 de chapa) y <b>x2</b> (puntos dobles 10 s).
        </p>
        <p>
          <b>Enemigos destruidos</b> cuenta cuántos perseguidores has destrozado:
          embistiéndolos a velocidad, con el EMP o dejando que se estrellen solos
          contra ti. Cada uno da +1000 puntos.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-primary" onClick={click(() => { audio.startMusic(); replayTutorial(); })}>JUGAR TUTORIAL</button>
          <button className="btn" onClick={click(() => setPhase('menu'))}>VOLVER</button>
        </div>
      </div>
    </div>
  );
}
