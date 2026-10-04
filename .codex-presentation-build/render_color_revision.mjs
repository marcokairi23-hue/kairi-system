import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';
for (const style of ['nature', 'modern']) {
  const presentation = await PresentationFile.importPptx(await FileBlob.load(path.resolve(`presentation_output/kinesiology-practical-${style}-single-color.pptx`)));
  const dir = path.resolve(`.codex-presentation-build/rendered-${style}-single-color`);
  await fs.mkdir(dir, {recursive:true});
  for (const [i, slide] of presentation.slides.items.entries()) {
    const png = await slide.export({format:'png',scale:1});
    await fs.writeFile(path.join(dir,`slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));
  }
  console.log(`${style}: eight slides rendered`);
}
