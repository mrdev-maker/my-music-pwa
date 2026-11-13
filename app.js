const fileInput = document.getElementById('fileInput');
const songListEl = document.getElementById('songList');
const searchInput = document.getElementById('searchInput');
const audio = document.getElementById('audioPlayer');
const nowPlaying = document.getElementById('nowPlaying');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const loopBtn = document.getElementById('loopBtn');
const seekBar = document.getElementById('seekBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');

let songs = [];
let currentIndex = -1;
let isShuffle = false;
let isLoop = false;

// 1. IndexedDB Setup (Songs ko offline save rakhne ke liye)
const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open('OfflineMusicDB', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'name' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function saveSongsToDB(fileArray) {
  const db = await dbPromise;
  const tx = db.transaction('songs', 'readwrite');
  const store = tx.objectStore('songs');
  store.clear();
  fileArray.forEach(file => store.put({ name: file.name, blob: file }));
}

async function loadSongsFromDB() {
  const db = await dbPromise;
  const tx = db.transaction('songs', 'readonly');
  const store = tx.objectStore('songs');
  const req = store.getAll();
  req.onsuccess = () => {
    if (req.result.length > 0) {
      songs = req.result.map(item => ({
        name: item.name.replace(/\.[^/.]+$/, ''),
        url: URL.createObjectURL(item.blob)
      }));
      renderList(songs);
    }
  };
}

// 2. Folder/Files Selection
fileInput.addEventListener('change', async (e) => {
  const audioFiles = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
  if (!audioFiles.length) return;
  await saveSongsToDB(audioFiles);
  songs = audioFiles.map(file => ({
    name: file.name.replace(/\.[^/.]+$/, ''),
    url: URL.createObjectURL(file)
  }));
  renderList(songs);
});

// 3. Render & Search
function renderList(list) {
  songListEl.innerHTML = '';
  list.forEach((song) => {
    const originalIndex = songs.indexOf(song);
    const li = document.createElement('li');
    li.textContent = song.name;
    if (originalIndex === currentIndex) li.classList.add('active');
    li.onclick = () => playSong(originalIndex);
    songListEl.appendChild(li);
  });
}

searchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderList(songs.filter(s => s.name.toLowerCase().includes(q)));
});

// 4. Playback & Media Session (Lock-screen Controls)
function playSong(index) {
  if (index < 0 || index >= songs.length) return;
  currentIndex = index;
  audio.src = songs[index].url;
  audio.play();
  nowPlaying.textContent = songs[index].name;
  playPauseBtn.textContent = '⏸️';
  renderList(songs);
  updateMediaSession(songs[index].name);
}

function updateMediaSession(title) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: 'Offline Library'
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); playPauseBtn.textContent = '⏸️'; });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); playPauseBtn.textContent = '▶️'; });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }
}

playPauseBtn.onclick = () => {
  if (!audio.src && songs.length) return playSong(0);
  if (audio.paused) { audio.play(); playPauseBtn.textContent = '⏸️'; }
  else { audio.pause(); playPauseBtn.textContent = '▶️'; }
};

function playNext() {
  if (!songs.length) return;
  const next = isShuffle ? Math.floor(Math.random() * songs.length) : (currentIndex + 1) % songs.length;
  playSong(next);
}

function playPrev() {
  if (!songs.length) return;
  const prev = (currentIndex - 1 + songs.length) % songs.length;
  playSong(prev);
}

nextBtn.onclick = playNext;
prevBtn.onclick = playPrev;
shuffleBtn.onclick = () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('active-mode', isShuffle); };
loopBtn.onclick = () => { isLoop = !isLoop; audio.loop = isLoop; loopBtn.classList.toggle('active-mode', isLoop); };
audio.onended = () => { if (!isLoop) playNext(); };

// 5. Seek Bar & Timer
const formatTime = (s) => isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

audio.ontimeupdate = () => {
  seekBar.value = (audio.currentTime / audio.duration) * 100 || 0;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  durationEl.textContent = formatTime(audio.duration);
};

seekBar.oninput = () => { audio.currentTime = (seekBar.value / 100) * audio.duration; };

// Register Service Worker & Load Saved Songs
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
loadSongsFromDB();