import Seo from './Seo.jsx'
import { pageByPath } from './siteSeo.js'

export default function PrivacyPage() {
  const seo = pageByPath('/gizlilik')
  return (
    <section className="section" aria-labelledby="gizlilik-title">
      <Seo title={seo.title} description={seo.description} path={seo.path} robots={seo.robots} />
      <p className="eyebrow">Alsancak Pilates</p>
      <h1 id="gizlilik-title">Aydınlatma metni</h1>
      <p className="hero-text">
        Ad, soyad, telefon ve e-posta adresin ders kaydı, hatırlatma ve stüdyo iletişimi için işlenir.
        Verilerini Hesabım’dan indirebilir veya silinmesini isteyebilirsin.
      </p>
      <p className="hero-text">
        Verilerin sana aittir. Silme talebi stüdyoya gider; hesap hemen silinmez.
      </p>
    </section>
  )
}
