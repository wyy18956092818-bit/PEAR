const canvas = document.querySelector('#stars');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('#stage');
const story = document.querySelector('#story');
const storyLine = document.querySelector('#storyLine');
const previousLine = document.querySelector('#previousLine');
const progress = document.querySelector('.progress-area');
const progressFill = document.querySelector('#progressFill');
const progressLabel = document.querySelector('#progressLabel');
const bgm = document.querySelector('#bgm');
const soundToggle = document.querySelector('#soundToggle');
const continueHint = document.querySelector('#continueHint');
const reviewButton = document.querySelector('#reviewButton');
const reviewTaunt = document.querySelector('#reviewTaunt');
const reviewPanel = document.querySelector('#reviewPanel');
const reviewBackdrop = document.querySelector('#reviewBackdrop');
const closeReviewButton = document.querySelector('#closeReview');
const reviewList = document.querySelector('#reviewList');
const whisperLayer = document.querySelector('#whisperLayer');
const secretCode = document.querySelector('#secretCode');

let lines = [];
let index = -1;
let started = false;
let locked = false;
let stars = [];
let shootingStar = null;
let afterIndex = -1;
let revealIndex = 0;
let finished = false;
let whispersActive = false;
let whisperIndex = 0;
let pendingFirstClick = false;
let musicRequested = false;
let mutedByUser = false;
let fadePauseTimer;
let reviewTauntTimer;
let codeBuffer = '';
let audioContext;
let audioFilter;
let audioGain;
const history = [];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finalCredit = { text: 'BGM：まらしぃ - ハルトマンの睡眠少女', emphasis: true };
const postEndingLines = [
  { text: '……你怎么还不走？' },
  { text: '后面真的没有了哦。' },
  { text: '再点也不会有新的东西啦。' },
  { text: '好吧，那就再陪你待一会儿。' },
  { text: '真的、真的结束了。' }
];
const hiddenEndingLines = [
  { text: '.....' },
  { text: '.....' },
  { text: '.....' },
  { text: '她没有骗你。' },
  { text: '她真的等了你很久。' },
  { text: '只是她忘了，心里还藏着一个人。' },
  { text: '.....' },
  { text: '.....' },
  { text: '其实那个才是我哦。' },
  { text: '......' },
  { text: '......' },
  { text: '我说......' },
  { text: '这次该换你来藏了。', red: true }
];
const whispers = [
  '你哪里也去不了。',
  '逃不掉了吧？',
  '我看见你了。',
  '藏好了吗？',
  '别躲在这里。'
];

function cleanMarkdown(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => ({
    text: line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, ''),
    emphasis: /^\*\*.*\*\*$/.test(line)
  }));
}

async function loadStory() {
  try {
    const response = await fetch('./story.md');
    if (!response.ok) throw new Error('Story unavailable');
    lines = cleanMarkdown(await response.text());
    progressLabel.textContent = `00 / ${String(lines.length).padStart(2, '0')}`;
  } catch {
    lines = [{ text: '故事好像藏得太好了。请刷新页面，再找一次吧。', emphasis: false }];
  }
  if (pendingFirstClick) {
    pendingFirstClick = false;
    showNext();
  }
}

function startMusic() {
  musicRequested = true;
  mutedByUser = false;
  bgm.volume = 0.62;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioContext) {
      audioContext = new AudioContextClass();
      const source = audioContext.createMediaElementSource(bgm);
      audioFilter = audioContext.createBiquadFilter();
      audioFilter.type = 'lowpass';
      audioFilter.frequency.value = 18000;
      audioGain = audioContext.createGain();
      source.connect(audioFilter).connect(audioGain).connect(audioContext.destination);
    }
    audioContext?.resume().catch(() => {});
  } catch {
    // Playback rate and volume still darken the track if Web Audio is unavailable.
  }
  tryPlayMusic();
}

function tryPlayMusic() {
  if (!musicRequested || mutedByUser || finished) return;
  audioContext?.resume().catch(() => {});
  bgm.play().catch(() => {
    soundToggle.setAttribute('aria-pressed', 'true');
    soundToggle.setAttribute('aria-label', '重试播放音乐');
  });
}

function darkenMusic(step) {
  const depth = Math.min(step / (hiddenEndingLines.length - 1), 1);
  bgm.preservesPitch = false;
  bgm.mozPreservesPitch = false;
  bgm.webkitPreservesPitch = false;
  bgm.playbackRate = 0.94 - depth * 0.23;
  bgm.volume = 0.56 - depth * 0.17;
  if (audioFilter && audioContext) {
    const frequency = 8000 * Math.pow(420 / 8000, depth);
    audioFilter.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.5);
  }
}

