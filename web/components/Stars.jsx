export default function Stars({ rating }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const items = [];
  for (let i = 0; i < full; i++) items.push('fa-solid fa-star');
  if (half) items.push('fa-solid fa-star-half-stroke');
  while (items.length < 5) items.push('fa-regular fa-star');
  return (
    <span className="stars">
      {items.map((c, i) => (
        <i className={c} key={i}></i>
      ))}
    </span>
  );
}
