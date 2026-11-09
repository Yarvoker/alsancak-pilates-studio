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
          <div className="instructor-frame" />
          <p className="instructor-name">{name}</p>
        </li>
      ))}
    </ul>
  )
}
