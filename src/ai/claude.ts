import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import type { ExistingDesignSystem } from '../utils/fs.js';

const MODEL = 'claude-opus-4-6';

/**
 * 既存の design-system.md を参照例として読み込む。
 * SAASDESIGN_REFERENCE_DS 環境変数でパスを指定できる。
 */
function loadReferenceDS(): string {
  const refPath = process.env.SAASDESIGN_REFERENCE_DS;
  if (refPath && existsSync(refPath)) {
    const content = readFileSync(refPath, 'utf-8');
    return content.split('\n').slice(0, 200).join('\n');
  }
  return '';
}

export interface DesignSystemInput {
  screenshotPaths: string[];
  existingDS: ExistingDesignSystem;
  context: {
    productName: string;
    description: string;
    pageType: string;
    selectedDesigns: { name: string; url: string; tags: string[] }[];
  };
}

export async function generateDesignSystem(input: DesignSystemInput): Promise<string> {
  const client = new Anthropic();
  const referenceDS = loadReferenceDS();

  // スクリーンショットを base64 に変換
  const imageContents: Anthropic.ImageBlockParam[] = [];
  for (const screenshotPath of input.screenshotPaths.slice(0, 5)) {
    try {
      const buffer = readFileSync(screenshotPath);
      const base64 = buffer.toString('base64');
      imageContents.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64,
        },
      });
    } catch {
      // スクリーンショット読み込み失敗は無視
    }
  }

  let existingContext = '';
  if (input.existingDS.designSystemMd) {
    existingContext = `\n## 既存デザインシステム（参照・統合する）\n\n${input.existingDS.designSystemMd.slice(0, 3000)}`;
  } else if (input.existingDS.cssVariables) {
    existingContext = `\n## 既存 CSS 変数\n\n${input.existingDS.cssVariables.slice(0, 2000)}`;
  }

  const selectedDesignsList = input.context.selectedDesigns
    .map((d) => `- ${d.name}: ${d.tags.join(', ')}`)
    .join('\n');

  const systemPrompt = `あなたはプロダクトデザイナーです。
提供された SaaS デザインインスピレーションのスクリーンショットと既存のデザインシステムを分析し、
新しいプロダクト向けの design-system.md を生成してください。

## 出力フォーマット

以下の構造の Markdown で出力してください：

\`\`\`markdown
# {ProductName} Design System

## 1. デザイン原則
（4〜6 項目の原則を表形式で）

## 2. カラーシステム
（カラートークン定義。CSS custom property 形式で --token-name: value）

## 3. タイポグラフィ
（フォントファミリー、スケール定義）

## 4. スペーシング
（spacing スケール）

## 5. コンポーネント仕様
（Button, Card, Nav 等の基本仕様）

## 6. CSS 実装
（:root 変数ブロック + 基本コンポーネント CSS）
\`\`\`

スクリーンショットから色・フォント・レイアウトの傾向を読み取り、一貫性のあるシステムを設計してください。`;

  const userContentBlocks: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `
## プロダクト情報
- 名前: ${input.context.productName}
- 説明: ${input.context.description}
- ページタイプ: ${input.context.pageType}

## 参照したデザイン
${selectedDesignsList}

${existingContext}

## 参照フォーマット例（構造のみ参考。内容は新規設計）
${referenceDS ? referenceDS.slice(0, 500) : '（参照ファイルなし）'}

上記の情報とスクリーンショットをもとに、${input.context.productName} 向けの design-system.md を生成してください。
日本語のコメントを含めてください。
`,
    },
    ...imageContents,
  ];

  // ストリーミングで受信（タイムアウト回避、generateProductHTML と統一）
  let result = '';
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: userContentBlocks }],
    system: systemPrompt,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      result += chunk.delta.text;
    }
  }

  return result;
}

export interface ProductHTMLInput {
  designSystemMd: string;
  pageType: string;
  productName: string;
  description: string;
  screenshotPaths: string[];
}

export async function generateProductHTML(input: ProductHTMLInput): Promise<string> {
  const client = new Anthropic();

  // スクリーンショット（最大 3 枚）
  const imageContents: Anthropic.ImageBlockParam[] = [];
  for (const screenshotPath of input.screenshotPaths.slice(0, 3)) {
    try {
      const buffer = readFileSync(screenshotPath);
      const base64 = buffer.toString('base64');
      imageContents.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64,
        },
      });
    } catch {
      // ignore
    }
  }

  const systemPrompt = `あなたはフロントエンドエンジニアです。
デザインシステムの仕様とインスピレーションスクリーンショットをもとに、
単一の index.html（Vanilla HTML/CSS）でプロダクトページを実装してください。

## 要件
- 単一 HTMLファイル（外部 CSS/JS ファイルなし）
- <style> タグ内にデザインシステムの CSS 変数を定義
- レスポンシブ対応（mobile / tablet / desktop）
- 実際のコンテンツ（ダミーでよいが具体的に）
- モダンで洗練されたビジュアル
- セマンティック HTML5
- アクセシビリティ基本対応（alt, aria-label 等）

完全な HTML ファイルを出力してください。マークダウンコードブロックで囲まずに、
<!DOCTYPE html> から始まる HTML をそのまま出力してください。`;

  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `
## プロダクト
- 名前: ${input.productName}
- 説明: ${input.description}
- ページタイプ: ${input.pageType}

## デザインシステム
${input.designSystemMd.slice(0, 4000)}

スクリーンショットのデザイントレンドを参考に、上記デザインシステムを適用した ${input.pageType} ページを実装してください。
`,
    },
    ...imageContents,
  ];

  // ストリーミングで受信（タイムアウト回避）
  let html = '';
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: userContent }],
    system: systemPrompt,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      html += chunk.delta.text;
      process.stdout.write('.');
    }
  }
  process.stdout.write('\n');

  const finalMessage = await stream.finalMessage();
  if (finalMessage.stop_reason === 'max_tokens') {
    console.warn('\n⚠️  出力が最大トークン数に達しました。HTMLが不完全な可能性があります。');
  }

  // コードブロックが含まれていた場合は除去
  html = html.trim();
  if (html.startsWith('```')) {
    html = html.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  }
  return html;
}
