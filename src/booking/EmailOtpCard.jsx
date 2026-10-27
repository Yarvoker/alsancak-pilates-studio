import { useEffect, useRef, useState } from 'react'
import { completeMemberProfile, contactAlreadyStored } from './dashboardApi.js'
import { messageOf } from './bookingApi.js'
import { maskTrMobile, normalizeTrMobile } from './phone.js'
import { validPersonName } from './sheetFlow.js'
import { supabase } from './supabaseClient.js'

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

const AUTH_URL_KEYS = [
  'code',
  'access_token',
  'refresh_token',
  'type',
  'error',
  'error_code',
  'error_description',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
]

const GOOGLE_AUTH_ERROR = 'Google ile giriş yapılamadı, e-posta koduyla devam edebilirsin.'
const PHONE_ERROR = 'Geçerli bir cep telefonu gir (05xx xxx xx xx)'

function hashParamsOf(hash) {
  const raw = String(hash || '').replace(/^#/, '')
  if (!raw || !raw.includes('=')) return new URLSearchParams()
  return new URLSearchParams(raw)
}

function urlCarriesAuth() {
  const search = new URLSearchParams(window.location.search)
  const hashParams = hashParamsOf(window.location.hash)
  return AUTH_URL_KEYS.some((key) => search.has(key) || hashParams.has(key))
}

function namesFromGoogle(user) {
  const meta = user?.user_metadata || {}
  let first = String(meta.given_name || '').trim()
  let last = String(meta.family_name || '').trim()
  if (!first || !last) {
    const full = String(meta.full_name || meta.name || '').trim()
    const parts = full.split(/\s+/).filter(Boolean)
    if (!first) first = parts.shift() || ''
    if (!last) last = parts.join(' ')
  }
  return { first, last }
}

function linkErrorCopy(errorCode, errorText) {
  const code = String(errorCode || '').toLowerCase()
  const text = String(errorText || '').toLowerCase()
  if (code === 'otp_expired' || text.includes('otp_expired')) {
    return 'Link süresi doldu, yeni kod iste'
  }
  if (code || text) return GOOGLE_AUTH_ERROR
  return ''
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function stripAuthFromUrl() {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const url = new URL(window.location.href)
  for (const key of AUTH_URL_KEYS) url.searchParams.delete(key)

  const raw = window.location.hash.replace(/^#/, '')
  let nextHash = ''
  if (raw && !raw.includes('=')) {
    nextHash = AUTH_URL_KEYS.includes(raw) ? '' : `#${raw}`
  } else if (raw) {
    const params = new URLSearchParams(raw)
    for (const key of AUTH_URL_KEYS) params.delete(key)
    const kept = params.toString()
    nextHash = kept ? `#${kept}` : ''
  }

  const search = url.searchParams.toString()
  const next = `${url.pathname}${search ? `?${search}` : ''}${nextHash}`
  if (next === current) return
  window.history.replaceState(window.history.state, '', next)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function retryAfterSeconds(error) {
  const sources = [
    error?.retryAfter,
    error?.retry_after,
    error?.headers?.['retry-after'],
    error?.headers?.get?.('retry-after'),
  ]
  for (const source of sources) {
    const parsed = Number.parseInt(String(source ?? ''), 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.error_description || ''}`
  const timed = blob.match(/(\d+)\s*(?:seconds?|secs?|saniye|sn)\b/i)
  if (timed) return Number(timed[1])
  return 60
}

function mapAuthError(error, phase) {
  const status = Number(error?.status || 0)
  const code = String(error?.code || error?.error_code || '').toLowerCase()
  const message = String(error?.message || '')
  const text = `${message} ${code}`.toLowerCase()
  const rateLimited = status === 429
    || code === 'over_email_send_rate_limit'
    || text.includes('over_email_send_rate_limit')
    || text.includes('email rate limit')
    || text.includes('rate limit')

  if (rateLimited) {
    return `Çok fazla deneme, ${retryAfterSeconds(error)} sn sonra tekrar dene`
  }
  if (phase === 'verify') return 'Kod hatalı veya süresi geçmiş.'
  if (text.includes('not authorized') || text.includes('email_address_not_authorized')) {
    return 'Bu e-posta adresine doğrulama gönderilemedi.'
  }
  if (phase === 'send') return 'Kod gönderilemedi. Lütfen tekrar dene.'
  return 'Doğrulama tamamlanamadı. Lütfen tekrar dene.'
}

function codeDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

let authUrlTask = null
let magicLinkScrolled = false

function readAuthLocation() {
  const search = new URLSearchParams(window.location.search)
  const hashParams = hashParamsOf(window.location.hash)
  const errorCode = search.get('error_code') || hashParams.get('error_code') || ''
  const errorText = [
    search.get('error'),
    hashParams.get('error'),
    search.get('error_description'),
    hashParams.get('error_description'),
  ].filter(Boolean).join(' ')
  const hadTokens = ['access_token', 'refresh_token'].some((key) => search.has(key) || hashParams.has(key))
  return {
    hadTokens,
    expiredLink: linkErrorCopy(errorCode, errorText),
  }
}

function settleAuthReturn() {
  if (!urlCarriesAuth()) {
    return supabase.auth.getSession().then(({ data }) => ({
      user: data.session?.user ?? null,
      expiredLink: '',
      hadTokens: false,
    })).catch(() => ({ user: null, expiredLink: '', hadTokens: false }))
  }

  if (!authUrlTask) {
    const snapshot = readAuthLocation()
    authUrlTask = supabase.auth.getSession().then(({ data }) => {
      stripAuthFromUrl()
      return {
        user: data.session?.user ?? null,
        expiredLink: snapshot.expiredLink,
        hadTokens: snapshot.hadTokens,
      }
    }).catch(() => {
      stripAuthFromUrl()
      return { user: null, expiredLink: snapshot.expiredLink, hadTokens: snapshot.hadTokens }
    })
  }

  return authUrlTask
}

function scrollToContactOnce() {
  if (magicLinkScrolled) return
  if (window.location.pathname !== '/') return
  const node = document.getElementById('iletisim')
  if (!node) return
  magicLinkScrolled = true
  node.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function EmailOtpCard({
  visible = true,
  scrollOnLink = false,
  showProfile = false,
  profile = null,
  authUser = null,
  onUser,
  onLinkError,
  onProfileDone,
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [authBusy, setAuthBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [kvkk, setKvkk] = useState(false)
  const [kvkkOpen, setKvkkOpen] = useState(false)
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [kvkkError, setKvkkError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const emailRef = useRef(null)
  const codeRef = useRef(null)
  const profileSeed = useRef(false)
  const onUserRef = useRef(onUser)
  const onLinkErrorRef = useRef(onLinkError)
  const onProfileDoneRef = useRef(onProfileDone)
  const scrollRef = useRef(scrollOnLink)
  onUserRef.current = onUser
  onLinkErrorRef.current = onLinkError
  onProfileDoneRef.current = onProfileDone
  scrollRef.current = scrollOnLink

  useEffect(() => {
    let active = true

    settleAuthReturn().then((result) => {
      if (!active) return
      if (result.expiredLink) {
        setError(result.expiredLink)
        onLinkErrorRef.current?.(result.expiredLink)
      }
      onUserRef.current?.(result.user)
      if (scrollRef.current && result.hadTokens && result.user) scrollToContactOnce()
    }).catch(() => {
      if (active && urlCarriesAuth()) stripAuthFromUrl()
    })

    function syncMember(event, session) {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        onUserRef.current?.(null)
        return
      }
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') return
      onUserRef.current?.(session?.user ?? null)
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(syncMember)

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  useEffect(() => {
    if (!showProfile) {
      profileSeed.current = false
      return undefined
    }
    if (profileSeed.current) return undefined
    const google = namesFromGoogle(authUser)
    setFirstName(String(profile?.first_name || google.first || '').trim())
    setLastName(String(profile?.last_name || google.last || '').trim())
    profileSeed.current = true
    return undefined
  }, [showProfile, profile?.first_name, profile?.last_name, authUser])

  useEffect(() => {
    if (!visible || showProfile || codeSent) return undefined
    emailRef.current?.focus()
    return undefined
  }, [visible, showProfile, codeSent])

  useEffect(() => {
    if (!visible || showProfile || !codeSent) return undefined
    codeRef.current?.focus()
    return undefined
  }, [visible, showProfile, codeSent])

  async function continueWithGoogle() {
    setAuthBusy(true)
    setError('')
    setNotice('')
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/hesabim`,
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true,
      },
    })
    if (oauthError || !data?.url) {
      setAuthBusy(false)
      setError(GOOGLE_AUTH_ERROR)
      return
    }

    try {
      const response = await fetch(data.url, { redirect: 'manual' })
      if (response.status >= 400) {
        setAuthBusy(false)
        setError(GOOGLE_AUTH_ERROR)
        return
      }
    } catch {
      setAuthBusy(false)
      setError(GOOGLE_AUTH_ERROR)
      return
    }

    window.location.assign(data.url)
  }

  async function sendCode() {
    const nextEmail = email.trim().toLowerCase()
    if (!validEmail(nextEmail)) {
      setError('E-posta geçersiz.')
      return
    }

    setAuthBusy(true)
    setError('')
    setNotice('')
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'https://alsancak-pilates-studio.vercel.app/hesabim',
      },
    })
    setAuthBusy(false)

    if (sendError) {
      setError(mapAuthError(sendError, 'send'))
      return
    }

    setEmail(nextEmail)
    setCodeSent(true)
    setCode('')
    setResendIn(60)
    setNotice('Giriş bağlantısı e-postana gönderildi. Bağlantıya tıkla.')
  }

  async function verifyCode() {
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) {
      setError('Kod hatalı veya süresi geçmiş.')
      return
    }

    setAuthBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    })
    setAuthBusy(false)

    if (verifyError) {
      setError(mapAuthError(verifyError, 'verify'))
      return
    }

    setCode('')
    setCodeSent(false)
    setResendIn(0)
    setNotice('')
  }

  function editEmail() {
    setCodeSent(false)
    setCode('')
    setResendIn(0)
    setError('')
    setNotice('')
  }

  async function submitProfile(event) {
    event.preventDefault()
    const stored = contactAlreadyStored(profile)
    const nextFirst = stored.namesStored ? stored.firstName : firstName.trim()
    const nextLast = stored.namesStored ? stored.lastName : lastName.trim()
    const nextPhone = stored.phoneStored ? '' : normalizeTrMobile(phone)
    const nextNameError = stored.namesStored || (validPersonName(nextFirst) && validPersonName(nextLast))
      ? ''
      : 'İsim ve soyisim gerekli'
    const nextPhoneError = stored.phoneStored || nextPhone ? '' : PHONE_ERROR
    const nextKvkkError = kvkk ? '' : 'KVKK onayı gerekli'
    setNameError(nextNameError)
    setPhoneError(nextPhoneError)
    setKvkkError(nextKvkkError)
    if (nextNameError || nextPhoneError || nextKvkkError) return

    setProfileBusy(true)
    try {
      const result = await completeMemberProfile({
        firstName: nextFirst,
        lastName: nextLast,
        phone: nextPhone,
        kvkk: true,
      })
      const status = result?.status
      if (status === 'pending_link') {
        setPhoneError('Bu numara kayıtlı, stüdyo onayından sonra hesabına bağlanacak')
        return
      }
      onProfileDoneRef.current?.(status)
    } catch (profileError) {
      const text = messageOf(profileError)
      if (text === 'Telefon numarası geçersiz') setPhoneError(PHONE_ERROR)
      else if (text === 'KVKK onayı gerekli') setKvkkError(text)
      else setNameError(text)
    } finally {
      setProfileBusy(false)
    }
  }

  if (!visible && !showProfile) return null

  if (showProfile) {
    const stored = contactAlreadyStored(profile)
    return (
      <section className="member-auth email-otp-card account-card" aria-label="Bilgilerini tamamla">
        <p className="eyebrow">KAYIT</p>
        <h1>{stored.complete ? 'KVKK onayı' : 'Bilgilerini tamamla'}</h1>
        <form onSubmit={submitProfile}>
          {!stored.namesStored && (
            <div className="account-fields">
              <label>
                Ad
                <input
                  name="given-name"
                  autoComplete="given-name"
                  maxLength={40}
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value)
                    setNameError('')
                  }}
                  required
                />
              </label>
              <label>
                Soyad
                <input
                  name="family-name"
                  autoComplete="family-name"
                  maxLength={40}
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value)
                    setNameError('')
                  }}
                  required
                />
              </label>
            </div>
          )}
          {nameError && <p className="field-error" role="alert">{nameError}</p>}
          <label>
            E-posta
            <input value={authUser?.email || profile?.email || ''} readOnly />
          </label>
          {!stored.phoneStored && (
            <label>
              Telefon
              <input
                type="tel"
                name="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="05xx xxx xx xx"
                value={phone}
                onChange={(event) => {
                  setPhone(maskTrMobile(event.target.value))
                  setPhoneError('')
                }}
                required
              />
            </label>
          )}
          {phoneError && <p className="field-error" role="alert">{phoneError}</p>}
          <label className="kvkk-check">
            <input
              type="checkbox"
              checked={kvkk}
              onChange={(event) => {
                setKvkk(event.target.checked)
                setKvkkError('')
              }}
            />
            <span>
              KVKK metnini okudum ve kabul ediyorum.{' '}
              <a
                href="#kvkk-aydinlatma"
                onClick={(event) => {
                  event.preventDefault()
                  setKvkkOpen(true)
                }}
              >
                Aydınlatma metni
              </a>
            </span>
          </label>
          {kvkkOpen && (
            <p id="kvkk-aydinlatma" className="booking-note">
              Ad, soyad, telefon ve e-posta adresin ders kaydı, hatırlatma ve stüdyo iletişimi için işlenir.
              Verilerini Hesabım’dan indirebilir veya silinmesini isteyebilirsin.
            </p>
          )}
          {kvkkError && <p className="field-error" role="alert">{kvkkError}</p>}
          <button type="submit" className="cta cta-form" disabled={profileBusy} aria-busy={profileBusy}>
            {profileBusy ? 'Kaydediliyor' : 'Kaydı tamamla'}
          </button>
        </form>
      </section>
    )
  }

  return (
    <section className="member-auth email-otp-card account-card" aria-label="Üye girişi">
      <p className="eyebrow">GİRİŞ</p>
      <h1>Giriş yap</h1>
      {!codeSent ? (
        <div className="field-row">
          <button
            type="button"
            className="google-auth"
            onClick={continueWithGoogle}
            disabled={authBusy}
            aria-busy={authBusy}
          >
            <GoogleMark />
            Google ile devam et
          </button>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="auth-or" role="separator">veya</div>
          <p className="booking-note">E-postana 6 haneli bir giriş kodu göndereceğiz.</p>
          <label>
            E-posta
            <input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="ornek@eposta.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
              }}
            />
          </label>
          <button
            type="button"
            className="cta cta-form"
            onClick={sendCode}
            disabled={authBusy}
            aria-busy={authBusy}
          >
            Kod gönder
          </button>
        </div>
      ) : (
        <div className="field-row">
          <p className="booking-note">E-postadaki giriş bağlantısına tıkla. 6 haneli kod da varsa onu yaz.</p>
          <p className="auth-email">{email}</p>
          <label>
            Doğrulama kodu
            <input
              ref={codeRef}
              name="email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6 haneli kod"
              value={code}
              onChange={(event) => {
                setCode(codeDigits(event.target.value))
                setError('')
              }}
              onPaste={(event) => {
                event.preventDefault()
                setCode(codeDigits(event.clipboardData?.getData('text') ?? ''))
                setError('')
              }}
            />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button
            type="button"
            className="cta cta-form"
            onClick={verifyCode}
            disabled={authBusy || code.length !== 6}
            aria-busy={authBusy}
          >
            {authBusy ? 'Doğrulanıyor' : 'Doğrula'}
          </button>
          <button
            type="button"
            className="cta ghost"
            onClick={sendCode}
            disabled={authBusy || resendIn > 0}
          >
            Tekrar gönder
          </button>
          {resendIn > 0 && <p className="booking-note">{resendIn} sn</p>}
          <button type="button" className="text-button" onClick={editEmail}>
            E-postayı değiştir
          </button>
          {notice && <p className="booking-note" role="status">{notice}</p>}
        </div>
      )}
    </section>
  )
}

export default EmailOtpCard
