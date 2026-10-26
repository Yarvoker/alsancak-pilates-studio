import { useMemberDashboard } from './useMemberDashboard.js'

function MemberSummary({ user }) {
  const { data, status, reload } = useMemberDashboard(user)
  if (!user) return null

  if (status === 'error' && !data) {
    return (
      <p className="member-summary">
        Bilgiler yüklenemedi, tekrar dene
        {' '}
        <button type="button" className="text-button" onClick={reload}>Tekrar dene</button>
      </p>
    )
  }

  if (!data) {
    return <p className="member-summary member-summary--loading" aria-busy="true">Yükleniyor</p>
  }

  const name = String(data.profile?.first_name || '').trim()
  const left = data.package?.credits_remaining ?? 0
  const hello = name ? `Merhaba ${name}` : 'Merhaba'

  return (
    <p className="member-summary">
      {hello}, {left} dersin kaldı
      {' · '}
      <a href="/hesabim">Hesabım</a>
    </p>
  )
}

export default MemberSummary
