const SUPABASE_URL='YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY='YOUR_SUPABASE_ANON_KEY';

const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const APP={admin:false,currentAttendanceStatus:''};

function qs(id){return document.getElementById(id)}

function showView(view){
 ['register','attendance','admin'].forEach(v=>{
   const el=qs(v);
   if(el) el.classList.add('hidden');
 });
 if(view!=='home') qs(view)?.classList.remove('hidden');
}

async function loadNotices(){
 const box=qs('noticeList');
 if(box) box.innerHTML='불러오는 중...';

 const {data,error}=await supabase
  .from('notices')
  .select('*')
  .order('created_at',{ascending:false});

 if(error){
   box.innerHTML='공지사항 로드 실패';
   console.error(error);
   return;
 }

 box.innerHTML=(data||[]).map(n=>`
  <div class="item">
   <h3>${n.title||''}</h3>
   <div class="muted">${formatDate(n.created_at)}</div>
   <div>${(n.content||'').replace(/\n/g,'<br>')}</div>
  </div>
 `).join('')||'공지사항이 없습니다.';
}

async function loadSchools(){
 const {data}=await supabase
  .from('schools')
  .select('*')
  .eq('active',true)
  .order('sort_order');

 const html=['<option value="">학교 선택</option>']
  .concat((data||[]).map(s=>`<option>${s.name}</option>`))
  .join('');

 if(qs('regSchool')) qs('regSchool').innerHTML=html;
}

async function loadEvents(){
 const {data}=await supabase
  .from('events')
  .select('*')
  .eq('active',true)
  .order('event_date');

 const html=(data||[]).map(e=>`
  <option value="${e.id}">${e.title} (${e.event_date||''})</option>
 `).join('');

 if(qs('attEvent')) qs('attEvent').innerHTML=html;
}

async function registerMember(){
 const payload={
  name:qs('regName').value.trim(),
  student_no:qs('regStudentNo').value.trim(),
  phone:qs('regPhone').value.trim(),
  position:qs('regPosition').value,
  school:qs('regSchool').value,
  created_at:new Date().toISOString()
 };

 if(!qs('regAgree').checked){
  setMsg('registerMsg','개인정보 동의가 필요합니다.','error');
  return;
 }

 const {error}=await supabase.from('members').insert([payload]);

 if(error){
  console.error(error);
  setMsg('registerMsg','회원등록 실패','error');
  return;
 }

 setMsg('registerMsg','회원등록 완료','success');
}

async function saveAttendance(status){
 const payload={
  event_id:qs('attEvent').value,
  name:qs('attName').value.trim(),
  status,
  updated_at:new Date().toISOString()
 };

 const {error}=await supabase.from('attendance').insert([payload]);

 if(error){
  console.error(error);
  setMsg('attendanceMsg','참석 저장 실패','error');
  return;
 }

 setMsg('attendanceMsg','저장 완료','success');
}

function adminLogin(){
 const pin=qs('adminPin').value.trim();
 if(pin==='1234'){
  APP.admin=true;
  qs('adminPanel')?.classList.remove('hidden');
  setMsg('adminMsg','관리자 로그인 성공','success');
  loadMembers();
 }else{
  setMsg('adminMsg','PIN 오류','error');
 }
}

async function loadMembers(){
 const {data,error}=await supabase
  .from('members')
  .select('*')
  .order('school');

 if(error)return;

 qs('memberList').innerHTML=(data||[]).map(m=>`
  <div class="item">
   ${m.school||''} / ${m.position||''} / ${m.name||''} / ${m.student_no||''}
  </div>
 `).join('');
}

async function saveNotice(){
 const payload={
  title:qs('noticeTitle').value.trim(),
  content:qs('noticeContent').value.trim(),
  created_at:new Date().toISOString()
 };

 const {error}=await supabase.from('notices').insert([payload]);

 if(error){
  setMsg('adminMsg','공지 저장 실패','error');
  return;
 }

 setMsg('adminMsg','공지 저장 완료','success');
 loadNotices();
}

async function saveEvent(){
 const payload={
  title:qs('eventTitle').value.trim(),
  event_date:qs('eventDate').value,
  place:qs('eventPlace').value.trim(),
  content:qs('eventContent').value.trim(),
  file_url:qs('eventFileUrl').value.trim(),
  active:true
 };

 const {error}=await supabase.from('events').insert([payload]);

 if(error){
  setMsg('adminMsg','행사 저장 실패','error');
  return;
 }

 setMsg('adminMsg','행사 저장 완료','success');
 loadEvents();
}

function setMsg(id,msg,type=''){
 const el=qs(id);
 if(!el)return;
 el.className='msg '+type;
 el.textContent=msg;
}

function formatDate(v){
 if(!v)return '';
 const d=new Date(v);
 return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');
}

window.addEventListener('DOMContentLoaded',async()=>{
 await loadNotices();
 await loadSchools();
 await loadEvents();
});