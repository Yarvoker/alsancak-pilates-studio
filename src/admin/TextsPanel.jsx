import { useEffect, useState } from 'react'
import { adminMessage, fetchSiteTexts, saveSiteText } from './adminApi.js'

function TextsPanel({ session, onNotice }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState('')

  useEffect(() => {
    let ignore = false
    fetchSiteTexts(session.username, session.password)
      .then((list) => {
        if (!ignore) setRows(list)
      })
      .catch((loadError) => {
        if (!ignore) setError(adminMessage(loadError))
      })
    return () => {
      ignore = true
    }
  }, [session.username, session.password])

  function edit(key, field, value) {
    setRows((list) => list.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  async function save(row) {
    setBusyKey(row.key)
    setError('')
    try {
      await saveSiteText(session.username, session.password, row.key, row.title, row.body)
      onNotice('Metin kaydedildi.')
    } catch (saveError) {
      setError(adminMessage(saveError))
    } finally {
      setBusyKey('')
    }
  }

  return (
    <section className="admin-block">
      <h2>Metinler</h2>
      <p className="sheet-copy">Yasal sayfalar bu kayıtlardan okunur. Boş metin sitede hazırlanıyor notuyla durur.</p>
      {error && <p className="booking-error" role="alert">{error}</p>}
      {rows.map((row) => (
        <form
          key={row.key}
          className="admin-text"
          onSubmit={(event) => {
            event.preventDefault()
            save(row)
          }}
        >
          <p className="sheet-kicker">{row.key}</p>
          <label>
            Başlık
            <input value={row.title || ''} onChange={(event) => edit(row.key, 'title', event.target.value)} />
          </label>
          <label>
            Metin
            <textarea value={row.body || ''} onChange={(event) => edit(row.key, 'body', event.target.value)} />
          </label>
          <button type="submit" className="cta" disabled={busyKey === row.key}>
            {busyKey === row.key ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </form>
      ))}
    </section>
  )
}

export default TextsPanel
