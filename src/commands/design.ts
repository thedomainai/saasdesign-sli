import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { SaaspoScraper } from '../scraper/saaspo.js';
import { generateDesignSystem, generateProductHTML } from '../ai/claude.js';
import {
  promptFilters,
  promptDesignSelection,
  promptProjectContext,
  confirmContinue,
} from '../utils/prompt.js';
import { analyzeProject } from '../utils/fs.js';
import type { Design } from '../scraper/saaspo.js';

export async function runDesignCommand(targetDir: string): Promise<void> {
  const absoluteTarget = resolve(targetDir);

  // ANTHROPIC_API_KEY チェック
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\n  ANTHROPIC_API_KEY が設定されていません。'));
    console.error(chalk.gray('  export ANTHROPIC_API_KEY="sk-ant-..." を実行してください。'));
    process.exit(1);
  }

  console.log('');
  console.log(chalk.bold.cyan('  saasdesign CLI'));
  console.log(chalk.gray('  SaaS デザインインスピレーション → デザインシステム再構築 → プロダクト実装'));
  console.log('');

  // ─────────────────────────────────────────────
  // Step 1: saaspo.com からフィルター取得
  // ─────────────────────────────────────────────
  const scraper = new SaaspoScraper();
  let filters;

  {
    const spinner = ora('saaspo.com に接続中...').start();
    try {
      await scraper.launch();
      filters = await scraper.fetchFilters();
      spinner.succeed(`フィルター取得完了`);
    } catch (err) {
      spinner.warn('動的取得に失敗。フォールバックフィルターを使用します。');
      const { FALLBACK_FILTERS } = await import('../scraper/saaspo.js');
      filters = FALLBACK_FILTERS;
    }
  }

  // ─────────────────────────────────────────────
  // Step 2: フィルター選択
  // ─────────────────────────────────────────────
  console.log(chalk.bold('\n📂 フィルターを選択してください（スキップ可）'));
  const filterSelections = await promptFilters(filters);

  const hasFilters =
    filterSelections.pagetypes.length > 0 ||
    filterSelections.styles.length > 0 ||
    filterSelections.industries.length > 0 ||
    filterSelections.assets.length > 0 ||
    filterSelections.stacks.length > 0;

  // ─────────────────────────────────────────────
  // Step 3: デザイン一覧取得
  // ─────────────────────────────────────────────
  let designs: Design[] = [];

  {
    const spinner = ora('デザインを取得中...').start();
    try {
      designs = await scraper.fetchDesigns(filterSelections, filters);
      spinner.succeed(`${designs.length} 件のデザインを取得`);
    } catch (err) {
      spinner.fail('デザイン取得に失敗しました');
      console.error(chalk.red(String(err)));
    }
  }

  if (designs.length === 0) {
    console.log(chalk.yellow('\nデザインが見つかりませんでした。'));
    console.log(chalk.gray('フィルターを変えるか、フィルターなしで再試行してください。'));
    await scraper.close();
    return;
  }

  // ─────────────────────────────────────────────
  // Step 4: デザイン選択
  // ─────────────────────────────────────────────
  console.log(chalk.bold('\n🎨 デザインを選択してください'));
  const selectedDesigns = await promptDesignSelection(designs);

  if (selectedDesigns.length === 0) {
    console.log(chalk.yellow('デザインが選択されませんでした。'));
    await scraper.close();
    return;
  }

  console.log(chalk.green(`\n✓ ${selectedDesigns.length} 件を選択しました`));

  // ─────────────────────────────────────────────
  // Step 5: プロジェクト情報入力
  // ─────────────────────────────────────────────
  console.log(chalk.bold('\n📝 プロジェクト情報を入力してください'));
  const projectContext = await promptProjectContext();

  // ─────────────────────────────────────────────
  // Step 6: スクリーンショット取得
  // ─────────────────────────────────────────────
  const timestamp = Date.now();
  const screenshotDir = `/tmp/saasdesign/${timestamp}`;
  mkdirSync(screenshotDir, { recursive: true });

  const screenshotPaths: string[] = [];

  {
    const spinner = ora(`スクリーンショットを取得中 (${selectedDesigns.length} 件)...`).start();
    for (let i = 0; i < selectedDesigns.length; i++) {
      const design = selectedDesigns[i];
      const filename = `design-${i + 1}.png`;
      spinner.text = `スクリーンショット取得中 (${i + 1}/${selectedDesigns.length}): ${design.name}`;
      try {
        const path = await scraper.takeScreenshot(design.url, screenshotDir, filename);
        screenshotPaths.push(path);
      } catch {
        spinner.warn(`スクリーンショット失敗: ${design.name}`);
      }
    }
    spinner.succeed(`スクリーンショット取得完了 (${screenshotPaths.length} 件)`);
  }

  await scraper.close();

  // ─────────────────────────────────────────────
  // Step 7: 既存デザインシステム解析
  // ─────────────────────────────────────────────
  {
    const spinner = ora('既存デザインシステムを解析中...').start();
    const existingDS = analyzeProject(absoluteTarget);
    spinner.succeed(`解析完了: ${existingDS.summary}`);

    // ─────────────────────────────────────────────
    // Step 8: デザインシステム再構築（Claude API）
    // ─────────────────────────────────────────────
    console.log('');
    const spinner2 = ora('デザインシステムを再構築中... (Claude opus-4-6)').start();

    let designSystemMd: string;
    try {
      designSystemMd = await generateDesignSystem({
        screenshotPaths,
        existingDS,
        context: {
          productName: projectContext.productName,
          description: projectContext.description,
          pageType: projectContext.pageType,
          selectedDesigns: selectedDesigns.map((d) => ({
            name: d.name,
            url: d.url,
            tags: d.tags,
          })),
        },
      });
      spinner2.succeed('デザインシステム再構築完了');
    } catch (err) {
      spinner2.fail('デザインシステム生成に失敗しました');
      console.error(chalk.red(String(err)));
      return;
    }

    // ─────────────────────────────────────────────
    // Step 9: プロダクト実装（Claude API）
    // ─────────────────────────────────────────────
    const spinner3 = ora('プロダクト HTML を実装中... (Claude opus-4-6)').start();

    let productHTML: string;
    try {
      productHTML = await generateProductHTML({
        designSystemMd,
        pageType: projectContext.pageType,
        productName: projectContext.productName,
        description: projectContext.description,
        screenshotPaths,
      });
      spinner3.succeed('プロダクト実装完了');
    } catch (err) {
      spinner3.fail('プロダクト実装に失敗しました');
      console.error(chalk.red(String(err)));
      return;
    }

    // ─────────────────────────────────────────────
    // Step 10: ファイル書き出し
    // ─────────────────────────────────────────────
    if (!existsSync(absoluteTarget)) {
      mkdirSync(absoluteTarget, { recursive: true });
    }

    const dsMdPath = join(absoluteTarget, 'design-system.md');
    const indexHtmlPath = join(absoluteTarget, 'index.html');

    writeFileSync(dsMdPath, designSystemMd, 'utf-8');
    writeFileSync(indexHtmlPath, productHTML, 'utf-8');

    // ─────────────────────────────────────────────
    // 完了メッセージ
    // ─────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold.green('✅ 完了！'));
    console.log('');
    console.log(chalk.white('生成されたファイル:'));
    console.log(chalk.cyan(`  📄 ${dsMdPath}`));
    console.log(chalk.cyan(`  🌐 ${indexHtmlPath}`));
    console.log('');
    console.log(chalk.gray(`スクリーンショット: ${screenshotDir}`));
    console.log('');
    console.log(chalk.bold('ブラウザで確認:'));
    console.log(chalk.yellow(`  open ${indexHtmlPath}`));
    console.log('');
  }
}
