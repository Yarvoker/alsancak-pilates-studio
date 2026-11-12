import { useEffect, useState } from 'react'
import { fetchSiteContent } from './booking/bookingApi.js'
import Seo from './Seo.jsx'
import { pageByPath } from './siteSeo.js'

const PATH_BY_KEY = {
  package_terms: '/paket-kosullari',
  iptal_iade: '/iptal-iade',
  mesafeli_satis: '/mesafeli-satis',
  cerez: '/cerez',
}

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

  const seo = pageByPath(PATH_BY_KEY[contentKey])

  return (
    <section className="section legal-page" aria-labelledby="legal-title">
      {seo ? <Seo title={seo.title} description={seo.description} path={seo.path} robots={seo.robots} /> : null}
      <p className="eyebrow">Alsancak Pilates</p>
      <h1 id="legal-title">{heading}</h1>
      <p className="hero-text">{body.trim() ? body : 'İçerik hazırlanıyor.'}</p>
    </section>
  )
}

export default LegalPage
