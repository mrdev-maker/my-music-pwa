// DOM Elements
const addBtn = document.querySelector('.add-pill');
const fileInput = document.getElementById('fileInput');
const songListEl = document.getElementById('songList');
const playlistContainer = document.getElementById('playlistContainer');
const actionRow = document.getElementById('actionRow');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// Audio & Players
const audio = document.getElementById('audioPlayer');
const miniTitle = document.getElementById('miniTitle');
const miniSub = document.getElementById('miniSub');
const miniDisc = document.getElementById('miniDisc');
const miniPlayBtn = document.getElementById('miniPlayBtn');
const miniNextBtn = document.getElementById('miniNextBtn');

const fullPlayer = document.getElementById('fullPlayer');
const openFullPlayer = document.getElementById('openFullPlayer');
const closeFullPlayer = document.getElementById('closeFullPlayer');
const bigVinyl = document.getElementById('bigVinyl');
const bigArtLetter = document.getElementById('bigArtLetter');
const fpTitle = document.getElementById('fpTitle');
const fpArtist = document.getElementById('fpArtist');
const fpFavBtn = document.getElementById('fpFavBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const loopBtn = document.getElementById('loopBtn');
const seekBar = document.getElementById('seekBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');

// Equalizer & Modal
const eqToggleBtn = document.getElementById('eqToggleBtn');
const eqPanel = document.getElementById('eqPanel');
const bassSlider = document.getElementById('bassSlider');
const trebleSlider = document.getElementById('trebleSlider');
const playlistModal = document.getElementById('playlistModal');
const modalPlaylistOptions = document.getElementById('modalPlaylistOptions');
const modalNewPlaylistInput = document.getElementById('modalNewPlaylistInput');
const modalCreateAddBtn = document.getElementById('modalCreateAddBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// App State
let songs = [];
let activeQueue = [];
let currentIndex = -1;
let currentView = 'all'; // 'all' | 'favourites' | 'playlists' | 'recent' | 'single-playlist'
let selectedPlaylistName = null;
let isShuffle = false;
let loopMode = 'all'; // 'off' | 'all' | 'one'  (Proper 3-state loop!)
let isSortedAZ = false;
let songToAddToPlaylist = null;

// Persisted Metadata in localStorage
let favourites = new Set(JSON.parse(localStorage.getItem('mm_favs') || '[]'));
let recentPlayed = JSON.parse(localStorage.getItem('mm_recent') || '[]');
let playlists = JSON.parse(localStorage.getItem('mm_playlists') || '{}');

const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|opus|webm)$/i;
const ART_COLORS = [
  'linear-gradient(135deg, #4f46e5, #312e81)',
  'linear-gradient(135deg, #059669, #064e3b)',
  'linear-gradient(135deg, #d97706, #78350f)',
  'linear-gradient(135deg, #db2777, #831843)',
  'linear-gradient(135deg, #ea580c, #7c2d12)',
  'linear-gradient(135deg, #2563eb, #1e3a8a)'
];

function getArtGradient(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return ART_COLORS[Math.abs(hash) % ART_COLORS.length];
}

// 1. THEME SWITCHER (Spotify Dark + Orange vs Clean Light)
const savedTheme = localStorage.getItem('mm_theme') || 'dark';
if (savedTheme === 'light') {
  document.body.classList.remove('dark-mode');
  themeToggleBtn.textContent = '🌙';
}

themeToggleBtn.onclick = () => {
  const isDark = document.body.classList.toggle('dark-mode');
  themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('mm_theme', isDark ? 'dark' : 'light');
};

// 2. INDEXEDDB STORAGE
const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open('OfflineMusicDB', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'name' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function saveSongsToDB(fileArray) {
  const db = await dbPromise;
  const batchSize = 20;
  for (let i = 0; i < fileArray.length; i += batchSize) {
    const batch = fileArray.slice(i, i + batchSize);
    await new Promise((res, rej) => {
      const tx = db.transaction('songs', 'readwrite');
      const store = tx.objectStore('songs');
      batch.forEach(file => store.put({ name: file.name, blob: file }));
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  }
}

async function loadSongsFromDB() {
  const db = await dbPromise;
  const tx = db.transaction('songs', 'readonly');
  const req = tx.objectStore('songs').getAll();
  req.onsuccess = () => {
    if (req.result.length > 0) {
      songs = req.result.map(item => ({
        name: item.name.replace(/\.[^/.]+$/, ''),
        url: URL.createObjectURL(item.blob)
      }));
      refreshUI();
    }
  };
}

async function processFiles(fileList) {
  const audioFiles = Array.from(fileList).filter(
    f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)
  );
  if (!audioFiles.length) return;

  const existingNames = new Set(songs.map(s => s.name));
  const newEntries = [];

  audioFiles.forEach(file => {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    if (!existingNames.has(cleanName)) {
      existingNames.add(cleanName);
      songs.push({ name: cleanName, url: URL.createObjectURL(file) });
      newEntries.push(file);
    }
  });

  refreshUI();
  if (newEntries.length > 0) {
    try { await saveSongsToDB(newEntries); } catch (e) { console.warn(e); }
  }
}

addBtn.addEventListener('click', async (e) => {
  if ('showOpenFilePicker' in window) {
    e.preventDefault();
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      const files = await Promise.all(handles.map(h => h.getFile()));
      await processFiles(files);
    } catch (err) {
      if (err.name !== 'AbortError') fileInput.click();
    }
  }
});

fileInput.addEventListener('change', async (e) => {
  await processFiles(e.target.files);
  fileInput.value = '';
});

// 3. VIEW & RENDERING
function updateCounts() {
  document.getElementById('favCount').textContent = `${favourites.size} songs`;
  document.getElementById('playlistCount').textContent = `${Object.keys(playlists).length} lists`;
  document.getElementById('recentCount').textContent = `${recentPlayed.length} played`;
}

function getFilteredSongs() {
  let list = [];
  if (currentView === 'all') list = [...songs];
  else if (currentView === 'favourites') list = songs.filter(s => favourites.has(s.name));
  else if (currentView === 'recent') {
    list = recentPlayed.map(name => songs.find(s => s.name === name)).filter(Boolean);
  } else if (currentView === 'single-playlist' && selectedPlaylistName) {
    const names = new Set(playlists[selectedPlaylistName] || []);
    list = songs.filter(s => names.has(s.name));
  }

  const q = searchInput.value.trim().toLowerCase();
  if (q) list = list.filter(s => s.name.toLowerCase().includes(q));
  if (isSortedAZ) list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function refreshUI() {
  updateCounts();

  // Tabs active highlight
  document.querySelectorAll('.tab').forEach(t => {
    const v = t.dataset.view;
    t.classList.toggle('active', v === currentView || (v === 'playlists' && currentView === 'single-playlist'));
  });

  if (currentView === 'playlists') {
    songListEl.classList.add('hidden');
    actionRow.classList.add('hidden');
    playlistContainer.classList.remove('hidden');
    renderPlaylistsGrid();
    return;
  }

  playlistContainer.classList.add('hidden');
  songListEl.classList.remove('hidden');
  actionRow.classList.remove('hidden');

  const displayList = getFilteredSongs();
  activeQueue = displayList;
  document.getElementById('totalSongsBadge').textContent = `(${displayList.length})`;

  songListEl.innerHTML = '';
  if (!displayList.length) {
    songListEl.innerHTML = `<li class="empty-msg">Koi song nahi mila. "+ Add" se gaane load karo.</li>`;
    return;
  }

  const currentSongName = currentIndex >= 0 && songs[currentIndex] ? songs[currentIndex].name : '';

  displayList.forEach((song) => {
    const li = document.createElement('li');
    li.className = 'song-item' + (song.name === currentSongName ? ' playing' : '');

    const isFav = favourites.has(song.name);
    const firstChar = song.name.trim()[0]?.toUpperCase() || 'M';

    li.innerHTML = `
      <div class="art-box" style="background: ${getArtGradient(song.name)}">${firstChar}</div>
      <div class="song-meta">
        <div class="song-title">${song.name}</div>
        <div class="song-sub">Local Audio • Offline</div>
      </div>
      <div class="song-actions">
        <button class="row-btn ${isFav ? 'fav-active' : ''}" data-fav="${song.name}">${isFav ? '♥' : '♡'}</button>
        <button class="row-btn" data-menu="${song.name}">⋮</button>
      </div>
    `;

    li.querySelector('.song-meta').onclick = () => playBySongObj(song);
    li.querySelector('.art-box').onclick = () => playBySongObj(song);

    li.querySelector('[data-fav]').onclick = (e) => {
      e.stopPropagation();
      toggleFavourite(song.name);
    };

    li.querySelector('[data-menu]').onclick = (e) => {
      e.stopPropagation();
      openPlaylistModal(song.name);
    };

    songListEl.appendChild(li);
  });
}

function renderPlaylistsGrid() {
  playlistContainer.innerHTML = '';
  const names = Object.keys(playlists);
  if (!names.length) {
    playlistContainer.innerHTML = `<p class="empty-msg" style="grid-column:1/-1">Kisi bhi gaane ke ⋮ button par dabakar playlist banao.</p>`;
    return;
  }
  names.forEach(plName => {
    const div = document.createElement('div');
    div.className = 'pl-card';
    div.innerHTML = `<h4>💿 ${plName}</h4><p>${playlists[plName].length} songs</p>`;
    div.onclick = () => {
      selectedPlaylistName = plName;
      currentView = 'single-playlist';
      refreshUI();
    };
    playlistContainer.appendChild(div);
  });
}

// Tabs & Quick Cards Navigation
document.querySelectorAll('.tab, .q-card').forEach(el => {
  el.onclick = () => {
    currentView = el.dataset.view;
    refreshUI();
  };
});

searchInput.addEventListener('input', () => {
  clearSearchBtn.classList.toggle('hidden', !searchInput.value);
  refreshUI();
});

clearSearchBtn.onclick = () => {
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  refreshUI();
};

document.getElementById('sortBtn').onclick = () => {
  isSortedAZ = !isSortedAZ;
  refreshUI();
};

document.getElementById('newPlaylistBtn').onclick = () => {
  const name = prompt('Nayi Playlist ka naam likho:');
  if (name && name.trim()) {
    if (!playlists[name.trim()]) playlists[name.trim()] = [];
    localStorage.setItem('mm_playlists', JSON.stringify(playlists));
    currentView = 'playlists';
    refreshUI();
  }
};

// Favourites & Playlist Modal
function toggleFavourite(songName) {
  if (favourites.has(songName)) favourites.delete(songName);
  else favourites.add(songName);
  localStorage.setItem('mm_favs', JSON.stringify([...favourites]));
  updateFullPlayerFavIcon();
  refreshUI();
}

function openPlaylistModal(songName) {
  songToAddToPlaylist = songName;
  modalPlaylistOptions.innerHTML = '';
  Object.keys(playlists).forEach(pl => {
    const item = document.createElement('div');
    item.className = 'modal-pl-item';
    item.textContent = `➕ ${pl} (${playlists[pl].length})`;
    item.onclick = () => {
      if (!playlists[pl].includes(songToAddToPlaylist)) {
        playlists[pl].push(songToAddToPlaylist);
        localStorage.setItem('mm_playlists', JSON.stringify(playlists));
      }
      playlistModal.classList.add('hidden');
      refreshUI();
    };
    modalPlaylistOptions.appendChild(item);
  });
  playlistModal.classList.remove('hidden');
}

modalCreateAddBtn.onclick = () => {
  const name = modalNewPlaylistInput.value.trim();
  if (!name || !songToAddToPlaylist) return;
  if (!playlists[name]) playlists[name] = [];
  if (!playlists[name].includes(songToAddToPlaylist)) playlists[name].push(songToAddToPlaylist);
  localStorage.setItem('mm_playlists', JSON.stringify(playlists));
  modalNewPlaylistInput.value = '';
  playlistModal.classList.add('hidden');
  refreshUI();
};

closeModalBtn.onclick = () => playlistModal.classList.add('hidden');

// 4. PLAYBACK & PROPER 3-STATE LOOP ENGINE
let audioCtx, bassFilter, trebleFilter;

function initAudioEQ() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audio);
    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 150;

    trebleFilter = audioCtx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 3000;

    src.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(audioCtx.destination);
  } catch (e) { console.warn('EQ init skipped', e); }
}

