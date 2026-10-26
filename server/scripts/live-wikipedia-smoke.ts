import { wikipediaProvider } from '../src/research/providers';
import { rightsService, licenseTerms } from '../src/rights/rights';

const docs = await wikipediaProvider.search('Zweites newtonsches Gesetz', 'de', { userAgent: 'StudyCloudBot/0.1 (live smoke test)' });
for (const d of docs) {
  console.log(JSON.stringify({
    title: d.title, canonicalUrl: d.canonicalUrl, finalUrl: d.finalUrl, publisher: d.publisher, author: d.author,
    publishedAt: d.publishedAt, updatedAt: d.updatedAt, retrievedAt: d.retrievedAt, httpStatus: d.httpStatus,
    license: d.license && { id: d.license.id, url: d.license.url, verified: d.license.verified }, textChars: d.text.length, textHead: d.text.slice(0, 120),
  }, null, 1));
}
console.log('count', docs.length);
