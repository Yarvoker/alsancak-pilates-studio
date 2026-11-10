import './gallery.css'

const frames = [
  { caption: 'Boş stüdyo' },
  { caption: 'Boş stüdyo' },
  { caption: 'Ders' },
  { caption: 'Ders' },
  { caption: 'Ders' },
]

export default function StudioGallery() {
  return (
    <section className="gallery section" id="galeri">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">GALERİ</p>
          <h2>Stüdyo</h2>
          <p className="gallery-lede">Boş hali ve ders hali.</p>
        </div>
      </div>
      <div className="gallery-grid">
        {frames.map((item, index) => (
          <figure key={`${item.caption}-${index}`} className="gallery-item">
            <div className="gallery-frame" />
            <figcaption>{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
