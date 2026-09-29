import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

function Slider({ label, value, onChange }) {
  return (
    <div className="settings-row">
      <label>{label}</label>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => { audio.unlock(); onChange(Number(e.target.value)); }}
      />
      <span className="settings-val">{value}</span>
    </div>
  );
}

function Seg({ label, options, value, onPick }) {
  return (
    <div className="settings-row">
      <label>{label}</label>
      <div className="seg">
        {options.map((o) => (
          <button
            key={o}
            className={value === o.toLowerCase() ? 'on' : ''}
            onClick={click(() => onPick(o.toLowerCase()))}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onToggle }) {
  return (
    <div className="settings-row">
      <label>{label}</label>
      <div className={`toggle${value ? ' on' : ''}`} onClick={click(() => onToggle(!value))} />
    </div>
  );
}

export function Settings() {
  const settings = useGame((s) => s.settings);
  const settingsReturn = useGame((s) => s.settingsReturn);
  const updateSettings = useGame((s) => s.updateSettings);
  const setPhase = useGame((s) => s.setPhase);

  return (
    <div className="screen screen-dim">
      <div className="panel">
        <h2>SETTINGS</h2>
        <Slider label="Master" value={settings.master} onChange={(v) => updateSettings({ master: v })} />
        <Slider label="Music" value={settings.music} onChange={(v) => updateSettings({ music: v })} />
        <Slider label="Effects" value={settings.sfx} onChange={(v) => updateSettings({ sfx: v })} />
        <Seg
          label="Graphics"
          options={['LOW', 'MEDIUM', 'HIGH']}
          value={settings.graphics}
          onPick={(v) => updateSettings({ graphics: v })}
        />
        <Toggle label="Camera Shake" value={settings.cameraShake} onToggle={(v) => updateSettings({ cameraShake: v })} />
        <Toggle label="Motion FX" value={settings.motionEffects} onToggle={(v) => updateSettings({ motionEffects: v })} />
        <Toggle label="Show FPS" value={settings.showFps} onToggle={(v) => updateSettings({ showFps: v })} />
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn" onClick={click(() => setPhase(settingsReturn))}>BACK</button>
        </div>
      </div>
    </div>
  );
}