bassSlider.oninput = () => {
  initAudioEQ();
  if (bassFilter) bassFilter.gain.value = Number(bassSlider.value);
};

trebleSlider.oninput = () => {
  initAudioEQ();
  if (trebleFilter) trebleFilter.gain.value = Number(trebleSlider.value);
};

eqToggleBtn.onclick = () => eqPanel.classList.toggle('hidden');

function playBySongObj(songObj) {
  const idx = songs.findIndex(s => s.name === songObj.name);
  if (idx !== -1) playSong(idx);
}

function playSong(index) {
  if (index < 0 || index >= songs.length) return;
  initAudioEQ();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  currentIndex = index;
  const song = songs[index];
  audio.src = song.url;
  audio.play();

  // Save to Recent
  recentPlayed = [song.name, ...recentPlayed.filter(n => n !== song.name)].slice(0, 40);
  localStorage.setItem('mm_recent', JSON.stringify(recentPlayed));

  // Update UI Labels
  miniTitle.textContent = song.name;
  miniSub.textContent = 'Playing • Offline';
  fpTitle.textContent = song.name;
  bigArtLetter.textContent = song.name.trim()[0]?.toUpperCase() || 'M';

  setPlayStateUI(true);
  updateFullPlayerFavIcon();
  refreshUI();
  updateMediaSession(song.name);
}

