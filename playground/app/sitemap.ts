import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/constants';

/*
 * One route, so one entry. It exists because robots.txt points at it and
 * because crawlers request it whether or not it is advertised.
 */
const sitemap = (): MetadataRoute.Sitemap => [
  { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
];

export default sitemap;
