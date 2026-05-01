import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../i18n/useLang.js';

export default function RevealField({ label, value, isRevealed, onReveal }) {
  const { t } = useLang();
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer no-select"
      style={{ background: '#2d2d30', border: '1px solid #3a3a3a', minHeight: 56 }}
      onClick={() => !isRevealed && onReveal()}
    >
      <span className="text-sm font-semibold w-10 shrink-0" style={{ color: '#888' }}>
        {label}
      </span>
      <AnimatePresence mode="wait">
        {isRevealed ? (
          <motion.span
            key="value"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-base font-semibold flex-1"
            style={{ color: '#fff' }}
          >
            {value || '—'}
          </motion.span>
        ) : (
          <motion.div
            key="hidden"
            className="flex gap-1 flex-1 items-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[...Array(value ? Math.min(value.length, 8) : 5)].map((_, i) => (
              <span
                key={i}
                className="rounded"
                style={{ width: 18, height: 14, background: '#555', display: 'inline-block' }}
              />
            ))}
            <span className="mr-auto text-xs" style={{ color: '#666' }}>{t('click_reveal')}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
