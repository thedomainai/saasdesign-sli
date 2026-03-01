#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { runDesignCommand } from './commands/design.js';

const program = new Command();

program
  .name('saasdesign')
  .description(
    'saaspo.com から SaaS デザインインスピレーションを参照し、デザインシステムを再構築してプロダクトを実装する CLI'
  )
  .version('0.1.0');

program
  .command('design [target-dir]', { isDefault: true })
  .description('デザインシステム再構築とプロダクト実装（デフォルトコマンド）')
  .action(async (targetDir: string = '.') => {
    try {
      await runDesignCommand(targetDir);
    } catch (err) {
      console.error(chalk.red('\nエラーが発生しました:'));
      console.error(chalk.red(String(err)));
      process.exit(1);
    }
  });

// ヘルプに使い方を追加
program.addHelpText(
  'after',
  `
${chalk.bold('使い方:')}
  ${chalk.cyan('saasdesign')}                    カレントディレクトリに出力
  ${chalk.cyan('saasdesign ./my-project')}        指定ディレクトリに出力
  ${chalk.cyan('saasdesign design ./my-project')} 同上（明示的）

${chalk.bold('フロー:')}
  1. saaspo.com フィルター選択（pagetype, style, industry, assets, stack）
  2. 一致するデザインを一覧表示
  3. 参照デザインを複数選択
  4. プロジェクト情報入力
  5. Playwright でスクリーンショット取得
  6. Claude API でデザインシステム再構築 → design-system.md
  7. Claude API でプロダクト実装 → index.html

${chalk.bold('環境変数:')}
  ANTHROPIC_API_KEY   Anthropic API キー（必須）
`
);

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(String(err)));
  process.exit(1);
});
