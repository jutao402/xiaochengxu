import {beijingDate,validDate,shiftDate,createBackup,validateBackup,mergeRecords,notesMarkdown} from './data.js';
import {openDatabase,readAll,readMeta,writeMeta,putRecord,deleteTask,replaceRecords} from './db.js';
const $=id=>document.getElementById(id);
let db,records={tasks:[],notes:[]},selected=beijingDate(),draft='',dirty=false,noteTimer,editState=null,pendingBackup=null,registration,installPrompt,busy=false,switching=false,frozen=false;
let queue=Promise.resolve();
function serial(action) { const next=queue.then(action); queue=next.catch(()=>{}); return next; }
function status(text,error=false){$('save-status').textContent=text;$('save-status').classList.toggle('error',error);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function report(error){console.error(error);status('保存失败，输入已保留',true);toast(error?.message || '操作失败，请重试。');}
function locked(value){busy=value;document.querySelectorAll('#task-form button,#task-list button,#task-list input,#import-merge,#import-restore').forEach(x=>x.disabled=value||frozen);}
function renderDate(){
  const d=new Date(`${selected}T12:00:00Z`);
  $('date-picker').value=selected;
  $('date-title').textContent=`${d.getUTCMonth()+1}月${d.getUTCDate()}日`;
  $('weekday').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',weekday:'long'}).format(d);
  $('day-label').textContent=selected===beijingDate()?'TODAY / 今天':'A DAY / 这一天';
  $('day-badge').replaceChildren(); const small=document.createElement('small');small.textContent=`${d.getUTCMonth()+1}月`;const num=document.createElement('span');num.textContent=String(d.getUTCDate()).padStart(2,'0');$('day-badge').append(small,num);
}
function renderTasks(){
  const tasks=records.tasks.filter(t=>t.date===selected).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const done=tasks.filter(t=>t.done).length;
  $('task-count').textContent=tasks.length;$('progress-label').textContent=tasks.length?`已完成 ${done} / ${tasks.length} · ${done===tasks.length?'今天的清单，完成了。':'按自己的节奏来。'}`:'不必排满，从一件小事开始。';
  $('progress-fill').style.width=`${tasks.length?done/tasks.length*100:0}%`;$('task-empty').hidden=!!tasks.length;
  $('task-list').replaceChildren();
  for(const task of tasks){
    const li=document.createElement('li');li.className=`task-row${task.done?' done':''}`;li.dataset.id=task.id;
    const check=document.createElement('button');check.className='task-check';check.setAttribute('aria-label',task.done?'标为未完成':'完成任务');check.setAttribute('aria-pressed',task.done);const tick=document.createElement('span');tick.textContent=task.done?'✓':'';check.append(tick);
    check.onclick=()=>mutate(async()=>{const updated={...task,done:!task.done,updatedAt:new Date().toISOString()};await putRecord(db,'tasks',updated);records.tasks=records.tasks.map(t=>t.id===task.id?updated:t);});
    const body=document.createElement('div');body.className='task-body';
    if(editState?.id===task.id){
      const input=document.createElement('input');input.className='task-edit-input';input.value=editState.value;input.maxLength=500;input.setAttribute('aria-label','编辑任务');input.oninput=()=>{editState.value=input.value;};
      const actions=document.createElement('div');actions.className='edit-actions';
      const save=document.createElement('button');save.className='text-button';save.textContent='保存';save.onclick=()=>saveEdit();
      const cancel=document.createElement('button');cancel.className='text-button';cancel.textContent='取消';cancel.onclick=()=>{editState=null;renderTasks();};
      input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();saveEdit();}if(e.key==='Escape'){editState=null;renderTasks();}};
      actions.append(save,cancel);body.append(input,actions);
    }else{
      const title=document.createElement('button');title.className='task-title';title.textContent=task.title;title.setAttribute('aria-label',`编辑：${task.title}`);title.onclick=async()=>{if(busy||switching)return;if(editState&&!await saveEdit())return;editState={id:task.id,value:task.title};renderTasks();$('task-list').querySelector('.task-edit-input')?.focus();};body.append(title);
    }
    const remove=document.createElement('button');remove.className='icon-button task-delete';remove.textContent='×';remove.setAttribute('aria-label',`删除：${task.title}`);
    remove.onclick=()=>{if(confirm(`删除“${task.title}”？`))mutate(async()=>{await deleteTask(db,task.id);records.tasks=records.tasks.filter(t=>t.id!==task.id);if(editState?.id===task.id)editState=null;});};
    li.append(check,body,remove);$('task-list').append(li);
  }
}
async function mutate(action){if(busy||switching||!db)return false;locked(true);status('正在保存…');try{await serial(action);renderTasks();status(dirty?'随记待保存…':'已保存到此设备');return true;}catch(e){report(e);return false;}finally{locked(false);}}
async function saveEdit(){if(!editState)return true;const state={...editState};const title=state.value.trim();if(!title){toast('任务内容不能为空。');return false;}return mutate(async()=>{const old=records.tasks.find(t=>t.id===state.id);const updated={...old,title,updatedAt:new Date().toISOString()};await putRecord(db,'tasks',updated);records.tasks=records.tasks.map(t=>t.id===state.id?updated:t);editState=null;});}
function renderNote(){draft=records.notes.find(n=>n.date===selected)?.body||'';dirty=false;$('note-input').value=draft;countWords();}
function countWords(){$('word-count').textContent=`${Array.from($('note-input').value).length} 字`;}
async function flushNote(){
  clearTimeout(noteTimer);if(!db)return false;if(!dirty){await queue;return true;}
  const date=selected,body=draft;status('正在保存随记…');
  try{await serial(async()=>{const old=records.notes.find(n=>n.date===date),now=new Date().toISOString();const n={date,body,createdAt:old?.createdAt||now,updatedAt:now};await putRecord(db,'notes',n);records.notes=records.notes.filter(x=>x.date!==date);records.notes.push(n);});
    if(selected===date&&draft===body){dirty=false;status('已保存到此设备');}else status('随记待保存…');return true;
  }catch(e){report(e);return false;}
}
async function flushAll(){if(busy||switching){toast('正在保存，请稍候。');return false;}if(!await saveEdit())return false;if($('task-input').value.trim()&&!await addTask())return false;return flushNote();}
function freezeDrafts(value){frozen=value;$('note-input').disabled=value;$('task-input').disabled=value;$('date-picker').disabled=value;$('previous-day').disabled=value;$('next-day').disabled=value;$('today-button').disabled=value;locked(busy);}
let changingDate=false;
async function changeDate(date){if(!validDate(date)||changingDate||switching||busy){$('date-picker').value=selected;return;}changingDate=true;freezeDrafts(true);try{if(!await flushAll()){$('date-picker').value=selected;return;}switching=true;selected=date;renderDate();renderTasks();renderNote();}finally{switching=false;changingDate=false;freezeDrafts(false);}}
async function addTask(){const input=$('task-input'),title=input.value.trim();if(!title)return true;const date=selected,now=new Date().toISOString(),id=crypto.randomUUID();return mutate(async()=>{const t={id,date,title,done:false,createdAt:now,updatedAt:now};await putRecord(db,'tasks',t);records.tasks.push(t);if(input.value.trim()===title)input.value='';});}
$('task-form').onsubmit=async e=>{e.preventDefault();await addTask();};
$('note-input').oninput=()=>{draft=$('note-input').value;dirty=true;countWords();status('随记待保存…');clearTimeout(noteTimer);noteTimer=setTimeout(flushNote,1000);};
$('save-note').onclick=flushNote;
$('date-picker').onchange=e=>changeDate(e.target.value);
$('previous-day').onclick=()=>changeDate(shiftDate(selected,-1));$('next-day').onclick=()=>changeDate(shiftDate(selected,1));$('today-button').onclick=()=>changeDate(beijingDate());
for(const name of ['tasks','notes'])$(`${name}-tab`).onclick=()=>{for(const n of ['tasks','notes']){$(`${n}-tab`).classList.toggle('active',n===name);$(`${n}-tab`).setAttribute('aria-selected',n===name);$(`${n}-panel`).hidden=n!==name;}};
function download(body,type,name){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportBackup(markReminder=true){if(!await flushAll())return false;const snapshot=await serial(()=>readAll(db));download(JSON.stringify(createBackup(snapshot.tasks,snapshot.notes),null,2),'application/json',`daily-backup-${beijingDate()}-${Date.now()}.json`);if(markReminder){await writeMeta(db,'lastExport',new Date().toISOString());await updateReminder();}toast('已发起下载，请确认备份文件保存成功。');return true;}
$('export-json').onclick=()=>exportBackup().catch(report);$('backup-reminder-button').onclick=()=>exportBackup().catch(report);
$('export-markdown').onclick=async()=>{try{if(!await flushAll())return;const snapshot=await readAll(db);download(notesMarkdown(snapshot.notes),'text/markdown;charset=utf-8',`daily-notes-${beijingDate()}.md`);}catch(e){report(e);}};
async function updateReminder(){const last=await readMeta(db,'lastExport');$('backup-date').textContent=last?`最近发起导出：${new Date(last).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`:'还没有导出过备份。';const first=await readMeta(db,'firstOpened');if(!first)await writeMeta(db,'firstOpened',new Date().toISOString());const since=last||first||new Date().toISOString();$('backup-banner').hidden=Date.now()-Date.parse(since)<7*86400000;}
$('import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>30*1024*1024)throw new Error('备份文件超过 30 MB。');pendingBackup=validateBackup(JSON.parse(await file.text()));const dates=[...pendingBackup.tasks.map(t=>t.date),...pendingBackup.notes.map(n=>n.date)].sort();$('import-preview').textContent=`备份包含 ${pendingBackup.tasks.length} 个任务、${pendingBackup.notes.length} 篇随记。${dates.length?`日期范围：${dates[0]} 至 ${dates.at(-1)}。`:''}导出时间：${new Date(pendingBackup.exportedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`;$('import-dialog').showModal();}catch(e){toast(e.message||'无法读取备份。');}};
async function importRecords(mode){if(!pendingBackup||!db)return;try{
  if(!await exportBackup(false))return;
  if(!confirm('已下载当前数据备份。请先确认文件已保存，再继续导入。'))return;
  if(mode==='restore'&&!confirm('恢复将替换全部当前记录，确定继续？'))return;
  locked(true);$('note-input').disabled=true;clearTimeout(noteTimer);
  await serial(async()=>{const current=await readAll(db);const incoming=mode==='merge'?mergeRecords(current,pendingBackup):pendingBackup;await replaceRecords(db,incoming);records={tasks:incoming.tasks,notes:incoming.notes};});
  editState=null;renderTasks();renderNote();$('import-dialog').close();pendingBackup=null;status('导入完成，已保存');toast('记录已导入。');
}catch(e){report(e);}finally{locked(false);$('note-input').disabled=false;}}
$('import-merge').onclick=()=>importRecords('merge');$('import-restore').onclick=()=>importRecords('restore');$('import-close').onclick=()=>{if(!busy)$('import-dialog').close();};$('import-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('settings-open').onclick=()=>{$('settings-dialog').showModal();checkStorage();};$('settings-close').onclick=()=>$('settings-dialog').close();
async function checkStorage(){try{const supported=!!navigator.storage?.persisted;if(!supported){$('storage-status').textContent='当前浏览器不支持持久化存储查询，请定期导出。';$('persist-button').disabled=true;return;}const persisted=await navigator.storage.persisted();$('storage-status').textContent=persisted?'已获得持久化存储许可。仍建议定期导出。':'当前为普通网站存储。浏览器可能在存储紧张时清理，请定期导出。';}catch{$('storage-status').textContent='无法查询存储状态，请定期导出。';}}
$('persist-button').onclick=async()=>{try{if(!navigator.storage?.persist){toast('当前浏览器不支持申请。');return;}const granted=await navigator.storage.persist();await checkStorage();toast(granted?'已获得持久化存储许可。':'浏览器未批准，记录仍可本地保存，请定期备份。');}catch(e){toast('申请失败，请定期导出备份。');}};
window.addEventListener('beforeunload',e=>{if(dirty||busy||editState||$('task-input').value.trim()){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)flushNote();});
window.addEventListener('pagehide',()=>{if(dirty)flushNote();});
function network(){$('network-status').textContent=navigator.onLine?'仅存此设备':'离线 · 仅存此设备';}window.addEventListener('online',network);window.addEventListener('offline',network);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install-button').hidden=false;});$('install-button').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install-button').hidden=true;}};
async function offlineReady(){try{const response=await caches.match(new URL('./index.html',location.href));$('offline-status').textContent=response?'离线缓存已就绪，可以断网使用。':'离线缓存未完成，请联网重新打开。';}catch{$('offline-status').textContent='无法检查离线缓存，请先验证断网打开。';}}
async function setupWorker(){
  if(!('serviceWorker'in navigator)){$('offline-status').textContent='此浏览器不支持离线缓存，需联网打开。';return;}
  try{
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    if(registration.waiting)$('update-banner').hidden=false;
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){offlineReady();if(navigator.serviceWorker.controller)$('update-banner').hidden=false;}});
    });
    navigator.serviceWorker.ready.then(offlineReady);
    let requested=false,updateTimeout;
    $('update-button').onclick=async()=>{
      if(busy||switching||changingDate)return;
      freezeDrafts(true);$('update-button').disabled=true;
      if(!await flushAll()){freezeDrafts(false);$('update-button').disabled=false;return;}
      const pending=registration.waiting;
      if(!pending){freezeDrafts(false);$('update-button').disabled=false;toast('更新已完成或暂不可用。');return;}
      requested=true;locked(true);pending.postMessage({type:'ACTIVATE_UPDATE'});
      updateTimeout=setTimeout(()=>{requested=false;locked(false);freezeDrafts(false);$('update-button').disabled=false;toast('更新暂未完成，记录已保存，可以稍后重试。');},15000);
    };
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(requested){clearTimeout(updateTimeout);location.reload();}
      else if(dirty||editState||$('task-input').value.trim())toast('版本已更新，保存后手动重新打开即可。');
      else offlineReady();
    });
  }catch{$('offline-status').textContent='离线缓存注册失败，请检查是否使用 HTTPS 或本机地址。';}
}
renderDate();network();
try{db=await openDatabase();records=await readAll(db);renderTasks();renderNote();status('本地记录已就绪');await updateReminder();await checkStorage();await setupWorker();}catch(e){status('本地数据库不可用，暂不能保存',true);toast(e.message||'请使用普通浏览器模式，并允许网站存储。');document.querySelectorAll('#task-form input,#task-form button,#note-input,#save-note,#export-json,#export-markdown,#import-file').forEach(x=>x.disabled=true);}