function setPlayStateUI(isPlaying) {
  miniPlayBtn.textContent = isPlaying ? '❚❚' : '▶';
  playPauseBtn.textContent = isPlaying ? '❚❚' : '▶';
  miniDisc.classList.toggle('spin', isPlaying);
  bigVinyl.classList.toggle('spin', isPlaying);
}

function updateFullPlayerFavIcon() {
  if (currentIndex < 0 || !songs[currentIndex]) return;
  const isFav = favourites.has(songs[currentIndex].name);
  fpFavBtn.textContent = isFav ? '♥' : '♡';
  fpFavBtn.style.color = isFav ? '#ff5500' : '#ffffff';
}

fpFavBtn.onclick = () => {
  if (currentIndex >= 0 && songs[currentIndex]) toggleFavourite(songs[currentIndex].name);
};

function togglePlayPause() {
  if (!audio.src && songs.length) return playSong(0);
  if (audio.paused) {
    audio.play();
    setPlayStateUI(true);
  } else {
    audio.pause();
    setPlayStateUI(false);
  }
}

miniPlayBtn.onclick = togglePlayPause;
playPauseBtn.onclick = togglePlayPause;

function playNext(autoTriggered = false) {
  const pool = activeQueue.length ? activeQueue : songs;
  if (!pool.length) return;

  // Agar auto-end hua hai aur loopMode 'off' hai, toh last song par ruk jao
  const currentSong = songs[currentIndex];
  let pos = pool.findIndex(s => currentSong && s.name === currentSong.name);

  if (isShuffle) {
    const rand = Math.floor(Math.random() * pool.length);
    return playBySongObj(pool[rand]);
  }

  if (pos === pool.length - 1 && autoTriggered && loopMode === 'off') {
    setPlayStateUI(false);
    return;
  }

  const nextPos = (pos + 1) % pool.length;
  playBySongObj(pool[nextPos]);
}

