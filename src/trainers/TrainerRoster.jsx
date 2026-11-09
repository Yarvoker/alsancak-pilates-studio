import './TrainerRoster.css'

const trainerOrder = [
  'Önder Güzel',
  'Emel Gamze Güzel',
  'Devran Çiçek',
  'Ecrin Aydınlı',
  'Cemal Ayhan',
]

export default function TrainerRoster() {
  return (
    <ul className="trainer-roster">
      {trainerOrder.map((name) => (
        <li key={name} className="instructor-slot">
          <div className="instructor-frame">
            {name === 'Önder Güzel' ? (
              <img
                className="trainer-portrait"
                src="/trainers/onder-guzel.jpg"
                alt="Önder Güzel"
                width="989"
                height="1200"
                loading="lazy"
                decoding="async"
              />
            ) : name === 'Emel Gamze Güzel' ? (
              <img
                className="trainer-portrait emel-portrait"
                src="/trainers/emel-gamze-guzel.jpg"
                alt="Emel Gamze Güzel"
                width="1086"
                height="1356"
                loading="lazy"
                decoding="async"
              />
            ) : name === 'Devran Çiçek' ? (
              <img
                className="trainer-portrait devran-portrait"
                src="/trainers/devran-cicek.jpg"
                alt="Devran Çiçek"
                width="2048"
                height="1984"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
          <p className="instructor-name">{name}</p>
        </li>
      ))}
    </ul>
  )
}
