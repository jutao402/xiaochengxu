// Version upgrades add stores/indexes; never delete existing user records.
export function openDatabase() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(`personal-daily:${new URL('./',import.meta.url).pathname}`,1);
    request.onupgradeneeded = event => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('tasks',{keyPath:'id'}).createIndex('date','date',{unique:false});
        db.createObjectStore('notes',{keyPath:'date'});
        db.createObjectStore('meta',{keyPath:'key'});
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('数据库升级被旧页面阻挡，请关闭其他日常页面后重试。'));
    request.onsuccess = () => { const db=request.result; db.onversionchange=()=>db.close(); resolve(db); };
  });
}
export function transaction(db,stores,mode,action) {
  return new Promise((resolve,reject) => {
    let tx, result;
    try {
      tx=db.transaction(stores,mode);
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error || new Error('数据库操作失败。'));
      tx.onabort=()=>reject(tx.error || new Error('数据库操作已取消。'));
      result=action(tx);
    } catch(error) { if(tx)try{tx.abort();}catch{} reject(error); }
  });
}
export async function readAll(db) {
  let tasks,notes;
  await transaction(db,['tasks','notes'],'readonly',tx=> {
    tx.objectStore('tasks').getAll().onsuccess=e=>{tasks=e.target.result;};
    tx.objectStore('notes').getAll().onsuccess=e=>{notes=e.target.result;};
  });
  return {tasks,notes};
}
export async function readMeta(db,key) {
  let value; await transaction(db,['meta'],'readonly',tx=>{tx.objectStore('meta').get(key).onsuccess=e=>{value=e.target.result?.value;};}); return value;
}
export function writeMeta(db,key,value){return transaction(db,['meta'],'readwrite',tx=>tx.objectStore('meta').put({key,value}));}
export function putRecord(db,store,record){return transaction(db,[store],'readwrite',tx=>tx.objectStore(store).put(record));}
export function deleteTask(db,id){return transaction(db,['tasks'],'readwrite',tx=>tx.objectStore('tasks').delete(id));}
export function replaceRecords(db,records) {
  return transaction(db,['tasks','notes'],'readwrite',tx=>{
    const tasks=tx.objectStore('tasks'),notes=tx.objectStore('notes'); tasks.clear(); notes.clear();
    records.tasks.forEach(x=>tasks.put(x)); records.notes.forEach(x=>notes.put(x));
  });
}
