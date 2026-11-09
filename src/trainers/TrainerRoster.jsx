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
            ) : null}
          </div>
          <p className="instructor-name">{name}</p>
        </li>
      ))}
    </ul>
  )
}
