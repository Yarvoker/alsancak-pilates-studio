import { useState } from 'react'
import { readCheckout } from './sheetFlow.js'
import { formatStudioDate } from './slotRules.js'

function PaymentPanel() {
  const [order] = useState(() => readCheckout())

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

          <div className="iyzico-slot" aria-disabled="true">
            <p className="sheet-kicker">iyzico</p>
            <p className="sheet-copy">Ödeme bağlantısı henüz açık değil.</p>
            <button type="button" className="cta" disabled>
              iyzico ile öde
            </button>
          </div>

          <a className="text-button payment-back" href="#rezervasyon">Seçime dön</a>
        </div>
      )}
    </section>
  )
}

export default PaymentPanel
