import { Panel } from "./Panel";
import { RecentJobsTable } from "./RecentJobsTable";
import type { RecentJob } from "../types";

type Props = {
  jobs: RecentJob[];
  loading: boolean;
  error: string | null;
  onOpenJob: (messageId: string) => void;
};

export function JobsPage({ jobs, loading, error, onOpenJob }: Props) {
  return (
    <div className="grid grid--single">
      <Panel title="Recent Jobs">
        {loading && <div className="state">Loading recent jobs...</div>}
        {error && <div className="state state--error">{error}</div>}
        {!loading && <RecentJobsTable jobs={jobs} onOpen={onOpenJob} />}
      </Panel>
    </div>
  );
}
