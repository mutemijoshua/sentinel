import SiteForm from '@/components/SiteForm';
import { saveSite } from '../../../actions';

export default function NewSite() {
  return (
    <main style={{ maxWidth: 760, padding: '30px 0 60px' }}>
      <h1 style={{ marginTop: 0 }}>Add a website</h1>
      <div className="panel">
        <SiteForm action={saveSite} />
      </div>
    </main>
  );
}
