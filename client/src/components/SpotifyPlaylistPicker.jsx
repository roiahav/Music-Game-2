import { motion, AnimatePresence } from 'framer-motion';

export default function SpotifyPlaylistPicker({ playlists, onSelect, onClose }) {
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 50,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        <motion.div
          key="sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: '#2d2d30',
            borderRadius: '20px 20px 0 0',
            width: '100%',
            maxWidth: 480,
            maxHeight: '75vh',
            display: 'flex',
            flexDirection: 'column',
            direction: 'rtl',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>בחר פלייליסט Spotify</span>
            <button
              onClick={onClose}
              style={{
                background: '#444', border: 'none', color: '#fff',
                borderRadius: '50%', width: 28, height: 28,
                cursor: 'pointer', fontSize: 16, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {playlists.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#666' }}>
                לא נמצאו פלייליסטים
              </div>
            )}
            {playlists.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: '1px solid #3a3a3a', padding: '14px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'right', direction: 'rtl',
                  color: '#fff',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#3a3a3d'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                  {p.tracks > 0 && (
                    <span style={{ fontSize: 12, color: '#888' }}>{p.tracks} שירים</span>
                  )}
                </div>
                <span style={{ color: '#1db954', fontSize: 20 }}>🟢</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
