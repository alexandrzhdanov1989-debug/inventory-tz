'use strict';
// Separate diagnostic, uses previously issued OAuth token in the current tab.
// Does not touch application inventory or send data to any third party.
const API='https://cloud-api.yandex.net/v1/disk';
const token=sessionStorage.getItem('tz_yandex_token')||'';
const $=id=>document.getElementById(id);
const lines=[];
const stamp=()=>new Date().toLocaleTimeString('ru-RU',{hour12:false});
function log(message){lines.push(`[${stamp()}] ${message}`);$('logs').textContent=lines.join('\n')}
function err(e){return e instanceof TypeError?'Ошибка сетевого запроса / возможный CORS: '+e.message:String(e.message||e)}
function url(path){return API+'/resources?'+new URLSearchParams({path})}
function authHeaders(extra={}){return {...extra,Authorization:'OAuth '+token}}
async function jsonRequest(label,endpoint,options={}){
 let response;
 try {response=await fetch(endpoint,{...options,cache:'no-store',headers:authHeaders(options.headers||{})});}
 catch(e){throw Error(label+': '+err(e))}
 log(`  ${label}: HTTP ${response.status}`);
 let data={};try {const body=await response.text();data=body?JSON.parse(body):{}}catch{}
 if(!response.ok)throw Error(label+': HTTP '+response.status+(data.error?' ('+String(data.error).slice(0,100)+')':''));
 return data;
}
// Only ASCII is placed into filenames to avoid OS-specific naming problems.
function b64url(text){const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function from64url(s){const str=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return new TextDecoder().decode(Uint8Array.from(str,c=>c.charCodeAt(0)))}
async function run(){
 lines.length=0;$('logs').textContent='';$('run').disabled=true;
 if(!token){log('Нет OAuth-сессии. Сначала выполните вход на yandex-test.html в этой же вкладке.');$('run').disabled=false;return}
 const obj={t:'TZ_META_TEST',id:crypto.randomUUID().slice(0,8),px:'LB',n:1};
 const payload=JSON.stringify(obj);
 const basename='evt_'+b64url(payload)+'.json';
 const path='app:/'+basename;
 log('Начинаем тест только с искусственными данными.');
 log('Длина имени файла: '+basename.length+' символов.');
 try{
  const link=await jsonRequest('Запрос адреса загрузки',API+'/resources/upload?'+new URLSearchParams({path,overwrite:'false'}));
  if(!link.href||!link.href.startsWith('https://'))throw Error('Нет HTTPS-адреса загрузки');
  const r=await fetch(link.href,{method:'PUT',body:new Blob([payload],{type:'application/json'}),cache:'no-store'});
  log('  Загрузка контрольного файла: HTTP '+r.status);
  if(!r.ok)throw Error('Загрузка файла отклонена: HTTP '+r.status);
  // A: read name in resource metadata, bypassing downloader.disk.yandex.ru.
  log('СПОСОБ А: читаем данные из имени файла через API метаданных.');
  try{
   const meta=await jsonRequest('GET метаданных файла',url(path));
   const got=JSON.parse(from64url(String(meta.name||'').replace(/^evt_/,'').replace(/\.json$/,'')));
   if(JSON.stringify(got)!==payload)throw Error('Содержимое не совпало');
   log('УСПЕХ А: JSON получен без обращения к файловому серверу.');
  }catch(e){log('ОШИБКА А: '+err(e))}
  // B: custom_properties PATCH, then GET. This may be blocked by CORS/preflight.
  log('СПОСОБ Б: PATCH custom_properties, затем GET метаданных.');
  try{
   await jsonRequest('PATCH свойств',url(path),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({custom_properties:{tz_probe:payload}})});
   const meta=await jsonRequest('GET свойств',url(path));
   const got=meta.custom_properties?.tz_probe;
   if(got!==payload)throw Error('Свойство отсутствует или содержимое не совпало');
   log('УСПЕХ Б: JSON записан и прочитан через custom_properties.');
  }catch(e){log('ОШИБКА Б: '+err(e))}
  // C: important for a journal: see events through a listing, not only by knowing exact names.
  log('СПОСОБ В: ищем операцию в списке файлов app:/ (до 1000 записей).');
  try{
   const list=await jsonRequest('GET списка',API+'/resources?'+new URLSearchParams({path:'app:/',limit:'1000',offset:'0'}));
   const found=(list._embedded?.items||[]).some(item=>item.name===basename);
   log(found?'УСПЕХ В: файл найден в каталоге.':'НЕ НАЙДЕН В ПЕРВОЙ ПОРЦИИ: нужно проверить пагинацию или задержку индексации.');
  }catch(e){log('ОШИБКА В: '+err(e))}
  log('Готово. Одна тестовая запись осталась в app:/; реальные данные не изменены.');
 }catch(e){log('ОШИБКА ПОДГОТОВКИ: '+err(e))}
 finally{$('run').disabled=false}
}
$('session').textContent=token?'Вход выполнен, токен есть в сессии вкладки.':'Не выполнен вход в этой вкладке.';
$('run').disabled=!token;
$('run').addEventListener('click',run);
$('copy').addEventListener('click',()=>{const content=$('logs').textContent;navigator.clipboard?.writeText(content).catch(()=>{});});
