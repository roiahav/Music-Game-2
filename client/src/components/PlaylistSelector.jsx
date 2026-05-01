/**
 * PlaylistSelector — supports two modes:
 *  • Multi-select: pass `selectedIds` (Set) + `onToggle(id)`
 *  • Single-select: pass `selectedId` (string) + `onSelect(id)`  ← backward compat
 */
export default function PlaylistSelector({
  playlists,
  // multi-select
  selectedIds,
  onToggle,
  // single-select (legacy)
  selectedId,
  onSelect,
  // shared
  loading,
}) {
  if (!playlists.length) {
    return (
      <div className="text-center py-3 text-sm" style={{ color: '#666' }}>
        אין פלייליסטים — הוסף בהגדרות
      </div>
    );
  }

  function isSelected(id) {
    if (selectedIds) return selectedIds.has(id);
    return id === selectedId;
  }

  function handleClick(id) {
    if (onToggle) onToggle(id);
    else if (onSelect) onSelect(id);
  }

  return (
    <div className="flex gap-2 px-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {playlists.map(p => {
        const sel = isSelected(p.id);
        return (
          <button
            key={p.id}
            onClick={() => handleClick(p.id)}
            disabled={loading}
            className="no-select shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 cursor-pointer"
            style={{
              background: sel ? '#007ACC' : '#2d2d30',
              color: sel ? '#fff' : '#aaa',
              border: sel ? '1px solid #007ACC' : '1px solid #3a3a3a',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {p.type === 'spotify' ? '🟢 ' : ''}{p.name}
          </button>
        );
      })}
    </div>
  );
}
