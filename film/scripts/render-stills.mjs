import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
await mkdir('output/stills',{recursive:true});
const serveUrl=await bundle({entryPoint:'src/index.tsx'});
const browserExecutable='/Users/ho7/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const puppeteerInstance=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
const options={serveUrl,browserExecutable,puppeteerInstance,chromiumOptions:{gl:'angle'}};
const composition=await selectComposition({...options,id:'DurumitFilm'});
const seconds=[2,8.7,12.5,17.9,23.5,26.7,31,35,38,41,46,50,54,57,60,63.5,65.5,69,73.2,77.2,82,85,88.3,92,97,103];
const receipts=[];
for(const sec of seconds){
 const frame=Math.round(sec*30),output=`output/stills/${String(frame).padStart(4,'0')}.jpg`;
 await renderStill({...options,composition,frame,output,imageFormat:'jpeg',jpegQuality:88});
 receipts.push({sec,frame,output});console.log('frame',frame,sec+'s');
}
const tiles=[];for(let i=0;i<receipts.length;i++)tiles.push({input:await sharp(receipts[i].output).resize(480,270).toBuffer(),left:i%4*480,top:Math.floor(i/4)*300});
await sharp({create:{width:1920,height:Math.ceil(receipts.length/4)*300,channels:3,background:'#092c33'}}).composite(tiles).jpeg({quality:90}).toFile('output/contact-sheet.jpg');
await writeFile('output/stills/manifest.json',JSON.stringify(receipts,null,2));
console.log('contact sheet ready');
await puppeteerInstance.close({silent:true});
