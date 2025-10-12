/* app.js —— MyMusic 资产上传（完整修改版 | 支持 JPG/PNG 回退）
 * 功能总览：
 * 1) 读取本地音频元数据（jsmediatags）
 * 2) 上传音频文件到 Worker（POST）
 * 3) 上传封面图片（可为 URL 或文件）
 * 4) 自动搜索封面（iTunes + Last.fm 可选）
 * 5) 文件列表展示（支持 JPG→PNG 回退）
 */

const WORKER_URL = 'https://music-gateway.mikephiemy.workers.dev';
const PUBLIC_BASE_URL = 'https://music.mikephie.site';
const LASTFM_API_KEY = '3e097ab8acbb6dc3833e37e18919cfd9';

const form = document.getElementById('uploadForm');
const musicFileInput = document.getElementById('musicFile');
const coverUrlInput = document.getElementById('coverUrlInput');
const searchCoverBtn = document.getElementById('searchCoverBtn');
const submitBtn = document.getElementById('submitBtn');
const messageDisplay = document.getElementById('message');
const metadataDisplay = document.getElementById('metadataDisplay');
const titleInput = document.getElementById('titleInput');
const artistInput = document.getElementById('artistInput');
const albumInput = document.getElementById('albumInput');
const linkOutputDiv = document.getElementById('linkOutput');
const musicLinkAnchor = document.getElementById('musicLink');
const copyLinkButton = document.getElementById('copyLinkBtn');
const listAssetsBtn = document.getElementById('listAssetsBtn');
const assetListDisplay = document.getElementById('assetListDisplay');

let lastMusicKey = '';

