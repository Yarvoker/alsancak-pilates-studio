import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import PrivacyPage from './PrivacyPage.jsx'
import LegalPage from './LegalPage.jsx'
import Seo from './Seo.jsx'
import { HERO_TEXT, HOME_DESCRIPTION, HOME_H1, HOME_TITLE } from './siteSeo.js'
import PackageTerms from './booking/PackageTerms.jsx'
import BookingPanel from './booking/BookingPanel.jsx'
import EmailOtpCard from './booking/EmailOtpCard.jsx'
import PaymentPanel from './booking/PaymentPanel.jsx'
import StudioGallery from './StudioGallery.jsx'
import { useMemberDashboard } from './booking/useMemberDashboard.js'
import './PilatesApp.css'
import './admin/hours-panel.css'
import StudioPage, { FaqBlock } from './StudioPage.jsx'
import { HOURS_TEXT, TRAINERS } from './studioCopy.js'

const AdminGate = lazy(() => import('./admin/AdminGate.jsx'))
const AccountPage = lazy(() => import('./account/AccountPage.jsx'))

const instagramUrl = 'https://www.instagram.com/alsancak_pilates/'
const whatsappUrl = 'https://wa.me/905302071908?text=Merhaba,%20deneme%20seans%C4%B1%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum'
const mapsDirectionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=38.4348526,27.1427269'
const mapsEmbedUrl = 'https://www.google.com/maps?q=38.4348526,27.1427269&z=16&output=embed'

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.89c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.64-.61-2.88-1.25-4.76-4.15-4.9-4.34-.14-.2-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41.13 0 .24 0 .35.01.31.01.47.03.67.52.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.2-.14.31-.28.48-.14.17-.29.37-.41.5-.14.14-.28.28-.12.55.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.28.14.44.12.6-.07.16-.19.7-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.6.75 1.87.89.28.14.46.2.53.32.07.12.07.68-.17 1.36z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm8 2H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3zm-4 3.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2zm0 1.6A2.2 2.2 0 1 0 14.2 12 2.2 2.2 0 0 0 12 9.8zM17.35 6.7a1.05 1.05 0 1 1-1.05 1.05 1.05 1.05 0 0 1 1.05-1.05z" />
    </svg>
  )
}

function MapsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.2A6.8 6.8 0 0 0 5.2 9c0 5.05 5.46 11.22 6.28 12.14a.72.72 0 0 0 1.04 0C13.34 20.22 18.8 14.05 18.8 9A6.8 6.8 0 0 0 12 2.2zm0 9.3A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z" />
    </svg>
  )
}

const navItems = [
  ['Dersler', 'dersler'],
  ['Eğitmenler', 'egitmen'],
  ['Galeri', 'galeri'],
  ['Fiyatlar', 'fiyatlar'],
]
