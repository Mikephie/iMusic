// ❗ WORKER_URL 是你的 Worker API 地址 (用于 POST 和 GET?action=list)
const WORKER_URL = 'https://music-gateway.mikephiemy.workers.dev'; 

// ❗ PUBLIC_BASE_URL 是文件访问的域名 (文件最终的播放地址)
const PUBLIC_BASE_URL = 'https://music.mikephie.site'; 

const form = document.getElementById('uploadForm');
const musicFileInput = document.getElementById('musicFile');
const coverFileInput = document.getElementById('coverFile');
const submitBtn = document.getElementById('submitBtn');
const submitCoverBtn = document.getElementById('submitCoverBtn');
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

// --- 核心删除函数 (不变) ---
async function deleteAsset(keyToDelete, elementToRemove) {
    if (!confirm(`确定要删除文件:\n${keyToDelete}\n\n该操作不可撤销！`)) {
        return;
    }

    messageDisplay.textContent = `正在删除文件: ${keyToDelete}...`;

    try {
        const response = await fetch(`${WORKER_URL}?key=${encodeURIComponent(keyToDelete)}`, {
            method: 'DELETE',
        });

        const result = await response.json();

        if (response.ok && result.ok) {
            messageDisplay.textContent = `删除成功: ${keyToDelete}\n剩余资产数: ${result.remaining}`;
            
            if (elementToRemove) {
                elementToRemove.remove();
            }
        } else {
            messageDisplay.textContent = `删除失败: ${keyToDelete}\n错误信息: ${result.error || '未知错误'}`;
        }
    } catch (e) {
        messageDisplay.textContent = `网络错误或删除请求失败: ${e.message}`;
    }
}

// --- 元数据读取逻辑 (不变) ---
musicFileInput.addEventListener('change', async () => {
    const file = musicFileInput.files[0];
    if (!file) return;

    metadataDisplay.style.display = 'block';
    titleInput.value = '正在读取...';
    artistInput.value = '';
    albumInput.value = '';
    
    if (typeof jsmediatags === 'undefined') {
        titleInput.value = '无法读取元数据，请手动输入。';
        return;
    }

    jsmediatags.read(file, {
        onSuccess: function(tag) {
            titleInput.value = tag.tags.title || '';
            artistInput.value = tag.tags.artist || '';
            albumInput.value = tag.tags.album || '';
        },
        onError: function() {
            titleInput.value = file.name;
            artistInput.value = '';
            albumInput.value = '(读取失败)';
        }
    });
});


