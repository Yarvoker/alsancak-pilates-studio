import { useEffect, useState } from 'react'
import { fetchSiteContent } from './bookingApi.js'

const EMPTY = 'Paket koşulları yakında burada yer alacak.'

function PackageTerms() {
  const [body, setBody] = useState('')

  useEffect(() => {
    let ignore = false
    fetchSiteContent('package_terms')
      .then((row) => {
        if (!ignore) setBody(row?.body || '')
      })
      .catch(() => {
        if (!ignore) setBody('')
      })
    return () => {
      ignore = true
    }
  }, [])

  return (
    <aside className="package-terms" aria-label="Paket Koşulları">
      <h3>Paket Koşulları</h3>
      <p>{body.trim() ? body : EMPTY}</p>
    </aside>
  )
}

export default PackageTerms
