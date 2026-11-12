import './gallery.css'

const frames = [
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-empty-wide.jpg',
    alt: 'Alsancak Pilates Studio’da boş stüdyo',
    width: 1600,
    height: 1200,
  },
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-class-roll.jpg',
    alt: 'Alsancak Pilates Studio’da reformer dersi',
    width: 1600,
    height: 1200,
  },
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-empty-reformers.jpg',
    alt: 'Alsancak Pilates Studio’da reformer sırası',
    width: 1600,
    height: 1200,
  },
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-class-standing.jpg',
    alt: 'Alsancak Pilates Studio’da ayakta grup dersi',
    width: 1600,
    height: 1200,
  },
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-instructor.jpg',
    alt: 'Alsancak Pilates Studio’da eğitmen eşliğinde ders',
    width: 1600,
    height: 1200,
    position: 'center 62%',
  },
  {
    src: 'https://tkzbfgkeridpaqmylunn.supabase.co/storage/v1/object/public/studio-gallery/studio-class-stretch.jpg',
    alt: 'Alsancak Pilates Studio’da grup dersinde esneme',
    width: 1320,
    height: 1584,
    position: 'center 58%',
  },
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
        {frames.map((item) => (
          <figure key={item.src} className="gallery-item">
            <div className="gallery-frame">
              <img
                src={item.src}
                alt={item.alt}
                width={item.width}
                height={item.height}
                className="gallery-photo"
                style={item.position ? { objectPosition: item.position } : undefined}
                loading="lazy"
                decoding="async"
              />
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}
