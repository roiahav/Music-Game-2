import { useSettingsStore } from '../store/settingsStore.js';
import { useLang } from '../i18n/useLang.js';

const PRESETS = [0, 15, 30, 60, 90, 120];

export default function GameOptionsBar() {
  const { game, saveGame } = useSettingsStore();
  const { t } = useLang();
  const timer = game.timerSeconds ?? 30;

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#2d2d30', border: '1px solid #3a3a3a' }}>
      <h3 className="font-bold text-sm">{t('game_settings')}</h3>

      {/* Shuffle */}
      <div className="flex items-center justify-between">
        <label className="text-sm cursor-pointer" htmlFor="shuffle">{t('shuffle_songs')}</label>
        <input
          id="shuffle"
          type="checkbox"
          checked={game.shuffle !== false}
          onChange={e => saveGame({ shuffle: e.target.checked })}
          className="cursor-pointer"
          style={{ width: 20, height: 20, accentColor: '#007ACC' }}
        />
      </div>

      {/* Timer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm">{t('timer_lbl')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={0}
              max={600}
              step={5}
              value={timer}
              onChange={e => saveGame({ timerSeconds: Math.max(0, Number(e.target.value)) })}
              style={{
                width: 64, background: '#1e1e1e', border: '1px solid #444',
                color: '#fff', borderRadius: 8, padding: '5px 8px',
                fontSize: 14, textAlign: 'center',
              }}
            />
            <span style={{ color: '#888', fontSize: 12 }}>{t('sec_suffix')}</span>
          </div>
        </div>
        {/* Quick presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(v => (
            <button
              key={v}
              onClick={() => saveGame({ timerSeconds: v })}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1px solid ${timer === v ? '#007ACC' : '#3a3a3a'}`,
                background: timer === v ? '#007ACC22' : 'transparent',
                color: timer === v ? '#5bb8ff' : '#666',
                cursor: 'pointer',
              }}
            >
              {v === 0 ? t('none') : `${v}″`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
