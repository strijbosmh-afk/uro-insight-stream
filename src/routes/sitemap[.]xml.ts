import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://urofeed.com";

interface Entry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: Entry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/auth", changefreq: "monthly", priority: "0.8" },
          { path: "/dashboard", changefreq: "daily", priority: "0.9" },
          { path: "/feed", changefreq: "hourly", priority: "0.9" },
          { path: "/congresses", changefreq: "daily", priority: "0.8" },
          { path: "/discover", changefreq: "weekly", priority: "0.7" },
          { path: "/sources", changefreq: "weekly", priority: "0.6" },
          { path: "/summaries", changefreq: "daily", priority: "0.7" },
          { path: "/digests", changefreq: "weekly", priority: "0.6" },
          { path: "/alerts", changefreq: "weekly", priority: "0.5" },
          { path: "/help/instructions", changefreq: "monthly", priority: "0.5" },
        ];

        const urls = entries
          .map((e) =>
            [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});