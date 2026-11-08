import { formatStudioDate, formatStudioWhen, todayIso } from '../booking/slotRules.js'

const PACKAGE_OPTIONS = [
  { kind: 'pack_8', label: "8'li Pilates Paketi", sessionType: 'group' },
  { kind: 'pack_12', label: "12'li Pilates Paketi", sessionType: 'group' },
  { kind: 'private_pack', label: 'Özel Ders Paketi (Private)', sessionType: 'private' },
]

const SESSION_LABEL = {
  private: 'Özel',
  group: 'Grup',
}

const INQUIRY_LABEL = {
  day: 'Gün seçimi',
  phone: 'Telefon kutusu',
}

function moneyLabel(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} TL`
}

export default function LedgerRest({
  busy,
  clients,
  teachers,
  receipts,
  deletions,
  inquiries,
  linkRequests,
  lessons,
  balanceMemberId,
  balanceTeacherId,
  balanceCount,
  balanceStartsOn,
  balanceExpiryLabel,
  setBalanceCount,
  setBalanceStartsOn,
  setBalanceTeacherId,
  chooseBalanceMember,
  submitBalance,
  cashMemberId,
  cashTeacherId,
  cashAmount,
  cashLessons,
  cashDate,
  cashNote,
  setCashMemberId,
  setCashTeacherId,
  setCashAmount,
  setCashLessons,
  setCashDate,
  setCashNote,
  submitCash,
  decideLink,
  updateAttendance,
  memberId,
  setMemberId,
  kind,
  setKind,
  credits,
  setCredits,
  startsOn,
  setStartsOn,
  submitPackage,
  teacherFilter,
  setTeacherFilter,
}) {
  return (
    <>
      <section className="admin-block">
        <h2>Kasa</h2>
        <p className="sheet-copy">
          Kalan ders, danışanın toplam hakkını bu sayıya getirir. Başlangıçtan 30 gün sonra kullanım biter. Nakit tahsilatta tutar kayda geçer; ders adedi yazılırsa o kadar hak eklenir. İki kayıtta da öğretmen seçilir.
        </p>
        <h3>Kalan ders</h3>
        <form className="admin-desk admin-desk--balance" onSubmit={submitBalance}>
          <label>
            Danışan
            <select value={balanceMemberId} onChange={(event) => chooseBalanceMember(event.target.value)} required>
              <option value="">Seç</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name} · {client.credits_remaining} ders
                </option>
              ))}
            </select>
          </label>
          <label>
            Öğretmen
            <select value={balanceTeacherId} onChange={(event) => setBalanceTeacherId(event.target.value)} required>
              <option value="">Seç</option>
              {teachers.filter((person) => person.active).map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Kalan ders
            <input type="number" min={0} max={500} step={1} inputMode="numeric" value={balanceCount} onChange={(event) => setBalanceCount(event.target.value)} required />
          </label>
          <label>
            Başlangıç
            <input type="date" value={balanceStartsOn} onChange={(event) => setBalanceStartsOn(event.target.value)} required />
          </label>
          <button type="submit" className="cta" disabled={busy || clients.length === 0 || !teachers.some((person) => person.active)}>
            {busy ? 'Kaydediliyor' : 'Kalan dersi kaydet'}
          </button>
          {balanceExpiryLabel ? <p className="admin-expiry">{balanceExpiryLabel}</p> : null}
        </form>
      </section>
    </>
  )
}
