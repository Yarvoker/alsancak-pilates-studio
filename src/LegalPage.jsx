import { useEffect, useState } from 'react'
import { fetchSiteContent } from './booking/bookingApi.js'

function LegalPage({ contentKey, title }) {
  const [body, setBody] = useState('')
  const [heading, setHeading] = useState(title)

  useEffect(() => {
    let ignore = false
    fetchSiteContent(contentKey)
      .then((row) => {
        if (ignore) return
        setHeading(row?.title?.trim() || title)
        setBody(row?.body || '')
      })
      .catch(() => {
        if (!ignore) setBody('')
      })
    return () => {
      ignore = true
    }
  }, [contentKey, title])

  return (
    <section className="section legal-page" aria-labelledby="legal-title">
      <p className="eyebrow">Alsancak Pilates</p>
      <h1 id="legal-title">{heading}</h1>
      <p className="hero-text">{body.trim() ? body : 'İçerik hazırlanıyor.'}</p>
    </section>
  )
}

export default LegalPage
