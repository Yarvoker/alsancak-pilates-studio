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
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.89c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.64-.61-2.88-1.25-4.76-4.15-4.9-4.34-.14-.2-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41.13 0 .24 0 .35.01.31.01.47.03.67.52.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.2-.14.31-.28.48-.14.17-.29.37-.41.5-.14.14-.28.28-.12.55.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.28.14.44.12.6-.07.16-.19.7-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.6.75 1.87.89.28.14.46.2.53.32.07.12.07.68-.17 1.36z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm8 2H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3zm-4 3.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2zm0 1.6A2.2 2.2 0 1 0 14.2 12 2.2 2.2 0 0 0 12 9.8zM17.35 6.7a1.05 1.05 0 1 1-1.05 1.05 1.05 1.05 0 0 1 1.05-1.05z" />
    </svg>
  )
}

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
  'Reformer Pilates',
  'Fonksiyonel Pilates',
]

const disciplines = [
  {
    id: 'mat-reformer',
    title: 'Reformer Pilates',
    description: 'Kuvvet, denge ve nefes kontrolünü bir araya getiren kontrollü Pilates seansları.',
    badge: 'Max 6',
    image: '/images/group-reformer.jpg',
    imageAlt: 'Alsancak Pilates Studio’da grup Reformer dersi',
  },
  {
    id: 'functional-crossfit',
    title: 'Fonksiyonel Pilates',
    description: 'Günlük hareketleri güçlendiren, enerji yükselten ve dayanıklılığı artıran akış.',
    badge: 'Max 8',
  },
]

const galleryItems = [
  { title: 'Stüdyo', src: '/images/Stüdyo.jpg', alt: 'Alsancak Pilates Studio’nun stüdyo alanı' },
  { title: 'Reformer', src: '/images/group-reformer.jpg', alt: 'Reformer ekipmanlarında grup Pilates dersi' },
  { title: 'Cadillac', src: '/images/cadillac-tower.jpg', alt: 'Cadillac Tower ekipmanında Pilates çalışması' },
  { title: 'Mat', src: '/images/private-session.jpg', alt: 'Eğitmen eşliğinde birebir Pilates seansı' },
]

const tlFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function formatTl(amount) {
  return `${tlFormat.format(amount)} TL`
}

function perLessonLine(item) {
  const each = Math.round(item.amount / item.lessons)
  const prefix = item.approximate ? 'Ders başı yaklaşık' : 'Ders başı'
  return `${prefix} ${formatTl(each)}`
}

const pricing = [
  {
    id: 'trial',
    label: 'DENEME DERSİ',
    title: 'Deneme dersi için kayıt olun',
    description: 'Tanışma, duruş ve hareket analiziyle size uygun programı birlikte belirleyelim.',
    action: 'Deneme dersi ayır',
  },
  {
    id: 'pack-8',
    label: '8 DERSLİK PAKET',
    amount: 8000,
    lessons: 8,
    description: 'Haftada 2 derse uygun, düzenli ilerleme için ideal başlangıç paketi.',
  },
  {
    id: 'pack-12',
    label: '12 DERSLİK PAKET',
    amount: 11500,
    lessons: 12,
    approximate: true,
    badge: 'En avantajlı',
    featured: true,
    description: 'Daha sık çalışmak ve hızlı sonuç almak isteyenler için.',
  },
  {
    id: 'private',
    label: 'ÖZEL DERS',
    title: 'Fiyat için bize ulaşın',
    description: 'Size özel planlanan birebir seanslarla kişisel hedeflerinize odaklanın.',
  },
]

const trainerBadges = ['Türkiye Cimnastik Federasyonu', 'Mat & Reformer', 'Fonksiyonel Antrenman']

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
          <a className="admin-entry admin-entry--nav" href="/admin">Admin Girişi</a>
          {accountChip('account-chip account-chip--nav')}
        </nav>

        <div className="header-actions">
          <a className="admin-entry admin-entry--bar" href="/admin">Admin Girişi</a>
          {accountChip('account-chip account-chip--bar')}
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
              Alsancak, İzmir’de Mat ve Reformer Pilates, Fonksiyonel antrenman ve Crossfit.
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
              <article key={item.id} className={item.featured ? 'price-card featured' : 'price-card'}>
                <div className="price-kicker">
                  <p className="price-type">{item.label}</p>
                  {item.badge ? <span className="price-badge">{item.badge}</span> : null}
                </div>
                <div className="price-value">{item.amount ? formatTl(item.amount) : item.title}</div>
                {item.lessons ? <p className="price-unit">{perLessonLine(item)}</p> : null}
                <p className="price-text">{item.description}</p>
                {item.action ? (
                  authUser && dashboard?.profile_complete === true ? (
                    <button
                      type="button"
                      className="cta cta-primary price-action"
                      onClick={() => document.querySelector('section.booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      {item.action}
                    </button>
                  ) : (
                    <a className="cta cta-primary price-action" href="/hesabim?next=book">
                      {item.action}
                    </a>
                  )
                ) : null}
              </article>
            ))}
          </div>
          <p className="pricing-note">
            Paket dersleri satın alma tarihinden itibaren belirlenen süre içinde kullanılır. Derse 24 saatten az kala yapılan iptallerde ders hakkı kullanılmış sayılır.
          </p>
        </section>
        </>)}
          </>} />
        </Routes>
      </main>

      <footer className="site-footer">
        <img className="footer-logo" src="/images/logo-yatay-krem.png" alt="Alsancak Pilates Studio" />
      </footer>

      <div className="contact-dock">
        <a className="contact-dock-link contact-dock-link--whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp ile yaz">
          <WhatsAppIcon />
        </a>
        <a className="contact-dock-link contact-dock-link--instagram" href={instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram’da aç">
          <InstagramIcon />
        </a>
      </div>
    </div>
  )
}

export default PilatesApp