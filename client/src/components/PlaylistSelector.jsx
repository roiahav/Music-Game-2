export default function PlaylistSelector({ playlists, selectedId, onSelect, loading }) {
  if (!playlists.length) {
    return (
      <div className="text-center py-3 text-sm" style={{ color: '#666' }}>
        אין פלייליסטים — הוסף בהגדרות
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {playlists.map(p => {
        const isSelected = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            disabled={loading}
            className="no-select shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 cursor-pointer"
            style={{
              background: isSelected ? '#007ACC' : '#2d2d30',
              color: isSelected ? '#fff' : '#aaa',
              border: isSelected ? '1px solid #007ACC' : '1px solid #3a3a3a',
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
