import { licenseTerms, type LicenseTerms } from '../rights/rights';
import { safeFetch, type SafeFetchOptions } from './safeFetch';

/** Separate ratings (0–5) per spec §14: a trusted provider is not automatically a licensed provider. */
export interface ProviderRatings {
  factualCredibility: number;
  currency: number;
  curriculumRelevance: number;
  accessPermissions: number;
  reusePermissions: number;
}

export interface RawDocument {
  title: string;
  text: string; // transient: used for evidence verification, never persisted unless rights allow
  canonicalUrl: string;
  finalUrl: string;
  author: string | null;
  publisher: string;
  language: string;
  publishedAt: Date | null; // only if the API states it
  updatedAt: Date | null; // only if the API states it
  retrievedAt: Date; // system clock
  httpStatus: number;
  license?: LicenseTerms;
  sourceType: string;
}

export interface ProviderContext {
  userAgent: string;
  fetchImpl?: SafeFetchOptions['fetchImpl'];
}

export interface ResearchProvider {
  id: string;
  label: string;
  hosts: string[];
  languages: string[];
  ratings: ProviderRatings;
  /** Basis for automated access: official API with published usage policy. */
  accessBasis: 'official_api' | 'robots_checked_html';
  search(query: string, language: string, ctx: ProviderContext): Promise<RawDocument[]>;
}

function ccFromUrl(url?: string): LicenseTerms | undefined {
  if (!url) return undefined;
  const m = url.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/i);
  if (!m) return undefined;
  const kind = m[1].toLowerCase();
  const code = m[2].toLowerCase();
  const ver = m[3];
  let id: string | undefined;
  if (kind === 'publicdomain' && code === 'zero') id = 'CC0-1.0';
  else if (kind === 'licenses') id = `CC-${code.toUpperCase()}-${ver}`;
  if (!id) return undefined;
  const known = licenseTerms(id, { url, version: ver, verified: true });
  // only treat as verified if we mapped to a known CC id (unknown ids are max-restrictive anyway)
  return known;
}

/**
 * Wikipedia via the official MediaWiki Action API. Text: CC BY-SA 4.0 (reported live by siteinfo).
 * Credibility is moderate: a good *secondary* source for general facts, not a primary curriculum authority.
 */
export const wikipediaProvider: ResearchProvider = {
  id: 'wikipedia',
  label: 'Wikipedia (Wikimedia Foundation)',
  hosts: ['wikipedia.org'],
  languages: ['de', 'en'],
  accessBasis: 'official_api',
  ratings: { factualCredibility: 3, currency: 4, curriculumRelevance: 3, accessPermissions: 5, reusePermissions: 4 },
  async search(query, language, ctx) {
    const lang = this.languages.includes(language) ? language : 'de';
    const base = `https://${lang}.wikipedia.org/w/api.php`;
    const opt = { allowedHosts: this.hosts, userAgent: ctx.userAgent, fetchImpl: ctx.fetchImpl, maxBytes: 3_000_000 };
    const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '2', srnamespace: '0', format: 'json', formatversion: '2' });
    const s = await safeFetch(`${base}?${q}`, opt);
    const hits: { title: string }[] = JSON.parse(s.body)?.query?.search ?? [];
    const out: RawDocument[] = [];
    for (const h of hits.slice(0, 2)) {
      const p = new URLSearchParams({
        action: 'query',
        titles: h.title,
        prop: 'extracts|info|revisions',
        explaintext: '1',
        exsectionformat: 'plain',
        inprop: 'url',
        rvprop: 'timestamp|ids',
        meta: 'siteinfo',
        siprop: 'rightsinfo',
        redirects: '1',
        format: 'json',
        formatversion: '2',
      });
      const r = await safeFetch(`${base}?${p}`, opt);
      const j = JSON.parse(r.body);
      const page = j?.query?.pages?.[0];
      if (!page || page.missing || !page.extract) continue;
      const rev = page.revisions?.[0];
      const lic = ccFromUrl(j?.query?.rightsinfo?.url);
      const canonical: string = page.canonicalurl;
      if (!canonical) continue;
      const permalink = rev?.revid ? `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title.replace(/ /g, '_'))}&oldid=${rev.revid}` : canonical;
      out.push({
        title: page.title,
        text: String(page.extract).slice(0, 16_000),
        canonicalUrl: canonical,
        finalUrl: permalink,
        author: 'Wikipedia contributors',
        publisher: 'Wikipedia (Wikimedia Foundation)',
        language: lang,
        publishedAt: null, // page creation date is not requested → "Not available"
        updatedAt: rev?.timestamp ? new Date(rev.timestamp) : null,
        retrievedAt: r.retrievedAt,
        httpStatus: r.status,
        license: lic ? { ...lic, holder: 'Wikipedia contributors' } : undefined,
        sourceType: 'encyclopedia',
      });
    }
    return out;
  },
};

export const DEFAULT_PROVIDERS: ResearchProvider[] = [wikipediaProvider];
