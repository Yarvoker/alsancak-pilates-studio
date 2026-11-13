import { PAGES } from './studioCopy.js'

export const SITE_ORIGIN = 'https://www.alsancakpilates.com'

export const HOME_H1 = 'Alsancak’ta Reformer Pilates'

export const HOME_TITLE = 'Alsancak Pilates Studio | Reformer Pilates, Alsancak İzmir'

export const HOME_DESCRIPTION = 'Alsancak, İzmir’de Reformer Pilates, fonksiyonel antrenman ve deneme dersi. Türkiye Cimnastik Federasyonu sertifikalı eğitmenler. Rezervasyon için hemen yazın.'

export const HERO_TEXT = 'Alsancak, İzmir’de Reformer Pilates ve fonksiyonel antrenman. Deneme dersiyle başlayabilirsin.'

export const PUBLIC_PAGES = [
  {
    path: '/',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    robots: 'index, follow',
  },
  ...PAGES.map((page) => ({
    path: page.path,
    title: page.title,
    description: page.description,
    robots: 'index, follow',
  })),
  {
    path: '/gizlilik',
    title: 'Aydınlatma Metni | Alsancak Pilates Studio',
    description: 'Ad, soyad, telefon ve e-posta adresin ders kaydı, hatırlatma ve stüdyo iletişimi için işlenir.',
    robots: 'index, follow',
  },
  {
    path: '/paket-kosullari',
    title: 'Paket Koşulları | Alsancak Pilates Studio',
    description: 'Alsancak Pilates Studio paket koşulları.',
    robots: 'index, follow',
  },
  {
    path: '/iptal-iade',
    title: 'İptal ve İade | Alsancak Pilates Studio',
    description: 'Alsancak Pilates Studio iptal ve iade koşulları.',
    robots: 'index, follow',
  },
  {
    path: '/mesafeli-satis',
    title: 'Mesafeli Satış Sözleşmesi | Alsancak Pilates Studio',
    description: 'Alsancak Pilates Studio mesafeli satış sözleşmesi.',
    robots: 'index, follow',
  },
  {
    path: '/cerez',
    title: 'Çerez Politikası | Alsancak Pilates Studio',
    description: 'Alsancak Pilates Studio çerez politikası.',
    robots: 'index, follow',
  },
]

export const PRIVATE_PAGES = [
  { path: '/admin', title: 'Yönetim | Alsancak Pilates Studio' },
  { path: '/hesabim', title: 'Hesabım · Alsancak Pilates Studio' },
]

export function pageByPath(path) {
  return PUBLIC_PAGES.find((page) => page.path === path)
}

export function canonicalUrl(path) {
  if (!path || path === '/') return `${SITE_ORIGIN}/`
  return `${SITE_ORIGIN}${path}`
}
