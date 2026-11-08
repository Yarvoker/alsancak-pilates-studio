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

        <h3>Nakit tahsilat</h3>
        <form className="admin-desk admin-desk--cash" onSubmit={submitCash}>
          <label>
            Danışan
            <select value={cashMemberId} onChange={(event) => setCashMemberId(event.target.value)} required>
              <option value="">Seç</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name} · {client.phone || 'numarasız'}
                </option>
              ))}
            </select>
          </label>
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
          <button type="submit" className="cta" disabled={busy || clients.length === 0 || !teachers.some((person) => person.active)}>
            {busy ? 'Kaydediliyor' : 'Nakit kaydı'}
          </button>
        </form>

        <h3>Son nakit kayıtları</h3>
        {receipts.length === 0 ? (
          <p className="sheet-copy">Nakit kaydı yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Danışan</th>
                  <th>Öğretmen</th>
                  <th>Tutar</th>
                  <th>Eklenen ders</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>{formatStudioDate(receipt.received_on)}</td>
                    <td>
                      {receipt.full_name || '—'}
                      <span className="admin-sub">{receipt.phone || '—'}</span>
                    </td>
                    <td>{receipt.teacher_name || '—'}</td>
                    <td>{moneyLabel(receipt.amount)}</td>
                    <td>{receipt.lesson_count}</td>
                    <td>{receipt.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </>
  )
}
