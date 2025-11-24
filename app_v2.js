
// Ukulele Pocket Trainer — Full (fixed keys)
// Loads songs.json and chords.json (fixed keys). Provides search, play, and PWA install prompt.

let audioCtx = null;
let isPlaying = false;
let metOn = false;
let tempo = 90;
let currentPattern = 'travis';
let currentSong = null;
let deferredPrompt = null;

function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }

// Simple Karplus-Strong pluck using AudioBufferSource with noise burst and lowpass feedback (approximation)
function pluckString(frequency, when, duration=1.5){
  ensureAudio();
  const sr = audioCtx.sampleRate;
  const length = Math.floor(sr * duration);
  const buffer = audioCtx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  // fill with noise decaying
  for(let i=0;i<length;i++){
    data[i] = (Math.random()*2-1) * Math.exp(-3*i/length);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(1.0, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.playbackRate.value = frequency/220.0; // base mapping to A3=220 for tone variance
  src.connect(lp); lp.connect(gain); gain.connect(audioCtx.destination);
  src.start(when);
  src.stop(when + duration + 0.1);
}

// utility: frequency for note name approximate (limited mapping)
const noteFreq = { 'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'B4':493.88,
  'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'G3':196.00,'A3':220.00,'B3':246.94 };

function chordToFrequencies(chordName){
  // basic mapping for common chords (root, third, fifth) in ukulele range
  const map = { 'C':[noteFreq.C4,noteFreq.E4,noteFreq.G4], 'G':[noteFreq.G3,noteFreq.B3,noteFreq.D4],
    'Am':[noteFreq.A3,noteFreq.C4,noteFreq.E4], 'F':[noteFreq.F3,noteFreq.A3,noteFreq.C4],
    'D':[noteFreq.D4,noteFreq.Fs4||noteFreq.F4,noteFreq.A4], 'Em':[noteFreq.E3,noteFreq.G3,noteFreq.B3],
    'A':[noteFreq.A3,noteFreq.Cs4||noteFreq.C4,noteFreq.E4], 'Dm':[noteFreq.D4,noteFreq.F4,noteFreq.A4] };
  return map[chordName] || [noteFreq.C4,noteFreq.E4,noteFreq.G4];
}

// play a chord as quick arpeggio using pluckString
function playChord(chordName, when){
  const freqs = chordToFrequencies(chordName);
  pluckString(freqs[0], when, 1.2);
  pluckString(freqs[1], when + 0.06, 1.0);
  pluckString(freqs[2], when + 0.12, 0.9);
}

// metronome click
function metClick(time){
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = 1200;
  g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(0.6, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  o.connect(g); g.connect(audioCtx.destination); o.start(time); o.stop(time + 0.06);
}

// scheduling simple loop using current song progression
let schedTimer = null;
function startLoop(){
  if(!currentSong) return alert('Load a song first');
  ensureAudio();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  isPlaying = true;
  const beatsPerBar = 4;
  const secondsPerBeat = 60/tempo;
  let chordIndex = 0;
  let nextTime = audioCtx.currentTime + 0.05;
  function loop(){
    if(!isPlaying){ clearInterval(schedTimer); return; }
    // play chord on beat 1
    const chord = currentSong.chords[chordIndex % currentSong.chords.length] || 'C';
    playChord(chord, nextTime);
    if(metOn) metClick(nextTime);
    // schedule fingerpicking pattern small notes depending on pattern
    if(currentPattern === 'travis'){
      pluckString(chordToFrequencies(chord)[0], nextTime + secondsPerBeat*0.5, 0.7);
    } else if(currentPattern === 'rolling'){
      pluckString(chordToFrequencies(chord)[1], nextTime + secondsPerBeat*0.33, 0.9);
      pluckString(chordToFrequencies(chord)[2], nextTime + secondsPerBeat*0.66, 0.9);
    } else if(currentPattern === 'syncop'){
      pluckString(chordToFrequencies(chord)[2], nextTime + secondsPerBeat*0.25, 0.6);
    } else {
      pluckString(chordToFrequencies(chord)[1], nextTime + secondsPerBeat*0.2, 0.6);
      pluckString(chordToFrequencies(chord)[2], nextTime + secondsPerBeat*0.4, 0.6);
    }
    nextTime += secondsPerBeat * beatsPerBar; // advance one bar
    chordIndex++;
  }
  // run loop every bar
  loop();
  schedTimer = setInterval(loop, (60/tempo) * 1000 * beatsPerBar);
}

function stopLoop(){
  isPlaying = false;
  if(schedTimer) clearInterval(schedTimer);
}

// UI wiring
document.addEventListener('DOMContentLoaded', async ()=>{
  const songListEl = document.getElementById('songList');
  const searchInput = document.getElementById('searchInput');
  const playBtn = document.getElementById('playBtn');
  const metBtn = document.getElementById('metBtn');
  const tempoSlider = document.getElementById('tempo');
  const tempoDisplay = document.getElementById('tempoDisplay');
  const patternSelect = document.getElementById('patternSelect');
  const chordDisplay = document.getElementById('chordDisplay');
  const songTitle = document.getElementById('songTitle');
  const installBtn = document.getElementById('installBtn');

  // load songs and chords
  const songs = await fetch('songs.json').then(r=>r.json()).catch(()=>[]);
  const chords = await fetch('chords.json').then(r=>r.json()).catch(()=>({}));

  // prepare song objects with simple chord progressions by using the song key as single-chord progression placeholder
  const songObjs = songs.map(s=>({ title:s.title, key:s.key, chords:[s.key] }));

  function renderList(filter=''){
    songListEl.innerHTML='';
    const filtered = songObjs.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach(s=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${s.title} <small style="color:#667085">[${s.key}]</small></span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Load';
      btn.addEventListener('click', ()=>{ loadSong(s); });
      li.appendChild(btn);
      songListEl.appendChild(li);
    });
  }

  function loadSong(s){
    currentSong = s;
    songTitle.textContent = s.title + ' — key ' + (s.key||'C');
    // display chords (if voicings available, show common ones)
    chordDisplay.innerHTML = '';
    const prog = s.chords || [s.key||'C'];
    prog.forEach(ch=>{
      const box = document.createElement('div');
      box.className = 'chordBox';
      box.textContent = ch;
      box.addEventListener('click', ()=>{ ensureAudio(); playChord(ch, audioCtx.currentTime + 0.02); });
      chordDisplay.appendChild(box);
    });
  }

  renderList();

  searchInput.addEventListener('input', (e)=> renderList(e.target.value));

  playBtn.addEventListener('click', ()=>{
    if(!isPlaying){ startLoop(); playBtn.textContent = 'Stop'; }
    else { stopLoop(); playBtn.textContent = 'Play'; }
  });
  metBtn.addEventListener('click', ()=>{ metOn = !metOn; metBtn.textContent = 'Metronome: ' + (metOn? 'On':'Off'); });
  tempoSlider.addEventListener('input', ()=>{ tempo = parseInt(tempoSlider.value); tempoDisplay.textContent = tempo; });
  patternSelect.addEventListener('input', ()=>{ currentPattern = patternSelect.value; });

  // PWA install prompt handling
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
  });
  installBtn.addEventListener('click', async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    installBtn.style.display = 'none';
    deferredPrompt = null;
  });

  // auto-load first song if available
  if(songObjs.length>0) loadSong(songObjs[0]);
});
