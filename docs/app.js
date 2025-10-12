// === app.js ===
// 功能：上传音频、读取元数据、封面搜索与实时预览、Lightbox 放大封面、文件列表管理

const WORKER_URL = 'https://music-gateway.mikephiemy.workers.dev';
const PUBLIC_BASE_URL = 'https://music.mikephie.site';

// 获取元素
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

// Lightbox 元素
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

// 封面预览
const coverPreviewContainer = document.getElementById('coverPreviewContainer');
const coverPreview = document.getElementById('coverPreview');

function updateCoverPreview(url) {
  if (!url || !url.startsWith('http')) {
    coverPreviewContainer.style.display = 'none';
    return;
  }
  coverPreview.src = url;
  coverPreviewContainer.style.display = 'block';
}

coverUrlInput.addEventListener('input', e => updateCoverPreview(e.target.value.trim()));

// 点击封面放大
function enableLightbox(imgElement) {
  imgElement.addEventListener('click', () => {
    lightboxImg.src = imgElement.src;
    lightbox.style.display = 'flex';
  });
}
coverPreview.addEventListener('click', () => {
  lightboxImg.src = coverPreview.src;
  lightbox.style.display = 'flex';
});
lightbox.addEventListener('click', () => (lightbox.style.display = 'none'));

// 读取音乐标签
musicFileInput.addEventListener('change', () => {
  const file = musicFileInput.files?.[0];
  if (!file) return;

  metadataDisplay.style.display = 'block';
  titleInput.value = '正在读取...';

  jsmediatags.read(file, {
    onSuccess: tag => {
      titleInput.value = tag.tags.title || file.name;
      artistInput.value = tag.tags.artist || '';
      albumInput.value = tag.tags.album || '';
    },
    onError: () => {
      titleInput.value = file.name;
    }
  });
});

// 上传函数
async function uploadFile(file, customKey, isCover = false, sourceUrl = null) {
  const fd = new FormData();
  if (sourceUrl) {
    fd.append('source_url', sourceUrl);
    if (customKey) fd.append('key', customKey);
  } else if (file) fd.append('file', file);

  if (!isCover && file) {
    fd.append('title', titleInput.value);
    fd.append('artist', artistInput.value);
    fd.append('album', albumInput.value);
  }

  const res = await fetch(WORKER_URL, { method: 'POST', body: fd });
  return { response: res, result: await res.json() };
}

// iTunes 封面搜索
async function fetchItunesCover(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&country=sg&limit=1`;
  const res = await fetch(url);
  const data = await res.json();
  const hit = data.results?.[0];
  return hit?.artworkUrl100 ? hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/1200x1200bb.') : null;
}

// 点击搜索封面
searchCoverBtn.onclick = async () => {
  const term = coverUrlInput.value.trim() || `${artistInput.value} ${albumInput.value}`.trim();
  if (!term) return alert('请输入关键词或艺术家 + 专辑名');
  messageDisplay.textContent = `正在搜索封面：${term}...`;
  const url = await fetchItunesCover(term);
  if (url) {
    coverUrlInput.value = url;
    updateCoverPreview(url);
    messageDisplay.textContent += `\n✅ 已找到封面`;
  } else messageDisplay.textContent += `\n❌ 未找到封面`;
};

// 提交上传
form.addEventListener('submit', async e => {
  e.preventDefault();
  submitBtn.disabled = true;
  messageDisplay.textContent = '正在上传音乐文件...';
  linkOutputDiv.style.display = 'none';

  const musicFile = musicFileInput.files?.[0];
  const coverUrl = coverUrlInput.value.trim();
  if (!musicFile) {
    messageDisplay.textContent = '请选择音乐文件';
    submitBtn.disabled = false;
    return;
  }

  try {
    const { response: r1, result: res1 } = await uploadFile(musicFile);
    if (!r1.ok) throw new Error(res1.error);
    const publicUrl = `${PUBLIC_BASE_URL}/${res1.keyUsed}`;
    musicLinkAnchor.href = publicUrl;
    musicLinkAnchor.textContent = publicUrl;
    linkOutputDiv.style.display = 'block';

    copyLinkButton.onclick = async () => {
      await navigator.clipboard.writeText(publicUrl);
      copyLinkButton.textContent = '已复制!';
      setTimeout(() => (copyLinkButton.textContent = '复制链接'), 1000);
    };

    if (coverUrl) {
      const name = albumInput.value || titleInput.value || 'cover';
      const ext = coverUrl.toLowerCase().includes('.png') ? '.PNG' : '.JPG';
      const key = `covers/${name}${ext}`;
      const { response: r2 } = await uploadFile(null, key, true, coverUrl);
      if (r2.ok) messageDisplay.textContent += '\n封面上传成功';
      else messageDisplay.textContent += '\n封面上传失败';
    }
  } catch (err) {
    messageDisplay.textContent += `\n错误：${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// 文件列表展示
async function fetchAndDisplayAssets() {
  assetListDisplay.innerHTML = '加载中...';
  assetListDisplay.style.display = 'block';

  const res = await fetch(`${WORKER_URL}?action=list`);
  const data = await res.json();
  if (!res.ok) return (assetListDisplay.textContent = '加载失败');

  assetListDisplay.innerHTML = data.assets
    .map((a, i) => {
      const album = a.metadata?.album || '';
      const coverJPG = `${PUBLIC_BASE_URL}/covers/${album}.JPG`;
      const coverPNG = `${PUBLIC_BASE_URL}/covers/${album}.PNG`;
      return `
      <div class="asset-item">
        <img src="${coverJPG}" onerror="this.src='${coverPNG}'" class="asset-cover" data-full="${coverJPG}">
        <div class="asset-info">
          <div class="asset-title">${a.name}</div>
          <div class="asset-type-label">${a.metadata?.artist || '未知'} | ${album || '未知专辑'}</div>
        </div>
        <div class="asset-actions">
          <button onclick="navigator.clipboard.writeText('${a.url}')">复制链接</button>
          <button style="background:#dc3545;color:#fff;" onclick="fetch('${WORKER_URL}?key=${a.name}',{method:'DELETE'}).then(()=>this.closest('.asset-item').remove())">删除</button>
        </div>
      </div>`;
    })
    .join('');

  // 封面点击放大
  document.querySelectorAll('.asset-cover').forEach(img => {
    img.addEventListener('click', () => {
      lightboxImg.src = img