import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { apiBaseUrl, siteUrl } from "@/lib/api";

type SitemapEvent = { slug: string; updatedAt: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const response = await fetch(`${apiBaseUrl}/api/events`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load events for sitemap (${response.status})`);
  }
  const events = (await response.json()) as SitemapEvent[];
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: "daily", priority: 0.8 },
    ...events.map((event) => ({
      url: `${siteUrl}/events/${event.slug}`,
      lastModified: event.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
