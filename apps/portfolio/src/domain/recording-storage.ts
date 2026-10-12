import type { Recording } from '../../../../packages/intelligence/src/types';
const NAME='chenxi-intelligence-v2';
async function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('recordings',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function saveRecording(record:Recording):Promise<void>{
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('recordings','readwrite');
    tx.objectStore('recordings').put({id:'latest',record});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function loadRecording():Promise<unknown>{
  const db=await database();try{return await new Promise((resolve,reject)=>{
    const req=db.transaction('recordings').objectStore('recordings').get('latest');
    req.onsuccess=()=>resolve(req.result?.record);req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
