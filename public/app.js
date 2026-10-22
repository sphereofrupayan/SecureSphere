let token=localStorage.getItem("synctune_token");
let socket=null;
let player=null;
let pendingState=null;
let suppressEvents=false;
let lastVideoId="";
let remoteControlUntil=0;
let lastSyncAt=0;
let sidebarClockInterval=null;
let featureRevealObserver=null;
const $=id=>document.getElementById(id);
function revealFeatureCards(){const cards=document.querySelectorAll(".feature-card");if(!cards.length)return;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window)){cards.forEach(card=>card.classList.add("is-visible"));return;}document.body.classList.add("has-feature-reveal");if(featureRevealObserver)featureRevealObserver.disconnect();featureRevealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");featureRevealObserver.unobserve(entry.target);}}),{threshold:0.16,rootMargin:"0px 0px -40px 0px"});cards.forEach(card=>featureRevealObserver.observe(card));}
function formatRoomDuration(milliseconds){const totalSeconds=Math.max(0,Math.floor(milliseconds/1000));const days=Math.floor(totalSeconds/86400);const hours=Math.floor(totalSeconds%86400/3600);const minutes=Math.floor(totalSeconds%3600/60);const seconds=totalSeconds%60;const clock=[hours,minutes,seconds].map(value=>String(value).padStart(2,"0")).join(":");return days?`${days}d ${clock}`:clock;}
function updateSidebarClock(roomOpenedAt){const now=new Date();$("sidebarTime").textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(now);$("sidebarTime").dateTime=now.toISOString();$("sidebarDate").textContent=new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(now);$("roomDuration").textContent=Number.isFinite(roomOpenedAt)?formatRoomDuration(now.getTime()-roomOpenedAt):"Waiting for listeners";}
function startSidebarClock(roomOpenedAt){if(sidebarClockInterval)clearInterval(sidebarClockInterval);updateSidebarClock(roomOpenedAt);sidebarClockInterval=setInterval(()=>updateSidebarClock(roomOpenedAt),1000);}
function setAudioFocus(enabled){const card=$("playerCard");const button=$("audioFocusBtn");const note=$("audioFocusNote");if(!card||!button||!note)return;card.classList.toggle("audio-focus",enabled);button.setAttribute("aria-pressed",String(enabled));note.hidden=!enabled;}
document.querySelectorAll(".sidebar-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".sidebar-link").forEach(item=>item.removeAttribute("aria-current"));link.setAttribute("aria-current","location");}));
const audioFocusBtn=$("audioFocusBtn");
if(audioFocusBtn){setAudioFocus(localStorage.getItem("synctune_audio_focus")==="true");audioFocusBtn.addEventListener("click",()=>{const enabled=!$("playerCard").classList.contains("audio-focus");localStorage.setItem("synctune_audio_focus",String(enabled));setAudioFocus(enabled);});}
function applyTheme(){const light=localStorage.getItem("synctune_theme")==="night-light";document.body.classList.toggle("night-light",light);if($("themeBtn"))$("themeBtn").textContent=light?"☀ Dark Mode":"☾ Night Light";}
function showApp(username,isAdmin){$("loginView").classList.add("hidden");$("appView").classList.remove("hidden");$("currentUser").textContent=username;$("welcomeName").textContent=username;$("sidebarUsername").textContent=username;const adminCard=$("adminCard");if(adminCard)adminCard.classList.toggle("hidden",!isAdmin);if(isAdmin)loadUsers();connectSocket();applyTheme();revealFeatureCards();if(window.SecureSphereDots)window.SecureSphereDots.start();}
function logout(){localStorage.removeItem("synctune_token");if(socket)socket.disconnect();location.reload();}
async function api(url,options={}){const res=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{}),...(token?{Authorization:`Bearer ${token}`}:{})}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"Request failed");return data;}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const data=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("username").value,password:$("password").value})});token=data.token;localStorage.setItem("synctune_token",token);showApp(data.username,data.isAdmin);}catch(err){$("loginError").textContent=err.message;}});
$("logoutBtn").onclick=logout;
$("themeBtn").onclick=()=>{const light=!document.body.classList.contains("night-light");localStorage.setItem("synctune_theme",light?"night-light":"dark");applyTheme();};
const adminForm=$("adminForm");
if(adminForm)adminForm.addEventListener("submit",async e=>{e.preventDefault();const message=$("adminMessage");message.textContent="";message.classList.remove("error");try{const result=await api("/api/admin/users",{method:"POST",body:JSON.stringify({username:$("newUsername").value,password:$("newPassword").value})});message.textContent=result.message||"User created successfully.";$("newUsername").value="";$("newPassword").value="";loadUsers();}catch(err){message.textContent=err.message;message.classList.add("error");}});
async function loadUsers(){const list=$("userList");if(!list)return;try{const data=await api("/api/admin/users");list.innerHTML="";const friends=data.users.filter(user=>!user.is_admin);$("totalUsers").textContent=data.users.length;$("friendUsers").textContent=friends.length;if(!data.users.length){list.innerHTML='<div class="queue-empty">No accounts found</div>';return;}data.users.forEach(user=>{const row=document.createElement("div");row.className="user-row";row.innerHTML=`<div><strong>${escapeHtml(user.username)}</strong><span>${user.is_admin?"Administrator":`Friend account • Created ${escapeHtml(formatDate(user.created_at))}`}</span></div>${user.is_admin?"<span class=\"admin-badge\">Protected</span>":`<div class="user-actions"><button class="small-btn" data-password="${user.id}">Password</button><button class="small-btn danger" data-delete="${user.id}">Delete</button></div>`}`;list.appendChild(row);});list.querySelectorAll("[data-delete]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Delete this user?"))return;try{await api(`/api/admin/users/${btn.dataset.delete}`,{method:"DELETE"});loadUsers();}catch(err){alert(err.message);}});list.querySelectorAll("[data-password]").forEach(btn=>btn.onclick=async()=>{const password=prompt("Enter the new password:");if(password===null)return;try{await api(`/api/admin/users/${btn.dataset.password}/password`,{method:"PUT",body:JSON.stringify({password})});alert("Password updated.");}catch(err){alert(err.message);}});}catch(err){list.innerHTML=`<p class="error">${escapeHtml(err.message)}</p>`;}}
async function downloadAdminExport(format){
  const message=$("exportMessage");
  const buttons=[$("exportCsvBtn"),$("exportPdfBtn")].filter(Boolean);
  message.textContent="";
  message.classList.remove("error");
  buttons.forEach(button=>button.disabled=true);
  try{
    const response=await fetch(`/api/admin/exports/database.${format}`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:"no-store"});
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data.error||`Export failed (${response.status})`);
    }
    const blob=await response.blob();
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`securesphere-database-export.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    message.textContent=`${format.toUpperCase()} export downloaded.`;
  }catch(error){
    message.textContent=error instanceof Error?error.message:"Unable to download the export.";
    message.classList.add("error");
  }finally{
    buttons.forEach(button=>button.disabled=false);
  }
}
if($("exportCsvBtn"))$("exportCsvBtn").addEventListener("click",()=>downloadAdminExport("csv"));
if($("exportPdfBtn"))$("exportPdfBtn").addEventListener("click",()=>downloadAdminExport("pdf"));
function formatDate(value){const date=new Date(String(value).replace(" ","T")+"Z");return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"}).format(date);}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
async function init(){applyTheme();try{const response=await fetch("/api/config");if(!response.ok)throw new Error(`Room configuration request failed (${response.status})`);const config=await response.json();$("roomName").textContent=config.roomName;const roomOpenedAt=config.roomOpenedAt===null?null:Number(config.roomOpenedAt);startSidebarClock(Number.isFinite(roomOpenedAt)&&roomOpenedAt>0?roomOpenedAt:null);}catch(error){$("roomDuration").textContent="Unavailable";startSidebarClock(null);console.error("Unable to load room configuration",error);}if(token){try{const me=await api("/api/me");showApp(me.username,me.isAdmin);}catch{localStorage.removeItem("synctune_token");token=null;}}}
function connectSocket(){if(socket){socket.disconnect();socket=null;}socket=io({auth:{token},transports:["websocket","polling"],reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:250,reconnectionDelayMax:1500});socket.on("connect",()=>{$("status").textContent="Connected • synchronized room";socket.emit("requestSync");});socket.on("connect_error",()=>{$("status").textContent="Connection failed. Reconnecting...";});socket.on("presence",data=>{$("presence").textContent=`${data.count} online`;});socket.on("roomStatus",data=>{const roomOpenedAt=data.roomOpenedAt===null?null:Number(data.roomOpenedAt);startSidebarClock(Number.isFinite(roomOpenedAt)&&roomOpenedAt>0?roomOpenedAt:null);});socket.on("errorMessage",msg=>{$("songError").textContent=msg;$("queueError").textContent=msg;});socket.on("state",state=>applyState(state));socket.on("chatHistory",renderChat);socket.on("chatMessage",appendChatMessage);}
function updateMediaSession(state){if(!("mediaSession" in navigator))return;navigator.mediaSession.metadata=new MediaMetadata({title:state.videoId?"Shared YouTube track":"SecureSphere",artist:state.changedBy?`Shared by ${state.changedBy}`:"Synchronized music",album:"Friends Room"});navigator.mediaSession.playbackState=state.playing?"playing":"paused";}
function renderChat(messages){const list=$("chatList");if(!list)return;list.innerHTML="";if(!messages.length){list.innerHTML='<div class="queue-empty">No messages yet</div>';return;}messages.forEach(appendChatMessage);}
function appendChatMessage(message){const list=$("chatList");if(!list)return;const empty=list.querySelector(".queue-empty");if(empty)empty.remove();const row=document.createElement("div");row.className="chat-message";row.innerHTML=`<strong>${escapeHtml(message.username)}</strong><span>${escapeHtml(message.message)}</span>`;list.appendChild(row);list.scrollTop=list.scrollHeight;}
function setupBackgroundPlayback(){if(!("mediaSession" in navigator))return;const action=(name,handler)=>{try{navigator.mediaSession.setActionHandler(name,handler);}catch{}};action("play",()=>socket?.emit("play",currentTime()));action("pause",()=>socket?.emit("pause",currentTime()));action("seekbackward",()=>{if(player?.seekTo)player.seekTo(Math.max(0,currentTime()-10),true);});action("seekforward",()=>{if(player?.seekTo)player.seekTo(currentTime()+10,true);});action("nexttrack",()=>socket?.emit("next"));}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&socket)socket.emit("requestSync");});
function markRemoteControl(ms=1200){remoteControlUntil=Date.now()+ms;suppressEvents=true;setTimeout(()=>{if(Date.now()>=remoteControlUntil)suppressEvents=false;},ms+50);}
function ensurePlayer(videoId){if(!window.YT||!YT.Player){pendingState={...pendingState,videoId};return;}if(!player){$("emptyPlayer").classList.add("hidden");player=new YT.Player("player",{videoId,playerVars:{playsinline:1,controls:1,rel:0,origin:location.origin},events:{onReady:()=>{if(pendingState)syncPlayerToState(pendingState,true);},onStateChange:event=>{if(suppressEvents||Date.now()<remoteControlUntil)return;if(event.data===YT.PlayerState.ENDED){socket?.emit("ended");return;}if(event.data===YT.PlayerState.PLAYING){socket?.emit("play",player.getCurrentTime());}else if(event.data===YT.PlayerState.PAUSED){socket?.emit("pause",player.getCurrentTime());}}}});}else if(player.getVideoData()?.video_id!==videoId){const state=pendingState||{};const elapsed=(Date.now()-Number(state.serverTime||Date.now()))/1000;const desired=Math.max(0,Number(state.position||0)+(state.playing?elapsed:0));markRemoteControl(1600);lastVideoId=videoId;player.loadVideoById({videoId,startSeconds:desired});}}
function syncPlayerToState(state,force){if(!player||!player.seekTo)return;const elapsed=(Date.now()-Number(state.serverTime||Date.now()))/1000;const desired=Math.max(0,Number(state.position||0)+(state.playing?elapsed:0));const actual=Number(player.getCurrentTime()||0);const differentVideo=lastVideoId!==state.videoId||player.getVideoData()?.video_id!==state.videoId;markRemoteControl(force?1800:1000);if(differentVideo){lastVideoId=state.videoId;player.loadVideoById({videoId:state.videoId,startSeconds:desired});}else if(Math.abs(actual-desired)>0.8){player.seekTo(desired,true);}if(state.playing){player.setPlaybackRate(1);player.playVideo();}else{player.setPlaybackRate(1);player.pauseVideo();}$("status").textContent=state.playing?`Playing • ${state.changedBy}`:`Paused • ${state.changedBy}`;lastSyncAt=Date.now();setTimeout(()=>{if(player&&pendingState===state&&state.playing)player.setPlaybackRate(1);},500);}
function applyState(state){pendingState={...state,receivedAt:performance.now()};renderQueue(state.queue||[]);if(!state.videoId){$("emptyPlayer").classList.remove("hidden");$("status").textContent="Queue a song to start the room.";return;}$("emptyPlayer").classList.add("hidden");ensurePlayer(state.videoId);if(player)syncPlayerToState(pendingState,false);}
function applyState(state){pendingState={...state,receivedAt:performance.now()};updateMediaSession(state);renderQueue(state.queue||[]);if(!state.videoId){$("emptyPlayer").classList.remove("hidden");$("status").textContent="Queue a song to start the room.";return;}$("emptyPlayer").classList.add("hidden");ensurePlayer(state.videoId);if(player)syncPlayerToState(pendingState,false);}
function renderQueue(items){const list=$("queueList");if(!list)return;list.innerHTML="";if(!items.length){list.innerHTML='<div class="queue-empty">Queue is empty</div>';return;}items.forEach((item,index)=>{const row=document.createElement("div");row.className="queue-row";row.innerHTML=`<div class="queue-number">${index+1}</div><div class="queue-info"><strong>YouTube song</strong><span>Added by ${escapeHtml(item.addedBy)}</span></div><button class="small-btn danger" data-remove="${item.id}">Remove</button>`;list.appendChild(row);});list.querySelectorAll("[data-remove]").forEach(btn=>btn.onclick=()=>socket?.emit("removeFromQueue",btn.dataset.remove));}
function currentTime(){return player&&player.getCurrentTime?player.getCurrentTime():0;}
$("songForm").addEventListener("submit",e=>{e.preventDefault();$("songError").textContent="";if(!socket)return;socket.emit("setSong",$("youtubeUrl").value);$("youtubeUrl").value="";});
$("queueForm").addEventListener("submit",e=>{e.preventDefault();$("queueError").textContent="";if(!socket)return;socket.emit("addToQueue",$("queueUrl").value);$("queueUrl").value="";});
$("playBtn").onclick=()=>{if(player&&socket)socket.emit("play",currentTime());};
$("chatForm").addEventListener("submit",e=>{e.preventDefault();const input=$("chatMessage");const send=$("chatSendBtn");const message=input.value.trim();if(!message||!socket)return;send.disabled=true;socket.timeout(5000).emit("sendMessage",message,(error,result)=>{send.disabled=false;if(error||!result?.ok){$("chatError").textContent=result?.error||"Connection lost before your message was delivered.";return;}$("chatError").textContent="";input.value="";input.focus();});});
$("emojiBtn").onclick=()=>{const input=$("chatMessage");input.value+=input.value?" 😊":"😊";input.focus();};
$("pauseBtn").onclick=()=>{if(player&&socket)socket.emit("pause",currentTime());};
$("nextBtn").onclick=()=>{if(socket)socket.emit("next");};
$("syncBtn").onclick=()=>{if(socket)socket.emit("requestSync");};
function onYouTubeIframeAPIReady(){if(pendingState?.videoId)ensurePlayer(pendingState.videoId);}
setupBackgroundPlayback();
setInterval(()=>{if(!player||!socket||!pendingState?.videoId||!pendingState.playing)return;const now=Date.now();if(now-lastSyncAt<1200||now<remoteControlUntil)return;const desired=Number(pendingState.position||0)+(now-Number(pendingState.serverTime||now))/1000;const actual=currentTime();const drift=desired-actual;if(Math.abs(drift)>1.25){markRemoteControl(700);player.seekTo(desired,true);}else if(Math.abs(drift)>0.12){player.setPlaybackRate(drift>0?1.03:0.97);}else{player.setPlaybackRate(1);}},900);
init();