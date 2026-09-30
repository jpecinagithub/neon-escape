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
          Eres un piloto en Neon City y las calles están llenas de gente.
          No hay meta: <b>haz la máxima puntuación antes de que tu chapa (HULL)
          llegue a 0</b>. La ropa lo dice todo:
        </p>
        <p>
          <b style={{ color: '#ff5566' }}>ROJO = malo:</b> ladrones, punkis y
          algún patinador. <b>¡Atropéllalos!</b> Cada uno da puntos
          (los patinadores rojos valen más) y no te hacen daño.
        </p>
        <p>
          <b style={{ color: '#5fa8ff' }}>AZUL = bueno:</b> niños, abuelas,
          embarazadas y algún patinador. <b>No los toques:</b> cada atropello
          inocente te quita 12 de chapa y rompe tu combo.
        </p>
        <p>
          <b>Puntos:</b> atropellar malos, derrapar, pasar rozando a un bueno
          a toda velocidad (hasta 600 pts) y recoger potenciadores.
          Encadena acciones en menos de 4 segundos para subir el <b>combo hasta x5</b>.
        </p>
        <p>
          <b>Los patinadores</b> son rapidísimos y pueden ser buenos o malos:
          fíjate en el color antes de decidir. Cuesta más atropellarlos… y más
          esquivarlos.
        </p>
        <p>
          <b>Potenciadores</b> (iconos de colores en el minimapa): <b>N</b> nitro
          (turbo de 5 s), <b>escudo</b> (8 s con menos daño), <b>EMP</b> (congela
          a los peatones cercanos unos segundos: apunta mejor o esquiva fácil),
          <b>reparación</b> (+25 de chapa) y <b>x2</b> (puntos dobles 10 s).
        </p>
        <p>
          <b>Atropellos</b> cuenta cuántos malos te has llevado por delante.
          En el minimapa los verás como puntos <b style={{ color: '#ff5566' }}>rojos</b>;
          los buenos son puntos <b style={{ color: '#5fa8ff' }}>azules</b>.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-primary" onClick={click(() => { audio.startMusic(); replayTutorial(); })}>JUGAR TUTORIAL</button>
          <button className="btn" onClick={click(() => setPhase('menu'))}>VOLVER</button>
        </div>
      </div>
    </div>
  );
}