function finishStory() {
  finished = true;
  document.body.classList.add('blackout');
  stage.setAttribute('aria-label', '故事结束');
  storyLine.textContent = '';
  previousLine.textContent = '';
  continueHint.textContent = '';
  progress.classList.remove('visible');
  if (audioGain && audioContext) {
    audioGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.35);
  } else {
    bgm.volume = 0;
  }
  fadePauseTimer = window.setTimeout(() => bgm.pause(), 1800);
}

function showWhisper() {
  if (reviewPanel.classList.contains('open')) return;
  if (!whispersActive) {
    whispersActive = true;
    document.body.classList.add('whispers-active');
    stage.setAttribute('aria-label', '黑暗中仍有声音');
    secretCode.disabled = false;
    secretCode.focus({ preventScroll: true });
  }
  const whisper = document.createElement('span');
  whisper.className = 'whisper';
  whisper.textContent = whispers[whisperIndex % whispers.length];
  whisperIndex += 1;
  whisper.style.left = `${12 + Math.random() * 72}%`;
  whisper.style.top = `${18 + Math.random() * 60}%`;
  whisperLayer.append(whisper);
  if (whisperLayer.children.length > 8) whisperLayer.firstElementChild.remove();
  window.setTimeout(() => whisper.remove(), 7000);
}

function resetStory() {
  window.clearTimeout(fadePauseTimer);
  window.clearTimeout(reviewTauntTimer);
  reviewTaunt.classList.remove('visible');
  bgm.pause();
  try { bgm.currentTime = 0; } catch {}
  bgm.playbackRate = 1;
  bgm.preservesPitch = true;
  bgm.mozPreservesPitch = true;
  bgm.webkitPreservesPitch = true;
  bgm.volume = 0.62;
  if (audioContext && audioFilter && audioGain) {
    audioFilter.frequency.cancelScheduledValues(audioContext.currentTime);
    audioFilter.frequency.setValueAtTime(18000, audioContext.currentTime);
    audioGain.gain.cancelScheduledValues(audioContext.currentTime);
    audioGain.gain.setValueAtTime(1, audioContext.currentTime);
  }
  index = -1;
  afterIndex = -1;
  revealIndex = 0;
  finished = false;
  whispersActive = false;
  whisperIndex = 0;
  pendingFirstClick = false;
  musicRequested = false;
  mutedByUser = false;
  codeBuffer = '';
  started = false;
  locked = false;
  history.length = 0;
  reviewList.replaceChildren();
  whisperLayer.replaceChildren();
  secretCode.value = '';
  secretCode.blur();
  secretCode.disabled = true;
  document.body.classList.remove('started', 'reveal', 'blackout', 'whispers-active');
  story.classList.remove('active');
  storyLine.classList.remove('red', 'emphasis', 'entering');
  storyLine.textContent = '';
  previousLine.textContent = '';
  previousLine.classList.remove('visible');
  continueHint.textContent = '点击屏幕';
  progress.classList.remove('visible');
  progressFill.style.width = '0%';
  progressLabel.textContent = `00 / ${String(lines.length).padStart(2, '0')}`;
  soundToggle.setAttribute('aria-pressed', 'false');
  soundToggle.setAttribute('aria-label', '关闭音乐');
  stage.setAttribute('aria-label', '点击显示下一句话');
  stage.focus();
}

function enterCode(digit) {
  if (!whispersActive) return;
  codeBuffer = (codeBuffer + digit).slice(-3);
  if (codeBuffer === '514') resetStory();
}

function showNext() {
  if (reviewPanel.classList.contains('open')) return;
  if (finished) {
    showWhisper();
    return;
  }
  if (locked) return;
  if (!started) {
    started = true;
    document.body.classList.add('started');
    story.classList.add('active');
    startMusic();
  } else if (bgm.paused && musicRequested && !mutedByUser) {
    tryPlayMusic();
  }
  if (!lines.length) {
    pendingFirstClick = true;
    return;
  }
  progress.classList.add('visible');
  locked = true;
  const oldText = storyLine.textContent;
  let current;
  if (index < lines.length - 1) {
    index += 1;
    current = lines[index];
  } else {
    if (afterIndex < 0) {
      current = finalCredit;
      afterIndex = 0;
    } else if (afterIndex < postEndingLines.length) {
      current = postEndingLines[afterIndex];
      afterIndex += 1;
    } else if (revealIndex < hiddenEndingLines.length) {
      current = hiddenEndingLines[revealIndex];
      if (revealIndex === 0) document.body.classList.add('reveal');
      darkenMusic(revealIndex);
      revealIndex += 1;
    } else {
      finishStory();
      return;
    }
  }
  previousLine.textContent = oldText;
  previousLine.classList.toggle('visible', Boolean(oldText));
  storyLine.classList.remove('entering');
  void storyLine.offsetWidth;
  storyLine.textContent = current.text;
  storyLine.classList.toggle('emphasis', current.emphasis);
  storyLine.classList.toggle('red', Boolean(current.red));
  storyLine.classList.add('entering');
  history.push(current.text);
  appendReviewEntry(current.text);
  continueHint.textContent = index >= lines.length - 1 ? '再点一下' : '点击 · 继续';
  progressFill.style.width = `${((index + 1) / lines.length) * 100}%`;
  progressLabel.textContent = index >= lines.length - 1 ? 'END' : `${String(index + 1).padStart(2, '0')} / ${String(lines.length).padStart(2, '0')}`;
  window.setTimeout(() => { locked = false; }, reducedMotion ? 20 : 420);
}

