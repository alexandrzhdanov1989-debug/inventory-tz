"use strict";
// Temporary single-user OAuth/API diagnostic for a static GitHub Pages PWA.
const CLIENT_ID='25b2715eec4b4b2cba466552b2fedfba';
const REDIRECT='https://alexandrzhdanov1989-debug.github.io/inventory-tz/';
const API='https://cloud-api.yandex.net/v1/disk';
let token=sessionStorage.getItem('tz_yandex_token')||'';
const $=id=>document.getElementById(id);
function status(msg){$('status').textContent=msg}
function setUi(){ $('test').disabled=!token; $('profile').textContent=token?'Сессия авторизована. Проверка доступа возможна.':'Нет подключения'; }
function conciseError(e){return e instanceof TypeError?'Ошибка сетевого запроса: '+e.message+' (возможно, CORS или отсутствие сети).':e.message}
async function getJson(url,opts={}){
  const r=await fetch(url,{...opts,headers:{Authorization:'OAuth '+token,...opts.headers}});
  const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,500)}}
  if(!r.ok)throw Error('HTTP '+r.status+': '+(data.description||data.message||r.statusText));
  return data;
}
async function checkProfile(){
  if(!token)return;
  try{const user=await getJson('https://login.yandex.ru/info?format=json');
    $('profile').textContent='Подключён Яндекс ID: '+String(user.id||'не определён')+' · '+String(user.login||'логин не указан');
  }catch(e){ $('profile').textContent='Токен получен, но запрос профиля не удался: '+conciseError(e);}
}
$('login').onclick=()=>{
 const state='tztest-'+crypto.randomUUID();
 sessionStorage.setItem('tz_yandex_expected_state',state);
 sessionStorage.removeItem('tz_yandex_error');
 const u=new URL('https://oauth.yandex.ru/authorize');
 u.searchParams.set('response_type','token');
 u.searchParams.set('client_id',CLIENT_ID);
 u.searchParams.set('redirect_uri',REDIRECT);
 u.searchParams.set('state',state);
 location.href=u.toString();
};
$('logout').onclick=()=>{token='';sessionStorage.removeItem('tz_yandex_token');sessionStorage.removeItem('tz_yandex_error');setUi();status('Локальная сессия очищена. Токен в Яндекс ID здесь не отзывается.');};
$('test').onclick=async()=>{
 if(!token)return status('Сначала выполните вход.');
 $('test').disabled=true;
 const filename='pwa-test-'+crypto.randomUUID()+'.json';
 const path='app:/'+filename;
 const payload={test:'TZ_YANDEX_APP_FOLDER',id:crypto.randomUUID(),createdAt:new Date().toISOString()};
 try{
  status('1/4 Проверяем папку приложения...');
  try{await getJson(API+'/resources?path='+encodeURIComponent('app:/'));}catch(e){if(!/HTTP 404/.test(e.message))throw e;/* The application folder may not exist yet. */}
  status('2/4 Запрашиваем адрес загрузки...');
  const upload=await getJson(API+'/resources/upload?'+new URLSearchParams({path,overwrite:'false'}));
  if(!upload.href||!/^https:\/\//.test(upload.href))throw Error('API не вернул HTTPS-адрес загрузки');
  status('3/4 Загружаем тестовый JSON...');
  // The upload URL is pre-authorized. Do not send OAuth token to that host.
  let r=await fetch(upload.href,{method:upload.method||'PUT',body:new Blob([JSON.stringify(payload)],{type:'application/json'})});
  if(!r.ok)throw Error('Загрузка файла: HTTP '+r.status);
  status('4/4 Читаем загруженный JSON...');
  const download=await getJson(API+'/resources/download?path='+encodeURIComponent(path));
  if(!download.href||!/^https:\/\//.test(download.href))throw Error('API не вернул HTTPS-адрес скачивания');
  // The download URL is pre-authorized. Do not send OAuth token to that host.
  r=await fetch(download.href);if(!r.ok)throw Error('Скачивание файла: HTTP '+r.status);
  const read=await r.json();
  if(read.id!==payload.id||read.test!==payload.test)throw Error('Содержимое отличается от отправленного');
  status('УСПЕХ!\nФайл: '+filename+'\nЗапись и чтение JSON проверены.\nЭто подтверждает только личную папку app:/, не общий обмен.');
 }catch(e){status('Тест остановился: '+conciseError(e)+'\n\nДанные инвентаризации не затронуты.');}
 finally{setUi();}
};
const returnedError=sessionStorage.getItem('tz_yandex_error');
if(returnedError){status('Ошибка авторизации: '+returnedError);sessionStorage.removeItem('tz_yandex_error');}
setUi();checkProfile();
