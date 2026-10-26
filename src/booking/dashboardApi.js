import { supabase } from './supabaseClient.js'

export const MEMBER_CHANGED = 'alsancak-member-changed'

let cached = null
let inflight = null

export function notifyMemberChanged() {
  cached = null
  inflight = null
  window.dispatchEvent(new Event(MEMBER_CHANGED))
}

export async function fetchMemberDashboard({ fresh = false } = {}) {
  if (!fresh && cached) return cached
  if (!fresh && inflight) return inflight

  const request = supabase.rpc('member_dashboard').then(({ data, error }) => {
    if (error) throw error
    cached = data
    return data
  })

  inflight = request.finally(() => {
    if (inflight === request) inflight = null
  })

  if (fresh) cached = null
  return inflight
}

export async function fetchMemberHistory(before, limit = 50) {
  const { data, error } = await supabase.rpc('member_history', {
    p_before: before,
    p_limit: limit,
  })
  if (error) throw error
  return data ?? []
}

export async function updateMemberProfile({ firstName, lastName, phone }) {
  const { data, error } = await supabase.rpc('update_member_profile', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
  })
  if (error) throw error
  cached = data
  return data
}

export async function requestAccountDeletion() {
  const { data, error } = await supabase.rpc('request_account_deletion')
  if (error) throw error
  return data
}

export async function fetchMemberExport() {
  const { data, error } = await supabase.rpc('member_data_export')
  if (error) throw error
  return data
}

let feedChannel = null
let feedRefs = 0

export function retainReservationFeed() {
  feedRefs += 1
  if (!feedChannel) {
    feedChannel = supabase.channel('member-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        notifyMemberChanged()
      })
      .subscribe()
  }

  return () => {
    feedRefs -= 1
    if (feedRefs <= 0 && feedChannel) {
      supabase.removeChannel(feedChannel)
      feedChannel = null
      feedRefs = 0
    }
  }
}