// --- 通用上传函数 ---
async function uploadFile(file, customKey, isCover=false) {
    const formData = new FormData();
    formData.append('file', file);
    
    // 只有在上传封面时，才使用 customKey (基于专辑名)
    if (customKey) {
         formData.append('key', customKey); 
    }
    
    // 如果是音频文件，发送元数据
    if (!isCover) {
        formData.append('title', titleInput.value);
        formData.append('artist', artistInput.value);
        formData.append('album', albumInput.value);
    }

    const response = await fetch(WORKER_URL, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();
    return { response, result };
}

// --- 1. 上传音乐文件 (同步上传主函数) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageDisplay.textContent = '开始上传音乐文件...';
    linkOutputDiv.style.display = 'none'; 
    submitBtn.disabled = true;
    submitCoverBtn.disabled = true; // 禁用独立上传按钮

    const musicFile = musicFileInput.files[0];
    const coverFile = coverFileInput.files[0];

    if (!musicFile) {
        messageDisplay.textContent = '错误: 请选择一个音乐文件。';
        submitBtn.disabled = false;
        return;
    }
    
    // --- 1. 上传音乐文件 (主请求) ---
    try {
        const { response: musicResponse, result: musicResult } = await uploadFile(musicFile, null, false);
        
        if (!musicResponse.ok) {
            messageDisplay.textContent += `\n音乐文件上传失败！\n错误信息: ${musicResult.error}`;
            return;
        }

        messageDisplay.textContent += `\n音乐文件上传成功！\n路径: ${musicResult.keyUsed}\n元数据: ${JSON.stringify(musicResult.metadata, null, 2)}`;
        
        // 链接和信息显示 (基于音乐文件)
        const musicKey = musicResult.keyUsed;
        const publicUrl = `${PUBLIC_BASE_URL}/${musicKey}`; 
        musicLinkAnchor.href = publicUrl;
        musicLinkAnchor.textContent = publicUrl;
        linkOutputDiv.style.display = 'block';
        copyLinkButton.onclick = function() {
            navigator.clipboard.writeText(publicUrl).then(() => {
                alert('播放链接已复制到剪贴板！');
            }, () => {});
        };
        
        lastMusicKey = musicKey;

        // --- 2. 自动上传封面文件 (次请求，如果有封面) ---
        if (coverFile) {
            messageDisplay.textContent += `\n\n开始自动上传封面文件 (基于专辑名)...`;
            
            const albumName = albumInput.value.trim();
            const ext = coverFile.name.substring(coverFile.name.lastIndexOf('.'));
            
            // 构造干净的 Key：covers/魔杰座.PNG
            const sanitizedAlbumName = albumName.replace(/[^a-zA-Z0-9\s\u4e00-\u9fa5\.\-\_]/g, ''); 
            
            // 核心修正：只发送 CLEAN KEY (例如 "魔杰座.PNG")，让 Worker 独家添加 'covers/'
            const cleanCoverKey = `${sanitizedAlbumName}${ext}`; 

            // 执行封面上传
            const { response: coverResponse, result: coverResult } = await uploadFile(coverFile, cleanCoverKey, true);
            
            if (coverResponse.ok) {
                messageDisplay.textContent += `\n封面上传成功！\n路径: ${coverResult.keyUsed}`;
            } else {
                messageDisplay.textContent += `\n封面上传失败！\n错误信息: ${coverResult.error}`;
            }
        }
        
    } catch (error) {
        messageDisplay.textContent += `\n网络/未知错误: ${error.message}`;
    } finally {
        submitBtn.disabled = false;
        // 注意：这里保留独立按钮禁用状态，但主上传已完成
    }
});

// --- 2. 独立上传封面文件 (旧逻辑，现在已废弃但保留，并指向新逻辑) ---
submitCoverBtn.addEventListener('click', async () => {
    // 强制调用主上传逻辑，但只处理封面文件
    const albumName = albumInput.value.trim();
    if (!musicFileInput.files[0] && !albumName) {
        alert('请先上传音频文件或填写专辑名！');
        return;
    }
    // 重新运行主上传逻辑，用户已习惯，但现在是同步执行
    document.getElementById('uploadForm').dispatchEvent(new Event('submit'));
});


