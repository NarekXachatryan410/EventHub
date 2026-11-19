export const apiBaseUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

export const publicApiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
