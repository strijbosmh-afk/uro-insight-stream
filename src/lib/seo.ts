const SITE_URL = "https://urofeed.com";
const SITE_NAME = "UroFeed";

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  ogType?: "website" | "article";
}

/**
 * Build a TanStack Start `head()` payload with unique title, description,
 * Open Graph tags, og:url and a self-referencing canonical link.
 */
export function buildSeoHead({ title, description, path, ogType = "website" }: SeoInput) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: ogType },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}