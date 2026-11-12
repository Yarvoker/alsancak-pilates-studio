import Seo from './Seo.jsx'
import { TRAINERS, jsonLdForPath, pageByStudioPath } from './studioCopy.js'
import './trainers/TrainerRoster.css'

function JsonLd({ path }) {
  const data = jsonLdForPath(path)
  if (!data) return null
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll('<', '\\u003c') }}
    />
  )
}

function PageLinks({ links }) {
  return (
    <nav className="studio-links" aria-label="İlgili sayfalar">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </nav>
  )
}

function PageFaqs({ faqs }) {
  if (!faqs?.length) return null
  return (
    <section className="studio-faq" aria-labelledby="sayfa-sss">
      <h2 id="sayfa-sss">Sık sorulan sorular</h2>
      <div className="faq-list">
        {faqs.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function FaqBlock() {
  const data = jsonLdForPath('/')
  const faqs = data.mainEntity.map((item) => ({
    question: item.name,
    answer: item.acceptedAnswer.text,
  }))
  return (
    <section className="section studio-faq" id="sss" aria-labelledby="sss-baslik">
      <JsonLd path="/" />
      <div className="section-heading">
        <p className="eyebrow">SIK SORULANLAR</p>
        <h2 id="sss-baslik">Sık sorulan sorular</h2>
      </div>
      <div className="faq-list">
        {faqs.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function StudioPage({ path }) {
  const page = pageByStudioPath(path)
  if (!page) return null
  return (
    <article className="studio-page section">
      <Seo title={page.title} description={page.description} path={page.path} />
      <JsonLd path={page.path} />
      <p className="eyebrow">ALSANCAK PİLATES STUDIO</p>
      <h1>{page.h1}</h1>
      {page.image ? (
        <img
          className="studio-photo"
          src={page.image}
          alt={page.imageAlt}
          width={page.imageWidth}
          height={page.imageHeight}
        />
      ) : null}
      {page.paragraphs.map((paragraph) => (
        <p key={paragraph} className="hero-text">
          {paragraph}
        </p>
      ))}
      {page.kind === 'trainers' ? (
        <ul className="trainer-roster trainer-page-grid">
          {TRAINERS.map((trainer) => (
            <li key={trainer.slug} id={trainer.slug} className="instructor-slot">
              <div className="instructor-frame">
                <img
                  className={trainer.className ? `trainer-portrait ${trainer.className}` : 'trainer-portrait'}
                  src={trainer.image}
                  alt={trainer.name}
                  width={trainer.width}
                  height={trainer.height}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="instructor-name">{trainer.name}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <PageFaqs faqs={page.faqs} />
      <PageLinks links={page.links} />
    </article>
  )
}
