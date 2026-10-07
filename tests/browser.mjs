import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=path.join(root,'test-results');await mkdir(results,{recursive:true});
const port='4181',url=`http://127.0.0.1:${port}/xiaochengxu/`;
const server=spawn(process.execPath,['tools/serve.mjs'],{cwd:root,env:{...process.env,PORT:port},stdio:'pipe'});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`)));});
let browser,context;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true,timezoneId:'America/Los_Angeles'});
 let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');
 const today=await page.locator('#date-picker').inputValue();
 await page.locator('#task-input').fill('读十页书');await page.locator('#add-task').click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===1);
 await page.locator('.task-title').click();await page.locator('.task-edit-input').fill('读二十页书');await page.locator('.edit-actions button').first().click();await page.waitForFunction(()=>document.querySelector('.task-title')?.textContent==='读二十页书');
 await page.locator('.task-check').click();await page.waitForFunction(()=>document.querySelector('.task-row')?.classList.contains('done'));
 await page.screenshot({path:path.join(results,'tasks-mobile.png'),fullPage:true});
 await page.locator('#notes-tab').click();await page.locator('#note-input').fill('今天完成了阅读。\n明天继续。');await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='已保存到此设备');
 await page.screenshot({path:path.join(results,'notes-mobile.png'),fullPage:true});
 // Switch immediately after typing: no debounce wait, draft must be flushed.
 await page.locator('#note-input').fill('切换前的文字也要保留。');await page.locator('#previous-day').click();await page.waitForFunction(d=>document.querySelector('#date-picker').value!==d,today);
 assert.equal(await page.locator('#note-input').inputValue(),'');await page.locator('#note-input').fill('昨天的随记。');await page.locator('#save-note').click();
 await page.locator('#today-button').click();await page.waitForFunction(d=>document.querySelector('#date-picker').value===d,today);assert.equal(await page.locator('#note-input').inputValue(),'切换前的文字也要保留。');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');assert.equal(await page.locator('.task-title').textContent(),'读二十页书');await page.locator('#notes-tab').click();assert.equal(await page.locator('#note-input').inputValue(),'切换前的文字也要保留。');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile should not overflow');
 console.log('PASS 手机布局、新增编辑完成、跨日保存、刷新保留');
 await page.locator('#settings-open').click();const backupDownload=page.waitForEvent('download');await page.locator('#export-json').click();const download=await backupDownload;const backupPath=path.join(results,'synthetic-backup.json');await download.saveAs(backupPath);const backup=JSON.parse(await readFile(backupPath,'utf8'));assert.equal(backup.tasks.length,1);assert.equal(backup.notes.length,2);
 const mdDownload=page.waitForEvent('download');await page.locator('#export-markdown').click();await (await mdDownload).saveAs(path.join(results,'synthetic-notes.md'));assert.match(await readFile(path.join(results,'synthetic-notes.md'),'utf8'),/切换前的文字/);
 // Invalid import must not modify the DB.
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"bad"}')});await page.waitForFunction(()=>!document.querySelector('#toast').hidden);assert.equal(await page.locator('#import-dialog').evaluate(el=>el.open),false);
 for(let i=0;i<2;i++){await page.locator('#import-file').setInputFiles(backupPath);await page.locator('#import-merge').click();await page.waitForFunction(()=>!document.querySelector('#import-dialog').open);}
 await page.locator('#settings-close').click();await page.locator('#tasks-tab').click();assert.equal(await page.locator('.task-row').count(),1);
 await page.locator('#task-input').fill('稍后删除的任务');await page.locator('#add-task').click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===2);await page.locator('.task-delete').last().click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===1);
 await page.locator('#task-input').fill('恢复前多出来的任务');await page.locator('#add-task').click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===2);
 await page.locator('#settings-open').click();await page.locator('#import-file').setInputFiles(backupPath);await page.locator('#import-restore').click();await page.waitForFunction(()=>!document.querySelector('#import-dialog').open);await page.locator('#settings-close').click();assert.equal(await page.locator('.task-row').count(),1);
 console.log('PASS 完整备份、Markdown、非法导入、合并幂等、删除及恢复');
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');await page.locator('#notes-tab').click();await page.locator('#note-input').fill('离线也能保存。');await page.locator('#save-note').click();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='已保存到此设备');await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');await page.locator('#notes-tab').click();assert.equal(await page.locator('#note-input').inputValue(),'离线也能保存。');
 await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(url);await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');await page.locator('#notes-tab').click();assert.equal(await page.locator('#note-input').inputValue(),'离线也能保存。');console.log('PASS 离线打开、编辑、刷新及关闭重开');
 await context.setOffline(false);
 // Force an IndexedDB write failure. The textarea and dirty draft must survive.
 await page.evaluate(()=>{window.realPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('模拟磁盘写入失败','QuotaExceededError');};});
 await page.locator('#note-input').fill('保存失败也不能清空我。');await page.locator('#save-note').click();await page.waitForFunction(()=>document.querySelector('#save-status').classList.contains('error'));assert.equal(await page.locator('#note-input').inputValue(),'保存失败也不能清空我。');await page.locator('#previous-day').click();assert.equal(await page.locator('#date-picker').inputValue(),today);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.realPut;});await page.locator('#save-note').click();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='已保存到此设备');console.log('PASS 写入失败保留输入、阻止跨日丢稿、重试成功');
 // Real service-worker update served through a temporary in-memory response.
 const originalSw=await readFile(path.join(root,'sw.js'),'utf8');let updated=originalSw.replace("const CACHE=PREFIX+'v1';","const CACHE=PREFIX+'v2';");
 // Existing server can serve a changed worker; restore source after update fetch.
 await writeFile(path.join(root,'sw.js'),updated);
 try{await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await page.waitForFunction(()=>!document.querySelector('#update-banner').hidden);await page.locator('#tasks-tab').click();await page.locator('#task-input').fill('更新之前未提交的任务');await page.locator('#notes-tab').click();await page.locator('#note-input').fill('更新之前输入的随记。');await page.locator('#update-button').click();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='本地记录已就绪');await page.locator('#notes-tab').click();assert.equal(await page.locator('#note-input').inputValue(),'更新之前输入的随记。');assert.equal(await page.locator('.task-row').count(),2);console.log('PASS 真实 service worker 更新前保存任务草稿与随记');}finally{await writeFile(path.join(root,'sw.js'),originalSw);}
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log('ALL BROWSER CHECKS PASSED');
}finally{await context?.close();await browser?.close();server.kill();}