function appendReviewEntry(text) {
  const empty = reviewList.querySelector('.review-empty');
  if (empty) empty.remove();
  const entry = document.createElement('p');
  entry.className = 'review-entry';
  entry.textContent = text;
  reviewList.append(entry);
  reviewList.scrollTop = reviewList.scrollHeight;
}

function openReview() {
  if (finished) {
    window.clearTimeout(reviewTauntTimer);
    reviewTaunt.classList.remove('visible');
    void reviewTaunt.offsetWidth;
    reviewTaunt.classList.add('visible');
    reviewTauntTimer = window.setTimeout(() => reviewTaunt.classList.remove('visible'), 3000);
    return;
  }
  if (!history.length) reviewList.innerHTML = '<p class="review-empty">还没有可以回顾的内容。</p>';
  reviewBackdrop.hidden = false;
  reviewPanel.classList.add('open');
  reviewPanel.setAttribute('aria-hidden', 'false');
  closeReviewButton.focus();
}

function closeReview() {
  reviewPanel.classList.remove('open');
  reviewPanel.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { reviewBackdrop.hidden = true; }, reducedMotion ? 0 : 450);
  stage.focus();
}

stage.addEventListener('click', showNext);
stage.addEventListener('keydown', event => {
  if (['Enter', ' ', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    showNext();
  }
});
soundToggle.addEventListener('click', event => {
  event.stopPropagation();
  if (bgm.paused) {
    musicRequested = true;
    mutedByUser = false;
    tryPlayMusic();
  } else {
    mutedByUser = true;
    bgm.pause();
  }
});
bgm.addEventListener('play', () => {
  soundToggle.setAttribute('aria-pressed', 'false');
  soundToggle.setAttribute('aria-label', '关闭音乐');
});
bgm.addEventListener('pause', () => {
  soundToggle.setAttribute('aria-pressed', 'true');
  soundToggle.setAttribute('aria-label', '播放音乐');
});
bgm.addEventListener('canplay', () => {
  if (musicRequested && !mutedByUser && bgm.paused) tryPlayMusic();
});
reviewButton.addEventListener('click', openReview);
closeReviewButton.addEventListener('click', closeReview);
reviewBackdrop.addEventListener('click', closeReview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reviewPanel.classList.contains('open')) closeReview();
  if (!whispersActive || reviewPanel.classList.contains('open') || event.target === secretCode) return;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[0-9]$/.test(event.key)) {
    enterCode(event.key);
  }
});
secretCode.addEventListener('input', () => {
  if (!whispersActive) {
    secretCode.value = '';
    return;
  }
  const value = secretCode.value.replace(/\D/g, '');
  if (value === '514') {
    resetStory();
  } else {
    secretCode.value = value.length >= 3 ? '' : value;
  }
});

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Math.round(Math.min(190, Math.max(80, innerWidth * innerHeight / 9000)));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.15 + .18, a: Math.random() * .68 + .16,
    d: Math.random() * .012 + .003, phase: Math.random() * Math.PI * 2
  }));
}

function drawStars(time = 0) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const star of stars) {
    const alpha = reducedMotion ? star.a : star.a * (.7 + Math.sin(time * star.d + star.phase) * .3);
    ctx.beginPath();
    ctx.fillStyle = `rgba(238,228,255,${alpha})`;
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!reducedMotion) {
    if (!shootingStar && Math.random() < .0022) shootingStar = { x: Math.random() * innerWidth * .75, y: Math.random() * innerHeight * .34, life: 0 };
    if (shootingStar) {
      const s = shootingStar;
      const gradient = ctx.createLinearGradient(s.x, s.y, s.x - 100, s.y - 48);
      gradient.addColorStop(0, `rgba(255,220,246,${1 - s.life / 55})`);
      gradient.addColorStop(1, 'rgba(255,130,200,0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - 100, s.y - 48);
      ctx.stroke();
      s.x += 6; s.y += 2.9; s.life += 1;
      if (s.life > 55) shootingStar = null;
    }
  }
  requestAnimationFrame(drawStars);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
drawStars();
loadStory();

