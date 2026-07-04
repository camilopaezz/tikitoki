import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeConcatFile(images: string[], outPath: string): void {
  const lines = images.map((img) => `file '${img.replace(/'/g, "'\\'")}'`);
  writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

export function concatFilePath(jobDir: string): string {
  return join(jobDir, 'concat.txt');
}
