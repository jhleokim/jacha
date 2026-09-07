// Local UI check with the same CSP as deployed assets. No API/receipt relay calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('public');
const headers=Object.fromEntries((await readFile('public/_headers','utf8')).split('\n').filter(l=>/^  [A-Za-z-]+:/.test(l)).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep))throw new Error('path');
    const file=path===root?resolve(root,'index.html'):path;
    const data=await readFile(file);
    res.writeHead(200,{...headers,'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.gz':'application/octet-stream'})[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');}
}).listen(8788,'127.0.0.1',()=>console.log('UI check: http://127.0.0.1:8788'));
