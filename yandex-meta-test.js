'use strict';
// Separate diagnostic, uses previously issued OAuth token in the current tab.
// Does not touch application inventory or send data to any third party.
const API='https://cloud-api.yandex.net/v1/disk';
const CLIENT_ID='25b2715eec4b4b2cba466552b2fedfba';
const REDIRECT='https://alexandrzhdanov1989-debug.github.io/inventory-tz/';
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
 if(!token){log('Нет OAuth-сессии. Нажмите «Войти через Яндекс» на этой странице.');$('run').disabled=false;return}
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
$('login').hidden=!!token;
const authorizationError=sessionStorage.getItem('tz_yandex_error');
if(authorizationError){log('Ошибка авторизации: '+authorizationError);sessionStorage.removeItem('tz_yandex_error');}
$('run').addEventListener('click',run);
$('login').addEventListener('click',()=>{
  const state='tztest-'+crypto.randomUUID();
  sessionStorage.setItem('tz_yandex_expected_state',state);
  localStorage.setItem('tz_yandex_pending', JSON.stringify({state, destination:'meta', createdAt:Date.now()}));
  sessionStorage.setItem('tz_yandex_return_to_meta','1');
  sessionStorage.removeItem('tz_yandex_error');
  const u=new URL('https://oauth.yandex.ru/authorize');
  u.searchParams.set('response_type','token');
  u.searchParams.set('client_id',CLIENT_ID);
  u.searchParams.set('redirect_uri',REDIRECT);
  u.searchParams.set('state',state);
  location.assign(u.toString());
});
$('copy').addEventListener('click',()=>{const content=$('logs').textContent;navigator.clipboard?.writeText(content).catch(()=>{});});

// Separate byte-size experiment. No real inventory information is accessed.
async function testPropertySizes() {
  const button=$('sizeTest');
  if (!token) {log('Сначала войдите через Яндекс.'); return;}
  button.disabled=true; $('run').disabled=true;
  lines.length=0; $('logs').textContent='';
  const id=crypto.randomUUID();
  const path='app:/size_probe_'+id+'.json';
  log('Тест размера метаданных. Все данные искусственные.');
  log('Создаём ОДИН тестовый файл в app:/, затем последовательно заменяем его свойства.');
  try {
    const link=await jsonRequest('Получение адреса загрузки',API+'/resources/upload?'+new URLSearchParams({path,overwrite:'false'}));
    if(!link.href || !link.href.startsWith('https://')) throw Error('Ссылка на загрузку отсутствует');
    const upload=await fetch(link.href,{method:'PUT',body:new Blob(['{"test":"size_probe"}'],{type:'application/json'}),cache:'no-store'});
    log('  Создание тестового файла: HTTP '+upload.status);
    if(!upload.ok)throw Error('Не удалось создать тестовый файл');
    const encoder=new TextEncoder();
    const sizes=[256,512,768,900,1024,2048,4096];
    let lastOK=0;
    for(const bytes of sizes) {
      // All ASCII; JSON payload is precisely the requested number of UTF-8 bytes.
      const prefix=JSON.stringify({test:'size',id,content:''});
      const padLen=bytes-encoder.encode(prefix).length;
      if(padLen<0) throw Error('Размер меньше служебного заголовка');
      const payload=JSON.stringify({test:'size',id,content:'X'.repeat(padLen)});
      const actual=encoder.encode(payload).length;
      log('Размер JSON: '+actual+' байт; PATCH + GET:');
      try {
        await jsonRequest('  PATCH свойств',url(path),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({custom_properties:{tz_probe:payload}})});
        const got=await jsonRequest('  GET свойств',url(path));
        if(got.custom_properties?.tz_probe!==payload)throw Error('Полученное значение отличается от записанного');
        lastOK=actual;log('  УСПЕХ: '+actual+' байт записано и прочитано без скачивания.');
      }catch(e) {
        log('  НЕУДАЧА: '+err(e));
        log('Тест остановлен на '+actual+' байт. Последний успешный размер: '+lastOK+' байт.');
        break;
      }
    }
    log('Итог: подтверждённый объём JSON — '+lastOK+' байт.');
    log('Тестовый файл остаётся в app:/, реальные данные не затронуты.');
  }catch(e){log('ОШИБКА ТЕСТА: '+err(e))}
  finally{button.disabled=false;$('run').disabled=false;}
}
$('sizeTest').disabled=!token;
$('sizeTest').addEventListener('click',testPropertySizes);
