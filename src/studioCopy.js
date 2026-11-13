export const SITE = 'https://www.alsancakpilates.com'

export const ADDRESS =
  'Alsancak Mahallesi, Talatpaşa Bulvarı No:33/1, Kat:1 Daire:1, Harputlu Apt., Konak / İzmir'

export const PHONE_DISPLAY = '0530 207 19 08'

export const HOURS_TEXT = 'Pazartesi–Cumartesi 07:00–21:00, Pazar kapalı.'

export const TRAINERS = [
  {
    name: 'Önder Güzel',
    slug: 'onder-guzel',
    image: '/trainers/onder-guzel.jpg',
    src: '/trainers/onder-guzel.jpg',
    width: 989,
    height: 1200,
    objectPosition: 'center 18%',
  },
  {
    name: 'Emel Gamze Güzel',
    slug: 'emel-gamze-guzel',
    image: '/trainers/emel-gamze-guzel.webp',
    src: '/trainers/emel-gamze-guzel.webp',
    width: 720,
    height: 900,
    srcSet: '/trainers/emel-gamze-guzel-480.webp 480w, /trainers/emel-gamze-guzel.webp 720w',
    sizes: '(max-width: 720px) 46vw, 18vw',
    className: 'emel-portrait',
    objectPosition: 'center 32%',
  },
  {
    name: 'Devran Çiçek',
    slug: 'devran-cicek',
    image: '/trainers/devran-cicek.webp',
    src: '/trainers/devran-cicek.webp',
    width: 720,
    height: 698,
    srcSet: '/trainers/devran-cicek-480.webp 480w, /trainers/devran-cicek.webp 720w',
    sizes: '(max-width: 720px) 46vw, 18vw',
    className: 'devran-portrait',
    objectPosition: 'center 42%',
  },
  {
    name: 'Ecrin Aydınlı',
    slug: 'ecrin-aydinli',
    image: '/trainers/ecrin-aydinli.webp',
    src: '/trainers/ecrin-aydinli.webp',
    width: 720,
    height: 850,
    srcSet: '/trainers/ecrin-aydinli-480.webp 480w, /trainers/ecrin-aydinli.webp 720w',
    sizes: '(max-width: 720px) 46vw, 18vw',
    className: 'ecrin-portrait',
    objectPosition: 'center 28%',
  },
  {
    name: 'Cemal Ayhan',
    slug: 'cemal-ayhan',
    image: '/trainers/cemal-ayhan.jpg',
    src: '/trainers/cemal-ayhan.jpg',
    width: 1024,
    height: 1008,
    className: 'cemal-portrait',
    objectPosition: 'center 34%',
  },
]

export function trainerByName(fullName) {
  return TRAINERS.find((trainer) => trainer.name === fullName) || null
}

export function trainerInitials(fullName) {
  return String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase('tr')
}

const STUDIO_PHOTO = {
  image: '/images/group-reformer.jpg',
  imageWidth: 1170,
  imageHeight: 780,
}

const REFORMER_ALT = 'Alsancak Pilates Studio’da grup Reformer dersi'
const SALON_ALT = 'Alsancak Pilates Studio salonu, grup çalışması'

const NAV = [
  { href: '/reformer-pilates', label: 'Reformer Pilates' },
  { href: '/fonksiyonel-pilates', label: 'Fonksiyonel Pilates' },
  { href: '/ozel-ders', label: 'Özel ders' },
  { href: '/egitmenler', label: 'Eğitmenler' },
  { href: '/hakkimizda', label: 'Hakkımızda' },
  { href: '/#fiyatlar', label: 'Fiyatlar' },
  { href: '/#iletisim', label: 'Rezervasyon' },
]

function linksExcept(path) {
  return NAV.filter((link) => link.href !== path)
}

const trainerNames = TRAINERS.map((trainer) => trainer.name).join(', ')

export const HOME_FAQS = [
  {
    question: 'Deneme dersi var mı?',
    answer:
      'Evet. Deneme dersi vardır. Uygun grup saatini seçerek veya stüdyoya yazarak kayıt olabilirsin.',
  },
  {
    question: '8 ve 12 ders paketleri ne kadar, süresi ne?',
    answer:
      '8 ders 8.000 TL, 12 ders 11.500 TL. Paketler satın alındığı tarihten itibaren 45 gün geçerlidir. Kullanılmayan dersler süre sonunda yanar.',
  },
  {
    question: 'Ders iptali nasıl olur?',
    answer:
      'Derse 24 saatten fazla varken iptal edersen ders kredin iade edilir. Daha geç iptalde kredi düşebilir. Güncel metin İptal ve İade sayfasındadır.',
  },
  {
    question: 'Stüdyo nerede?',
    answer: `${ADDRESS}. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT}`,
  },
  {
    question: 'Reformer grubu kaç kişi?',
    answer: 'Reformer Pilates grubu en fazla 6 kişidir. Fonksiyonel Pilates grubu en fazla 8 kişidir.',
  },
  {
    question: 'Hangi eğitmenler var?',
    answer: `Stüdyo eğitmenleri: ${trainerNames}.`,
  },
]

