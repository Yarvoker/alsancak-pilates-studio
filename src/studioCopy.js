export const SITE = 'https://www.alsancakpilates.com'

export const ADDRESS =
  'Alsancak Mahallesi, Talatpaşa Bulvarı No:33/1, Kat:1 Daire:1, Harputlu Apt., Konak / İzmir'

export const PHONE_DISPLAY = '0530 207 19 08'

export const TRAINERS = [
  {
    name: 'Önder Güzel',
    slug: 'onder-guzel',
    image: '/trainers/onder-guzel.jpg',
    width: 989,
    height: 1200,
  },
  {
    name: 'Emel Gamze Güzel',
    slug: 'emel-gamze-guzel',
    image: '/trainers/emel-gamze-guzel.jpg',
    width: 1086,
    height: 1356,
    className: 'emel-portrait',
  },
  {
    name: 'Devran Çiçek',
    slug: 'devran-cicek',
    image: '/trainers/devran-cicek.jpg',
    width: 2048,
    height: 1984,
    className: 'devran-portrait',
  },
  {
    name: 'Ecrin Aydınlı',
    slug: 'ecrin-aydinli',
    image: '/trainers/ecrin-aydinli.jpg',
    width: 1536,
    height: 1815,
    className: 'ecrin-portrait',
  },
  {
    name: 'Cemal Ayhan',
    slug: 'cemal-ayhan',
    image: '/trainers/cemal-ayhan.jpg',
    width: 1024,
    height: 1008,
    className: 'cemal-portrait',
  },
]

const STUDIO_PHOTO = {
  image: '/images/group-reformer.jpg',
  imageAlt: 'Alsancak Pilates Studio’da grup Reformer dersi',
  imageWidth: 1170,
  imageHeight: 780,
}

