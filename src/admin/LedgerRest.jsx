import { Fragment, useState } from 'react'
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

function foldText(value) {
  return String(value ?? '').toLocaleLowerCase('tr-TR')
}

function matchesClient(client, needle) {
  if (!needle) return true
  return foldText(client.full_name).includes(needle) || String(client.phone || '').includes(needle)
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
  cashSession,
  setCashMemberId,
  setCashTeacherId,
  setCashAmount,
  setCashLessons,
  setCashDate,
  setCashNote,
  setCashSession,
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
  existingFirst,
  existingLast,
  existingPhone,
  existingTeacherId,
  existingCount,
  existingStartsOn,
  existingAmount,
  existingPaidOn,
  existingNote,
  existingExpiryLabel,
  setExistingFirst,
  setExistingLast,
  setExistingPhone,
  setExistingTeacherId,
  setExistingCount,
  setExistingStartsOn,
  setExistingAmount,
  setExistingPaidOn,
  setExistingNote,
  submitExisting,
  ledgerView = 'aktif',
}) {
  const [cashQuery, setCashQuery] = useState('')
  const [cashPicked, setCashPicked] = useState(false)
  const needle = cashQuery.trim().toLocaleLowerCase('tr-TR')
  const selected = clients.find((client) => client.id === cashMemberId) || null
  const searchHits = needle.length < 2 || cashPicked
    ? []
    : clients.filter((client) => matchesClient(client, needle)).slice(0, 8)
  const cashStudents = clients
    .filter((client) => client.has_cash)
    .filter((client) => cashPicked || matchesClient(client, needle))

  function pickClient(client) {
    setCashMemberId(client.id)
    setCashQuery(client.full_name || '')
    setCashPicked(true)
  }

  return (
    <Fragment>
      {ledgerView === 'nakit' && (
      <section className="admin-block">
        <h2>Nakit olarak kaydet</h2>
        <p className="sheet-copy">
          Sistemde isim ara. Kaydı olan öğrenciye yeni nakit tahsilat eklenir. Eski kayıt ve ders bilgisi durur.
        </p>
        <label className="cash-search">
          Öğrenci ara
          <input
            value={cashQuery}
            onChange={(event) => {
              setCashQuery(event.target.value)
              setCashPicked(false)
              if (!event.target.value.trim()) setCashMemberId('')
            }}
            placeholder="Ad, soyad veya telefon"
            autoComplete="off"
          />
        </label>
        {searchHits.length > 0 && (
          <div className="cash-results" role="listbox" aria-label="Eşleşen öğrenciler">
            {searchHits.map((client) => (
              <button key={client.id} type="button" className="cash-result" onClick={() => pickClient(client)}>
                <span>
                  {client.full_name || '—'}
                  <span className="admin-sub">{client.phone || 'numarasız'} · {client.has_cash ? 'nakit kaydı var' : 'nakit kaydı yok'}</span>
                </span>
                <span>Kayıt ekle</span>
              </button>
            ))}
          </div>
        )}
        {needle.length >= 2 && !cashPicked && searchHits.length === 0 && (
          <p className="sheet-copy">Bu isim sistemde yok.</p>
        )}
        {selected && (
          <p className="cash-picked">
            Seçilen: {selected.full_name} · {selected.phone || 'numarasız'}
            {selected.has_cash ? ' · mevcut nakit kaydına eklenir' : ' · ilk nakit kaydı açılır'}
          </p>
        )}
        <form className="admin-desk admin-desk--cash" onSubmit={submitCash}>
          <label>
            Öğretmen
            <select value={cashTeacherId} onChange={(event) => setCashTeacherId(event.target.value)} required>
              <option value="">Seç</option>
              {teachers.filter((person) => person.active).map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Ders
            <select value={cashSession} onChange={(event) => setCashSession(event.target.value)} required>
              <option value="group">Grup dersi</option>
              <option value="private">Özel ders</option>
            </select>
          </label>
          <label>
            Tutar (TL)
            <input type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} required />
          </label>
          <label>
            Eklenen ders
            <input type="number" min={0} max={500} step={1} inputMode="numeric" value={cashLessons} onChange={(event) => setCashLessons(event.target.value)} required />
          </label>
          <label>
            Tarih
            <input type="date" value={cashDate} max={todayIso()} onChange={(event) => setCashDate(event.target.value)} required />
          </label>
          <label>
            Not
            <input value={cashNote} maxLength={400} onChange={(event) => setCashNote(event.target.value)} placeholder="İsteğe bağlı" />
          </label>
          <button type="submit" className="cta" disabled={busy || !cashMemberId || !teachers.some((person) => person.active)}>
            {busy ? 'Kaydediliyor' : 'Nakit olarak kaydet'}
          </button>
        </form>

        <h3>Nakit kaydı olan öğrenciler</h3>
        {cashStudents.length === 0 ? (
          <p className="sheet-copy">Nakit kaydı olan öğrenci yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Telefon</th>
                  <th>Kayıt</th>
                </tr>
              </thead>
              <tbody>
                {cashStudents.map((client) => (
                    <tr key={client.id}>
                      <td>{client.full_name || '—'}</td>
                      <td>{client.phone || '—'}</td>
                      <td>
                        <div className="attendance-actions">
                          <button type="button" onClick={() => pickClient(client)} disabled={busy}>Kayıt ekle</button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {ledgerView === 'pasif' && (
      <section className="admin-block">
        <h2>Eski müşteri</h2>
        <p className="sheet-copy">
          Listede olmayan danışanı buradan ekle. Telefon boş kalabilir. Kalan ders, seçilen başlangıç gününden itibaren 30 gün geçerlidir. Tutar boş bırakılırsa ödeme kaydı açılmaz. Tutar yazılırsa nakit olarak kayda geçer ve ders hakkını ayrıca artırmaz.
        </p>
        <form className="admin-desk admin-desk--existing" onSubmit={submitExisting}>
          <label>
            Ad
            <input value={existingFirst} onChange={(event) => setExistingFirst(event.target.value)} maxLength={40} required />
          </label>
          <label>
            Soyad
            <input value={existingLast} onChange={(event) => setExistingLast(event.target.value)} maxLength={40} required />
          </label>
          <label>
            Telefon
            <input value={existingPhone} onChange={(event) => setExistingPhone(event.target.value)} inputMode="tel" placeholder="Boş kalabilir" />
          </label>
          <label>
            Öğretmen
            <select value={existingTeacherId} onChange={(event) => setExistingTeacherId(event.target.value)} required={Number(existingCount) > 0 || String(existingAmount).trim() !== ''}>
              <option value="">Seç</option>
              {teachers.filter((person) => person.active).map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Kalan ders
            <input type="number" min={0} max={500} step={1} inputMode="numeric" value={existingCount} onChange={(event) => setExistingCount(event.target.value)} required />
          </label>
          <label>
            Başlangıç
            <input type="date" value={existingStartsOn} onChange={(event) => setExistingStartsOn(event.target.value)} required={Number(existingCount) > 0} />
          </label>
          <label>
            Ödenen tutar (TL)
            <input type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={existingAmount} onChange={(event) => setExistingAmount(event.target.value)} placeholder="Boş kalabilir" />
          </label>
          <label>
            Tahsilat tarihi
            <input type="date" value={existingPaidOn} max={todayIso()} onChange={(event) => setExistingPaidOn(event.target.value)} required={String(existingAmount).trim() !== ''} />
          </label>
          <label>
            Not
            <input value={existingNote} maxLength={400} onChange={(event) => setExistingNote(event.target.value)} placeholder="İsteğe bağlı" />
          </label>
          <div className="admin-existing-foot">
            <button type="submit" className="cta" disabled={busy}>
              {busy ? 'Kaydediliyor' : 'Eski müşteriyi kaydet'}
            </button>
            {existingExpiryLabel ? <p className="admin-expiry">{existingExpiryLabel}</p> : null}
          </div>
        </form>
      </section>
      )}

      {ledgerView !== 'nakit' && (
      <Fragment>
      <section className="admin-block">
        <h2>Kasa</h2>
        <p className="sheet-copy">
          Kalan ders, danışanın toplam hakkını bu sayıya getirir. Başlangıçtan 30 gün sonra kullanım biter. Öğretmen seçilir. Mevcut kayıt silinmez.
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
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              inputMode="numeric"
              value={balanceCount}
              onChange={(event) => setBalanceCount(event.target.value)}
              required
            />
          </label>
          <label>
            Başlangıç
            <input
              type="date"
              value={balanceStartsOn}
              onChange={(event) => setBalanceStartsOn(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="cta" disabled={busy || clients.length === 0 || !teachers.some((person) => person.active)}>
            {busy ? 'Kaydediliyor' : 'Kalan dersi kaydet'}
          </button>
          {balanceExpiryLabel ? <p className="admin-expiry">{balanceExpiryLabel}</p> : null}
        </form>
      </section>

      <section className="admin-block">
        <h2>Silme talepleri</h2>
        <p className="sheet-copy">Bekleyen talepler listelenir. Üye kaydı buradan silinmez.</p>
        {deletions.length === 0 ? (
          <p className="sheet-copy">Bekleyen silme talebi yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>E-posta</th>
                  <th>Telefon</th>
                  <th>Zaman</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {deletions.map((request) => (
                  <tr key={request.id}>
                    <td>{request.full_name || '—'}</td>
                    <td>{request.email || '—'}</td>
                    <td>{request.phone || '—'}</td>
                    <td>{formatStudioWhen(request.created_at)}</td>
                    <td>{request.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-block">
        <h2>Gün ve telefon kayıtları</h2>
        <p className="sheet-copy">Rezervasyon ekranında seçilen gün ve yazılan telefon burada durur.</p>
        {inquiries.length === 0 ? (
          <p className="sheet-copy">Kayıt yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Seçilen gün</th>
                  <th>Telefon</th>
                  <th>Kayıt</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((item) => (
                  <tr key={item.id}>
                    <td>{formatStudioWhen(item.created_at)}</td>
                    <td>{item.selected_on ? formatStudioDate(item.selected_on) : '—'}</td>
                    <td>
                      {item.phone_raw || '—'}
                      {item.phone_normalized && item.phone_normalized !== item.phone_raw && (
                        <small className="admin-sub">{item.phone_normalized}</small>
                      )}
                    </td>
                    <td>{INQUIRY_LABEL[item.source] || 'Kayıt'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-block">
        <h2>Telefon bağlama</h2>
        <p className="sheet-copy">Onay, boş üyeliği isteyen hesaba bağlar ve e-postayı yazar. Reddetmek üyeyi değiştirmez.</p>
        {linkRequests.length === 0 ? (
          <p className="sheet-copy">Bekleyen istek yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Danışan</th>
                  <th>Telefon</th>
                  <th>İsteyen e-posta</th>
                  <th>Zaman</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {linkRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.full_name || '—'}</td>
                    <td>{request.phone || '—'}</td>
                    <td>{request.email || '—'}</td>
                    <td>{formatStudioWhen(request.created_at)}</td>
                    <td>
                      <div className="attendance-actions">
                        <button type="button" onClick={() => decideLink(request, 'approved')} disabled={busy}>Onayla</button>
                        <button type="button" className="danger" onClick={() => decideLink(request, 'rejected')} disabled={busy}>Reddet</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-block">
        <h2>Paket tanımla</h2>
        <p className="sheet-copy">Özel ders kredisi yalnızca en fazla 2 kişilik özel ders slotlarında kullanılır. 8'li ve 12'li paketler grup derslerine yazılır.</p>
        <form className={kind === 'private_pack' ? 'admin-assign has-credits' : 'admin-assign'} onSubmit={submitPackage}>
          <label>
            Danışan
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
              <option value="">Seç</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.full_name} · {client.phone || 'numarasız'}</option>
              ))}
            </select>
          </label>
          <label>
            Paket
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {PACKAGE_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>{option.label}</option>
              ))}
            </select>
          </label>
          {kind === 'private_pack' && (
            <label>
              Kredi
              <input type="number" min={1} max={60} step={1} inputMode="numeric" value={credits} onChange={(event) => setCredits(event.target.value)} required />
            </label>
          )}
          <label>
            Başlangıç
            <input type="date" value={startsOn} min={todayIso()} onChange={(event) => setStartsOn(event.target.value)} required />
          </label>
          <button type="submit" className="cta" disabled={busy || clients.length === 0}>{busy ? 'Kaydediliyor' : 'Paketi tanımla'}</button>
        </form>
      </section>

      <section className="admin-block">
        <h2>Ders geçmişi</h2>
        <p className="sheet-copy">Derse 24 saatten az kala Gelmedi işaretlenince kredi düşülür. Daha erken iptal krediyi iade eder.</p>
        <label className="admin-filter">
          Öğretmen
          <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
            <option value="">Tümü</option>
            {teachers.map((person) => (
              <option key={person.id} value={person.id}>{person.full_name}</option>
            ))}
          </select>
        </label>
        {lessons.length === 0 ? (
          <p className="sheet-copy">Ders kaydı yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Danışan</th>
                  <th>Öğretmen</th>
                  <th>Ders</th>
                  <th>Katılım</th>
                  <th>Kredi</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {lessons.filter((lesson) => !teacherFilter || lesson.teacher_id === teacherFilter).map((lesson) => (
                  <tr key={lesson.id}>
                    <td>
                      {lesson.full_name}
                      <small className="admin-sub">{lesson.phone || '—'}</small>
                    </td>
                    <td>{lesson.teacher_name || '—'}</td>
                    <td>
                      {formatStudioWhen(lesson.starts_at)}
                      <small className="admin-sub">{SESSION_LABEL[lesson.session_type] || 'Ders'}</small>
                    </td>
                    <td><span className={`attendance attendance-${lesson.status}`}>{lesson.attendance}</span></td>
                    <td>{lesson.credit_state}</td>
                    <td>
                      {(lesson.can_attend || lesson.can_no_show || lesson.can_cancel) && (
                        <div className="attendance-actions">
                          {lesson.can_attend && (
                            <button type="button" onClick={() => updateAttendance(lesson, 'attended')} disabled={busy}>Geldi</button>
                          )}
                          {lesson.can_no_show && (
                            <button type="button" className="danger" onClick={() => updateAttendance(lesson, 'no_show')} disabled={busy}>Gelmedi</button>
                          )}
                          {lesson.can_cancel && (
                            <button type="button" onClick={() => updateAttendance(lesson, 'cancelled')} disabled={busy}>İptal</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </Fragment>
      )}
    </Fragment>
  )
}
