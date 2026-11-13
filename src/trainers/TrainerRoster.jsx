import './TrainerRoster.css'
import { TRAINERS } from '../studioCopy.js'

export default function TrainerRoster() {
  return (
    <ul className="trainer-roster">
      {TRAINERS.map((trainer) => (
        <li key={trainer.slug} className="instructor-slot">
          <div className="instructor-frame">
            <img
              className={trainer.className ? `trainer-portrait ${trainer.className}` : 'trainer-portrait'}
              src={trainer.image}
              alt={trainer.name}
              width={trainer.width}
              height={trainer.height}
              srcSet={trainer.srcSet}
              sizes={trainer.sizes}
              loading="lazy"
              decoding="async"
            />
          </div>
          <p className="instructor-name">{trainer.name}</p>
        </li>
      ))}
    </ul>
  )
}
