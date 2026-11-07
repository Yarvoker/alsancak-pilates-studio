import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { readCheckout } from './sheetFlow.js'
import { formatStudioDate } from './slotRules.js'

const CLOSED_MESSAGE = 'Ödeme bağlantısı henüz açık değil.'

function hostedPaymentUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'iyzipay.com' && !url.hostname.endsWith('.iyzipay.com')) return null
    return url.toString()
  } catch {
    return null
  }
}

function PaymentPanel() {
  const [order] = useState(() => readCheckout())
  const [configured, setConfigured] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checkoutContent, setCheckoutContent] = useState('')

  useEffect(() => {
    let active = true

    async function probe() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) return

      const { data: dashboard } = await supabase.rpc('member_dashboard')
      if (!active) return
      setPendingId(dashboard?.pending_package?.id ?? null)

      const { data, error } = await supabase.functions.invoke('iyzico-checkout', {
        body: { mode: 'status' },
      })
      if (!active || error) return
      setConfigured(data?.configured === true && data?.code !== 'not_configured')
    }

    probe().catch(() => {
      if (active) setConfigured(false)
    })

    return () => {
      active = false
    }
  }, [])

  const checkoutOpen = configured && Boolean(pendingId)

  async function startCheckout() {
    if (!checkoutOpen || busy) return
    setBusy(true)
    setCheckoutContent('')
    try {
      const { data, error } = await supabase.functions.invoke('iyzico-checkout', {
        body: { mode: 'checkout', memberPackageId: pendingId },
      })
      if (error || data?.configured !== true || data?.code === 'not_configured') {
        setConfigured(false)
        return
      }
      const pageUrl = hostedPaymentUrl(data.paymentPageUrl)
      if (pageUrl) {
        window.location.assign(pageUrl)
        return
      }
      if (typeof data.checkoutFormContent === 'string' && data.checkoutFormContent.includes('iyziInit')) {
        setCheckoutContent(data.checkoutFormContent)
        return
      }
      setConfigured(false)
    } catch {
      setConfigured(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="payment section" id="odeme">
      <div className="section-heading">
        <p className="eyebrow">ÖDEME</p>
        <h2>Ödeme adımı.</h2>
      </div>

      {!order ? (
        <div className="payment-card">
          <p className="sheet-copy">Ödeme için önce paket, gün ve saat seç.</p>
          <a className="cta cta-primary payment-back" href="#rezervasyon">Rezervasyona dön</a>
        </div>
      ) : (
        <div className="payment-card">
          <p className="sheet-kicker">{order.title}</p>
          <h3>{formatStudioDate(order.startsOn)}</h3>
          <p className="payment-time">{order.time}</p>
          {order.instructorName ? (
            <p className="payment-time">{order.instructorName}</p>
          ) : (
            <p className="booking-error">Lütfen ders almak istediğiniz antrenörü seçiniz</p>
          )}
          <p className="sheet-copy">
            {order.sessionType === 'private' ? 'Özel ders, 2 kişi.' : 'Grup dersi, 14 kişi.'}
            {' '}
            Seçimin hazır. Ödeme iyzico ile alınacak.
          </p>

          <div className="iyzico-slot" aria-disabled={checkoutOpen ? 'false' : 'true'}>
            <p className="sheet-kicker">iyzico</p>
            {checkoutOpen ? (
              <p className="sheet-copy">Ödeme iyzico sayfasında tamamlanır.</p>
            ) : (
              <p className="sheet-copy">{CLOSED_MESSAGE}</p>
            )}
            <button
              type="button"
              className="cta"
              disabled={!checkoutOpen || busy}
              onClick={startCheckout}
            >
              iyzico ile öde
            </button>
            {checkoutContent ? (
              <div className="iyzico-form" dangerouslySetInnerHTML={{ __html: checkoutContent }} />
            ) : null}
          </div>

          <a className="text-button payment-back" href="#rezervasyon">Seçime dön</a>
        </div>
      )}
    </section>
  )
}

export default PaymentPanel
