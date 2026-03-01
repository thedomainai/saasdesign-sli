import { chromium, type Browser, type Page } from 'playwright';
import { join } from 'path';

export interface FilterItem {
  label: string;
  slug: string;
  url: string;
}

export interface FilterOptions {
  pagetypes: FilterItem[];
  styles: FilterItem[];
  industries: FilterItem[];
  assets: FilterItem[];
  stacks: FilterItem[];
}

export interface Design {
  name: string;
  url: string;
  siteUrl: string;
  tags: string[];
  thumbnailUrl: string;
}

// 知識ベースのフォールバックフィルター（動的取得失敗時に使用）
const FALLBACK_FILTERS: FilterOptions = {
  pagetypes: [
    { label: 'Landing Page', slug: 'saas-landing-page-examples', url: '/page-types/saas-landing-page-examples' },
    { label: 'Pricing Page', slug: 'saas-pricing-page-examples', url: '/page-types/saas-pricing-page-examples' },
    { label: 'Product Page', slug: 'saas-product-page-examples', url: '/page-types/saas-product-page-examples' },
    { label: 'About Page', slug: 'saas-about-page-examples', url: '/page-types/saas-about-page-examples' },
    { label: 'Blog', slug: 'saas-blog-page-examples', url: '/page-types/saas-blog-page-examples' },
    { label: 'Contact', slug: 'saas-contact-page-examples', url: '/page-types/saas-contact-page-examples' },
    { label: 'Customers', slug: 'saas-customers-page-examples', url: '/page-types/saas-customers-page-examples' },
    { label: 'Careers', slug: 'saas-careers-page-examples', url: '/page-types/saas-careers-page-examples' },
  ],
  styles: [
    { label: 'Minimal', slug: 'minimal', url: '/style/minimal' },
    { label: 'Technical', slug: 'technical', url: '/style/technical' },
    { label: 'Bold', slug: 'bold', url: '/style/bold' },
    { label: 'Dark', slug: 'dark', url: '/style/dark' },
    { label: 'Colorful', slug: 'colorful', url: '/style/colorful' },
    { label: 'Playful', slug: 'playful', url: '/style/playful' },
    { label: 'Corporate', slug: 'corporate', url: '/style/corporate' },
    { label: 'Modern', slug: 'modern', url: '/style/modern' },
  ],
  industries: [
    { label: 'API SaaS', slug: 'api-saas', url: '/industry/api-saas-websites-inspiration' },
    { label: 'Fintech', slug: 'fintech', url: '/industry/fintech-saas-websites-inspiration' },
    { label: 'DevTools', slug: 'devtools', url: '/industry/devtools-saas-websites-inspiration' },
    { label: 'Marketing', slug: 'marketing', url: '/industry/marketing-saas-websites-inspiration' },
    { label: 'Analytics', slug: 'analytics', url: '/industry/analytics-saas-websites-inspiration' },
    { label: 'HR / Recruiting', slug: 'hr', url: '/industry/hr-saas-websites-inspiration' },
    { label: 'Security', slug: 'security', url: '/industry/security-saas-websites-inspiration' },
    { label: 'E-commerce', slug: 'ecommerce', url: '/industry/ecommerce-saas-websites-inspiration' },
  ],
  assets: [
    { label: 'UI Components', slug: 'ui', url: '/assets/ui' },
    { label: 'Animated', slug: 'animated', url: '/assets/animated' },
    { label: 'Feature Abstracts', slug: 'feature-abstracts', url: '/assets/feature-abstracts' },
    { label: '3D', slug: '3d', url: '/assets/3d' },
    { label: 'Illustrations', slug: 'illustrations', url: '/assets/illustrations' },
    { label: 'Photography', slug: 'photography', url: '/assets/photography' },
  ],
  stacks: [
    { label: 'Framer', slug: 'framer', url: '/stack/framer' },
    { label: 'Webflow', slug: 'webflow', url: '/stack/webflow' },
    { label: 'Next.js', slug: 'nextjs', url: '/stack/nextjs' },
    { label: 'WordPress', slug: 'wordpress', url: '/stack/wordpress' },
    { label: 'React', slug: 'react', url: '/stack/react' },
  ],
};

