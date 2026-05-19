const URL='https://lemwzcchuazqpsyzsoff.supabase.co';
const KEY='sb_publishable_dXOuhuPizNsQgCXtqQYY4A_DBk6WCGV';
const db=window.supabase.createClient(URL,KEY);
const APP={year:new Date().getFullYear(),pin:'1234'};
const $=id=>document.getElementById(id);

function msg(id,t,c=''){const e=$(id);if(e){e.className='msg '+c;e.textContent=t;}}
function allSections(){return Array.from(document.querySelectorAll('main>section'));}
function showView(v){allSections().forEach(s=>s.classList.add('hidden'));if(v==='home'){allSections().forEach(s=>s.classList.remove('hidden'));['register','attendance','admin'].forEach(x=>$(x)?.classList.add('hidden'));window.scrollTo(0,0);return;}$(v)?.classList.remove('hidden');window.scrollTo(0,0);}
function openAdminWindow(){window.open('index.html?admin=1','_blank');}
function setupAdmin(){document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='관리자')b.onclick=()=>openAdminWindow();});if(location.search.includes('admin=1'))showView('admin');}

// PDF 첨부 2개 이상 지원
function setupEventFileInputs() {
  const addBtn = $('addFileBtn');
  if(!addBtn) return;
  addBtn.addEventListener('click', () => {
    const container = $('fileInputs');
    const row = document.createElement('div');
    row.classList.add('file-row');
    row.innerHTML = `
      <input type="text" class="file-name" placeholder="파일명">
      <input type="text" class="file-url" placeholder="PDF 주소">
      <button type="button" class="removeFileBtn">삭제</button>
    `;
    container.appendChild(row);
    row.querySelector('.removeFileBtn').addEventListener('click',()=>row.remove());
  });
}

async function uploadEventPdfIfNeeded(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return null;
  if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw Error('PDF 파일만 첨부 가능합니다.');
  const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g,'_');
  const path = 'event-'+Date.now()+'-'+safe;
  const up = await db.storage.from('event-guides').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(up.error) throw up.error;
  const pub = db.storage.from('event-guides').getPublicUrl(path);
  return {name:file.name,url:pub.data.publicUrl};
}

// 행사 저장
async function saveEvent(){
  try{
    const btn = $('saveEventBtn');
    btn.disabled=true;
    btn.textContent='저장 중...';

    const rows = document.querySelectorAll('#fileInputs .file-row');
    const pdfFiles = [];
    for(const row of rows){
      const fileInput = row.querySelector('input[type="file"]');
      let pdf=null;
      if(fileInput && fileInput.files && fileInput.files[0]){
        pdf = await uploadEventPdfIfNeeded(fileInput);
      } else {
        const name = row.querySelector('.file-name')?.value.trim();
        const url = row.querySelector('.file-url')?.value.trim();
        if(name && url) pdf={name,url};
      }
      if(pdf) pdfFiles.push(pdf);
    }

    const id = $('eventId').value || null;
    const current = (S.adminEvents||[]).find(e=>e.id===id);

    await rpc('admin_save_event',{
      p_pin:S.pin,
      p_id:id,
      p_title:$('eventTitle').value,
      p_event_date:$('eventDate').value||null,
      p_place:$('eventPlace').value,
      p_content:$('eventContent').value,
      p_pdf_files: pdfFiles,
      p_active: current?!!current.active:false
    });

    resetEventForm();
    await loadAdmin();
    await loadPublic();
    msg('adminMsg','행사를 저장했습니다. 안내 여부는 행사 목록의 회원 안내 선택 버튼에서 설정합니다.','ok');
  } catch(e){
    msg('adminMsg',e.message,'bad');
  } finally {
    const btn = $('saveEventBtn');
    btn.disabled=false;
    btn.textContent='행사 저장';
  }
}

// 회원용 안내 UI
async function guide(){
  const e = activeEvent();
  if(!e || !e.pdf_files || !e.pdf_files.length){
    alert('행사 안내가 없습니다.');
    return;
  }
  if(e.pdf_files.length===1){
    window.open(e.pdf_files[0].url,'_blank');
  } else {
    const choice = prompt('다음 자료 중 선택:\n'+e.pdf_files.map((f,i)=>`${i+1}. ${f.name}`).join('\n'));
    const idx = parseInt(choice,10);
    if(idx>0 && idx<=e.pdf_files.length) window.open(e.pdf_files[idx-1].url,'_blank');
  }
}

// 초기화
document.addEventListener('DOMContentLoaded',()=>{
  setupEventFileInputs();
  $('saveEventBtn').onclick = saveEvent;
  $('guideBtn').onclick = guide;
});
