// Builds dist/snippets.json from a folder of snippet files and copies the search page.
// No dependencies: run with `node build-index.js`.
//
// SNIPPETS_DIR: folder to index (the workflow checks the source repo out into ./source)
const fs = require('fs');
const path = require('path');

const SRC = process.env.SNIPPETS_DIR || 'source';
const OUT = 'dist';
const EXT_LANG = { '.php': 'php', '.css': 'css', '.js': 'javascript' };
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'vendor']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(full);
    return EXT_LANG[path.extname(entry.name)] ? [full] : [];
  });
}

const slugTag = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const humanize = (s) => {
  const t = s.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function parse(file) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  const folders = rel.split('/').slice(0, -1);
  const meta = {};
  let description = '';

  // Look at the first comment in the file (/** */, /* */ or // lines).
  const block = src.match(/\/\*\*?([\s\S]*?)\*\//);
  const lineComments = src.match(/^(?:<\?php\s*)?((?:\s*\/\/.*\n)+)/);
  const commentText = block ? block[1] : lineComments ? lineComments[1] : '';

  const prose = [];
  for (const raw of commentText.split('\n')) {
    const line = raw.replace(/^\s*(\*|\/\/)\s?/, '').trim();
    const m = line.match(/^([A-Za-z][\w ]{0,20}):\s*(.+)$/);
    if (m && ['title', 'description', 'tags'].includes(m[1].trim().toLowerCase())) {
      meta[m[1].trim().toLowerCase()] = m[2].trim();
    } else if (line && !line.startsWith('@')) {
      prose.push(line);
    }
  }
  description = meta.description || prose.join(' ').slice(0, 220);

  // Only strip the header from the displayed code if it was a metadata header.
  if (block && (meta.title || meta.tags)) src = src.replace(block[0], '');

  const code = src.replace(/^\s*<\?php\s*/, '').replace(/\?>\s*$/, '').trim();

  const headerTags = (meta.tags || '').split(',').map((t) => slugTag(t)).filter(Boolean);
  const folderTags = folders.map(slugTag).filter(Boolean);
  const slug = rel.replace(/\.[^.]+$/, '').replace(/\//g, '--');

  return {
    id: slug,
    slug,
    title: meta.title || humanize(path.basename(file, path.extname(file))),
    description,
    tags: [...new Set([...folderTags, ...headerTags])],
    lang: EXT_LANG[path.extname(file)],
    code,
  };
}

if (!fs.existsSync(SRC)) {
  console.error(`Snippet folder "${SRC}" not found`);
  process.exit(1);
}

const snippets = walk(SRC).map(parse).sort((a, b) => a.title.localeCompare(b.title));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'snippets.json'), JSON.stringify(snippets));
fs.copyFileSync(path.join('site', 'index.html'), path.join(OUT, 'index.html'));

console.log(`Indexed ${snippets.length} snippets from ${SRC} into ${OUT}/snippets.json`);
