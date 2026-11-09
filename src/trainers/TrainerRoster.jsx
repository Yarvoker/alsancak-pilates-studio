import './TrainerRoster.css'

const trainerPortraits = {
  'Önder Güzel': '/trainers/onder-guzel.jpg',
  'Emel Gamze Güzel': '/trainers/emel-gamze-guzel.jpg',
  'Devran Çiçek': '/trainers/devran-cicek.jpg',
  'Ecrin Aydınlı': '/trainers/ecrin-aydinli.jpg',
  'Cemal Ayhan': '/trainers/cemal-ayhan.jpg',
}

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
            <img
              className="trainer-portrait"
              src={trainerPortraits[name]}
              alt={name}
              width="1200"
              height="1600"
              loading="lazy"
              decoding="async"
            />
          </div>
          <p className="instructor-name">{name}</p>
        </li>
      ))}
    </ul>
  )
}
