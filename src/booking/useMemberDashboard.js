import { useCallback, useEffect, useState } from 'react'
import { fetchMemberDashboard, MEMBER_CHANGED, retainReservationFeed } from './dashboardApi.js'

export function useMemberDashboard(user) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('idle')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    if (!user) {
      setData(null)
      setStatus('idle')
      return undefined
    }

    let active = true
    setStatus((current) => (current === 'ready' ? current : 'loading'))

    fetchMemberDashboard({ fresh: true })
      .then((next) => {
        if (!active) return
        setData(next)
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setStatus('error')
      })

    function onChange() {
      fetchMemberDashboard({ fresh: true })
        .then((next) => {
          if (!active) return
          setData(next)
          setStatus('ready')
        })
        .catch(() => {
          if (!active) return
          setStatus('error')
        })
    }

    window.addEventListener(MEMBER_CHANGED, onChange)
    const release = retainReservationFeed()

    return () => {
      active = false
      window.removeEventListener(MEMBER_CHANGED, onChange)
      release()
    }
  }, [user?.id, tick])

  return { data, status, reload }
}
