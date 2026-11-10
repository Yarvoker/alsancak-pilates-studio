const photos = [
  { src: '/gallery/studio-empty-1.jpg', caption: 'Boş stüdyo', alt: 'Boş stüdyo 1' },
  { src: '/gallery/studio-empty-2.jpg', caption: 'Boş stüdyo', alt: 'Boş stüdyo 2' },
  { src: '/gallery/studio-class-1.jpg', caption: 'Ders', alt: 'Ders 1' },
  { src: '/gallery/studio-class-2.jpg', caption: 'Ders', alt: 'Ders 2' },
  { src: '/gallery/studio-class-3.jpg', caption: 'Ders', alt: 'Ders 3' },
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
        {photos.map((item) => (
          <figure key={item.src} className="gallery-item">
            <img className="gallery-image" src={item.src} alt={item.alt} loading="lazy" />
            <figcaption>{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
