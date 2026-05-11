import { createFileRoute } from "@tanstack/react-router";
import { SourcesTable } from "@/components/sources/SourcesTable";
import { HashtagsTable } from "@/components/sources/HashtagsTable";
import { ImportFollowsCard } from "@/components/x/ImportFollowsCard";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Sources — UroFeed" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    import: search.import === "true" || search.import === true ? true : undefined,
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="flex flex-col gap-3 h-full">
      <ImportFollowsCard
        autoOpen={!!search.import}
        onAutoOpened={() =>
          navigate({ search: { import: undefined }, replace: true })
        }
      />
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