export const PAGES = [
  {
    path: '/reformer-pilates',
    title: 'Reformer Pilates | Alsancak Pilates Studio',
    description:
      'Alsancak Pilates Studio’da reformer pilates en fazla 6 kişilik gruplarla yapılır. Deneme dersi ve 8 ile 12 derslik paketler. Talatpaşa Bulvarı, Konak.',
    h1: 'Alsancak’ta Reformer Pilates',
    serviceName: 'Reformer Pilates',
    ...STUDIO_PHOTO,
    imageAlt: REFORMER_ALT,
    paragraphs: [
      'Alsancak Pilates Studio, Talatpaşa Bulvarı’ndaki stüdyosunda reformer pilates dersi verir. Seans, kuvvet, denge ve nefes kontrolünü bir araya getiren kontrollü bir pilates çalışmasıdır.',
      'Reformer grubu en fazla 6 kişidir. Fonksiyonel pilates grubu ayrıdır ve en fazla 8 kişidir.',
      `Dersleri Türkiye Cimnastik Federasyonu sertifikalı eğitmenler yönetir: ${trainerNames}.`,
      'İlk gelişin için deneme dersi vardır. Saati rezervasyon takviminden seçebilirsin. 8 derslik paket 8.000 TL, 12 derslik paket 11.500 TL’dir. Paketler satın alındığı tarihten itibaren 45 gün geçerlidir. Süre sonunda kullanılmayan dersler yanar.',
      `Stüdyo ${ADDRESS} adresindedir. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT}`,
    ],
    faqs: [
      {
        question: 'Reformer grubu kaç kişi?',
        answer: 'Reformer Pilates grubu en fazla 6 kişidir.',
      },
      {
        question: 'Deneme dersi var mı?',
        answer: 'Evet. Deneme dersi vardır. Uygun grup saatini seçerek başlayabilirsin.',
      },
      {
        question: 'Paketler ne kadar süre geçerli?',
        answer:
          '8 ders 8.000 TL, 12 ders 11.500 TL. Paketler satın alındığı tarihten itibaren 45 gün geçerlidir. Kullanılmayan dersler süre sonunda yanar.',
      },
    ],
  },
  {
    path: '/fonksiyonel-pilates',
    title: 'Fonksiyonel Pilates | Alsancak Pilates Studio',
    description:
      'Fonksiyonel pilates Alsancak Pilates Studio’da en fazla 8 kişilik gruplarla yapılır. Günlük hareket, kuvvet ve dayanıklılık. Deneme dersi Alsancak, İzmir.',
    h1: 'Alsancak’ta Fonksiyonel Pilates',
    serviceName: 'Fonksiyonel Pilates',
    ...STUDIO_PHOTO,
    imageAlt: SALON_ALT,
    paragraphs: [
      'Fonksiyonel pilates, günlük hareketleri güçlendiren, enerjiyi yükselten ve dayanıklılığı artıran bir çalışmadır.',
      'Grup en fazla 8 kişidir. Reformer Pilates ayrıdır ve en fazla 6 kişidir.',
      `Dersi Türkiye Cimnastik Federasyonu sertifikalı eğitmenler verir: ${trainerNames}.`,
      'Deneme dersiyle başlayabilirsin. 8 ders 8.000 TL, 12 ders 11.500 TL. Paket, satın alındığı tarihten itibaren 45 gün açıktır.',
      `Stüdyo ${ADDRESS} adresindedir. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT}`,
    ],
    faqs: [
      {
        question: 'Fonksiyonel pilates grubu kaç kişi?',
        answer: 'Fonksiyonel Pilates grubu en fazla 8 kişidir.',
      },
      {
        question: 'Çalışma saatleri nedir?',
        answer: HOURS_TEXT,
      },
    ],
  },
  {
    path: '/ozel-ders',
    title: 'Özel Ders | Alsancak Pilates Studio',
    description:
      'Alsancak Pilates Studio’da birebir özel ders 8.000 TL. Kişisel hedefler için planlanan seanslar. Talatpaşa Bulvarı, Konak / İzmir.',
    h1: 'Alsancak’ta Özel Pilates Dersi',
    serviceName: 'Özel Pilates Dersi',
    offer: {
      '@type': 'Offer',
      price: '8000',
      priceCurrency: 'TRY',
      description: 'Özel ders',
    },
    paragraphs: [
      'Özel ders birebir planlanır. Kişisel hedeflerine bu seansta odaklanırsın.',
      'Ücret 8.000 TL’dir. Süre ve program için stüdyoya yazabilirsin.',
      'Grup paketleri ayrıdır: 8 ders 8.000 TL, 12 ders 11.500 TL. Bu paketler satın alındığı tarihten itibaren 45 gün geçerlidir.',
      `Birebir saati ${ADDRESS} adresinde ayırırsın. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT}`,
    ],
    faqs: [
      {
        question: 'Özel ders ne kadar?',
        answer: 'Özel ders 8.000 TL’dir ve birebirdir. Süre ve program için stüdyoya yazabilirsin.',
      },
      {
        question: 'Özel ders grup dersi mi?',
        answer: 'Hayır. Özel ders birebir yapılır.',
      },
    ],
  },
  {
    path: '/egitmenler',
    kind: 'trainers',
    title: 'Eğitmenler | Alsancak Pilates Studio',
    description: `Alsancak Pilates Studio eğitmenleri: ${trainerNames}. Türkiye Cimnastik Federasyonu sertifikalı kadro. Alsancak, İzmir.`,
    h1: 'Alsancak Pilates Studio eğitmenleri',
    paragraphs: [
      'Türkiye Cimnastik Federasyonu sertifikası ile Mat & Reformer ve fonksiyonel antrenman alanında uzmanlaşmış bir kadro.',
      '20 yıllık tecrübe, kadronun birlikte taşıdığı birikimdir.',
      `Eğitmenler: ${trainerNames}. Ders saatini stüdyodan ayırabilirsin.`,
    ],
    faqs: [
      {
        question: 'Hangi eğitmenler var?',
        answer: `Stüdyo eğitmenleri: ${trainerNames}.`,
      },
    ],
  },
  {
    path: '/hakkimizda',
    kind: 'about',
    title: 'Hakkımızda | Alsancak Pilates Studio',
    description:
      'Alsancak Pilates Studio, Talatpaşa Bulvarı No:33/1, Harputlu Apt., Konak / İzmir. Reformer pilates ve fonksiyonel antrenman. 20 yıllık tecrübe.',
    h1: 'Alsancak Pilates Studio',
    ...STUDIO_PHOTO,
    imageAlt: SALON_ALT,
    paragraphs: [
      'Alsancak Pilates Studio, Alsancak’ta reformer pilates ve fonksiyonel antrenman dersi verir.',
      'Kadronun 20 yıllık tecrübesi vardır. Rozetler Türkiye Cimnastik Federasyonu, Mat & Reformer ve Fonksiyonel Antrenman’dır.',
      'Reformer grubu en fazla 6, fonksiyonel pilates grubu en fazla 8 kişidir. Deneme dersi vardır. 8 ders 8.000 TL, 12 ders 11.500 TL, özel ders 8.000 TL. Grup paketleri satın alındığı tarihten itibaren 45 gün geçerlidir.',
      `Adres: ${ADDRESS}. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT} Instagram hesabı alsancak_pilates.`,
    ],
    faqs: [
      {
        question: 'Stüdyo nerede?',
        answer: `${ADDRESS}. Telefon ${PHONE_DISPLAY}. ${HOURS_TEXT}`,
      },
      {
        question: 'Stüdyonun adı ne?',
        answer: 'Alsancak Pilates Studio.',
      },
    ],
  },
]

