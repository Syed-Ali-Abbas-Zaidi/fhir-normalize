import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/constants';

/*
 * Served at /robots.txt, which crawlers request unconditionally — without it
 * every visit from one is a 404 in the logs.
 *
 * Nothing here is private and there is one route, so everything is allowed.
 */
const robots = (): MetadataRoute.Robots => ({
  rules: { userAgent: '*', allow: '/' },
  sitemap: `${SITE_URL}/sitemap.xml`,
});

export default robots;
