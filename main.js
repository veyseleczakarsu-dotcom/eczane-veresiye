const { app, BrowserWindow, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const RECOVERY_SCHEME = 'eczane-veresiye';
const RECOVERY_PREFIX = RECOVERY_SCHEME + '://auth-recovery';
let mainWindow = null;
let pendingDeepLink = null;

function writeUpdateLog(message,error){
  try{
    const detail=error ? ` ${error.stack||error.message||String(error)}` : '';
    const logDir=app.getPath('logs');
    fs.mkdirSync(logDir,{recursive:true});
    fs.appendFileSync(path.join(logDir,'update.log'),`[${new Date().toISOString()}] ${message}${detail}\n`);
  }catch{}
}

function recoveryHashFromArg(arg) {
  if (typeof arg !== 'string') return null;
  const value = arg.trim().replace(/^"|"$/g, '');
  if (!value.toLowerCase().startsWith(RECOVERY_PREFIX)) return null;
  const rest=value.slice(RECOVERY_PREFIX.length);
  if(rest && !/^\/?(#|\?|$)/.test(rest)) return null;
  const hashIndex=value.indexOf('#');
  return hashIndex>=0 ? value.slice(hashIndex) : null;
}

function focusMainWindow(){
  if(!mainWindow) return;
  if(mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function deliverPendingDeepLink() {
  if (!mainWindow || !pendingDeepLink || !mainWindow.webContents) return;
  if(mainWindow.webContents.isLoading()) return;
  const hash = JSON.stringify(pendingDeepLink);
  mainWindow.webContents.executeJavaScript(`window.location.hash=${hash}; window.dispatchEvent(new HashChangeEvent('hashchange'));`)
    .catch(() => {});
  pendingDeepLink = null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = commandLine.map(recoveryHashFromArg).find(Boolean);
    if (deepLink) pendingDeepLink = deepLink;
    if (mainWindow) {
      focusMainWindow();
      deliverPendingDeepLink();
    }
  });
}

if (process.argv.length >= 2) {
  const deepLink = process.argv.map(recoveryHashFromArg).find(Boolean);
  if (deepLink) pendingDeepLink = deepLink;
}

if (process.platform === 'darwin') {
  app.on('open-url', (event,url)=>{
    event.preventDefault();
    const deepLink=recoveryHashFromArg(url);
    if(!deepLink) return;
    pendingDeepLink=deepLink;
    focusMainWindow();
    deliverPendingDeepLink();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    title: 'Eczane Veresiye', backgroundColor: '#f4f6fa',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged }
  });
  // Uygulama dışına gezinme ve yeni pencere açma engellenir (XSS etkisini sınırlar).
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('did-finish-load', deliverPendingDeepLink);
}

function setupAutoUpdates(){
  if(!app.isPackaged) return;
  // Yeni sürümü kullanıcıdan ayrıca indirme onayı istemeden indir.
  // Kurulum, aktif işlem yarıda kalmasın diye yeniden başlatma onayından sonra yapılır.
  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  let updateReady=false;
  let promptOpen=false;
  let snoozedUntil=0;
  autoUpdater.on('error', err=>{
    updateReady=false;
    promptOpen=false;
    try{ mainWindow?.setOpacity?.(1); }catch(resetErr){ console.error(resetErr); }
    writeUpdateLog('Otomatik güncelleme hatası',err);
    console.error('Otomatik güncelleme hatası',err);
  });
  autoUpdater.on('update-available', info=>{
    console.log(`Yeni sürüm bulundu; otomatik indiriliyor (${info.version}).`);
  });
  autoUpdater.on('update-downloaded', async()=>{
    if(updateReady || promptOpen) return;
    updateReady=true;
    promptOpen=true;
    // Kullanıcıya güncelleme başlamadan önce açıkça haber ver; pencereyi
    // tamamen gizlemek yerine soluklaştırarak uygulamanın hâlâ açık olduğunu
    // göster.
    try{ mainWindow?.setOpacity?.(0.72); }catch(err){ console.error(err); }
    try{
      const result=await dialog.showMessageBox(mainWindow,{
        type:'info',
        title:'Güncelleme yapılacak',
        message:'Yeni sürüm hazır.',
        detail:'Güncellemeyi başlatırsan uygulama kısa süreliğine yeniden başlayacak. Açık oturumun korunacak; işlem sırasında pencere kısa süre soluk görünecek.',
        buttons:['Güncellemeyi başlat','Daha sonra'],
        defaultId:0,
        cancelId:1
      });
      if(result.response===0){
        try{ mainWindow?.setOpacity?.(0.55); }catch(err){ console.error(err); }
        try{
          await mainWindow?.webContents?.executeJavaScript(
            "localStorage.setItem('eczaneVeresiyeUpdateRestartAt',String(Date.now()))"
          );
        }catch(err){ console.error('Güncelleme işareti yazılamadı',err); }
        // Bildirimi okuyabilmesi için pencereyi kısa süre görünür bırak.
        setTimeout(()=>autoUpdater.quitAndInstall(true,true),700);
      }else{
        updateReady=false;
        snoozedUntil=Date.now()+2*60*60*1000;
        try{ mainWindow?.setOpacity?.(1); }catch(err){ console.error(err); }
      }
      promptOpen=false;
    }catch(err){
      updateReady=false;
      promptOpen=false;
      try{ mainWindow?.setOpacity?.(1); }catch(resetErr){ console.error(resetErr); }
      writeUpdateLog('Güncelleme bildirimi gösterilemedi',err);
      console.error('Güncelleme bildirimi gösterilemedi',err);
    }
  });
  const checkForUpdates=()=>{
    if(updateReady || promptOpen || Date.now()<snoozedUntil) return;
    autoUpdater.checkForUpdates().catch(err=>{
      writeUpdateLog('Güncelleme kontrolü başarısız',err);
      console.error('Güncelleme kontrolü başarısız',err);
    });
  };
  // Açılışta, pencere yeniden öne geldiğinde ve kısa aralıklarla kontrol et.
  // Yayın dosyaları birkaç saniye gecikmeli hazır olsa bile sonraki denemede yakalanır.
  setTimeout(checkForUpdates,8000);
  setInterval(checkForUpdates,60*1000);
  mainWindow.on('focus',()=>{
    if(!updateReady && !promptOpen && Date.now()>=snoozedUntil) checkForUpdates();
  });
}
if(gotSingleInstanceLock) app.whenReady().then(() => {
  if(app.isPackaged) Menu.setApplicationMenu(null);
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(RECOVERY_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(RECOVERY_SCHEME);
  }
  createWindow();
  setupAutoUpdates();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
