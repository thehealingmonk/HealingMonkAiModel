import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function findTs(base) {
  if (/\.(ts|tsx|mjs|js|json)$/.test(base) && existsSync(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  // next has no package exports map, so ESM needs the explicit .js entry.
  if (specifier === 'next/server' || specifier === 'next/navigation') return next(specifier + '.js', context);
  if (specifier.startsWith('@/')) {
    const file = findTs(path.join(SRC, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parent = fileURLToPath(context.parentURL);
    if (/\.(ts|tsx)$/.test(parent)) {
      const file = findTs(path.resolve(path.dirname(parent), specifier));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (/\.(ts|tsx)$/.test(url)) {
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
