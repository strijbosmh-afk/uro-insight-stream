import { createFileRoute } from "@tanstack/react-router";
import { SourcesTable } from "@/components/sources/SourcesTable";
import { HashtagsTable } from "@/components/sources/HashtagsTable";
import { ImportFollowsCard } from "@/components/x/ImportFollowsCard";
import { LowSourceCountNudge } from "@/components/x/LowSourceCountNudge";

type ImportMode = "true" | "diff" | "prompt";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Sources — UroFeed" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.import;
    let value: ImportMode | undefined;
    if (raw === true || raw === "true") value = "true";
    else if (raw === "diff") value = "diff";
    else if (raw === "prompt") value = "prompt";
    return { import: value };
  },
  component: SourcesPage,
});

function SourcesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const mode: "full" | "diff" =
    search.import === "diff" ? "diff" : "full";
  return (
    <div className="flex flex-col gap-3 h-full">
      <ImportFollowsCard
        autoOpen={!!search.import}
        mode={mode}
        onAutoOpened={() =>
          navigate({ search: { import: undefined }, replace: true })
        }
      />
      <LowSourceCountNudge />
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        <div className="col-span-12 xl:col-span-7 min-h-0">
          <SourcesTable />
        </div>
        <div className="col-span-12 xl:col-span-5 min-h-0">
          <HashtagsTable />
        </div>
      </div>
    </div>
  );
}