// --- 3. 获取并显示文件列表 (不变) ---
async function fetchAndDisplayAssets() {
    assetListDisplay.innerHTML = '正在加载资产列表...';
    assetListDisplay.style.display = 'block';
    listAssetsBtn.disabled = true;

    try {
        const response = await fetch(`${WORKER_URL}?action=list`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();

        if (response.ok && data.assets) {
            
            let htmlContent = `
                <div style="padding: 10px 15px; background-color: #f8f8f8; border-bottom: 1px solid #ddd;">
                    <b>总数:</b> ${data.count} (更新于: ${new Date(data.updatedAt).toLocaleTimeString()})
                </div>
            `;
            
            data.assets.forEach((asset, index) => {
                const deleteId = `delete-btn-${index}`;
                const playId = `play-btn-${index}`; 
                
                // --- UI 逻辑修正点 ---
                const isAudio = asset.type === 'audio';

                const albumName = asset.metadata.album;
                
                const sanitizedAlbumName = albumName ? albumName.replace(/[^a-zA-Z0-9\s\u4e00-\u9fa5\.\-\_]/g, '') : '';
                const encodedAlbumName = encodeURIComponent(sanitizedAlbumName); 
                
                // 封面 URL 猜测逻辑：图片文件本身就是封面
                const coverUrl = isAudio 
                    ? (albumName ? `${PUBLIC_BASE_URL}/covers/${encodedAlbumName}.PNG` : '') 
                    : asset.url; 
                
                const artistDisplay = asset.metadata.artist || '未知艺术家';
                const albumDisplay = asset.metadata.album || '未知专辑';
                
                // SVG 占位符 for broken image
                const brokenImageSvg = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#ccc\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\' class=\'feather feather-image\'%3E%3Crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'%3E%3C/rect%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'%3E%3C/circle%3E%3Cpolyline points=\'21 15 16 10 5 21\'%3E%3C/polyline%3E%3C/svg%3E';


                htmlContent += `
                    <div id="asset-item-${index}" class="asset-item">
                        
                        <img src="${coverUrl}" class="asset-cover" 
                             onerror="this.onerror=null; this.src='${brokenImageSvg}'">
                        
                        <div class="asset-info">
                            <div class="asset-title">${asset.name}</div>
                            
                            ${isAudio ? 
                                `<div class="asset-type-label">${artistDisplay} | ${albumDisplay}</div>`
                                : `<div class="asset-type-label">(${asset.type.toUpperCase()} 文件)</div>` 
                            }
                        </div>

                        <div class="asset-actions">
                            ${isAudio ? `<button id="${playId}" class="play-btn">播放</button>` : ''}

                            ${isAudio ? `<audio id="audio-${index}" src="${asset.url}" class="hidden-audio"></audio>` : ''}

                            <button onclick="navigator.clipboard.writeText('${asset.url}').then(
                                e => { 
                                    this.textContent='已复制!'; 
                                    setTimeout(() => { this.textContent='复制链接'; }, 1000); 
                                })"
                                style="background-color: #28a745; color: white;">
                                复制链接
                            </button>
                            
                            <button id="${deleteId}" style="background-color: #dc3545; color: white;">
                                删除
                            </button>
                        </div>
                    </div>
                `;
            });
            
            assetListDisplay.innerHTML = htmlContent;

            // 绑定播放和删除事件
            data.assets.forEach((asset, index) => {
                const deleteButton = document.getElementById(`delete-btn-${index}`);
                const playButton = document.getElementById(`play-btn-${index}`);
                const audioPlayer = document.getElementById(`audio-${index}`);
                const assetItem = document.getElementById(`asset-item-${index}`);

                if (deleteButton) {
                    deleteButton.onclick = function() {
                        deleteAsset(asset.name, assetItem); 
                    };
                }

                if (playButton && audioPlayer) {
                    playButton.onclick = function() {
                        if (audioPlayer.paused) {
                            document.querySelectorAll('.hidden-audio').forEach(p => {
                                if (p !== audioPlayer) {
                                    p.pause();
                                    const otherPlayBtn = document.getElementById(`play-btn-${p.id.split('-')[1]}`);
                                    if (otherPlayBtn) otherPlayBtn.textContent = '播放';
                                }
                            });
                            audioPlayer.play();
                            playButton.textContent = '⏸ 暂停';
                        } else {
                            audioPlayer.pause();
                            playButton.textContent = '播放';
                        }
                    };
                    audioPlayer.onended = () => {
                        playButton.textContent = '播放';
                    };
                }
            });

        } else {
            assetListDisplay.textContent = `加载失败: ${data.error || 'Worker 返回错误。'}`;
        }

    } catch (e) {
        assetListDisplay.textContent = `网络错误或解析失败: ${e.message}`;
    } finally {
        listAssetsBtn.disabled = false;
    }
}

// --- 绑定按钮事件 ---
listAssetsBtn.addEventListener('click', fetchAndDisplayAssets);