const NAV = [
  { href: '/reformer-pilates', label: 'Reformer Pilates' },
  { href: '/mat-pilates', label: 'Mat Pilates' },
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
      'Evet. Fiyatlar bölümünde deneme dersi kartı var. Kayıt için Hesabım üzerinden rezervasyon takviminden uygun grup saatini seçebilir veya stüdyoya yazabilirsin.',
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
    answer: `${ADDRESS}. Telefon ${PHONE_DISPLAY}.`,
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
    paragraphs: [
      'Alsancak Pilates Studio, Talatpaşa Bulvarı’ndaki stüdyosunda reformer pilates dersi verir. Seans, sitedeki ders kartındaki gibi, kuvvet, denge ve nefes kontrolünü bir araya getiren kontrollü bir pilates çalışmasıdır.',
      'Reformer grubu en fazla 6 kişidir. Aynı salonda fonksiyonel pilates grubu en fazla 8 kişidir; reformer kontenjanı bundan ayrıdır.',
      `Dersleri Türkiye Cimnastik Federasyonu sertifikalı eğitmenler yönetir. Stüdyo mat, reformer ve fonksiyonel antrenman üzerine çalışır. Eğitmenler: ${trainerNames}.`,
      'İlk gelişin için deneme dersi vardır. Saati ana sayfadaki rezervasyon bölümünden seçersin. 8 derslik paket 8.000 TL, 12 derslik paket 11.500 TL’dir. Paketler satın alındığı tarihten itibaren 45 gün geçerlidir. Süre sonunda kullanılmayan dersler yanar.',
      `Stüdyo ${ADDRESS} adresindedir. Telefon ${PHONE_DISPLAY}.`,
    ],
    faqs: [
      {
        question: 'Reformer grubu kaç kişi?',
        answer: 'Reformer Pilates grubu en fazla 6 kişidir.',
      },
      {
        question: 'Deneme dersi var mı?',
        answer: 'Evet. Ana sayfadaki rezervasyon bölümünden uygun grup saatini seçebilirsin.',
      },
      {
        question: 'Paketler ne kadar süre geçerli?',
        answer:
          '8 ders 8.000 TL, 12 ders 11.500 TL. Paketler satın alındığı tarihten itibaren 45 gün geçerlidir. Kullanılmayan dersler süre sonunda yanar.',
      },
    ],
  },
  {
    path: '/mat-pilates',
    title: 'Mat Pilates | Alsancak Pilates Studio',
    description:
      'Alsancak Pilates Studio mat ve reformer pilatesi Talatpaşa Bulvarı’ndaki stüdyoda verir. Mat için ayrı bir kontenjan yayınlanmıyor. Rezervasyon Konak, İzmir.',
    h1: 'Alsancak’ta Mat Pilates',
    serviceName: 'Mat Pilates',
    ...STUDIO_PHOTO,
    paragraphs: [
      'Alsancak Pilates Studio mat pilatesi reformerle birlikte anlatır. Ana sayfadaki başlık “Reformer ve Mat Pilates”tir. Eğitmen rozetlerinde de Mat & Reformer yazar.',
      'Yayındaki ders kartları Reformer Pilates ve Fonksiyonel Pilates’tir. Reformer grubu en fazla 6, fonksiyonel pilates grubu en fazla 8 kişidir. Mat için ayrı bir kişi sınırı yayınlamıyoruz.',
      `Matı da aynı kadro çalıştırır: ${trainerNames}. Hepsi stüdyonun Türkiye Cimnastik Federasyonu sertifikalı eğitmen kadrosundadır.`,
      'Hangi saatin mat olduğunu rezervasyon takviminden veya stüdyoya yazarak netleştirirsin. Deneme dersi vardır. Paket fiyatları stüdyonun genel fiyatıdır: 8 ders 8.000 TL, 12 ders 11.500 TL, satın almadan itibaren 45 gün.',
      `Adres: ${ADDRESS}. Telefon ${PHONE_DISPLAY}.`,
    ],
    faqs: [
      {
        question: 'Mat grubu kaç kişi?',
        answer:
          'Sitede mat için ayrı bir kontenjan yazmıyor. Reformer Pilates en fazla 6, Fonksiyonel Pilates en fazla 8 kişidir.',
      },
      {
        question: 'Mat dersi nerede yapılıyor?',
        answer: `${ADDRESS}.`,
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
    paragraphs: [
      'Fonksiyonel Pilates, stüdyonun ikinci ders kartıdır. Tanımı sitede durduğu gibi: günlük hareketleri güçlendiren, enerji yükselten ve dayanıklılığı artıran bir akış.',
      'Grup en fazla 8 kişidir. Reformer Pilates bundan ayrıdır ve en fazla 6 kişidir.',
      `Dersi stüdyo eğitmenleri verir: ${trainerNames}. Çalışma, Türkiye Cimnastik Federasyonu sertifikalı kadronun fonksiyonel antrenman tarafına denk gelir.`,
      'Deneme dersiyle başlayabilirsin. 8 ders 8.000 TL, 12 ders 11.500 TL. Paket, satın alındığı tarihten itibaren 45 gün açıktır.',
      `Stüdyo ${ADDRESS} adresindedir. Telefon ${PHONE_DISPLAY}.`,
    ],
    faqs: [
      {
        question: 'Fonksiyonel pilates grubu kaç kişi?',
        answer: 'Fonksiyonel Pilates grubu en fazla 8 kişidir.',
      },
      {
        question: 'Bu dersin stüdyodaki adı ne?',
        answer: 'Ders kartındaki ad Fonksiyonel Pilates’tir.',
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
      'Özel ders, fiyat kartında “Size özel planlanan birebir seanslarla kişisel hedeflerinize odaklanın” diye duruyor. Grup dersi değildir.',
      'Karttaki ücret 8.000 TL’dir. Kaç seanslık bir paket olduğu bu kartta yazmıyor; grup paketlerindeki 8 ve 12 ders sayısını özel derse taşımıyoruz.',
      'Grup tarafında 8 ders 8.000 TL, 12 ders 11.500 TL’dir ve bu paketler 45 gün geçerlidir. Özel dersin süresini rezervasyon sırasında stüdyo söyler.',
      `Birebir saati de aynı stüdyoda, ${ADDRESS} adresinde ayırırsın. Telefon ${PHONE_DISPLAY}.`,
    ],
    faqs: [
      {
        question: 'Özel ders ne kadar?',
        answer: 'Sitedeki özel ders kartı 8.000 TL’dir. Ders birebirdir.',
      },
      {
        question: 'Özel ders grup dersi mi?',
        answer: 'Hayır. Kartın metni birebir seans diye yazar.',
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
      'Türkiye Cimnastik Federasyonu sertifikası ile Mat & Reformer ve fonksiyonel antrenman alanında uzmanlaşmış bir yaklaşım. Bu cümle ana sayfadaki eğitmen bölümünden.',
      'Ana sayfadaki 20 yıllık tecrübe, kadronun ortak notudur. Bu sayfada eğitmenlerin ayrı biyografisi yok.',
      `Eğitmenler: ${trainerNames}. Rezervasyon, ana sayfadaki ders takviminden yapılır.`,
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
      'Alsancak Pilates Studio, Talatpaşa Bulvarı No:33/1, Harputlu Apt., Konak / İzmir. Reformer, mat ve fonksiyonel pilates. 20 yıllık tecrübe.',
    h1: 'Alsancak Pilates Studio',
    ...STUDIO_PHOTO,
    paragraphs: [
      'Alsancak Pilates Studio, Alsancak’ta reformer, mat ve fonksiyonel pilates dersi veren bir stüdyodur. Ana sayfa bunu “Reformer ve Mat Pilates” diye özetler.',
      'Eğitmen bölümünde 20 yıllık tecrübe yazar. Rozetler Türkiye Cimnastik Federasyonu, Mat & Reformer ve Fonksiyonel Antrenman’dır.',
      'Reformer grubu en fazla 6, fonksiyonel pilates grubu en fazla 8 kişidir. Deneme dersi vardır. 8 ders 8.000 TL, 12 ders 11.500 TL, özel ders 8.000 TL. Grup paketleri satın alındığı tarihten itibaren 45 gün geçerlidir.',
      `Adres: ${ADDRESS}. Telefon ${PHONE_DISPLAY}. Instagram hesabı alsancak_pilates.`,
      'Çalışma saatini bu sayfaya yazmıyoruz. Stüdyo saatleri rezervasyon takviminde açılan gün ve saatlerdir.',
    ],
    faqs: [
      {
        question: 'Stüdyo nerede?',
        answer: `${ADDRESS}. Telefon ${PHONE_DISPLAY}.`,
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