for (const page of PAGES) {
  page.links = linksExcept(page.path)
}

function faqNode(faqs) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export function jsonLdForPath(path) {
  if (path === '/') {
    return {
      '@context': 'https://schema.org',
      ...faqNode(HOME_FAQS),
    }
  }
  const page = PAGES.find((item) => item.path === path)
  if (!page) return null
  const graph = []
  if (page.serviceName) {
    const service = {
      '@type': 'Service',
      name: page.serviceName,
      serviceType: page.serviceName,
      url: `${SITE}${page.path}`,
      provider: {
        '@type': 'ExerciseGym',
        name: 'Alsancak Pilates Studio',
        url: `${SITE}/`,
      },
      areaServed: ['Alsancak', 'Konak', 'İzmir'],
      description: page.description,
    }
    if (page.offer) service.offers = page.offer
    graph.push(service)
  }
  if (page.kind === 'about') {
    graph.push({
      '@type': 'AboutPage',
      name: page.title,
      url: `${SITE}${page.path}`,
      description: page.description,
    })
  }
  if (page.kind === 'trainers') {
    graph.push({
      '@type': 'ExerciseGym',
      '@id': `${SITE}/#studio`,
      name: 'Alsancak Pilates Studio',
      url: `${SITE}/`,
      employee: TRAINERS.map((trainer) => ({ '@id': `${SITE}/egitmenler#${trainer.slug}` })),
    })
    for (const trainer of TRAINERS) {
      graph.push({
        '@type': 'Person',
        '@id': `${SITE}/egitmenler#${trainer.slug}`,
        name: trainer.name,
        image: `${SITE}${trainer.image}`,
        worksFor: { '@id': `${SITE}/#studio` },
      })
    }
  }
  if (page.faqs?.length) graph.push(faqNode(page.faqs))
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

export function pageByStudioPath(path) {
  return PAGES.find((item) => item.path === path) || null
}
