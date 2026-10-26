import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const MAX_LINES = 400;
const ROOTS = ['src', 'scripts', 'tests'];
const CHECKED = new Set(['.ts', '.css', '.html']);
const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z]+)+$/;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return CHECKED.has(path.extname(entry.name)) ? [full] : [];
  });
}

function commentProblems(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const starts = new Set<number>();
  const collect = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ];
    for (const range of ranges) starts.add(range.pos);
    node.getChildren(source).forEach(collect);
  };
  collect(source);
  return [...starts].map((start) => `${file}:${source.getLineAndCharacterOfPosition(start).line + 1} has a comment`);
}

function cssCommentProblems(file: string, text: string): string[] {
  return text.includes('/*') ? [`${file} has a CSS comment`] : [];
}

function check(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const problems: string[] = [];
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (lines > MAX_LINES) problems.push(`${file} has ${lines} lines (max ${MAX_LINES})`);
  if (!FILE_NAME.test(path.basename(file))) problems.push(`${file} is not a kebab-case file name`);
  if (!text.trim()) problems.push(`${file} is empty`);
  if (file.endsWith('.ts')) problems.push(...commentProblems(file, text));
  if (file.endsWith('.css')) problems.push(...cssCommentProblems(file, text));
  return problems;
}

const problems = ROOTS.flatMap(walk).flatMap(check);
for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
console.info('hygiene: all files pass');
