import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/api";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/events/"],
      disallow: ["/dashboard/", "/staff/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
