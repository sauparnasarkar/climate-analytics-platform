import { Card, CardHeader } from '@syena/ds';
import { LlmProviderSection } from '../admin/LlmProviderSection';
import { PageChrome } from '../layouts/PageChrome';

// Unlisted -- registered only as a <Route> in App.tsx, absent from NAV_ITEMS and
// SidebarNav.persistentAction, reachable by URL only. Same precedent /ask already sets
// (root ARCHITECTURE.md §8). Gated at the edge by a Cloudflare Access login policy, not any
// app-level check here -- see services/agent/SPEC.md §14.1.
export default function AdminPage() {
  return (
    <div>
      <PageChrome title="Admin" purpose="Settings for the conversational agent." />
      <Card withBorder padding="roomy">
        <CardHeader title="LLM Model" supportText="Which model services/agent uses for every conversational query." />
        <div style={{ marginTop: 16 }}>
          <LlmProviderSection />
        </div>
      </Card>
    </div>
  );
}
