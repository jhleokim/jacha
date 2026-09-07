import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const target='public/vendor/ocr';
await mkdir(`${target}/lang`,{recursive:true});
const entries=[];
async function copy(source,name){await copyFile(source,`${target}/${name}`);entries.push(name);}
for(const name of ['tesseract.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])await copy(`node_modules/tesseract.js/dist/${name}`,name);
await copy('node_modules/tesseract.js/LICENSE.md','LICENSE-tesseract.js');
await copy('node_modules/tesseract.js-core/LICENSE','LICENSE-tesseract.js-core');
for(const variant of ['','-simd','-lstm','-simd-lstm']){
  // wasm.js embeds its own WASM binary; there is no extra .wasm network request.
  const name=`tesseract-core${variant}.wasm.js`;
  await copy(`node_modules/tesseract.js-core/${name}`,name);
}
for(const lang of ['kor','eng']){
  const response=await fetch(`https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
  if(!response.ok)throw new Error(`Language download ${lang}: ${response.status}`);
  const name=`lang/${lang}.traineddata.gz`;
  await writeFile(`${target}/${name}`,new Uint8Array(await response.arrayBuffer()));entries.push(name);
}
const manifest={tesseract:'5.1.1',core:JSON.parse(await readFile('node_modules/tesseract.js-core/package.json','utf8')).version,languages:'@tesseract.js-data 4.0.0_best_int',files:{}};
for(const name of entries){const data=await readFile(`${target}/${name}`);manifest.files[name]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
await writeFile(`${target}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await writeFile(`${target}/NOTICE.txt`,'Tesseract.js 5.1.1 and tesseract.js-core: Apache-2.0; bundled LICENSE files apply.\nLanguage models: https://github.com/naptha/tessdata / https://github.com/tesseract-ocr/tessdata_best (Apache-2.0).\nSources are copied without modification. Language assets are used locally; receipt images are never sent to a recognition service.\n');
console.log('Vendored OCR assets:',Object.values(manifest.files).reduce((sum,f)=>sum+f.bytes,0),'bytes');
