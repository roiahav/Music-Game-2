import { motion, AnimatePresence } from 'framer-motion';

export default function AlbumArtCard({ coverUrl, isRevealed, onTap }) {
  return (
    <div
      className="no-select mx-auto cursor-pointer"
      style={{ width: 240, height: 240 }}
      onClick={onTap}
    >
      <AnimatePresence mode="wait">
        {!isRevealed ? (
          <motion.div
            key="placeholder"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full rounded-2xl flex flex-col items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%)', border: '2px solid #444' }}
          >
            <span style={{ fontSize: 64 }}>🎵</span>
            <span className="text-sm font-medium" style={{ color: '#888' }}>לחץ לחשיפה</span>
          </motion.div>
        ) : (
          <motion.div
            key="cover"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="w-full h-full rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="כריכת אלבום"
                className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center rounded-2xl" style={{ background: '#333' }}>
                <span style={{ fontSize: 80 }}>💿</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