function sanitizeName(name) {
  if (!name) return '';
  return name.replace(/[^a-zA-Z0-9\s\u4e00-\u9fa5.\-_]/g, '').trim();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function deleteAsset(keyToDelete, elementToRemove) {
  if (!confirm(`确定要删除文件:\n${keyToDelete}\n\n该操作不可撤销！`)) return;
  messageDisplay.textContent = `正在删除文件: ${keyToDelete}...`;
  try {
    const response = await fetch(`${WORKER_URL}?key=${encodeURIComponent(keyToDelete)}`, { method: 'DELETE' });
    const result = await response.json();
    if (response.ok && result.ok) {
      messageDisplay.textContent = `删除成功: ${keyToDelete}\n剩余资产数: ${result.remaining}`;
      if (elementToRemove) elementToRemove.remove();
    } else {
      messageDisplay.textContent = `删除失败: ${keyToDelete}\n错误: ${result.error || '未知错误'}`;
    }
  } catch (e) {
    messageDisplay.textContent = `网络错误: ${e.message}`;
  }
}

musicFileInput.addEventListener('change', () => {
  const file = musicFileInput.files?.[0];
  if (!file) return;
  metadataDisplay.style.display = 'block';
  titleInput.value = '正在读取...';
  artistInput.value = '';
  albumInput.value = '';
  if (typeof jsmediatags === 'undefined') {
    titleInput.value = '无法读取元数据，请手动输入';
    return;
  }
  jsmediatags.read(file, {
    onSuccess: tag => {
      titleInput.value = tag.tags.title || file.name || '';
      artistInput.value = tag.tags.artist || '';
      albumInput.value = tag.tags.album || '';
    },
    onError: () => {
      titleInput.value = file.name || '';
      artistInput.value = '';
      albumInput.value = '(读取失败)';
    },
  });
});

async function uploadFile(file, customKey, isCover = false, sourceUrl = null) {
  const formData = new FormData();
  if (sourceUrl) {
    formData.append('source_url', sourceUrl);
    if (customKey) formData.append('key', customKey);
  } else if (file) formData.append('file', file);
  if (!isCover && file) {
    formData.append('title', titleInput.value);
    formData.append('artist', artistInput.value);
    formData.append('album', albumInput.value);
  }
  const response = await fetch(WORKER_URL, { method: 'POST', body: formData });
  const result = await response.json();
  return { response, result };
}

const DEFAULT_COUNTRY = 'sg';
const DEFAULT_SIZE = 1200;

async function fetchItunesCoverByQuery(term, { country = DEFAULT_COUNTRY, size = DEFAULT_SIZE } = {}) {
  if (!term) return null;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&country=${country}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const hit = json.results?.[0];
  if (!hit?.artworkUrl100) return null;
  const large = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  return { url: large, title: hit.collectionName, artist: hit.artistName, source: 'itunes' };
}

async function fetchLastfmCoverByQuery(term) {
  if (!LASTFM_API_KEY) return null;
  const parts = term.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const artist = parts[0];
  const album = parts.slice(1).join(' ');
  const lfUrl = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&format=json`;
  try {
    const r = await fetch(lfUrl);
    if (!r.ok) return null;
    const data = await r.json();
    const img = data?.album?.image?.find(i => i.size === 'extralarge' && i['#text']);
    if (!img?.['#text']) return null;
    return { url: img['#text'], title: data.album?.name, artist: data.album?.artist, source: 'lastfm' };
  } catch {
    return null;
  }
}

function validateImage(url) {
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      img.onload = img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    setTimeout(() => finish(false), 2500);
  });
}

async function findAlbumCoverURLByTerm(term, { country = DEFAULT_COUNTRY, size = DEFAULT_SIZE } = {}) {
  const it = await fetchItunesCoverByQuery(term, { country, size });
  if (it && await validateImage(it.url)) return it;
  const lf = await fetchLastfmCoverByQuery(term);
  if (lf && await validateImage(lf.url)) return lf;
  return null;
}

searchCoverBtn.onclick = async () => {
  let term = (coverUrlInput?.value || '').trim();
  if (!term && artistInput.value && albumInput.value) term = `${artistInput.value} ${albumInput.value}`.trim();
  if (!term) {
    alert('在“封面图片 URL”输入框中输入搜索词，例如：周杰伦 摩羯座');
    return;
  }
  messageDisplay.textContent = `正在搜索封面：${term} ...`;
  searchCoverBtn.disabled = true;
  try {
    const hit = await findAlbumCoverURLByTerm(term);
    if (hit) {
      coverUrlInput.value = hit.url;
      messageDisplay.textContent += `\n✅ 已找到封面（来源：${hit.source}）\n${hit.url}`;
    } else messageDisplay.textContent += `\n❌ 未找到匹配封面`;
  } catch (e) {
    messageDisplay.textContent += `\n❌ 搜索失败：${e.message}`;
  } finally {
    searchCoverBtn.disabled = false;
  }
};

form.addEventListener('submit', async e => {
  e.preventDefault();
  messageDisplay.textContent = '开始上传音乐文件...';
  linkOutputDiv.style.display = 'none';
  submitBtn.disabled = true;
  const musicFile = musicFileInput.files?.[0];
  const coverUrl = (coverUrlInput?.value || '').trim();
  if (!musicFile) {
    messageDisplay.textContent = '请选择一个音乐文件';
    submitBtn.disabled = false;
    return;
  }
  try {
    const { response: musicResponse, result: musicResult } = await uploadFile(musicFile, null, false, null);
    if (!musicResponse.ok) {
      messageDisplay.textContent += `\n上传失败：${musicResult.error || '未知错误'}`;
      return;
    }
    const musicKey = musicResult.keyUsed;
    const publicUrl = `${PUBLIC_BASE_URL}/${musicKey}`;
    musicLinkAnchor.href = publicUrl;
    musicLinkAnchor.textContent = publicUrl;
    linkOutputDiv.style.display = 'block';
    copyLinkButton.onclick = async () => {
      const ok = await copyToClipboard(publicUrl);
      copyLinkButton.textContent = ok ? '已复制!' : '复制失败';
      setTimeout(() => (copyLinkButton.textContent = '复制链接'), 1200);
    };
    if (coverUrl) {
      messageDisplay.textContent += `\n上传封面中...`;
      const albumName = sanitizeName(albumInput.value) || '';
      const artistName = sanitizeName(artistInput.value) || '';
      const titleName = sanitizeName(titleInput.value) || '';
      let baseName = albumName || sanitizeName(`${artistName} ${titleName}`) || `cover_${Date.now()}`;
      const lower = coverUrl.toLowerCase();
      const ext = /\.png(\?|$)/.test(lower) ? '.PNG' : /\.jpe?g(\?|$)/.test(lower) ? '.JPG' : '.JPG';
      const coverKey = `covers/${baseName}${ext}`;
      const { response: coverResponse, result: coverResult } = await uploadFile(null, coverKey, true, coverUrl);
      if (coverResponse.ok) messageDisplay.textContent += `\n封面上传成功：${coverResult.keyUsed}`;
      else messageDisplay.textContent += `\n封面上传失败：${coverResult.error || '未知错误'}`;
    }
  } catch (error) {
    messageDisplay.textContent += `\n网络错误：${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

async function fetchAndDisplayAssets() {
  assetListDisplay.innerHTML = '正在加载资产列表...';
  assetListDisplay.style.display = 'block';
  listAssetsBtn.disabled = true;
  try {
    const response = await fetch(`${WORKER_URL}?action=list`);
    const data = await response.json();
    if (response.ok && data.assets) {
      let html = `<div style="padding:10px 15px;background:#f8f8f8;border-bottom:1px solid #ddd;">
        <b>总数:</b> ${data.count} (更新于: ${new Date(data.updatedAt).toLocaleTimeString()})
      </div>`;
      data.assets.forEach((asset, i) => {
        const isAudio = asset.type === 'audio';
        const album = sanitizeName(asset.metadata?.album || '');
        const encoded = encodeURIComponent(album);
        const baseCover = `${PUBLIC_BASE_URL}/covers/${encoded}`;
        const guessedCoverJPG = album ? `${baseCover}.JPG` : '';
        const guessedCoverPNG = album ? `${baseCover}.PNG` : '';
        const metaCover = asset.metadata?.coverUrl || '';
        const broken = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ccc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='feather feather-image'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
        html += `
          <div id="asset-${i}" style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #eee;">
            <img id="cover-${i}" src="${guessedCoverJPG || metaCover || asset.url}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;">
            <script>
              (function(){
                const img = document.currentScript.previousElementSibling;
                const tryPNG=${JSON.stringify(guessedCoverPNG)};
                const tryMeta=${JSON.stringify(metaCover)};
                const fallback=${JSON.stringify(broken)};
                img.onerror=function stage1(){
                  img.onerror=function stage2(){
                    if(tryMeta&&img.src!==tryMeta){
                      img.onerror=function(){img.src=fallback;};
                      img.src=tryMeta;
                    }else img.src=fallback;
                  };
                  if(tryPNG&&img.src!==tryPNG){img.src=tryPNG;}
                  else if(tryMeta){img.onerror=function(){img.src=fallback;};img.src=tryMeta;}
                  else img.src=fallback;
                };
              })();
            </script>
            <div style="flex:1;">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${asset.name}</div>
              <div style="color:#666;font-size:12px;">${asset.metadata?.artist || '未知艺术家'} | ${asset.metadata?.album || '未知专辑'}</div>
            </div>
            <div style="display:flex;gap:8px;">
              ${isAudio ? `<button id="play-${i}">播放</button>` : ''}
              ${isAudio ? `<audio id="audio-${i}" src="${asset.url}"></audio>` : ''}
              <button onclick="navigator.clipboard.writeText('${asset.url}').then(()=>{this.textContent='已复制!';setTimeout(()=>{this.textContent='复制链接';},1000);})">复制链接</button>
              <button id="del-${i}" style="background:#dc3545;color:white;">删除</button>
            </div>
          </div>`;
      });
      assetListDisplay.innerHTML = html;
      data.assets.forEach((asset, i) => {
        const del = document.getElementById(`del-${i}`);
        const play = document.getElementById(`play-${i}`);
        const audio = document.getElementById(`audio-${i}`);
        const item = document.getElementById(`asset-${i}`);
        if (del) del.onclick = () => deleteAsset(asset.name, item);
        if (play && audio) {
          play.onclick = () => {
            if (audio.paused) {
              document.querySelectorAll('audio').forEach(a => {
                if (a !== audio) {
                  a.pause();
                  const b = document.getElementById(`play-${a.id.split('-')[1]}`);
                  if (b) b.textContent = '播放';
                }
              });
              audio.play();
              play.textContent = '⏸ 暂停';
            } else {
              audio.pause();
              play.textContent = '播放';
            }
          };
          audio.onended = () => (play.textContent = '播放');
        }
      });
    } else assetListDisplay.textContent = `加载失败：${data.error || 'Worker 返回错误'}`;
  } catch (e) {
    assetListDisplay.textContent = `网络错误：${e.message}`;
  } finally {
    listAssetsBtn.disabled = false;
  }
}

listAssetsBtn.addEventListener('click', fetchAndDisplayAssets);
