import { useEffect, useId, useRef, useState } from 'react'
import {
  adminLogin,
  adminMessage,
  assignPackage,
  fetchAdminClients,
  fetchAdminMemberDashboard,
  fetchDeletionRequests,
  fetchBookingInquiries,
  fetchLessonHistory,
  fetchLinkRequests,
  decideLinkRequest,
  searchSiteAccounts,
  setMemberLessonArea,
  updateMemberProfile,
  linkMemberAccount,
  markAttendance,
  fetchAdminTeachers,
  activateMemberPackage,
  extendMemberPackage,
  setPackageStart,
  setRemainingLessons,
  recordCashPayment,
  fetchCashReceipts,
  addExistingClient,
} from './adminApi.js'
import { addIsoDays, formatStudioDate, todayIso } from '../booking/slotRules.js'
import PerformancePool from './PerformancePool.jsx'
import TeachersPanel from './TeachersPanel.jsx'
import ShiftsPanel from './ShiftsPanel.jsx'
import TextsPanel from './TextsPanel.jsx'
import LedgerRest from './LedgerRest.jsx'
import './ledger-filters.css'

const PACKAGE_OPTIONS = [
  { kind: 'pack_8', label: "8'li Pilates Paketi", sessionType: 'group' },
  { kind: 'pack_12', label: "12'li Pilates Paketi", sessionType: 'group' },
  { kind: 'private_pack', label: 'Özel Ders Paketi (Private)', sessionType: 'private' },
]

function splitName(fullName) {
  const text = String(fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return { firstName: '—', lastName: '—' }
  const parts = text.split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}
