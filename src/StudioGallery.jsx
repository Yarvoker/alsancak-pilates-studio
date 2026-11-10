import './gallery.css'

const frameCount = 5

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
        {Array.from({ length: frameCount }, (_, index) => (
          <figure key={index} className="gallery-item">
            <div className="gallery-frame" />
          </figure>
        ))}
      </div>
    </section>
  )
}
