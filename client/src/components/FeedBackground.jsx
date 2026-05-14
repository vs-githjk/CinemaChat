import Ballpit from './Ballpit.jsx';

export default function FeedBackground() {
  return (
    <Ballpit
      count={80}
      gravity={0.5}
      friction={0.9975}
      wallBounce={0.95}
      followCursor
      colors={["#7c3aed", "#fbbf24", "#ec4899"]}
    />
  );
}
