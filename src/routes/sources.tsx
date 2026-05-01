import { createFileRoute } from "@tanstack/react-router";
import { SourcesTable } from "@/components/sources/SourcesTable";
import { HashtagsTable } from "@/components/sources/HashtagsTable";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Sources — UroFeed" }] }),
  component: SourcesPage,
});

function SourcesPage() {
  return (
    <div className="grid grid-cols-12 gap-3 h-full">
      <div className="col-span-12 xl:col-span-7 min-h-0">
        <SourcesTable />
      </div>
      <div className="col-span-12 xl:col-span-5 min-h-0">
        <HashtagsTable />
      </div>
    </div>
  );
}