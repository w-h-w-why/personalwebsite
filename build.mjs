/**
 * 无依赖静态构建：共享模板和站点配置生成根目录 HTML，兼容现有 Pages 根目录发布。
 * --deploy 仅将 HTML、样式、脚本和图片放入 dist；--check 检查源文件与已提交 HTML 的漂移。
 * 年份/任职时长按 Asia/Shanghai 生成可读后备文本，site.js 在访问时继续更新。
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const flags = new Set(process.argv.slice(2));
if ([...flags].some(flag => !['--check', '--deploy'].includes(flag)) || flags.size > 1) {
  throw new Error('Usage: node build.mjs [--check | --deploy]');
}
const deploy = flags.has('--deploy');
const output = deploy ? resolve(root, 'dist') : root;
const config = JSON.parse(await readFile(resolve(root, 'site.config.json'), 'utf8'));
const layout = await readFile(resolve(root, 'templates/layout.html'), 'utf8');
if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?\/$/.test(config.url)) throw new Error('site.config.json url must be an absolute URL ending in /');
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(config.workStart)) throw new Error('site.config.json workStart must use YYYY-MM');
if (!Array.isArray(config.pages) || config.pages.length === 0) throw new Error('site.config.json pages must be a non-empty array');
const pageFiles = new Set();
for (const page of config.pages) {
  if (!page || typeof page.file !== 'string' || page.file !== page.file.split(/[\\/]/).pop() || !page.file.endsWith('.html')) throw new Error(`Invalid page file: ${page?.file}`);
  if (pageFiles.has(page.file)) throw new Error(`Duplicate page file: ${page.file}`);
  pageFiles.add(page.file);
  for (const field of ['label', 'icon', 'title', 'description']) if (typeof page[field] !== 'string' || !page[field]) throw new Error(`Missing ${field} for ${page.file}`);
}
if (!pageFiles.has('index.html')) throw new Error('site.config.json must include index.html');
const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
const [year, month] = calendar.split('-').map(Number);
const [startYear, startMonth] = config.workStart.split('-').map(Number);
const months = Math.max(0, (year - startYear) * 12 + month - startMonth);
const experience = [months >= 12 ? `${Math.floor(months / 12)} 年` : '', months % 12 || months === 0 ? `${months % 12} 个月` : ''].filter(Boolean).join(' ');

/**
 * 转义配置中的文本/属性值，避免邮箱、描述或品牌中的标点破坏 HTML。
 * @param {string|number} value 可信配置的标量值；空字符串允许，返回安全 HTML 文本。
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/**
 * 展开有限的命名占位符；不执行代码，也不解析正文里的 HTML。
 * @param {string} template 共享外壳或正文模板。
 * @param {Record<string,string>} values 已转义的标量或可信模板生成的 HTML。
 * @returns {string} 展开后的内容；缺少键时抛错，让构建在发布前暴露拼写错误。
 */
function render(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template value: ${key}`);
    return values[key];
  });
}

// dist 是唯一允许清空的固定产物目录；核对边界，避免参数或工作目录误删源文件。
if (deploy) {
  if (dirname(output) !== root || output === root) throw new Error('Invalid deployment directory');
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
}

for (const page of config.pages) {
  const values = Object.fromEntries(Object.entries({ NAME: config.name, ROLE: config.role, PHONE: config.phone, EMAIL: config.email, WORK_START: config.workStart, YEAR: year, EXPERIENCE: experience }).map(([key, value]) => [key, escapeHtml(value)]));
  const content = await readFile(resolve(root, 'templates/pages', page.file), 'utf8');
  // 顶部导航只输出文字链接，保持排版简洁；site.config.json 里的图标字段保留，便于未来换用图标样式。
  const nav = config.pages.map(item => `      <a${item.file === page.file ? ' class="current" aria-current="page"' : ''} href="${escapeHtml(item.file)}">${escapeHtml(item.label)}</a>`).join('\n');
  const html = render(layout, {
    ...values,
    TITLE: escapeHtml(`${config.name} · ${page.title}`),
    DESCRIPTION: escapeHtml(page.description),
    URL: escapeHtml(new URL(page.file === 'index.html' ? './' : page.file, config.url).href),
    IMAGE: escapeHtml(new URL('assets/social-preview.jpg', config.url).href),
    PAGE_CLASS: page.file === 'index.html' ? ' home-page' : '',
    NAV: nav,
    CONTENT: render(content, values).trim().replace(/^[ \t]+$/gm, '').split('\n').map(line => line ? `      ${line}` : '').join('\n'),
  });
  const target = resolve(output, page.file);
  const outputPrefix = output.endsWith(sep) ? output : `${output}${sep}`;
  if (!target.startsWith(outputPrefix)) throw new Error(`Invalid output path: ${page.file}`);
  if (flags.has('--check')) {
    // 忽略平台换行差异；同一月内的内容应完全相同，新增年月自然要求重建后备文本。
    const existing = await readFile(target, 'utf8').catch(() => '');
    if (existing.replaceAll('\r\n', '\n') !== html) throw new Error(`${page.file} needs rebuilding: node build.mjs`);
  } else {
    await writeFile(target, html, 'utf8');
  }
}
if (deploy) {
  for (const file of ['pages.css', 'site.js', 'assets']) {
    await cp(resolve(root, file), resolve(output, file), { recursive: true });
  }
}
console.log(`${flags.has('--check') ? 'Checked' : 'Built'} ${config.pages.length} pages (${year}-${String(month).padStart(2, '0')})`);
