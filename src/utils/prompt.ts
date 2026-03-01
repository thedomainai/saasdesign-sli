import { checkbox, input, select } from '@inquirer/prompts';
import type { FilterOptions, Design } from '../scraper/saaspo.js';

export interface FilterSelections {
  pagetypes: string[];
  styles: string[];
  industries: string[];
  assets: string[];
  stacks: string[];
}

export async function promptFilters(availableFilters: FilterOptions): Promise<FilterSelections> {
  console.log('');

  const pagetypes = await checkbox({
    message: 'Page Type を選択（スキップ可・スペースでチェック）',
    choices: availableFilters.pagetypes.map((f) => ({ name: f.label, value: f.slug })),
    pageSize: 12,
  });

  const styles = await checkbox({
    message: 'Style を選択（スキップ可）',
    choices: availableFilters.styles.map((f) => ({ name: f.label, value: f.slug })),
    pageSize: 12,
  });

  const industries = await checkbox({
    message: 'Industry を選択（スキップ可）',
    choices: availableFilters.industries.map((f) => ({ name: f.label, value: f.slug })),
    pageSize: 12,
  });

  const assets = await checkbox({
    message: 'Assets を選択（スキップ可）',
    choices: availableFilters.assets.map((f) => ({ name: f.label, value: f.slug })),
    pageSize: 12,
  });

  const stacks = await checkbox({
    message: 'Stack を選択（スキップ可）',
    choices: availableFilters.stacks.map((f) => ({ name: f.label, value: f.slug })),
    pageSize: 12,
  });

  return { pagetypes, styles, industries, assets, stacks };
}

export async function promptDesignSelection(designs: Design[]): Promise<Design[]> {
  if (designs.length === 0) {
    console.log('デザインが見つかりませんでした。');
    return [];
  }

  const selected = await checkbox({
    message: `デザインを選択（最大 10 件）`,
    choices: designs.map((d) => ({
      name: `${d.name}  ${d.tags.slice(0, 3).join(' · ')}`,
      value: d,
      short: d.name,
    })),
    validate: (items) => {
      if (items.length === 0) return '1件以上選択してください';
      if (items.length > 10) return '10件以内で選択してください';
      return true;
    },
    pageSize: 15,
  });

  return selected as Design[];
}

export async function promptProjectContext(): Promise<{
  productName: string;
  description: string;
  pageType: string;
}> {
  const productName = await input({
    message: 'プロダクト名を入力',
    default: 'My SaaS',
  });

  const description = await input({
    message: 'プロダクトの説明を入力（1〜2文）',
    default: 'A modern SaaS platform',
  });

  const pageType = await select({
    message: '実装するページタイプ',
    choices: [
      { name: 'Landing Page（ランディングページ）', value: 'landing' },
      { name: 'Pricing Page（料金ページ）', value: 'pricing' },
      { name: 'Product Page（プロダクトページ）', value: 'product' },
      { name: 'About Page（会社概要）', value: 'about' },
      { name: 'Blog（ブログ）', value: 'blog' },
      { name: 'Dashboard（ダッシュボード）', value: 'dashboard' },
    ],
    default: 'landing',
  });

  return { productName, description, pageType };
}

