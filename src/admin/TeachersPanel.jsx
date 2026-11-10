import { useEffect, useState } from 'react'
import { adminMessage, fetchAdminTeachers, saveTeacherFlags } from './adminApi.js'

function TeachersPanel({ session, onNotice }) {
  const [teachers, setTeachers] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let ignore = false
    fetchAdminTeachers(session.username, session.password)
      .then((rows) => {
        if (!ignore) setTeachers(rows)
      })
      .catch((loadError) => {
        if (!ignore) setError(adminMessage(loadError))
      })
    return () => {
      ignore = true
    }
  }, [session.username, session.password])

  async function toggle(person, field) {
    const next = { ...person, [field]: !person[field] }
    setBusyId(person.id)
    setError('')
    try {
      await saveTeacherFlags(session.username, session.password, next)
      setTeachers((rows) => rows.map((row) => (row.id === person.id ? next : row)))
      onNotice(`${person.full_name} güncellendi.`)
    } catch (saveError) {
      setError(adminMessage(saveError))
    } finally {
      setBusyId('')
    }
  }

  if (error && teachers.length === 0) return <p className="booking-error" role="alert">{error}</p>

  return (
    <section className="admin-block">
      <h2>Öğretmenler</h2>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <div className="table-wrap phone-cards">
        <table>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Grup dersi verir</th>
              <th>Özel ders verir</th>
              <th>Aktif</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((person) => (
              <tr key={person.id}>
                <td data-label="Ad">{person.full_name}</td>
                {[['gives_group', 'Grup dersi'], ['gives_private', 'Özel ders'], ['active', 'Aktif']].map(([field, label]) => (
                  <td key={field} data-label={label}>
                    <input
                      type="checkbox"
                      checked={Boolean(person[field])}
                      disabled={busyId === person.id}
                      aria-label={`${person.full_name} ${field}`}
                      onChange={() => toggle(person, field)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default TeachersPanel
