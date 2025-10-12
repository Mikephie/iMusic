// app.js
/* 干净单列布局版 + 列表新增「复制封面链接」按钮（复制当前行封面实际 src） */
const WORKER_URL = 'https://music-gateway.mikephiemy.workers.dev';
const PUBLIC_BASE_URL = 'https://music.mikephie.site';

document.addEventListener('DOMContentLoaded', () => {
  // 元素
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

  // 预览 & Lightbox
  const coverPreviewContainer = document.getElementById('coverPreviewContainer');
  const coverPreview = document.getElementById('coverPreview');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');

  // 工具
  const sanitizeName = s => (s || '').replace(/[^a-zA-Z0-9\s\u4e00-\u9fa5.\-_]/g, '').trim();
  const showMsg = (txt, reset = false) => {
    if (reset) messageDisplay.textContent = '';
    messageDisplay.textContent += (messageDisplay.textContent ? '\n' : '') + txt;
  };

  const copyToClipboard = async text => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };

  function updateCoverPreview(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      coverPreviewContainer.classList.add('hidden');
      return;
    }
    coverPreview.src = url;
    coverPreviewContainer.classList.remove('hidden');
  }

  const openLightbox = src => { lightboxImg.src = src; lightbox.classList.add('show'); lightbox.setAttribute('aria-hidden','false'); };
  const closeLightbox = () => { lightbox.classList.remove('show'); lightbox.setAttribute('aria-hidden','true'); lightboxImg.src = ''; };

  coverPreview.addEventListener('click', () => openLightbox(coverPreview.src));
  lightbox.addEventListener('click', closeLightbox);

  // 输入框联动预览
  coverUrlInput.addEventListener('input', e => updateCoverPreview(e.target.value.trim()));

  // 读取音乐元数据
  musicFileInput.addEventListener('change', () => {
    const file = musicFileInput.files?.[0];
    if (!file) return;

    metadataDisplay.classList.remove('hidden');
    titleInput.value = '正在读取...';
    artistInput.value = '';
    albumInput.value = '';

    if (typeof jsmediatags === 'undefined') {
      titleInput.value = '无法读取元数据，请手动输入。';
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
      }
    });
  });

  // 上传（文件/URL）
  async function uploadFile(file, customKey, isCover = false, sourceUrl = null) {
    const fd = new FormData();
    if (sourceUrl) {
      fd.append('source_url', sourceUrl);
      if (customKey) fd.append('key', customKey);
    } else if (file) {
      fd.append('file', file);
    }
    if (!isCover && file) {
      fd.append('title', titleInput.value);
      fd.append('artist', artistInput.value);
      fd.append('album', albumInput.value);
    }
    const res = await fetch(WORKER_URL, { method: 'POST', body: fd });
    const json = await res.json();
    return { response: res, result: json };
  }

  // iTunes 免鉴权封面搜索
  async function fetchItunesCover(term, size = 1200, country = 'sg') {
    if (!term) return null;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&country=${country}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data.results?.[0];
    if (!hit?.artworkUrl100) return null;
    return hit.artworkUrl100.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  }

  // 搜索封面
  document.getElementById('searchCoverBtn').addEventListener('click', async () => {
    const term = (coverUrlInput.value || `${artistInput.value} ${albumInput.value}`).trim();
    if (!term) { alert('请输入关键词或 艺术家 + 专辑名'); return; }
    showMsg(`正在搜索封面：${term}...`, true);
    try {
      const url = await fetchItunesCover(term);
      if (url) {
        coverUrlInput.value = url;
        updateCoverPreview(url);
        showMsg('✅ 已找到封面：' + url);
      } else {
        showMsg('❌ 未找到匹配封面');
      }
    } catch (e) {
      showMsg('❌ 搜索失败：' + (e.message || e));
    }
  });

  // 提交上传
  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg('开始上传音乐文件...', true);
    linkOutputDiv.classList.add('hidden');
    submitBtn.disabled = true;

    const musicFile = musicFileInput.files?.[0];
    const coverUrl = (coverUrlInput.value || '').trim();
    if (!musicFile) {
      showMsg('错误：请选择一个音乐文件。');
      submitBtn.disabled = false;
      return;
    }

    try {
      // 1) 上传音频
      const { response: r1, result: res1 } = await uploadFile(musicFile, null, false, null);
      if (!r1.ok) throw new Error(res1.error || '音乐文件上传失败');
      showMsg(`音乐文件上传成功！路径：${res1.keyUsed}`);

      const musicKey = res1.keyUsed;
      const publicUrl = `${PUBLIC_BASE_URL}/${musicKey}`;
      musicLinkAnchor.href = publicUrl;
      musicLinkAnchor.textContent = publicUrl;
      linkOutputDiv.classList.remove('hidden');

      copyLinkButton.onclick = async () => {
        const ok = await copyToClipboard(publicUrl);
        copyLinkButton.textContent = ok ? '已复制!' : '复制失败';
        setTimeout(() => (copyLinkButton.textContent = '复制链接'), 1000);
      };

      // 2) 后台上传封面（若填写）
      if (coverUrl) {
        showMsg('开始后台下载并上传封面...');
        const albumName = sanitizeName(albumInput.value);
        const artistName = sanitizeName(artistInput.value);
        const titleName = sanitizeName(titleInput.value);
        const baseName = albumName || (artistName ? `${artistName}-${titleName || 'cover'}` : `cover_${Date.now()}`);
        const lower = coverUrl.toLowerCase();
        const ext = /\.png(\?|$)/.test(lower) ? '.PNG' : /\.jpe?g(\?|$)/.test(lower) ? '.JPG' : '.JPG';
        const coverKey = `covers/${baseName}${ext}`;
        const { response: r2, result: res2 } = await uploadFile(null, coverKey, true, coverUrl);
        if (r2.ok) showMsg(`封面上传成功：${res2.keyUsed}`);
        else showMsg(`封面上传失败：${res2.error || '未知错误'}`);
      }
    } catch (err) {
      showMsg('上传出错：' + (err.message || err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  // 列表：删除
  async function deleteAsset(keyToDelete, elementToRemove) {
    if (!confirm(`确定要删除文件:\n${keyToDelete}\n\n该操作不可撤销！`)) return;
    try {
      const r = await fetch(`${WORKER_URL}?key=${encodeURIComponent(keyToDelete)}`, { method: 'DELETE' });
      const j = await r.json();
      if (r.ok && j.ok) elementToRemove?.remove();
      else alert('删除失败：' + (j.error || '未知错误'));
    } catch (e) {
      alert('网络错误：' + (e.message || e));
    }
  }

  // 加载文件列表（含：复制封面链接按钮）
  async function fetchAndDisplayAssets() {
    assetListDisplay.textContent = '正在加载资产列表...';
    assetListDisplay.classList.remove('hidden');

    try {
      const res = await fetch(`${WORKER_URL}?action=list`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');

      let html = `<div class="asset-header"><b>总数:</b> ${data.count}（更新于：${new Date(data.updatedAt).toLocaleTimeString()}）</div>`;

      data.assets.forEach((asset, i) => {
        const isAudio = asset.type === 'audio';
        const album = sanitizeName(asset.metadata?.album || '');
        const base = `${PUBLIC_BASE_URL}/covers/${encodeURIComponent(album)}`;
        const jpg = album ? `${base}.JPG` : '';
        const png = album ? `${base}.PNG` : '';
        const metaCover = asset.metadata?.coverUrl || '';
        const broken = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";

        html += `
          <div class="asset-item" id="asset-${i}">
            <img class="asset-cover" id="asset-cover-${i}" src="${jpg || metaCover || asset.url}"
                 onerror="this.onerror=null; this.src='${png || metaCover || broken}'" />
            <div class="asset-info">
              <div class="asset-title">${asset.name}</div>
              <div class="asset-type-label">${asset.metadata?.artist || '未知艺术家'} | ${asset.metadata?.album || '未知专辑'}</div>
            </div>
            <div class="asset-actions">
              ${isAudio ? `<button class="btn play-btn" id="play-${i}">播放</button>
                           <audio id="audio-${i}" src="${asset.url}" preload="none"></audio>` : ''}
              <button class="btn copy-btn" id="copy-${i}">复制链接</button>
              <button class="btn cover-btn" id="copy-cover-${i}">复制封面链接</button>
              <button class="btn del-btn" id="del-${i}">删除</button>
            </div>
          </div>
        `;
      });

      assetListDisplay.innerHTML = html;

      // 绑定按钮/封面放大
      data.assets.forEach((asset, i) => {
        const row = document.getElementById(`asset-${i}`);
        const delBtn = document.getElementById(`del-${i}`);
        const copyBtn = document.getElementById(`copy-${i}`);
        const copyCoverBtn = document.getElementById(`copy-cover-${i}`);
        const coverImg = document.getElementById(`asset-cover-${i}`);

        if (delBtn) delBtn.onclick = () => deleteAsset(asset.name, row);
        if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(asset.url);
        if (copyCoverBtn) copyCoverBtn.onclick = () => {
          const url = coverImg?.src || '';
          if (!url) return;
          navigator.clipboard.writeText(url);
          copyCoverBtn.textContent = '已复制';
          setTimeout(() => (copyCoverBtn.textContent = '复制封面链接'), 900);
        };
        if (coverImg) coverImg.addEventListener('click', () => openLightbox(coverImg.src));

        const playBtn = document.getElementById(`play-${i}`);
        const audio = document.getElementById(`audio-${i}`);
        if (playBtn && audio) {
          playBtn.onclick = () => {
            if (audio.paused) {
              document.querySelectorAll('audio').forEach(a => {
                if (a !== audio) {
                  a.pause();
                  const other = document.getElementById(`play-${a.id.split('-')[1]}`);
                  if (other) other.textContent = '播放';
                }
              });
              audio.play();
              playBtn.textContent = '⏸ 暂停';
            } else {
              audio.pause();
              playBtn.textContent = '播放';
            }
          };
          audio.onended = () => (playBtn.textContent = '播放');
        }
      });
    } catch (err) {
      assetListDisplay.textContent = '加载失败：' + (err.message || err);
    }
  }

  listAssetsBtn.addEventListener('click', fetchAndDisplayAssets);
});