const BASE_URL = 'https://saaspo.com';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class SaaspoScraper {
  private browser: Browser | null = null;

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not launched');
    const context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    // Bot 検知を回避
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    return page;
  }

  /**
   * ホームページからフィルター選択肢を動的取得する。
   * 失敗した場合はフォールバック定義を返す。
   */
  async fetchFilters(): Promise<FilterOptions> {
    try {
      const page = await this.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      // ナビゲーションリンクからフィルターを収集する試み
      const links = await page.$$eval('a[href]', (els: Element[]) =>
        (els as HTMLAnchorElement[])
          .map((el) => ({ href: el.getAttribute('href') ?? '', text: el.textContent?.trim() ?? '' }))
          .filter((l) => l.href && l.text)
      );

      await page.context().close();

      const filters = buildFiltersFromLinks(links as { href: string; text: string }[]);

      // 十分な数が取得できていれば使用、そうでなければフォールバック
      if (
        filters.pagetypes.length >= 3 ||
        filters.styles.length >= 3 ||
        filters.industries.length >= 3
      ) {
        return filters;
      }
    } catch {
      // フォールバックに移行
    }

    return FALLBACK_FILTERS;
  }

  /**
   * フィルターに一致するデザイン一覧を取得する。
   */
  async fetchDesigns(
    filterSelections: {
      pagetypes: string[];
      styles: string[];
      industries: string[];
      assets: string[];
      stacks: string[];
    },
    filters: FilterOptions
  ): Promise<Design[]> {
    const urlsToVisit = buildFilterUrls(filterSelections, filters);

    if (urlsToVisit.length === 0) {
      // フィルター未選択の場合はトップページを使う
      urlsToVisit.push(BASE_URL);
    }

    const allDesigns: Design[] = [];
    const seenUrls = new Set<string>();

    for (const url of urlsToVisit.slice(0, 3)) {
      try {
        const designs = await this.fetchDesignsFromPage(url);
        for (const d of designs) {
          if (!seenUrls.has(d.url)) {
            seenUrls.add(d.url);
            allDesigns.push(d);
          }
        }
      } catch {
        // 次の URL を試す
      }
    }

    return allDesigns;
  }

  private async fetchDesignsFromPage(pageUrl: string): Promise<Design[]> {
    const page = await this.newPage();

    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      // デザインカードを取得 - 複数のセレクターを試す
      const designs = await page.evaluate((baseUrl: string) => {
        const results: { name: string; url: string; siteUrl: string; tags: string[]; thumbnailUrl: string }[] = [];

        // saaspo.com のカード構造を試みる（様々なパターン）
        const cardSelectors = [
          '[class*="card"]',
          '[class*="site"]',
          '[class*="item"]',
          'article',
          '.grid > div',
          '[class*="gallery"] > div',
        ];

        for (const selector of cardSelectors) {
          const cards = document.querySelectorAll(selector);
          if (cards.length < 3) continue;

          for (const card of Array.from(cards).slice(0, 50)) {
            const link = card.querySelector('a[href]') as HTMLAnchorElement | null;
            const img = card.querySelector('img') as HTMLImageElement | null;
            const name =
              card.querySelector('[class*="title"], [class*="name"], h2, h3')?.textContent?.trim() ??
              link?.textContent?.trim() ??
              '';

            if (!link || !name) continue;

            const href = link.getAttribute('href') ?? '';
            if (!href.startsWith('/') && !href.startsWith('http')) continue;

            const tags: string[] = [];
            card.querySelectorAll('[class*="tag"], [class*="badge"], [class*="label"]').forEach((t) => {
              const text = t.textContent?.trim();
              if (text && text.length < 30) tags.push(text);
            });

            results.push({
              name,
              url: href.startsWith('http') ? href : `${baseUrl}${href}`,
              siteUrl: '',
              tags,
              thumbnailUrl: img?.src ?? '',
            });
          }

          if (results.length >= 5) break;
        }

        return results;
      }, BASE_URL);

      await page.context().close();
      return designs as Design[];
    } catch (err) {
      await page.context().close();
      throw err;
    }
  }

  /**
   * 指定 URL のフルページスクリーンショットを撮影する
   */
  async takeScreenshot(targetUrl: string, outputDir: string, filename: string): Promise<string> {
    const page = await this.newPage();
    const outputPath = join(outputDir, filename);

    try {
      // saaspo.com の詳細ページから実サイト URL を取得する試み
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 実際のサイトへの外部リンクを探す
      const externalUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        for (const link of links) {
          const href = link.getAttribute('href') ?? '';
          if (href.startsWith('http') && !href.includes('saaspo.com')) {
            return href;
          }
        }
        return null;
      });

      // 実サイトのスクリーンショットを撮る
      const screenshotUrl = externalUrl ?? targetUrl;
      await page.goto(screenshotUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: outputPath,
        fullPage: false,
        clip: { x: 0, y: 0, width: 1440, height: 900 },
      });

      await page.context().close();
      return outputPath;
    } catch {
      // フォールバック: 現在のページをキャプチャして続行
      try { await page.screenshot({ path: outputPath }); } catch { /* ignore */ }
      await page.context().close();
      return outputPath;
    }
  }
}

/**
 * ナビゲーションリンクからフィルター構造を構築する
 */
function buildFiltersFromLinks(links: { href: string; text: string }[]): FilterOptions {
  const filters: FilterOptions = {
    pagetypes: [],
    styles: [],
    industries: [],
    assets: [],
    stacks: [],
  };

  for (const { href, text } of links) {
    if (!text || text.length > 50) continue;

    if (href.startsWith('/page-types/')) {
      const slug = href.replace('/page-types/', '');
      filters.pagetypes.push({ label: text, slug, url: href });
    } else if (href.startsWith('/style/')) {
      const slug = href.replace('/style/', '');
      filters.styles.push({ label: text, slug, url: href });
    } else if (href.startsWith('/industry/')) {
      const slug = href.replace('/industry/', '');
      filters.industries.push({ label: text, slug, url: href });
    } else if (href.startsWith('/assets/')) {
      const slug = href.replace('/assets/', '');
      filters.assets.push({ label: text, slug, url: href });
    } else if (href.startsWith('/stack/')) {
      const slug = href.replace('/stack/', '');
      filters.stacks.push({ label: text, slug, url: href });
    }
  }

  return filters;
}

/**
 * フィルター選択から訪問すべき URL リストを構築する
 */
function buildFilterUrls(
  selections: { pagetypes: string[]; styles: string[]; industries: string[]; assets: string[]; stacks: string[] },
  filters: FilterOptions
): string[] {
  const urls: string[] = [];

  const addUrls = (slugs: string[], items: FilterItem[]) => {
    for (const slug of slugs) {
      const item = items.find((f) => f.slug === slug);
      if (item) urls.push(`${BASE_URL}${item.url}`);
    }
  };

  addUrls(selections.pagetypes, filters.pagetypes);
  addUrls(selections.styles, filters.styles);
  addUrls(selections.industries, filters.industries);
  addUrls(selections.assets, filters.assets);
  addUrls(selections.stacks, filters.stacks);

  return [...new Set(urls)];
}

export { FALLBACK_FILTERS };