function playPrev() {
  if (audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }
  const pool = activeQueue.length ? activeQueue : songs;
  if (!pool.length) return;
  const currentSong = songs[currentIndex];
  let pos = pool.findIndex(s => currentSong && s.name === currentSong.name);
  const prevPos = (pos - 1 + pool.length) % pool.length;
  playBySongObj(pool[prevPos]);
}

nextBtn.onclick = () => playNext(false);
miniNextBtn.onclick = () => playNext(false);
prevBtn.onclick = playPrev;

document.getElementById('shuffleAllBtn').onclick = () => {
  const pool = activeQueue.length ? activeQueue : songs;
  if (!pool.length) return;
  isShuffle = true;
  shuffleBtn.classList.add('active');
  playBySongObj(pool[Math.floor(Math.random() * pool.length)]);
};

shuffleBtn.onclick = () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle('active', isShuffle);
};

// 3-STATE LOOP BUTTON: All (🔁 orange) -> Single Song (🔂 orange) -> Off (🔁 grey)
function updateLoopUI() {
  audio.loop = (loopMode === 'one');
  if (loopMode === 'all') {
    loopBtn.textContent = '🔁';
    loopBtn.classList.add('active');
  } else if (loopMode === 'one') {
    loopBtn.textContent = '🔂';
    loopBtn.classList.add('active');
  } else {
    loopBtn.textContent = '🔁';
    loopBtn.classList.remove('active');
  }
}

loopBtn.onclick = () => {
  if (loopMode === 'all') loopMode = 'one';
  else if (loopMode === 'one') loopMode = 'off';
  else loopMode = 'all';
  updateLoopUI();
};

updateLoopUI();

audio.onended = () => {
  if (loopMode === 'one') {
    audio.currentTime = 0;
    audio.play();
  } else {
    playNext(true);
  }
};

// Full Player Open / Close
openFullPlayer.onclick = () => fullPlayer.classList.remove('hidden');
closeFullPlayer.onclick = () => fullPlayer.classList.add('hidden');

// Seek Bar & Time
const formatTime = (s) => isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

audio.ontimeupdate = () => {
  seekBar.value = (audio.currentTime / audio.duration) * 100 || 0;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  durationEl.textContent = formatTime(audio.duration);
};

seekBar.oninput = () => {
  if (audio.duration) audio.currentTime = (seekBar.value / 100) * audio.duration;
};

// Lock-Screen Controls
function updateMediaSession(title) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: 'MyMusic Offline'
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); setPlayStateUI(true); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setPlayStateUI(false); });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext(false));
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
loadSongsFromDB();