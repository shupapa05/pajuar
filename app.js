const APP={year:new Date().getFullYear(),pin:'1234'};
const $=id=>document.getElementById(id);
function msg(id,t,c=''){const e=$(id);if(e){e.className='msg '+c;e.textContent=t;}}
function showView(v){['register','attendance','admin'].forEach(x=>$(x)?.classList.add('hidden'));if(v!=='home')$(v)?.classList.remove('hidden');}
function allSections(){return Array.from(document.querySelectorAll('main>section'));}
function showView(v){allSections().forEach(s=>s.classList.add('hidden'));if(v==='home'){allSections().forEach(s=>s.classList.remove('hidden'));['register','attendance','admin'].forEach(x=>$(x)?.classList.add('hidden'));window.scrollTo(0,0);return;}$(v)?.classList.remove('hidden');window.scrollTo(0,0);}
function openAdminWindow(){window.open('index.html?admin=1','_blank');}
function setupAdmin(){document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='관리자')b.onclick=()=>openAdminWindow();});if(location.search.includes('admin=1')){document.querySelectorAll('main>section').forEach(s=>s.classList.add('hidden'));$('admin')?.classList.remove('hidden');}}
function setupAdmin(){document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='관리자')b.onclick=()=>openAdminWindow();});if(location.search.includes('admin=1'))showView('admin');}
function gen(v){const n=Number(String(v||'').replace(/\D/g,'').slice(-2));if(isNaN(n))return'';return n>=62?String(n-61):String(n+39);}
function fee(p){return ['교장','장학관'].includes(p)?100000:['교감','장학사'].includes(p)?80000:60000;}
function dateKo(v){const d=new Date(v);return isNaN(d)?'':`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;}
@@ -20,4 +21,4 @@ function adminLogin(){if($('adminPin').value.trim()===APP.pin){$('adminPanel')?.
async function loadMembers(){const {data}=await db.from('members').select('*').order('school').order('name');$('memberList').innerHTML=(data||[]).map(m=>`<div class="item">${m.school||''} / ${m.position||''} / ${m.name||''} / ${m.generation||''}기 / ${m.phone||''}</div>`).join('');}
async function saveNotice(){const title=$('noticeTitle').value.trim(),content=$('noticeContent').value.trim();if(!title)return msg('adminMsg','공지 제목을 입력해주세요.','error');const {error}=await db.from('notices').insert([{year:APP.year,title,content,is_public:true,important:false}]);if(error)return msg('adminMsg','공지 저장 실패','error');msg('adminMsg','공지 저장 완료','success');loadNotices();}
async function saveEvent(){const p={year:APP.year,title:$('eventTitle').value.trim(),event_date:$('eventDate').value,place:$('eventPlace').value.trim(),content:$('eventContent').value.trim(),pdf_file_url:$('eventFileUrl').value.trim(),active:true,sort_order:1};const {error}=await db.from('events').insert([p]);if(error)return msg('adminMsg','행사 저장 실패','error');msg('adminMsg','행사 저장 완료','success');loadEvents();}
addEventListener('DOMContentLoaded',async()=>{setupAdmin();await loadSettings();await loadNotices();await loadSchools();await loadEvents();});
addEventListener('DOMContentLoaded',async()=>{await loadSettings();setupAdmin();await loadNotices();await loadSchools();await loadEvents();});
