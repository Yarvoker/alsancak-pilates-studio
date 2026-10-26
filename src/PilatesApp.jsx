import { useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import AccountPage from './account/AccountPage.jsx'
import AdminGate from './admin/AdminGate.jsx'
import BookingPanel from './booking/BookingPanel.jsx'
import EmailOtpCard from './booking/EmailOtpCard.jsx'
import PaymentPanel from './booking/PaymentPanel.jsx'
import { useMemberDashboard } from './booking/useMemberDashboard.js'
import './PilatesApp.css'

const instagramUrl = 'https://www.instagram.com/alsancak_pilates/'
const whatsappUrl = 'https://wa.me/905302071908?text=Merhaba,%20deneme%20seansı%20hakkında%20bilgi%20almak%20istiyorum'
const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=Dr.+Mustafa+Enver+Bey+Cad.+K%C3%BClt%C3%BCr+Apt.+No%3A30%2F7+Alsancak+%C4%B0zmir'

const navItems = [
  ['Dersler', 'dersler'],
  ['Eğitmen', 'egitmen'],
  ['Galeri', 'galeri'],
  ['Fiyatlar', 'fiyatlar'],
]

function accountInitials(profile, user) {
  const first = String(profile?.first_name || '').trim()
  const last = String(profile?.last_name || '').trim()
  const letters = `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase('tr-TR')
  if (letters.trim()) return letters
  const email = profile?.email || user?.email || ''
  return (email.charAt(0) || '•').toLocaleUpperCase('tr-TR')
}

const disciplineButtons = [
  'Mat & Reformer',
  'Fonksiyonel + Crossfit',
  'TRX',
]

const disciplines = [
  {
    id: 'mat-reformer',
    title: 'Mat & Reformer',
    description: 'Kuvvet, denge ve nefes kontrolünü bir araya getiren kontrollü Pilates seansları.',
    badge: 'Max 6',
    image: '/images/group-reformer.jpg',
    imageAlt: 'Alsancak Pilates Studio’da grup Reformer dersi',
  },
  {
    id: 'functional-crossfit',
    title: 'Fonksiyonel + Crossfit',
    description: 'Günlük hareketleri güçlendiren, enerji yükselten ve dayanıklılığı artıran akış.',
    badge: 'Max 8',
  },
  {
    id: 'trx',
    title: 'TRX',
    description: 'Stüdyo ekipmanlarıyla desteklenen, core ve stabilite odaklı kontrollü kuvvet çalışması.',
    badge: 'Max 6',
  },
]

const galleryItems = [
  { title: 'Stüdyo', src: '/images/Stüdyo.jpg', alt: 'Alsancak Pilates Studio’nun stüdyo alanı' },
  { title: 'Reformer', src: '/images/group-reformer.jpg', alt: 'Reformer ekipmanlarında grup Pilates dersi' },
  { title: 'Cadillac', src: '/images/cadillac-tower.jpg', alt: 'Cadillac Tower ekipmanında Pilates çalışması' },
  { title: 'Mat', src: '/images/private-session.jpg', alt: 'Eğitmen eşliğinde birebir Pilates seansı' },
]

const pricing = [
  { type: 'Deneme Seansı', price: 'Bilgi için yazın', description: 'İlk görüşme ve hareket analizi', accent: false },
  { type: '8’li Paket', price: 'Bilgi için yazın', description: 'Düzenli ilerleme için odaklı seans', accent: true },
  { type: 'Aylık Üyelik', price: 'Bilgi için yazın', description: 'Sınırsız planlama ve esnek paketler', accent: false },
]

const trainerBadges = ['Türkiye Cimnastik Federasyonu', 'Mat & Reformer', 'Fonksiyonel Antrenman', 'TRX']

function AdminRoute() {
  const navigate = useNavigate()
  return <AdminGate onClose={() => navigate('/')} />
}

function PilatesApp() {
  const location = useLocation()
  const onHome = location.pathname === '/'
  const [activeDiscipline, setActiveDiscipline] = useState(disciplines[0])
  const [authUser, setAuthUser] = useState(null)
  const [hash, setHash] = useState(() => window.location.hash)
  const { data: dashboard } = useMemberDashboard(authUser)
  const checkoutOpen = onHome && hash === '#odeme'
  const initials = accountInitials(dashboard?.profile, authUser)

  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const accountChip = (className) => (
    <a className={className} href="/hesabim">
      {authUser ? (
        <>
          <span className="account-avatar" aria-hidden="true">{initials}</span>
          Hesabım
        </>
      ) : 'Giriş yap'}
    </a>
  )

  return (
    <div className="page-shell">
      <EmailOtpCard visible={false} scrollOnLink={false} onUser={setAuthUser} />
      <header className="topbar">
        <a className="brand" href={onHome ? '#ana-sayfa' : '/#ana-sayfa'} aria-label="Alsancak Pilates Studio ana sayfa">
          <img className="brand-mark" src="/images/alsancak-pilates-logo.jpg" alt="Alsancak Pilates Studio logo" />
          <span className="brand-text">
            <strong>Alsancak</strong>
            <small>Pilates Studio</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Ana menü">
          {navItems.map(([label, id]) => (
            <a key={id} href={onHome ? `#${id}` : `/#${id}`}>
              {label}
            </a>
          ))}
          {accountChip('account-chip account-chip--nav')}
        </nav>

        <div className="header-actions">
          {accountChip('account-chip account-chip--bar')}
          <a className="header-button" href={instagramUrl} target="_blank" rel="noreferrer">
            Instagram’a yaz
          </a>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/hesabim" element={<AccountPage user={authUser} onUser={setAuthUser} />} />
          <Route path="/" element={<>
        {checkoutOpen && <PaymentPanel />}
        {!checkoutOpen && (<>
        <section className="hero section" id="ana-sayfa">
          <div className="hero-copy">
            <p className="eyebrow">ALSANCAK · İZMİR</p>
            <h1>Hareket için doğru yer.</h1>
            <p className="hero-text">
              Alsancak, İzmir’de Mat ve Reformer Pilates, Fonksiyonel antrenman, Crossfit ve TRX.
            </p>

            <div className="selector-row" aria-label="Ders seçenekleri">
              {disciplineButtons.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={activeDiscipline.title === label ? 'selector active' : 'selector'}
                  onClick={() => setActiveDiscipline(disciplines.find((item) => item.title === label) ?? disciplines[0])}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="hero-actions">
              <a className="cta cta-primary" href="#iletisim">
                Rezervasyon Yap
              </a>
            </div>
          </div>

          <div className="hero-visual" aria-label="Reformer ve Cadillac ekipmanları">
            <div className="hero-video-frame">
              <video
                className="hero-video"
                src="/images/hero-pilates.mp4"
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        <section className="classes section" id="dersler">
          <div className="section-heading">
            <p className="eyebrow">DERSLER</p>
            <h2>Pilatesin içinden.</h2>
          </div>

          <div className="card-grid three-up">
            {disciplines.map((item) => (
              <article key={item.id} className={item.image ? 'class-card' : 'class-card class-card--text-only'}>
                {item.image && (
                  <div className="card-image">
                    <img src={item.image} alt={item.imageAlt} loading="lazy" />
                  </div>
                )}
                <div className="card-body">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="booking section" id="iletisim">
          <div className="section-heading">
            <p className="eyebrow">REZERVASYON</p>
            <h2>Dersini ayır.</h2>
          </div>

          <BookingPanel authUser={authUser} />
        </section>

        <section className="trainer section" id="egitmen">
          <div className="trainer-grid">
            <img
              className="trainer-photo"
              src="/images/private-session.jpg"
              alt="Yeşil sweatshirt’lü eğitmen danışanına birebir Pilates seansında destek oluyor"
              loading="lazy"
            />

            <div className="trainer-copy">
              <p className="eyebrow">EĞİTMEN</p>
              <div className="trainer-number">
                <span>20</span>
                <small>yıllık tecrübe</small>
              </div>
              <p className="trainer-text">
                Türkiye Cimnastik Federasyonu sertifikası ile Mat & Reformer ve fonksiyonel antrenman alanında uzmanlaşmış bir yaklaşım.
              </p>
              <div className="badge-row">
                {trainerBadges.map((badge) => (
                  <span key={badge} className="badge">{badge}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="gallery section" id="galeri">
          <div className="section-heading compact">
            <p className="eyebrow">GALERİ</p>
            <h2>Stüdyo anları</h2>
          </div>

          <div className="gallery-grid">
            {galleryItems.map((item) => (
              <figure key={item.title} className="gallery-item">
                <img className="gallery-image" src={item.src} alt={item.alt} loading="lazy" />
                <figcaption>{item.title}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="pricing section" id="fiyatlar">
          <div className="section-heading compact">
            <p className="eyebrow">FİYATLAR</p>
            <h2>Seçim ve yatırım</h2>
          </div>

          <div className="pricing-grid">
            {pricing.map((item) => (
              <article key={item.type} className={item.accent ? 'price-card featured' : 'price-card'}>
                <p className="price-type">{item.type}</p>
                <div className="price-value">{item.price}</div>
                <p className="price-text">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta section">
          <div className="final-cta-box">
            <div>
              <p className="eyebrow dark">BİR SONRAKİ ADIM</p>
              <h2>Bir sonraki adım, sana ait.</h2>
              <p>
                Alsancak, İzmir’de program, saat ve kayıt bilgileri için stüdyoya Instagram’dan yaz.
              </p>
            </div>
            <a className="cta cta-primary dark" href="#iletisim">
              Rezervasyon Yap
            </a>
          </div>
        </section>
        </>)}
          </>} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="footer-branding">
          <span className="footer-name">Alsancak Pilates Studio</span>
          <span className="footer-address">Dr. Mustafa Enver Bey Cad. Kültür Apt. No:30/7 Alsancak, İzmir</span>
        </div>

        <div className="footer-meta">
          <a href="tel:+905302071908">Telefon: 0530 207 19 08</a>
          <a href={mapsUrl} target="_blank" rel="noreferrer">Google Maps’te görüntüle</a>
          <a href={instagramUrl} target="_blank" rel="noreferrer">Instagram: @alsancak_pilates</a>
          <a className="admin-entry" href="/admin">Admin Girişi</a>
        </div>
      </footer>

      <a className="floating-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp ile deneme seansı hakkında bilgi alın">
        <span aria-hidden="true">WA</span>
        <span>WhatsApp</span>
      </a>
    </div>
  )
}

export default PilatesApp