import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

export interface ExistingDesignSystem {
  designSystemMd: string | null;
  cssVariables: string | null;
  tailwindConfig: string | null;
  summary: string;
}

/**
 * 対象プロジェクトから既存のデザインシステム情報を収集する
 */
export function analyzeProject(targetDir: string): ExistingDesignSystem {
  const result: ExistingDesignSystem = {
    designSystemMd: null,
    cssVariables: null,
    tailwindConfig: null,
    summary: '',
  };

  if (!existsSync(targetDir)) {
    result.summary = '対象ディレクトリが存在しません。ゼロから生成します。';
    return result;
  }

  // design-system.md を探す
  const dsMd = findFile(targetDir, 'design-system.md', 3);
  if (dsMd) {
    result.designSystemMd = readFileSync(dsMd, 'utf-8');
  }

  // CSS/SCSS ファイルから変数を抽出
  const cssVars = extractCSSVariables(targetDir);
  if (cssVars) {
    result.cssVariables = cssVars;
  }

  // Tailwind config を探す
  const tailwindFiles = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs'];
  for (const filename of tailwindFiles) {
    const twPath = join(targetDir, filename);
    if (existsSync(twPath)) {
      result.tailwindConfig = readFileSync(twPath, 'utf-8');
      break;
    }
  }

  // サマリ生成
  const parts: string[] = [];
  if (result.designSystemMd) parts.push('design-system.md あり');
  if (result.cssVariables) parts.push('CSS 変数あり');
  if (result.tailwindConfig) parts.push('Tailwind config あり');
  result.summary = parts.length > 0 ? parts.join(', ') : '既存デザインシステムなし';

  return result;
}

/**
 * ディレクトリを再帰的に探索してファイルを見つける
 */
function findFile(dir: string, filename: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isFile() && entry === filename) return fullPath;
      if (stat.isDirectory()) {
        const found = findFile(fullPath, filename, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch {
    // ignore permission errors
  }

  return null;
}

/**
 * CSS ファイルから :root 変数を収集する
 */
function extractCSSVariables(dir: string): string | null {
  const cssFiles: string[] = [];
  collectFiles(dir, ['.css', '.scss'], cssFiles, 3);

  const vars: string[] = [];
  for (const file of cssFiles.slice(0, 5)) {
    try {
      const content = readFileSync(file, 'utf-8');
      const rootBlock = content.match(/:root\s*\{([^}]+)\}/g);
      if (rootBlock) {
        vars.push(`/* ${file} */`);
        vars.push(rootBlock[0]);
      }
    } catch {
      // ignore
    }
  }

  return vars.length > 0 ? vars.join('\n\n') : null;
}

function collectFiles(
  dir: string,
  extensions: string[],
  result: string[],
  maxDepth: number
): void {
  if (maxDepth <= 0) return;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isFile() && extensions.includes(extname(entry))) {
        result.push(fullPath);
      } else if (stat.isDirectory()) {
        collectFiles(fullPath, extensions, result, maxDepth - 1);
      }
    }
  } catch {
    // ignore
  }
}
