import { useState } from 'react';
import { getSettings as getSettingsApi, saveSettings } from '../../api/client.js';

/**
 * Admin-only panel for managing reusable WhatsApp invite-message templates.
 * Each template has a `name` (admin-facing) and a `body` containing the
 * placeholders {firstName} / {lastName} / {url}, which the invite panel
 * substitutes at send time.
 */
export default function InviteTemplatesPanel() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [editingId, setEditingId] = useState(null);   // id being edited
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const s = await getSettingsApi();
      setTemplates(Array.isArray(s.inviteTemplates) ? s.inviteTemplates : []);
    } catch {}
    setLoaded(true);
  }

  function handleOpen() {
    if (!loaded) load();
    setOpen(o => !o);
  }

  async function persist(next) {
    setSaving(true);
    try { await saveSettings({ inviteTemplates: next }); setTemplates(next); }
    catch (e) { alert(e.response?.data?.error || 'שגיאה בשמירה'); }
    finally { setSaving(false); }
  }

  function startNew() {
    setEditingId('__new__');
    setEditName('');
    setEditBody('שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם כאן: {url}');
  }

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditBody(tpl.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditBody('');
  }

  async function saveEdit() {
    if (!editName.trim()) return alert('נא להזין שם תבנית');
    if (!editBody.trim()) return alert('נא להזין תוכן הודעה');
    if (!editBody.includes('{url}')) {
      if (!confirm('שים לב — אין {url} בתבנית, הקישור לא יוטמע. להמשיך בכל זאת?')) return;
    }

    let next;
    if (editingId === '__new__') {
      const newTpl = { id: 'tmpl-' + Date.now(), name: editName.trim(), body: editBody };
      next = [...templates, newTpl];
    } else {
      next = templates.map(t => t.id === editingId ? { ...t, name: editName.trim(), body: editBody } : t);
    }
    await persist(next);
    cancelEdit();
  }

  async function deleteTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!confirm(`למחוק את התבנית "${tpl?.name}"?`)) return;
    await persist(templates.filter(t => t.id !== id));
  }

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📝 תבניות הודעה להזמנה</span>
          {templates.length > 0 && (
            <span style={{ fontSize: 11, color: '#5bb8ff', background: '#007ACC22', padding: '2px 8px', borderRadius: 10, border: '1px solid #007ACC55', fontWeight: 700 }}>
              {templates.length}
            </span>
          )}
        </div>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#888', fontSize: 12 }}>
            תבניות לשליחה בוואטסאפ. תוכל לבחור מהן בעת שליחת הזמנה.
            <br/>
            <span style={{ color: '#aaa' }}>תוויות זמינות:</span>{' '}
            <code style={{ color: '#5bb8ff', fontSize: 11 }}>{'{firstName} {lastName} {url}'}</code>
          </p>

          {/* Existing templates */}
          {templates.map(tpl => (
            editingId === tpl.id ? (
              <TemplateEditor
                key={tpl.id}
                name={editName} setName={setEditName}
                body={editBody} setBody={setEditBody}
                onSave={saveEdit} onCancel={cancelEdit} saving={saving}
              />
            ) : (
              <div key={tpl.id} style={{
                background: '#1e1e1e', border: '1px solid #3a3a3a',
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{tpl.name}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(tpl)} style={tplBtnStyle('#444')}>✏️ ערוך</button>
                    <button onClick={() => deleteTemplate(tpl.id)} style={tplBtnStyle('#dc354544')}>🗑️</button>
                  </div>
                </div>
                <pre style={{
                  margin: 0, color: '#aaa', fontSize: 11, whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit', maxHeight: 80, overflowY: 'auto',
                }}>{tpl.body}</pre>
              </div>
            )
          ))}

          {/* New template editor */}
          {editingId === '__new__' && (
            <TemplateEditor
              name={editName} setName={setEditName}
              body={editBody} setBody={setEditBody}
              onSave={saveEdit} onCancel={cancelEdit} saving={saving}
            />
          )}

          {/* + Add button */}
          {editingId === null && (
            <button
              onClick={startNew}
              style={{
                padding: '10px', borderRadius: 10,
                background: '#007ACC22', border: '1px dashed #007ACC55',
                color: '#5bb8ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              + תבנית חדשה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ name, setName, body, setBody, onSave, onCancel, saving }) {
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #007ACC', borderRadius: 10, padding: '12px' }}>
      <label style={{ color: '#aaa', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>שם תבנית</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="לדוג׳ ידידותי / רשמי / משפחתי"
        style={{
          width: '100%', background: '#2d2d30', border: '1px solid #444',
          color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          boxSizing: 'border-box', outline: 'none', marginBottom: 10,
        }}
      />
      <label style={{ color: '#aaa', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>תוכן ההודעה</label>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={6}
        style={{
          width: '100%', background: '#2d2d30', border: '1px solid #444',
          color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          boxSizing: 'border-box', outline: 'none', resize: 'vertical',
          fontFamily: 'inherit', lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'none', border: '1px solid #444', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          ביטול
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ flex: 2, padding: '9px', borderRadius: 8, background: '#007ACC', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? 'שומר...' : '💾 שמור תבנית'}
        </button>
      </div>
    </div>
  );
}

const tplBtnStyle = (bg) => ({
  background: bg, border: 'none', color: '#fff',
  borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
  cursor: 'pointer',
});
