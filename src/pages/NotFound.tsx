import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export function NotFound() {
  return (
    <Empty title="Page not found">
      <Link to="/" className="btn-secondary mt-4">
        Back to BUDDIES
      </Link>
    </Empty>
  );
}
